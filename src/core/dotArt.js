// コードで描くドット絵の道具（1ドット＝1px、線も1ドット）。バニーキャットや銀行の出納機が使う。
// 形（(x, y) → 真偽）を奥から順にパーツとして塗り、finish() で外側と、奥のパーツとの境目に1ドットの線を引く。
// 光は左上からで、各パーツの右と下の縁（shade ドット）を影の色にできる。

export const LINE = '#231815';
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function createDots(W, H, { shade = 2 } = {}) {
  const part = Array.from({ length: H }, () => Array(W).fill(0));   // パーツの番号（0 は空き）
  const color = Array.from({ length: H }, () => Array(W).fill(null));
  const lines = [null];   // 番号 → そのパーツの縁に線を引くか
  const each = (f) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(x, y); };
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  let out = null;

  return {
    // paint(x, y, edge) で色を決める。edge は右か下の縁（影）
    fill(shape, paint, { line = true } = {}) {
      const id = lines.push(line) - 1;
      const mine = [];
      each((x, y) => { if (shape(x + 0.5, y + 0.5)) { part[y][x] = id; mine.push([x, y]); } });
      const has = (x, y) => inside(x, y) && part[y][x] === id;
      for (const [x, y] of mine) color[y][x] = paint(x, y, !has(x + shade, y) || !has(x, y + shade));
    },
    // 線を引いて、あとから点を描き足せるようにする
    finish() {
      out = color.map((r) => r.slice());
      each((x, y) => {
        const p = part[y][x];
        const near = N4.map(([a, b]) => (inside(x + a, y + b) ? part[y + b][x + a] : 0));
        if (!p) { if (near.some((q) => q)) out[y][x] = LINE; return; }
        if (lines[p] && near.some((q) => q && q < p && lines[q])) out[y][x] = LINE;
      });
    },
    put(x, y, c) { if (out && inside(x, y)) out[y][x] = c; },
    rect(x0, y0, x1, y1, c) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.put(x, y, c); },
    // 左右反転して返す
    result(flip = false) { return flip ? out.map((r) => r.slice().reverse()) : out; },
  };
}

export const flat = (c, dark = c) => (x, y, edge) => (edge ? dark : c);

export const ellipse = (cx, cy, rx, ry, deg = 0) => {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    return ((dx * cos + dy * sin) / rx) ** 2 + ((-dx * sin + dy * cos) / ry) ** 2 <= 1;
  };
};

export const poly = (pts) => (x, y) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

export const any = (...shapes) => (x, y) => shapes.some((s) => s(x, y));

// 太さ w の線分（腕）
export const capsule = ([x0, y0], [x1, y1], w) => (x, y) => {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(x - (x0 + vx * t), y - (y0 + vy * t)) <= w / 2;
};

// 2次ベジェに沿って丸を並べる（しっぽ）。r は付け根 → 先
export const tube = (p0, p1, p2, r0, r1) => {
  const list = [];
  for (let t = 0; t <= 1.001; t += 0.04) {
    const x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0];
    const y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1];
    const r = r0 + (r1 - r0) * t;
    list.push(ellipse(x, y, r, r));
  }
  return any(...list);
};

// 形を (ox, oy) を中心に deg 度回す
export const rotate = (shape, deg, ox, oy) => {
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return (x, y) => shape(ox + (x - ox) * cos + (y - oy) * sin, oy - (x - ox) * sin + (y - oy) * cos);
};
