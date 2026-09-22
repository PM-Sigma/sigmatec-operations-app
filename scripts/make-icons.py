"""
PWA icons for Sigmatec Operations, from עידן's Gemini artwork (22.9.2026): the Σ inside a
green gear with the module glyphs. Square-crops the source on a white background with a
small margin and writes the two sizes the manifest lists.

  icons/sigma-gear-source.jpg  →  icons/icon-512.png, icons/icon-192.png

Run from the repo root:  python scripts/make-icons.py
"""
import os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")
SRC = os.path.join(ICONS, "sigma-gear-source.jpg")

src = Image.open(SRC).convert("RGB")
side = max(src.size)
canvas = Image.new("RGB", (side, side), (255, 255, 255))
canvas.paste(src, ((side - src.width) // 2, (side - src.height) // 2))
# ~4% margin so the gear teeth do not touch the launcher's rounded mask
pad = int(side * 0.04)
padded = Image.new("RGB", (side + 2 * pad, side + 2 * pad), (255, 255, 255))
padded.paste(canvas, (pad, pad))
canvas = padded
for size in (512, 192):
    canvas.resize((size, size), Image.LANCZOS).save(os.path.join(ICONS, f"icon-{size}.png"), optimize=True)
    print(f"icon-{size}.png")
