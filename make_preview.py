#!/usr/bin/env python3
"""Render sinforge_thumbnail.png — the 1200x630 social/OG preview for SINFORGE.

Same layout as EIDOLON's preview: dark grid background, "> SINFORGE" +
cyberdeck.tools on the left, the artwork in the middle, the tagline on the
right. The artwork is a real CITIZEN ID drawn by the app's own renderer
(js/render.js + js/blanks.js) with the default document text and the doggo
photo, so re-running after the blank changes keeps the preview in sync.

How: serves this folder on a local port (the photo effects read pixels, which
needs http rather than file://), builds a page that loads the render modules,
and screenshots it with headless Chrome/Edge. Fonts come from Google Fonts, so
a network connection is needed.

Usage:
    python make_preview.py                  # writes sinforge_thumbnail.png
    python make_preview.py --scheme night   # another colour scheme from js/state.js
    python make_preview.py --html out.html  # also keep the HTML for tweaking

Browser lookup: $CHROME, then chrome/chromium/msedge on PATH, then the usual
install locations on Windows / macOS.
"""
import argparse
import functools
import http.server
import os
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "sinforge_thumbnail.png"
PAGE = "_preview.html"  # written into ROOT while rendering, then removed
W, H = 1200, 630
CARD_W = 440  # displayed card width; centred at x=620 so it clears the logo

# render.js needs these, in index.html order (app.js / i18n.js / header.js are UI only)
MODULES = ["state", "render", "frames", "codes", "chips", "dates", "blanks"]


def build_html(scheme):
    scripts = "\n".join(f'<script src="js/{m}.js"></script>' for m in MODULES)
    return f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8" />
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Quantico:wght@400;700&display=swap" rel="stylesheet" />
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{ width: {W}px; height: {H}px; overflow: hidden; }}
  body {{
    position: relative;
    font-family: 'JetBrains Mono', monospace;
    background-color: #0a0c10;
    /* 40px grid, same pitch / phase / tint as EIDOLON's preview */
    background-image:
      linear-gradient(to right, rgba(0, 233, 255, 0.07) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(0, 233, 255, 0.07) 1px, transparent 1px);
    background-size: 40px 40px;
    background-position: 23px 35px;
  }}
  .left {{ position: absolute; left: 65px; top: 255px; }}
  .logo {{ color: #ffe500; font-weight: 700; font-size: 46px; line-height: 1; letter-spacing: 1px; }}
  .site {{ color: #8a97a3; font-size: 19px; margin-top: 30px; }}
  .right {{ position: absolute; right: 65px; top: 255px; text-align: right; }}
  .tag {{ color: #00e9ff; font-weight: 700; font-size: 34px; line-height: 50px; letter-spacing: 1px; }}
  .sub {{ color: #8a97a3; font-size: 19px; margin-top: 14px; }}
  #card {{
    position: absolute; left: 620px; top: 50%; width: {CARD_W}px;
    transform: translate(-50%, -50%) rotate(-5deg);
    filter: drop-shadow(0 0 22px var(--glow)) drop-shadow(0 0 4px var(--glow));
  }}
</style>
{scripts}
</head><body>
  <div class="left"><div class="logo">&gt; SINFORGE</div><div class="site">cyberdeck.tools</div></div>
  <div class="right"><div class="tag">ID CARD</div><div class="tag">MAKER</div><div class="sub">for TTRPG / LARP</div></div>
  <canvas id="card"></canvas>
<script>
(async () => {{
  const S = SINFORGE.state;
  S.blank = 'citizen-id';
  Object.assign(S.style, SINFORGE.schemes[{scheme!r}]);
  S.style.photoFx = 'none'; // full-colour photo: the default halftone muddies at thumbnail size
  S.doc.metatype = 'HUMAN?'; // it's a dog. kinda.
  document.body.style.setProperty('--glow', S.style.accent);

  const img = new Image();
  img.src = SINFORGE.const.DOGGO;
  await img.decode();
  const src = document.createElement('canvas');
  src.width = img.naturalWidth; src.height = img.naturalHeight;
  src.getContext('2d').drawImage(img, 0, 0);
  src.__id = 1; // photo-layer cache key in render.js
  S.photo = src;

  await Promise.all(['700 64px Quantico', '400 44px Quantico'].map((f) => document.fonts.load(f)));
  // drawn at 2x the displayed width, so thin rules survive the downscale
  const k = ({CARD_W} * 2) / SINFORGE.blanks[S.blank].w;
  const c = document.getElementById('card');
  const r = SINFORGE.renderCanvas(k);
  c.width = r.width; c.height = r.height;
  c.getContext('2d').drawImage(r, 0, 0);
}})();
</script>
</body></html>
"""


def find_browser():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    for name in ("chrome", "google-chrome", "chromium", "chromium-browser", "msedge"):
        p = shutil.which(name)
        if p:
            return p
    for p in (
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ):
        if Path(p).exists():
            return p
    sys.exit("No Chrome/Edge found — set $CHROME to a Chromium-based browser.")


def render(page_html, out):
    browser = find_browser()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    page = ROOT / PAGE
    page.write_text(page_html, encoding="utf-8")
    try:
        with tempfile.TemporaryDirectory() as tmp:
            shot = Path(tmp) / "shot.png"
            subprocess.run([
                browser, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                "--force-device-scale-factor=1", f"--window-size={W},{H}",
                "--virtual-time-budget=10000",  # fonts + photo + render before the shot
                f"--user-data-dir={Path(tmp) / 'profile'}",
                f"--screenshot={shot}", f"http://127.0.0.1:{server.server_port}/{PAGE}",
            ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            # Headless may hand back a slightly different canvas — normalise to WxH.
            from PIL import Image
            img = Image.open(shot).convert("RGB")
            if img.size != (W, H):
                canvas = Image.new("RGB", (W, H), (10, 12, 16))
                canvas.paste(img.crop((0, 0, min(W, img.width), min(H, img.height))))
                img = canvas
            img.save(out, optimize=True)
    finally:
        page.unlink(missing_ok=True)
        server.shutdown()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, default=OUT, help=f"output PNG (default: {OUT.name})")
    ap.add_argument("--html", type=Path, help="also write the generated HTML here")
    ap.add_argument("--scheme", default="paper", help="colour scheme key from js/state.js (default: paper)")
    args = ap.parse_args()

    page = build_html(args.scheme)
    if args.html:
        args.html.write_text(page, encoding="utf-8")
    render(page, args.out)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
