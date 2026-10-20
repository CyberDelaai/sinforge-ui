(function (SINFORGE) {
  'use strict';
  // ---- Crop window (ported from COMMLINK's crop modal): a frame over the
  // picture, dragged to move, resized from its corner handle or the wheel.
  // Two modes:
  //  - square (license icons): guides inside the frame show where a standard
  //    icon sits — the dashed safe square (the extent the built-in icons
  //    fill), centre lines and a ghost of the icon being replaced; the
  //    picture is an icon mask (black + alpha), shown light on the dark stage;
  //  - free (logos, opts.free): any rectangle (Shift on the corner keeps its
  //    shape), the picture in its own colours over a checkerboard, centre
  //    lines only; FIT hugs the picture's content.
  // The frame may run past the picture — that part comes out transparent —
  // so a tight picture can be given room.
  //   SINFORGE.crop.open(src, opts) -> Promise<canvas | null>
  // opts: guide (SVG markup in a 0..100 square drawn under the guides), fit
  // (the safe square's share of the frame), out (the square result's edge in
  // px; a free result keeps the picture's resolution), free, rect (the frame
  // to start from, in source fractions { x, y, w, h } — a recrop), title /
  // hint / fitTitle (i18n keys). Resolves null on cancel; the result carries
  // .crop = the frame in source fractions.
  //   SINFORGE.crop.apply(src, rect) -> canvas: that frame of src at its
  // resolution (how a stored crop is replayed on the original). ----
  const $ = SINFORGE.$;
  const t = (k) => SINFORGE.t(k);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const MIN = 24; // smallest frame edge, stage px
  let cur = null; // { src, view, bbox, fit, out, free, rect, img, fr, resolve }

  // The picture as shown on the stage (an icon mask tinted light; a free-mode
  // picture as it is) and its content's bounding box in source px — FIT
  // frames that box. Content = alpha > 40; an opaque picture (a logo on a
  // solid background) = pixels away from its top-left corner's colour.
  function prepare(src, color) {
    const view = document.createElement('canvas');
    view.width = src.width; view.height = src.height;
    const x = view.getContext('2d');
    x.drawImage(src, 0, 0);
    const W = src.width, H = src.height, d = x.getImageData(0, 0, W, H).data;
    const opaque = color && d[3] === 255 && d[(W - 1) * 4 + 3] === 255 && d[(W * H - 1) * 4 + 3] === 255;
    const [r0, g0, b0] = d;
    const ink = opaque
      ? (i) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) > 48
      : (i) => d[i + 3] > 40;
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0, i = 0; y < H; y++) {
      for (let px = 0; px < W; px++, i += 4) {
        if (ink(i)) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    if (!color) {
      x.globalCompositeOperation = 'source-in';
      x.fillStyle = '#e8e8ee';
      x.fillRect(0, 0, W, H);
    }
    const bbox = x1 < 0 ? { x: 0, y: 0, w: W, h: H } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    return { view, bbox };
  }

  // fit the picture into the stage (80% of it, leaving room around it for
  // the frame) and draw it, its bounds as a thin dashed line (a free-mode
  // picture over a checkerboard, so dark and light logos both show)
  function layout() {
    const stage = $('cropStage').getBoundingClientRect(), cv = $('cropCanvas');
    const sw = stage.width, sh = stage.height, dpr = window.devicePixelRatio || 1;
    const f = Math.min(sw * 0.8 / cur.src.width, sh * 0.8 / cur.src.height);
    const w = cur.src.width * f, h = cur.src.height * f;
    cur.img = { x: (sw - w) / 2, y: (sh - h) / 2, w, h, f, sw, sh };
    cv.width = Math.round(sw * dpr); cv.height = Math.round(sh * dpr);
    cv.style.width = sw + 'px'; cv.style.height = sh + 'px';
    const x = cv.getContext('2d');
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    x.clearRect(0, 0, sw, sh);
    if (cur.free) {
      const q = 8;
      x.save();
      x.beginPath(); x.rect(cur.img.x, cur.img.y, w, h); x.clip();
      x.fillStyle = '#1c1c24'; x.fillRect(cur.img.x, cur.img.y, w, h);
      x.fillStyle = '#2c2c36';
      for (let yy = 0; yy * q < h; yy++) {
        for (let xx = yy % 2; xx * q < w; xx += 2) x.fillRect(cur.img.x + xx * q, cur.img.y + yy * q, q, q);
      }
      x.restore();
    }
    x.setLineDash([4, 4]);
    x.strokeStyle = 'rgba(122,122,136,0.6)';
    x.lineWidth = 1;
    x.strokeRect(cur.img.x - 0.5, cur.img.y - 0.5, w + 1, h + 1);
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur.view, cur.img.x, cur.img.y, w, h);
  }

  // place the frame (stage px), kept inside the stage; square unless free
  function place(x, y, w, h) {
    const { sw, sh } = cur.img;
    if (cur.free) { w = clamp(w, MIN, sw); h = clamp(h, MIN, sh); }
    else w = h = clamp(w, MIN, Math.min(sw, sh));
    cur.fr = { x: clamp(x, 0, sw - w), y: clamp(y, 0, sh - h), w, h };
    Object.assign($('cropFrame').style, { left: cur.fr.x + 'px', top: cur.fr.y + 'px', width: w + 'px', height: h + 'px' });
  }
  const placeAround = (cx, cy, w, h) => place(cx - w / 2, cy - h / 2, w, h);
  // FIT: the picture's content fills the safe square (free: the frame), centred
  function fitFrame() {
    const { img } = cur, b = cur.bbox, cx = img.x + (b.x + b.w / 2) * img.f, cy = img.y + (b.y + b.h / 2) * img.f;
    if (cur.free) placeAround(cx, cy, b.w * img.f, b.h * img.f);
    else { const s = Math.max(b.w, b.h) * img.f / cur.fit; placeAround(cx, cy, s, s); }
  }
  // MAX: the whole picture, centred
  function maxFrame() {
    const { img } = cur;
    if (cur.free) place(img.x, img.y, img.w, img.h);
    else { const s = Math.max(img.w, img.h); placeAround(img.x + img.w / 2, img.y + img.h / 2, s, s); }
  }
  // the frame given in source fractions (a recrop starts where it left off)
  function rectFrame(r) {
    const { img } = cur;
    place(img.x + r.x * img.w, img.y + r.y * img.h, r.w * img.w, r.h * img.h);
  }

  // a frame of src given in source fractions, as a canvas at the picture's
  // resolution (outside the picture: transparent)
  function apply(src, r) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(r.w * src.width));
    c.height = Math.max(1, Math.round(r.h * src.height));
    const x = c.getContext('2d'), sx = c.width / r.w, sy = c.height / r.h; // canvas px per picture
    x.imageSmoothingQuality = 'high';
    x.drawImage(src, -r.x * sx, -r.y * sy, sx, sy);
    return c;
  }
  // the frame as a canvas (square: cur.out px; free: the picture's resolution)
  function result() {
    const { img, fr, out } = cur;
    const r = { x: (fr.x - img.x) / img.w, y: (fr.y - img.y) / img.h, w: fr.w / img.w, h: fr.h / img.h };
    let c;
    if (cur.free) c = apply(cur.src, r);
    else {
      c = document.createElement('canvas');
      c.width = c.height = out;
      const x = c.getContext('2d');
      x.imageSmoothingQuality = 'high';
      x.scale(out / fr.w, out / fr.h);
      x.translate(-fr.x, -fr.y);
      x.drawImage(cur.src, img.x, img.y, img.w, img.h);
    }
    c.crop = r;
    return c;
  }

  function close(val) {
    if (!cur) return;
    const { resolve } = cur;
    cur = null;
    $('cropModal').hidden = true;
    resolve(val);
  }

  // a text node that follows language switches (its data-i18n key swapped)
  function label(el, key, attr) {
    if (attr) { el.dataset.i18nTitle = key; el.title = t(key); }
    else { el.dataset.i18n = key; el.textContent = t(key); }
  }

  function open(src, opts) {
    opts = opts || {};
    if (cur) close(null);
    return new Promise((resolve) => {
      const free = !!opts.free;
      const { view, bbox } = prepare(src, free);
      cur = { src, view, bbox, free, fit: opts.fit || 0.88, out: opts.out || 256, rect: opts.rect || null, resolve };
      const g = (1 - cur.fit) * 50;
      $('cropGuide').innerHTML = (free ? '' : `<g class="crop-ghost">${opts.guide || ''}</g>`)
        + '<line class="crop-mid" x1="50" y1="0" x2="50" y2="100"/><line class="crop-mid" x1="0" y1="50" x2="100" y2="50"/>'
        + (free ? '' : `<rect class="crop-safe" x="${g}" y="${g}" width="${100 - 2 * g}" height="${100 - 2 * g}"/>`);
      label($('cropTitleText'), opts.title || 'h_crop');
      label($('cropHint'), opts.hint || 'hint_crop');
      label($('cropFit'), opts.fitTitle || 't_fit', true);
      $('cropModal').hidden = false;
      requestAnimationFrame(() => {
        if (!cur) return;
        layout();
        if (cur.rect) rectFrame(cur.rect); else fitFrame();
        $('cropUse').focus();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    const frame = $('cropFrame'), modal = $('cropModal');
    let drag = null;
    frame.addEventListener('pointerdown', (e) => {
      if (!cur) return;
      e.preventDefault();
      frame.setPointerCapture(e.pointerId);
      drag = { resize: e.target === $('cropHandle'), x: e.clientX, y: e.clientY, fr: { ...cur.fr } };
    });
    frame.addEventListener('pointermove', (e) => {
      if (!drag || !cur) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, f = drag.fr, { sw, sh } = cur.img;
      if (!drag.resize) { place(f.x + dx, f.y + dy, f.w, f.h); return; }
      // resizing keeps the top-left corner where it is; a square (or a free
      // frame with Shift) keeps its shape
      if (cur.free && !e.shiftKey) { place(f.x, f.y, Math.min(f.w + dx, sw - f.x), Math.min(f.h + dy, sh - f.y)); return; }
      const s = Math.min(Math.max((f.w + dx) / f.w, (f.h + dy) / f.h), (sw - f.x) / f.w, (sh - f.y) / f.h);
      const k = Math.max(s, MIN / Math.min(f.w, f.h));
      place(f.x, f.y, f.w * k, f.h * k);
    });
    const end = () => { drag = null; };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    // the wheel grows / shrinks the frame around its centre, keeping its shape
    $('cropStage').addEventListener('wheel', (e) => {
      if (!cur) return;
      e.preventDefault();
      const f = cur.fr, { sw, sh } = cur.img;
      const k = clamp(Math.exp(-e.deltaY * 0.0015), MIN / Math.min(f.w, f.h), Math.min(sw / f.w, sh / f.h));
      placeAround(f.x + f.w / 2, f.y + f.h / 2, f.w * k, f.h * k);
    }, { passive: false });
    $('cropFit').addEventListener('click', () => cur && cur.img && fitFrame());
    $('cropMax').addEventListener('click', () => cur && cur.img && maxFrame());
    $('cropUse').addEventListener('click', () => cur && cur.fr && close(result()));
    $('cropCancel').addEventListener('click', () => close(null));
    $('cropClose').addEventListener('click', () => close(null));
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(null); });
    document.addEventListener('keydown', (e) => { if (cur && e.key === 'Escape') { e.stopPropagation(); close(null); } }, true);
    window.addEventListener('resize', () => {
      if (!cur) return;
      // keep the selection across the re-layout
      const { img, fr } = cur, r = { x: (fr.x - img.x) / img.w, y: (fr.y - img.y) / img.h, w: fr.w / img.w, h: fr.h / img.h };
      layout(); rectFrame(r);
    });
  });

  SINFORGE.crop = { open, apply };
})(window.SINFORGE);
