(function (SINFORGE) {
  'use strict';
  // ---- Blank library: SINFORGE.blanks[key] = one pre-defined document.
  //   w, h      native size in px (the 1x export); 2x doubles it
  //   outline   card silhouette, a clockwise polygon — outside it the PNG is transparent
  //   photo     { poly, box }: the photo window (clip polygon + its bounding box,
  //             which the framing drag / zoom works in)
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
  SINFORGE.gen = {
    serial: () => pick(SERIAL_PATTERNS).replace(/[9@%]/g, (c) => pick(POOLS[c])),
  };

  const EVENT_OUTLINE = [
    [100, 140], [170, 70], [430, 70], [455, 45], [745, 45], [770, 70], [1030, 70], [1100, 140],
    [1100, 570], [1060, 610], [1060, 1110], [1100, 1150], [1100, 1440], [1010, 1530],
    [770, 1530], [745, 1555], [455, 1555], [430, 1530], [190, 1530], [100, 1440],
    [100, 930], [140, 890], [140, 430], [100, 390],
  ];
  const EVENT_PHOTO = [[250, 250], [740, 250], [850, 360], [850, 1090], [360, 1090], [250, 980]];

  const blanks = {
    'event-badge': {
      w: 1200, h: 1600,
      outline: EVENT_OUTLINE,
      photo: { poly: EVENT_PHOTO, box: { x: 250, y: 250, w: 600, h: 840 } },
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

        // photo, clipped to its window, then the window's frame
        const box = this.photo.box;
        const pic = gfx.photo(box, k);
        if (pic) {
          ctx.save();
          gfx.poly(ctx, EVENT_PHOTO);
          ctx.clip();
          ctx.drawImage(pic, box.x, box.y, box.w, box.h);
          ctx.restore();
        }
        gfx.poly(ctx, EVENT_PHOTO);
        ctx.strokeStyle = ink; ctx.lineWidth = 18; ctx.lineJoin = 'miter';
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.fillRect(520, 241, 200, 26);   // thick run on the top edge
        ctx.fillRect(380, 1073, 180, 26);  // and on the bottom edge
        ctx.fillRect(833, 520, 26, 160);   // and on the right edge

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

        // footer line, rule, barcode
        const footMax = st.barcode ? 580 : 790;
        gfx.text(ctx, doc.footer, 252, 1392, { size: 44, maxW: footMax, color: ink, weight: 400, spacing: 0.06 });
        ctx.fillStyle = ink;
        ctx.fillRect(250, 1428, footMax - 30, 6);
        gfx.slant(ctx, 250 + footMax - 26, 1422, 1440, 30, 0);
        if (st.barcode) gfx.barcode(ctx, 860, 1336, 160, 104, doc.number, ink);
      },
    },
  };

  SINFORGE.blanks = blanks;
  SINFORGE.blankOrder = ['event-badge'];
})(window.SINFORGE);
