(function (SINFORGE) {
  'use strict';
  // ---- Barcodes: the code printed in a blank's barcode slot, picked per
  // document (S.style.code) and shared by every blank. Each entry is
  //   { square?, shapes(box, seed) }
  // shapes() returns the code as plain geometry inside `box` ({ x, y, w, h }):
  //   { r: [x, y, w, h] }        a filled rectangle
  //   { c: [cx, cy, radius] }    a filled dot
  //   { t: text, x, y, size, w } human-readable line (centred on x, fit to w)
  // plus `accent: true` to print it in the accent colour. The same geometry
  // feeds the renderer (gfx.code) and the picker icons. `square` codes are 2D:
  // gfx.code fits them into a square at the slot's right edge, and a blank
  // can offer them a bigger slot (SINFORGE.codeSquare). Every code is seeded
  // from the document number, so a card always keeps its code. Add one by
  // adding an entry + its key to SINFORGE.codeOrder and a `bc_<key>` name in
  // js/i18n.js. ----
  const S = SINFORGE.state;
  const gfx = SINFORGE.gfx;
  const rngOf = (seed) => gfx.rng(gfx.hash(String(seed || 'SINFORGE')));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // Lay out a run of bar/space widths (in modules, bar first) across a box.
  function runBars(widths, x, y, w, h, out) {
    const u = w / widths.reduce((a, b) => a + b, 0);
    let at = 0;
    widths.forEach((m, i) => {
      if (!(i & 1)) out.push({ r: [x + at * u, y, m * u, h] });
      at += m;
    });
    return out;
  }

  // Code 128 (set B): bar/space widths of each symbol value 0..106 (106 = stop).
  const C128 = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 '
    + '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 '
    + '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 '
    + '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 '
    + '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 '
    + '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 '
    + '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 '
    + '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 '
    + '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 '
    + '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 '
    + '114131 311141 411131 211412 211214 211232 2331112').split(' ');
  function code128(text) {
    // set B covers printable ASCII; anything else becomes '?'
    const vals = [...String(text || ' ')].map((ch) => {
      const c = ch.charCodeAt(0);
      return c >= 32 && c <= 126 ? c - 32 : 31;
    });
    let sum = 104;
    vals.forEach((v, i) => { sum += v * (i + 1); });
    const syms = [104, ...vals, sum % 103, 106];
    return syms.flatMap((v) => [...C128[v]].map(Number));
  }

  // EAN-13: 12 digits (the number's own, topped up from its hash) + a check
  // digit. Returns the 13 digits and the run as [{ w, bar, guard }], 95 modules.
  const EAN_L = ['3211', '2221', '2122', '1411', '1132', '1231', '1114', '1312', '1213', '3112'];
  const EAN_PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
  function ean13(seed) {
    const r = rngOf(seed);
    const d = (String(seed || '').match(/[0-9]/g) || []).map(Number).slice(0, 12);
    while (d.length < 12) d.push(Math.floor(r() * 10));
    d.push((10 - d.reduce((a, v, i) => a + v * (i % 2 ? 3 : 1), 0) % 10) % 10);
    const run = [];
    let bar = true;
    const put = (widths, guard) => [...widths].forEach((w) => { run.push({ w: +w, bar, guard }); bar = !bar; });
    put('111', true);
    for (let i = 1; i <= 6; i++) {
      const L = EAN_L[d[i]];
      put(EAN_PARITY[d[0]][i - 1] === 'L' ? L : [...L].reverse().join(''));
    }
    put('11111', true);
    for (let i = 7; i <= 12; i++) put(EAN_L[d[i]]);
    put('111', true);
    return { digits: d.join(''), run };
  }

  // a square grid of n x n modules filling box; on(i, j) -> dark
  function grid(box, n, on, out, dot) {
    const m = box.w / n;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (!on(i, j)) continue;
        out.push(dot ? { c: [box.x + (i + 0.5) * m, box.y + (j + 0.5) * m, m * 0.4] }
          : { r: [box.x + i * m, box.y + j * m, m, m] });
      }
    }
    return out;
  }

  const codes = {
    // a real, scannable Code 128 of the number; the text under it when there's room
    code128: {
      shapes(b, seed) {
        const txt = b.h >= 80;
        const size = Math.round(b.h * 0.17);
        const out = runBars(code128(seed), b.x, b.y, b.w, txt ? b.h - size * 1.25 : b.h, []);
        if (txt) out.push({ t: String(seed || ''), x: b.x + b.w / 2, y: b.y + b.h, size, w: b.w });
        return out;
      },
    },

    // EAN-13 (retail): longer guard bars at both ends and the middle; with
    // room, the digits under it in the classic 1 + 6 + 6 split
    ean13: {
      shapes(b, seed) {
        const { digits, run } = ean13(seed);
        const txt = b.h >= 80, size = Math.round(b.h * 0.17), lead = txt ? 7 : 0;
        const u = b.w / (95 + lead), x0 = b.x + lead * u;
        const gh = txt ? b.h - size * 0.6 : b.h, dh = txt ? b.h - size * 1.25 : b.h * 0.86;
        const out = [];
        let at = 0;
        run.forEach(({ w, bar, guard }) => {
          if (bar) out.push({ r: [x0 + at * u, b.y, w * u, guard ? gh : dh] });
          at += w;
        });
        if (txt) {
          const y = b.y + b.h;
          out.push({ t: digits[0], x: b.x + 3 * u, y, size, w: 6 * u });
          out.push({ t: digits.slice(1, 7), x: x0 + 24 * u, y, size, w: 40 * u });
          out.push({ t: digits.slice(7), x: x0 + 71 * u, y, size, w: 40 * u });
        }
        return out;
      },
    },

    // postal 4-state: thin bars hanging off a midline — full, ascender,
    // descender or tracker (middle third only); full bars at both ends
    postal: {
      shapes(b, seed) {
        const r = rngOf(seed), out = [];
        const n = clamp(Math.round(b.w / (b.h * 0.08)), 24, 65);
        const p = b.w / (n - 0.5), t = b.h / 3;
        for (let i = 0; i < n; i++) {
          const s = i === 0 || i === n - 1 ? 0 : Math.floor(r() * 4);
          const top = s === 0 || s === 1 ? b.y : b.y + t;
          const bot = s === 0 || s === 2 ? b.y + b.h : b.y + 2 * t;
          out.push({ r: [b.x + i * p, top, p / 2, bot - top] });
        }
        return out;
      },
    },

    // stacked (PDF417-look): rows of 17-module codewords between the fixed
    // start / stop patterns, so those line up into solid columns
    stacked: {
      shapes(b, seed) {
        const r = rngOf(seed), out = [];
        const rows = clamp(Math.round(b.h / 14), 3, 6);
        const words = Math.max(1, Math.round((b.w / 1.6 - 69) / 17));
        const word = () => {
          // 8 elements (4 bars, 4 spaces) of 1..6 modules summing to 17
          const e = [1, 1, 1, 1, 1, 1, 1, 1];
          for (let left = 9; left > 0;) {
            const i = Math.floor(r() * 8);
            if (e[i] < 6) { e[i]++; left--; }
          }
          return e;
        };
        const rh = b.h / rows;
        for (let j = 0; j < rows; j++) {
          const w = [8, 1, 1, 1, 1, 1, 1, 3];
          for (let i = 0; i < words + 2; i++) w.push(...word());
          w.push(7, 1, 1, 3, 1, 1, 1, 2, 1);
          runBars(w, b.x, b.y + j * rh, b.w, rh, out);
        }
        return out;
      },
    },

    // matrix (QR-look): three finder squares, timing lines, random data —
    // reads as a QR code but doesn't scan
    matrix: {
      square: true,
      shapes(b, seed) {
        const r = rngOf(seed);
        const n = b.w >= 140 ? 25 : 21;
        const finder = (i, j, fx, fy) => {
          const x = i - fx, y = j - fy;
          if (x < 0 || y < 0 || x > 6 || y > 6) return null;
          const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
          return ring !== 2;
        };
        const align = n - 7; // the version-2 alignment pattern's centre
        return grid(b, n, (i, j) => {
          const f = finder(i, j, 0, 0) ?? finder(i, j, n - 7, 0) ?? finder(i, j, 0, n - 7);
          if (f !== null) return f;
          if ((i < 8 && j < 8) || (i > n - 9 && j < 8) || (i < 8 && j > n - 9)) return false; // separators
          if (n === 25 && Math.abs(i - align) <= 2 && Math.abs(j - align) <= 2) {
            return Math.max(Math.abs(i - align), Math.abs(j - align)) !== 1;
          }
          if (i === 6 || j === 6) return (i + j) % 2 === 0; // timing
          return r() < 0.5;
        }, []);
      },
    },

    // dot code: laser-etched dots on a grid, solid corners and a dotted top
    // row as the orientation marks
    dots: {
      square: true,
      shapes(b, seed) {
        const r = rngOf(seed), n = 15;
        return grid(b, n, (i, j) => {
          if ((i === 0 || i === n - 1) && (j === 0 || j === n - 1)) return true;
          if (j === 0) return i % 2 === 0;
          if (i === 0) return j % 2 === 0;
          return r() < 0.48;
        }, [], true);
      },
    },
  };

  SINFORGE.codes = codes;
  SINFORGE.codeOrder = ['code128', 'ean13', 'postal', 'stacked', 'matrix', 'dots'];
  // the selected code (falls back to Code 128 on an unknown key)
  SINFORGE.code = (st) => codes[(st || S.style).code] || codes.code128;
  // true when the selected code is 2D (a blank may give it a square slot)
  SINFORGE.codeSquare = (st) => !!SINFORGE.code(st).square;
})(window.SINFORGE);
