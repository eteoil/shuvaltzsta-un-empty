// コードで描くドット絵の道具（1ドット＝1px、線も1ドット）。バニーキャットや銀行の出納機が使う。
// 形（(x, y) → 真偽）を奥から順にパーツとして塗り、finish() で外側と、奥のパーツとの境目に1ドットの線を引く。
// 同じ group のパーツ同士の境目には線を引かない（袖と上着のように、色の違いだけで分ける）。
// 光は左上からで、各パーツの右と下の縁（shade ドット）を影の色にできる。

export const LINE = '#231815';
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export function createDots(W, H, { shade = 2 } = {}) {
  const part = Array.from({ length: H }, () => Array(W).fill(0));   // パーツの番号（0 は空き）
  const color = Array.from({ length: H }, () => Array(W).fill(null));
  const lines = [null];   // 番号 → そのパーツの縁に線を引くか
  const groups = [null];  // 番号 → まとまり（同じまとまりの境目には線を引かない）
  const tags = [null];    // 番号 → 名前（stamp で、その上には押さない所を選ぶため）
  const each = (f) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(x, y); };
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;
  let out = null;

  return {
    // paint(x, y, edge) で色を決める。edge は右か下の縁（影）
    fill(shape, paint, { line = true, group = null, tag = null } = {}) {
      const id = lines.push(line) - 1;
      groups.push(group ?? `#${id}`);
      tags.push(tag);
      const mine = [];
      each((x, y) => { if (shape(x + 0.5, y + 0.5)) { part[y][x] = id; mine.push([x, y]); } });
      const has = (x, y) => inside(x, y) && part[y][x] === id;
      for (const [x, y] of mine) color[y][x] = paint(x, y, !has(x + shade, y) || !has(x, y + shade));
    },
    // 手で描いたドット（1文字＝1ドット）を1つのパーツとして塗る。'.' と 'o' は塗らない（'o' の所には finish が線を引く）
    fillStamp(rows, x0, y0, colors, opts = {}) {
      const at = (x, y) => rows[y - y0]?.[x - x0];
      this.fill((x, y) => { const ch = at(Math.floor(x), Math.floor(y)); return !!ch && ch !== '.' && ch !== 'o'; },
        (x, y) => colors[at(x, y)], opts);
    },
    // 手で引く線（点の並び）を、今の時点の上に描く。あとから塗ったパーツはこの線を隠せる
    stroke(points, c = LINE) {
      const id = lines.push(false) - 1;
      groups.push('#stroke');
      tags.push(null);
      for (const [x, y] of points) if (inside(x, y)) { part[y][x] = id; color[y][x] = c; }
    },
    // 線を引いて、あとから点を描き足せるようにする。outline が false なら自動の線は引かない（線を stroke で手で引いた絵）
    finish({ outline = true } = {}) {
      out = color.map((r) => r.slice());
      if (!outline) return;
      each((x, y) => {
        const p = part[y][x];
        const near = N4.map(([a, b]) => (inside(x + a, y + b) ? part[y + b][x + a] : 0));
        if (!p) { if (near.some((q) => q)) out[y][x] = LINE; return; }
        if (lines[p] && near.some((q) => q && q < p && lines[q] && groups[q] !== groups[p])) out[y][x] = LINE;
      });
    },
    put(x, y, c) { if (out && inside(x, y)) out[y][x] = c; },
    // 1文字＝1ドットの絵を (x0, y0) に押す。'.' は何もしない。colors は文字 → 色。skip の名前（tag）のパーツの上には押さない
    stamp(rows, x0, y0, colors, { skip = null } = {}) {
      rows.forEach((row, j) => [...row].forEach((ch, i) => {
        const x = x0 + i;
        const y = y0 + j;
        if (ch === '.' || (skip && inside(x, y) && tags[part[y][x]] === skip)) return;
        this.put(x, y, colors[ch]);
      }));
    },
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

// 手で打った輪郭の点を、角を切って滑らかにする（Chaikin 法を times 回）。
// 点は [x, y] か [x, y, 1]。3つ目が 1 の点は尖ったまま残す（毛先・つま先）
export const smooth = (pts, times = 2) => {
  let p = pts;
  for (let k = 0; k < times; k++) {
    const next = [];
    p.forEach((v, i) => {
      if (v[2]) { next.push(v); return; }
      const a = p[(i - 1 + p.length) % p.length];
      const b = p[(i + 1) % p.length];
      next.push([v[0] * 0.75 + a[0] * 0.25, v[1] * 0.75 + a[1] * 0.25]);
      next.push([v[0] * 0.75 + b[0] * 0.25, v[1] * 0.75 + b[1] * 0.25]);
    });
    p = next;
  }
  return poly(p);
};

// 2点を結ぶ1ドットの線の点（Bresenham）。クォータービューの 2:1 の線は、きれいに2ドットずつの段になる
export const linePoints = (x0, y0, x1, y1) => {
  const pts = [];
  let [x, y] = [Math.floor(x0), Math.floor(y0)];
  const [tx, ty] = [Math.floor(x1), Math.floor(y1)];
  const dx = Math.abs(tx - x);
  const dy = -Math.abs(ty - y);
  const sx = x < tx ? 1 : -1;
  const sy = y < ty ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    pts.push([x, y]);
    if (x === tx && y === ty) return pts;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
};

// 曲線の点の並びを、角に余分な点が無い1ドットの線にする（前後の点が斜めにつながる点は抜く）
export const thin = (pts) => {
  const uniq = [];
  for (const p of pts) {
    const q = uniq[uniq.length - 1];
    if (!q || q[0] !== p[0] || q[1] !== p[1]) uniq.push(p);
  }
  const out = [];
  for (let k = 0; k < uniq.length; k++) {
    const a = out[out.length - 1];
    const c = uniq[k + 1];
    const b = uniq[k];
    if (a && c && Math.abs(a[0] - c[0]) === 1 && Math.abs(a[1] - c[1]) === 1) continue;
    out.push(b);
  }
  return out;
};

// 楕円の弧（中心 cx, cy・半径 rx, ry・角度 a0〜a1。y は下が正）の1ドットの線
export const arcPoints = (cx, cy, rx, ry, a0 = 0, a1 = Math.PI * 2) => {
  const pts = [];
  const n = Math.max(24, Math.ceil((rx + ry) * 8));
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    pts.push([Math.floor(cx + Math.cos(a) * rx), Math.floor(cy + Math.sin(a) * ry)]);
  }
  return thin(pts);
};
