#!/usr/bin/env python3
"""Генератор PWA-иконок АгроПост: росток на приглушённо-зелёном фоне.

Запуск из корня репозитория:
    python3 tools/make_icons.py

Создаёт apps/web/public/icons/:
    icon-192.png, icon-512.png, maskable-512.png (с запасом под обрезку).

Зависимость: pip install pillow
"""

from pathlib import Path

from PIL import Image, ImageDraw

ACCENT = (62, 124, 90, 255)  # #3E7C5A
WHITE = (255, 255, 255, 255)

OUT_DIR = Path(__file__).resolve().parent.parent / "apps" / "web" / "public" / "icons"


def rounded_rect(draw: ImageDraw.ImageDraw, box, radius: int, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_sprout(size: int) -> Image.Image:
    """Росток: стебель + два листа, по центру скруглённого квадрата."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = int(size * 0.22)
    rounded_rect(draw, (0, 0, size, size), radius, ACCENT)

    s = size / 100
    cx = size / 2

    # Стебель — вертикальная скруглённая линия
    stem_w = int(7 * s)
    stem_top = int(38 * s)
    stem_bottom = int(72 * s)
    draw.rounded_rectangle(
        (cx - stem_w / 2, stem_top, cx + stem_w / 2, stem_bottom),
        radius=stem_w // 2,
        fill=WHITE,
    )

    # Лист левый (эллипс, повёрнутый)
    leaf_l = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ld = ImageDraw.Draw(leaf_l)
    ld.ellipse((int(18 * s), int(22 * s), int(50 * s), int(44 * s)), fill=WHITE)
    leaf_l = leaf_l.rotate(28, center=(cx, int(33 * s)), resample=Image.BICUBIC)

    # Лист правый — зеркально
    leaf_r = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    rd = ImageDraw.Draw(leaf_r)
    rd.ellipse((int(50 * s), int(22 * s), int(82 * s), int(44 * s)), fill=WHITE)
    leaf_r = leaf_r.rotate(-28, center=(cx, int(33 * s)), resample=Image.BICUBIC)

    img.alpha_composite(leaf_r)
    img.alpha_composite(leaf_l)
    return img


def draw_maskable(size: int) -> Image.Image:
    """Maskable: тот же знак, уменьшенный до безопасной зоны (~66%)."""
    base = Image.new("RGBA", (size, size), ACCENT)
    sign = draw_sprout(size)
    small = sign.resize((int(size * 0.66), int(size * 0.66)), Image.LANCZOS)
    offset = (size - small.width) // 2
    base.alpha_composite(small, (offset, offset))
    return base


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        draw_sprout(size).save(OUT_DIR / f"icon-{size}.png")
    draw_maskable(512).save(OUT_DIR / "maskable-512.png")
    print(f"OK: иконки записаны в {OUT_DIR}")


if __name__ == "__main__":
    main()
