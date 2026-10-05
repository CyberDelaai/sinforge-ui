// SINFORGE shared namespace + tiny DOM helper. Loaded first; every other
// module attaches to window.SINFORGE.
window.SINFORGE = window.SINFORGE || {};
SINFORGE.$ = (id) => document.getElementById(id);

// Constants shared across modules.
SINFORGE.const = {
  MAX_SOURCE: 2048,   // uploaded images are downscaled to this longest edge
  FONT: 'Quantico',   // the document typeface (Google Fonts, 400 + 700)
  DOGGO: 'examples/cyber-doggo.webp', // default photo: the cyberdeck.tools mascot
};

// Silent localStorage setter — blocked storage (private mode, file:// quirks)
// must never break the app.
SINFORGE.save = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

// Colour schemes offered as one-click presets: card / ink / accent.
SINFORGE.schemes = {
  paper:  { card: '#ffffff', ink: '#050507', accent: '#ff1a2e' },
  night:  { card: '#0b0b10', ink: '#00f0ff', accent: '#fcee0a' },
  toxic:  { card: '#c8ff00', ink: '#0b0b10', accent: '#ff003c' },
  blood:  { card: '#16070a', ink: '#ff003c', accent: '#e8e8ee' },
  chrome: { card: '#c9ccd4', ink: '#14141c', accent: '#00a8ff' },
  sunset: { card: '#ff9e3d', ink: '#1a0a2e', accent: '#ffffff' },
};

// Default document text (the active blank's text slots, keyed by slot id).
SINFORGE.newDoc = () => ({
  number: 'SIN-0304-7731',
  role: 'SPONSOR',
  title: 'MR',
  name1: 'CYBER',
  name2: 'DOGGO',
  footer: 'ACCESS // ALL AREAS',
});

// Default look: colours, decorations, photo + card effects.
SINFORGE.newStyle = () => ({
  ...SINFORGE.schemes.paper,
  // decorations (on/off)
  stripes: true,   // hazard stripe columns along the side recesses
  slashes: true,   // slanted bars after the badge number
  barcode: true,   // barcode in the bottom-right corner (encodes the number)
  edge: true,      // ink line along the outer edge
  // photo effect: 'none' | 'mono' (threshold) | 'halftone' | 'dither'
  photoFx: 'halftone',
  photoLevel: 50,  // threshold / brightness bias, 0..100
  photoDot: 10,    // halftone cell size, px at 1x
  // watermark: covers the card background only (under every element, never
  // inside the photo window). 'off' | 'text' (tiled diagonally) | 'image' (one, centred)
  wm: 'off',
  wmText: 'CYBERDECK.TOOLS',
  wmAmt: 15,       // potency (opacity), %
  wmScale: 100,    // size of the text / tiles / image, % of the default
  wmRot: -30,      // rotation in degrees, -180..180 (negative = counter-clockwise)
  wmTone: 'ink',   // colour: 'ink' | 'accent' | 'custom' (then wmColor)
  wmColor: '#7a7a88',
  wmTint: true,    // image mode: recolour the image in the tone
  wmTile: true,    // image mode: repeat it in a staggered grid (off = one, centred)
  wmBlend: 'smart', // image mode: 'normal' | 'smart' (multiply on light cards, screen on dark)
  wmInvert: false, // image mode: invert the image's colours (only without tint)
  // card effects
  glow: false, glowAmt: 40,   // neon halo around the card (accent colour)
  grain: false, grainAmt: 25, // print grain, %
  scan: false, scanAmt: 25,   // scanlines, %
});

// Default name-generator settings (js/names.js). `key` is the user's own
// Behind the Name API key — optional, kept only in this browser.
SINFORGE.newNames = () => ({
  gender: 'any',   // 'any' | 'm' | 'f'
  region: 'any',   // key into the regions of js/names.js
  key: '',
});

// Default photo framing: offsets as fractions of the photo frame, zoom >= 1 (cover).
SINFORGE.newTransform = () => ({ x: 0, y: 0, zoom: 1 });

// ---- Working-area state: the single source of mutable state. Every module
// aliases it as `const S = SINFORGE.state;` and reads/writes S.<field>.
// Persisted fields live in localStorage under `sinforge:*` keys; restore() in
// js/app.js merges saved values over these defaults by key + type, so a new
// field only needs its default here. ----
SINFORGE.state = {
  lang: 'en',                     // UI language (persisted as sinforge:lang by js/i18n.js)
  blank: 'event-badge',           // key into SINFORGE.blanks (sinforge:blank)
  doc: SINFORGE.newDoc(),         // text slots (sinforge:doc)
  style: SINFORGE.newStyle(),     // look (sinforge:style)
  tf: SINFORGE.newTransform(),    // photo framing (sinforge:tf)
  out: { scale: 1 },              // export scale: 1 | 2 (sinforge:out)
  names: SINFORGE.newNames(),     // name-generator settings (sinforge:names)
  photo: null,                    // source canvas of the photo (user upload in IndexedDB, else the doggo)
  photoIsUser: false,             // true when the photo came from the user
  wmImage: null,                  // source canvas of the watermark image (IndexedDB 'watermark')
};
