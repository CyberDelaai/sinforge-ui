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
  };
  function restore() {
    const b = (() => { try { return localStorage.getItem('sinforge:blank'); } catch (e) { return null; } })();
    if (b && SINFORGE.blanks[b]) S.blank = b;
    merge(S.doc, load('sinforge:doc'));
    merge(S.style, load('sinforge:style'));
    merge(S.tf, load('sinforge:tf'));
    merge(S.out, load('sinforge:out'));
    merge(S.names, load('sinforge:names'));
    if (S.out.scale !== 1 && S.out.scale !== 2) S.out.scale = 1;
    if (!SINFORGE.frames[S.style.frame]) S.style.frame = 'notch';
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
  }
  function useDoggo() {
    return loadImage(C.DOGGO).then((img) => setPhoto(toSourceCanvas(img), false)).catch(() => {});
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
  // ---- logo (a blank with a logo slot; kept in IndexedDB as 'logo') ----
  function loadLogo(file) {
    if (!file || !/^image\//.test(file.type)) { setStatus(t('st_badimg'), 'warn'); return; }
    blobToCanvas(file).then((c) => {
      S.logo = c;
      resetLogoTf();
      setStatus(t('st_logo'), 'ok');
      SINFORGE.idb.put('assets', 'logo', file).catch(() => {});
    }).catch(() => setStatus(t('st_badimg'), 'warn'));
  }
  // back to the logo's default placement: contained in its slot, top-left
  function resetLogoTf() {
    Object.assign(S.style, { logoX: 0, logoY: 0, logoZoom: 1 });
    persist.style(); requestRender();
  }
  function restoreLogo() {
    return SINFORGE.idb.get('assets', 'logo')
      .then((blob) => blob && blobToCanvas(blob).then((c) => { S.logo = c; requestRender(); }))
      .catch(() => {});
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
    $('logoSec').hidden = !blank().logo;
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
    // colour swatches open their hidden colour input
    document.querySelectorAll('[data-pick]').forEach((btn) => {
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
    $('logoUploadBtn').addEventListener('click', () => $('logoFileInput').click());
    $('logoFileInput').addEventListener('change', (e) => { loadLogo(e.target.files[0]); e.target.value = ''; });
    $('logoClearBtn').addEventListener('click', () => {
      S.logo = null;
      SINFORGE.idb.del('assets', 'logo').catch(() => {});
      resetLogoTf();
    });
    $('logoResetBtn').addEventListener('click', resetLogoTf);
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
  // what a point on the canvas hits: 'photo', 'code' (the barcode as last
  // rendered — gfx.codeBox), 'chip' (gfx.chipBox), 'dna' (gfx.dnaBox), 'logo'
  // (gfx.logoBox), 'date', 'license' or null
  function hitAt(p) {
    if (inPhoto(p)) return 'photo';
    if (inBox(p, SINFORGE.gfx.codeBox)) return 'code';
    if (inBox(p, SINFORGE.gfx.chipBox)) return 'chip';
    if (inBox(p, SINFORGE.gfx.dnaBox)) return 'dna';
    if (inBox(p, SINFORGE.gfx.logoBox)) return 'logo';
    if (licenseAt(p)) return 'license';
    return dateAt(p) ? 'date' : null;
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
  // revokes it; nor the logo slot: a click on an empty one opens the logo
  // upload, a logo in it is dragged / wheel-zoomed like the photo)
  const STAGE_POPS = { photo: 'framePop', code: 'codePop', chip: 'chipPop', date: 'datePop' };
  const HINTS = { photo: 'hint_frame', code: 'hint_code', chip: 'hint_chip', date: 'hint_date', dna: 'hint_dna', license: 'hint_lic', logo: 'hint_logoslot' };
  const BOXES = { code: 'codeBox', chip: 'chipBox', dna: 'dnaBox', logo: 'logoBox' };
  // hover marker: the photo window's outline (or the barcode's / chip's /
  // the hovered date's / license tile's box) laid over the canvas; a license
  // tile also gets the edit pencil on its top-right corner and, when it's
  // customised, the reset button on its top-left
  function showHover(hit, p) {
    const svg = $('photoHover'), pen = $('licPenStage'), rst = $('licResetStage');
    $('docCanvas').classList.toggle('over-photo', !!hit);
    $('docCanvas').title = hit ? t(hit === 'logo' && S.logo ? 'hint_logomove' : HINTS[hit]) : '';
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
    svg.setAttribute('viewBox', `0 0 ${B.w} ${B.h}`);
    Object.assign(svg.style, {
      left: d.left - s.left + 'px', top: d.top - s.top + 'px',
      width: B.w * d.f + 'px', height: B.h * d.f + 'px',
    });
    const c = hit === 'date' ? dateAt(p) : hit === 'license' ? licenseAt(p) : SINFORGE.gfx[BOXES[hit]];
    const pad = hit === 'date' ? DATE_PAD : hit === 'license' ? 4 : 8;
    const poly = hit === 'photo' ? B.photo.poly
      : [[c.x - pad, c.y - pad], [c.x + c.w + pad, c.y - pad], [c.x + c.w + pad, c.y + c.h + pad], [c.x - pad, c.y + c.h + pad]];
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
      if (!hit) return;
      // a press that barely moves is a click (its picker); more drags the photo
      const [tx, ty] = hit === 'logo' ? [S.style.logoX, S.style.logoY]
        : hit === 'wm' ? [S.style.wmX, S.style.wmY] : [S.tf.x, S.tf.y];
      drag = {
        hit, lic: hit === 'license' && licenseAt(p).key, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY,
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
      const logo = drag.hit === 'logo';
      if (logo ? !S.logo : drag.hit !== 'photo' || !S.photo) return;
      if (!drag.moved) { drag.moved = true; cv.classList.add('dragging'); showHover(null); }
      if (logo) {
        const b = SINFORGE.gfx.logoBox;
        S.style.logoX = clamp(drag.tx + (p.x - drag.x) / b.w, -2, 2);
        S.style.logoY = clamp(drag.ty + (p.y - drag.y) / b.h, -2, 2);
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
      if (moved) (hit === 'logo' || hit === 'wm' ? persist.style : persist.tf)();
      else if (hit === 'wm') closeStagePops();
      else if (hit === 'dna') {
        closeStagePops();
        S.style.dnaText = !S.style.dnaText;
        persist.style(); requestRender();
      } else if (hit === 'license') {
        closeStagePops();
        toggleLicense(lic);
      } else if (hit === 'logo') {
        closeStagePops();
        if (!S.logo) $('logoFileInput').click();
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
      const p = docPoint(e), lb = SINFORGE.gfx.logoBox;
      if (S.logo && inBox(p, lb)) {
        // zoom the logo about the point under the pointer
        e.preventDefault();
        const st = S.style, r0 = SINFORGE.gfx.logoRect(lb, st, S.logo);
        const z = clamp(st.logoZoom * Math.exp(-e.deltaY * 0.0015), 0.2, 5), q = z / st.logoZoom;
        st.logoZoom = z;
        st.logoX = clamp((p.x - (p.x - r0.x) * q - lb.x) / lb.w, -2, 2);
        st.logoY = clamp((p.y - (p.y - r0.y) * q - lb.y) / lb.h, -2, 2);
        persist.style(); requestRender();
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
    document.querySelectorAll('.stage-tool[aria-controls]').forEach((btn) => {
      const on = btn.getAttribute('aria-controls') === (pop && pop.id);
      $(btn.getAttribute('aria-controls')).hidden = !on;
      btn.setAttribute('aria-expanded', on ? 'true' : 'false');
    });
  }
  function bindPops() {
    document.querySelectorAll('.stage-tool[aria-controls]').forEach((btn) => {
      const pop = $(btn.getAttribute('aria-controls'));
      btn.addEventListener('click', () => setPopOpen(pop.hidden ? pop : null));
      pop.querySelector('.adj-close').addEventListener('click', () => { setPopOpen(null); btn.focus(); });
    });
    const anyOpen = () => document.querySelector('.adj-pop:not([hidden])');
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && anyOpen()) setPopOpen(null); });
    // a press anywhere outside the open window closes it (its icon toggles it)
    document.addEventListener('pointerdown', (e) => {
      const pop = anyOpen();
      if (!pop || pop.contains(e.target)) return;
      if (e.target.closest(`.stage-tool[aria-controls="${pop.id}"]`)) return;
      setPopOpen(null);
    });
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
    bindLicEditor();
    bindDropPaste();
    SINFORGE.digital.init();
    document.addEventListener('sinforge:digital', syncControls);
    syncControls();
    requestRender();
    // canvas text needs the webfont actually loaded: re-render once it is
    Promise.all([`700 64px ${C.FONT}`, `400 44px ${C.FONT}`].map((f) => document.fonts.load(f)))
      .catch(() => {}).then(requestRender);
    restorePhoto();
    restoreWatermark();
    restoreLogo();
    restoreLicenseIcons();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.SINFORGE);
