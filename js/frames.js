(function (SINFORGE) {
  'use strict';
  // ---- Portrait frames: the photo window's shape + its printed frame, picked
  // per document (S.style.frame) and shared by every blank. A blank declares
  // only where its portrait sits — `portrait: { box, cut, line }` (bounding box
  // in native px, its corner-cut size and frame line width) — and reads its
  // window through SINFORGE.frameWindow(portrait):
  //   { box, line, poly, marks, accent, inner }
  //   poly    the window outline: the photo clip, the stroked frame line and
  //           the watermark's hole; clockwise, inside box
  //   marks   extra ink polygons (thick runs, brackets, ticks)
  //   accent  extra accent-colour polygons
  //   inner   optional inset distance of a thin second frame line
  // Shapes stay inside the box plus half a line, so a frame never collides
  // with the blank's other elements. Add a frame by adding an entry + its key
  // to SINFORGE.frameOrder and a `pf_<key>` name in js/i18n.js. ----
  const S = SINFORGE.state;
  const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

  const frames = {
    // two opposite corners cut, thick runs on three edges (the original window)
    notch(b, c, L) {
      const { x, y, w, h } = b, T = Math.round(L * 1.45), o = L / 2;
      return {
        poly: [[x, y], [x + w - c, y], [x + w, y + c], [x + w, y + h], [x + c, y + h], [x, y + h - c]],
        marks: [
          rect(x + w * 0.45, y - o, w * 0.33, T),
          rect(x + w * 0.22, y + h + o - T, w * 0.3, T),
          rect(x + w + o - T, y + h * 0.32, T, h * 0.19),
        ],
      };
    },
    // plain rectangle in a thin line, heavy L-brackets on all four corners
    brackets(b, c, L) {
      const { x, y, w, h } = b, T = Math.round(L * 1.45), o = L / 2;
      const a = Math.min(w, h) * 0.2, x0 = x - o, y0 = y - o, x1 = x + w + o, y1 = y + h + o;
      return {
        poly: rect(x, y, w, h),
        line: L * 0.45,
        marks: [
          [[x0, y0], [x0 + a, y0], [x0 + a, y0 + T], [x0 + T, y0 + T], [x0 + T, y0 + a], [x0, y0 + a]],
          [[x1, y0], [x1, y0 + a], [x1 - T, y0 + a], [x1 - T, y0 + T], [x1 - a, y0 + T], [x1 - a, y0]],
          [[x1, y1], [x1 - a, y1], [x1 - a, y1 - T], [x1 - T, y1 - T], [x1 - T, y1 - a], [x1, y1 - a]],
          [[x0, y1], [x0, y1 - a], [x0 + T, y1 - a], [x0 + T, y1 - T], [x0 + a, y1 - T], [x0 + a, y1]],
        ],
      };
    },
    // all four corners cut, a thin second line inside, accent wedges in two cuts
    octagon(b, c, L) {
      const { x, y, w, h } = b, a = Math.max(c * 0.8, L * 5), o = L / 2;
      const t = Math.max(0, a - 2.2 * L);
      return {
        poly: [[x + a, y], [x + w - a, y], [x + w, y + a], [x + w, y + h - a],
          [x + w - a, y + h], [x + a, y + h], [x, y + h - a], [x, y + a]],
        inner: L * 1.6,
        accent: t ? [
          [[x - o, y - o], [x - o + t, y - o], [x - o, y - o + t]],
          [[x + w + o, y + h + o], [x + w + o - t, y + h + o], [x + w + o, y + h + o - t]],
        ] : [],
      };
    },
    // small top cuts, straight sides, tapering to a flat point at the bottom
    shield(b, c, L) {
      const { x, y, w, h } = b, s = c * 0.45, d = h * 0.2, T = Math.round(L * 1.45), o = L / 2;
      return {
        poly: [[x + s, y], [x + w - s, y], [x + w, y + s], [x + w, y + h - d],
          [x + w * 0.68, y + h], [x + w * 0.32, y + h], [x, y + h - d], [x, y + s]],
        marks: [rect(x + w * 0.3, y - o, w * 0.4, T)],
      };
    },
    // an ellipse filling the box, crosshair ticks at its four poles
    scope(b, c, L) {
      const { x, y, w, h } = b, cx = x + w / 2, cy = y + h / 2, o = L / 2;
      const poly = [];
      for (let i = 0; i < 96; i++) {
        const a = (i / 96) * Math.PI * 2; // y down: increasing angle runs clockwise
        poly.push([cx + Math.cos(a) * w / 2, cy + Math.sin(a) * h / 2]);
      }
      const tw = L * 0.9, tl = L * 3.2;
      return {
        poly,
        marks: [
          rect(cx - tw / 2, y - o, tw, tl), rect(cx - tw / 2, y + h + o - tl, tw, tl),
          rect(x - o, cy - tw / 2, tl, tw), rect(x + w + o - tl, cy - tw / 2, tl, tw),
        ],
      };
    },
    // a parallelogram leaning right, accent wedges along its two slanted edges
    slant(b, c, L) {
      const { x, y, w, h } = b, s = w * 0.12, g = 2 * L, o = L / 2, T = Math.round(L * 1.45);
      const tw = s - g + o, th = tw * h / s; // wedge parallel to the edge, g away from it
      return {
        poly: [[x + s, y], [x + w, y], [x + w - s, y + h], [x, y + h]],
        marks: [rect(x + w * 0.5, y - o, w * 0.32, T)],
        accent: tw > 0 ? [
          [[x - o, y - o], [x - o + tw, y - o], [x - o, y - o + th]],
          [[x + w + o, y + h + o], [x + w + o - tw, y + h + o], [x + w + o, y + h + o - th]],
        ] : [],
      };
    },
  };

  // The photo window for a blank's portrait spec under a frame (default: the
  // selected one).
  SINFORGE.frameWindow = function frameWindow(p, key) {
    const f = frames[key || S.style.frame] || frames.notch;
    const sh = f(p.box, p.cut, p.line);
    return {
      box: p.box,
      line: sh.line || p.line,
      poly: sh.poly,
      marks: sh.marks || [],
      accent: sh.accent || [],
      inner: sh.inner || 0,
    };
  };

  // Draw the portrait: the photo clipped to the window, then the frame on top.
  SINFORGE.gfx.portrait = function portrait(ctx, win, k, st) {
    const gfx = SINFORGE.gfx;
    const pic = gfx.photo(win.box, k);
    if (pic) {
      ctx.save();
      gfx.poly(ctx, win.poly);
      ctx.clip();
      ctx.drawImage(pic, win.box.x, win.box.y, win.box.w, win.box.h);
      ctx.restore();
    }
    ctx.strokeStyle = st.ink; ctx.lineJoin = 'miter';
    if (win.inner) {
      gfx.poly(ctx, gfx.inset(win.poly, win.inner));
      ctx.lineWidth = win.line * 0.3;
      ctx.stroke();
    }
    gfx.poly(ctx, win.poly);
    ctx.lineWidth = win.line;
    ctx.stroke();
    ctx.fillStyle = st.ink;
    win.marks.forEach((m) => { gfx.poly(ctx, m); ctx.fill(); });
    ctx.fillStyle = st.accent;
    win.accent.forEach((m) => { gfx.poly(ctx, m); ctx.fill(); });
  };

  SINFORGE.frames = frames;
  SINFORGE.frameOrder = ['notch', 'brackets', 'octagon', 'shield', 'scope', 'slant'];
})(window.SINFORGE);
