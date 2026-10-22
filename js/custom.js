(function (SINFORGE) {
  'use strict';
  // ---- Custom blanks (the CONSTRUCTOR tab). A custom blank is plain JSON, a
  // "def", kept in localStorage as sinforge:blanks = [def, ...]:
  //   { id, name, base, items: [item, ...] }
  //   base   a built-in blank key: the silhouette it borrows (outline, holes,
  //          native size); the inner contour + edge line follow it
  //   items  bottom first, each { id, type, x, y, w, h, ...type props } in the
  //          base's native px. Exactly one 'photo' (the portrait box).
  // SINFORGE.custom.build(def) makes a blank object shaped like js/blanks.js's,
  // registered as SINFORGE.blanks['custom:<id>'] (SINFORGE.customOrder lists
  // them after the built-ins). Text items are document fields: their values
  // live in S.doc.custom[item id]; captions are printed as typed. ----
  const PREFIX = 'custom:';

  // item types: their props' defaults and default size (fractions of the
  // card's shorter side, s; 'W' = of its width). `decor` = the style toggle
  // that shows / hides them (the DECOR panel lists it for this blank).
  const TYPES = {
    photo: { size: [0.4, 0.55] },
    text: { size: [0.5, 0.07], props: { cap: '', kind: 'text', weight: 700, color: 'ink', align: 'left' } },
    code: { size: [0.38, 0.1], decor: 'barcode' },
    chip: { size: [0.16, 0.16], decor: 'chip' },
    band: { size: ['W0.8', 0.06], props: { color: 'ink', shape: 'notch' } },
    rule: { size: [0.6, 0.005], props: { color: 'ink' } },
    stripes: { size: [0.03, 0.4], props: { color: 'ink', flip: false }, decor: 'stripes' },
    slashes: { size: [0.3, 0.035], props: { color: 'ink' }, decor: 'slashes' },
  };
  const ADDABLE = ['text', 'code', 'chip', 'band', 'rule', 'stripes', 'slashes'];
  // allowed values of the select-style props (anything else falls back to the default)
  const CHOICES = {
    kind: ['text', 'serial', 'date'],
    weight: [700, 400],
    color: ['ink', 'accent', 'card'],
    align: ['left', 'center', 'right'],
    shape: ['notch', 'rect'],
  };
  const MIN = 6; // smallest box side, native px (a rule may be thinner: 2)

  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const isKey = (key) => typeof key === 'string' && key.indexOf(PREFIX) === 0;
  const base = (def) => SINFORGE.blanks[def.base];

  // a fresh item of `type` on blank B, centred on the card
  function newItem(type, B) {
    const T = TYPES[type], s = Math.min(B.w, B.h);
    const dim = (v, full) => (typeof v === 'string' ? Number(v.slice(1)) * full : v * s);
    const w = Math.round(dim(T.size[0], B.w)), h = Math.max(type === 'rule' ? 4 : MIN, Math.round(dim(T.size[1], B.h)));
    return Object.assign({ id: uid('i'), type, x: Math.round((B.w - w) / 2), y: Math.round((B.h - h) / 2), w, h }, T.props || {});
  }

  // a new def on a built-in base: the base's photo box, a name line beside
  // (landscape) or under (portrait) it and an ID number line under that
  function newDef(baseKey, name) {
    const B = SINFORGE.blanks[baseKey];
    const P = B.portrait.box, s = Math.min(B.w, B.h);
    const photo = Object.assign(newItem('photo', B), { x: P.x, y: P.y, w: P.w, h: P.h });
    const lh = Math.round(s * 0.09);
    const land = B.w > B.h;
    const x = land ? P.x + P.w + 60 : P.x;
    const y = land ? P.y : P.y + P.h + 60;
    const w = land ? B.w - x - P.x : P.w;
    const nameIt = Object.assign(newItem('text', B), { x, y, w, h: lh, cap: 'NAME' });
    const noIt = Object.assign(newItem('text', B), { x, y: y + lh + 50, w: Math.round(w * 0.7), h: Math.round(lh * 0.75), cap: 'ID NO.', kind: 'serial' });
    return { id: uid('c'), name: name || 'CUSTOM', base: baseKey, items: [photo, nameIt, noIt] };
  }

  // a def from storage / a preset file, cleaned up (null when unusable):
  // known base and types, finite numbers kept on the card, allowed choices,
  // exactly one photo
  function sanitize(d) {
    if (!d || typeof d !== 'object' || typeof d.id !== 'string' || !d.id) return null;
    const B = SINFORGE.blanks[d.base];
    if (!B || isKey(d.base)) return null;
    const out = { id: d.id.slice(0, 40), name: String(d.name || 'CUSTOM').slice(0, 24), base: d.base, items: [] };
    let photo = false;
    (Array.isArray(d.items) ? d.items : []).forEach((it) => {
      if (!it || typeof it !== 'object' || !TYPES[it.type] || typeof it.id !== 'string') return;
      if (it.type === 'photo' && photo) return;
      const n = newItem(it.type, B);
      n.id = it.id.slice(0, 40);
      Object.keys(n).forEach((k) => {
        if (k === 'id' || k === 'type' || !(k in it) || typeof it[k] !== typeof n[k]) return;
        if (typeof n[k] === 'number' && !isFinite(it[k])) return;
        if (CHOICES[k] && !CHOICES[k].includes(it[k])) return;
        n[k] = typeof n[k] === 'string' ? it[k].slice(0, 32) : it[k];
      });
      fit(n, B);
      if (it.type === 'photo') photo = true;
      out.items.push(n);
    });
    if (!photo) {
      const P = B.portrait.box;
      out.items.unshift(Object.assign(newItem('photo', B), { x: P.x, y: P.y, w: P.w, h: P.h }));
    }
    return out;
  }

  // keep an item's box on the card (a base change may shrink it)
  function fit(it, B) {
    const min = it.type === 'rule' ? 2 : MIN;
    it.w = Math.round(Math.min(B.w, Math.max(min, it.w)));
    it.h = Math.round(Math.min(B.h, Math.max(min, it.h)));
    if (it.type === 'chip') it.w = it.h = Math.min(it.w, it.h);
    it.x = Math.round(Math.min(B.w - it.w, Math.max(0, it.x)));
    it.y = Math.round(Math.min(B.h - it.h, Math.max(0, it.y)));
  }

  // the item's colour key -> the style's colour
  const tone = (st, c) => (c === 'accent' ? st.accent : c === 'card' ? st.card : st.ink);

  // a text item: an optional caption (cap top at the box's top) over the value
  // (baseline at the box's bottom), its cap height filling the rest; shrunk to
  // the box's width, aligned in it. Date values print in the selected format.
  function drawText(ctx, gfx, it, st, val) {
    const cap = it.cap.trim(), color = tone(st, it.color);
    const capH = cap ? it.h * 0.28 : 0, gap = cap ? it.h * 0.12 : 0;
    const ratio = (w) => gfx.ascent(ctx, 'H', w, 100) / 100 || 0.7;
    const place = (str, weight, size, spacing) => {
      if (it.align === 'left') return it.x;
      gfx.fitFont(ctx, str, weight, size, it.w, spacing);
      const w = ctx.measureText(str).width;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      return it.align === 'right' ? it.x + it.w - w : it.x + (it.w - w) / 2;
    };
    if (cap) {
      const size = capH / ratio(400);
      gfx.text(ctx, cap, place(cap, 400, size, 0.14), it.y + capH, { size, maxW: it.w, color, weight: 400, spacing: 0.14 });
    }
    if (!val) return;
    const size = Math.max(4, (it.h - capH - gap) / ratio(it.weight));
    const o = { size, maxW: it.w, color, weight: it.weight, spacing: it.weight === 400 ? 0.06 : 0.02 };
    const shown = it.kind === 'date' ? SINFORGE.fmtDate(val, st.dateFmt) : val;
    const x = place(shown, it.weight, size, o.spacing);
    if (it.kind === 'date') gfx.date(ctx, val, x, it.y + it.h, o, st);
    else gfx.text(ctx, val, x, it.y + it.h, o);
  }

  // a run of slashes (the issuer band's): three short bars, then one long
  // one to the box's end, leaning right by half the height
  function drawSlashes(ctx, gfx, it, st) {
    const lean = it.h * 0.5, bw = it.h * 0.4, step = it.h * 0.8, end = it.x + it.w - lean;
    ctx.fillStyle = tone(st, it.color);
    let x = it.x;
    for (let i = 0; i < 3 && x + bw <= end; i++, x += step) gfx.slant(ctx, x, it.y, it.y + it.h, bw, lean);
    if (end - x > bw) gfx.slant(ctx, x + bw * 0.25, it.y, it.y + it.h, end - x - bw * 0.25, lean);
  }

  // hazard stripes: a column (taller than wide) or, turned a quarter, a row
  function drawStripes(ctx, gfx, it, st) {
    const color = tone(st, it.color);
    if (it.h >= it.w) { gfx.stripes(ctx, it.x, it.x + it.w, it.y, it.y + it.h, color, it.flip); return; }
    ctx.save();
    ctx.translate(it.x, it.y + it.h);
    ctx.rotate(-Math.PI / 2);
    gfx.stripes(ctx, 0, it.h, 0, it.w, color, it.flip);
    ctx.restore();
  }

  // the blank object for a def (see js/blanks.js for the fields)
  function build(def) {
    const B0 = base(def);
    const photoIt = () => def.items.find((it) => it.type === 'photo');
    const textIts = () => def.items.filter((it) => it.type === 'text');
    return {
      custom: def,
      w: B0.w, h: B0.h,
      outline: B0.outline,
      holes: B0.holes,
      get portrait() {
        const p = photoIt();
        return { box: { x: p.x, y: p.y, w: p.w, h: p.h }, cut: Math.round(Math.min(p.w, p.h) * 0.14), line: 14 };
      },
      get photo() { return SINFORGE.frameWindow(this.portrait); },
      // one field per text item, labelled by its caption (else the panel
      // calls it TEXT n: n = its place among the text items)
      get texts() {
        return textIts().map((it, i) => ({
          id: it.id, custom: true, text: it.cap.trim(), n: i + 1, max: 48,
          gen: it.kind === 'serial' ? 'serial' : it.kind === 'date' ? 'expiry' : undefined, date: it.kind === 'date',
        }));
      },
      // the edge line, plus the toggles of the item types it has
      get decor() {
        const d = ['edge'];
        def.items.forEach((it) => { const k = TYPES[it.type].decor; if (k && !d.includes(k)) d.push(k); });
        return d;
      },
      // the picker icon's letter: the name's first, centred in the widest
      // stretch of card beside / above / below the photo
      get mark() {
        const p = photoIt(), W = B0.w, H = B0.h;
        const sides = [
          { a: p.x * H, x: p.x / 2, y: H / 2, s: Math.min(p.x, H) },
          { a: (W - p.x - p.w) * H, x: (p.x + p.w + W) / 2, y: H / 2, s: Math.min(W - p.x - p.w, H) },
          { a: p.y * W, x: W / 2, y: p.y / 2, s: Math.min(p.y, W) },
          { a: (H - p.y - p.h) * W, x: W / 2, y: (p.y + p.h + H) / 2, s: Math.min(H - p.y - p.h, W) },
        ].sort((a, b) => b.a - a.a)[0];
        const ch = (def.name.trim()[0] || 'C').toUpperCase().replace(/[<>&"']/, 'C');
        return { ch, x: sides.x, y: sides.y, size: Math.max(60, sides.s * 0.7) };
      },
      draw(ctx, k, { gfx, st, doc }) {
        const vals = (doc.custom && typeof doc.custom === 'object') ? doc.custom : {};
        // outer edge line + inner contour (as on the built-ins)
        if (st.edge) {
          gfx.poly(ctx, B0.outline);
          ctx.strokeStyle = st.ink; ctx.lineWidth = 10; ctx.lineJoin = 'miter';
          ctx.stroke();
        }
        gfx.poly(ctx, gfx.inset(B0.outline, 22));
        ctx.strokeStyle = st.ink; ctx.lineWidth = 5; ctx.lineJoin = 'miter';
        ctx.stroke();
        // the barcode encodes the first NUMBER field (else the first text)
        const serial = textIts().find((it) => it.kind === 'serial') || textIts()[0];
        const seed = (serial && vals[serial.id]) || def.name;
        def.items.forEach((it) => {
          const dk = TYPES[it.type].decor;
          if (dk && !st[dk]) return;
          switch (it.type) {
            case 'photo': gfx.portrait(ctx, this.photo, k, st); break;
            case 'text': drawText(ctx, gfx, it, st, String(vals[it.id] || '')); break;
            case 'code': gfx.code(ctx, k, { x: it.x, y: it.y, w: it.w, h: it.h }, seed, st); break;
            case 'chip': gfx.chip(ctx, { x: it.x, y: it.y, w: it.w, h: it.h }, st); break;
            case 'band': {
              const n = it.shape === 'notch' ? Math.min(it.h / 2, it.w / 4) : 0;
              const { x, y, w, h } = it;
              gfx.poly(ctx, n ? [[x + n, y], [x + w, y], [x + w, y + h - n], [x + w - n, y + h], [x, y + h], [x, y + n]]
                : [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
              ctx.fillStyle = tone(st, it.color);
              ctx.fill();
              break;
            }
            case 'rule': ctx.fillStyle = tone(st, it.color); ctx.fillRect(it.x, it.y, it.w, it.h); break;
            case 'stripes': drawStripes(ctx, gfx, it, st); break;
            case 'slashes': drawSlashes(ctx, gfx, it, st); break;
          }
        });
      },
    };
  }

  // ---- the registry: SINFORGE.blanks['custom:<id>'] + SINFORGE.customOrder ----
  SINFORGE.customOrder = [];
  function register(def) {
    const key = PREFIX + def.id;
    SINFORGE.blanks[key] = build(def);
    if (!SINFORGE.customOrder.includes(key)) SINFORGE.customOrder.push(key);
    return key;
  }
  function unregister(key) {
    delete SINFORGE.blanks[key];
    SINFORGE.customOrder = SINFORGE.customOrder.filter((k) => k !== key);
  }
  const defs = () => SINFORGE.customOrder.map((k) => SINFORGE.blanks[k].custom);
  function persist() { SINFORGE.save('sinforge:blanks', JSON.stringify(defs())); }
  // the stored defs -> registered blanks (before restore() picks S.blank)
  function load() {
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem('sinforge:blanks') || 'null'); } catch (e) { saved = null; }
    (Array.isArray(saved) ? saved : []).forEach((d) => { const def = sanitize(d); if (def) register(def); });
  }

  SINFORGE.custom = {
    TYPES, ADDABLE, CHOICES, MIN, isKey, uid, newItem, newDef, sanitize, fit, build, register, unregister, defs, persist, load,
    key: (def) => PREFIX + def.id,
    def: (key) => (isKey(key) && SINFORGE.blanks[key] ? SINFORGE.blanks[key].custom : null),
  };
})(window.SINFORGE);
