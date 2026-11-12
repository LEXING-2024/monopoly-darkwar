"""生成棋盘地形的「底色 + 纸纹 + 雪山」基础图。

道路、河流、桥、树木由 Canvas 叠加；这里生成统一的手绘羊皮纸底、
柔和地形分区、等高线，以及参考图同风格的雪山浮雕。
输出：assets/images/board-terrain.webp（2304×1536）
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "images" / "board-terrain.webp"
LAYOUT = json.loads((ROOT / "scripts" / "layout.json").read_text(encoding="utf-8"))
W, H = LAYOUT["board"]["w"], LAYOUT["board"]["h"]
TILES = LAYOUT["tiles"]
COAST = [(p["x"], p["y"]) for p in LAYOUT.get("coast", [])]
MOUNTAIN_DIR = ROOT / "assets" / "images" / "terrain"

# 参考图的暖纸、灰绿、奶油沙色。比上一版整体加深约一档，
# 让雪山的白、森林的深绿和羊皮纸的暖黄之间有更清楚的层次。
PAL = {
    "sand": "#c6ad79", "grass": "#7f8d5d", "rock": "#9b8970",
    "field": "#95a069", "sea": "#4a7779", "sea_deep": "#2e575e",
    "paper": "#e1cfad",
}


def rgb(hx: str) -> np.ndarray:
    h = hx.lstrip("#")
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], np.float32) / 255


def smooth(a: float, b: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def fbm(seed: int, base: int = 4, octaves: int = 6) -> np.ndarray:
    r = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, total = 0.5, 0.0
    for o in range(octaves):
        gw = max(3, base * 2 ** o)
        gh = max(2, int(gw * H / W))
        arr = r.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((arr * 255).astype(np.uint8), "L").resize((W, H), Image.BICUBIC)
        out += np.asarray(img, np.float32) / 255 * amp
        total += amp
        amp *= 0.5
    return out / total


def smoothstep01(x: np.ndarray) -> np.ndarray:
    return np.clip(x, 0, 1) ** 2 * (3 - 2 * np.clip(x, 0, 1))


def paper_layer() -> Image.Image:
    """透明纸纹层：细颗粒 + 纤维 + 水渍 + 一道很浅的折痕。

    目标是“旧羊皮纸”的触感，而不是均匀噪点：颗粒要细，纤维不能排成扫描线，
    大块水渍负责纸的深浅，折痕只给一个很弱的光影暗示。
    """
    rng = np.random.default_rng(77)
    grain = rng.normal(0, 1, (H, W)).astype(np.float32)
    grain = np.asarray(
        Image.fromarray(((grain * 0.5 + 0.5) * 255).clip(0, 255).astype(np.uint8), "L")
        .filter(ImageFilter.GaussianBlur(0.55)), np.float32
    ) / 255
    alpha = np.abs(grain - 0.5) * 0.17
    layer = np.zeros((H, W, 3), np.float32) + 0.34
    a = np.clip(alpha * 1.9, 0, 0.11)[..., None]
    rgba = np.concatenate([layer, a], axis=2)
    out = Image.fromarray((rgba * 255).astype(np.uint8), "RGBA")

    # 细短纤维：方向完全随机，增加纸的“手感”，不在海面拉出横线。
    fibers = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(fibers)
    r = random.Random(1804)
    for _ in range(760):
        x, y = r.random() * W, r.random() * H
        ln = 4 + r.random() * 32
        ang = r.uniform(0, math.pi)
        light = r.random() < 0.52
        col = (244, 232, 205, r.randint(5, 16)) if light else (100, 78, 46, r.randint(4, 12))
        d.line((x, y, x + math.cos(ang) * ln, y + math.sin(ang) * ln), fill=col, width=1)
    # 少量更长的纸筋，打破均匀颗粒感
    for _ in range(90):
        x, y = r.random() * W, r.random() * H
        ln = 34 + r.random() * 110
        ang = r.uniform(0, math.pi)
        col = (238, 226, 199, r.randint(4, 10)) if r.random() < 0.55 else (112, 88, 52, r.randint(3, 8))
        d.line((x, y, x + math.cos(ang) * ln, y + math.sin(ang) * ln), fill=col, width=1)
    fibers = fibers.filter(ImageFilter.GaussianBlur(0.65))
    out = Image.alpha_composite(out, fibers)

    # 大块水渍/纸浆云：比均匀噪点更像旧纸
    stains = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(stains)
    for _ in range(30):
        x, y = r.random() * W, r.random() * H
        rr = 110 + r.random() * 360
        dark = r.random() < 0.58
        col = (108, 82, 47, r.randint(4, 11)) if dark else (250, 240, 215, r.randint(6, 14))
        sd.ellipse((x - rr, y - rr * r.uniform(0.35, 0.7), x + rr, y + rr * r.uniform(0.35, 0.7)), fill=col)
    stains = stains.filter(ImageFilter.GaussianBlur(56))
    out = Image.alpha_composite(out, stains)

    # 一道很浅的竖折痕：让整张纸有被摊开过的感觉，而不是数码底图
    folds = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    fd = ImageDraw.Draw(folds)
    fx = int(W * 0.635)
    fd.line((fx, 0, fx, H), fill=(88, 66, 39, 11), width=22)
    fd.line((fx + 5, 0, fx + 5, H), fill=(250, 239, 213, 7), width=3)
    folds = folds.filter(ImageFilter.GaussianBlur(9))
    return Image.alpha_composite(out, folds)


def draw_plateau_details() -> Image.Image:
    """高原内部的台地和裸岩：让高原不只是换了个颜色。"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = random.Random(808)
    for y0, amp, alpha in [(520, 22, 36), (590, 18, 34), (662, 14, 30)]:
        pts = []
        for x in range(50, 1480, 8):
            y = y0 + math.sin(x * 0.009 + 0.7) * amp + math.sin(x * 0.031 + 2.1) * amp * 0.3
            pts.append((x, y))
        d.line(pts, fill=(88, 71, 49, alpha), width=1)
        d.line([(x + 1, y + 1) for x, y in pts], fill=(245, 234, 212, alpha + 8), width=1)

    # 高原裸岩：扁平的灰岩盖，不是沙漠里那种方山
    for cx, cy, rw, rh in [
        (250, 640, 90, 24), (870, 620, 72, 19), (1220, 660, 82, 21),
        (570, 690, 58, 15), (1380, 600, 48, 13),
        (380, 735, 105, 20), (1160, 728, 96, 18),
    ]:
        pts = [
            (cx - rw, cy + rh * 0.4), (cx - rw * 0.55, cy - rh),
            (cx + rw * 0.4, cy - rh * 0.85), (cx + rw, cy + rh * 0.25),
            (cx + rw * 0.35, cy + rh), (cx - rw * 0.55, cy + rh * 0.85),
        ]
        d.polygon(pts, fill=(112, 99, 78, 48))
        d.line(pts + [pts[0]], fill=(78, 64, 44, 58), width=1)
        d.line([(cx - rw * 0.5, cy - rh * 0.6), (cx + rw * 0.25, cy - rh * 0.5)],
               fill=(238, 226, 202, 46), width=1)

    # 雪线附近的残雪，和主雪山呼应
    for _ in range(20):
        x = r.uniform(100, 1450)
        y = r.uniform(600, 745)
        rw = r.uniform(8, 34)
        rh = rw * r.uniform(0.12, 0.28)
        d.ellipse((x - rw, y - rh, x + rw, y + rh), fill=(239, 235, 224, r.randint(18, 34)))
    return layer


def draw_contours() -> Image.Image:
    """在陆地上画低对比等高线，增强参考图的地图感。"""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    r = random.Random(2024)
    contours = []
    for _ in range(46):
        y0 = r.uniform(100, H - 80)
        amp = r.uniform(18, 72)
        phase = r.uniform(0, math.tau)
        freq = r.uniform(0.7, 1.7)
        pts = []
        for i in range(80):
            x = -40 + (W + 80) * i / 79
            y = y0 + math.sin(phase + (x / W) * math.tau * freq) * amp \
                + math.sin(phase * 1.7 + (x / W) * math.tau * freq * 2.3) * amp * 0.22
            pts.append((x, y))
        contours.append(pts)
    for pts in contours:
        d.line(pts, fill=(107, 84, 50, 23), width=1)
        d.line([(x + 1.2, y + 1.0) for x, y in pts], fill=(250, 241, 217, 24), width=1)

    # 只在海岸线陆侧留下等高线
    if COAST:
        mask = Image.new("L", (W, H), 255)
        md = ImageDraw.Draw(mask)
        md.polygon(COAST + [(W, H)], fill=0)
        mask = mask.filter(ImageFilter.GaussianBlur(10))
        layer.putalpha(ImageChops.multiply(layer.getchannel("A"), mask))
    return layer


def mountain_plate(name: str, x: int, y: int, w: int, h: int,
                   shadow: bool = True) -> Image.Image:
    plate = Image.open(MOUNTAIN_DIR / f"{name}.png").convert("RGBA").resize((w, h), Image.LANCZOS)
    # 统一压一点白，接上暖纸底色，避免参考图原图和地图“贴纸感”
    arr = np.asarray(plate, np.float32) / 255
    a = arr[..., 3:4]
    rgbp = arr[..., :3]
    paper = rgb(PAL["paper"])[None, None, :]
    rgbp = rgbp * 0.93 + paper * 0.07
    rgbp = np.clip((rgbp - 0.5) * 0.96 + 0.5, 0, 1)
    plate = Image.fromarray((np.concatenate([rgbp, a], axis=2) * 255).astype(np.uint8), "RGBA")

    out = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if shadow:
        sh = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        sh.paste(Image.new("RGBA", (w, h), (43, 31, 18, 40)), (x + 14, y + 18), plate)
        sh = sh.filter(ImageFilter.GaussianBlur(22))
        out = Image.alpha_composite(out, sh)
    out.alpha_composite(plate, (x, y))
    return out


def add_mountains(base: Image.Image) -> Image.Image:
    """把参考图的雪山画成两层，主脉压在森林上方，山脚用雾和雪原过渡。"""
    under = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ud = ImageDraw.Draw(under)
    # 山脚雪原/碎石台地：让山不是“剪”上去的
    for cx, cy, rx, ry, col, a in [
        (760, 655, 470, 170, (220, 208, 185), 44),
        (1140, 655, 250, 120, (222, 211, 190), 30),
        (430, 645, 230, 120, (219, 206, 181), 28),
        (760, 715, 550, 105, (144, 141, 101), 22),
    ]:
        ud.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=col + (a,))
    under = under.filter(ImageFilter.GaussianBlur(54))

    # 碎石坡：在山脚散一些低对比石块和雪沫，避免山体边缘过于干净
    r = random.Random(913)
    for _ in range(52):
        x = r.uniform(260, 1400)
        y = r.uniform(610, 760)
        rw = r.uniform(18, 56)
        rh = rw * r.uniform(0.12, 0.25)
        ud.ellipse((x - rw, y - rh, x + rw, y + rh),
                   fill=(152, 141, 115, r.randint(10, 20)))
    for _ in range(78):
        x = r.uniform(270, 1390)
        y = r.uniform(590, 755)
        rw = r.uniform(2.5, 10)
        rh = rw * r.uniform(0.24, 0.48)
        ud.ellipse((x - rw, y - rh, x + rw, y + rh),
                   fill=(98, 86, 68, r.randint(10, 24)))
    for _ in range(22):
        x = r.uniform(280, 1370)
        y = r.uniform(650, 735)
        rw = r.uniform(12, 32)
        ud.ellipse((x - rw, y - rw * 0.16, x + rw, y + rw * 0.16),
                   fill=(238, 232, 218, r.randint(10, 22)))
    under = under.filter(ImageFilter.GaussianBlur(3.0))

    # 雪山再收一档，给高原边缘和山脚草甸让出空间。
    main = mountain_plate("mountains-top", 300, 180, 1080, 558, shadow=True)

    # 保留原图的山脚雾，不再硬切底边；浅色岩台和树线会接住它。
    main.putalpha(main.getchannel("A").point(lambda v: int(v * 0.97)))

    # 山脚薄雾：短而碎，集中在雪线以下
    mist = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    md = ImageDraw.Draw(mist)
    for cx, cy, rx, ry, a in [
        (440, 650, 200, 30, 34), (740, 692, 230, 36, 42),
        (1050, 688, 200, 30, 34), (1290, 660, 150, 24, 26),
    ]:
        md.ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(240, 234, 218, a))
    mist = mist.filter(ImageFilter.GaussianBlur(28))

    out = Image.alpha_composite(base, under)
    out = Image.alpha_composite(out, main)
    out = Image.alpha_composite(out, mist)
    return out


def draw_plateau_rim() -> Image.Image:
    """高原边缘：一条不规则、被断开的岩坎。

    上一版高原只是一片浅色晕染，和草甸分不开。这里加深色的坎下阴影、
    浅色岩唇和两道台地等高线，让“高原”在地图上读得出来，但又不能出现
    一条横贯画面的直线。
    """
    rim = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    soft = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(rim)
    sd = ImageDraw.Draw(soft)
    r = random.Random(317)

    # 不是一条横贯地图的崖线，而是四段断开的岩坎：
    # 中间留出草坡和树根，避免又出现“铁路线”。
    ledges = [
        (25, 365, 756, 17, 26),
        (430, 790, 728, 20, 30),
        (910, 1235, 748, 16, 25),
        (1315, 1545, 724, 13, 20),
    ]

    def local_edge(x: float, y0: float, amp: float) -> float:
        return y0 + math.sin(x * 0.011 + 1.1) * amp + math.sin(x * 0.033 + 0.4) * amp * 0.38

    for x0, x1, y0, amp, face_h in ledges:
        # 崖面：上下缘都做成锯齿，不用等宽色带
        top = [(x, local_edge(x, y0, amp)) for x in range(x0, x1, 7)]
        bottom: list[tuple[float, float]] = []
        for x, y in reversed(top):
            bottom.append((x, y + face_h + math.sin(x * 0.13 + 1.7) * 5 + r.uniform(-2, 3)))
        poly = top + bottom
        d.polygon(poly, fill=(79, 67, 48, 62))
        # 下方投影只铺一段，blur 后再压回，形成坡脚
        sh = [(x, y + face_h - 2) for x, y in top]
        sh += [(x1, local_edge(x1, y0, amp) + face_h + 45), (x0, local_edge(x0, y0, amp) + face_h + 45)]
        sd.polygon(sh, fill=(48, 41, 30, 30))

        # 岩唇受光：只在两小段，不画通长亮线
        for a, b in [(x0 + 15, min(x1, x0 + 130)), (max(x0, x1 - 150), x1 - 12)]:
            pts = [(x, local_edge(x, y0, amp) - 1) for x in range(a, b, 7)]
            if len(pts) > 1:
                d.line(pts, fill=(235, 225, 203, 45), width=2)

        # 岩层短纹和冲沟
        for _ in range(34):
            x = r.uniform(x0 + 5, x1 - 5)
            y = local_edge(x, y0, amp) + r.uniform(1, face_h * 0.9)
            ln = r.uniform(3, 16)
            d.line((x, y, x + ln, y + r.uniform(-1, 4)),
                   fill=(53, 43, 30, r.randint(20, 48)), width=1)
        for _ in range(8):
            x = r.uniform(x0 + 10, x1 - 10)
            y = local_edge(x, y0, amp) + 2
            d.line((x, y, x + r.uniform(-4, 4), y + face_h * r.uniform(0.5, 0.95)),
                   fill=(61, 50, 35, r.randint(16, 34)), width=1)

        # 坡脚碎石与草根：把断崖两端融化出去
        for _ in range(14):
            gx = r.uniform(x0, x1)
            gy = local_edge(gx, y0, amp) + face_h + r.uniform(2, 28)
            d.ellipse((gx - 2, gy - 1, gx + r.uniform(2, 8), gy + r.uniform(1, 3)),
                      fill=(119, 104, 79, r.randint(10, 24)))
        for _ in range(10):
            gx = r.uniform(x0, x1)
            gy = local_edge(gx, y0, amp) + face_h + r.uniform(2, 22)
            d.line((gx, gy, gx + r.uniform(-2, 3), gy - r.uniform(3, 8)),
                   fill=(101, 108, 67, r.randint(12, 26)), width=1)

    soft = soft.filter(ImageFilter.GaussianBlur(10))
    rim = Image.alpha_composite(soft, rim)
    rim = rim.filter(ImageFilter.GaussianBlur(1.2))

    # 右侧逐渐淡出，避免把沙漠也切出高原坎
    fade = Image.new("L", (W, H), 255)
    fd = ImageDraw.Draw(fade)
    for x in range(1360, 1660):
        dx = int((x - 1360) / 300 * 255)
        fd.line((x, 0, x, H), fill=255 - dx)
    fade = fade.filter(ImageFilter.GaussianBlur(18))
    rim.putalpha(ImageChops.multiply(rim.getchannel("A"), fade))
    return rim


# ---------- 1. 柔和地形分区 ----------
u = np.tile(np.linspace(0, 1, W, dtype=np.float32), (H, 1))
v = np.tile(np.linspace(0, 1, H, dtype=np.float32)[:, None], (1, W))
n1 = fbm(1, 4, 6)
n2 = fbm(2, 9, 5)
n3 = fbm(3, 24, 4)

forest_w = np.clip(
    smooth(0.68, 0.18, u) * 0.95
    + smooth(0.52, 0.92, v) * 0.45
    + (n1 - 0.5) * 0.6, 0, 2)
plateau_w = np.clip(
    smooth(0.55, 0.06, v) * smooth(0.78, 0.08, u) * 1.15
    + (n2 - 0.5) * 0.35, 0, 2)
desert_w = np.clip(
    smooth(0.6, 0.04, v) * smooth(0.34, 0.86, u) * 1.15
    + (0.5 - n2) * 0.4, 0, 2)
coast_w = np.clip(
    smooth(0.46, 0.92, v) * smooth(0.38, 0.85, u) * 1.05
    + (0.5 - n1) * 0.3, 0, 2)
forest_w *= 1 - smooth(0.55, 0.9, u) * smooth(0.55, 0.95, v) * 0.4
total = forest_w + plateau_w + desert_w + coast_w + 1e-6
fw, pw, dw, cw = forest_w / total, plateau_w / total, desert_w / total, coast_w / total

cols = np.zeros((H, W, 3), np.float32)
for weight, key in [(fw, "grass"), (pw, "rock"), (dw, "sand"), (cw, "field")]:
    cols += weight[..., None] * rgb(PAL[key])

# 大块深浅，让分区像水彩晕染而不是色块拼接
mottle = (n1 - 0.5)[..., None] * 0.10 + (n3 - 0.5)[..., None] * 0.045
cols = np.clip(cols * (1 + mottle), 0, 1)

# 西北高原：雪山必须站在一整片浅色岩原上，而不是绿色草地里的贴纸。
# 用噪声把边界打碎，山脚再过渡回草甸。
highland_d = np.sqrt(((u - 0.38) / 0.44) ** 2 + ((v - 0.34) / 0.31) ** 2)
highland = smooth(1.06, 0.82, highland_d + (n2 - 0.5) * 0.13)
highland *= smooth(0.88, 0.66, v + (n1 - 0.5) * 0.10)
high_col = rgb(PAL["rock"]) * 0.58 + rgb(PAL["field"]) * 0.28 + rgb(PAL["paper"]) * 0.14
high_col = high_col * (0.91 + (n3[..., None] - 0.5) * 0.18)
cols = cols * (1 - highland[..., None] * 0.91) + high_col * (highland[..., None] * 0.91)

# 山脚岩台：一圈不规则的浅色碎石地，把雪山底边接到草甸上
apron_d = np.sqrt(((u - 0.37) / 0.36) ** 2 + ((v - 0.49) / 0.145) ** 2)
apron = smooth(1.04, 0.72, apron_d + (n1 - 0.5) * 0.24)
apron *= smooth(0.78, 0.56, v + (n3 - 0.5) * 0.08)
apron_col = rgb(PAL["rock"]) * 0.46 + rgb(PAL["sand"]) * 0.30 + rgb(PAL["paper"]) * 0.24
apron_col = apron_col * (0.94 + (n3[..., None] - 0.5) * 0.14)
cols = cols * (1 - apron[..., None] * 0.60) + apron_col * (apron[..., None] * 0.60)

# 高原上的草甸斑块和裸岩带
meadow = (smooth(0.74, 0.60, highland_d + (n1 - 0.5) * 0.26)
          * smooth(0.60, 0.79, v + (n3 - 0.5) * 0.12))
cols = cols * (1 - meadow[..., None] * 0.30) + rgb(PAL["grass"]) * (meadow[..., None] * 0.30)
rockband = smooth(0.42, 0.0, v + (n3 - 0.5) * 0.05) * highland
cols = cols * (1 - rockband[..., None] * 0.22) + rgb(PAL["rock"]) * (rockband[..., None] * 0.22)

# 海：保留大湾，颜色改成参考图的灰青
coast_line = COAST + [(W, H)]
sea_mask = Image.new("L", (W, H), 0)
sd = ImageDraw.Draw(sea_mask)
sd.polygon(coast_line, fill=255)
sea_mask = sea_mask.filter(ImageFilter.GaussianBlur(1.6))
sm = np.asarray(sea_mask, np.float32) / 255
sm = smooth(0.42, 0.58, sm + (n2 - 0.5) * 0.16)
depth = np.clip(((u - 0.5) * 1.2 + (v - 0.55) * 0.8), 0, 1)
water = rgb(PAL["sea"]) * (1 - depth[..., None] * 0.68) + rgb(PAL["sea_deep"]) * depth[..., None] * 0.68
cols = cols * (1 - sm[..., None]) + water * sm[..., None]

# 沿海格附近的浅色“踩踏带”压低存在感
band = Image.new("RGBA", (W, H), (0, 0, 0, 0))
bd = ImageDraw.Draw(band)
for t in TILES:
    i = t["i"]
    z = "forest" if i <= 18 else "plateau" if i <= 35 else "desert" if i <= 52 else "coast"
    c = rgb(PAL[{"forest": "grass", "plateau": "rock", "desert": "sand", "coast": "field"}[z]])
    col = tuple(int(x * 255) for x in c)
    bd.ellipse((t["x"] - 128, t["y"] - 128, t["x"] + 128, t["y"] + 128), fill=(col[0], col[1], col[2], 15))
band = band.filter(ImageFilter.GaussianBlur(40))
ba = np.asarray(band, np.float32) / 255
cols = cols * (1 - ba[..., 3:4] * 0.35) + ba[..., :3] * (ba[..., 3:4] * 0.35)

# 暖纸统一色 + 轻微明暗（整体比上一版深半档）
paper = rgb(PAL["paper"])
cols = cols * 0.94 + paper * 0.06
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
d = np.sqrt(((xx / W - 0.5) * 1.12) ** 2 + ((yy / H - 0.5) * 1.0) ** 2)
vig = np.clip((d - 0.46) / 0.54, 0, 1) * 0.21
cols *= (1 - vig[..., None])
cols = np.clip(cols, 0, 1)

base = Image.fromarray((cols * 255).astype(np.uint8), "RGB").convert("RGBA")

# ---------- 2. 等高线 -> 高原坎 -> 雪山 -> 纸纹 ----------
base = Image.alpha_composite(base, draw_plateau_details())
base = Image.alpha_composite(base, draw_contours())
# 不再叠加一条失败的崖线；高原靠色阶、台地等高线和裸岩识别
base = add_mountains(base)
base = Image.alpha_composite(base, paper_layer())

# 极轻的锐化，恢复 WebP 前的笔触
base = base.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1.2, percent=45, threshold=4))
base.save(OUT, quality=91, method=6)
print("saved", OUT, OUT.stat().st_size)
