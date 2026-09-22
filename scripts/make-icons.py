"""
Generate the Sigmatec Operations App PWA icons: keeps the existing Sigma (Σ)
artwork centered and adds a green rounded frame + a bottom pill tag reading
"תפעול" (Hebrew, RTL-correct via Pillow's raqm text layout when available,
falling back to manual glyph order otherwise).

Inputs (existing artwork, read-only):
  icons/icon-512.png   - current 512x512 icon (source of the Sigma artwork)
  icons/sigma_crop.png - tight crop of the Sigma mark (higher-res source)

Outputs (overwritten):
  icons/icon-512.png            - standard 512x512 icon, framed + tagged
  icons/icon-192.png            - standard 192x192 icon, framed + tagged
  icons/icon-512-maskable.png   - maskable variant with extra safe-zone padding

Run from the repo root:
    python scripts/make-icons.py
"""

from PIL import Image, ImageDraw, ImageFont
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICONS = os.path.join(ROOT, "icons")

BRAND_GREEN = (26, 190, 99, 255)   # #1ABE63
WHITE = (255, 255, 255, 255)

# Windows Hebrew-capable fonts, in preference order.
FONT_CANDIDATES = [
    r"C:\Windows\Fonts\seguisb.ttf",   # Segoe UI Semibold
    r"C:\Windows\Fonts\segoeui.ttf",   # Segoe UI
    r"C:\Windows\Fonts\arialbd.ttf",   # Arial Bold
    r"C:\Windows\Fonts\arial.ttf",     # Arial
]

TAG_TEXT = "תפעול"


HAS_RAQM = False
try:
    from PIL import features
    HAS_RAQM = features.check_feature("raqm")
except Exception:
    HAS_RAQM = False


def load_font(size):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                if HAS_RAQM:
                    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def make_icon(size, maskable=False):
    """Build one square icon of `size` px with green frame + תפעול pill tag."""
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Base background: white rounded square so the frame reads cleanly.
    bg = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(bg)
    corner = int(size * 0.22)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=corner, fill=(255, 255, 255, 255))
    canvas = Image.alpha_composite(canvas, bg)

    # Sigma artwork, centered. Maskable gets extra padding to stay inside the
    # OS's safe circle; standard icons use a smaller margin.
    sigma_src = Image.open(os.path.join(ICONS, "sigma_crop.png")).convert("RGBA")

    if maskable:
        margin_frac = 0.30      # extra safe-zone padding for maskable
        tag_reserve_frac = 0.16
    else:
        margin_frac = 0.16
        tag_reserve_frac = 0.15

    tag_reserve = int(size * tag_reserve_frac)
    avail = size - 2 * int(size * margin_frac)
    avail_h = avail - tag_reserve // 2

    scale = min(avail / sigma_src.width, avail_h / sigma_src.height)
    new_w, new_h = int(sigma_src.width * scale), int(sigma_src.height * scale)
    sigma_resized = sigma_src.resize((new_w, new_h), Image.LANCZOS)

    # Center horizontally; shift up slightly to leave room for the bottom pill.
    x = (size - new_w) // 2
    y = (size - new_h - tag_reserve) // 2
    canvas.alpha_composite(sigma_resized, (x, y))

    # Green rounded border frame.
    draw = ImageDraw.Draw(canvas)
    border_w = max(2, int(size * 0.028))
    inset = border_w // 2
    draw.rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=corner,
        outline=BRAND_GREEN,
        width=border_w,
    )

    # Bottom pill tag with "תפעול".
    font_size = max(10, int(size * 0.14))
    font = load_font(font_size)

    # Without libraqm, Pillow's basic layout draws codepoints left-to-right
    # in logical order, which is visually backwards for Hebrew. Reverse the
    # string so it renders correctly; with raqm, use direction="rtl" on the
    # original (logical-order) string instead.
    render_text = TAG_TEXT if HAS_RAQM else TAG_TEXT[::-1]
    text_kwargs = {"direction": "rtl"} if HAS_RAQM else {}

    tmp_draw = ImageDraw.Draw(canvas)
    bbox = tmp_draw.textbbox((0, 0), render_text, font=font, **text_kwargs)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    pad_x = int(size * 0.045)
    pad_y = int(size * 0.025)
    pill_w = text_w + 2 * pad_x
    pill_h = text_h + 2 * pad_y
    pill_x0 = (size - pill_w) // 2
    pill_y0 = size - int(size * 0.06) - pill_h
    pill_x1 = pill_x0 + pill_w
    pill_y1 = pill_y0 + pill_h

    draw.rounded_rectangle(
        [pill_x0, pill_y0, pill_x1, pill_y1],
        radius=pill_h // 2,
        fill=BRAND_GREEN,
    )

    text_x = pill_x0 + pad_x - bbox[0]
    text_y = pill_y0 + pad_y - bbox[1]
    draw.text((text_x, text_y), render_text, font=font, fill=WHITE, **text_kwargs)

    return canvas


def main():
    icon512 = make_icon(512, maskable=False)
    icon512.save(os.path.join(ICONS, "icon-512.png"))
    print("wrote icons/icon-512.png")

    icon192 = make_icon(192, maskable=False)
    icon192.save(os.path.join(ICONS, "icon-192.png"))
    print("wrote icons/icon-192.png")

    icon512_maskable = make_icon(512, maskable=True)
    icon512_maskable.save(os.path.join(ICONS, "icon-512-maskable.png"))
    print("wrote icons/icon-512-maskable.png")


if __name__ == "__main__":
    main()
