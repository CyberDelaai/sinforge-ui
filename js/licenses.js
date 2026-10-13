(function (SINFORGE) {
  'use strict';
  // ---- Licenses: the permits a license card can grant, each marked by an
  // icon (S.doc.licenses lists the granted keys). Each entry is
  //   { cap, shapes() }
  // cap is the caption printed under the icon (part of the printed document,
  // so it stays in English like the card's field captions); shapes() returns
  // the icon as plain geometry in a 100 x 100 unit square, drawn in order:
  //   { p: [[x, y], ...] }          a filled polygon
  //   { c: [cx, cy, radius] }       a filled circle
  //   { ring: [cx, cy, radius], w } a stroked circle, line width w
  //   { l: [[x, y], ...], w }       a stroked line (repeat the first point to close it)
  // plus `cut: true` to knock the shape out of what is already drawn. The same
  // geometry feeds the renderer (gfx.license) and the panel's toggle icons.
  // Add one by adding an entry + its key to SINFORGE.licenseOrder and a
  // `li_<key>` name in js/i18n.js. ----

  // rotate points by `deg` around the unit square's centre
  const rot = (pts, deg) => {
    const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    return pts.map(([x, y]) => [50 + (x - 50) * c - (y - 50) * s, 50 + (x - 50) * s + (y - 50) * c]);
  };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  // a star polygon: n points, outer / inner radius, around (cx, cy)
  const star = (cx, cy, n, ro, ri) => Array.from({ length: n * 2 }, (_, i) => {
    const a = Math.PI / n * i - Math.PI / 2, r = i % 2 ? ri : ro;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  });

  const licenses = {
    // pistol, muzzle to the right
    firearms: {
      cap: 'FIREARMS',
      shapes: () => [
        { p: [[10, 24], [90, 24], [90, 42], [48, 42], [44, 54], [34, 54], [30, 84], [8, 84], [14, 48], [10, 42]] },
        { p: rect(80, 17, 88, 24) },
        { l: [[46, 42], [50, 58], [36, 58], [36, 54]], w: 5 },
      ],
    },
    // combat knife, point up and to the right
    blades: {
      cap: 'BLADES',
      shapes: () => [
        { p: rot([[8, 44], [32, 44], [32, 56], [8, 56]], -45) },
        { p: rot(rect(32, 34, 39, 66), -45) },
        { p: rot([[39, 42], [80, 42], [96, 50], [84, 57], [39, 57]], -45) },
        { l: rot([[44, 46.5], [76, 46.5]], -45), w: 3, cut: true },
      ],
    },
    // round bomb, lit fuse
    explosives: {
      cap: 'EXPLOSIVES',
      shapes: () => [
        { c: [44, 60, 30] },
        { p: [[58, 30], [66, 22], [76, 32], [68, 40]] },
        { ring: [34, 52, 12], w: 4, cut: true },
        { l: [[71, 27], [75, 19], [80, 16]], w: 4 },
        { p: star(84, 14, 5, 10, 4) },
      ],
    },
    // steering wheel
    driver: {
      cap: 'DRIVER',
      shapes: () => [
        { ring: [50, 50, 38], w: 10 },
        { c: [50, 52, 11] },
        { p: [[14, 46], [40, 46], [40, 57], [16, 60]] },
        { p: [[86, 46], [60, 46], [60, 57], [84, 60]] },
        { p: [[45, 60], [55, 60], [57, 87], [43, 87]] },
      ],
    },
    // aircraft from above, nose up
    pilot: {
      cap: 'PILOT',
      shapes: () => [
        { p: [[50, 5], [56, 14], [56, 38], [94, 58], [94, 67], [56, 57], [56, 77], [69, 87], [69, 94], [50, 89],
          [31, 94], [31, 87], [44, 77], [44, 57], [6, 67], [6, 58], [44, 38], [44, 14]] },
      ],
    },
    // medical cross
    medic: {
      cap: 'MEDICAL',
      shapes: () => [
        { p: [[37, 8], [63, 8], [63, 37], [92, 37], [92, 63], [63, 63], [63, 92], [37, 92], [37, 63], [8, 63], [8, 37], [37, 37]] },
      ],
    },
    // magnifying glass
    detective: {
      cap: 'DETECTIVE',
      shapes: () => [
        { ring: [40, 40, 26], w: 10 },
        { l: [[60, 60], [88, 88]], w: 15 },
        { l: [[27, 34], [33, 26]], w: 4 },
      ],
    },
    // shield with a keyhole
    security: {
      cap: 'SECURITY',
      shapes: () => [
        { p: [[50, 6], [88, 18], [86, 54], [50, 94], [14, 54], [12, 18]] },
        { c: [50, 40, 10], cut: true },
        { p: [[45, 44], [55, 44], [59, 70], [41, 70]], cut: true },
      ],
    },
    // crosshair
    bounty: {
      cap: 'BOUNTY',
      shapes: () => [
        { ring: [50, 50, 32], w: 7 },
        { l: [[50, 6], [50, 36]], w: 7 }, { l: [[50, 64], [50, 94]], w: 7 },
        { l: [[6, 50], [36, 50]], w: 7 }, { l: [[64, 50], [94, 50]], w: 7 },
        { c: [50, 50, 6] },
      ],
    },
    // cyberdeck terminal with a prompt
    decker: {
      cap: 'DECKER',
      shapes: () => [
        { p: rect(8, 12, 92, 76) },
        { p: rect(16, 20, 84, 68), cut: true },
        { p: [[24, 30], [42, 44], [24, 58], [24, 50], [32, 44], [24, 38]] },
        { p: rect(46, 52, 66, 58) },
        { p: [[40, 76], [60, 76], [64, 86], [36, 86]] },
        { p: rect(24, 86, 76, 93) },
      ],
    },
    // pentagram in a circle
    magic: {
      cap: 'MAGIC',
      shapes: () => {
        const pt = (i) => [50 + 36 * Math.cos(-Math.PI / 2 + i * 4 * Math.PI / 5), 52 + 36 * Math.sin(-Math.PI / 2 + i * 4 * Math.PI / 5)];
        return [
          { ring: [50, 52, 41], w: 6 },
          { l: [0, 1, 2, 3, 4, 0, 1].map(pt), w: 5 },
        ];
      },
    },
    // cyber eye: an almond with a lens iris and circuit traces
    cyberware: {
      cap: 'CYBERWARE',
      shapes: () => {
        const top = [], bot = [];
        for (let i = 0; i <= 16; i++) {
          const x = 6 + 88 * i / 16, h = 30 * Math.sin(Math.PI * i / 16);
          top.push([x, 50 - h]); bot.unshift([x, 50 + h]);
        }
        return [
          { p: top.concat(bot) },
          { c: [50, 50, 22], cut: true },
          { c: [50, 50, 12] },
          { c: [55, 45, 4], cut: true },
          { l: [[50, 80], [50, 92], [72, 92]], w: 4 },
          { l: [[50, 20], [50, 8], [28, 8]], w: 4 },
        ];
      },
    },
  };

  SINFORGE.licenses = licenses;
  SINFORGE.licenseOrder = ['firearms', 'blades', 'explosives', 'driver', 'pilot', 'medic',
    'detective', 'security', 'bounty', 'decker', 'magic', 'cyberware'];
})(window.SINFORGE);
