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
  function restoreWatermark() {
    return SINFORGE.idb.get('assets', 'watermark')
      .then((blob) => blob && blobToCanvas(blob).then((c) => { S.wmImage = c; requestRender(); }))
      .catch(() => {});
  }

  // ---- left panel: blank picker + text slots built from the blank ----
  function buildBlankSelect() {
    const sel = $('blankSel');
    sel.innerHTML = '';
    SINFORGE.blankOrder.forEach((key) => {
      const o = document.createElement('option');
      const k = 'bl_' + key.replace(/-/g, '_');
      o.value = key;
      o.textContent = t(k);
      o.setAttribute('data-i18n', k);
      sel.appendChild(o);
    });
    sel.value = S.blank;
    sel.onchange = () => {
      S.blank = sel.value;
      SINFORGE.save('sinforge:blank', S.blank);
      buildTextFields();
      syncControls();
      requestRender();
    };
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
      b.style.background = `linear-gradient(90deg, ${sc.card} 0 50%, ${sc.ink} 50% 80%, ${sc.accent} 80%)`;
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
  function needsMet(expr) {
    const m = expr.match(/^(\w+)(?:([=!])(\w+))?$/);
    if (!m) return true;
    const v = S.style[m[1]];
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
    ['stripes', 'slashes', 'barcode', 'edge'].forEach((k) => {
      const sw = document.querySelector(`.side-switch[data-style="${k}"]`);
      if (sw) sw.closest('.fx-toggle').hidden = !decor.includes(k);
    });
    $('zoomRange').value = Math.round(S.tf.zoom * 100);
    $('zoomVal').textContent = Math.round(S.tf.zoom * 100) + '%';
    $('scaleSwitch').dataset.pos = S.out.scale === 2 ? 'right' : 'left';
    $('sizeVal').textContent = `${blank().w * S.out.scale}×${blank().h * S.out.scale}`;
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

  // ---- stage: drag the photo to pan, wheel to zoom ----
  function docPoint(e) {
    const cv = $('docCanvas'), r = cv.getBoundingClientRect(), B = blank();
    return { x: ((e.clientX - r.left) / r.width) * B.w, y: ((e.clientY - r.top) / r.height) * B.h, r };
  }
  function inPhoto(p) {
    const b = blank().photo.box;
    return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
  }
  function bindStage() {
    const cv = $('docCanvas');
    let drag = null;
    cv.addEventListener('pointerdown', (e) => {
      const p = docPoint(e);
      if (!inPhoto(p) || !S.photo) return;
      drag = { x: p.x, y: p.y, tx: S.tf.x, ty: S.tf.y };
      cv.setPointerCapture(e.pointerId);
      cv.classList.add('dragging');
    });
    cv.addEventListener('pointermove', (e) => {
      const p = docPoint(e);
      if (!drag) { cv.classList.toggle('over-photo', inPhoto(p) && !!S.photo); return; }
      const b = blank().photo.box;
      S.tf.x = clamp(drag.tx + (p.x - drag.x) / b.w, -3, 3);
      S.tf.y = clamp(drag.ty + (p.y - drag.y) / b.h, -3, 3);
      requestRender();
    });
    const end = () => {
      if (!drag) return;
      drag = null;
      cv.classList.remove('dragging');
      persist.tf();
    };
    cv.addEventListener('pointerup', end);
    cv.addEventListener('pointercancel', end);
    cv.addEventListener('wheel', (e) => {
      if (!inPhoto(docPoint(e)) || !S.photo) return;
      e.preventDefault();
      S.tf.zoom = clamp(S.tf.zoom * Math.exp(-e.deltaY * 0.0015), 1, 5);
      persist.tf(); syncControls(); requestRender();
    }, { passive: false });
  }

  // ---- EFFECTS / WATERMARK / PHOTO FX windows: the stage's top-left icons open them
  // (one at a time), floating over the column to the left of the canvas
  // (EIDOLON's COLOUR window). An icon names its window in aria-controls. ----
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
    // stays open while working on the canvas; a press anywhere else closes it
    document.addEventListener('pointerdown', (e) => {
      if (anyOpen() && !$('stageShell').contains(e.target)) setPopOpen(null);
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
      if (f) loadUserPhoto(f);
    });
    document.addEventListener('paste', (e) => {
      if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
      const item = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
      if (item) loadUserPhoto(item.getAsFile());
    });
  }

  // ---- export ----
  function fileName() {
    const slug = [S.doc.name1, S.doc.name2].join('-').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return `sinforge-${slug || 'document'}-${S.out.scale}x.png`;
  }
  // The document as a PNG Blob at the chosen scale. Rejects on a tainted canvas
  // (opened via file://) or a failed encode.
  function pngBlob() {
    return new Promise((res, rej) => {
      const c = SINFORGE.renderCanvas(S.out.scale);
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
    buildTextFields();
    buildSchemes();
    bindControls();
    bindStage();
    bindPops();
    bindDropPaste();
    syncControls();
    requestRender();
    // canvas text needs the webfont actually loaded: re-render once it is
    Promise.all([`700 64px ${C.FONT}`, `400 44px ${C.FONT}`].map((f) => document.fonts.load(f)))
      .catch(() => {}).then(requestRender);
    restorePhoto();
    restoreWatermark();
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.SINFORGE);
