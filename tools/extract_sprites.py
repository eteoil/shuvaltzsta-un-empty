"""拡大して描かれたドット絵を、1ドット＝1pxのチップに戻す。

参考画像は1ドットが 12.5px（キャラ）/ 10px（床）で描かれている。
各マスの中央付近で一番多い色をそのマスの色とする。

    pip install pillow
    python3 tools/extract_sprites.py

入力: art/reference/*.png   出力: assets/img/*.png
"""
from collections import Counter
from pathlib import Path

from PIL import Image

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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (src, cell, w, h) in JOBS.items():
        img = extract(REF / src, cell, w, h)
        img.save(OUT / f"{name}.png", optimize=True)
        colors = sum(1 for _, c in img.getcolors(maxcolors=w * h) if c[3])
        print(f"{name}.png  {w}x{h}  {colors} colors")


if __name__ == "__main__":
    main()
