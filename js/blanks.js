(function (SINFORGE) {
  'use strict';
  // ---- Blank library: SINFORGE.blanks[key] = one pre-defined document.
  //   w, h      native size in px (the 1x export); 2x doubles it
  //   outline   card silhouette, a clockwise polygon — outside it the PNG is transparent
  //   portrait  { box, cut, line }: where the photo sits (its bounding box, which
  //             the framing drag / zoom works in), the frame's corner-cut size and
  //             line width; the window's shape comes from the selected portrait
  //             frame (js/frames.js)
  //   photo     getter: SINFORGE.frameWindow(this.portrait) — { box, poly, ... }
  //   texts     text slots, in panel order: { id (key in S.doc), label (i18n key), max,
  //             gen? (key in SINFORGE.gen — adds a GENERATE button beside the field) }
  //   names     optional { first, last, title? }: slot ids the name generator
  //             fills — adds a GENERATE NAME row (+ its settings) after `last`
  //   decor     which decoration toggles apply (keys in S.style)
  //   draw(ctx, k, env)  paints the blank inside the clipped card body using
  //             env.gfx primitives; env.st is the style, env.doc the text.
  // Add a blank by adding an entry + its key to SINFORGE.blankOrder (and a
  // `bl_<key, dashes as underscores>` name in js/i18n.js). ----

  // ---- generators for the GENERATE buttons: SINFORGE.gen[key]() -> string ----
  // Serial patterns: 9 = digit, @ = letter (no I / O, they read as 1 / 0),
  // % = hex digit; anything else (letters included) is copied as-is. Each generation picks one
  // pattern at random and fills it.
  const SERIAL_PATTERNS = ['#99-9999', 'SIN-9999-9999', '@@-9999-@', '%%:%%:%%:%%', '@@@/99999'];
  const POOLS = { 9: '0123456789', '@': 'ABCDEFGHJKLMNPQRSTUVWXYZ', '%': '0123456789ABCDEF' };
  const pick = (str) => str[Math.floor(Math.random() * str.length)];
  SINFORGE.serialPatterns = SERIAL_PATTERNS;
  // A random YYYY-MM-DD between two years (inclusive); days stop at 28 so every month works.
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pad2 = (n) => String(n).padStart(2, '0');
  const date = (y0, y1) => `${rint(y0, y1)}-${pad2(rint(1, 12))}-${pad2(rint(1, 28))}`;
  SINFORGE.gen = {
    serial: () => pick(SERIAL_PATTERNS).replace(/[9@%]/g, (c) => pick(POOLS[c])),
    dob: () => date(2020, 2060),
    expiry: () => date(2077, 2092),
  };

  const EVENT_OUTLINE = [
    [100, 140], [170, 70], [430, 70], [455, 45], [745, 45], [770, 70], [1030, 70], [1100, 140],
    [1100, 570], [1060, 610], [1060, 1110], [1100, 1150], [1100, 1440], [1010, 1530],
    [770, 1530], [745, 1555], [455, 1555], [430, 1530], [190, 1530], [100, 1440],
    [100, 930], [140, 890], [140, 430], [100, 390],
  ];
  const EVENT_PORTRAIT = { box: { x: 250, y: 250, w: 600, h: 840 }, cut: 110, line: 18 };

  const ID_OUTLINE = [
    [60, 140], [130, 70], [980, 70], [1005, 45], [1295, 45], [1320, 70], [1470, 70], [1540, 140],
    [1540, 400], [1505, 435], [1505, 615], [1540, 650],
    // bottom edge: one straight line, corner to corner — the reference edge the MRZ reads along
    [1540, 940], [60, 940],
    [60, 690], [95, 655], [95, 385], [60, 350],
  ];
  // The citizen ID's content ends at y = 800 above the machine-readable zone, or
  // runs on to 878 (40 above the inner contour, as the photo sits 40 below the
  // issuer band) when the MRZ is off — the photo window grows to match.
  const ID_BOTTOM = { mrz: 800, full: 878 };
  // The box's left edge sits half a frame line (7) inside x = 150, so the frame's
  // outer edge lines up with the issuer band and the MRZ rule.
  const idPortrait = (b) => ({ box: { x: 157, y: 220, w: 413, h: b - 220 }, cut: 60, line: 14 });
  const ID_PORTRAIT = { mrz: idPortrait(ID_BOTTOM.mrz), full: idPortrait(ID_BOTTOM.full) };

  const blanks = {
    'event-badge': {
      w: 1200, h: 1600,
      outline: EVENT_OUTLINE,
      portrait: EVENT_PORTRAIT,
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'number', label: 'f_number', max: 16, gen: 'serial' },
        { id: 'role', label: 'f_role', max: 16 },
        { id: 'title', label: 'f_title', max: 4 },
        { id: 'name1', label: 'f_name1', max: 18 },
        { id: 'name2', label: 'f_name2', max: 18 },
        { id: 'footer', label: 'f_footer', max: 32 },
      ],
      names: { first: 'name1', last: 'name2', title: 'title' },
      decor: ['stripes', 'slashes', 'barcode', 'edge'],

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;

        // outer edge line (half of it falls outside the clip) + inner contour
        if (st.edge) {
          gfx.poly(ctx, EVENT_OUTLINE);
          ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.lineJoin = 'miter';
          ctx.stroke();
        }
        gfx.poly(ctx, gfx.inset(EVENT_OUTLINE, 24));
        ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
        ctx.stroke();

        // hazard stripes in the side recesses
        if (st.stripes) {
          gfx.stripes(ctx, 180, 214, 452, 868, ink, false);
          gfx.stripes(ctx, 990, 1024, 632, 1088, ink, true);
        }

        // badge number + slashes trailing it
        const numW = gfx.text(ctx, doc.number, 250, 214, { size: 60, maxW: 560, color: ink });
        if (st.slashes) {
          ctx.fillStyle = ink;
          let x = 250 + numW + 26;
          for (let i = 0; i < 3 && x < 760; i++, x += 28) gfx.slant(ctx, x, 168, 212, 14, 22);
          if (x < 800) gfx.slant(ctx, x + 6, 168, 212, 840 - x - 6 - 22, 22);
        }

        // photo, clipped to its window, then the portrait frame
        gfx.portrait(ctx, this.photo, k, st);

        // role tag: vertical, reads top to bottom, in the accent colour
        if (doc.role) {
          ctx.save();
          ctx.translate(918, 362);
          ctx.rotate(Math.PI / 2);
          gfx.fitFont(ctx, doc.role, 700, 100, 726, 0.04);
          ctx.fillStyle = st.accent;
          ctx.textBaseline = 'middle';
          ctx.textAlign = 'left';
          ctx.fillText(doc.role, 0, 4);
          ctx.restore();
          if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
        }

        // title (big) + two name lines beside it
        // The title spans the name block: its glyph tops line up with line 1's
        // cap height, its baseline with line 2's.
        const nameTop = 1210 - gfx.ascent(ctx, 'H', 700, 92);
        const titleSize = doc.title ? (1302 - nameTop) / (gfx.ascent(ctx, doc.title, 700, 100) / 100 || 0.7) : 0;
        const titleW = doc.title ? gfx.text(ctx, doc.title, 246, 1302, { size: titleSize, maxW: 380, color: ink }) : 0;
        const nx = titleW ? 246 + titleW + 30 : 250;
        const nameW = 1040 - nx;
        gfx.text(ctx, doc.name1, nx, 1210, { size: 92, maxW: nameW, color: ink });
        gfx.text(ctx, doc.name2, nx, 1302, { size: 92, maxW: nameW, color: ink });

        // footer line, rule, barcode (a 2D code is narrower: the rule runs on)
        const footMax = !st.barcode ? 790 : SINFORGE.codeSquare(st) ? 630 : 580;
        gfx.text(ctx, doc.footer, 252, 1392, { size: 44, maxW: footMax, color: ink, weight: 400, spacing: 0.06 });
        ctx.fillStyle = ink;
        ctx.fillRect(250, 1428, footMax - 30, 6);
        gfx.slant(ctx, 250 + footMax - 26, 1422, 1440, 30, 0);
        if (st.barcode) gfx.code(ctx, k, { x: 860, y: 1336, w: 160, h: 104 }, doc.number, st);
      },
    },

    // Horizontal citizen ID (CR80 proportions): issuer band on top, photo on
    // the left, labelled data fields on the right, machine-readable zone below.
    'citizen-id': {
      w: 1600, h: 1010,
      outline: ID_OUTLINE,
      // a getter: the window grows when the MRZ is off (render, framing drag and
      // the watermark hole all read it through `photo`)
      get portrait() { return SINFORGE.state.style.mrz ? ID_PORTRAIT.mrz : ID_PORTRAIT.full; },
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'issuer', label: 'f_issuer', max: 32 },
        { id: 'number', label: 'f_sin', max: 16, gen: 'serial' },
        { id: 'name1', label: 'f_given', max: 24 },
        { id: 'name2', label: 'f_surname', max: 18 },
        { id: 'sex', label: 'f_sex', max: 3 },
        { id: 'dob', label: 'f_dob', max: 10, gen: 'dob' },
        { id: 'expires', label: 'f_expires', max: 10, gen: 'expiry' },
        { id: 'district', label: 'f_district', max: 28 },
        { id: 'status', label: 'f_status', max: 24 },
      ],
      names: { first: 'name1', last: 'name2', sex: 'sex' },
      decor: ['stripes', 'slashes', 'barcode', 'edge', 'chip', 'mrz'],

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;
        // a small field caption over its value (captions are part of the printed
        // document, so they stay in English like the MRZ)
        // Laid out from the caption's cap top: caption, a tight CAP_GAP, then the
        // value's cap top — so each caption hugs its own value. The leftover
        // height is shared out evenly as the gap between rows (≈40 with the MRZ,
        // wider without it), so a row never reads as captioning the line above.
        const CAP = 22, CAP_GAP = 12, BIG = 76, VAL = 50, STATUS = 58, ROWS = 5;
        const bottom = st.mrz ? ID_BOTTOM.mrz : ID_BOTTOM.full;
        const capA = gfx.ascent(ctx, 'H', 400, CAP);
        const rowH = (size) => capA + CAP_GAP + gfx.ascent(ctx, 'H', 700, size);
        const statusTop = bottom - gfx.ascent(ctx, 'H', 700, STATUS);
        const ROW_GAP = (statusTop - 222 - rowH(BIG) - (ROWS - 1) * rowH(VAL)) / ROWS;
        const field = (cap, val, x, top, maxW, size) => {
          size = size || VAL;
          const capBase = top + capA;
          const valBase = top + rowH(size);
          gfx.text(ctx, cap, x, capBase, { size: CAP, maxW, color: ink, weight: 400, spacing: 0.14 });
          gfx.text(ctx, val, x, valBase, { size, maxW, color: ink });
          return valBase + ROW_GAP; // the next row's top
        };
        // A 2D barcode gets a square slot in the bottom-right corner, spanning
        // the DISTRICT and status rows (DISTRICT's top down to the status
        // baseline), flush with the issuer band's right edge — or clear of the
        // stripes when they run down beside it (no chip).
        const districtTop = 222 + rowH(BIG) + 3 * rowH(VAL) + 4 * ROW_GAP;
        const sq = st.barcode && SINFORGE.codeSquare(st);
        const sqSize = bottom - districtTop;
        const sqX = (st.stripes && !st.chip ? 1420 : 1450) - sqSize;
        const besideSq = sqX - 30 - 660; // text width left of it

        // outer edge line + inner contour
        if (st.edge) {
          gfx.poly(ctx, ID_OUTLINE);
          ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.lineJoin = 'miter';
          ctx.stroke();
        }
        gfx.poly(ctx, gfx.inset(ID_OUTLINE, 22));
        ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
        ctx.stroke();

        // issuer band: solid ink, the issuer in the card colour, slashes trailing it.
        // Its top sits 28 below the inner contour and both top corners clear the
        // contour's chamfers by the same ≈28, so it never touches the frame; its
        // top-left and bottom-right corners are notched with parallel "/" cuts.
        gfx.poly(ctx, [[180, 120], [1450, 120], [1450, 150], [1420, 180], [150, 180], [150, 150]]);
        ctx.fillStyle = ink;
        ctx.fill();
        const ISS = 42;
        const issBase = 150 + gfx.ascent(ctx, 'H', 700, ISS) / 2;
        const issW = gfx.text(ctx, doc.issuer, 180, issBase, { size: ISS, maxW: 1000, color: st.card, spacing: 0.04 });
        if (st.slashes) {
          ctx.fillStyle = st.card;
          let x = 180 + issW + 30;
          for (let i = 0; i < 3 && x < 1310; i++, x += 26) gfx.slant(ctx, x, 134, 166, 13, 16);
          if (x < 1340) gfx.slant(ctx, x + 6, 134, 166, 1380 - x - 6, 16);
        }

        // hazard stripes beside the photo and at the top right, under the end of
        // the issuer band (flush with its right edge); with no chip in the recess
        // the right run continues down to just above the barcode (or, with no
        // barcode, to the same end as the left run)
        const longStripes = st.stripes && !st.chip;
        if (st.stripes) {
          const end = !longStripes ? 390 : st.barcode ? (sq ? districtTop : statusTop) - 24 : bottom - 8;
          gfx.stripes(ctx, 596, 624, 230, bottom - 8, ink, false);
          gfx.stripes(ctx, 1422, 1450, 230, end, ink, true);
        }

        // photo, clipped to its window, then the portrait frame
        gfx.portrait(ctx, this.photo, k, st);

        // data fields
        const X = 660;
        let y = 222; // level with the photo window's top
        const topW = st.stripes ? 740 : 760; // the top two rows clear the stripes
        y = field('SURNAME', doc.name2, X, y, topW, BIG);
        y = field('GIVEN NAMES', doc.name1, X, y, topW);
        field('SEX', doc.sex, 1180, y, 150);
        y = field('SIN NO.', doc.number, X, y, 470);
        field('EXPIRES', doc.expires, 950, y, 270);
        y = field('DATE OF BIRTH', doc.dob, X, y, 270);
        y = field('DISTRICT', doc.district, X, y, sq ? besideSq : longStripes ? 740 : 760);

        // contact chip in the accent colour
        if (st.chip) {
          // in the right-hand recess: centred on it, 28 clear of its inner contour,
          // right of the SIN / EXPIRES columns and above DISTRICT in both layouts
          const cw = 160, ch = 160;
          const cx = 1295, cy = 445;
          gfx.poly(ctx, [[cx + 14, cy], [cx + cw, cy], [cx + cw, cy + ch - 14], [cx + cw - 14, cy + ch], [cx, cy + ch], [cx, cy + 14]]);
          ctx.fillStyle = st.accent;
          ctx.fill();
          ctx.strokeStyle = ink; ctx.lineWidth = 4;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy + ch / 3); ctx.lineTo(cx + 52, cy + ch / 3);
          ctx.moveTo(cx, cy + 2 * ch / 3); ctx.lineTo(cx + 52, cy + 2 * ch / 3);
          ctx.moveTo(cx + cw, cy + ch / 3); ctx.lineTo(cx + cw - 52, cy + ch / 3);
          ctx.moveTo(cx + cw, cy + 2 * ch / 3); ctx.lineTo(cx + cw - 52, cy + 2 * ch / 3);
          ctx.moveTo(cx + cw / 2, cy); ctx.lineTo(cx + cw / 2, cy + 30);
          ctx.moveTo(cx + cw / 2, cy + ch); ctx.lineTo(cx + cw / 2, cy + ch - 30);
          ctx.rect(cx + 52, cy + 30, cw - 104, ch - 60);
          ctx.stroke();
        }

        // status line in the accent colour, barcode beside it (or the 2D code)
        // (baseline level with the photo window's bottom)
        gfx.text(ctx, doc.status, X, bottom, { size: STATUS, maxW: sq ? besideSq : st.barcode ? 490 : 760, color: st.accent });
        if (sq) gfx.code(ctx, k, { x: sqX, y: districtTop, w: sqSize, h: sqSize }, doc.number, st);
        else if (st.barcode) gfx.code(ctx, k, { x: 1180, y: statusTop, w: 240, h: bottom - statusTop }, doc.number, st);

        // machine-readable zone: two fixed-pitch lines built from the fields
        if (st.mrz) {
          const norm = (s) => String(s || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '<');
          const clean = (s, n) => norm(s).padEnd(n, '<').slice(0, n);
          const sx = norm(doc.sex)[0] || '<';
          const l1 = clean('ID<' + clean(doc.number, 13) + clean(doc.dob, 10) + sx + clean(doc.expires, 10), 36);
          const l2 = clean(norm(doc.name2) + '<<' + norm(doc.name1), 36);
          ctx.fillRect(150, 818, 1300, 4);
          ctx.font = `400 38px ${SINFORGE.const.FONT}`;
          ctx.fillStyle = ink;
          ctx.textBaseline = 'alphabetic';
          ctx.textAlign = 'center';
          const step = 1300 / 36;
          [l1, l2].forEach((line, r) => {
            for (let i = 0; i < 36; i++) ctx.fillText(line[i], 150 + step * (i + 0.5), 864 + r * 42);
          });
          ctx.textAlign = 'left';
        }
      },
    },
  };

  SINFORGE.blanks = blanks;
  SINFORGE.blankOrder = ['event-badge', 'citizen-id'];
})(window.SINFORGE);
