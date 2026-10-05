(function (SINFORGE) {
  'use strict';
  // ---- Document renderer. SINFORGE.render(ctx, k, opts) draws the active blank
  // at scale k (1 = the blank's native size) — the single pipeline shared by the
  // stage preview and every export, so the PNG always matches the preview.
  // Blanks (js/blanks.js) describe geometry in their own native pixel space and
  // compose their look from the SINFORGE.gfx primitives below; render() adds the
  // card-wide passes (glow, clip, grain, scanlines) around the blank's draw(). ----
  const S = SINFORGE.state;
  const FONT = SINFORGE.const.FONT;

  // ---- helpers ----
  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // Small deterministic PRNG (mulberry32) — grain and barcodes stay stable between renders.
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }

  // ---- gfx: drawing primitives the blanks compose. Coordinates are in the
  // blank's native space; render() has already scaled the context by k. ----
  const gfx = {};

  // Trace a closed polygon ([[x, y], ...]) as the current path.
  gfx.poly = function poly(ctx, pts) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };

  // Offset a simple polygon inward by d (positive = inward for a clockwise
  // polygon in screen space): shift each edge along its normal, then intersect
  // neighbouring edges. Fine for the chamfered card shapes the blanks use.
  gfx.inset = function inset(pts, d) {
    const n = pts.length, lines = [];
    for (let i = 0; i < n; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      const len = Math.hypot(x2 - x1, y2 - y1) || 1;
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len; // inward normal (clockwise, y down)
      lines.push([x1 + nx * d, y1 + ny * d, x2 + nx * d, y2 + ny * d]);
    }
    return lines.map((b, i) => {
      const a = lines[(i + n - 1) % n];
      const d1x = a[2] - a[0], d1y = a[3] - a[1], d2x = b[2] - b[0], d2y = b[3] - b[1];
      const den = d1x * d2y - d1y * d2x;
      if (Math.abs(den) < 1e-9) return [b[0], b[1]];
      const t = ((b[0] - a[0]) * d2y - (b[1] - a[1]) * d2x) / den;
      return [a[0] + d1x * t, a[1] + d1y * t];
    });
  };

  // Set a Quantico font, shrinking from `size` until `text` fits `maxW`.
  // Returns the size used.
  gfx.fitFont = function fitFont(ctx, text, weight, size, maxW, spacing) {
    let s = size;
    for (; s > 8; s -= 2) {
      ctx.font = `${weight} ${s}px ${FONT}`;
      setSpacing(ctx, spacing ? spacing * s : 0);
      if (ctx.measureText(text).width <= maxW) break;
    }
    return s;
  };

  // Height of `text`'s glyphs above the baseline at a given weight / size.
  gfx.ascent = function ascent(ctx, text, weight, size) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    return ctx.measureText(text).actualBoundingBoxAscent;
  };

  // Draw `text` with its left edge at x on baseline y, shrunk to fit maxW.
  // Returns the drawn width.
  gfx.text = function text(ctx, str, x, y, o) {
    if (!str) return 0;
    gfx.fitFont(ctx, str, o.weight || 700, o.size, o.maxW || 1e9, o.spacing || 0);
    ctx.fillStyle = o.color;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText(str, x, y);
    const w = ctx.measureText(str).width;
    setSpacing(ctx, 0);
    return w;
  };

  // A parallelogram leaning right: bottom edge from x to x + w at yb, top
  // edge shifted by `lean` at yt.
  gfx.slant = function slant(ctx, x, yt, yb, w, lean) {
    ctx.beginPath();
    ctx.moveTo(x, yb); ctx.lineTo(x + w, yb);
    ctx.lineTo(x + w + lean, yt); ctx.lineTo(x + lean, yt);
    ctx.closePath();
    ctx.fill();
  };

  // A vertical column of short diagonal hazard dashes between y0 and y1.
  gfx.stripes = function stripes(ctx, x0, x1, y0, y1, color, flip) {
    const t = 10, rise = 12, step = 24;
    ctx.fillStyle = color;
    for (let y = y0; y + rise + t <= y1; y += step) {
      const a = flip ? x1 : x0, b = flip ? x0 : x1;
      ctx.beginPath();
      ctx.moveTo(a, y + rise); ctx.lineTo(b, y);
      ctx.lineTo(b, y + t); ctx.lineTo(a, y + rise + t);
      ctx.closePath();
      ctx.fill();
    }
  };

  gfx.rng = rng;
  gfx.hash = hash;

  // The selected barcode (js/codes.js) in the slot `box`, encoding `seed`.
  // 2D codes take a square at the slot's right edge. Edges snap to device
  // pixels, so bars stay crisp and adjacent modules never show seams. The
  // box drawn is kept in gfx.codeBox (native px) for the stage's click target.
  gfx.code = function code(ctx, k, box, seed, st) {
    const def = SINFORGE.code(st);
    if (def.square) {
      const s = Math.min(box.w, box.h);
      box = { x: box.x + box.w - s, y: box.y + (box.h - s) / 2, w: s, h: s };
    }
    gfx.codeBox = box;
    const snap = (v) => Math.round(v * k) / k;
    def.shapes(box, seed).forEach((sh) => {
      ctx.fillStyle = sh.accent ? st.accent : st.ink;
      if (sh.r) {
        const [x, y, w, h] = sh.r, x0 = snap(x), y0 = snap(y);
        ctx.fillRect(x0, y0, Math.max(snap(x + w) - x0, 1 / k), snap(y + h) - y0);
      } else if (sh.c) {
        ctx.beginPath();
        ctx.arc(sh.c[0], sh.c[1], sh.c[2], 0, Math.PI * 2);
        ctx.fill();
      } else if (sh.t) {
        // centred on x: measure at the fitted size, then draw from the left edge
        gfx.fitFont(ctx, sh.t, 400, sh.size, sh.w, 0.1);
        const w = ctx.measureText(sh.t).width;
        gfx.text(ctx, sh.t, sh.x - w / 2, sh.y, { size: sh.size, maxW: sh.w, color: ctx.fillStyle, weight: 400, spacing: 0.1 });
      }
    });
  };

  // ---- photo: the source picture framed into a box, then the photo effect.
  // Mono / halftone / dither turn it into pure ink on transparent, so the card
  // colour shows through the light parts. Cached by its inputs: the processing
  // is the expensive step and most edits (text, decor) don't touch it. ----
  let photoCache = { key: '', canvas: null };

  function framedPhoto(src, w, h, tf) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    const base = Math.max(w / src.width, h / src.height) * tf.zoom;
    const dw = src.width * base, dh = src.height * base;
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, (w - dw) / 2 + tf.x * w, (h - dh) / 2 + tf.y * h, dw, dh);
    return c;
  }

  const lum = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

  // Luminance with the LEVEL bias (50 = neutral; higher = lighter), plus alpha.
  // Ink always paints the photo's dark parts — unless the ink is lighter than
  // the card (dark schemes), where that would print a negative: then the tones
  // flip so ink paints the light parts and the picture still reads positive.
  function lumaOf(d, st) {
    const bias = (st.photoLevel - 50) * 3;
    const flip = lum(rgb(st.ink)) > lum(rgb(st.card));
    const n = d.length / 4, L = new Float32Array(n), A = new Uint8ClampedArray(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const v = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
      L[i] = (flip ? 255 - v : v) + bias;
      A[i] = d[p + 3];
    }
    return { L, A };
  }

  function binaryOut(w, h, on, inkHex) {
    const out = new ImageData(w, h), o = out.data, [r, g, b] = rgb(inkHex);
    for (let i = 0, p = 0; i < on.length; i++, p += 4) {
      if (!on[i]) continue;
      o[p] = r; o[p + 1] = g; o[p + 2] = b; o[p + 3] = 255;
    }
    return out;
  }

  function photoFx(c, st, k) {
    const w = c.width, h = c.height, x = c.getContext('2d');
    let img;
    try { img = x.getImageData(0, 0, w, h); } catch (e) { return c; } // tainted (file://): show it untouched
    const { L, A } = lumaOf(img.data, st);

    if (st.photoFx === 'mono') {
      // Threshold at 128, clamped to the photo's 2nd–98th luminance percentile
      // so extreme LEVELs keep the darkest/lightest detail instead of printing
      // an empty or solid window.
      // (L spans -150..405 once the LEVEL bias is in, so bin with an offset.)
      const OFF = 150, BINS = 256 + 2 * OFF, hist = new Uint32Array(BINS);
      let total = 0;
      for (let i = 0; i < L.length; i++) {
        if (A[i] > 127) { hist[Math.min(BINS - 1, Math.max(0, Math.floor(L[i]) + OFF))]++; total++; }
      }
      const pct = (q) => {
        let acc = 0;
        for (let v = 0; v < BINS; v++) { acc += hist[v]; if (acc >= total * q) return v - OFF; }
        return BINS - 1 - OFF;
      };
      const t = Math.min(Math.max(128, pct(0.02) + 1), pct(0.98));
      const on = new Uint8Array(L.length);
      for (let i = 0; i < L.length; i++) on[i] = A[i] > 127 && L[i] < t ? 1 : 0;
      x.putImageData(binaryOut(w, h, on, st.ink), 0, 0);
      return c;
    }

    if (st.photoFx === 'dither') {
      // Floyd–Steinberg error diffusion on the biased luminance.
      const on = new Uint8Array(L.length);
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const i = yy * w + xx, v = L[i], q = v < 128 ? 0 : 255, e = v - q;
          on[i] = A[i] > 127 && q === 0 ? 1 : 0;
          if (xx + 1 < w) L[i + 1] += e * 7 / 16;
          if (yy + 1 < h) {
            if (xx > 0) L[i + w - 1] += e * 3 / 16;
            L[i + w] += e * 5 / 16;
            if (xx + 1 < w) L[i + w + 1] += e / 16;
          }
        }
      }
      x.putImageData(binaryOut(w, h, on, st.ink), 0, 0);
      return c;
    }

    // halftone: one ink dot per cell (rows offset by half a cell), area
    // proportional to the cell's darkness.
    const cell = Math.max(3, st.photoDot * k);
    x.clearRect(0, 0, w, h);
    x.fillStyle = st.ink;
    const rows = Math.ceil(h / cell) + 1;
    for (let row = 0; row < rows; row++) {
      const cy = row * cell, off = row % 2 ? cell / 2 : 0;
      for (let cx = off; cx < w + cell; cx += cell) {
        let sum = 0, alpha = 0, cnt = 0;
        const x0 = Math.max(0, Math.floor(cx - cell / 2)), x1 = Math.min(w, Math.ceil(cx + cell / 2));
        const y0 = Math.max(0, Math.floor(cy - cell / 2)), y1 = Math.min(h, Math.ceil(cy + cell / 2));
        for (let yy = y0; yy < y1; yy += 2) {
          for (let xx = x0; xx < x1; xx += 2) {
            const i = yy * w + xx;
            sum += L[i]; alpha += A[i]; cnt++;
          }
        }
        if (!cnt || alpha / cnt < 128) continue;
        const dark = 1 - Math.min(255, Math.max(0, sum / cnt)) / 255;
        const r = (cell / 2) * Math.sqrt(dark) * 1.25;
        if (r < 0.6) continue;
        x.beginPath();
        x.arc(cx, cy, r, 0, Math.PI * 2);
        x.fill();
      }
    }
    return c;
  }

  // The processed photo for a box (native units) at scale k.
  gfx.photo = function photo(box, k) {
    const src = S.photo;
    if (!src) return null;
    const st = S.style, tf = S.tf;
    const w = Math.round(box.w * k), h = Math.round(box.h * k);
    const key = [src.__id, w, h, tf.x, tf.y, tf.zoom, st.photoFx, st.photoLevel, st.photoDot, st.ink, st.card].join('|');
    if (photoCache.key === key) return photoCache.canvas;
    let c = framedPhoto(src, w, h, tf);
    if (st.photoFx !== 'none') c = photoFx(c, st, k);
    photoCache = { key, canvas: c };
    return c;
  };

  // ---- card-wide passes ----
  let grainTile = null;
  function grainPattern(ctx, inkHex) {
    if (!grainTile || grainTile.ink !== inkHex) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      const x = c.getContext('2d'), img = x.createImageData(256, 256), d = img.data;
      const r = rng(1337), [cr, cg, cb] = rgb(inkHex);
      for (let p = 0; p < d.length; p += 4) {
        d[p] = cr; d[p + 1] = cg; d[p + 2] = cb;
        d[p + 3] = r() < 0.5 ? Math.floor(r() * 255) : 0;
      }
      x.putImageData(img, 0, 0);
      c.ink = inkHex;
      grainTile = c;
    }
    return ctx.createPattern(grainTile, 'repeat');
  }

  // ---- watermark: drawn right over the card fill, so every element of the
  // blank covers it; clipped out of the photo window so it only marks the
  // background. Text tiles diagonally across the card; an image tiles in a
  // staggered grid or sits centred, optionally recoloured in the tone (ink /
  // accent / custom colour). wmScale sizes and wmRot turns all of them
  // (around the card centre). ----
  // The watermark image as drawn: tinted to the tone (a silhouette — colours
  // are replaced, so INVERT doesn't apply), or inverted, or as uploaded.
  let wmSrcCache = { key: '', canvas: null };
  function wmSource(st, tone) {
    const src = S.wmImage;
    if (!st.wmTint && !st.wmInvert) return src;
    const key = [src.__id, st.wmTint ? 'tint' : 'inv', tone].join('|');
    if (wmSrcCache.key === key) return wmSrcCache.canvas;
    const c = document.createElement('canvas');
    c.width = src.width; c.height = src.height;
    const x = c.getContext('2d');
    x.drawImage(src, 0, 0);
    if (st.wmTint) {
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = tone;
      x.fillRect(0, 0, c.width, c.height);
    } else {
      try {
        const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
        for (let p = 0; p < d.length; p += 4) { d[p] = 255 - d[p]; d[p + 1] = 255 - d[p + 1]; d[p + 2] = 255 - d[p + 2]; }
        x.putImageData(img, 0, 0);
      } catch (e) { /* tainted (file://): leave it as is */ }
    }
    wmSrcCache = { key, canvas: c };
    return c;
  }

  function drawWatermark(ctx, B, st) {
    if (st.wm === 'off' || !st.wmAmt) return;
    if (st.wm === 'text' && !st.wmText.trim()) return;
    if (st.wm === 'image' && !S.wmImage) return;
    ctx.save();
    // card minus the photo window (even-odd: the window becomes a hole)
    ctx.beginPath();
    [B.outline, B.photo && B.photo.poly].forEach((pts) => {
      if (!pts) return;
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
    });
    ctx.clip('evenodd');
    ctx.globalAlpha = st.wmAmt / 100;
    const tone = st.wmTone === 'accent' ? st.accent : st.wmTone === 'custom' ? st.wmColor : st.ink;
    const sc = st.wmScale / 100;

    // everything below is drawn around the card centre, already rotated; the
    // tiled patterns cover the card's diagonal so no rotation leaves a gap
    const diag = Math.hypot(B.w, B.h);
    ctx.translate(B.w / 2, B.h / 2);
    ctx.rotate((st.wmRot * Math.PI) / 180);

    if (st.wm === 'text') {
      const text = st.wmText.trim();
      ctx.font = `700 ${46 * sc}px ${FONT}`;
      setSpacing(ctx, 6 * sc);
      ctx.fillStyle = tone;
      ctx.textBaseline = 'middle';
      const unit = ctx.measureText(text + '   ').width;
      for (let row = 0, y = -diag / 2; y < diag / 2; y += 110 * sc, row++) {
        const off = (row % 2) * unit / 2;
        for (let x = -diag / 2 - unit + off; x < diag / 2; x += unit) ctx.fillText(text, x, y);
      }
      setSpacing(ctx, 0);
    } else {
      const src = wmSource(st, tone);
      // SMART blend: multiply darkens into a light card, screen lightens into a
      // dark one — the mark reads on any card colour without a hard edge
      if (st.wmBlend === 'smart') ctx.globalCompositeOperation = lum(rgb(st.card)) >= 128 ? 'multiply' : 'screen';
      ctx.imageSmoothingQuality = 'high';
      if (st.wmTile) {
        const f = Math.min(170 / src.width, 170 / src.height) * sc;
        const w = src.width * f, h = src.height * f, step = 240 * sc;
        for (let row = 0, y = -diag / 2; y < diag / 2 + step; y += step * 0.75, row++) {
          for (let x = -diag / 2 - (row % 2 ? 0 : step / 2); x < diag / 2 + step; x += step) {
            ctx.drawImage(src, x - w / 2, y - h / 2, w, h);
          }
        }
      } else {
        const f = Math.min((B.w * 0.8) / src.width, (B.h * 0.6) / src.height) * sc;
        const w = src.width * f, h = src.height * f;
        ctx.drawImage(src, -w / 2, -h / 2, w, h);
      }
    }
    ctx.restore();
  }

  SINFORGE.render = function render(ctx, k, opts) {
    const B = SINFORGE.blanks[S.blank];
    const st = S.style;
    opts = opts || {};
    ctx.save();
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.scale(k, k);

    // glow halo: the card silhouette's shadow, drawn under the card itself
    if (st.glow) {
      ctx.save();
      ctx.shadowColor = st.accent;
      ctx.shadowBlur = (st.glowAmt / 100) * 60 * k;
      gfx.poly(ctx, B.outline);
      ctx.fillStyle = st.card;
      for (let i = 0; i < 2; i++) ctx.fill();
      ctx.restore();
    }

    // card body, then everything else clipped to it
    gfx.poly(ctx, B.outline);
    ctx.fillStyle = st.card;
    ctx.fill();
    ctx.save();
    gfx.poly(ctx, B.outline);
    ctx.clip();

    drawWatermark(ctx, B, st);
    gfx.codeBox = null; // set again by gfx.code if the blank draws a barcode
    B.draw(ctx, k, { gfx, S, st, doc: S.doc });

    if (st.grain) {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0); // grain at device pixels, not scaled
      ctx.globalAlpha = (st.grainAmt / 100) * 0.6;
      ctx.fillStyle = grainPattern(ctx, st.ink);
      ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.restore();
    }
    if (st.scan) {
      ctx.save();
      ctx.globalAlpha = (st.scanAmt / 100) * 0.5;
      ctx.fillStyle = st.ink;
      for (let y = 0; y < B.h; y += 6) ctx.fillRect(0, y, B.w, 2);
      ctx.restore();
    }
    ctx.restore(); // clip
    ctx.restore(); // scale
    if (opts.after) opts.after(ctx, k);
  };

  // A canvas holding the document at scale k.
  SINFORGE.renderCanvas = function renderCanvas(k) {
    const B = SINFORGE.blanks[S.blank];
    const c = document.createElement('canvas');
    c.width = Math.round(B.w * k);
    c.height = Math.round(B.h * k);
    SINFORGE.render(c.getContext('2d'), k);
    return c;
  };

  SINFORGE.gfx = gfx;
})(window.SINFORGE);
