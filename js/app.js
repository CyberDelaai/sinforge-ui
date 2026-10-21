// SINFORGE — main UI controller. Everything runs inside one IIFE and reads/writes
// the shared state via `const S = SINFORGE.state;`, organized in clearly-marked
// `// ---- section ----` blocks, the same convention the other cyberdeck.tools
// apps follow. Controls are bound declaratively: an element with
// `data-style="<key>"` edits S.style[key] (range / select / colour input, or a
// .side-switch for booleans); `data-val="<key>"` shows a value; `data-needs`
// greys a row out unless a condition holds ("glow", "photoFx=halftone",
// "photoFx!none") and `data-shows` hides it instead. A `.dial[data-style]` is
// a rotation wheel for an angle in degrees. Add a control by adding markup,
// not new wiring.
(function (SINFORGE) {
  'use strict';
  const $ = SINFORGE.$;
  const t = SINFORGE.t;
  const S = SINFORGE.state;
  const C = SINFORGE.const;
  const blank = () => SINFORGE.blanks[S.blank];

  // ---- helpers ----
  // Status messages pop up as a toast at the bottom centre (ported from
  // EIDOLON). kind: 'ok' | 'warn' | undefined (info). A new message replaces
  // the current one; warnings linger a little longer. An empty msg is ignored.
  function setStatus(msg, kind) {
    const el = $('toast');
    if (!el || !msg) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(setStatus.timer);
    setStatus.timer = setTimeout(() => el.classList.remove('show'), kind === 'warn' ? 3600 : 2200);
  }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---- persistence (sinforge:* keys; the photo itself lives in IndexedDB) ----
  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { return null; }
  }
  // Copy saved values over the defaults, key by key, only when the type matches —
  // stale or hand-edited storage can never put a wrong type into the state.
  function merge(target, saved) {
    if (!saved || typeof saved !== 'object') return;
    Object.keys(target).forEach((k) => {
      if (k in saved && typeof saved[k] === typeof target[k]) target[k] = saved[k];
    });
  }
  const persist = {
    doc: () => SINFORGE.save('sinforge:doc', JSON.stringify(S.doc)),
    style: () => SINFORGE.save('sinforge:style', JSON.stringify(S.style)),
    tf: () => SINFORGE.save('sinforge:tf', JSON.stringify(S.tf)),
    out: () => SINFORGE.save('sinforge:out', JSON.stringify(S.out)),
    names: () => SINFORGE.save('sinforge:names', JSON.stringify(S.names)),
    logos: () => SINFORGE.save('sinforge:logos', JSON.stringify(S.logos)),
  };
  function restore() {
    const b = (() => { try { return localStorage.getItem('sinforge:blank'); } catch (e) { return null; } })();
    if (b && SINFORGE.blanks[b]) S.blank = b;
    merge(S.doc, load('sinforge:doc'));
    merge(S.style, load('sinforge:style'));
    merge(S.tf, load('sinforge:tf'));
    merge(S.out, load('sinforge:out'));
    merge(S.names, load('sinforge:names'));
    sanitize();
    // logo layers: { blank: [layer…] }, each merged over a fresh one
    const logos = load('sinforge:logos');
    if (logos && typeof logos === 'object' && !Array.isArray(logos)) {
      Object.keys(logos).forEach((b) => {
        if (!SINFORGE.blanks[b] || !Array.isArray(logos[b])) return;
        S.logos[b] = logos[b].filter((L) => L && typeof L.id === 'string').map((L) => {
          const n = SINFORGE.newLogo(L.id);
          merge(n, L);
          return n;
        });
      });
    }
  }
  // Values merge() can't vet by type alone (storage or an imported preset):
  // unknown keys into the libraries, the license list / captions.
  function sanitize() {
    if (S.out.scale !== 1 && S.out.scale !== 2) S.out.scale = 1;
    if (!SINFORGE.frames[S.style.frame]) S.style.frame = 'notch';
    if (!SINFORGE.codes[S.style.code]) S.style.code = 'code128';
    if (!SINFORGE.chips[S.style.chipType]) S.style.chipType = 'contact';
    if (!SINFORGE.dateFormats[S.style.dateFmt]) S.style.dateFmt = 'iso';
    if (!Array.isArray(S.doc.licenses)) S.doc.licenses = SINFORGE.newDoc().licenses;
    S.doc.licenses = S.doc.licenses.filter((key) => SINFORGE.licenses[key]);
    if (!S.doc.licCaps || Array.isArray(S.doc.licCaps)) S.doc.licCaps = {};
    Object.keys(S.doc.licCaps).forEach((key) => {
      if (!SINFORGE.licenses[key] || typeof S.doc.licCaps[key] !== 'string') delete S.doc.licCaps[key];
    });
  }

  // ---- render scheduling: at most one preview render per frame ----
  let pending = false;
  function requestRender() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      const cv = $('docCanvas'), B = blank();
      if (cv.width !== B.w || cv.height !== B.h) { cv.width = B.w; cv.height = B.h; }
      SINFORGE.render(cv.getContext('2d'), 1);
      SINFORGE.digital.sync();
      syncLogoMark();
      markActivePreset(); // every edit renders: the matching preset lights up
    });
  }

  // ---- photo: user upload (kept in IndexedDB) or the bundled doggo ----
  let photoSeq = 0;
  function toSourceCanvas(img) {
    const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
    const f = Math.min(1, C.MAX_SOURCE / Math.max(w0, h0));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w0 * f));
    c.height = Math.max(1, Math.round(h0 * f));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    c.__id = ++photoSeq; // photo-layer cache key in render.js
    return c;
  }
  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }
  function blobToCanvas(blob) {
    const url = URL.createObjectURL(blob);
    return loadImage(url).then((img) => { URL.revokeObjectURL(url); return toSourceCanvas(img); },
      (e) => { URL.revokeObjectURL(url); throw e; });
  }
  function setPhoto(canvas, isUser) {
    S.photo = canvas;
    S.photoIsUser = isUser;
    requestRender();
    refreshPresets();
  }
  let doggo = null; // its source canvas, once loaded (also preset thumbnails without a photo)
  function useDoggo() {
    return (doggo ? Promise.resolve(doggo) : loadImage(C.DOGGO).then((img) => (doggo = toSourceCanvas(img))))
      .then((c) => setPhoto(c, false)).catch(() => {});
  }
  function loadUserPhoto(file) {
    if (!file || !/^image\//.test(file.type)) { setStatus(t('st_badimg'), 'warn'); return; }
    blobToCanvas(file).then((c) => {
      S.tf = SINFORGE.newTransform();
      persist.tf();
      setPhoto(c, true);
      syncControls();
      setStatus(t('st_photo'), 'ok');
      SINFORGE.idb.put('assets', 'photo', file).catch(() => {});
    }).catch(() => setStatus(t('st_badimg'), 'warn'));
  }
  function restorePhoto() {
    return SINFORGE.idb.get('assets', 'photo')
      .then((blob) => (blob ? blobToCanvas(blob).then((c) => setPhoto(c, true)) : useDoggo()))
      .catch(useDoggo);
  }

  // ---- watermark image (kept in IndexedDB as 'watermark') ----
  function loadWatermark(file) {
    if (!file || !/^image\//.test(file.type)) { setStatus(t('st_badimg'), 'warn'); return; }
    blobToCanvas(file).then((c) => {
      S.wmImage = c;
      if (S.style.wm !== 'image') { S.style.wm = 'image'; persist.style(); }
      syncControls();
      requestRender();
      setStatus(t('st_wm'), 'ok');
      SINFORGE.idb.put('assets', 'watermark', file).catch(() => {});
    }).catch(() => setStatus(t('st_badimg'), 'warn'));
  }
  // ---- logo layers: S.logos[blank] (bottom first), each upload in IndexedDB as
  // 'logo:<id>' (kept whole: the layer's crop is replayed on it). The left
  // panel lists the active blank's layers as thumbnails (a click selects one;
  // the selected one's settings show below them) ----
  const layers = () => S.logos[S.blank] || (S.logos[S.blank] = []);
  const selLayer = () => (S.logos[S.blank] || []).find((L) => L.id === S.logoSel) || null;
  const newLogoId = () => 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  // a new layer lands in the blank's logo spot (gfx.logoSpot, as last
  // rendered) or the card's centre, stepped aside off any layer already there
  function placeLogo(L) {
    const B = blank(), spot = SINFORGE.gfx.logoSpot;
    if (spot) {
      L.x = (spot.x + spot.w / 2) / B.w;
      L.y = (spot.y + spot.h / 2) / B.h;
      L.size = Math.min(spot.w, spot.h) / Math.min(B.w, B.h);
    }
    while (layers().some((o) => Math.abs(o.x - L.x) < 1e-3 && Math.abs(o.y - L.y) < 1e-3)) {
      L.x = Math.min(1, L.x + 0.03);
      L.y = Math.min(1, L.y + 0.03);
    }
  }
  // the layer's upload (S.logoSrc) cut to its crop -> S.logoImgs (what's drawn)
  const isWhole = (L) => !L.cx && !L.cy && L.cw === 1 && L.ch === 1;
  function setLogoImage(L, src) {
    if (src) S.logoSrc[L.id] = src;
    src = S.logoSrc[L.id];
    if (!src) return;
    let c = src;
    if (!isWhole(L)) {
      c = SINFORGE.crop.apply(src, { x: L.cx, y: L.cy, w: L.cw, h: L.ch });
      c.__id = ++photoSeq; // logo cache key in render.js
    }
    S.logoImgs[L.id] = c;
  }
  // CROP: the crop window over a layer's whole upload. A recrop starts from
  // its current crop, and the kept part stays where it was on the card, at
  // the same scale; a fresh upload (fresh) starts hugging its content, and
  // the kept part fills the layer's spot. Resolves once the window closes.
  function cropLogo(L, fresh) {
    const src = L && S.logoSrc[L.id];
    if (!src) return Promise.resolve();
    return SINFORGE.crop.open(src, {
      free: true, rect: fresh ? null : { x: L.cx, y: L.cy, w: L.cw, h: L.ch },
      title: 'h_croplogo', hint: 'hint_croplogo', fitTitle: 't_fitlogo',
    }).then((c) => {
      if (!c || !Object.values(S.logos).some((ls) => ls.includes(L))) return;
      const B = blank(), old = S.logoImgs[L.id], r0 = SINFORGE.gfx.logoRect(B, L, old);
      const ppx = r0.w / old.width; // card px per cropped-image px
      // the new crop's centre vs the old one's, in upload px -> card px
      const dx = ((c.crop.x + c.crop.w / 2) - (L.cx + L.cw / 2)) * src.width * ppx;
      const dy = ((c.crop.y + c.crop.h / 2) - (L.cy + L.ch / 2)) * src.height * ppx;
      Object.assign(L, { cx: c.crop.x, cy: c.crop.y, cw: c.crop.w, ch: c.crop.h });
      if (!fresh) {
        L.size = Math.min(1.5, Math.max(0.05, Math.max(c.width, c.height) * ppx / Math.min(B.w, B.h)));
        L.x += dx / B.w;
        L.y += dy / B.h;
      }
      if (isWhole(L)) S.logoImgs[L.id] = src;
      else { c.__id = ++photoSeq; S.logoImgs[L.id] = c; }
      persist.logos();
      buildLogoPick();
      requestRender();
    });
  }
  // each upload becomes a layer, then opens the crop window (several: one
  // after another; CANCEL keeps the whole image)
  function addLogos(files) {
    const imgs = [...(files || [])].filter((f) => /^image\//.test(f.type));
    if (!imgs.length) { setStatus(t('st_badimg'), 'warn'); return; }
    let queue = Promise.resolve();
    imgs.forEach((file) => blobToCanvas(file).then((c) => {
      const L = SINFORGE.newLogo(newLogoId());
      placeLogo(L);
      setLogoImage(L, c);
      layers().push(L);
      S.logoSel = L.id;
      persist.logos();
      buildLogoPick();
      requestRender();
      setStatus(t('st_logo'), 'ok');
      SINFORGE.idb.put('assets', 'logo:' + L.id, file).catch(() => {});
      queue = queue.then(() => cropLogo(L, true));
    }).catch(() => setStatus(t('st_badimg'), 'warn')));
  }
  function removeLogo(id) {
    Object.keys(S.logos).forEach((b) => { S.logos[b] = S.logos[b].filter((L) => L.id !== id); });
    delete S.logoImgs[id];
    delete S.logoSrc[id];
    if (S.logoSel === id) S.logoSel = null;
    SINFORGE.idb.del('assets', 'logo:' + id).catch(() => {});
    persist.logos();
    buildLogoPick();
    requestRender();
  }
  // restack the selected layer one step (dir +1 = forward, -1 = backward)
  function moveLogo(dir) {
    const ls = layers(), i = ls.findIndex((L) => L.id === S.logoSel), j = i + dir;
    if (i < 0 || j < 0 || j >= ls.length) return;
    [ls[i], ls[j]] = [ls[j], ls[i]];
    persist.logos();
    buildLogoPick();
    requestRender();
  }
  function selectLogo(id) {
    if (S.logoSel === id) return;
    S.logoSel = id;
    syncLogoEdit();
  }
  function restoreLogos() {
    Object.values(S.logos).forEach((ls) => ls.forEach((L) => {
      SINFORGE.idb.get('assets', 'logo:' + L.id).then((blob) => {
        if (!blob) { removeLogo(L.id); return; } // its image is gone
        return blobToCanvas(blob).then((c) => { setLogoImage(L, c); buildLogoPick(); requestRender(); });
      }).catch(() => {});
    }));
    // the one logo of the slot-based version (IndexedDB 'logo'): a layer where
    // the access pass's slot was
    SINFORGE.idb.get('assets', 'logo').then((blob) => {
      if (!blob) return;
      const L = Object.assign(SINFORGE.newLogo(newLogoId()), { x: 0.72, y: 0.225, size: 0.3 });
      return SINFORGE.idb.put('assets', 'logo:' + L.id, blob).then(() => {
        SINFORGE.idb.del('assets', 'logo').catch(() => {});
        return blobToCanvas(blob).then((c) => {
          setLogoImage(L, c);
          (S.logos['access-pass'] = S.logos['access-pass'] || []).push(L);
          persist.logos(); buildLogoPick(); requestRender();
        });
      });
    }).catch(() => {});
  }

  // the thumbnails (bottom first), from a small copy of each image
  function logoThumb(c) {
    if (!c.__thumb) {
      const f = Math.min(1, 96 / Math.max(c.width, c.height)), tc = document.createElement('canvas');
      tc.width = Math.max(1, Math.round(c.width * f));
      tc.height = Math.max(1, Math.round(c.height * f));
      tc.getContext('2d').drawImage(c, 0, 0, tc.width, tc.height);
      c.__thumb = tc.toDataURL();
    }
    return c.__thumb;
  }
  function buildLogoPick() {
    const box = $('logoPick');
    box.innerHTML = '';
    (S.logos[S.blank] || []).forEach((L, i) => {
      const c = S.logoImgs[L.id];
      if (!c) return;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt';
      btn.dataset.layer = L.id;
      btn.setAttribute('role', 'radio');
      btn.title = '#' + (i + 1);
      const img = document.createElement('img');
      img.src = logoThumb(c);
      img.alt = '#' + (i + 1);
      btn.appendChild(img);
      btn.onclick = () => selectLogo(S.logoSel === L.id ? null : L.id);
      // the pencil: selects the layer and opens the ELEMENT window on it
      const pen = document.createElement('button');
      pen.type = 'button';
      pen.className = 'lic-pen';
      pen.dataset.layer = L.id;
      pen.setAttribute('data-i18n-title', 'b_logoedit');
      pen.title = t('b_logoedit');
      pen.setAttribute('aria-label', t('b_logoedit'));
      pen.setAttribute('aria-haspopup', 'dialog');
      pen.setAttribute('aria-controls', 'logoPop');
      pen.innerHTML = PEN_SVG;
      pen.onclick = () => {
        const open = !$('logoPop').hidden && S.logoSel === L.id;
        selectLogo(L.id);
        setPopOpen(open ? null : $('logoPop'));
        syncLogoEdit();
      };
      // the trash: removes the layer straight from the strip
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'lic-pen lic-del';
      del.setAttribute('data-i18n-title', 'b_logodel');
      del.title = t('b_logodel');
      del.setAttribute('aria-label', t('b_logodel'));
      del.innerHTML = TRASH_SVG;
      del.onclick = () => removeLogo(L.id);
      const cell = document.createElement('div');
      cell.className = 'logo-cell';
      cell.append(btn, pen, del);
      box.appendChild(cell);
    });
    if (S.logoSel && !selLayer()) S.logoSel = null;
    syncLogoEdit();
  }
  // the selected layer's settings: [data-logo="<key>"] edits it (size in %),
  // [data-logo-val] shows a value, [data-logo-needs] greys a row out
  function syncLogoEdit() {
    const L = selLayer();
    $('logoPick').querySelectorAll('.blank-opt').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.layer === S.logoSel)));
    // the ELEMENT window follows the selection; nothing selected closes it
    if (!L && !$('logoPop').hidden) setPopOpen(null);
    $('logoPick').querySelectorAll('.lic-pen').forEach((p) => p.classList.toggle('active', !$('logoPop').hidden && p.dataset.layer === S.logoSel));
    syncLogoMark();
    if (!L) return;
    $('logoPopNo').textContent = '#' + (layers().indexOf(L) + 1);
    const val = (key) => (key === 'size' ? Math.round(L.size * 100) : L[key]);
    $('logoEdit').querySelectorAll('[data-logo]').forEach((el) => {
      const v = val(el.dataset.logo);
      if (el.classList.contains('side-switch')) el.dataset.pos = v ? 'right' : 'left';
      else if (el.value !== String(v)) el.value = v;
    });
    $('logoEdit').querySelectorAll('[data-logo-val]').forEach((el) => {
      el.textContent = val(el.dataset.logoVal) + (el.dataset.logoVal === 'size' ? '%' : '');
    });
    $('logoEdit').querySelectorAll('[data-logo-needs]').forEach((el) => el.classList.toggle('disabled', !L[el.dataset.logoNeeds]));
    const i = layers().indexOf(L);
    $('logoUpBtn').disabled = i === layers().length - 1;
    $('logoDownBtn').disabled = i === 0;
  }
  function bindLogos() {
    $('logoAddBtn').addEventListener('click', () => $('logoFileInput').click());
    $('logoFileInput').addEventListener('change', (e) => { addLogos(e.target.files); e.target.value = ''; });
    $('logoEdit').querySelectorAll('[data-logo]').forEach((el) => {
      const key = el.dataset.logo;
      const set = (v) => {
        const L = selLayer();
        if (!L) return;
        L[key] = v;
        persist.logos(); syncLogoEdit(); requestRender();
      };
      if (el.classList.contains('side-switch')) el.addEventListener('click', () => { const L = selLayer(); if (L) set(!L[key]); });
      else el.addEventListener('input', () => set(key === 'size' ? Number(el.value) / 100 : Number(el.value)));
    });
    $('logoCropBtn').addEventListener('click', () => cropLogo(selLayer()));
    $('logoUpBtn').addEventListener('click', () => moveLogo(1));
    $('logoDownBtn').addEventListener('click', () => moveLogo(-1));
    $('logoCenterBtn').addEventListener('click', () => {
      const L = selLayer();
      if (!L) return;
      L.x = L.y = 0.5;
      persist.logos(); requestRender();
    });
    // Delete / Backspace removes the selected layer, Escape lets go of it
    // (not while typing in a field)
    document.addEventListener('keydown', (e) => {
      if (!S.logoSel || !$('cropModal').hidden || (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeLogo(S.logoSel); }
      else if (e.key === 'Escape') selectLogo(null);
    });
    window.addEventListener('resize', syncLogoMark);
  }
  function restoreWatermark() {
    return SINFORGE.idb.get('assets', 'watermark')
      .then((blob) => blob && blobToCanvas(blob).then((c) => { S.wmImage = c; requestRender(); }))
      .catch(() => {});
  }

  // ---- left panel: blank picker + text slots built from the blank ----
  // each blank is an icon of its own silhouette (outline + solid photo window
  // + its `mark` letter on the body), drawn from its polygons in native pixel
  // space; the name is the tooltip
  function blankIcon(B) {
    const pts = (poly) => poly.map((p) => p.map((v) => +v.toFixed(1)).join(',')).join(' ');
    const pad = Math.max(B.w, B.h) * 0.02;
    const m = B.mark;
    return `<svg viewBox="${-pad} ${-pad} ${B.w + 2 * pad} ${B.h + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`
      + `<path class="bi-card" fill-rule="evenodd" d="${[B.outline].concat(B.holes || []).map((h) => 'M' + pts(h) + 'Z').join('')}"/>`
      + `<polygon class="bi-photo" points="${pts(B.photo.poly)}"/>`
      + (m ? `<text class="bi-letter" x="${m.x}" y="${m.y}" font-size="${m.size}" text-anchor="middle" dominant-baseline="central">${m.ch}</text>` : '')
      + '</svg>';
  }
  function buildBlankSelect() {
    const box = $('blankPick');
    box.innerHTML = '';
    SINFORGE.blankOrder.forEach((key) => {
      const k = 'bl_' + key.replace(/-/g, '_');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt';
      btn.dataset.blank = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-i18n-title', k);
      btn.title = t(k);
      btn.innerHTML = blankIcon(SINFORGE.blanks[key]);
      btn.onclick = () => {
        if (S.blank === key) return;
        S.blank = key;
        S.logoSel = null;
        SINFORGE.save('sinforge:blank', S.blank);
        syncBlankPick();
        buildTextFields();
        syncControls();
        requestRender();
      };
      box.appendChild(btn);
    });
    syncBlankPick();
  }
  function syncBlankPick() {
    $('blankPick').querySelectorAll('.blank-opt').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.blank === S.blank));
    });
  }

  // ---- portrait frame picker: one icon per frame, drawn on the active blank's
  // photo box (so the icons share its proportions); the name is the tooltip ----
  function frameIcon(key) {
    const win = SINFORGE.frameWindow(blank().portrait, key);
    const pts = (poly) => poly.map((p) => p.map((v) => +v.toFixed(1)).join(',')).join(' ');
    const { x, y, w, h } = win.box, pad = blank().portrait.line * 1.5;
    const sw = win.line < blank().portrait.line ? 1 : 2; // thin-lined frames stay thin
    return `<svg viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">`
      + `<polygon class="bi-frame" style="stroke-width:${sw}px" vector-effect="non-scaling-stroke" points="${pts(win.poly)}"/>`
      + win.marks.map((m) => `<polygon class="bi-mark" points="${pts(m)}"/>`).join('')
      + win.accent.map((m) => `<polygon class="bi-accent" points="${pts(m)}"/>`).join('')
      + '</svg>';
  }
  function buildFramePick() {
    const box = $('framePick');
    box.innerHTML = '';
    SINFORGE.frameOrder.forEach((key) => {
      const k = 'pf_' + key;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt';
      btn.dataset.frame = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-i18n-title', k);
      btn.title = t(k);
      btn.onclick = () => {
        if (S.style.frame === key) return;
        S.style.frame = key;
        persist.style();
        syncControls();
        requestRender();
      };
      box.appendChild(btn);
    });
  }

  // ---- barcode picker: one icon per code, drawn from the code's own geometry
  // (a fixed seed, so the icons never change); the name is the tooltip ----
  function codeIcon(key) {
    const def = SINFORGE.codes[key];
    const box = def.square ? { x: 10, y: 10, w: 80, h: 80 } : { x: 0, y: 20, w: 100, h: 60 };
    const f = (v) => +v.toFixed(2);
    return '<svg viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">'
      + def.shapes(box, 'SIN-0304-7731').map((sh) => {
        const cls = sh.accent ? 'bi-accent' : 'bi-mark';
        if (sh.r) return `<rect class="${cls}" x="${f(sh.r[0])}" y="${f(sh.r[1])}" width="${f(sh.r[2])}" height="${f(sh.r[3])}"/>`;
        if (sh.c) return `<circle class="${cls}" cx="${f(sh.c[0])}" cy="${f(sh.c[1])}" r="${f(sh.c[2])}"/>`;
        return '';
      }).join('') + '</svg>';
  }
  function buildCodePick() {
    const box = $('codePick');
    box.innerHTML = '';
    SINFORGE.codeOrder.forEach((key) => {
      const k = 'bc_' + key;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt';
      btn.dataset.code = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-i18n-title', k);
      btn.title = t(k);
      btn.innerHTML = codeIcon(key);
      btn.onclick = () => {
        if (S.style.code === key) return;
        S.style.code = key;
        persist.style();
        syncControls();
        requestRender();
      };
      box.appendChild(btn);
    });
  }

  // ---- chip picker: one icon per chip, drawn from the chip's own geometry;
  // the name is the tooltip ----
  function chipIcon(key) {
    const f = (v) => +v.toFixed(2);
    const pts = (a) => a.map((p) => p.map(f).join(',')).join(' ');
    return '<svg viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
      + SINFORGE.chips[key].shapes({ x: 0, y: 0, w: 100, h: 100 }).map((sh) => {
        const cls = [sh.fill === 'accent' ? 'bi-chip' : sh.fill === 'ink' ? 'bi-mark' : 'bi-none',
          sh.l || sh.stroke ? 'bi-line' : ''].join(' ');
        if (sh.c) return `<circle class="${cls}" vector-effect="non-scaling-stroke" cx="${f(sh.c[0])}" cy="${f(sh.c[1])}" r="${f(sh.c[2])}"/>`;
        return `<${sh.p ? 'polygon' : 'polyline'} class="${cls}" vector-effect="non-scaling-stroke" points="${pts(sh.p || sh.l)}"/>`;
      }).join('') + '</svg>';
  }
  function buildChipPick() {
    const box = $('chipPick');
    box.innerHTML = '';
    SINFORGE.chipOrder.forEach((key) => {
      const k = 'ch_' + key;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt';
      btn.dataset.chip = key;
      btn.setAttribute('role', 'radio');
      btn.setAttribute('data-i18n-title', k);
      btn.title = t(k);
      btn.innerHTML = chipIcon(key);
      btn.onclick = () => {
        if (S.style.chipType === key) return;
        S.style.chipType = key;
        persist.style();
        syncControls();
        requestRender();
      };
      box.appendChild(btn);
    });
  }

  // ---- date format picker: one option per format, showing a sample date in
  // it (a fixed date, so the options never change) ----
  function buildDatePick() {
    const box = $('datePick');
    box.innerHTML = '';
    SINFORGE.dateOrder.forEach((key) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt date-opt';
      btn.dataset.date = key;
      btn.setAttribute('role', 'radio');
      btn.textContent = SINFORGE.dateFormats[key]({ y: 2077, m: 10, d: 31 });
      btn.onclick = () => {
        if (S.style.dateFmt === key) return;
        S.style.dateFmt = key;
        persist.style();
        syncControls();
        requestRender();
      };
      box.appendChild(btn);
    });
  }

  // Icons follow the geometry: frame icons the active blank's photo box, blank
  // icons the selected frame — redrawn only when one of those changed.
  let iconSig = '';
  function syncPickers() {
    const b = blank().portrait.box;
    const sig = [S.blank, S.style.frame, b.x, b.y, b.w, b.h].join('|');
    if (sig !== iconSig) {
      iconSig = sig;
      $('framePick').querySelectorAll('.blank-opt').forEach((btn) => { btn.innerHTML = frameIcon(btn.dataset.frame); });
      $('blankPick').querySelectorAll('.blank-opt').forEach((btn) => { btn.innerHTML = blankIcon(SINFORGE.blanks[btn.dataset.blank]); });
    }
    $('framePick').querySelectorAll('.blank-opt').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.frame === S.style.frame));
    });
    const code = SINFORGE.codes[S.style.code] ? S.style.code : 'code128';
    $('codePick').querySelectorAll('.blank-opt').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.code === code));
    });
    const chip = SINFORGE.chips[S.style.chipType] ? S.style.chipType : 'contact';
    $('chipPick').querySelectorAll('.blank-opt').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.chip === chip));
    });
    const fmt = SINFORGE.dateFormats[S.style.dateFmt] ? S.style.dateFmt : 'iso';
    $('datePick').querySelectorAll('.date-opt').forEach((btn) => {
      btn.setAttribute('aria-checked', String(btn.dataset.date === fmt));
    });
  }
  const DIE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
    + '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/>'
    + '<g fill="currentColor" stroke="none"><circle cx="8.5" cy="8.5" r="1.6"/><circle cx="15.5" cy="8.5" r="1.6"/>'
    + '<circle cx="12" cy="12" r="1.6"/><circle cx="8.5" cy="15.5" r="1.6"/><circle cx="15.5" cy="15.5" r="1.6"/></g></svg>';
  function buildTextFields() {
    const box = $('textFields');
    box.innerHTML = '';
    blank().texts.forEach((slot) => {
      const f = document.createElement('div');
      f.className = 'field';
      const id = 'txt_' + slot.id;
      const lab = document.createElement('label');
      lab.htmlFor = id;
      lab.textContent = t(slot.label);
      lab.setAttribute('data-i18n', slot.label);
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = id;
      inp.maxLength = slot.max;
      inp.spellcheck = false;
      inp.value = S.doc[slot.id] || '';
      if (slot.date) inp.placeholder = 'YYYY-MM-DD';
      inp.addEventListener('input', () => {
        S.doc[slot.id] = inp.value;
        persist.doc();
        requestRender();
      });
      f.append(lab);
      if (slot.gen && SINFORGE.gen[slot.gen]) {
        // field + GENERATE button (a die) side by side
        const row = document.createElement('div');
        row.className = 'field-row';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-icon';
        btn.setAttribute('data-augmented-ui', 'tl-clip br-clip border');
        btn.setAttribute('data-i18n-title', 'b_gen');
        btn.title = t('b_gen');
        btn.setAttribute('aria-label', t('b_gen'));
        btn.innerHTML = DIE_SVG;
        btn.addEventListener('click', () => {
          inp.value = SINFORGE.gen[slot.gen]().slice(0, slot.max);
          inp.dispatchEvent(new Event('input'));
        });
        row.append(inp, btn);
        f.append(row);
      } else {
        f.append(inp);
      }
      box.appendChild(f);
      if (blank().names && slot.id === blank().names.last) box.appendChild(buildNameGen());
    });
    if (blank().licenses) box.appendChild(buildLicensePick());
    buildLogoPick();
  }

  // ---- license toggles (a blank with `licenses: true`): one icon per license,
  // drawn from its own geometry (or the custom icon); pressed = granted
  // (S.doc.licenses). Hovering one shows its edit button, which opens the
  // editor window (#licModal): a custom caption (S.doc.licCaps) and icon ----
  const PEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M13.5 6.5l4 4"/></svg>';
  // reset: a counter-clockwise arrow (back to the built-in icon + caption)
  const RESET_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M5.5 9A7.5 7.5 0 1 1 4.5 14"/><path d="M4 4v5.5h5.5"/></svg>';
  // trash: removes an element layer
  const TRASH_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M4 6h16M9 6V3.5h6V6M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
  const isCustomLicense = (key) => !!(S.doc.licCaps[key] || S.licIcons[key]);
  function licenseIcon(key) {
    const mask = S.licIcons[key];
    if (mask) {
      const url = mask.__url || (mask.__url = mask.toDataURL());
      return `<span class="li-img" aria-hidden="true" style="-webkit-mask-image:url(${url});mask-image:url(${url})"></span>`;
    }
    return '<svg viewBox="-4 -4 108 108" preserveAspectRatio="xMidYMid meet" aria-hidden="true">'
      + licenseShapes(key) + '</svg>';
  }
  // a license's built-in geometry as SVG markup in its 0..100 square
  function licenseShapes(key) {
    const f = (v) => +v.toFixed(2);
    return SINFORGE.licenses[key].shapes().map((sh) => {
        const cls = sh.cut ? 'li-cut' : 'li-ink';
        if (sh.c) return `<circle class="${cls}" cx="${f(sh.c[0])}" cy="${f(sh.c[1])}" r="${f(sh.c[2])}"/>`;
        if (sh.ring) return `<circle class="${cls} li-stroke" style="stroke-width:${sh.w || 6}" cx="${f(sh.ring[0])}" cy="${f(sh.ring[1])}" r="${f(sh.ring[2])}"/>`;
        const pts = (sh.p || sh.l).map((p) => p.map(f).join(',')).join(' ');
        if (sh.p) return `<polygon class="${cls}" points="${pts}"/>`;
        return `<polyline class="${cls} li-stroke" style="stroke-width:${sh.w || 6}" points="${pts}"/>`;
      }).join('');
  }
  function toggleLicense(key) {
    const L = S.doc.licenses, i = L.indexOf(key);
    if (i < 0) L.push(key); else L.splice(i, 1);
    persist.doc();
    syncLicensePick();
    requestRender();
  }

  // A custom icon as a one-colour alpha mask (longest edge `max`; see gfx.mask)
  function iconMask(src, max) {
    const f = Math.min(1, max / Math.max(src.width, src.height));
    const c = SINFORGE.gfx.mask(src, Math.max(1, Math.round(src.width * f)), Math.max(1, Math.round(src.height * f)));
    c.__id = ++photoSeq; // icon cache key in render.js
    return c;
  }
  function setLicenseIcon(key, file) {
    if (!file || !/^image\//.test(file.type)) { setStatus(t('st_badimg'), 'warn'); return; }
    // masked first (so a frame running past the picture adds transparent room,
    // never background), then cropped to a square in the crop window; the
    // cropped mask is what's kept
    blobToCanvas(file).then((c) => SINFORGE.crop.open(iconMask(c, 1024), { guide: licenseShapes(key), fit: 0.88, out: 256 }))
      .then((m) => {
        if (!m) return;
        m.__id = ++photoSeq; // icon cache key in render.js
        S.licIcons[key] = m;
        refreshLicense(key);
        setStatus(t('st_licicon'), 'ok');
        m.toBlob((blob) => { if (blob) SINFORGE.idb.put('assets', 'lic:' + key, blob).catch(() => {}); }, 'image/png');
      }, () => setStatus(t('st_badimg'), 'warn'));
  }
  function resetLicense(key) {
    delete S.licIcons[key];
    delete S.doc.licCaps[key];
    persist.doc();
    SINFORGE.idb.del('assets', 'lic:' + key).catch(() => {});
    if (licEdit === key) $('licCap').value = '';
    refreshLicense(key);
  }
  function restoreLicenseIcons() {
    SINFORGE.licenseOrder.forEach((key) => {
      SINFORGE.idb.get('assets', 'lic:' + key)
        // stored already masked + cropped: used as it is
        .then((blob) => blob && blobToCanvas(blob).then((c) => { S.licIcons[key] = c; refreshLicense(key); }))
        .catch(() => {});
    });
  }
  // redraw one toggle's icon (+ tooltip), the editor's preview and the card after an edit
  function refreshLicense(key) {
    const btn = document.querySelector(`.lic-opt[data-license="${key}"]`);
    if (btn) btn.innerHTML = licenseIcon(key);
    if (licEdit === key) syncLicPreview();
    syncLicensePick();
    requestRender();
  }

  // ---- license editor window: one license at a time, opened by a toggle's
  // pencil or the stage's; edits apply live. While it's open a dropped /
  // pasted image becomes that license's icon ----
  let licEdit = null; // the license key the editor is open on
  let licOpener = null; // the pencil that opened it (focus returns there)
  function syncLicPreview() {
    const key = licEdit;
    const pv = $('licPreview');
    pv.innerHTML = licenseIcon(key);
    pv.classList.toggle('on', S.doc.licenses.includes(key));
    $('licName').textContent = S.doc.licCaps[key] || SINFORGE.licenses[key].cap;
  }
  function openLicEdit(key, opener) {
    if (!SINFORGE.licenses[key]) return;
    closeStagePops();
    licEdit = key;
    licOpener = opener || null;
    const cap = $('licCap');
    cap.value = S.doc.licCaps[key] || '';
    cap.placeholder = SINFORGE.licenses[key].cap;
    syncLicPreview();
    syncLicensePick();
    $('licModal').hidden = false;
    cap.focus();
  }
  function closeLicEdit() {
    if (!licEdit) return;
    licEdit = null;
    $('licModal').hidden = true;
    syncLicensePick();
    if (licOpener && licOpener.isConnected && !licOpener.hidden) licOpener.focus();
    licOpener = null;
  }
  function bindLicEditor() {
    const modal = $('licModal'), cap = $('licCap'), file = $('licFileInput');
    cap.addEventListener('input', () => {
      if (!licEdit) return;
      if (cap.value.trim()) S.doc.licCaps[licEdit] = cap.value;
      else delete S.doc.licCaps[licEdit];
      persist.doc();
      syncLicPreview();
      syncLicensePick();
      requestRender();
    });
    cap.addEventListener('keydown', (e) => { if (e.key === 'Enter') closeLicEdit(); });
    file.addEventListener('change', (e) => { if (licEdit) setLicenseIcon(licEdit, e.target.files[0]); e.target.value = ''; });
    $('licIconBtn').addEventListener('click', () => file.click());
    $('licResetBtn').addEventListener('click', () => { if (licEdit) resetLicense(licEdit); });
    // the preview grants / revokes, like the toggle it stands for
    $('licPreview').addEventListener('click', () => { if (licEdit) { toggleLicense(licEdit); syncLicPreview(); } });
    $('licDone').addEventListener('click', closeLicEdit);
    $('licClose').addEventListener('click', closeLicEdit);
    modal.addEventListener('pointerdown', (e) => { if (e.target === modal) closeLicEdit(); });
    // the crop window (opened from here) takes Escape first, in the capture phase
    document.addEventListener('keydown', (e) => { if (licEdit && e.key === 'Escape') closeLicEdit(); });
  }

  function buildLicensePick() {
    const wrap = document.createElement('div');
    wrap.className = 'field';
    const lab = i18nEl('label', 'l_licenses');
    lab.id = 'licLbl';
    const grid = document.createElement('div');
    grid.className = 'blank-pick lic-pick';
    grid.id = 'licPick';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-labelledby', 'licLbl');

    SINFORGE.licenseOrder.forEach((key) => {
      const cell = document.createElement('div');
      cell.className = 'lic-cell';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'blank-opt lic-opt';
      btn.dataset.license = key;
      btn.setAttribute('role', 'checkbox');
      btn.innerHTML = licenseIcon(key);
      btn.onclick = () => toggleLicense(key);
      const pen = document.createElement('button');
      pen.type = 'button';
      pen.className = 'lic-pen';
      pen.dataset.license = key;
      pen.setAttribute('data-i18n-title', 'b_licedit');
      pen.title = t('b_licedit');
      pen.setAttribute('aria-label', t('b_licedit'));
      pen.setAttribute('aria-haspopup', 'dialog');
      pen.setAttribute('aria-controls', 'licModal');
      pen.innerHTML = PEN_SVG;
      pen.onclick = () => openLicEdit(key, pen);
      // reset: on a customised license only (top-left corner)
      const rst = document.createElement('button');
      rst.type = 'button';
      rst.className = 'lic-pen lic-reset';
      rst.setAttribute('data-i18n-title', 'b_licreset');
      rst.title = t('b_licreset');
      rst.setAttribute('aria-label', t('b_licreset'));
      rst.innerHTML = RESET_SVG;
      rst.onclick = () => { resetLicense(key); btn.focus(); };
      cell.append(btn, pen, rst);
      grid.appendChild(cell);
    });
    wrap.append(lab, grid);
    syncLicensePick(grid);
    return wrap;
  }
  // pressed state + tooltip: a custom caption names its toggle (and is never
  // re-translated); otherwise the license's own translated name. The pencil
  // of the license being edited stays lit.
  function syncLicensePick(grid) {
    grid = grid || $('licPick');
    if (!grid) return;
    grid.querySelectorAll('.lic-pen').forEach((p) => p.classList.toggle('active', p.dataset.license === licEdit));
    grid.querySelectorAll('.lic-opt').forEach((btn) => {
      const key = btn.dataset.license, custom = S.doc.licCaps[key];
      btn.setAttribute('aria-checked', String(S.doc.licenses.includes(key)));
      btn.classList.toggle('custom', isCustomLicense(key));
      btn.parentNode.classList.toggle('custom', isCustomLicense(key));
      if (custom) {
        btn.removeAttribute('data-i18n-title');
        btn.title = custom;
      } else {
        btn.setAttribute('data-i18n-title', 'li_' + key);
        btn.title = t('li_' + key);
      }
    });
  }

  // ---- name generator: GENERATE NAME + a settings toggle (js/names.js) ----
  const COG_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M10.3 2h3.4l.5 2.6 1.8.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.8 2.6.5v3.4l-2.6.5-.8 1.8 1.5 2.2-2.4 2.4-2.2-1.5-1.8.8-.5 2.6h-3.4l-.5-2.6-1.8-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.8L2 13.7v-3.4l2.6-.5.8-1.8-1.5-2.2 2.4-2.4 2.2 1.5 1.8-.8z"/>'
    + '<circle cx="12" cy="12" r="3.2"/></svg>';
  const EYE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  let nameCfgOpen = false;
  function setSlot(id, value) {
    const slot = blank().texts.find((x) => x.id === id);
    if (!slot) return;
    S.doc[id] = String(value).slice(0, slot.max);
    const inp = $('txt_' + id);
    if (inp) inp.value = S.doc[id];
  }
  function generateName(btn) {
    const N = blank().names;
    btn.disabled = true;
    btn.classList.add('busy');
    SINFORGE.names.generate(S.names).then((r) => {
      setSlot(N.first, r.first);
      setSlot(N.last, r.last);
      if (N.title) setSlot(N.title, r.gender === 'f' ? 'MS' : 'MR');
      if (N.sex) setSlot(N.sex, r.gender === 'f' ? 'F' : 'M');
      persist.doc();
      requestRender();
      if (r.fallback) setStatus(t(r.fallback === 'key' ? 'st_namekey' : 'st_namenet'), 'warn');
      else setStatus(t('st_name'), 'ok');
    }).finally(() => { btn.disabled = false; btn.classList.remove('busy'); });
  }
  function i18nEl(tag, key, cls) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    el.textContent = t(key);
    el.setAttribute('data-i18n', key);
    return el;
  }
  function nameSelect(key, opts) {
    const sel = document.createElement('select');
    sel.className = 'scale-select';
    opts.forEach(([v, k]) => { const o = i18nEl('option', k); o.value = v; sel.appendChild(o); });
    sel.value = S.names[key];
    sel.addEventListener('change', () => { S.names[key] = sel.value; persist.names(); });
    return sel;
  }
  function toggleRow(labelKey, control) {
    const row = document.createElement('div');
    row.className = 'fx-toggle';
    row.append(i18nEl('span', labelKey, 'fx-label'), control);
    return row;
  }
  function buildNameGen() {
    const wrap = document.createElement('div');
    wrap.className = 'name-gen field';
    const row = document.createElement('div');
    row.className = 'field-row';
    const gen = document.createElement('button');
    gen.type = 'button';
    gen.className = 'btn btn-sm btn-gen';
    gen.setAttribute('data-augmented-ui', 'tl-clip br-clip border');
    gen.innerHTML = DIE_SVG;
    gen.append(i18nEl('span', 'b_genname'));
    gen.addEventListener('click', () => generateName(gen));
    const cog = document.createElement('button');
    cog.type = 'button';
    cog.className = 'btn btn-icon';
    cog.setAttribute('data-augmented-ui', 'tl-clip br-clip border');
    cog.setAttribute('data-i18n-title', 'b_namecfg');
    cog.title = t('b_namecfg');
    cog.setAttribute('aria-label', t('b_namecfg'));
    cog.setAttribute('aria-controls', 'nameCfg');
    cog.innerHTML = COG_SVG;
    row.append(gen, cog);

    const cfg = document.createElement('div');
    cfg.className = 'gen-config';
    cfg.id = 'nameCfg';
    cfg.append(
      toggleRow('l_gender', nameSelect('gender', [['any', 'g_any'], ['m', 'g_m'], ['f', 'g_f']])),
      toggleRow('l_region', nameSelect('region', SINFORGE.names.regions.map((id) => [id, 'r_' + id]))),
    );
    const kf = document.createElement('div');
    kf.className = 'field mt';
    const kl = i18nEl('label', 'l_btnkey');
    kl.htmlFor = 'btnKey';
    // masked like a password; the eye button reveals it while held down
    const key = document.createElement('input');
    key.type = 'password';
    key.id = 'btnKey';
    key.autocomplete = 'off';
    key.spellcheck = false;
    key.setAttribute('data-1p-ignore', '');
    key.setAttribute('data-lpignore', 'true');
    key.value = S.names.key;
    key.placeholder = 'behindthename.com/api';
    key.addEventListener('input', () => { S.names.key = key.value.trim(); persist.names(); });
    const eye = document.createElement('button');
    eye.type = 'button';
    eye.className = 'btn btn-icon';
    eye.setAttribute('data-augmented-ui', 'tl-clip br-clip border');
    eye.setAttribute('data-i18n-title', 'b_showkey');
    eye.title = t('b_showkey');
    eye.setAttribute('aria-label', t('b_showkey'));
    eye.innerHTML = EYE_SVG;
    const reveal = (on) => { key.type = on ? 'text' : 'password'; eye.classList.toggle('active', on); };
    eye.addEventListener('pointerdown', (e) => { e.preventDefault(); reveal(true); });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => eye.addEventListener(ev, () => reveal(false)));
    eye.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(key.type === 'password'); } });
    const keyRow = document.createElement('div');
    keyRow.className = 'field-row';
    keyRow.append(key, eye);
    kf.append(kl, keyRow, i18nEl('p', 'hint_btnkey', 'hint mt'));
    cfg.append(kf);

    const setOpen = (open) => {
      nameCfgOpen = open;
      cfg.hidden = !open;
      cog.classList.toggle('active', open);
      cog.setAttribute('aria-expanded', String(open));
    };
    setOpen(nameCfgOpen);
    cog.addEventListener('click', () => setOpen(!nameCfgOpen));
    wrap.append(row, cfg);
    return wrap;
  }

  // ---- right panel: colour schemes ----
  function buildSchemes() {
    const row = $('schemeRow');
    row.innerHTML = '';
    Object.entries(SINFORGE.schemes).forEach(([name, sc]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'scheme-chip';
      b.dataset.scheme = name;
      b.title = name.toUpperCase();
      b.setAttribute('aria-label', name);
      const sw = document.createElement('span');
      sw.className = 'scheme-swatch';
      sw.style.background = `linear-gradient(90deg, ${sc.card} 0 50%, ${sc.ink} 50% 80%, ${sc.accent} 80%)`;
      b.appendChild(sw);
      b.addEventListener('click', () => {
        Object.assign(S.style, sc);
        persist.style();
        syncControls();
        requestRender();
      });
      row.appendChild(b);
    });
  }

  // ---- generic control binding (data-style / data-val / data-needs) ----
  // conditions that aren't a single style key
  const DERIVED = {
    wmTiled: (st) => st.wm === 'text' || (st.wm === 'image' && st.wmTile), // a repeated watermark
  };
  function needsMet(expr) {
    const m = expr.match(/^(\w+)(?:([=!])(\w+))?$/);
    if (!m) return true;
    const v = DERIVED[m[1]] ? DERIVED[m[1]](S.style) : S.style[m[1]];
    if (!m[2]) return !!v;
    return m[2] === '=' ? String(v) === m[3] : String(v) !== m[3];
  }
  function syncControls() {
    document.querySelectorAll('[data-style]').forEach((el) => {
      const v = S.style[el.dataset.style];
      if (el.classList.contains('side-switch')) el.dataset.pos = v ? 'right' : 'left';
      else if (el.classList.contains('dial')) {
        el.style.setProperty('--angle', v + 'deg');
        el.setAttribute('aria-valuenow', v);
      } else if (el.value !== String(v)) el.value = v;
    });
    document.querySelectorAll('[data-val]').forEach((el) => { el.textContent = S.style[el.dataset.val]; });
    document.querySelectorAll('[data-needs]').forEach((el) => el.classList.toggle('disabled', !needsMet(el.dataset.needs)));
    document.querySelectorAll('[data-shows]').forEach((el) => { el.hidden = !needsMet(el.dataset.shows); });
    document.querySelectorAll('[data-pick]').forEach((el) => { el.style.background = S.style[el.dataset.pick]; });
    document.querySelectorAll('.scheme-chip').forEach((el) => {
      const sc = SINFORGE.schemes[el.dataset.scheme];
      el.classList.toggle('active', sc.card === S.style.card && sc.ink === S.style.ink && sc.accent === S.style.accent);
    });
    // per-blank decorations: hide toggles the active blank doesn't use
    const decor = blank().decor || [];
    ['stripes', 'slashes', 'barcode', 'edge', 'chip', 'dna', 'mrz'].forEach((k) => {
      const sw = document.querySelector(`.side-switch[data-style="${k}"]`);
      if (sw) sw.closest('.fx-toggle').hidden = !decor.includes(k);
    });
    syncPickers();
    syncPalette();
    $('zoomRange').value = Math.round(S.tf.zoom * 100);
    $('zoomVal').textContent = Math.round(S.tf.zoom * 100) + '%';
    $('scaleSwitch').dataset.pos = S.out.scale === 2 ? 'right' : 'left';
    // DIGITAL mode exports the card inside its scene (js/digital.js)
    const sz = S.out.digital ? SINFORGE.digital.exportSize(blank().w * S.out.scale, blank().h * S.out.scale)
      : { w: blank().w * S.out.scale, h: blank().h * S.out.scale };
    $('sizeVal').textContent = `${sz.w}×${sz.h}`;
  }
  // Rotation wheel: drag around it to aim the needle (Shift snaps to 15°),
  // arrow keys nudge by 1° (Shift: 15°), double-click resets to data-default.
  function bindDial(el, key) {
    const set = (deg) => {
      let d = Math.round(deg);
      d = ((d + 180) % 360 + 360) % 360 - 180; // wrap to -180..179
      if (d === S.style[key]) return;
      S.style[key] = d;
      persist.style(); syncControls(); requestRender();
    };
    const fromPointer = (e) => {
      const r = el.getBoundingClientRect();
      const deg = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
      set(e.shiftKey ? Math.round(deg / 15) * 15 : deg);
    };
    let dragging = false;
    el.addEventListener('pointerdown', (e) => {
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('active');
      fromPointer(e);
    });
    el.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
    const end = () => { dragging = false; el.classList.remove('active'); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => set(Number(el.dataset.default) || 0));
    el.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 15 : 1;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); set(S.style[key] - step); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); set(S.style[key] + step); }
    });
  }

  function bindControls() {
    document.querySelectorAll('[data-style]').forEach((el) => {
      const key = el.dataset.style;
      if (el.classList.contains('side-switch')) {
        el.addEventListener('click', () => {
          S.style[key] = !S.style[key];
          persist.style(); syncControls(); requestRender();
        });
        return;
      }
      if (el.classList.contains('dial')) { bindDial(el, key); return; }
      el.addEventListener('input', () => {
        S.style[key] = typeof S.style[key] === 'number' ? Number(el.value) : el.value;
        persist.style(); syncControls(); requestRender();
      });
    });
    // colour swatches open their hidden colour input (data-palette ones — card /
    // ink / accent: the palette window, bindPalette)
    document.querySelectorAll('[data-pick]:not([data-palette])').forEach((btn) => {
      const inp = btn.parentElement.querySelector('.fill-input');
      btn.addEventListener('click', () => {
        try { inp.showPicker(); } catch (e) { inp.click(); }
      });
    });
    $('zoomRange').addEventListener('input', (e) => {
      S.tf.zoom = Number(e.target.value) / 100;
      persist.tf(); syncControls(); requestRender();
    });
    $('scaleSwitch').addEventListener('click', () => {
      S.out.scale = S.out.scale === 2 ? 1 : 2;
      persist.out(); syncControls();
    });
    $('uploadBtn').addEventListener('click', () => $('fileInput').click());
    $('fileInput').addEventListener('change', (e) => { loadUserPhoto(e.target.files[0]); e.target.value = ''; });
    $('doggoBtn').addEventListener('click', () => {
      SINFORGE.idb.del('assets', 'photo').catch(() => {});
      S.tf = SINFORGE.newTransform();
      persist.tf(); syncControls();
      useDoggo();
    });
    $('resetTfBtn').addEventListener('click', () => {
      S.tf = SINFORGE.newTransform();
      persist.tf(); syncControls(); requestRender();
    });
    $('wmUploadBtn').addEventListener('click', () => $('wmFileInput').click());
    $('wmFileInput').addEventListener('change', (e) => { loadWatermark(e.target.files[0]); e.target.value = ''; });
    $('wmClearBtn').addEventListener('click', () => {
      S.wmImage = null;
      SINFORGE.idb.del('assets', 'watermark').catch(() => {});
      requestRender();
    });
    $('exportBtn').addEventListener('click', exportPng);
    $('copyBtn').addEventListener('click', copyPng);
  }

  // ---- stage: click the photo for the frame picker (drag it to pan, wheel to
  // zoom), click the barcode for the barcode picker, the chip for the chip
  // picker, a date for the date format picker ----
  // The canvas as drawn: the element box can be letterboxed (object-fit:
  // contain + min-height), so map through the drawn image's rect, not the element's.
  function drawnRect() {
    const r = $('docCanvas').getBoundingClientRect(), B = blank();
    const f = Math.min(r.width / B.w, r.height / B.h);
    return { f, left: r.left + (r.width - B.w * f) / 2, top: r.top + (r.height - B.h * f) / 2 };
  }
  function docPoint(e) {
    const d = drawnRect();
    return { x: (e.clientX - d.left) / d.f, y: (e.clientY - d.top) / d.f };
  }
  const inBox = (p, b) => !!b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  function inPhoto(p) { return inBox(p, blank().photo.box); }
  // the date under a point (as last rendered — gfx.dateBoxes, padded a little
  // so the short values are easy to hit), or undefined
  const DATE_PAD = 10;
  const dateAt = (p) => SINFORGE.gfx.dateBoxes.find((b) => inBox(p, {
    x: b.x - DATE_PAD, y: b.y - DATE_PAD, w: b.w + 2 * DATE_PAD, h: b.h + 2 * DATE_PAD,
  }));
  // the license tile under a point (as last rendered — gfx.licenseBoxes), or undefined
  const licenseAt = (p) => SINFORGE.gfx.licenseBoxes.find((b) => inBox(p, b));
  // the logo layer under a point (as last rendered — gfx.logoBoxes): the
  // selected one first, else the topmost; `selOnly` asks for the selected one
  function logoAt(p, selOnly) {
    const bs = SINFORGE.gfx.logoBoxes;
    const sel = bs.find((b) => b.id === S.logoSel && inBox(p, b));
    if (sel || selOnly) return sel;
    for (let i = bs.length - 1; i >= 0; i--) if (inBox(p, bs[i])) return bs[i];
    return undefined;
  }
  // what a point on the canvas hits: 'photo', 'code' (the barcode as last
  // rendered — gfx.codeBox), 'chip' (gfx.chipBox), 'dna' (gfx.dnaBox), 'date',
  // 'license', 'logo' or null. Logos lie under everything, so they come last —
  // except the selected one, which is grabbed first wherever it lies.
  function hitAt(p) {
    if (logoAt(p, true)) return 'logo';
    if (inPhoto(p)) return 'photo';
    if (inBox(p, SINFORGE.gfx.codeBox)) return 'code';
    if (inBox(p, SINFORGE.gfx.chipBox)) return 'chip';
    if (inBox(p, SINFORGE.gfx.dnaBox)) return 'dna';
    if (licenseAt(p)) return 'license';
    if (dateAt(p)) return 'date';
    return logoAt(p) ? 'logo' : null;
  }
  // point in polygon (even-odd ray cast)
  function inPoly(p, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > p.y) !== (yj > p.y) && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // an empty part of the card (no click target, not in a punched hole) drags
  // the watermark — while one is drawn
  function onWatermark(p) {
    const st = S.style, B = blank();
    if (st.wm === 'off' || !st.wmAmt) return false;
    if (st.wm === 'text' ? !st.wmText.trim() : !S.wmImage) return false;
    return inPoly(p, B.outline) && !(B.holes || []).some((h) => inPoly(p, h));
  }
  // each click target's picker (the DNA strip has none: a click flips it
  // between the helix and the letters; nor a license tile: a click grants /
  // revokes it; nor a logo: a click selects it, a drag moves it, the wheel
  // resizes it)
  const STAGE_POPS = { photo: 'framePop', code: 'codePop', chip: 'chipPop', date: 'datePop' };
  const HINTS = { photo: 'hint_frame', code: 'hint_code', chip: 'hint_chip', date: 'hint_date', dna: 'hint_dna', license: 'hint_lic', logo: 'hint_logomove' };
  const BOXES = { code: 'codeBox', chip: 'chipBox', dna: 'dnaBox' };
  // an overlay SVG laid over the canvas as drawn, in the blank's native px
  function placeOverlay(svg) {
    const B = blank(), d = drawnRect(), s = $('stage').getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
    Object.assign(svg.style, {
      left: d.left - s.left + 'px', top: d.top - s.top + 'px',
      width: B.w * d.f + 'px', height: B.h * d.f + 'px',
    });
  }
  const boxPoints = (c, pad) => [[c.x - pad, c.y - pad], [c.x + c.w + pad, c.y - pad], [c.x + c.w + pad, c.y + c.h + pad], [c.x - pad, c.y + c.h + pad]];
  // the selected logo layer's outline, kept on while it's selected
  function syncLogoMark() {
    const svg = $('logoSelMark');
    const b = S.logoSel && SINFORGE.gfx.logoBoxes.find((x) => x.id === S.logoSel);
    svg.classList.toggle('show', !!b);
    if (!b) return;
    placeOverlay(svg);
    svg.firstElementChild.setAttribute('points', boxPoints(b, 0).map((q) => q.join(',')).join(' '));
  }
  // hover marker: the photo window's outline (or the barcode's / chip's /
  // the hovered date's / license tile's box) laid over the canvas; a license
  // tile also gets the edit pencil on its top-right corner and, when it's
  // customised, the reset button on its top-left
  function showHover(hit, p) {
    const svg = $('photoHover'), pen = $('licPenStage'), rst = $('licResetStage');
    $('docCanvas').classList.toggle('over-photo', !!hit && hit !== 'logo');
    $('docCanvas').classList.toggle('over-logo', hit === 'logo');
    $('docCanvas').title = hit ? t(HINTS[hit]) : '';
    svg.classList.toggle('show', !!hit);
    pen.hidden = rst.hidden = hit !== 'license';
    if (!hit) return;
    const B = blank(), d = drawnRect(), s = $('stage').getBoundingClientRect();
    if (hit === 'license') {
      const tile = licenseAt(p);
      pen.dataset.license = rst.dataset.license = tile.key;
      rst.hidden = !isCustomLicense(tile.key);
      const top = d.top - s.top + tile.y * d.f - pen.offsetHeight * 0.4 + 'px';
      pen.style.left = d.left - s.left + (tile.x + tile.w) * d.f - pen.offsetWidth * 0.6 + 'px';
      pen.style.top = rst.style.top = top;
      rst.style.left = d.left - s.left + tile.x * d.f - pen.offsetWidth * 0.4 + 'px';
    }
    placeOverlay(svg);
    const c = hit === 'date' ? dateAt(p) : hit === 'license' ? licenseAt(p) : hit === 'logo' ? logoAt(p) : SINFORGE.gfx[BOXES[hit]];
    const pad = hit === 'date' ? DATE_PAD : hit === 'license' ? 4 : hit === 'logo' ? 0 : 8;
    const poly = hit === 'photo' ? B.photo.poly : boxPoints(c, pad);
    svg.firstElementChild.setAttribute('points', poly.map((p) => p.join(',')).join(' '));
  }
  // a picker pops up beside the click, kept inside the stage shell; one at a time
  function setStagePop(hit, e) {
    Object.entries(STAGE_POPS).forEach(([h, id]) => { if (h !== hit || !e) $(id).hidden = true; });
    if (!hit || !e) return;
    const pop = $(STAGE_POPS[hit]);
    pop.style.left = pop.style.top = '0px'; // measure it at full width, not squeezed by its last spot
    pop.hidden = false;
    const sh = $('stageShell').getBoundingClientRect();
    const x = clamp(e.clientX - sh.left + 14, 8, sh.width - pop.offsetWidth - 8);
    const y = clamp(e.clientY - sh.top + 14, 8, sh.height - pop.offsetHeight - 8);
    pop.style.left = x + 'px';
    pop.style.top = y + 'px';
  }
  const closeStagePops = () => setStagePop(null);
  function bindStage() {
    const cv = $('docCanvas');
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const p = docPoint(e), hit = hitAt(p) || (onWatermark(p) && 'wm');
      // a press on a logo selects it; anywhere else lets the selected one go
      const lid = hit === 'logo' ? logoAt(p).id : null;
      selectLogo(lid);
      if (!hit) return;
      // a press that barely moves is a click (its picker); more drags the photo
      const L = lid && selLayer();
      const [tx, ty] = L ? [L.x, L.y]
        : hit === 'wm' ? [S.style.wmX, S.style.wmY] : [S.tf.x, S.tf.y];
      drag = {
        hit, lic: hit === 'license' && licenseAt(p).key, lid, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY,
        tx, ty, moved: false,
      };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      const p = docPoint(e);
      if (!drag) {
        // heading for the license pencil / reset (they overhang their tile):
        // keep them up while the pointer is within a few px of one
        const hit = hitAt(p);
        const near = (b) => {
          const r = b.getBoundingClientRect();
          return !b.hidden && e.clientX > r.left - 10 && e.clientX < r.right + 10 && e.clientY > r.top - 10 && e.clientY < r.bottom + 10;
        };
        if (!hit && (near($('licPenStage')) || near($('licResetStage')))) return;
        showHover(hit, p);
        const wm = !hit && onWatermark(p);
        cv.classList.toggle('over-wm', wm);
        if (wm) cv.title = t('hint_wmmove');
        return;
      }
      if (!drag.moved && Math.hypot(e.clientX - drag.cx, e.clientY - drag.cy) < 5) return;
      if (drag.hit === 'wm') {
        if (!drag.moved) { drag.moved = true; cv.classList.add('dragging'); }
        const B = blank();
        S.style.wmX = clamp(drag.tx + (p.x - drag.x) / B.w, -1, 1);
        S.style.wmY = clamp(drag.ty + (p.y - drag.y) / B.h, -1, 1);
        requestRender();
        return;
      }
      const L = drag.lid && selLayer();
      if (drag.hit === 'logo' ? !L : drag.hit !== 'photo' || !S.photo) return;
      if (!drag.moved) { drag.moved = true; cv.classList.add('dragging'); showHover(null); }
      if (L) {
        // its centre stays on the card
        const B = blank();
        L.x = clamp(drag.tx + (p.x - drag.x) / B.w, 0, 1);
        L.y = clamp(drag.ty + (p.y - drag.y) / B.h, 0, 1);
        requestRender();
        return;
      }
      const b = blank().photo.box;
      S.tf.x = clamp(drag.tx + (p.x - drag.x) / b.w, -3, 3);
      S.tf.y = clamp(drag.ty + (p.y - drag.y) / b.h, -3, 3);
      requestRender();
    });
    cv.addEventListener('pointerup', (e) => {
      if (!drag) return;
      const { hit, moved, lic } = drag;
      drag = null;
      cv.classList.remove('dragging');
      if (moved) (hit === 'logo' ? persist.logos : hit === 'wm' ? persist.style : persist.tf)();
      else if (hit === 'wm' || hit === 'logo') closeStagePops();
      else if (hit === 'dna') {
        closeStagePops();
        S.style.dnaText = !S.style.dnaText;
        persist.style(); requestRender();
      } else if (hit === 'license') {
        closeStagePops();
        toggleLicense(lic);
      } else setStagePop(hit, $(STAGE_POPS[hit]).hidden ? e : null);
    });
    cv.addEventListener('pointercancel', () => { drag = null; cv.classList.remove('dragging'); });
    // a double-click on an empty part of the card centres the watermark again
    cv.addEventListener('dblclick', (e) => {
      const p = docPoint(e);
      if (hitAt(p) || !onWatermark(p)) return;
      S.style.wmX = S.style.wmY = 0;
      persist.style(); requestRender();
    });
    // the pencil / reset sit over the canvas: moving onto one keeps the
    // hover, leaving it for anywhere but the canvas ends it
    const pen = $('licPenStage'), rst = $('licResetStage');
    cv.addEventListener('pointerleave', (e) => {
      cv.classList.remove('over-wm');
      if (!drag && !pen.contains(e.relatedTarget) && !rst.contains(e.relatedTarget)) showHover(null);
    });
    [pen, rst].forEach((b) => b.addEventListener('pointerleave', (e) => { if (e.relatedTarget !== cv) showHover(null); }));
    pen.innerHTML = PEN_SVG;
    pen.title = t('b_licedit');
    pen.setAttribute('aria-label', t('b_licedit'));
    pen.setAttribute('aria-haspopup', 'dialog');
    // open the editor window on this license
    pen.addEventListener('click', () => openLicEdit(pen.dataset.license, pen));
    rst.innerHTML = RESET_SVG;
    rst.title = t('b_licreset');
    rst.setAttribute('aria-label', t('b_licreset'));
    rst.addEventListener('click', () => { resetLicense(rst.dataset.license); rst.hidden = true; });
    Object.values(STAGE_POPS).forEach((id) => $(id).querySelector('.adj-close').addEventListener('click', closeStagePops));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeStagePops(); });
    // a press anywhere but a picker or a click target closes them (a click on
    // the target toggles its picker)
    document.addEventListener('pointerdown', (e) => {
      if (Object.values(STAGE_POPS).some((id) => $(id).contains(e.target))) return;
      if (e.target === cv && hitAt(docPoint(e))) return;
      closeStagePops();
    });
    window.addEventListener('resize', closeStagePops);
    cv.addEventListener('wheel', (e) => {
      const p = docPoint(e);
      if (hitAt(p) === 'logo') {
        // resize the logo about the point under the pointer (and select it)
        e.preventDefault();
        selectLogo(logoAt(p).id);
        const L = selLayer(), B = blank();
        const z = clamp(L.size * Math.exp(-e.deltaY * 0.0015), 0.05, 1.5), q = z / L.size;
        L.size = z;
        L.x = clamp((p.x + (L.x * B.w - p.x) * q) / B.w, 0, 1);
        L.y = clamp((p.y + (L.y * B.h - p.y) * q) / B.h, 0, 1);
        persist.logos(); syncLogoEdit(); requestRender();
        return;
      }
      if (!inPhoto(p) || !S.photo) return;
      e.preventDefault();
      S.tf.zoom = clamp(S.tf.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5);
      persist.tf(); syncControls(); requestRender();
    }, { passive: false });
  }

  // ---- EFFECTS / WATERMARK / PHOTO FX windows: the stage's top-left icons open them
  // (one at a time), floating over the column to the left of the canvas
  // (EIDOLON's COLOUR window); the top-right icon opens the DIGITAL window over
  // the column to the right. An icon names its window in aria-controls. ----
  function setPopOpen(pop) {
    document.querySelectorAll('.adj-pop').forEach((p) => { p.hidden = p !== pop; });
    document.querySelectorAll('.stage-tool[aria-controls]').forEach((btn) => {
      btn.setAttribute('aria-expanded', btn.getAttribute('aria-controls') === (pop && pop.id) ? 'true' : 'false');
    });
    $('logoPick').querySelectorAll('.lic-pen').forEach((p) => p.classList.toggle('active', pop === $('logoPop') && p.dataset.layer === S.logoSel));
  }
  function bindPops() {
    document.querySelectorAll('.stage-tool[aria-controls]').forEach((btn) => {
      const pop = $(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', () => setPopOpen(pop.hidden ? pop : null));
      pop.querySelector('.adj-close').addEventListener('click', () => { setPopOpen(null); btn.focus(); });
    });
    $('logoPop').querySelector('.adj-close').addEventListener('click', () => setPopOpen(null));
    const anyOpen = () => document.querySelector('.adj-pop:not([hidden])');
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && anyOpen()) setPopOpen(null); });
    // a press anywhere outside the open window closes it (its icon toggles it)
    document.addEventListener('pointerdown', (e) => {
      const pop = anyOpen();
      if (!pop || pop.contains(e.target)) return;
      if (e.target.closest(`[aria-controls="${pop.id}"]`)) return;
      // the ELEMENT window stays while its layers are picked / dragged
      if (pop.id === 'logoPop' && e.target.closest('#stage, #logoPick')) return;
      setPopOpen(null);
    });
  }

  // ---- CARD / INK / ACCENT palette window (ATLAS's colour popup): a
  // data-palette swatch opens it beside itself for its style key — preset
  // swatches (SINFORGE.palettes[its data-palette]; a click picks + closes) and
  // the picker (live; it wears the colour while a non-preset one is active) ----
  let paletteKey = null; // the style key the open window edits
  function syncPalette() {
    if (!paletteKey) return;
    const cur = String(S.style[paletteKey]).toLowerCase(), pick = $('colorPopGrid').querySelector('.swatch-pick-btn');
    let preset = false;
    $('colorPopGrid').querySelectorAll('.swatch').forEach((sw) => {
      const on = sw.dataset.color === cur;
      sw.classList.toggle('active', on);
      preset = preset || on;
    });
    pick.classList.toggle('has-color', !preset);
    pick.classList.toggle('active', !preset);
    pick.style.background = pick.style.color = preset ? '' : cur;
    $('colorPopPick').value = cur;
  }
  function openPalette(btn) {
    const pop = $('colorPop');
    paletteKey = btn.dataset.pick;
    buildPalette(SINFORGE.palettes[btn.dataset.palette] || SINFORGE.palettes.mark);
    $('colorPopName').textContent = btn.closest('.fx-toggle').querySelector('.fx-label').textContent;
    pop.hidden = false; // unhide first so it can be measured
    syncPalette();
    // to the left of the (right-column) swatch, else to its right; kept on screen
    const r = btn.getBoundingClientRect(), pw = pop.offsetWidth, ph = pop.offsetHeight, m = 12;
    let left = r.left - pw - m;
    if (left < 8) left = Math.min(r.right + m, window.innerWidth - pw - 8);
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, Math.min(r.top - 20, window.innerHeight - ph - 8)) + 'px';
    document.querySelectorAll('[data-palette]').forEach((b) => b.setAttribute('aria-expanded', b === btn ? 'true' : 'false'));
  }
  function closePalette() {
    $('colorPop').hidden = true;
    paletteKey = null;
    document.querySelectorAll('[data-palette]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
  }
  function setPaletteColor(c) {
    S.style[paletteKey] = c;
    persist.style(); syncControls(); requestRender();
  }
  // the opening swatch's presets, ahead of the picker's row
  function buildPalette(colors) {
    const grid = $('colorPopGrid');
    grid.querySelectorAll('.swatch').forEach((sw) => sw.remove());
    colors.forEach((hex) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch';
      sw.dataset.color = hex;
      sw.style.background = sw.style.color = hex; // color drives the .active glow
      sw.setAttribute('aria-label', hex);
      grid.insertBefore(sw, grid.querySelector('.grid-break'));
    });
  }
  function bindPalette() {
    const grid = $('colorPopGrid');
    document.querySelectorAll('[data-palette]').forEach((btn) => {
      btn.addEventListener('click', () => { if (paletteKey === btn.dataset.pick) closePalette(); else openPalette(btn); });
    });
    grid.addEventListener('click', (e) => {
      const sw = e.target.closest('.swatch');
      if (!sw || !paletteKey) return;
      setPaletteColor(sw.dataset.color);
      closePalette();
    });
    $('colorPopPick').addEventListener('input', (e) => { if (paletteKey) setPaletteColor(e.target.value); });
    $('colorPop').querySelector('.adj-close').addEventListener('click', closePalette);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && paletteKey) closePalette(); });
    document.addEventListener('pointerdown', (e) => {
      if (paletteKey && !$('colorPop').contains(e.target) && !e.target.closest('[data-palette]')) closePalette();
    });
    // it's placed once, beside its swatch: a scroll / resize would leave it behind
    window.addEventListener('scroll', () => { if (paletteKey) closePalette(); }, true);
    window.addEventListener('resize', () => { if (paletteKey) closePalette(); });
  }

  // ---- drop / paste an image anywhere ----
  function bindDropPaste() {
    const stage = $('stage');
    let depth = 0;
    document.addEventListener('dragenter', (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { depth++; stage.classList.add('drop'); } });
    document.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; stage.classList.remove('drop'); } });
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => {
      e.preventDefault();
      depth = 0; stage.classList.remove('drop');
      const f = e.dataTransfer && e.dataTransfer.files[0];
      if (f) loadDropped(f);
    });
    document.addEventListener('paste', (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) loadDropped(item.getAsFile());
    });
    // with the license editor open, an image is that license's icon; else the photo
    const loadDropped = (f) => {
      if (!$('cropModal').hidden) return;
      if (licEdit) setLicenseIcon(licEdit, f); else loadUserPhoto(f);
    };
  }

  // ---- presets: named snapshots of a whole document — the blank, its text
  // (S.doc) and look (S.style), optionally the output settings (S.out) — in a
  // slide-out side panel (EIDOLON's PRESETS, the COMMLINK side-panel pattern).
  // Stored as sinforge:presets = { NAME: { blank, doc, style, tf?, logos?, imgs?, out?, savedAt } }.
  // A preset keeps copies of its images, so it outlives what's on the card:
  //   logos  the blank's element layers (newLogo() fields), each under an id of
  //          its own, its upload in IndexedDB as 'plogo:<id>'
  //   imgs   { photo?, wm?, lic: { key: id } } — the user's photo (absent: the
  //          doggo), the watermark image, custom license icons, as 'pimg:<id>';
  //          tf = the photo's framing
  // Applying one replaces the card's with fresh copies. A preset without them
  // (the examples) leaves the card's images alone. ----
  // overwrite: an arrow down into a tray (store the current document here)
  const SAVE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M12 3v11M7.5 9.5L12 14l4.5-4.5"/><path d="M4 14v6h16v-6"/></svg>';
  const tv = (k, vars) => {
    let s = t(k);
    Object.keys(vars || {}).forEach((v) => { s = s.split('{' + v + '}').join(vars[v]); });
    return s;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  function loadPresets() {
    const all = load('sinforge:presets');
    return all && typeof all === 'object' && !Array.isArray(all) ? all : {};
  }
  const savePresets = (p) => SINFORGE.save('sinforge:presets', JSON.stringify(p));
  // a preset's element layers, merged over fresh ones (null: it has none to apply)
  function presetLayers(p) {
    if (!Array.isArray(p.logos)) return null;
    return p.logos.filter((L) => L && typeof L.id === 'string').map((L) => {
      const n = SINFORGE.newLogo(L.id);
      merge(n, L);
      return n;
    });
  }
  // their placement / settings, image aside (copies never share an id)
  const LAYOUT = Object.keys(SINFORGE.newLogo('')).filter((k) => k !== 'id');
  const layoutKey = (ls) => JSON.stringify((ls || []).map((L) => LAYOUT.map((k) => L[k])));
  // their images (cropped, as drawn) by preset layer id; null = missing
  const pImgs = {};
  function loadPresetImages(ls) {
    return Promise.all(ls.filter((L) => !(L.id in pImgs)).map((L) => SINFORGE.idb.get('assets', 'plogo:' + L.id)
      .then((blob) => (blob ? blobToCanvas(blob) : null))
      .then((c) => {
        if (c && !isWhole(L)) {
          c = SINFORGE.crop.apply(c, { x: L.cx, y: L.cy, w: L.cw, h: L.ch });
          c.__id = ++photoSeq; // logo cache key in render.js
        }
        pImgs[L.id] = c;
      }, () => { pImgs[L.id] = null; })));
  }
  // a preset's other images (null: it has none to apply)
  function presetImgs(p) {
    const im = p.imgs;
    if (!im || typeof im !== 'object' || Array.isArray(im)) return null;
    const id = (v) => (typeof v === 'string' && v ? v : null), lic = {};
    if (im.lic && typeof im.lic === 'object') {
      Object.keys(im.lic).forEach((k) => { if (SINFORGE.licenses[k] && id(im.lic[k])) lic[k] = im.lic[k]; });
    }
    return { photo: id(im.photo), wm: id(im.wm), lic };
  }
  const imgIds = (im) => (im ? [im.photo, im.wm, ...Object.values(im.lic)].filter(Boolean) : []);
  function loadImgAssets(ids) {
    return Promise.all(ids.filter((id) => !(id in pImgs)).map((id) => SINFORGE.idb.get('assets', 'pimg:' + id)
      .then((blob) => (blob ? blobToCanvas(blob) : null))
      .then((c) => { pImgs[id] = c; }, () => { pImgs[id] = null; })));
  }
  function presetTf(p) {
    const tf = SINFORGE.newTransform();
    merge(tf, p.tf);
    return tf;
  }
  const tfKey = (tf) => JSON.stringify(Object.keys(S.tf).map((k) => tf[k]));
  function dropPresetImages(p) {
    if (!p) return;
    (Array.isArray(p.logos) ? p.logos : []).forEach((L) => {
      if (!L || typeof L.id !== 'string') return;
      SINFORGE.idb.del('assets', 'plogo:' + L.id).catch(() => {});
      delete pImgs[L.id];
    });
    imgIds(presetImgs(p)).forEach((id) => {
      SINFORGE.idb.del('assets', 'pimg:' + id).catch(() => {});
      delete pImgs[id];
    });
  }
  const validPreset = (p) => !!(p && SINFORGE.blanks[p.blank]
    && p.doc && typeof p.doc === 'object' && p.style && typeof p.style === 'object');
  // Built-in EXAMPLE documents, one per blank: overrides on the pristine
  // defaults, never stored, so they're read-only, stay current and never reach
  // an export.
  const EXAMPLES = (() => {
    const ex = (blank, doc, style) => ({
      blank, doc: Object.assign(SINFORGE.newDoc(), doc), style: Object.assign(SINFORGE.newStyle(), style), example: true,
    });
    return {
      'NEON GALA': ex('event-badge',
        { number: 'VIP-2077-0042', role: 'VIP', title: 'MS', name1: 'NOVA', name2: 'KAGE', footer: 'NEON GALA // BACKSTAGE' },
        { ...SINFORGE.schemes.night, frame: 'brackets', code: 'matrix', glow: true, glowAmt: 45 }),
      'SECTOR 7 SIN': ex('citizen-id', {},
        { ...SINFORGE.schemes.chrome, frame: 'octagon', chipType: 'emv', dateFmt: 'dmon', grain: true, grainAmt: 20 }),
      'BOUNTY HUNTER': ex('license',
        { name1: 'JAX', name2: 'MORROW', licenseNo: 'BH-4410-9921', licenses: ['firearms', 'blades', 'bounty', 'driver'] },
        { ...SINFORGE.schemes.toxic, frame: 'shield', code: 'stacked', photoFx: 'mono', photoLevel: 45 }),
      'BLACK OPS': ex('operator-id',
        { callsign: 'RAVEN-3', position: 'INFILTRATOR', opStatus: 'DEEP COVER // TIER 5 CLEARANCE', number: 'NS-0013-6650',
          cardType: 'FIELD AGENT ID', org: 'NULL SECTOR', division: 'BLACK OPERATIONS' },
        { ...SINFORGE.schemes.blood, frame: 'scope', code: 'postal', photoFx: 'halftone', photoDot: 8, scan: true, scanAmt: 30 }),
      'ARENA PASS': ex('access-pass',
        { access: 'BACKSTAGE', zone: 'ARENA // LEVEL 3', division: 'NIGHT SHIFT CREW', handle: '@NEONKAGE',
          name1: 'NOVA', name2: 'KAGE', org: 'SUNSET ARENA' },
        { ...SINFORGE.schemes.sunset, frame: 'slant', code: 'dots', wm: 'text', wmText: 'ALL ACCESS', wmAmt: 12 }),
    };
  })();
  const showExamples = () => { try { return localStorage.getItem('sinforge:showExamples') !== '0'; } catch (e) { return true; } };
  // user presets first (they win a name clash), then the examples
  function allPresets() {
    const own = loadPresets(), out = {};
    Object.keys(own).forEach((n) => { if (validPreset(own[n])) out[n] = own[n]; });
    if (showExamples()) Object.keys(EXAMPLES).forEach((n) => { if (!out[n]) out[n] = EXAMPLES[n]; });
    return out;
  }
  // a preset as the state it makes: merged over the defaults like restore()
  function presetState(p) {
    const doc = SINFORGE.newDoc(), style = SINFORGE.newStyle();
    merge(doc, p.doc);
    merge(style, p.style);
    return { blank: p.blank, doc, style };
  }
  // identity of a document — the preset matching the current one lights up
  const docKey = (blank, doc, style) => JSON.stringify([blank, Object.keys(S.doc).map((k) => doc[k]), Object.keys(S.style).map((k) => style[k])]);
  const presetKey = (p) => { const s = presetState(p); return docKey(s.blank, s.doc, s.style); };
  // the current document is this preset: same blank, text and look, the same
  // elements (none when the preset has none to apply) and, when it carries
  // images, the same photo framing (the pictures themselves aren't compared)
  function matchesNow(key, lkey, tkey) {
    if (key !== docKey(S.blank, S.doc, S.style)) return false;
    if (tkey != null && tkey !== tfKey(S.tf)) return false;
    const ls = S.logos[S.blank] || [];
    return lkey == null ? !ls.length : lkey === layoutKey(ls);
  }
  const presetMatches = (p) => {
    const ls = presetLayers(p);
    return matchesNow(presetKey(p), ls && layoutKey(ls), presetImgs(p) && tfKey(presetTf(p)));
  };
  function presetStamp(ms) {
    const d = new Date(ms || 0);
    if (isNaN(d.getTime())) return '';
    const p2 = (n) => String(n).padStart(2, '0');
    return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${p2(d.getFullYear() % 100)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  }
  // the card as the preset makes it (its own images, or today's when it has
  // none), fitted into the thumbnail box; the renderer's stage targets are
  // re-recorded by the next preview render
  const THUMB = { w: 76, h: 56 };
  function renderPresetThumb(canvas, p) {
    const s = presetState(p), B = SINFORGE.blanks[s.blank];
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const f = Math.min(THUMB.w / B.w, THUMB.h / B.h);
    canvas.width = Math.round(B.w * f * dpr);
    canvas.height = Math.round(B.h * f * dpr);
    canvas.style.width = Math.round(B.w * f) + 'px';
    canvas.style.height = Math.round(B.h * f) + 'px';
    const keep = { blank: S.blank, doc: S.doc, style: S.style, logos: S.logos, logoImgs: S.logoImgs,
      photo: S.photo, tf: S.tf, wmImage: S.wmImage, licIcons: S.licIcons };
    const ls = presetLayers(p), im = presetImgs(p);
    Object.assign(S, s);
    if (ls) { S.logos = { [s.blank]: ls }; S.logoImgs = pImgs; }
    if (im) {
      S.photo = (im.photo ? pImgs[im.photo] : doggo) || null;
      S.tf = presetTf(p);
      S.wmImage = (im.wm && pImgs[im.wm]) || null;
      S.licIcons = {};
      Object.keys(im.lic).forEach((k) => { if (pImgs[im.lic[k]]) S.licIcons[k] = pImgs[im.lic[k]]; });
    }
    try { SINFORGE.render(canvas.getContext('2d'), f * dpr); } finally { Object.assign(S, keep); }
  }
  function buildPresetList() {
    const box = $('presetList'), presets = allPresets();
    box.textContent = '';
    const names = Object.keys(presets).sort((a, b) => (!!presets[a].example - !!presets[b].example)
      || (presets[b].savedAt || 0) - (presets[a].savedAt || 0));
    if (!names.length) {
      const e = document.createElement('div');
      e.className = 'preset-empty';
      e.textContent = t('p_empty');
      box.appendChild(e);
      return;
    }
    names.forEach((name) => {
      const p = presets[name];
      const item = document.createElement('div');
      item.className = 'preset-item' + (p.example ? ' example' : '');
      item.dataset.key = presetKey(p);
      const ls = presetLayers(p), im = presetImgs(p);
      if (ls) item.dataset.lkey = layoutKey(ls);
      if (im) item.dataset.tkey = tfKey(presetTf(p));
      const tb = document.createElement('div');
      tb.className = 'preset-thumb';
      tb.title = t('b_apply');
      const c = document.createElement('canvas');
      renderPresetThumb(c, p);
      // its images load from IndexedDB: draw it again once they're in
      const ids = imgIds(im);
      if ((ls && ls.some((L) => !(L.id in pImgs))) || ids.some((id) => !(id in pImgs))) {
        Promise.all([loadPresetImages(ls || []), loadImgAssets(ids)]).then(() => { renderPresetThumb(c, p); requestRender(); });
      }
      tb.appendChild(c);
      tb.addEventListener('click', () => applyPreset(name));
      const body = document.createElement('div');
      body.className = 'preset-body';
      const nm = document.createElement('div');
      nm.className = 'preset-name';
      nm.textContent = name;
      const meta = document.createElement('div');
      meta.className = 'preset-meta';
      meta.textContent = '// ' + [p.example ? t('p_example') : presetStamp(p.savedAt),
        t('bl_' + p.blank.replace(/-/g, '_')), ls && ls.length ? '+' + ls.length + ' ' + t('l_logo') : '',
        p.out ? '+OUT' : ''].filter(Boolean).join(' · ');
      const acts = document.createElement('div');
      acts.className = 'preset-actions';
      const mk = (cls, attr, html, title) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn ' + cls;
        b.setAttribute(attr, '');
        b.setAttribute('data-augmented-ui', 'tl-clip br-clip border');
        b.innerHTML = html;
        if (title) { b.title = title; b.setAttribute('aria-label', title); }
        acts.appendChild(b);
        return b;
      };
      mk('btn-alt', 'data-apply', t('b_apply')).addEventListener('click', () => applyPreset(name));
      if (!p.example) { // the examples are read-only
        mk('btn-icon', 'data-override', SAVE_SVG, t('t_poverride')).addEventListener('click', () => {
          if (confirm(tv('c_poverwrite', { n: name }))) storePreset(name);
        });
        mk('btn-icon btn-warn', 'data-del', TRASH_SVG, t('t_pdelete')).addEventListener('click', () => {
          if (!confirm(tv('c_pdelete', { n: name }))) return;
          const all = loadPresets();
          dropPresetImages(all[name]);
          delete all[name];
          savePresets(all);
          buildPresetList();
          setStatus(tv('s_pdeleted', { n: name }));
        });
      }
      body.append(nm, meta, acts);
      item.append(tb, body);
      box.appendChild(item);
    });
    markActivePreset();
    requestRender();
    updateStorage();
  }
  // how much of the browser's storage this site holds (the images live in
  // IndexedDB) against what the browser allows it; hidden where unknown
  const fmtBytes = (n) => {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + ' ' + u[i];
  };
  function updateStorage() {
    const el = $('storageMeter');
    if (!navigator.storage || !navigator.storage.estimate) { el.hidden = true; return; }
    navigator.storage.estimate().then(({ usage = 0, quota = 0 }) => {
      if (!quota) { el.hidden = true; return; }
      const f = Math.min(1, usage / quota);
      el.hidden = false;
      el.classList.toggle('warn', f > 0.8);
      $('storageBar').style.width = Math.max(f * 100, usage ? 0.5 : 0).toFixed(2) + '%';
      $('storageVal').textContent = tv('l_storefree', { u: fmtBytes(usage), f: fmtBytes(Math.max(0, quota - usage)) });
      el.title = tv('t_storage', { q: fmtBytes(quota) });
    }).catch(() => { el.hidden = true; });
  }
  const panelOpen = () => $('sidePresets').classList.contains('open');
  // the thumbnails show today's photo and the webfont: redraw them once either loads
  const refreshPresets = () => { if (panelOpen()) buildPresetList(); };
  // the current document matches a preset: highlight it (cheap, no thumbnails)
  function markActivePreset() {
    if (!panelOpen()) return;
    $('presetList').querySelectorAll('.preset-item').forEach((el) => el.classList.toggle('active', matchesNow(el.dataset.key, el.dataset.lkey, el.dataset.tkey)));
  }
  // the document now (sync), then a copy of each image under a fresh id; the
  // preset it replaces lets go of its own copies. Out of room (IndexedDB
  // refuses a copy): nothing is saved and the copies made go again.
  function storePreset(name) {
    const p = { blank: S.blank, doc: clone(S.doc), style: clone(S.style), tf: clone(S.tf), savedAt: Date.now() };
    if ($('presetWithOut').checked) p.out = clone(S.out);
    // a refused copy marks the save failed, but every copy settles first, so
    // the clean-up sees them all
    const written = [];
    let failed = false;
    const copy = (from, prefix, img) => SINFORGE.idb.get('assets', from).then((blob) => {
      if (!blob) return null;
      const id = newLogoId();
      return SINFORGE.idb.put('assets', prefix + id, blob).then(() => {
        written.push(prefix + id);
        pImgs[id] = img;
        return id;
      });
    }).catch(() => { failed = true; return null; });
    const layers = (S.logos[S.blank] || []).filter((L) => S.logoImgs[L.id]).map((L) => ({ L: clone(L), img: S.logoImgs[L.id] }));
    const lic = Object.keys(S.licIcons).filter((k) => SINFORGE.licenses[k]);
    return Promise.all([
      Promise.all(layers.map(({ L, img }) => copy('logo:' + L.id, 'plogo:', img).then((id) => id && Object.assign(L, { id })))),
      S.photoIsUser ? copy('photo', 'pimg:', S.photo) : null,
      S.wmImage ? copy('watermark', 'pimg:', S.wmImage) : null,
      Promise.all(lic.map((k) => copy('lic:' + k, 'pimg:', S.licIcons[k]).then((id) => [k, id]))),
    ]).then(([ls, photo, wm, lics]) => {
      if (failed) {
        written.forEach((k) => SINFORGE.idb.del('assets', k).catch(() => {}));
        updateStorage();
        setStatus(t('s_pnospace'), 'warn');
        return;
      }
      p.logos = ls.filter(Boolean);
      p.imgs = { lic: {} };
      if (photo) p.imgs.photo = photo;
      if (wm) p.imgs.wm = wm;
      lics.forEach(([k, id]) => { if (id) p.imgs.lic[k] = id; });
      const all = loadPresets();
      dropPresetImages(all[name]);
      all[name] = p;
      savePresets(all);
      buildPresetList();
      setStatus(tv('s_psaved', { n: name }), 'ok');
    });
  }
  function savePresetFromInput() {
    const input = $('presetName'), name = input.value.trim().toUpperCase();
    if (!name) { setStatus(t('s_pnamereq'), 'warn'); input.focus(); return; }
    if (loadPresets()[name] && !confirm(tv('c_poverwrite', { n: name }))) return;
    storePreset(name);
    input.value = '';
  }
  // Applying replaces the whole document: ask first when the current one isn't
  // kept in any preset (its text / elements would be lost).
  function applyPreset(name) {
    const all = allPresets(), p = all[name];
    if (!p) return;
    if (!Object.keys(all).some((n) => presetMatches(all[n])) && !confirm(tv('c_papply', { n: name }))) return;
    const s = presetState(p), ls = presetLayers(p);
    if (ls) {
      // the blank's elements make way for copies of the preset's (new ids:
      // the card's layers and the preset's never share an upload)
      (S.logos[s.blank] || []).map((L) => L.id).forEach(removeLogo);
      S.logos[s.blank] = ls.map((pl) => {
        const L = Object.assign(clone(pl), { id: newLogoId() });
        SINFORGE.idb.get('assets', 'plogo:' + pl.id).then((blob) => {
          if (!blob) { removeLogo(L.id); return; }
          return SINFORGE.idb.put('assets', 'logo:' + L.id, blob)
            .then(() => blobToCanvas(blob))
            .then((c) => { setLogoImage(L, c); buildLogoPick(); requestRender(); });
        }).catch(() => removeLogo(L.id));
        return L;
      });
      persist.logos();
    }
    const im = presetImgs(p);
    if (im) applyImages(p, im);
    S.blank = s.blank;
    S.doc = s.doc;
    S.style = s.style;
    if (p.out && typeof p.out === 'object') merge(S.out, p.out);
    sanitize();
    S.logoSel = null;
    SINFORGE.save('sinforge:blank', S.blank);
    persist.doc(); persist.style(); persist.out();
    syncBlankPick();
    buildTextFields();
    SINFORGE.digital.set(S.out.digital); // its switch + backdrop swatches
    syncControls();
    requestRender();
    setStatus(tv('s_papplied', { n: name }), 'ok');
  }
  // the preset's photo (+ framing), watermark image and license icons replace
  // the card's: each copied back to its own IndexedDB key. A newer apply wins
  // over the copies still under way.
  let applySeq = 0;
  function applyImages(p, im) {
    const seq = ++applySeq, live = () => seq === applySeq;
    const copyBack = (id, key, use) => SINFORGE.idb.get('assets', 'pimg:' + id).then((blob) => {
      if (!blob || !live()) return;
      return SINFORGE.idb.put('assets', key, blob).then(() => blobToCanvas(blob)).then((c) => { if (live()) use(c); });
    }).catch(() => {});
    S.tf = presetTf(p);
    persist.tf();
    if (im.photo) copyBack(im.photo, 'photo', (c) => setPhoto(c, true));
    else {
      SINFORGE.idb.del('assets', 'photo').catch(() => {});
      if (S.photoIsUser) useDoggo();
    }
    if (im.wm) copyBack(im.wm, 'watermark', (c) => { S.wmImage = c; requestRender(); });
    else {
      S.wmImage = null;
      SINFORGE.idb.del('assets', 'watermark').catch(() => {});
    }
    Object.keys(S.licIcons).forEach((k) => {
      if (im.lic[k]) return;
      delete S.licIcons[k];
      SINFORGE.idb.del('assets', 'lic:' + k).catch(() => {});
    });
    Object.keys(im.lic).forEach((k) => copyBack(im.lic[k], 'lic:' + k, (c) => {
      c.__id = ++photoSeq; // icon cache key in render.js
      S.licIcons[k] = c;
      refreshLicense(k);
    }));
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // element images travel inside the JSON as data URLs (layer.src)
  const blobToDataUrl = (blob) => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  function dataUrlToBlob(url) {
    const m = /^data:(image\/[\w.+-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(String(url));
    if (!m) return null;
    const bin = atob(m[2].replace(/\s+/g, '')), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  }
  function exportPresets() {
    const all = loadPresets();
    const url = (key) => SINFORGE.idb.get('assets', key).then((blob) => (blob ? blobToDataUrl(blob) : null)).catch(() => null);
    Promise.all(Object.keys(all).map((name) => {
      const p = all[name], im = presetImgs(p), q = Object.assign({}, p);
      all[name] = q;
      return Promise.all([
        Array.isArray(p.logos) && Promise.all(p.logos.map((L) => url('plogo:' + L.id).then((src) => src && Object.assign({}, L, { src }))))
          .then((ls) => { q.logos = ls.filter(Boolean); }),
        im && Promise.all([im.photo && url('pimg:' + im.photo), im.wm && url('pimg:' + im.wm),
          Promise.all(Object.keys(im.lic).map((k) => url('pimg:' + im.lic[k]).then((src) => [k, src])))])
          .then(([photo, wm, lics]) => {
            q.imgs = { lic: {} };
            if (photo) q.imgs.photo = photo;
            if (wm) q.imgs.wm = wm;
            lics.forEach(([k, src]) => { if (src) q.imgs.lic[k] = src; });
          }),
      ]);
    })).then(() => {
      const body = JSON.stringify({ app: 'sinforge', kind: 'presets', version: 1, presets: all }, null, 2);
      download(new Blob([body], { type: 'application/json' }), 'sinforge_presets.json');
    }).catch(() => setStatus(t('st_fail'), 'warn'));
  }
  function importPresets(file) {
    file.text().then((txt) => {
      const data = JSON.parse(txt), src = data && (data.presets || data);
      const found = [];
      Object.keys(src || {}).forEach((name) => {
        const p = src[name];
        if (!validPreset(p)) return;
        const key = String(name).trim().toUpperCase().slice(0, 24);
        if (!key) return;
        const q = { blank: p.blank, doc: p.doc, style: p.style, savedAt: Number(p.savedAt) || Date.now() };
        if (p.out && typeof p.out === 'object') q.out = p.out;
        if (p.tf && typeof p.tf === 'object') q.tf = p.tf;
        // an image (data URL) -> IndexedDB under a fresh id
        const put = (src) => {
          const blob = dataUrlToBlob(src), id = newLogoId();
          return blob ? SINFORGE.idb.put('assets', 'pimg:' + id, blob).then(() => id) : Promise.resolve(null);
        };
        const im = p.imgs && typeof p.imgs === 'object' ? p.imgs : null, lic = im && im.lic && typeof im.lic === 'object' ? im.lic : {};
        const imgsDone = im && Promise.all([put(im.photo), put(im.wm),
          Promise.all(Object.keys(lic).filter((k) => SINFORGE.licenses[k]).map((k) => put(lic[k]).then((id) => [k, id])))])
          .then(([photo, wm, lics]) => {
            q.imgs = { lic: {} };
            if (photo) q.imgs.photo = photo;
            if (wm) q.imgs.wm = wm;
            lics.forEach(([k, id]) => { if (id) q.imgs.lic[k] = id; });
          });
        // each element's image goes to IndexedDB under a fresh id
        const ls = Array.isArray(p.logos) ? p.logos.filter((L) => L && typeof L === 'object') : null;
        found.push(Promise.all((ls || []).map((L) => {
          const blob = dataUrlToBlob(L.src);
          if (!blob) return null;
          const n = SINFORGE.newLogo(newLogoId());
          merge(n, Object.assign({}, L, { id: n.id }));
          return SINFORGE.idb.put('assets', 'plogo:' + n.id, blob).then(() => n, () => null);
        })).then((layers) => {
          if (ls) q.logos = layers.filter(Boolean);
          return imgsDone;
        }).then(() => [key, q]));
      });
      if (!found.length) throw new Error('empty');
      return Promise.all(found).then((pairs) => {
        const all = loadPresets();
        pairs.forEach(([key, q]) => { dropPresetImages(all[key]); all[key] = q; });
        savePresets(all);
        buildPresetList();
        setStatus(tv('s_pimported', { n: pairs.length }), 'ok');
      });
    }).catch(() => setStatus(t('s_pimportfail'), 'warn'));
  }
  // the side panel: its edge tab slides it in / out; Esc or a press outside closes it
  function setPresetsOpen(on) {
    const p = $('sidePresets'), tab = $('presetsToggle');
    p.classList.toggle('open', on);
    tab.setAttribute('aria-expanded', on ? 'true' : 'false');
    $('presetsArrow').textContent = on ? '<' : '>';
    SINFORGE.save('sinforge:panel', on ? 'presets' : '');
    if (on) buildPresetList();
  }
  function bindPresets() {
    $('presetsToggle').addEventListener('click', () => setPresetsOpen(!panelOpen()));
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panelOpen() && $('cropModal').hidden && $('licModal').hidden) setPresetsOpen(false);
    });
    document.addEventListener('pointerdown', (e) => {
      if (panelOpen() && !$('sidePresets').contains(e.target)) setPresetsOpen(false);
    });
    $('presetSave').addEventListener('click', savePresetFromInput);
    $('presetName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); savePresetFromInput(); } });
    $('presetWithOut').checked = (() => { try { return localStorage.getItem('sinforge:presetOut') === '1'; } catch (e) { return false; } })();
    $('presetWithOut').addEventListener('change', (e) => SINFORGE.save('sinforge:presetOut', e.target.checked ? '1' : '0'));
    $('presetShowEx').checked = showExamples();
    $('presetShowEx').addEventListener('change', (e) => { SINFORGE.save('sinforge:showExamples', e.target.checked ? '1' : '0'); buildPresetList(); });
    $('presetExport').addEventListener('click', exportPresets);
    $('presetImport').addEventListener('click', () => $('presetFile').click());
    $('presetFile').addEventListener('change', (e) => { if (e.target.files[0]) importPresets(e.target.files[0]); e.target.value = ''; });
    document.addEventListener('sinforge:lang', refreshPresets); // the blank names in the meta lines
    const was = (() => { try { return localStorage.getItem('sinforge:panel'); } catch (e) { return ''; } })();
    setPresetsOpen(was === 'presets');
  }

  // ---- export ----
  function fileName() {
    const slug = [S.doc.name1, S.doc.name2].join('-').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `sinforge-${slug || 'document'}${S.out.digital ? '-digital' : ''}-${S.out.scale}x.png`;
  }
  // The document as a PNG Blob at the chosen scale — in DIGITAL mode the
  // rendered card composed into its scene (js/digital.js). Rejects on a tainted
  // canvas (opened via file://) or a failed encode.
  function pngBlob() {
    return new Promise((res, rej) => {
      const card = SINFORGE.renderCanvas(S.out.scale);
      const c = S.out.digital ? SINFORGE.digital.compose(card) : card;
      c.toBlob((blob) => (blob ? res(blob) : rej(new Error('encode'))), 'image/png');
    });
  }
  function exportPng() {
    const name = fileName();
    pngBlob().then((blob) => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus(t('st_exported').replace('{f}', name), 'ok');
    }).catch(() => setStatus(t('st_fail'), 'warn'));
  }
  function copyPng() {
    if (!navigator.clipboard || typeof ClipboardItem === 'undefined') { setStatus(t('st_copyfail'), 'warn'); return; }
    // Hand the clipboard a Promise of the Blob (not the Blob itself) so Safari
    // still counts the write as part of the click.
    navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob() })])
      .then(() => setStatus(t('st_copied'), 'ok'))
      .catch(() => setStatus(t('st_copyfail'), 'warn'));
  }

  // ---- init ----
  function init() {
    restore();
    buildBlankSelect();
    buildFramePick();
    buildCodePick();
    buildChipPick();
    buildDatePick();
    buildTextFields();
    buildSchemes();
    bindControls();
    bindStage();
    bindPops();
    bindPalette();
    bindLicEditor();
    bindLogos();
    bindDropPaste();
    SINFORGE.digital.init();
    bindPresets();
    document.addEventListener('sinforge:digital', syncControls);
    syncControls();
    requestRender();
    // canvas text needs the webfont actually loaded: re-render once it is
    Promise.all([`700 64px ${C.FONT}`, `400 44px ${C.FONT}`].map((f) => document.fonts.load(f)))
      .catch(() => {}).then(() => { requestRender(); refreshPresets(); });
    restorePhoto();
    restoreWatermark();
    restoreLogos();
    restoreLicenseIcons();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.SINFORGE);
