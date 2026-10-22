# SINFORGE

A free, in-browser **cyberpunk document constructor** — ID cards, badges, keycards —
a tool in the [cyberdeck.tools](https://cyberdeck.tools/) family (COMMLINK · CHRONOS · GRIDMAP · EIDOLON).

Forge cyberpunk-styled in-game documents for your TTRPG table or LARP and export
them as PNG. No build step, no backend — just open `index.html`. Everything runs
client-side; your images are never uploaded.

> **Status: compiling.** SINFORGE is in early development — more blanks,
> decorations and effects are on the way.

## Features

- **Blanks** — pick a pre-defined document from the icon bar above the canvas, each icon showing its
  shape (silhouette + solid photo window) and a letter (E — event badge,
  C — citizen ID, L — license card, O — operator ID, A — access pass); everything else is filled in on top
  of it. **EVENT BADGE** (1200×1600 vertical con badge), **CITIZEN ID**
  (1600×1010 horizontal ID card, CR80 proportions: issuer band, photo, labelled
  data fields, contact chip, a DNA strip seeded by the holder's fields —
  click it to switch between a double helix and the plain A/C/G/T letters —
  machine-readable zone built from the fields) and **LICENSE CARD** (1600×1010:
  authority band, photo with a barcode under it, the holder's fields and a grid
  of 12 license tiles, each marked by an icon: firearms, blades, explosives,
  driver, pilot, medical, detective, security, bounty hunter, decker, magic,
  cyberware. Granted licenses print as solid tiles, the rest outlined and
  faded; toggle them in the left panel or click a tile on the card. Any
  license can be made your own: hover its icon in the left panel (or its tile
  on the card) and click the pencil: an editor window opens to give it a custom
  caption and upload a custom icon (printed in one
  colour — a transparent PNG or a dark icon on a light background works best;
  kept in your browser; with the window open you can also drop or paste the
  image). A customised license also shows a reset button on its icon's other
  corner (in the left panel and on the card) that restores the built-in icon
  and caption. The upload opens a crop window: a square frame
  (drag it, resize from the corner or with the wheel) with guides showing the
  standard icon size — a dashed safe square, centre lines and a ghost of the
  built-in icon. FIT sizes the frame so the icon fills the safe square (it
  opens that way), MAX takes the whole image; the frame may run past the
  image to give a tight picture room. RESET brings back the built-in one),
  **OPERATOR ID** (1600×1010, rounded corners: a seeded dot-matrix strip over
  the photo, call sign and position, a status tick box, the code beside a
  hatched bar over the card type — a QR / 2D code as a square, a barcode as a
  strip — and an inverted organisation band carrying the fine print) and
  **ACCESS PASS** (1000×1600 vertical hanging badge with a lanyard slot punched
  through — transparent in the PNG: photo beside room for a logo, reference ID and expiry, a big access level, zone and
  division, the holder's handle and name, and the organisation with the code:
  a QR / 2D code sits square in the corner beside it, a barcode runs full
  width under it, and with the code off the photo grows instead).
- **Constructor** — build your own blanks: the CONSTRUCTOR tab on the left
  edge (under PRESETS) slides out a panel. Pick a BASE SHAPE (any built-in
  blank's silhouette, its inner contour and edge line included) and press NEW
  BLANK: it joins the blank picker (its icon wears the name's first letter)
  with a photo window and two text lines to start from. While the panel is
  open the stage edits the blank: every item shows a dashed box; drag one to
  move it, a corner of the selected one to resize it (10 px snap — Alt places
  freely, Shift keeps the proportions), arrow keys nudge it (Shift: 10 px),
  Delete removes it. ADD puts in text, a barcode, a chip, a band (notched like
  the issuer bands, or plain), a rule, hazard stripes (a column, or a row when
  wider than tall) and slashes; the item list (topmost first) restacks or
  removes them, and the selected item's settings take exact X / Y / W / H,
  plus its colour (ink, accent or card — card-coloured text over a band), and
  for text a caption printed over the value, the kind (TEXT, NUMBER with a
  generate button — the barcode encodes the first one — or DATE, printed in
  the selected date format), weight and alignment. Each text item becomes a
  field of the DOCUMENT panel; barcode, chip, stripes and slashes follow
  their DECOR toggles; photo frames, codes, chips and date formats are picked
  on the stage as on any blank once the panel is closed. Changing the base
  scales the layout to the new shape; DUPLICATE copies a blank, DELETE BLANK
  removes it. A preset saved on a custom blank keeps a copy of it, so the
  preset still works — and brings the blank back — after the blank is changed
  or deleted.
- **Elements** — any number of your own images — decorative elements, logos,
  emblems, stamps — on any blank (the ELEMENTS strip under the
  preview: a thumbnail per element, the dashed + tile adds more — several images
  at once), each blank keeping its own.
  They're a background layer: over the card and the watermark, under everything
  else. Drag one anywhere on the card, scroll over it to resize; a click
  selects it (dashed outline), and the selected element is grabbed first even
  where it lies under the photo or text — click an empty part of the card or
  press Escape to let it go. On hover a thumbnail shows a trash tab (removes
  the element; so does Delete on the selected one) and a pencil, which opens
  that element's ELEMENT window: SCALE, AMOUNT
  (opacity), PRINT IN INK (one colour — a THRESHOLD slider hardens it, mid
  tones (a red image) going solid and the background dropping out, up to a
  pure one-bit print — or its own colours), crop, bring forward / send
  backward, centre. Every new element opens the crop window
  right away (several uploads: one after another; CANCEL keeps the whole
  image, and the kept part fills the element's spot); CROP reopens it over the
  whole uploaded image: drag any rectangle (Shift on the corner keeps its
  shape), FIT hugs the element's content (its transparency, or what differs from
  a solid background), MAX takes the whole image; the kept part stays where
  it was on the card. The original is kept, so an element can be recropped any
  time. A new element lands in the blank's natural spot
  (beside the call sign on the operator ID, above the reference ID on the
  access pass) or the card's centre. PHOTO OVER ELEMENTS (in the same window) keeps every element out of
  the photo window, so none shows through a transparent photo (a 1-bit photo
  FX, a PNG cut-out).
- **Text** — event badge: badge number, vertical role tag, title, two-line
  name, footer line. Citizen ID: issuer, SIN number, given names, surname, sex,
  metatype (HUMAN, ELF, ORK…, with a random-metatype die), date of birth, expiry (both with a random-date die), district, status.
  License card: authority, license number, given names, surname, date of birth, expiry.
  Operator ID: call sign, position, status line, ID number, card type,
  organisation, division. Access pass: access level, reference ID, expiry,
  zone, division, handle, given names, surname, organisation.
  Long text shrinks to fit its slot. The die button next to the badge number
  generates a random serial in one of 5 formats (`#92-0329`, `SIN-2950-0982`,
  `NZ-4085-Z`, `C4:16:F4:79`, `NMS/22137`).
- **Name generator** — GENERATE NAME fills both name lines and sets the title
  to MR / MS (event badge) or the sex to M / F (citizen ID) to match the gender. The cog beside it opens its settings: gender, region
  (anglo, French, German, Spanish, Italian, Nordic, Dutch, Slavic, Turkish,
  Arabic, Indian, Japanese, Chinese, Korean, Brazilian, fantasy, mythic) and an
  optional [Behind the Name](https://www.behindthename.com/api/) API key.
  Without a key, real-world names come from [randomuser.me](https://randomuser.me/)
  and the rest (fantasy, mythic, regions randomuser lacks) are built in; with
  your own free key every region draws from Behind the Name. If a service is
  unreachable it falls back to the built-in names, so it works offline too.
  The key is stored only in your browser.
- **Portrait frame** — click the photo (hovering outlines it) to pick the
  window's shape: cut corners, viewfinder (corner brackets), octagon (double line),
  shield, scope (oval with crosshair ticks) or slanted. Works on every blank.
- **Photo** — upload, drop or paste an image; drag it to move, scroll to zoom.
  Defaults to the C-DOGGO, the cyberdeck.tools mascot. Photo FX (third icon at
  the stage's top-left corner): original,
  threshold, halftone (dot size) or dither, with a level slider — the 1-bit modes
  print the photo in the ink colour and let the card colour show through.
- **Watermark** — opened from the second icon at the stage's top-left corner. Text (repeated diagonally) or an uploaded image (tiled or
  one centred, optionally tinted), with a tone (ink / accent / custom colour),
  scale (up to 1000 %), overlap (density of the repeated marks: higher packs
  them closer, negative spreads them out), shift (each repeated row's sideways shift from
  the one above, % of a tile: 50 = brick, 0 = straight columns) and potency
  sliders and a rotation wheel (Shift snaps to 15°,
  double-click resets). Images can be colour-inverted and use a SMART blend:
  multiply on light cards, screen (lighten) on dark ones. While it's on, drag
  any empty part of the card to move it; double-click there to centre it again.
  It marks the card background only: every element sits on top of it and the
  photo window stays clean.
- **DIGITAL mode** — the icon at the stage's top-right corner opens the
  DIGITAL window: switch the mode on / off and pick the backdrop from a colour
  grid like COMMLINK's accent picker — the default night, dark and soft
  presets, or a custom colour (its swatch starts pre-picked; the picker
  beside it replaces it with the last colour picked) (the scene's tint adapts so it stays
  readable on light colours too). The mode shows the card
  as a digital document shared from a device over the air: a matrix grid
  behind it (glyph columns, a grid, a perspective floor, motes), a glow and holo brackets around
  the card and a wireless HUD: the emitter's readout and the log of a finished
  transfer. What the stage shows is what you export: while it's on, the PNG is
  the whole scene (an opaque image, larger than the card — OUTPUT shows its
  size).
- **Colours** — card / ink / accent, with one-click schemes (paper, night,
  toxic, blood, chrome, sunset). Each colour swatch opens a palette window
  — dark, light and bright card stocks for the card; neon, soft, light and
  dark presets for ink and accent — plus a custom colour picker. On dark schemes the photo tones flip so the
  picture never prints as a negative.
- **Decor** — side hazard stripes, slashes, barcode (derived from the badge
  number), edge line.
- **Barcode type** — click the barcode (hovering outlines it) to pick its
  style: a real Code 128 of the number, EAN-13 (retail look: long guard
  bars, digits in groups), postal 4-state, stacked (PDF417-look), matrix
  (QR-look) or dot code. The 2D codes get a square slot.
- **Chip type** — click the chip (citizen ID; hovering outlines it) to pick
  its style: ISO contact plate, EMV payment chip, processor package, RFID
  coil, datajack port or hex node.
- **Date format** — dates are entered as YYYY-MM-DD; click a date on the
  card to pick how they print: 2077-10-31, 31.10.2077, 10/31/2077,
  31 OCT 2077, 31OCT77 or 20771031.
- **Effects** — opened from the first icon at the stage's top-left corner: neon glow around the card, print grain, scanlines.
- **Export** — PNG at 1× (1200×1600) or 2× (2400×3200), transparent outside
  the card shape.
  Or copy it straight to the clipboard to paste into Discord, a VTT or an editor.
- **Presets** — the PRESETS tab on the left edge slides out a panel of saved
  documents: name and SAVE the current one (the blank, its text and licenses,
  colours, decor, frame, barcode, chip, date format, watermark and effects —
  optionally the output settings too — plus a copy of every image: the photo
  with its framing, the elements with their positions, the watermark image and
  custom license icons), then APPLY it (or click its thumbnail) any time; its
  images replace the card's. A preset keeps its own copies, so changing or
  removing an image on the card doesn't break it. The preset matching the
  current document lights up; applying asks first if the current document
  isn't saved anywhere. Five read-only EXAMPLE documents (one per blank, no
  images — they leave yours alone) can be hidden; EXPORT / IMPORT moves your
  presets, images included, between browsers as JSON. An IMAGE STORAGE bar
  shows how much of the browser's storage the site uses and how much is left;
  a preset that doesn't fit isn't saved.
- Text, look, framing, custom blanks and the uploaded photo are remembered between visits.
- UI in 8 languages: EN · RU · FR · DE · ES · IT · JP · CN.

## Running

Open `index.html` in any modern browser, or serve the folder:

```
python3 -m http.server 8767
```

## Versioning

`X.Y.Z`, bumped with the helper script (keeps all three in-file version spots
in sync — the line-1 comment, the `#tagVersion` span, and the `VER` constant):

```
python3 bump_version.py {x|y|z}
```

## Built with

- [augmented-ui](https://augmented-ui.com/) — clipped/beveled cyberpunk panel styling
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — UI typeface
- [Quantico](https://fonts.google.com/specimen/Quantico) — document typeface

## Support

If you find these tools useful, you can support development here: [boosty.to/cyberdelaai/donate](https://boosty.to/cyberdelaai/donate)

## License

[MIT](LICENSE) © 2026 CyberDelaai
