(function (SINFORGE) {
  'use strict';
  // ---- Crop window (ported from COMMLINK's crop modal): a square frame over
  // the picture, dragged to move, resized from its corner handle or the
  // wheel. Guides inside the frame show where a standard icon sits: the
  // dashed safe square (the extent the built-in icons fill), centre lines and
  // a ghost of the icon being replaced. The frame may run past the picture —
  // that part comes out transparent — so a tight picture can be given room.
  //   SINFORGE.crop.open(src, { guide, fit, out }) -> Promise<canvas | null>
  // src: a canvas (an icon mask: black + alpha, shown light on the dark
  // stage); guide: SVG markup in a 0..100 square drawn under the guides;
  // fit: the safe square's share of the frame (FIT sizes the picture's
  // content to it); out: the result's edge in px. Resolves null on cancel. ----
  const $ = SINFORGE.$;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const MIN = 24; // smallest frame edge, stage px
  let cur = null; // { src, view, bbox, fit, out, img, fr, resolve }

  // The picture tinted light for the dark stage, and its content's bounding
  // box (alpha > 40) in source px — FIT frames that box.
  function prepare(src) {
    const view = document.createElement('canvas');
    view.width = src.width; view.height = src.height;
    const x = view.getContext('2d');
    x.drawImage(src, 0, 0);
    const d = x.getImageData(0, 0, src.width, src.height).data;
    let x0 = src.width, y0 = src.height, x1 = -1, y1 = -1;
    for (let y = 0, i = 3; y < src.height; y++) {
      for (let px = 0; px < src.width; px++, i += 4) {
        if (d[i] > 40) { if (px < x0) x0 = px; if (px > x1) x1 = px; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      }
    }
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = '#e8e8ee';
    x.fillRect(0, 0, view.width, view.height);
    const bbox = x1 < 0 ? { x: 0, y: 0, w: src.width, h: src.height } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    return { view, bbox };
  }

  // fit the picture into the stage (80% of it, leaving room around it for
  // the frame) and draw it, its bounds as a thin dashed line
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
    x.setLineDash([4, 4]);
    x.strokeStyle = 'rgba(122,122,136,0.6)';
    x.lineWidth = 1;
    x.strokeRect(cur.img.x - 0.5, cur.img.y - 0.5, w + 1, h + 1);
    x.imageSmoothingQuality = 'high';
    x.drawImage(cur.view, cur.img.x, cur.img.y, w, h);
  }

  // place the frame (stage px), kept inside the stage
  function place(x, y, s) {
    const { sw, sh } = cur.img;
    s = clamp(s, MIN, Math.min(sw, sh));
    cur.fr = { x: clamp(x, 0, sw - s), y: clamp(y, 0, sh - s), s };
    Object.assign($('cropFrame').style, { left: cur.fr.x + 'px', top: cur.fr.y + 'px', width: s + 'px', height: s + 'px' });
  }
  const placeAround = (cx, cy, s) => place(cx - s / 2, cy - s / 2, s);
  // FIT: the picture's content fills the safe square, centred
  function fitFrame() {
    const { img } = cur, b = cur.bbox;
    placeAround(img.x + (b.x + b.w / 2) * img.f, img.y + (b.y + b.h / 2) * img.f, Math.max(b.w, b.h) * img.f / cur.fit);
  }
  // MAX: the whole picture, centred
  function maxFrame() {
    const { img } = cur;
    placeAround(img.x + img.w / 2, img.y + img.h / 2, Math.max(img.w, img.h));
  }

  // the frame's square as a canvas of cur.out px (outside the picture: transparent)
  function result() {
    const { img, fr, out } = cur;
    const c = document.createElement('canvas');
    c.width = c.height = out;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.scale(out / fr.s, out / fr.s);
    x.translate(-fr.x, -fr.y);
    x.drawImage(cur.src, img.x, img.y, img.w, img.h);
    return c;
  }

  function close(val) {
    if (!cur) return;
    const { resolve } = cur;
    cur = null;
    $('cropModal').hidden = true;
    resolve(val);
  }

  function open(src, opts) {
    opts = opts || {};
    if (cur) close(null);
    return new Promise((resolve) => {
      const { view, bbox } = prepare(src);
      cur = { src, view, bbox, fit: opts.fit || 0.88, out: opts.out || 256, resolve };
      const g = (1 - cur.fit) * 50;
      $('cropGuide').innerHTML = `<g class="crop-ghost">${opts.guide || ''}</g>`
        + '<line class="crop-mid" x1="50" y1="0" x2="50" y2="100"/><line class="crop-mid" x1="0" y1="50" x2="100" y2="50"/>'
        + `<rect class="crop-safe" x="${g}" y="${g}" width="${100 - 2 * g}" height="${100 - 2 * g}"/>`;
      $('cropModal').hidden = false;
      requestAnimationFrame(() => { if (!cur) return; layout(); fitFrame(); $('cropUse').focus(); });
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
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y, f = drag.fr;
      // resizing keeps the top-left corner where it is
      if (drag.resize) place(f.x, f.y, Math.min(f.s + Math.max(dx, dy), cur.img.sw - f.x, cur.img.sh - f.y));
      else place(f.x + dx, f.y + dy, f.s);
    });
    const end = () => { drag = null; };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    // the wheel grows / shrinks the frame around its centre
    $('cropStage').addEventListener('wheel', (e) => {
      if (!cur) return;
      e.preventDefault();
      const f = cur.fr;
      placeAround(f.x + f.s / 2, f.y + f.s / 2, f.s * Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    $('cropFit').addEventListener('click', () => cur && fitFrame());
    $('cropMax').addEventListener('click', () => cur && maxFrame());
    $('cropUse').addEventListener('click', () => cur && close(result()));
    $('cropCancel').addEventListener('click', () => close(null));
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(null); });
    document.addEventListener('keydown', (e) => { if (cur && e.key === 'Escape') { e.stopPropagation(); close(null); } }, true);
    window.addEventListener('resize', () => { if (cur) { layout(); fitFrame(); } });
  });

  SINFORGE.crop = { open };
})(window.SINFORGE);
