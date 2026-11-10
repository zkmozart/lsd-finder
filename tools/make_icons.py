from PIL import Image, ImageDraw, ImageFont
import os
out = os.path.join(os.path.dirname(__file__), "..", "app")
for S in (192, 512):
    im = Image.new("RGB", (S, S), "#0f172a"); d = ImageDraw.Draw(im)
    g = S * 0.22; c = S / 2
    # 4x4 LSD grid
    x0, y0, w = c - g * 1.25, S * 0.18, g * 2.5
    for i in range(5):
        d.line([(x0 + i * w / 4, y0), (x0 + i * w / 4, y0 + w)], fill="#334155", width=max(2, S // 96))
        d.line([(x0, y0 + i * w / 4), (x0 + w, y0 + i * w / 4)], fill="#334155", width=max(2, S // 96))
    # highlighted LSD
    d.rectangle([x0 + 2 * w / 4, y0 + w / 4, x0 + 3 * w / 4, y0 + 2 * w / 4], fill="#f59e0b")
    try: f = ImageFont.truetype("C:/Windows/Fonts/segoeuib.ttf", int(S * 0.17))
    except OSError: f = ImageFont.load_default()
    d.text((c, S * 0.80), "LSD", fill="#f1f5f9", font=f, anchor="mm")
    im.save(os.path.join(out, f"icon-{S}.png"))
print("ok")
