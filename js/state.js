// SINFORGE shared namespace + tiny DOM helper. Loaded first; every other
// module attaches to window.SINFORGE.
window.SINFORGE = window.SINFORGE || {};
SINFORGE.$ = (id) => document.getElementById(id);

// Constants shared across modules.
SINFORGE.const = {
  // default document size, in px: CR80 ID card (85.6 x 54 mm) at 300 DPI (placeholder)
  DOC_W: 1012,
  DOC_H: 638,
};

// Silent localStorage setter — blocked storage (private mode, file:// quirks)
// must never break the app.
SINFORGE.save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

// ---- Working-area state: the single source of mutable state. Every module
// aliases it as `const S = SINFORGE.state;` and reads/writes S.<field>.
// Persisted fields live in localStorage under `sinforge:*` keys; when you add
// one, add its default here AND a restore line in js/app.js. ----
SINFORGE.state = {
  lang: 'en', // UI language (persisted as sinforge:lang by js/i18n.js)
};
