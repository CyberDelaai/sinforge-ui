// SINFORGE — main UI controller. Everything runs inside one IIFE and reads/writes
// the shared state via `const S = SINFORGE.state;`. As it grows, organize it into
// clearly-marked `// ---- section ----` blocks, the same convention the other
// cyberdeck.tools apps follow.
(function (SINFORGE) {
  'use strict';
  const $ = SINFORGE.$;
  const S = SINFORGE.state; // eslint-disable-line no-unused-vars

  // ---- helpers ----
  function setStatus(msg, kind) {
    const el = $('status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'status' + (kind ? ' ' + kind : '');
  }

  // ---- restore persisted settings (sinforge:* keys) ----
  function restore() {
    // Add one line per persisted setting, e.g.:
    // S.size = parseInt(localStorage.getItem('sinforge:size') || S.size, 10);
  }

  // ---- init ----
  function init() {
    restore();
    setStatus('');
  }

  document.addEventListener('DOMContentLoaded', init);
})(window.SINFORGE);
