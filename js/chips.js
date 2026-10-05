(function (SINFORGE) {
  'use strict';
  // ---- Chips: the chip printed in a blank's chip slot, picked per document
  // (S.style.chipType) and shared by every blank. Each entry is
  //   { shapes(box) }
  // shapes() returns the chip as plain geometry inside the square `box`
  // ({ x, y, w, h }), drawn in order:
  //   { p: [[x, y], ...] }       a closed polygon
  //   { c: [cx, cy, radius] }    a circle
  //   { l: [[x, y], ...] }       an open line (always stroked)
  // plus `fill: 'accent' | 'ink'` to fill it and `stroke: true` to outline it
  // in the ink colour. The same geometry feeds the renderer (gfx.chip) and the
  // picker icons. Add one by adding an entry + its key to SINFORGE.chipOrder
  // and a `ch_<key>` name in js/i18n.js. ----
  const S = SINFORGE.state;

  // unit-square helpers: u, v in 0..1 of the box
  const at = (b) => (u, v) => [b.x + u * b.w, b.y + v * b.h];
  // a rectangle with chamfered corners; cuts = [tl, tr, br, bl]
  function cutRect(P, u0, v0, u1, v1, cuts) {
    const [a, c, d, e] = cuts;
    return [
      P(u0 + a, v0), P(u1 - c, v0), P(u1, v0 + c), P(u1, v1 - d), P(u1 - d, v1),
      P(u0 + e, v1), P(u0, v1 - e), P(u0, v0 + a),
    ];
  }
  const rect = (P, u0, v0, u1, v1) => [P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1)];
  // a regular hexagon (pointy top) of radius r (in box widths) around the centre
  const hex = (P, r) => [0, 1, 2, 3, 4, 5].map((i) => {
    const a = Math.PI / 3 * i - Math.PI / 2;
    return P(0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a));
  });

  const chips = {
    // ISO contact plate: eight pads around a central die window
    contact: {
      shapes(b) {
        const P = at(b), c = 0.0875, s = 0.325, t = 0.1875;
        return [
          { p: cutRect(P, 0, 0, 1, 1, [c, 0, c, 0]), fill: 'accent', stroke: true },
          { l: [P(0, 1 / 3), P(s, 1 / 3)] }, { l: [P(0, 2 / 3), P(s, 2 / 3)] },
          { l: [P(1, 1 / 3), P(1 - s, 1 / 3)] }, { l: [P(1, 2 / 3), P(1 - s, 2 / 3)] },
          { l: [P(0.5, 0), P(0.5, t)] }, { l: [P(0.5, 1), P(0.5, 1 - t)] },
          { p: rect(P, s, t, 1 - s, 1 - t), stroke: true },
        ];
      },
    },

    // EMV payment chip: three pad columns, a stepped split down the middle one
    emv: {
      shapes(b) {
        const P = at(b), c = 0.12, a = 0.32;
        return [
          { p: cutRect(P, 0, 0, 1, 1, [c, c, c, c]), fill: 'accent', stroke: true },
          { l: [P(a, 0), P(a, 1)] }, { l: [P(1 - a, 0), P(1 - a, 1)] },
          { l: [P(0, 0.36), P(a, 0.36)] }, { l: [P(0, 0.64), P(a, 0.64)] },
          { l: [P(1, 0.36), P(1 - a, 0.36)] }, { l: [P(1, 0.64), P(1 - a, 0.64)] },
          { l: [P(a, 0.4), P(0.5, 0.4), P(0.5, 0.6), P(1 - a, 0.6)] },
        ];
      },
    },

    // processor package: pins on all four sides, a die, a pin-1 dot
    die: {
      shapes(b) {
        const P = at(b), out = [], e = 0.17, pw = 0.03;
        [0.26, 0.38, 0.5, 0.62, 0.74].forEach((t) => {
          out.push({ p: rect(P, t - pw, 0.02, t + pw, e), fill: 'ink' });
          out.push({ p: rect(P, t - pw, 1 - e, t + pw, 0.98), fill: 'ink' });
          out.push({ p: rect(P, 0.02, t - pw, e, t + pw), fill: 'ink' });
          out.push({ p: rect(P, 1 - e, t - pw, 0.98, t + pw), fill: 'ink' });
        });
        out.push({ p: cutRect(P, e, e, 1 - e, 1 - e, [0.08, 0, 0, 0]), fill: 'accent', stroke: true });
        out.push({ p: rect(P, 0.34, 0.34, 0.66, 0.66), stroke: true });
        out.push({ c: [...P(0.27, 0.27), b.w * 0.028], fill: 'ink' });
        return out;
      },
    },

    // contactless: an antenna coil wound round a small die
    coil: {
      shapes(b) {
        const P = at(b), c = 0.1;
        // each loop parallel to the plate: insetting a 45° chamfer by i shrinks it by i(√2 − 1)
        const loop = (i) => { const k = Math.max(0, c - i * 0.414); return cutRect(P, i, i, 1 - i, 1 - i, [k, k, k, k]); };
        return [
          { p: cutRect(P, 0, 0, 1, 1, [c, c, c, c]), fill: 'accent', stroke: true },
          { p: loop(0.1), stroke: true }, { p: loop(0.17), stroke: true }, { p: loop(0.24), stroke: true },
          { l: [P(0.24, 0.5), P(0.4, 0.5)] }, { l: [P(0.6, 0.5), P(0.76, 0.5)] },
          { p: rect(P, 0.4, 0.4, 0.6, 0.6), fill: 'ink' },
        ];
      },
    },

    // datajack: a round port, a ring of pins round the socket, a key notch
    jack: {
      shapes(b) {
        const P = at(b), r = b.w;
        const out = [
          { c: [...P(0.5, 0.5), r * 0.49], fill: 'accent', stroke: true },
          { c: [...P(0.5, 0.5), r * 0.33], stroke: true },
          { c: [...P(0.5, 0.5), r * 0.2], fill: 'ink' },
          { c: [...P(0.5, 0.5), r * 0.07], fill: 'accent' },
          { p: rect(P, 0.45, 0.02, 0.55, 0.14), fill: 'ink' },
        ];
        for (let i = 0; i < 8; i++) {
          const a = Math.PI / 4 * i + Math.PI / 8;
          out.push({ c: [...P(0.5 + 0.41 * Math.cos(a), 0.5 + 0.41 * Math.sin(a)), r * 0.032], fill: 'ink' });
        }
        return out;
      },
    },

    // hex node: a hexagonal plate, traces from a solid core out to via dots
    hex: {
      shapes(b) {
        const P = at(b), inner = hex(P, 0.2), outer = hex(P, 0.38);
        const out = [{ p: hex(P, 0.5), fill: 'accent', stroke: true }];
        inner.forEach((p, i) => out.push({ l: [p, outer[i]] }));
        outer.forEach((p) => out.push({ c: [p[0], p[1], b.w * 0.035], fill: 'ink' }));
        out.push({ p: inner, fill: 'ink' });
        return out;
      },
    },
  };

  SINFORGE.chips = chips;
  SINFORGE.chipOrder = ['contact', 'emv', 'die', 'coil', 'jack', 'hex'];
  // the selected chip (falls back to the contact plate on an unknown key)
  SINFORGE.chip = (st) => chips[(st || S.style).chipType] || chips.contact;
})(window.SINFORGE);
