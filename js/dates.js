(function (SINFORGE) {
  'use strict';
  // ---- Date formats, shared by every blank: date slots hold YYYY-MM-DD (what the
  // GENERATE buttons write) and the card prints them in the selected format
  // (S.style.dateFmt). SINFORGE.dateFormats[key]({ y, m, d }) -> string, plus
  // SINFORGE.dateOrder. Clicking a date on the stage pops up the picker. Month
  // names stay English, like the printed captions. Add a format by adding an
  // entry + its key to dateOrder (its example is its own name in the picker). ----
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const p2 = (n) => String(n).padStart(2, '0');
  const yy = (y) => p2(y % 100);

  SINFORGE.dateFormats = {
    iso: ({ y, m, d }) => `${y}-${p2(m)}-${p2(d)}`,
    dmy: ({ y, m, d }) => `${p2(d)}.${p2(m)}.${y}`,
    mdy: ({ y, m, d }) => `${p2(m)}/${p2(d)}/${y}`,
    dmon: ({ y, m, d }) => `${p2(d)} ${MON[m - 1]} ${y}`,
    icao: ({ y, m, d }) => `${p2(d)}${MON[m - 1]}${yy(y)}`,
    compact: ({ y, m, d }) => `${y}${p2(m)}${p2(d)}`,
  };
  SINFORGE.dateOrder = ['iso', 'dmy', 'mdy', 'dmon', 'icao', 'compact'];

  // YYYY-MM-DD (also / or . between, 1–2 digit month / day) -> { y, m, d }, else null
  SINFORGE.parseDate = function parseDate(s) {
    const r = String(s || '').trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!r) return null;
    const y = +r[1], m = +r[2], d = +r[3];
    return m >= 1 && m <= 12 && d >= 1 && d <= 31 ? { y, m, d } : null;
  };
  // A slot's value in the selected format; anything that isn't a date prints as typed.
  SINFORGE.fmtDate = function fmtDate(s, key) {
    const dt = SINFORGE.parseDate(s);
    const f = SINFORGE.dateFormats[key] || SINFORGE.dateFormats.iso;
    return dt ? f(dt) : s;
  };
})(window.SINFORGE);
