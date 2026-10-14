(function (SINFORGE) {
  'use strict';
  // ---- Blank library: SINFORGE.blanks[key] = one pre-defined document.
  //   w, h      native size in px (the 1x export); 2x doubles it
  //   outline   card silhouette, a clockwise polygon — outside it the PNG is transparent
  //   holes     optional polygons punched out of it (a lanyard slot), transparent too
  //   portrait  { box, cut, line }: where the photo sits (its bounding box, which
  //             the framing drag / zoom works in), the frame's corner-cut size and
  //             line width; the window's shape comes from the selected portrait
  //             frame (js/frames.js)
  //   photo     getter: SINFORGE.frameWindow(this.portrait) — { box, poly, ... }
  //   texts     text slots, in panel order: { id (key in S.doc), label (i18n key), max,
  //             gen? (key in SINFORGE.gen — adds a GENERATE button beside the field),
  //             date? (a YYYY-MM-DD slot: draw it with gfx.date so it prints in
  //             the selected date format) }
  //   names     optional { first, last, title? }: slot ids the name generator
  //             fills — adds a GENERATE NAME row (+ its settings) after `last`
  //   decor     which decoration toggles apply (keys in S.style)
  //   mark      { ch, x, y, size }: the letter on the blank picker's icon, centred
  //             at (x, y) on the card body, clear of the photo
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
    metatype: () => {
      const all = ['HUMAN', 'ELF', 'DWARF', 'ORK', 'TROLL', 'GNOME', 'HOBGOBLIN', 'SATYR', 'SASQUATCH', 'NARTAKI'];
      return all[Math.floor(Math.random() * all.length)];
    },
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
  // issuer band) when the MRZ is off — the photo window grows to match. The DNA
  // strip, when on, takes the bottom DNA_H of that and the content ends DNA_GAP
  // above it.
  const ID_BOTTOM = { mrz: 800, full: 878 };
  const DNA_H = 32, DNA_GAP = 18;
  const idBase = (st) => (st.mrz ? ID_BOTTOM.mrz : ID_BOTTOM.full);
  const idBottom = (st) => idBase(st) - (st.dna ? DNA_H + DNA_GAP : 0);
  // The box's left edge sits half a frame line (7) inside x = 150, so the frame's
  // outer edge lines up with the issuer band and the MRZ rule.
  const idPortrait = (b) => ({ box: { x: 157, y: 220, w: 413, h: b - 220 }, cut: 60, line: 14 });

  const LIC_OUTLINE = [
    [60, 130], [140, 50], [1060, 50], [1090, 80], [1460, 80], [1540, 160],
    [1540, 560], [1515, 585], [1515, 745], [1540, 770],
    [1540, 880], [1460, 960], [640, 960], [610, 930], [140, 930], [60, 850],
  ];
  // The license card's photo ends above the barcode, or runs on down to the
  // license grid's bottom edge (LIC_BOTTOM) when the barcode is off.
  const LIC_BOTTOM = 884, LIC_CODE_TOP = 752;
  const licPortrait = (st) => ({
    box: { x: 157, y: 230, w: 380, h: (st.barcode ? LIC_CODE_TOP - 32 : LIC_BOTTOM) - 230 }, cut: 60, line: 14,
  });

  // Round-cornered cards (the operator ID, the access pass): SINFORGE.gfx is
  // defined by js/render.js, which loads before this file.
  const RR = (x, y, w, h, r) => SINFORGE.gfx.roundRect(x, y, w, h, r);
  const OP_OUTLINE = RR(40, 40, 1520, 930, 60);
  const OP_PORTRAIT = { box: { x: 100, y: 176, w: 420, h: 564 }, cut: 60, line: 14 };
  const PASS_OUTLINE = RR(40, 40, 920, 1520, 56);
  const PASS_SLOT = RR(370, 92, 260, 56, 28);
  // The access pass's photo grows by PASS_GROW when the code is off (the
  // sections spread out to fill the rest).
  const PASS_GROW = 200;
  const passPortrait = (st) => ({ box: { x: 100, y: 210, w: 380, h: 480 + (st.barcode ? 0 : PASS_GROW) }, cut: 56, line: 14 });

  // Right-aligned gfx.text: the right edge at x. Returns the drawn width.
  const rtext = (gfx, ctx, str, x, y, o) => {
    if (!str) return 0;
    gfx.fitFont(ctx, str, o.weight || 700, o.size, o.maxW || 1e9, o.spacing || 0);
    const w = ctx.measureText(str).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return gfx.text(ctx, str, x - w, y, o);
  };
  // Greedy word wrap at the current font: up to `max` lines no wider than maxW.
  const wrap = (ctx, str, maxW, max) => {
    const lines = [];
    let line = '';
    str.split(/\s+/).filter(Boolean).forEach((w) => {
      const t = line ? line + ' ' + w : w;
      if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = w; } else line = t;
    });
    if (line) lines.push(line);
    return lines.slice(0, max);
  };
  // Outer edge line + inner contour, shared by the round-cornered cards.
  const contour = (gfx, ctx, st, outline) => {
    if (st.edge) {
      gfx.poly(ctx, outline);
      ctx.strokeStyle = st.ink; ctx.lineWidth = 10; ctx.lineJoin = 'round';
      ctx.stroke();
    }
    gfx.poly(ctx, gfx.inset(outline, 22));
    ctx.strokeStyle = st.ink; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineJoin = 'miter';
  };

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
      mark: { ch: 'E', x: 600, y: 1310, size: 480 },

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
      // a getter: the window grows when the MRZ / DNA strip is off (render,
      // framing drag and the watermark hole all read it through `photo`)
      get portrait() { return idPortrait(idBottom(SINFORGE.state.style)); },
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'issuer', label: 'f_issuer', max: 32 },
        { id: 'number', label: 'f_sin', max: 16, gen: 'serial' },
        { id: 'name1', label: 'f_given', max: 24 },
        { id: 'name2', label: 'f_surname', max: 18 },
        { id: 'sex', label: 'f_sex', max: 3 },
        { id: 'metatype', label: 'f_metatype', max: 12, gen: 'metatype' },
        { id: 'dob', label: 'f_dob', max: 10, gen: 'dob', date: true },
        { id: 'expires', label: 'f_expires', max: 10, gen: 'expiry', date: true },
        { id: 'district', label: 'f_district', max: 28 },
        { id: 'status', label: 'f_status', max: 24 },
      ],
      names: { first: 'name1', last: 'name2', sex: 'sex' },
      decor: ['stripes', 'slashes', 'barcode', 'edge', 'chip', 'dna', 'mrz'],
      mark: { ch: 'C', x: 1040, y: 505, size: 660 },

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;
        // a small field caption over its value (captions are part of the printed
        // document, so they stay in English like the MRZ)
        // Laid out from the caption's cap top: caption, a tight CAP_GAP, then the
        // value's cap top — so each caption hugs its own value. The leftover
        // height is shared out evenly as the gap between rows (≈40 with the MRZ,
        // wider without it), so a row never reads as captioning the line above.
        const CAP = 22, CAP_GAP = 12, BIG = 76, VAL = 50, STATUS = 58, ROWS = 5;
        const bottom = idBottom(st);
        const capA = gfx.ascent(ctx, 'H', 400, CAP);
        const rowH = (size) => capA + CAP_GAP + gfx.ascent(ctx, 'H', 700, size);
        const statusTop = bottom - gfx.ascent(ctx, 'H', 700, STATUS);
        const ROW_GAP = (statusTop - 222 - rowH(BIG) - (ROWS - 1) * rowH(VAL)) / ROWS;
        // (isDate: the value prints in the selected date format — gfx.date)
        const field = (cap, val, x, top, maxW, size, isDate) => {
          size = size || VAL;
          const capBase = top + capA;
          const valBase = top + rowH(size);
          gfx.text(ctx, cap, x, capBase, { size: CAP, maxW, color: ink, weight: 400, spacing: 0.14 });
          (isDate ? gfx.date : gfx.text)(ctx, val, x, valBase, { size, maxW, color: ink }, st);
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
        field('METATYPE', doc.metatype, 1180, y, 240);
        y = field('GIVEN NAMES', doc.name1, X, y, 490);
        field('SEX', doc.sex, 1180, y, 150);
        y = field('SIN NO.', doc.number, X, y, 470);
        field('EXPIRES', doc.expires, 950, y, 270, VAL, true);
        y = field('DATE OF BIRTH', doc.dob, X, y, 270, VAL, true);
        y = field('DISTRICT', doc.district, X, y, sq ? besideSq : longStripes ? 740 : 760);

        // the chip (selected type, js/chips.js) in the accent colour, in the
        // right-hand recess: centred on it, 28 clear of its inner contour, right
        // of the SIN / EXPIRES columns and above DISTRICT in both layouts
        if (st.chip) gfx.chip(ctx, { x: 1295, y: 445, w: 160, h: 160 }, st);

        // status line in the accent colour, barcode beside it (or the 2D code)
        // (baseline level with the photo window's bottom)
        gfx.text(ctx, doc.status, X, bottom, { size: STATUS, maxW: sq ? besideSq : st.barcode ? 490 : 760, color: st.accent });
        if (sq) gfx.code(ctx, k, { x: sqX, y: districtTop, w: sqSize, h: sqSize }, doc.number, st);
        else if (st.barcode) gfx.code(ctx, k, { x: 1180, y: statusTop, w: 240, h: bottom - statusTop }, doc.number, st);

        // DNA strip above the machine-readable zone: a caption, then a double
        // helix — or, with dnaText (a click on the stage flips it), the plain
        // letter sequence. Both are seeded by the holder's fields, so every card
        // prints its own sequence (accent rungs / letters mark some bases).
        if (st.dna) {
          const top = idBase(st) - DNA_H, mid = top + DNA_H / 2;
          gfx.dnaBox = { x: 150, y: top, w: 1300, h: DNA_H };
          const r = gfx.rng(gfx.hash([doc.number, doc.name1, doc.name2, doc.dob, doc.metatype].join('|')));
          const capW = gfx.text(ctx, 'DNA', 150, mid + capA / 2, { size: CAP, maxW: 100, color: ink, weight: 400, spacing: 0.14 });
          const x0 = 150 + capW + 24, x1 = 1450, amp = DNA_H / 2 - 3;
          if (st.dnaText) {
            // fixed-pitch bases in groups of 6, one empty cell between groups
            const SEQ = 30, pitch = 21.5;
            ctx.font = `700 ${SEQ}px ${SINFORGE.const.FONT}`;
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'center';
            const base = mid + gfx.ascent(ctx, 'H', 700, SEQ) / 2;
            const n = Math.floor((x1 - x0) / pitch);
            const lead = x0 + (x1 - x0 - n * pitch) / 2; // centre the run in its span
            for (let i = 0; i < n; i++) {
              const b = 'ACGT'[Math.floor(r() * 4)], accent = r() < 0.12;
              if (i % 7 === 6) continue; // the gap after each group
              ctx.fillStyle = accent ? st.accent : ink;
              ctx.fillText(b, lead + pitch * (i + 0.5), base);
            }
            ctx.textAlign = 'left';
          } else {
            const P = 150, phase = r() * Math.PI * 2;
            const yAt = (x, s) => mid + s * amp * Math.sin((x - x0) / P * Math.PI * 2 + phase);
            // rungs: two half-bars per base pair, meeting in the middle
            for (let x = x0 + 6; x < x1 - 4; x += 13) {
              const ya = yAt(x, 1), yb = yAt(x, -1);
              if (Math.abs(ya - yb) < 6) continue;
              ctx.fillStyle = r() < 0.18 ? st.accent : ink;
              ctx.fillRect(x - 2, Math.min(ya, mid), 4, Math.abs(ya - mid));
              ctx.fillStyle = r() < 0.18 ? st.accent : ink;
              ctx.fillRect(x - 2, Math.min(yb, mid), 4, Math.abs(yb - mid));
            }
            // the two backbones
            ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            [1, -1].forEach((s) => {
              ctx.beginPath();
              for (let x = x0; x <= x1; x += 4) ctx[x === x0 ? 'moveTo' : 'lineTo'](x, yAt(x, s));
              ctx.stroke();
            });
            ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
          }
        }

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

    // Horizontal license card (CR80 proportions): issuer band on top, photo
    // (+ barcode under it) on the left, the holder's fields on the right over
    // a grid of license tiles — one per license (js/licenses.js), solid when
    // granted (S.doc.licenses), outlined and faded when not.
    license: {
      w: 1600, h: 1010,
      outline: LIC_OUTLINE,
      // a getter: the window grows when the barcode is off
      get portrait() { return licPortrait(SINFORGE.state.style); },
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'authority', label: 'f_authority', max: 32 },
        { id: 'licenseNo', label: 'f_licno', max: 16, gen: 'serial' },
        { id: 'name1', label: 'f_given', max: 24 },
        { id: 'name2', label: 'f_surname', max: 18 },
        { id: 'dob', label: 'f_dob', max: 10, gen: 'dob', date: true },
        { id: 'expires', label: 'f_expires', max: 10, gen: 'expiry', date: true },
      ],
      names: { first: 'name1', last: 'name2' },
      // the left panel adds a toggle per license (S.doc.licenses)
      licenses: true,
      decor: ['stripes', 'slashes', 'barcode', 'edge'],
      mark: { ch: 'L', x: 1030, y: 505, size: 660 },

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;
        const X = 620, R = 1450; // the right column's edges

        // outer edge line + inner contour
        if (st.edge) {
          gfx.poly(ctx, LIC_OUTLINE);
          ctx.strokeStyle = ink; ctx.lineWidth = 10; ctx.lineJoin = 'miter';
          ctx.stroke();
        }
        gfx.poly(ctx, gfx.inset(LIC_OUTLINE, 22));
        ctx.strokeStyle = ink; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
        ctx.stroke();

        // issuer band (as on the citizen ID), 28 clear of the contour's raised
        // right-hand part
        gfx.poly(ctx, [[180, 130], [R, 130], [R, 160], [R - 30, 190], [150, 190], [150, 160]]);
        ctx.fillStyle = ink;
        ctx.fill();
        const ISS = 42;
        const issBase = 160 + gfx.ascent(ctx, 'H', 700, ISS) / 2;
        const issW = gfx.text(ctx, doc.authority, 180, issBase, { size: ISS, maxW: 1000, color: st.card, spacing: 0.04 });
        if (st.slashes) {
          ctx.fillStyle = st.card;
          let x = 180 + issW + 30;
          for (let i = 0; i < 3 && x < 1310; i++, x += 26) gfx.slant(ctx, x, 144, 176, 13, 16);
          if (x < 1340) gfx.slant(ctx, x + 6, 144, 176, 1380 - x - 6, 16);
        }

        // hazard stripes between the photo column and the fields
        if (st.stripes) gfx.stripes(ctx, 564, 592, 230, LIC_BOTTOM, ink, false);

        // photo, clipped to its window, then the portrait frame
        gfx.portrait(ctx, this.photo, k, st);

        // barcode under the photo, encoding the license number (a 2D code
        // centred in the slot)
        if (st.barcode) {
          const h = LIC_BOTTOM - LIC_CODE_TOP;
          const box = SINFORGE.codeSquare(st)
            ? { x: 150 + (394 - h) / 2, y: LIC_CODE_TOP, w: h, h }
            : { x: 150, y: LIC_CODE_TOP, w: 394, h };
          gfx.code(ctx, k, box, doc.licenseNo, st);
        }

        // license grid: two rows of square tiles across the right column, the
        // bottom row level with the photo column's bottom
        const keys = SINFORGE.licenseOrder, COLS = Math.ceil(keys.length / 2), GAP = 14;
        const tw = (R - X - GAP * (COLS - 1)) / COLS;
        const gridTop = LIC_BOTTOM - 2 * tw - GAP;
        const granted = Array.isArray(doc.licenses) ? doc.licenses : [];
        keys.forEach((key, i) => {
          const box = { x: X + (i % COLS) * (tw + GAP), y: gridTop + Math.floor(i / COLS) * (tw + GAP), w: tw, h: tw };
          gfx.license(ctx, k, box, key, granted.includes(key), st);
        });

        // the grid's heading: a caption and a rule running on to the right edge,
        // with the granted count in the accent colour at its end
        const CAP = 22, CAP_GAP = 12, BIG = 72, VAL = 50;
        const capA = gfx.ascent(ctx, 'H', 400, CAP);
        const headBase = gridTop - 20;
        const headW = gfx.text(ctx, 'LICENSES', X, headBase, { size: CAP, color: ink, weight: 400, spacing: 0.14 });
        const count = `${granted.filter((g) => keys.includes(g)).length}/${keys.length}`;
        ctx.font = `700 ${CAP}px ${SINFORGE.const.FONT}`;
        const countW = ctx.measureText(count).width;
        gfx.text(ctx, count, R - countW, headBase, { size: CAP, color: st.accent });
        ctx.fillStyle = ink;
        ctx.fillRect(X + headW + 18, headBase - capA / 2 - 2, R - countW - 18 - (X + headW + 18), 4);

        // the holder's fields, laid out from the caption's cap top (as on the
        // citizen ID), the leftover height shared out as the gap between rows
        const rowH = (size) => capA + CAP_GAP + gfx.ascent(ctx, 'H', 700, size);
        const GAP_Y = (headBase - capA - 230 - rowH(BIG) - 2 * rowH(VAL)) / 3;
        const field = (cap, val, x, top, maxW, size, isDate) => {
          size = size || VAL;
          const valBase = top + rowH(size);
          gfx.text(ctx, cap, x, top + capA, { size: CAP, maxW, color: ink, weight: 400, spacing: 0.14 });
          (isDate ? gfx.date : gfx.text)(ctx, val, x, valBase, { size, maxW, color: ink }, st);
          return valBase + GAP_Y;
        };
        let y = 230; // level with the photo window's top
        y = field('SURNAME', doc.name2, X, y, R - X, BIG);
        field('DATE OF BIRTH', doc.dob, 1130, y, R - 1130, VAL, true);
        y = field('GIVEN NAMES', doc.name1, X, y, 480);
        field('EXPIRES', doc.expires, 1130, y, R - 1130, VAL, true);
        field('LICENSE NO.', doc.licenseNo, X, y, 480);
      },
    },

    // Horizontal operator ID (CR80 proportions, rounded corners): a dot-matrix
    // strip over the photo, call sign + position on the right, a status tick
    // box, the code + a hatched bar over the card type, and an inverted
    // organisation band along the bottom carrying the fine print. Everything
    // keeps 38 clear of the inner contour (x 100..1500, y 100..910).
    'operator-id': {
      w: 1600, h: 1010,
      outline: OP_OUTLINE,
      portrait: OP_PORTRAIT,
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'callsign', label: 'f_callsign', max: 16 },
        { id: 'position', label: 'f_position', max: 18 },
        { id: 'opStatus', label: 'f_opstatus', max: 40 },
        { id: 'number', label: 'f_idno', max: 16, gen: 'serial' },
        { id: 'cardType', label: 'f_cardtype', max: 24 },
        { id: 'org', label: 'f_org', max: 24 },
        { id: 'division', label: 'f_division', max: 32 },
      ],
      decor: ['stripes', 'slashes', 'barcode', 'edge'],
      mark: { ch: 'O', x: 1070, y: 450, size: 600 },

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;
        const X = 620, R = 1500;   // the right column's edges
        const TOP = 176, BOT = 740; // the photo's top / bottom: the right column spans them
        contour(gfx, ctx, st, OP_OUTLINE);

        // dot matrix over the photo: two rows of grouped dots, seeded by the
        // ID number (some of the second row dropped, the odd one in the accent)
        const r = gfx.rng(gfx.hash(String(doc.number) + '|' + doc.callsign));
        [110, 138].forEach((y) => {
          let x = 105;
          [6, 5, 4, 4].forEach((n) => {
            for (let i = 0; i < n; i++, x += 24) {
              if (y > 110 && r() < 0.3) continue;
              ctx.fillStyle = r() < 0.05 ? st.accent : ink;
              ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
            }
            x += 30;
          });
        });

        // photo, clipped to its window, then the portrait frame
        gfx.portrait(ctx, this.photo, k, st);

        // call sign + position, each under a caption (captions are part of the
        // printed document, so they stay in English), laid out from the
        // caption's cap top at the photo's top
        const CAP = 28, CAP_GAP = 18, ROW_GAP = 40;
        const capA = gfx.ascent(ctx, 'H', 400, CAP);
        const cap = (t, y) => gfx.text(ctx, t, X, y, { size: CAP, color: ink, weight: 400, spacing: 0.12 });
        let y = TOP + capA;
        cap('CALL SIGN', y);
        y += CAP_GAP + gfx.ascent(ctx, 'H', 700, 100);
        gfx.text(ctx, doc.callsign, X, y, { size: 100, maxW: R - X, color: ink, spacing: 0.02 });
        y += ROW_GAP + capA;
        cap('POSITION', y);
        y += CAP_GAP + gfx.ascent(ctx, 'H', 700, 76);
        gfx.text(ctx, doc.position, X, y, { size: 76, maxW: R - X, color: ink, spacing: 0.02 });
        const ruleY = y + 28;
        ctx.fillStyle = ink;
        ctx.fillRect(X, ruleY, R - X, 4);

        // status tick box (an accent cross) beside the status + ID lines
        const tb = ruleY + 28;
        ctx.strokeStyle = ink; ctx.lineWidth = 4;
        ctx.strokeRect(X + 2, tb, 40, 40);
        ctx.strokeStyle = st.accent; ctx.lineWidth = 5; ctx.lineCap = 'square';
        ctx.beginPath();
        ctx.moveTo(X + 11, tb + 9); ctx.lineTo(X + 33, tb + 31);
        ctx.moveTo(X + 33, tb + 9); ctx.lineTo(X + 11, tb + 31);
        ctx.stroke();
        ctx.lineCap = 'butt';
        const small = { size: 24, maxW: R - X - 66, color: ink, weight: 400, spacing: 0.08 };
        gfx.text(ctx, doc.opStatus, X + 66, tb + 16, small);
        gfx.text(ctx, doc.number ? 'ID ' + doc.number : '', X + 66, tb + 44, small);

        // the code at the bottom-left of the right column, its bottom level
        // with the photo's: a 2D code as a square filling the room under the
        // tick box, a linear one as a strip; the hatched bar + card type take
        // the rest of the row, right-aligned
        const sq = SINFORGE.codeSquare(st);
        const sqTop = tb + 40 + 40;
        let left = X;
        if (st.barcode) {
          const box = sq ? { x: X, y: sqTop, w: BOT - sqTop, h: BOT - sqTop } : { x: X, y: BOT - 92, w: 380, h: 92 };
          gfx.code(ctx, k, box, doc.number, st);
          left = box.x + box.w + 40;
        }
        if (st.slashes) {
          ctx.fillStyle = ink;
          for (let x = Math.max(left, R - 500); x + 14 <= R; x += 13) gfx.slant(ctx, x, BOT - 92, BOT - 64, 5, 9);
        }
        rtext(gfx, ctx, doc.cardType, R, BOT, { size: 50, maxW: R - left, color: ink, spacing: 0.04 });

        // organisation band: solid ink, stepped down at the right, the text in
        // the card colour; twin bars lead it when the stripes are on
        const B0 = 778, B1 = 910, STEP = B0 + 50;
        gfx.poly(ctx, [[100, B0], [900, B0], [950, STEP], [R, STEP], [R, B1], [100, B1]]);
        ctx.fillStyle = ink;
        ctx.fill();
        let tx = 130;
        if (st.stripes) {
          ctx.fillStyle = st.card;
          ctx.fillRect(124, B0 + 20, 10, B1 - B0 - 40);
          ctx.fillRect(144, B0 + 20, 10, B1 - B0 - 40);
          tx = 180;
        }
        gfx.text(ctx, doc.org, tx, B0 + 68, { size: 62, maxW: 880 - tx, color: st.card, spacing: 0.03 });
        gfx.text(ctx, doc.division, tx, B1 - 20, { size: 30, maxW: 880 - tx, color: st.card, weight: 400, spacing: 0.08 });
        // the fine print: three right-aligned lines in the band's step, shrunk
        // until the whole text fits them
        const org = String(doc.org || '').trim() || 'THE ISSUER';
        const fine = `THIS CREDENTIAL REMAINS THE PROPERTY OF ${org} AND MUST BE SURRENDERED UPON TERMINATION OF CONTRACT OR UPON REQUEST BY AUTHORIZED PERSONNEL`;
        let FINE = 17, lines;
        for (;; FINE--) {
          ctx.font = `400 ${FINE}px ${SINFORGE.const.FONT}`;
          lines = wrap(ctx, fine, R - 1000, 4);
          if (lines.length <= 3 || FINE <= 10) break;
        }
        lines.slice(0, 3).forEach((line, i) => rtext(gfx, ctx, line, R - 20, B1 - 64 + i * 22, { size: FINE, color: st.card, weight: 400 }));
      },
    },

    // Vertical hanging access pass (rounded corners, a lanyard slot punched
    // through the top): photo + the logo slot over the reference ID and
    // expiry, a big access level, two small fields, a rule, the holder's
    // handle and name, and the code with the issuer at the bottom.
    // Everything keeps 38 clear of the inner contour (x 100..900, y ..1500).
    'access-pass': {
      w: 1000, h: 1600,
      outline: PASS_OUTLINE,
      holes: [PASS_SLOT],
      // a getter: the window grows when the code is off
      get portrait() { return passPortrait(SINFORGE.state.style); },
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      texts: [
        { id: 'access', label: 'f_access', max: 16 },
        { id: 'number', label: 'f_refid', max: 16, gen: 'serial' },
        { id: 'expires', label: 'f_expires', max: 10, gen: 'expiry', date: true },
        { id: 'zone', label: 'f_zone', max: 28 },
        { id: 'division', label: 'f_division', max: 32 },
        { id: 'handle', label: 'f_handle', max: 24 },
        { id: 'name1', label: 'f_given', max: 24 },
        { id: 'name2', label: 'f_surname', max: 18 },
        { id: 'org', label: 'f_org', max: 24 },
      ],
      names: { first: 'name1', last: 'name2' },
      // the left panel adds the LOGO section (S.logo, drawn by gfx.logo)
      logo: true,
      decor: ['slashes', 'barcode', 'edge'],
      mark: { ch: 'A', x: 500, y: 1150, size: 560 },

      draw(ctx, k, { gfx, st, doc }) {
        const ink = st.ink;
        const X = 100, X2 = 540, R = 900, BOT = 1500;
        const P = this.portrait.box, PB = P.y + P.h; // the photo's bottom
        contour(gfx, ctx, st, PASS_OUTLINE);

        // the slot's rim (half of the line falls inside the hole, clipped away)
        gfx.poly(ctx, PASS_SLOT);
        ctx.strokeStyle = ink; ctx.lineWidth = 10;
        ctx.stroke();

        // photo, clipped to its window, then the portrait frame
        gfx.portrait(ctx, this.photo, k, st);

        // type scale: captions over values, laid out by cap heights
        const CAP = 24, CAP_GAP = 14;
        const capA = gfx.ascent(ctx, 'H', 400, CAP);
        const capH = (size, w) => gfx.ascent(ctx, 'H', w || 700, size);
        const cap = (t, x, y, maxW) => gfx.text(ctx, t, x, y, { size: CAP, maxW, color: ink, weight: 400, spacing: 0.12 });

        // reference ID + expiry beside the photo, the expiry level with its
        // bottom; the logo slot fills the room above them
        const VAL = 40, ROW_GAP = 22;
        const expBase = PB, expCap = expBase - capH(VAL) - CAP_GAP;
        const refBase = expCap - capA - ROW_GAP, refCap = refBase - capH(VAL) - CAP_GAP;
        cap('REFERENCE ID', X2, refCap, R - X2);
        gfx.text(ctx, doc.number, X2, refBase, { size: VAL, maxW: R - X2, color: ink, spacing: 0.04 });
        cap('VALID THRU', X2, expCap, R - X2);
        gfx.date(ctx, doc.expires, X2, expBase, { size: VAL, maxW: R - X2, color: ink, spacing: 0.04 }, st);
        gfx.logo(ctx, k, { x: X2, y: P.y, w: R - X2, h: refCap - capA - 40 - P.y }, st);

        // the gap between sections: 64, or with no code (the issuer row alone at
        // the bottom) whatever lands that row on the bottom margin
        const ORG = 40; // the issuer's size
        const rowH = capH(ORG) + 20 + capA; // the issuer row: issuer, caption
        const stack = capH(100) + 44 + capA + CAP_GAP + capH(30, 400) + 36 // access .. rule
          + 36 + capH(30, 400) + 18 + capH(100); // rule .. name
        const SEC = st.barcode ? 64 : (BOT - rowH - PB - stack) / 2;

        // access level, then two small fields and a rule
        let y = PB + SEC + capH(100);
        gfx.text(ctx, doc.access, X, y, { size: 100, maxW: R - X, color: ink, spacing: 0.04 });
        y += 44 + capA;
        cap('ZONE', X, y, X2 - X - 30);
        cap('DIVISION', X2, y, R - X2);
        y += CAP_GAP + capH(30, 400);
        const small = (t, x, maxW) => gfx.text(ctx, t, x, y, { size: 30, maxW, color: ink, weight: 400, spacing: 0.06 });
        small(doc.zone, X, X2 - X - 30);
        small(doc.division, X2, R - X2);
        y += 36;
        ctx.fillStyle = ink;
        ctx.fillRect(X, y, R - X, 3);

        // holder: the handle in the accent colour over the full name
        y += 36 + capH(30, 400);
        gfx.text(ctx, doc.handle, X, y, { size: 30, maxW: R - X, color: st.accent, weight: 400, spacing: 0.06 });
        y += 18 + capH(100);
        const name = [doc.name1, doc.name2].filter(Boolean).join(' ');
        gfx.text(ctx, name, X, y, { size: 100, maxW: R - X, color: ink, spacing: 0.04 });

        // the bottom: the issuer (+ a caption and the slashes) with the code.
        //   2D code   a square in the bottom-left corner, the issuer beside it
        //             at its top, the slashes level with its bottom
        //   linear    the issuer row across the top, the slashes trailing the
        //             caption, the barcode as a full-width strip under them
        //   no code   the issuer row anchored to the bottom
        const top = y + SEC;
        const sq = st.barcode && SINFORGE.codeSquare(st), lin = st.barcode && !sq;
        const SL = 30; // the slashes' height
        const slashes = (x, yb) => {
          if (!st.slashes) return;
          ctx.fillStyle = ink;
          for (let i = 0; i < 3; i++, x += 30) gfx.slant(ctx, x, yb - SL, yb, 14, 18);
          gfx.slant(ctx, x + 6, yb - SL, yb, R - x - 6 - 18, 18);
        };
        if (sq) {
          const s = BOT - top;
          gfx.code(ctx, k, { x: X, y: top, w: s, h: s }, doc.number, st);
          const ox = X + s + 50, orgBase = top + capH(ORG);
          gfx.text(ctx, doc.org, ox, orgBase, { size: ORG, maxW: R - ox, color: ink, spacing: 0.03 });
          cap('AUTHORIZED PERSONNEL ONLY', ox, orgBase + 20 + capA, R - ox);
          slashes(ox, BOT);
        } else {
          // the row: issuer, then the caption with the slashes beside it
          const rowTop = lin ? top : BOT - rowH;
          const orgBase = rowTop + capH(ORG), capBase = rowTop + rowH;
          gfx.text(ctx, doc.org, X, orgBase, { size: ORG, maxW: R - X, color: ink, spacing: 0.03 });
          const cw = cap('AUTHORIZED PERSONNEL ONLY', X, capBase, X2 - X - 40);
          slashes(Math.max(X2, X + cw + 40), capBase);
          if (lin) gfx.code(ctx, k, { x: X, y: capBase + 40, w: R - X, h: BOT - capBase - 40 }, doc.number, st);
        }
      },
    },
  };

  SINFORGE.blanks = blanks;
  SINFORGE.blankOrder = ['event-badge', 'citizen-id', 'license', 'operator-id', 'access-pass'];
})(window.SINFORGE);
