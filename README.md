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
  shape (silhouette + photo window); everything else is filled in on top
  of it. **EVENT BADGE** (1200×1600 vertical con badge) and **CITIZEN ID**
  (1600×1010 horizontal ID card, CR80 proportions: issuer band, photo, labelled
  data fields, contact chip, a DNA strip seeded by the holder's fields —
  click it to switch between a double helix and the plain A/C/G/T letters —
  machine-readable zone built from the fields).
- **Text** — event badge: badge number, vertical role tag, title, two-line
  name, footer line. Citizen ID: issuer, SIN number, given names, surname, sex,
  metatype (HUMAN, ELF, ORK…, with a random-metatype die), date of birth, expiry (both with a random-date die), district, status.
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
  scale and potency sliders and a rotation wheel (Shift snaps to 15°,
  double-click resets). Images can be colour-inverted and use a SMART blend:
  multiply on light cards, screen (lighten) on dark ones.
  It marks the card background only: every element sits on top of it and the
  photo window stays clean.
- **Colours** — card / ink / accent, with one-click schemes (paper, night,
  toxic, blood, chrome, sunset). On dark schemes the photo tones flip so the
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
- Text, look, framing and the uploaded photo are remembered between visits.
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
