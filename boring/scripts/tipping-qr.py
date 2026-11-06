#!/usr/bin/env python3
"""从"微信支付 / 支付宝"收款码整图里裁出二维码方块。

用法（在 boring/ 目录下）：
    python3 scripts/tipping-qr.py

输入：assets/tipping/wechat-source.jpeg、assets/tipping/alipay-source.jpeg
输出：static/img/tip/wechat-qr.png、static/img/tip/alipay-qr.png（384×384，调色板 PNG）

算法：
1. 亮度阈值取深色掩码（二维码模块）
2. 膨胀合并模块 + 连通域，挑最接近正方形（宽高比 0.75–1.35）且面积最大的候选
3. 候选内部深色像素的紧包围盒 → 外扩 7.5% 作为 quiet zone
4. 白底合成 → 384×384 → 调色板量化 → PNG optimize
"""

from pathlib import Path
import sys

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = ROOT / "assets" / "tipping"
OUTPUT_DIR = ROOT / "static" / "img" / "tip"
OUTPUT_SIZE = 384
QUIET_ZONE = 0.075
SIZE_BUDGET = 60 * 1024

CHANNELS = {
    "wechat": "wechat-source.jpeg",
    "alipay": "alipay-source.jpeg",
}


def dilate(mask: np.ndarray, iterations: int) -> np.ndarray:
    out = mask.copy()
    for _ in range(iterations):
        grown = out.copy()
        grown[1:, :] |= out[:-1, :]
        grown[:-1, :] |= out[1:, :]
        grown[:, 1:] |= out[:, :-1]
        grown[:, :-1] |= out[:, 1:]
        out = grown
    return out


def connected_components(mask: np.ndarray):
    height, width = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    for y in range(height):
        for x in range(width):
            if not mask[y, x] or seen[y, x]:
                continue
            stack = [(y, x)]
            seen[y, x] = True
            area = 0
            y0 = y1 = y
            x0 = x1 = x
            while stack:
                cy, cx = stack.pop()
                area += 1
                y0, y1 = min(y0, cy), max(y1, cy)
                x0, x1 = min(x0, cx), max(x1, cx)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < height and 0 <= nx < width and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
            yield area, x0, y0, x1, y1


def find_qr_box(image: Image.Image, scale: int = 2) -> tuple:
    width, height = image.size
    small = np.asarray(
        image.resize((width // scale, height // scale), Image.BILINEAR)
    ).astype(np.int16)
    dark = small.max(axis=2) < 100
    merged = dilate(dark, 7)

    best = None
    for area, x0, y0, x1, y1 in connected_components(merged):
        box_width, box_height = x1 - x0 + 1, y1 - y0 + 1
        if box_width < 40 or box_height < 40:
            continue
        if not 0.75 < box_width / box_height < 1.35:
            continue
        if best is None or box_width * box_height > best[0]:
            best = (box_width * box_height, (x0, y0, x1, y1))

    if best is None:
        raise SystemExit(f"no square QR candidate found in {image.size}")

    x0, y0, x1, y1 = best[1]
    sub = dark[y0:y1 + 1, x0:x1 + 1]
    ys, xs = np.nonzero(sub)
    left = (int(xs.min()) + x0) * scale
    right = (int(xs.max()) + 1 + x0) * scale
    top = (int(ys.min()) + y0) * scale
    bottom = (int(ys.max()) + 1 + y0) * scale
    return left, top, right, bottom


def crop_square(image: Image.Image, box: tuple) -> Image.Image:
    left, top, right, bottom = box
    side = int(round(max(right - left, bottom - top) * (1 + 2 * QUIET_ZONE)))
    center_x = (left + right) // 2
    center_y = (top + bottom) // 2
    x0 = center_x - side // 2
    y0 = center_y - side // 2
    crop = image.crop((x0, y0, x0 + side, y0 + side))
    canvas = Image.new("RGB", crop.size, "white")
    canvas.paste(crop, (0, 0))
    return canvas.resize((OUTPUT_SIZE, OUTPUT_SIZE), Image.LANCZOS)


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    over_budget = []

    for name, source_name in CHANNELS.items():
        source = SOURCE_DIR / source_name
        if not source.exists():
            raise SystemExit(f"missing source image: {source}")
        image = Image.open(source).convert("RGB")
        qr = crop_square(image, find_qr_box(image))
        target = OUTPUT_DIR / f"{name}-qr.png"
        qr.convert("P", palette=Image.ADAPTIVE, colors=64).save(
            target, format="PNG", optimize=True
        )
        size = target.stat().st_size
        print(f"{target.relative_to(ROOT)}  {size / 1024:.1f} KB")
        if size > SIZE_BUDGET:
            over_budget.append(target.name)

    if over_budget:
        raise SystemExit(
            f"over budget (>{SIZE_BUDGET // 1024} KB): {', '.join(over_budget)}"
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
