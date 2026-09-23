"""キャラの静止チップをパーツ（上半身・左脚・右脚）に割り、ずらしてモーションのコマを作る。

    pip install pillow
    python3 tools/animate_sprites.py

入力: assets/img/player_{向き}.png（64×136）
出力: assets/img/player_{モーション}_{向き}.png（横にコマを並べたシート。1コマ 64×FRAME_H）

手描きのコマができたら、同じ名前・同じ並びのシートで置き換えればよい。
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "assets" / "img"

W, H = 64, 136
HEAD_ROOM = 16              # 跳ぶコマのために、頭の上に足す余白
FRAME_H = H + HEAD_ROOM
WAIST = 90                  # この行から下が脚
FILL_ROWS = 4               # 上半身を持ち上げたとき、すき間を埋める裾の行数（4ドットまで持ち上げてよい）
LINE = (35, 24, 21)         # 輪郭線の色
HAND_ROWS = 6               # 腰から何行目までに始まる塊を「手の先」の候補にするか
HAND_SPREAD = 13            # 中心からこれより外にある塊は手の先

# 画面上で前に進む向き（x）。北東・南東は右、北西・南西は左
FORWARD = {"ne": 1, "se": 1, "nw": -1, "sw": -1}

# 1コマ = (上半身 dx, dy, 前脚 dx, dy, 後脚 dx, dy)。dx は前向きを正、dy は上を負とする
MOTIONS = {
    "walk": [
        (0, 0, 0, 0, 0, 0),
        (0, -1, 1, -2, 0, 0),
        (0, 0, 0, 0, 0, 0),
        (0, -1, 0, 0, 1, -2),
    ],
    "run": [
        (1, 0, 2, 0, -1, 0),
        (2, -2, 2, -4, 0, 0),
        (1, 0, -1, 0, 2, 0),
        (2, -2, 0, 0, 2, -4),
    ],
    "attack": [
        (-2, 1, 0, 0, 0, 0),
        (5, -1, 3, 0, -1, 0),
        (2, 0, 1, 0, 0, 0),
    ],
    "dodge": [
        (0, 3, 0, 0, 0, 0),
        (0, -12, 1, -15, 0, -12),
        (0, 1, 0, 0, 0, 0),
    ],
}


def split_x(img: Image.Image) -> int:
    """左右の脚のすき間の列（膝あたりの行で、透明な列が続く中央）"""
    px = img.load()
    mids = []
    for y in range(WAIST + 4, WAIST + 22):
        xs = [x for x in range(16, 48) if px[x, y][3] == 0]
        runs, start = [], None
        for x in range(16, 49):
            if x in xs and start is None:
                start = x
            if (x not in xs or x == 48) and start is not None:
                runs.append((start, x - 1))
                start = None
        inner = [r for r in runs if r[0] > 18 and r[1] < 46]
        if inner:
            a, b = max(inner, key=lambda r: r[1] - r[0])
            mids.append((a + b) / 2)
    return round(sum(mids) / len(mids)) if mids else W // 2


def leg_sides(img: Image.Image) -> dict:
    """腰から下の各ドットが左脚（L）・右脚（R）・上半身（U）のどれか。

    縦一直線で割ると、線を共有している左右の靴が切れてしまう。
    そこで輪郭線以外の色の塊ごとに、重心がすき間の列より左か右かで振り分け、
    輪郭線のドットは一番近い塊の側に付ける。
    腰より下まで垂れている手の先は、脚から離れた位置にあるので上半身に入れる。
    """
    px = img.load()
    sx = split_x(img)
    opaque = {(x, y) for y in range(WAIST, H) for x in range(W) if px[x, y][3]}
    fill = {p for p in opaque if px[p][:3] != LINE}
    side = {}
    seen = set()
    for p in fill:
        if p in seen:
            continue
        comp, stack = [], [p]
        seen.add(p)
        while stack:
            x, y = stack.pop()
            comp.append((x, y))
            for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if q in fill and q not in seen and px[q][:3] == px[p][:3]:
                    seen.add(q)
                    stack.append(q)
        cx = sum(x for x, _ in comp) / len(comp)
        top = min(y for _, y in comp)
        if top < WAIST + HAND_ROWS and abs(cx - W / 2) > HAND_SPREAD:
            label = "U"
        else:
            label = "L" if cx <= sx + 0.5 else "R"
        for q in comp:
            side[q] = label
    # 輪郭線は近い塊の側へ（幅優先で広げる）
    frontier = list(side)
    while frontier:
        nxt = []
        for x, y in frontier:
            for q in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if q in opaque and q not in side:
                    side[q] = side[(x, y)]
                    nxt.append(q)
        frontier = nxt
    return side


def parts(img: Image.Image):
    """上半身・左脚・右脚を、元の位置のまま別々の画像に分ける"""
    upper = Image.new("RGBA", (W, H))
    left = Image.new("RGBA", (W, H))
    right = Image.new("RGBA", (W, H))
    upper.paste(img.crop((0, 0, W, WAIST)), (0, 0))
    src = img.load()
    layer = {"L": left, "R": right, "U": upper}
    for (x, y), s in leg_sides(img).items():
        layer[s].putpixel((x, y), src[x, y])
    # すき間埋めは裾だけ（両脇の手は入れない）
    fill = Image.new("RGBA", (W, H))
    x0, x1 = W // 2 - HAND_SPREAD, W // 2 + HAND_SPREAD + 1
    fill.paste(img.crop((x0, WAIST - FILL_ROWS, x1, WAIST)), (x0, WAIST - FILL_ROWS))
    return upper, left, right, fill


def frame(img: Image.Image, face: str, pose) -> Image.Image:
    f = FORWARD[face]
    udx, udy, fdx, fdy, bdx, bdy = pose
    upper, left, right, fill = parts(img)
    # 右向きなら右脚が前、左向きなら左脚が前
    front, back = (right, left) if f > 0 else (left, right)
    out = Image.new("RGBA", (W, FRAME_H))
    base = HEAD_ROOM
    out.alpha_composite(back, (bdx * f, base + bdy))
    out.alpha_composite(front, (fdx * f, base + fdy))
    # 上半身が脚より高く上がったら、脚の上端に裾を足してすき間を埋める
    legs_top = min(fdy, bdy)
    if udy < legs_top:
        out.alpha_composite(fill, (udx * f, base + legs_top))
    out.alpha_composite(upper, (udx * f, base + udy))
    return out


def main() -> None:
    for face in FORWARD:
        img = Image.open(IMG / f"player_{face}.png").convert("RGBA")
        for name, poses in MOTIONS.items():
            sheet = Image.new("RGBA", (W * len(poses), FRAME_H))
            for n, pose in enumerate(poses):
                sheet.alpha_composite(frame(img, face, pose), (W * n, 0))
            sheet.save(IMG / f"player_{name}_{face}.png", optimize=True)
        print(f"player_*_{face}.png  split at x={split_x(img)}")


if __name__ == "__main__":
    main()
