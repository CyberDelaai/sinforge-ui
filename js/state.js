// SINFORGE shared namespace + tiny DOM helper. Loaded first; every other
// module attaches to window.SINFORGE.
window.SINFORGE = window.SINFORGE || {};
SINFORGE.$ = (id) => document.getElementById(id);

// Constants shared across modules.
SINFORGE.const = {
  MAX_SOURCE: 2048,   // uploaded images are downscaled to this longest edge
  FONT: 'Quantico',   // the document typeface (Google Fonts, 400 + 700)
  // default photo: the cyberdeck.tools mascot (one folder up on a generated
  // /<lang>/ page — see make_langs.py)
  DOGGO: (document.documentElement.hasAttribute('data-url-lang') ? '../' : '') + 'examples/cyber-doggo.webp',
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
// The palette window's swatches, six to a row, per swatch (its data-palette):
// `mark` (ink / accent) — the family's neon set, softer tones, then lights +
// darks (inks for light cards); `card` — darks, lights, then bright stocks.
// Every scheme's colours are among them, so a scheme's colours show as active.
SINFORGE.palettes = {
  mark: [
    '#fcee0a', '#00f0ff', '#ff003c', '#39ff14', '#ff8800', '#c800ff',
    '#00ff9d', '#ff10f0', '#ff1a2e', '#00a8ff', '#c8ff00', '#ff9e3d',
    '#ff6b6b', '#feca57', '#1dd1a1', '#54a0ff', '#a29bfe', '#ff9ff3',
    '#ffffff', '#e8e8ee', '#c9ccd4', '#14141c', '#1a0a2e', '#050507',
  ],
  card: [
    '#050507', '#0b0b10', '#14141c', '#2a2a33', '#16070a', '#1f0510',
    '#1a0b2e', '#2b1055', '#0d1530', '#001a1f', '#0a2a2a', '#0b1f0b',
    '#ffffff', '#e8e8ee', '#c9ccd4', '#e8e4d8', '#f5f0e1', '#d8e6f0',
    '#c8ff00', '#ff9e3d', '#fcee0a', '#00f0ff', '#ff003c', '#ff9ff3',
  ],
};

// Default document text (the active blank's text slots, keyed by slot id).
SINFORGE.newDoc = () => ({
  number: 'SIN-0304-7731',
  role: 'SPONSOR',
  title: 'MR',
  name1: 'CYBER',
  name2: 'DOGGO',
  footer: 'ACCESS // ALL AREAS',
  // citizen ID
  issuer: 'CITIZEN ID // SECTOR 7',
  sex: 'M',
  metatype: 'HUMAN',
  dob: '2051-03-04',
  expires: '2084-12-31',
  district: 'NORTH HARBOR // BLOCK 12',
  status: 'CLASS C // CITIZEN',
  // license card
  authority: 'LICENSE BUREAU // SECTOR 7',
  licenseNo: 'LIC-7731-0304',
  licenses: ['firearms', 'driver', 'medic', 'detective'], // granted keys (js/licenses.js)
  licCaps: {},     // custom captions by license key (a tile's own text replaces its built-in one)
  // operator ID (org / division shared with the access pass)
  callsign: 'GHOST-7',
  position: 'OPERATOR',
  opStatus: 'TOUR ACTIVE // TIER 2 CLEARANCE',
  cardType: 'OPERATOR ID CARD',
  org: 'GHOST SYNDICATE',
  division: 'GLOBAL OPERATIONS',
  // access pass
  access: 'ALL-ACCESS',
  zone: 'SECTOR 7 // ALL LEVELS',
  handle: '@CYBERDOGGO',
  // custom blanks (js/custom.js): their text items' values, by item id
  custom: {},
});

// Default look: colours, decorations, photo + card effects.
SINFORGE.newStyle = () => ({
  ...SINFORGE.schemes.paper,
  // portrait frame: key into SINFORGE.frames (js/frames.js)
  frame: 'notch',
  // barcode type: key into SINFORGE.codes (js/codes.js)
  code: 'code128',
  // chip type: key into SINFORGE.chips (js/chips.js)
  chipType: 'contact',
  // date format the date slots print in: key into SINFORGE.dateFormats (js/dates.js)
  dateFmt: 'iso',
  // logo layers (S.logos): kept out of the photo window, so they never show
  // through a transparent photo (a 1-bit photo FX, a PNG cut-out)
  photoOverLogos: false,
  // decorations (on/off)
  stripes: true,   // hazard stripe columns along the side recesses
  slashes: true,   // slanted bars after the badge number
  barcode: true,   // barcode in the bottom-right corner (encodes the number)
  edge: true,      // ink line along the outer edge
  chip: true,      // contact chip (citizen ID)
  dna: true,       // DNA helix strip above the machine-readable zone (citizen ID)
  dnaText: false,  // the DNA strip as a letter sequence instead of the helix (click it on the stage)
  mrz: true,       // machine-readable zone along the bottom (citizen ID)
  // photo effect: 'none' | 'mono' (threshold) | 'halftone' | 'dither'
  photoFx: 'none',
  photoLevel: 50,  // threshold / brightness bias, 0..100
  photoDot: 10,    // halftone cell size, px at 1x
  // watermark: covers the card background only (under every element, never
  // inside the photo window). 'off' | 'text' (tiled diagonally) | 'image' (one, centred)
  wm: 'off',
  wmText: 'CYBERDECK.TOOLS',
  wmAmt: 15,       // potency (opacity), %
  wmScale: 100,    // size of the text / tiles / image, % of the default
  wmRot: -30,      // rotation in degrees, -180..180 (negative = counter-clockwise)
  wmOverlap: 0,    // density: how far the repeated marks close in on each other, % (-100 = twice the gaps)
  wmShift: 50,     // shift: each tile row's sideways shift from the one above, % of a tile
  wmX: 0, wmY: 0,  // its offset from the card centre, fractions of the card (stage drag)
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
  // DIGITAL mode backdrop (js/digital.js): 'auto' (the dark night) | 'custom'
  // (then digiColor — a preset swatch or a picked colour)
  digiBg: 'auto',
  digiColor: '#1a0b2e',
  digiCustom: '#2b1055', // the picker's swatch: pre-picked, then the last colour picked
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

// A new logo layer (one uploaded image on one blank; the upload is
// S.logoSrc[id], kept in IndexedDB as 'logo:<id>', its crop S.logoImgs[id]). Placement is relative to
// the card (it scales with the export): x / y = its centre as fractions of the
// card's width / height, size = the side of the square it fits in, as a
// fraction of the card's shorter side.
SINFORGE.newLogo = (id) => ({
  id,
  x: 0.5, y: 0.5,
  size: 0.3,
  alpha: 100,  // opacity, %
  tint: true,  // print in the ink colour (else its own colours)
  thr: 0,      // in ink: threshold (0–100) — higher = mid tones solid, background gone
  // its crop: the part of the uploaded image it shows, in fractions of it (may
  // run past it — transparent there); the upload is kept whole for a recrop
  cx: 0, cy: 0, cw: 1, ch: 1,
});

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
  out: { scale: 1, digital: false }, // export scale: 1 | 2; DIGITAL stage mode on/off (sinforge:out)
  names: SINFORGE.newNames(),     // name-generator settings (sinforge:names)
  photo: null,                    // source canvas of the photo (user upload in IndexedDB, else the doggo)
  photoIsUser: false,             // true when the photo came from the user
  wmImage: null,                  // source canvas of the watermark image (IndexedDB 'watermark')
  // logo layers per blank key, bottom first: SINFORGE.newLogo() entries,
  // drawn over the card + watermark, under every element (sinforge:logos)
  logos: {},
  logoSrc: {},                    // their uploaded images by layer id (IndexedDB 'logo:<id>')
  logoImgs: {},                   // the same, cropped (what's drawn)
  logoSel: null,                  // the selected layer's id (the panel's editor + stage priority)
  licIcons: {},                   // custom license icons by key: one-colour masks (IndexedDB 'lic:<key>')
};
