# SINFORGE

A free, in-browser **cyberpunk document constructor** — ID cards, badges, keycards —
a tool in the [cyberdeck.tools](https://cyberdeck.tools/) family (COMMLINK · CHRONOS · GRIDMAP · EIDOLON).

Forge cyberpunk-styled in-game documents for your TTRPG table or LARP and export
them as PNG. No build step, no backend — just open `index.html`. Everything runs
client-side; your images are never uploaded.

> **Status: compiling.** SINFORGE is in early development — more blanks,
> decorations and effects are on the way.

## Features

- **Blanks** — pick a pre-defined document; everything else is filled in on top
  of it. First blank: **EVENT BADGE** (1200×1600 vertical con badge).
- **Text** — badge number, vertical role tag, title, two-line name, footer line.
  Long text shrinks to fit its slot. The die button next to the badge number
  generates a random serial in one of 5 formats (`#92-0329`, `SIN-2950-0982`,
  `NZ-4085-Z`, `C4:16:F4:79`, `NMS/22137`).
- **Photo** — upload, drop or paste an image; drag it to move, scroll to zoom.
  Defaults to the C-DOGGO, the cyberdeck.tools mascot. Photo FX: original,
  threshold, halftone (dot size) or dither, with a level slider — the 1-bit modes
  print the photo in the ink colour and let the card colour show through.
- **Watermark** — text (repeated diagonally) or an uploaded image (tiled or
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
- **Effects** — neon glow around the card, print grain, scanlines.
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
