"""参考画像から、ゲームで使う 1ドット＝1px の画像を起こす。

- キャラと床：1ドットが 12.5px（キャラ）/ 10px（床）で描かれている。
  各マスの中央付近で一番多い色をそのマスの色とする。
- タイトル：ぼかしの入った線画を画面（480×320）に合わせて縮め、2値化して1px幅の線にする。
  手描きのメニュー文字はゲーム側で描くので消す。

    pip install pillow
    python3 tools/extract_sprites.py

入力: art/reference/*.png   出力: assets/img/*.png
"""
from collections import Counter
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / "art" / "reference"
OUT = ROOT / "assets" / "img"

# 出力名: (参考画像, 1ドットの大きさ, 幅, 高さ)
JOBS = {
    "player_nw": ("player_nw.png", 12.5, 64, 136),
    "player_ne": ("player_ne.png", 12.5, 64, 136),
    "player_sw": ("player_sw.png", 12.5, 64, 136),
    "player_se": ("player_se.png", 12.5, 64, 136),
    "floor_block": ("floor_block.png", 10.0, 80, 80),
}


def extract(src: Path, cell: float, w: int, h: int) -> Image.Image:
    rgba = Image.open(src).convert("RGBA")
    px = rgba.load()
    out = Image.new("RGBA", (w, h))
    dst = out.load()
    for cy in range(h):
        for cx in range(w):
            x0, x1 = int(cx * cell + cell * 0.3), int(cx * cell + cell * 0.7) + 1
            y0, y1 = int(cy * cell + cell * 0.3), int(cy * cell + cell * 0.7) + 1
            votes = Counter()
            for y in range(y0, min(y1, rgba.height)):
                for x in range(x0, min(x1, rgba.width)):
                    r, g, b, a = px[x, y]
                    votes[(r, g, b, 255) if a >= 128 else (0, 0, 0, 0)] += 1
            dst[cx, cy] = votes.most_common(1)[0][0]
    return out


# タイトル：(参考画像, 縮小率, 左から切る幅, 線とみなす濃さ, 消す範囲)
TITLE = {
    "src": "title.png",
    "size": (480, 320),
    "scale": 0.54,
    "crop_left": 12,
    "threshold": 70,
    "erase": [(0, 0, 927, 5), (0, 524, 927, 526), (592, 288, 782, 398)],
    "line": (58, 44, 36, 255),
}


def extract_title(t: dict) -> Image.Image:
    gray = Image.open(REF / t["src"]).convert("L")
    ink = gray.point(lambda v: 255 - v)
    draw = ImageDraw.Draw(ink)
    for box in t["erase"]:
        draw.rectangle((box[0], box[1], box[2] - 1, box[3] - 1), fill=0)
    w, h = round(ink.width * t["scale"]), round(ink.height * t["scale"])
    small = ink.resize((w, h), Image.BOX).point(lambda v: 255 if v > t["threshold"] else 0)
    W, H = t["size"]
    out = Image.new("RGBA", (W, H))
    line = Image.new("RGBA", (W, H), t["line"])
    mask = Image.new("L", (W, H))
    mask.paste(small.crop((t["crop_left"], max(0, h - H), t["crop_left"] + W, h)), (0, max(0, H - h)))
    out.paste(line, (0, 0), mask)
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, cell, w, h) in JOBS.items():
        img = extract(REF / src, cell, w, h)
        img.save(OUT / f"{name}.png", optimize=True)
        colors = sum(1 for _, c in img.getcolors(maxcolors=w * h) if c[3])
        print(f"{name}.png  {w}x{h}  {colors} colors")
    title = extract_title(TITLE)
    title.save(OUT / "title.png", optimize=True)
    print(f"title.png  {title.width}x{title.height}")


if __name__ == "__main__":
    main()
