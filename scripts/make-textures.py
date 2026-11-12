"""生成 UI 材质（一次性开发脚本，不参与游戏运行时）：
- assets/images/ui-wood.webp   木桌贴图（可平铺，横向木板 + 木纹 + 木节 + 板缝）
- assets/images/ui-paper.webp  羊皮纸颗粒（透明叠加层，可平铺）
运行：python scripts/make-textures.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(20261025)


def periodic_noise(h: int, w: int, freq: float, octaves: int = 4) -> np.ndarray:
    """由整数频率正弦叠加而成的可平铺噪声，值域约 0~1。"""
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    u = xx / w
    v = yy / h
    out = np.zeros((h, w), np.float32)
    amp_sum = 0.0
    for o in range(octaves):
        f = freq * (2 ** o)
        amp = 1.0 / (1.6 ** o)
        a = rng.uniform(0, np.pi * 2)
        b = rng.uniform(0, np.pi * 2)
        # 斜向平面波 + 轻度扭曲，整数频率保证平铺无缝
        warp = 0.35 * np.sin(2 * np.pi * (u * (f * 0.5) + v * 0.3) + b)
        out += amp * np.sin(2 * np.pi * (u * f + v * (f * 0.35)) + a + warp)
        amp_sum += amp
    out /= amp_sum
    return (out + 1) * 0.5


def make_wood(size: int = 1024) -> Image.Image:
    h = w = size
    plank_h = size // 4
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    img = np.zeros((h, w, 3), np.float32)

    # 每块木板：底色略有差异，木纹沿板长横向（x）延伸
    for p in range(4):
        y0 = p * plank_h
        base = np.array([0.355, 0.215, 0.112], np.float32) * rng.uniform(0.94, 1.06, 3)
        # 木纹：细密横纹 + 缓慢波浪（振幅很低，避免出现斑马纹）
        warp = (
            0.9 * np.sin(2 * np.pi * (xx / w * 1.0) + p * 1.7)
            + 0.4 * np.sin(2 * np.pi * (xx / w * 2.0) + p * 0.6)
        )
        grain = np.zeros((h, w), np.float32)
        for k, (f, a) in enumerate([(9.0, 1.0), (19.0, 0.55), (41.0, 0.28), (83.0, 0.14)]):
            grain += a * np.sin(2 * np.pi * (yy / h * f * 8) + warp * (1.0 / (k + 1)) + p * 2.1)
        grain /= 1.97
        # 长条状浅色/深色木丝
        fiber = np.sin(2 * np.pi * (yy / h * 3.2) + 2.2 * np.sin(2 * np.pi * xx / w * 3.0 + p))
        shade = 0.965 + 0.032 * grain + 0.012 * fiber
        slab = base[None, None, :] * shade[y0:y0 + plank_h, :, None]
        # 板缝：上下深色线 + 下缘高光
        band = np.zeros((plank_h, w), np.float32)
        band[:2, :] = -0.10
        band[2:4, :] = -0.035
        band[4:6, :] = 0.028
        band[-2:, :] = 0.012
        # 竖直拼接缝（每块板位置错开）
        for jx in range(int(rng.integers(1, 3))):
            x0 = int((0.25 + 0.5 * jx + 0.18 * p + rng.uniform(-0.06, 0.06)) * w) % w
            for dx in range(-2, 3):
                band[:, (x0 + dx) % w] += -0.07 if abs(dx) <= 1 else 0.014
        slab += band[:, :, None] * np.array([0.5, 0.38, 0.26], np.float32)
        img[y0:y0 + plank_h] = slab

    # 木节：径向暗斑 + 同年轮的细线（克制，只留少量）
    knot_layer = Image.new("L", (w, h), 0)
    kd = ImageDraw.Draw(knot_layer)
    for _ in range(4):
        cx = int(rng.uniform(60, w - 60))
        cy = int(rng.uniform(30, h - 30))
        rx = int(rng.uniform(12, 24))
        ry = int(rx * rng.uniform(0.4, 0.6))
        kd.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=70)
        kd.ellipse((cx - rx * 0.55, cy - ry * 0.55, cx + rx * 0.55, cy + ry * 0.55), fill=115)
        kd.ellipse((cx - rx * 0.22, cy - ry * 0.22, cx + rx * 0.22, cy + ry * 0.22), fill=150)
    knot_layer = knot_layer.filter(ImageFilter.GaussianBlur(3.5))
    knots = np.asarray(knot_layer, np.float32) / 255.0
    img *= (1 - 0.18 * knots[:, :, None])
    # 结疤上缘高光
    knot_hi = np.asarray(knot_layer.filter(ImageFilter.GaussianBlur(7)), np.float32) / 255.0
    img += (0.045 * knot_hi * (1 - knots))[:, :, None] * np.array([1.0, 0.85, 0.62], np.float32)

    img = np.clip(img, 0, 1)
    # 整体轻微暗角，避免平铺时过于均匀
    vign = 1 - 0.06 * (((xx / w - 0.5) ** 2 + (yy / h - 0.5) ** 2) ** 0.5) * 2
    img *= vign[:, :, None]
    # 细颗粒
    noise = rng.normal(0, 0.007, (h, w, 1))
    img = np.clip(img + noise, 0, 1)
    return Image.fromarray((img * 255).astype(np.uint8), "RGB")


def make_paper(size: int = 512) -> Image.Image:
    h = w = size
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    # 透明底：只画低透明度的纤维与霉点
    alpha = np.zeros((h, w), np.float32)
    color = np.zeros((h, w, 3), np.float32)
    color[:] = np.array([0.36, 0.24, 0.10], np.float32)

    # 柔和斑驳
    mottle = periodic_noise(h, w, 2.0, 4)
    mottle = (mottle - 0.5)
    alpha += np.clip(mottle, 0, 1) * 0.10
    light = np.clip(-mottle, 0, 1)
    # 浅色斑驳用另一层颜色接近纸白
    color_light = np.array([1.0, 0.965, 0.86], np.float32)

    # 纤维：短弧线
    fib = Image.new("L", (w, h), 0)
    fd = ImageDraw.Draw(fib)
    for _ in range(900):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h)
        ang = rng.uniform(-0.35, 0.35) + (np.pi / 2 if rng.random() < 0.25 else 0)
        length = rng.uniform(6, 40)
        x2 = x + np.cos(ang) * length
        y2 = y + np.sin(ang) * length * 0.5
        fd.line((x, y, x2, y2), fill=int(rng.uniform(25, 70)), width=1)
    fib = fib.filter(ImageFilter.GaussianBlur(0.4))
    fa = np.asarray(fib, np.float32) / 255.0
    alpha += fa * 0.34

    # 霉点/暗斑
    fox = Image.new("L", (w, h), 0)
    fxd = ImageDraw.Draw(fox)
    for _ in range(150):
        x = rng.uniform(0, w)
        y = rng.uniform(0, h)
        r = rng.uniform(0.6, 2.6)
        fxd.ellipse((x - r, y - r, x + r, y + r), fill=int(rng.uniform(35, 95)))
    fox = fox.filter(ImageFilter.GaussianBlur(0.8))
    alpha += np.asarray(fox, np.float32) / 255.0 * 0.45

    # 合成 RGBA：暗纤维与亮斑交替
    a = np.clip(alpha, 0, 0.42)
    rgb = color * (1 - light[:, :, None] * 0.85) + color_light * light[:, :, None] * 0.85
    rgba = np.dstack([rgb, a])
    return Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")


if __name__ == "__main__":
    wood = make_wood(1024)
    wood.save(OUT / "ui-wood.webp", quality=86, method=6)
    paper = make_paper(512)
    paper.save(OUT / "ui-paper.webp", quality=90, method=6, lossless=False)
    print("wood", wood.size, (OUT / "ui-wood.webp").stat().st_size)
    print("paper", paper.size, (OUT / "ui-paper.webp").stat().st_size)
