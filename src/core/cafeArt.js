// シャルヴィスのカフェ（バー）の内装。参考は、ランプの灯った木の酒場：左奥の壁にバーカウンターと、緑に光る酒棚の上のロフト（手すりと本棚）、
// ロフトから降りる階段、右奥の壁に水槽をのぞくアーチ窓、窓の前の赤いボックス席、蓄音機、丸テーブルと椅子、スレートの石の床。
// どれも 1ドット＝1px で、クォータービュー（床のマスは 80×40 のひし形）の角度で組み立てる。
// 物の絵は { dots, ax, ay }：dots の (ax, ay) が、置いたマス（アンカーのマス）の上の頂点に来る。
import { createDots, flat, poly, ellipse, capsule, linePoints } from './dotArt.js';

// 水槽の窓の壁のてっぺん（酒棚から続く梁と同じ高さ。その上の壁は描かない）と、窓のてっぺん（壁のてっぺんの梁のすぐ下）
export const WINDOW_WALL_TOP = 136;
const WINDOW_TOP = 118;
// 酒棚のてっぺんから扉と額の壁の上へ続く梁（BEAM_Z からロフトの床の高さまで）。扉は梁のすぐ下まで
const BEAM_Z = 122;
const DOOR_H = BEAM_Z;

export const CAFE = {
  stepH: 34,      // 段の高さ（ロフトは4段＝136）
  loftH: 136,     // ロフトの床の高さ。主人公（約132）が下に立っても頭がぶつからない
  wallH: 270,     // 壁の高さ。ロフトの床から主人公の背丈ぶん
};

// 決まった乱数（同じ引数ならいつも同じ）
const hash = (a, b = 0, c = 0) => {
  let h = Math.imul(a + 1013, 374761393) ^ Math.imul(b + 7919, 668265263) ^ Math.imul(c + 104729, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const mix = (a, b, k) => {
  const p = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, k))).toString(16).padStart(2, '0')).join('')}`;
};

// ---------------------------------------------------------------- 床（スレートの敷石）

const FLOOR = {
  stones: ['#59626d', '#4f5762', '#646d78', '#5b6068', '#686c72', '#525b66'],
  grout: '#30353d', fleck: '#808a96', sheen: '#76808c',
  left: '#4a5059', right: '#363b43', leftDark: '#3c424a', rightDark: '#2b2f36',
};

export function cafeFloorDots() {
  const W = 80;
  const H = 80;
  const out = Array.from({ length: H }, () => Array(W).fill(null));
  const uv = (x, y) => [((x + 0.5 - 40) / 40 + (y + 0.5) / 20) / 2, (-(x + 0.5 - 40) / 40 + (y + 0.5) / 20) / 2];
  // 石は 3×3 のずらした格子の、いちばん近い点の領域（マスの端で向かいの端とつながるので、並べても継ぎ目が出ない）
  const seeds = [];
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) seeds.push([(a + 0.2 + 0.6 * hash(a, b)) / 3, (b + 0.2 + 0.6 * hash(b, a, 5)) / 3]);
  const near = (u, v) => {
    const d = seeds.map(([su, sv], k) => {
      const du = Math.min(Math.abs(u - su), 1 - Math.abs(u - su));
      const dv = Math.min(Math.abs(v - sv), 1 - Math.abs(v - sv));
      return [Math.hypot(du * 1.1, dv), k];
    }).sort((p, q) => p[0] - q[0]);
    return d;
  };
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = uv(x, y);
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;
      const [[d1, k], [d2]] = near(u, v);
      let c = FLOOR.stones[k % FLOOR.stones.length];
      if (d2 - d1 < 0.028) c = FLOOR.grout;
      else if (hash(x, y, 3) < 0.05) c = FLOOR.fleck;
      else if (d1 < 0.06 && hash(k, 9) < 0.5) c = FLOOR.sheen;   // 磨かれた石のつや
      out[y][x] = c;
    }
  }
  for (let y = 20; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const left = x < 40;
      const topY = left ? 20 + x / 2 : 20 + (80 - x) / 2;
      if (y + 0.5 < topY || y + 0.5 > topY + 40 || out[y][x]) continue;
      const depth = y + 0.5 - topY;
      out[y][x] = depth > 30 ? (left ? FLOOR.leftDark : FLOOR.rightDark) : (left ? FLOOR.left : FLOOR.right);
    }
  }
  return out;
}

// ---------------------------------------------------------------- クォータービューの箱を描く道具

// u・v はマスの単位（u は i の向き、v は j の向き）、z は床からの高さ（ドット）。(0, 0, 0) はアンカーのマスの上の頂点
function iso(u0, u1, v0, v1, z1, { z0 = 0 } = {}) {
  const xmin = Math.floor((u0 - v1) * 40) - 3;
  const xmax = Math.ceil((u1 - v0) * 40) + 3;
  const ymin = Math.floor((u0 + v0) * 20 - z1) - 3;
  const ymax = Math.ceil((u1 + v1) * 20 - z0) + 3;
  const W = xmax - xmin + 1;
  const H = ymax - ymin + 1;
  const ax = -xmin;
  const ay = -ymin;
  const d = createDots(W, H, { shade: 0 });
  const P = (u, v, z = 0) => [ax + (u - v) * 40, ay + (u + v) * 20 - z];
  // 画面の点 → 面の上の位置
  const onSE = (U, x, y) => { const v = U - (x + 0.5 - ax) / 40; return [v, ay + (U + v) * 20 - (y + 0.5)]; };
  const onSW = (V, x, y) => { const u = (x + 0.5 - ax) / 40 + V; return [u, ay + (u + V) * 20 - (y + 0.5)]; };
  const onTop = (Z, x, y) => { const a = (x + 0.5 - ax) / 40; const b = (y + 0.5 - ay + Z) / 20; return [(a + b) / 2, (b - a) / 2]; };
  return { d, P, W, H, ax, ay, onSE, onSW, onTop };
}

// 箱。paint の top(u, v)・se(v, z)・sw(u, z) が色を返す（無い面は描かない）
function box(c, u0, u1, v0, v1, z0, z1, paint, opts = {}) {
  const { d, P } = c;
  if (paint.sw) d.fill(poly([P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)]), (x, y) => paint.sw(...c.onSW(v1, x, y), x, y), opts);
  if (paint.se) d.fill(poly([P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)]), (x, y) => paint.se(...c.onSE(u1, x, y), x, y), opts);
  if (paint.top) d.fill(poly([P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)]), (x, y) => paint.top(...c.onTop(z1, x, y), x, y), opts);
}

const done = (c, outline = true) => { c.d.finish({ outline }); return { dots: c.d.result(), ax: c.ax, ay: c.ay }; };

// 立体の部品を点で描く道具（世界の座標：U = u×L, V = v×L, Z = 高さ。手前の点が奥の点を隠す）。
// 丸い物（椅子の座面・脚、像）を、見る向きと光の向きから陰を付けて描く。最後に flush(group) で絵に移す
const SOLID_L = 48;   // 1マスの辺の長さ（高さの1ドットと同じ尺度）
function solid3d(c) {
  const L = SOLID_L;
  const { P } = c;
  const view = (() => { const k = 40 / L; const n = Math.hypot(1, 1, k); return [1 / n, 1 / n, k / n]; })();
  const light = (() => { const v = [-0.5, 0.35, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const n = Math.hypot(...a) || 1; return a.map((x) => x / n); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const W = c.W;
  const zbuf = new Float64Array(W * c.H).fill(-Infinity);
  const col = new Array(W * c.H).fill(null);
  const plot = (U, V, Z, color) => {
    if (!color) return;
    const [x, y] = P(U / L, V / L, Z);
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= c.H) return;
    const depth = dot([U, V, Z], view);
    const k = yi * W + xi;
    if (depth > zbuf[k]) { zbuf[k] = depth; col[k] = color; }
  };
  const shade = (n) => dot(n, light);
  // 楕円体（中心 C、半径 R=[ru, rv, rz]）。paint(n, p) が色を返す（n は面の向き、p は面の点）
  const ellipsoid = (C, R, paint) => {
    const m = Math.max(...R);
    const nt = Math.ceil(m * 4);
    const np = Math.ceil(m * 8);
    for (let i = 0; i <= nt; i++) {
      const th = (i / nt) * Math.PI;
      for (let j = 0; j < np; j++) {
        const ph = (j / np) * Math.PI * 2;
        const e = [Math.sin(th) * Math.cos(ph), Math.sin(th) * Math.sin(ph), Math.cos(th)];
        const p = [C[0] + R[0] * e[0], C[1] + R[1] * e[1], C[2] + R[2] * e[2]];
        plot(...p, paint(norm([e[0] / R[0], e[1] / R[1], e[2] / R[2]]), p));
      }
    }
  };
  // 管（中心線 path(t)、太さ rad(t)）。paint(n, t, th) が色を返す。ends なら両端に蓋
  const tube = (path, rad, paint, { steps = 0, ends = true } = {}) => {
    const a0 = path(0);
    const a1 = path(1);
    const len = Math.hypot(a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]);
    const n = steps || Math.max(8, Math.ceil(len * 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const C = path(t);
      const C2 = path(Math.min(1, t + 0.01));
      const C1 = path(Math.max(0, t - 0.01));
      const T = norm([C2[0] - C1[0], C2[1] - C1[1], C2[2] - C1[2]]);
      const ref = Math.abs(T[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
      const B = norm(cross(T, ref));
      const N = cross(B, T);
      const r = rad(t);
      const na = Math.max(10, Math.ceil(r * 9));
      const cap = ends && (i === 0 || i === n);
      for (let rr = cap ? 0 : r; rr <= r + 0.01; rr += 0.35) {
        for (let k = 0; k < na; k++) {
          const th = (k / na) * Math.PI * 2;
          const nn = [0, 1, 2].map((q) => Math.cos(th) * N[q] + Math.sin(th) * B[q]);
          plot(...[0, 1, 2].map((q) => C[q] + rr * nn[q]), paint(rr < r - 0.2 ? (i === 0 ? T.map((x) => -x) : T) : nn, t, th));
        }
      }
    }
  };
  const line = (a, b, r, paint) => tube((t) => [0, 1, 2].map((q) => a[q] + (b[q] - a[q]) * t), () => r, paint);
  // 平たい円盤（中心 C、半径 r、厚み h、上向き）。top(rr, th) と side(n) が色を返す
  const disk = (C, r, h, top, side) => {
    const na = Math.ceil(r * 9);
    for (let z = 0; z <= h; z += 0.4) {
      for (let k = 0; k < na; k++) {
        const th = (k / na) * Math.PI * 2;
        const n = [Math.cos(th), Math.sin(th), 0];
        plot(C[0] + r * n[0], C[1] + r * n[1], C[2] - h + z, side(n, z / h, th));
      }
    }
    for (let rr = 0; rr <= r; rr += 0.35) {
      for (let k = 0; k < na; k++) {
        const th = (k / na) * Math.PI * 2;
        plot(C[0] + rr * Math.cos(th), C[1] + rr * Math.sin(th), C[2], top(rr / r, th));
      }
    }
  };
  // clip(x, y) を渡すと、その中だけを絵に移す（飾り棚の枠の内側など）
  const flush = (group, opts = {}, clip = null) => {
    c.d.fill((x, y) => x >= 0 && y >= 0 && x < W && y < c.H && col[Math.floor(y) * W + Math.floor(x)] !== null && (!clip || clip(x, y)), (x, y) => col[y * W + x], { group, ...opts });
  };
  return { L, plot, shade, ellipsoid, tube, line, disk, flush, dot, light, view };
}
// 木の陰（光の当たる側ほど明るい）
const woodShade = (k) => (k > 0.55 ? WOOD.lighter : k > 0.15 ? WOOD.light : k > -0.3 ? WOOD.mid : WOOD.dark);

const WOOD = {
  dark: '#3e2818', mid: '#5a3a24', light: '#7a5030', lighter: '#946440', deep: '#2c1c12',
  brass: '#c9a24a', brassLight: '#ecd08a', brassDark: '#8a6a2a',
};

// ---------------------------------------------------------------- 壁

const WALL_COL = {
  ne: { plaster: '#c4b38d', speck: '#b4a27c', glow: '#dccb9f', beam: '#4a3424', beamLight: '#654733', wood: '#5c3a24', woodDark: '#46291a', panel: '#4f311f' },
  nw: { plaster: '#a99977', speck: '#9a8a68', glow: '#bfae88', beam: '#3c2a1d', beamLight: '#523a29', wood: '#4b2f1d', woodDark: '#3a2316', panel: '#41291a' },
};
const BOOKS = ['#7a3a32', '#3e5a6e', '#6e6a3a', '#4a3a5e', '#8a6a3a', '#2f5a46', '#9a5a3a', '#5a2a2a', '#c0a87a'];

// 壁。side は 'ne'（右奥）か 'nw'（左奥）。style：
//   'loft'（ロフトの上の壁：ロフトの床の高さから腰板、その上は漆喰）・'loftLamp'（＋壁のランタンのまわりの明るみ）・
//   'door'（扉。ひし形の飾りの付いた木の扉）・'plain'（腰板と漆喰）・'plainBeam'（＋酒棚から続く梁）・'doorTri'（扉と、上の三角の壁）・'lamp'（＋壁のランタンのまわりの明るみ）・
//   'window'（水槽をのぞくアーチ窓。外は青い水で、水草と魚と泡）・'painting'（絵だけ。イベントで後から掛ける額）。
// seed は窓ごとに魚や水草を変えるための番号
export function cafeWallDots(side, style, { start = false, end = false, seed = 0, top = null } = {}) {
  const H0 = CAFE.wallH;
  const T = style === 'plainBeam' ? CAFE.loftH : top ?? H0;   // この壁のてっぺん（水槽の窓の壁と額の壁は、梁の高さ）
  const W = 42;
  const H = H0 + 22;
  const d = createDots(W, H, { shade: 0 });
  const C = WALL_COL[side];
  const plain = { line: false };
  const p = (t, z) => [1 + 40 * t, 1 + H0 + (side === 'ne' ? 20 * t : 20 - 20 * t) - z];
  const band = (t0, t1, z0, z1) => poly([p(t0, z0), p(t1, z0), p(t1, z1), p(t0, z1)]);
  const onWall = (x, y) => { const t = (x - 1) / 40; return [t, 1 + H0 + (side === 'ne' ? 20 * t : 20 - 20 * t) - y]; };
  const region = (f) => (x, y) => { const [t, z] = onWall(x, y); return t >= 0 && t <= 1 && f(t, z); };
  const at = (x, y) => onWall(x + 0.5, y + 0.5);
  const line = (t0, z0, t1, z1, col) => {
    const [x0, y0] = p(t0, z0);
    const [x1, y1] = p(t1, z1);
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    const pts = [];
    for (let k = 0; k <= n; k++) pts.push([Math.floor(x0 + ((x1 - x0) * k) / n), Math.floor(y0 + ((y1 - y0) * k) / n)]);
    d.stroke(pts, col);
  };
  const LINE = '#231815';

  if (style === 'doorTri') {
    // 扉の付いた壁（nw の向き＝南東を向く面。バーの酒棚と同じ面）。扉はマスの幅いっぱいで、酒棚のてっぺんから続く梁の下まで。
    // 梁の上は三角の壁：左の端（ロフトの奥の壁との角）は天井まで、右の端は梁まで斜めに下がる
    const L = CAFE.loftH;
    const ceil = (t) => H0 + (L - H0) * t;
    const shape = region((t, z) => z >= 0 && z <= ceil(t));
    const door = (t, z) => t >= 0.1 && t <= 0.9 && z >= 0 && z <= DOOR_H;
    d.fill(shape, (x, y) => {
      const [t, z] = at(x, y);
      if (door(t, z)) {
        if (t < 0.16 || t > 0.84 || z > DOOR_H - 6) return C.beam;   // 枠
        const dia = (cz) => Math.abs(t - 0.5) / 0.2 + Math.abs(z - cz) / 20;
        const k = Math.min(dia(32), dia(80));
        if (k <= 1) return k > 0.8 ? C.woodDark : mix(C.wood, '#ffffff', 0.15);
        if (Math.abs((t - 0.24) * 40) < 1 && Math.abs(z - 54) < 6) return WOOD.brass;   // 取っ手
        return Math.floor(t * 40) % 4 === 0 ? C.woodDark : C.wood;
      }
      if (z >= BEAM_Z && z <= L) return Math.abs(z - 125) < 0.8 ? WOOD.brass : WOOD.dark;   // 酒棚から続く梁
      if (z > ceil(t) - 6) return C.beam;   // 斜めの梁
      if (z < BEAM_Z) return z < 6 ? C.woodDark : C.beam;   // 扉の両脇の柱
      return hash(x, y, 11) < 0.07 ? C.speck : C.plaster;
    }, plain);
    const rim = (sh) => {
      const pts = [];
      for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) {
        if (sh(xx + 0.5, yy + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a2, b2]) => !sh(xx + a2 + 0.5, yy + b2 + 0.5))) pts.push([xx, yy]);
      }
      d.stroke(pts, LINE);
    };
    rim(shape);
    rim(region((t, z) => door(t, z)));
    rim(region((t, z) => Math.min(...[32, 80].map((cz) => Math.abs(t - 0.5) / 0.2 + Math.abs(z - cz) / 20)) <= 1));
    line(0, BEAM_Z, 1, BEAM_Z, LINE);
    line(0, L, 1, L, LINE);
    d.finish({ outline: false });
    return d.result();
  }

  if (style === 'painting') {
    // 蓄音機のそばに掛ける額（イベントで後から）。梁のすぐ下。金の額縁に、青いドレスと緑の服の2人の肖像
    const Z0 = 66;   // 絵の中の高さを、梁の下へ下げるぶん
    const frame = region((t, z) => t >= 0.22 && t <= 0.78 && z >= 116 - Z0 && z <= 186 - Z0);
    const canvas = region((t, z) => t >= 0.27 && t <= 0.73 && z >= 122 - Z0 && z <= 180 - Z0);
    d.fill(frame, (x, y) => ((x + y) % 4 === 0 ? WOOD.brassLight : WOOD.brass), plain);
    d.fill(canvas, (x, y) => {
      const [t, z0] = at(x, y);
      const z = z0 + Z0;
      const fig = (ct, colBody, colHead, ears) => {
        const dt = (t - ct) * 40;
        if (Math.abs(dt) < 4.5 - (z - 126) / 14 && z >= 126 && z < 152) return colBody;   // 服
        if ((dt / 4.5) ** 2 + ((z - 158) / 6) ** 2 <= 1) return colHead;                  // 顔
        if (ears && z > 162 && z < 170 && (Math.abs(dt - 3) < 1.3 || Math.abs(dt + 3) < 1.3)) return colHead;   // 猫の耳
        return null;
      };
      return fig(0.38, '#4a6ab0', '#b8b6c4', true) ?? fig(0.62, '#3f7a4a', '#f0dcc0', false)
        ?? (z > 160 && Math.abs((t - 0.62) * 40) < 5 && z < 166 ? '#2a2420' : (z < 135 ? '#8a7a5a' : '#d0bf96'));
    }, plain);
    const r = (shape, c) => {
      const pts = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (shape(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
      d.stroke(pts, c);
    };
    r(frame, LINE);
    r(canvas, WOOD.brassDark);
    d.finish({ outline: false });
    return d.result();
  }

  // 漆喰（ところどころ細かい斑）と、ランプのまわりの明るみ
  const lamp = style === 'lamp' || style === 'loftLamp';
  const lampZ = style === 'loftLamp' ? CAFE.loftH + 140 : 160;
  d.fill(band(0, 1, 0, T), (x, y) => {
    const [t, z] = at(x, y);
    if (lamp && Math.hypot((t - 0.5) * 40, (z - lampZ) * 0.8) < 26) return (x + y) % 2 ? C.glow : mix(C.glow, '#f4e2b0', 0.3);
    return hash(x, y, 11) < 0.07 ? C.speck : C.plaster;
  }, plain);
  // てっぺんの梁
  d.fill(band(0, 1, T - 12, T), (x, y) => (at(x, y)[1] > T - 4 ? C.beamLight : C.beam), plain);
  line(0, T - 12, 1, T - 12, LINE);

  const post = () => {
    d.fill(band(0, 0.06, 0, T - 12), flat(C.beam), plain);
    line(0.06, 0, 0.06, T - 12, LINE);
  };
  const wainscot = (top) => {
    d.fill(band(0, 1, 0, top), (x, y) => {
      const [t, z] = at(x, y);
      if (z < 6) return C.woodDark;
      if (t > 0.12 && t < 0.88 && z > 12 && z < top - 8) return C.panel;
      return C.wood;
    }, plain);
    d.fill(band(0, 1, top, top + 4), flat(C.beamLight), plain);
    line(0, top, 1, top, LINE);
    line(0, top + 4, 1, top + 4, LINE);
    line(0.12, 12, 0.88, 12, C.woodDark);
    line(0.12, top - 8, 0.88, top - 8, mix(C.wood, '#ffffff', 0.15));
  };

  if (style === 'loft' || style === 'loftLamp') {
    // ロフトの床から上：幅木と腰板、その上は漆喰（本棚はロフトの真ん中に立つ棚。props の loftShelf）
    const L = CAFE.loftH;
    d.fill(band(0, 1, L, L + 40), (x, y) => {
      const [t, z] = at(x, y);
      if (z < L + 6) return C.woodDark;
      if (t > 0.12 && t < 0.88 && z > L + 12 && z < L + 32) return C.panel;
      return C.wood;
    }, plain);
    d.fill(band(0, 1, L + 40, L + 44), flat(C.beamLight), plain);
    line(0, L + 40, 1, L + 40, LINE);
    line(0, L + 44, 1, L + 44, LINE);
    line(0, L + 6, 1, L + 6, LINE);
    post();
  } else if (style === 'door') {
    wainscot(44);
    // 扉（ひし形の飾り板が2枚）。枠は梁の色
    const door = region((t, z) => t >= 0.2 && t <= 0.8 && z <= 160);
    d.fill(door, (x, y) => {
      const [t, z] = at(x, y);
      if (t < 0.25 || t > 0.75 || z > 154) return C.beam;
      const dia = (cz) => Math.abs(t - 0.5) / 0.17 + Math.abs(z - cz) / 24;
      const k = Math.min(dia(52), dia(112));
      if (k <= 1) return k > 0.82 ? mix(C.wood, '#ffffff', 0.2) : mix(C.wood, '#ffffff', 0.08);
      return (Math.floor(t * 40) % 5 === 0) ? C.woodDark : C.wood;
    }, plain);
    const rimOf = (shape, c) => {
      const pts = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (shape(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
      d.stroke(pts, c);
    };
    rimOf(door, LINE);
    rimOf(region((t, z) => Math.abs(t - 0.5) / 0.17 + Math.abs(z - 52) / 24 <= 1), LINE);
    rimOf(region((t, z) => Math.abs(t - 0.5) / 0.17 + Math.abs(z - 112) / 24 <= 1), LINE);
    d.fill(region((t, z) => Math.hypot((t - 0.69) * 40, z - 82) < 2.2), flat(WOOD.brass), plain);
    post();
  } else if (style === 'window') {
    wainscot(40);
    // アーチ窓：木の枠、外は水槽の青（上ほど明るく、斜めの光の筋）、下から水草、魚、泡。縦の桟と横の桟が2本
    const top = (t) => WINDOW_TOP - 26 + 26 * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.38) ** 2));   // 下の縁（46）から、てっぺんの梁の下まで
    const outer = region((t, z) => t >= 0.09 && t <= 0.91 && z >= 46 && z <= top(t) + 4);
    const glass = region((t, z) => t >= 0.14 && t <= 0.86 && z >= 52 && z <= top(t) - 1);
    d.fill(band(0.06, 0.94, 44, 50), flat(C.beamLight), plain);
    d.fill(outer, flat(C.beam), plain);
    const fish = [0, 1].map((k) => ({ t: 0.25 + 0.5 * hash(seed, k, 1), z: 64 + 40 * hash(seed, k, 2), dir: hash(seed, k, 3) < 0.5 ? -1 : 1, col: hash(seed, k, 4) < 0.35 ? '#e3893c' : '#1d4a60' }));
    const weeds = [0, 1, 2].map((k) => ({ t: 0.2 + 0.6 * hash(seed, k, 6), h: 24 + 36 * hash(seed, k, 7), ph: hash(seed, k, 8) * 6 }));
    d.fill(glass, (x, y) => {
      const [t, z] = at(x, y);
      const tx = t * 40;
      for (const f of fish) {
        const dx = (tx - f.t * 40) * f.dir;
        const dz = z - f.z;
        if ((dx / 5) ** 2 + (dz / 2.4) ** 2 <= 1) return Math.abs(dx - 3) < 0.6 && Math.abs(dz) < 0.6 ? '#f2f2f2' : f.col;
        if (dx < -4 && dx > -8 && Math.abs(dz) < (-dx - 4) * 0.8) return f.col;
      }
      for (const w of weeds) {
        if (z < 52 + w.h && Math.abs(tx - w.t * 40 - Math.sin(z / 13 + w.ph) * 2.2) < 1.3) return z % 7 < 2 ? '#5aa86a' : '#3f8a52';
      }
      if (hash(Math.floor(tx / 2), Math.floor(z / 6), seed + 20) < 0.012) return '#cdf3f6';
      if (((tx * 0.9 + z * 0.55) % 24) < 3.5 && z > 80) return mix('#5fc0d0', '#bdeef0', (z - 80) / 40);
      if (z < 64) return '#2a6070';
      return mix('#2e7088', '#6cc4d2', (z - 52) / 70);
    }, plain);
    const rimOf = (shape, c) => {
      const pts = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (shape(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
      d.stroke(pts, c);
    };
    // 桟
    d.fill(region((t, z) => glass(...p(t, z)) && (Math.abs(t - 0.5) < 0.03 || [66, 81, 96].some((zz) => Math.abs(z - zz) < 1.5))), flat(C.beam), plain);
    rimOf(outer, LINE);
    rimOf(glass, LINE);
    line(0.06, 44, 0.94, 44, LINE);
  } else {
    // plain・lamp：腰板と漆喰。lamp は真鍮の腕に下がったランタン。plainBeam は、酒棚から扉の上を通って続く梁も
    // （plainBeam の腰板は、角でつながる水槽の窓の壁と同じ高さ）
    wainscot(style === 'plainBeam' ? 40 : 56);
    post();
    if (style === 'plainBeam') {
      d.fill(band(0, 1, BEAM_Z, CAFE.loftH), (x, y) => (Math.abs(at(x, y)[1] - 125) < 0.8 ? WOOD.brass : WOOD.dark), plain);
      line(0, BEAM_Z, 1, BEAM_Z, LINE);
      line(0, CAFE.loftH, 1, CAFE.loftH, LINE);
    }
  }
  line(0, 0, 1, 0, LINE);
  line(0, T, 1, T, LINE);
  if (start) line(0, 0, 0, T, LINE);
  if (end) line(1, 0, 1, T, LINE);
  d.finish({ outline: false });
  return d.result();
}

// ---------------------------------------------------------------- ロフトと階段（床の高さのあるマス）

// 背の高い酒棚（ロフトの南東向きの面）。下は扉の付いた戸棚、上は緑に光る3段の棚に色とりどりの瓶
const BOTTLES = ['#3a6a3a', '#8a3a2a', '#d8b050', '#4a5a8a', '#c87a3a', '#e8e0c8', '#6a2a4a', '#2a7a6a', '#b0b8a0'];
function backBar(v, z) {
  if (v < 0.05 || v > 0.95) return WOOD.dark;
  if (z < 6) return WOOD.deep;
  if (z < 42) return (v > 0.12 && v < 0.46) || (v > 0.54 && v < 0.88) ? (z > 10 && z < 37 ? '#4a2e1c' : WOOD.mid) : WOOD.mid;
  if (z < 46) return z > 44 ? WOOD.lighter : WOOD.light;
  if (z > 122) return Math.abs(z - 125) < 0.8 ? WOOD.brass : WOOD.dark;
  // 棚の奥の板（緑に光る。上の棚板の下は影）。棚板と瓶は shelfBottles で立体に描く
  const bottom = z < 70 ? 46 : z < 96 ? 70 : 96;
  const top = z < 70 ? 70 : z < 96 ? 96 : 122;
  if (top - z < 4) return '#2e5a44';
  return mix('#4aa77a', '#a8e8c2', (z - bottom) / 26);
}
// 酒棚の棚板と瓶（棚の奥行きのある箱の中に立つ。棚板の上の面が見え、瓶は縦にまっすぐ立つ）
const SHELF_IN = 0.7;   // 棚の奥の板の位置（u）
function shelfBottles(c, seed) {
  const { d, P } = c;
  for (const zb of [46, 70, 96]) {
    // 棚板（上の面と手前の縁）
    d.fill(poly([P(SHELF_IN, 0.05, zb), P(1, 0.05, zb), P(1, 0.95, zb), P(SHELF_IN, 0.95, zb)]), (x, y) => ((x + y) % 7 === 0 ? WOOD.mid : WOOD.light), { line: false, group: 'board' });
    d.fill(poly([P(1, 0.05, zb), P(1, 0.95, zb), P(1, 0.95, zb - 2), P(1, 0.05, zb - 2)]), flat(WOOD.lighter), { line: false, group: 'board' });
    const row = [46, 70, 96].indexOf(zb);
    const N = 7;
    for (let k = 0; k < N; k++) {
      if (hash(k, row, seed + 3) < 0.12) continue;
      const v = 0.1 + (0.8 * (k + 0.5)) / N;
      const u = SHELF_IN + 0.12 + 0.08 * hash(k, row, seed + 5);
      const [x0, y0] = P(u, v, zb);
      const x = Math.round(x0);
      const y = Math.round(y0);
      const hb = 13 + Math.floor(hash(k, row, seed) * 6);
      const col = BOTTLES[Math.floor(hash(k, row, seed + 9) * BOTTLES.length)];
      const shoulder = Math.round(hb * 0.6);
      const wide = hash(k, row, seed + 11) < 0.35;   // 太い瓶（ウイスキーの角瓶のような）
      const hw = wide ? 3 : 2;
      d.fill((px, py) => {
        const dx = px - x;
        const dy = y - py;
        if (dy < 0 || dy > hb) return false;
        if (dy <= shoulder) return dx >= -hw && dx <= hw;
        if (dy <= shoulder + 2) return dx >= -hw + 1 && dx <= hw - 1;
        return dx >= -1 && dx <= 0;
      }, (px, py) => {
        const dx = px - x;
        const dy = y - py;
        if (dy >= hb - 1) return WOOD.deep;   // 栓
        if (dy <= shoulder && dy > 3 && dy < shoulder - 2 && Math.abs(dx) < hw && hash(k, row, seed + 13) < 0.5) return '#e8e0c8';   // ラベル
        if (dx === -hw || (dy > shoulder && dx === -1)) return mix(col, '#ffffff', 0.45);   // 光の当たる側
        if (dx === hw || (dy > shoulder && dx === 0)) return mix(col, '#000000', 0.35);
        return col;
      }, { line: false, group: `bottle${zb}_${k}` });
    }
  }
}
// ガラスの飾り棚（奥行きのある箱の中を青く照らし、ガラスの台に水晶の像が立つ）。面は奥の板の色だけで、像は vitrineStatue で立体に描く
function vitrine(v, z) {
  if (v < 0.05 || v > 0.95) return WOOD.dark;
  if (z < 46 || z > 122) return backBar(v, z);
  if (z > 118) return '#0f2440';   // 上の板の下の影
  return mix('#173a62', '#3f86c8', (z - 46) / 76);
}
// 水晶の像（レピコ像）：丸い台、細い脚、花のつぼみのようにふくらんだ裾、胸の前で手を組んでバラを持ち、
// おかっぱの髪にカチューシャと横にバラ、肩から裾の横へ輪を描いて下がるリボン。肌は濃い青、髪と服は明るい水色。南東（手前の右）を向く
function vitrineStatue(c) {
  const { d, P } = c;
  // 枠の内側（正面の面の上で、柱と上下の板にかからない所）だけに描く
  const inside = (x, y) => { const [v, z] = c.onSE(1, x, y); return v > 0.06 && v < 0.94 && z > 44 && z < 118; };
  // ガラスの棚板（上の面）
  const shelf = poly([P(SHELF_IN, 0.05, 46), P(1, 0.05, 46), P(1, 0.95, 46), P(SHELF_IN, 0.95, 46)]);
  d.fill((x, y) => shelf(x, y) && inside(x, y), (x, y) => ((x + y) % 5 === 0 ? '#bfe8ff' : '#5fa8dc'), { line: false, group: 'glassShelf' });
  const S = solid3d(c);
  const L = S.L;
  const Uc = 0.85 * L;   // 台座がガラスの棚板の真ん中に乗る位置
  const Vc = 0.5 * L;
  const lightC = (k) => (k > 0.6 ? '#e2f8fc' : k > 0.25 ? '#a6e6f2' : k > -0.15 ? '#6cc8de' : '#3f9ec6');
  const darkC = (k) => (k > 0.5 ? '#5a8ee0' : k > 0.1 ? '#3a6cc4' : '#2a52a4');
  const lp = (n) => lightC(S.shade(n));
  const dp = (n) => darkC(S.shade(n));
  const Z0 = 47;
  // 台（水たまりのような丸い台）
  S.disk([Uc, Vc, Z0 + 1.5], 9, 1.5, (r) => (r > 0.85 ? '#3f9ec6' : '#8fd8ea'), (n) => lightC(S.shade(n)));
  // 脚
  for (const s of [-1.8, 1.8]) S.line([Uc, Vc + s, Z0 + 1], [Uc, Vc + s, Z0 + 15], 1.6, dp);
  // 裾（つぼみ）：大きくふくらんだ丸に、縦の花びらの筋。上に小さな花びらの段
  S.ellipsoid([Uc, Vc, Z0 + 24], [8.5, 10, 9.5], (n) => {
    const a = Math.atan2(n[1], n[0]);
    const k = S.shade(n);
    if (n[2] < 0.6 && Math.abs(((a / (Math.PI * 2)) * 6 + 0.5) % 1 - 0.5) < 0.06) return darkC(k + 0.4);   // 花びらの境目
    return lightC(k);
  });
  S.ellipsoid([Uc, Vc, Z0 + 32.5], [6, 7, 3.2], (n) => lightC(S.shade(n) + 0.15));
  // 胴（濃い青）と、肩から胸の前で組んだ腕、胸のバラ
  S.ellipsoid([Uc, Vc, Z0 + 40], [3.5, 4.5, 6], dp);
  for (const s of [-1, 1]) S.tube((t) => [Uc + 3.5 * Math.sin(Math.PI * t * 0.9), Vc + s * (5 - 3.8 * t), Z0 + 45 - 6 * t], () => 1.3, dp);
  S.ellipsoid([Uc + 4.2, Vc, Z0 + 40.5], [1.8, 2.2, 2.2], (n) => (S.shade(n) > 0.3 ? '#f0fcff' : '#a6e6f2'));
  // 首と頭（顔は濃い青で手前の右を向き、まわりはおかっぱの髪。上にカチューシャ、横にバラ）
  S.line([Uc, Vc, Z0 + 45], [Uc, Vc, Z0 + 49], 1.4, dp);
  S.ellipsoid([Uc, Vc, Z0 + 56], [6.5, 7, 8], (n) => {
    const k = S.shade(n);
    if (n[0] > 0.45 && n[2] < 0.45 && n[2] > -0.75 && Math.abs(n[1]) < 0.55) return darkC(k);   // 顔
    if (n[2] > 0.5 && n[2] < 0.72) return '#f0fcff';   // カチューシャ
    return lightC(k);
  });
  S.ellipsoid([Uc - 0.5, Vc - 6, Z0 + 59], [2, 2.2, 2.2], (n) => (S.shade(n) > 0.3 ? '#f0fcff' : '#a6e6f2'));
  // リボン：両肩から外へ輪を描いて、裾の横へ
  for (const s of [-1, 1]) {
    S.tube((t) => {
      const a = Math.PI * t;
      return [Uc - 1, Vc + s * (4.5 + 6 * Math.sin(a)), Z0 + 45 - 22 * t];
    }, () => 1, (n) => lightC(S.shade(n) - 0.1));
  }
  S.flush('statue', { line: false }, inside);
}

// 扉の右の壁と同じ作りの面（腰板の上に漆喰、てっぺんに酒棚から続く梁）。バーの奥の、飾り棚と階段のあいだ
const PLASTER = (v, z) => {
  const C = WALL_COL.nw;
  if (z >= BEAM_Z) return Math.abs(z - 125) < 0.8 ? WOOD.brass : WOOD.dark;
  if (v < 0.06) return C.beam;   // 柱
  if (z < 6) return C.woodDark;
  if (z < 40) return v > 0.12 && v < 0.88 && z > 12 && z < 32 ? C.panel : C.wood;
  if (z < 44) return C.beamLight;
  return hash(Math.floor(v * 40), Math.floor(z), 11) < 0.07 ? C.speck : C.plaster;
};
const PANEL = (u, z, h) => {
  if (z < 8) return WOOD.deep;
  if (z > h - 6) return WOOD.light;
  return Math.floor(u * 40) % 8 === 0 ? WOOD.dark : '#4e3220';
};

// 床の高さのあるマス1つぶんの箱。kind は 'loft'（ロフト：上は板張り）か 'stairs'（階段の段）。
// h は自分の高さ、se・sw は南東・南西の隣の高さ（その高さから上の面を描く。null なら描かない）。face は南東の面の絵
export function tileBoxDots(kind, h, se, sw, face = 'panel', seed = 0) {
  const c = iso(0, 1, 0, 1, h + 2);
  // 階段は face が 'stairs_i'（段が i の向きに並ぶ：南東の面が蹴込み、南西の面が側板）か 'stairs_j'（その逆）
  const alongJ = face === 'stairs_j';
  const riser = (z) => (z > h - 3 ? WOOD.lighter : '#5e3c24');
  const stringer = (t, z) => (z > h - 9 ? '#6a4428' : (Math.floor(t * 40) % 10 === 0 ? WOOD.deep : '#3e2618'));
  const topPaint = kind === 'loft'
    ? (u, v, x, y) => (Math.floor(v * 40) % 10 === 0 ? '#3a2616' : hash(Math.floor(v * 4), Math.floor(u * 3), 2) < 0.5 ? '#6a4a30' : '#5e4029')
    : (u, v) => { const k = alongJ ? v : u; return k > 0.86 ? WOOD.lighter : k > 0.8 ? WOOD.mid : '#7a5234'; };
  const sePaint = (v, z) => {
    if (kind === 'stairs') return alongJ ? stringer(v, z) : riser(z);
    if (face === 'backbar') return backBar(v, z);
    if (face === 'vitrine') return vitrine(v, z);
    if (face === 'plaster') return PLASTER(v, z);
    return PANEL(v, z, h);
  };
  const swPaint = (u, z) => {
    if (kind === 'stairs') return alongJ ? riser(z) : stringer(u, z);
    return PANEL(u, z, h);
  };
  if (sw !== null && sw < h) box(c, 0, 1, 0, 1, sw, h, { sw: swPaint });
  if (se !== null && se < h) box(c, 0, 1, 0, 1, se, h, { se: sePaint });
  box(c, 0, 1, 0, 1, h, h, { top: topPaint });
  if (kind === 'loft' && face === 'backbar' && se !== null && se < h) shelfBottles(c, seed);
  if (kind === 'loft' && face === 'vitrine' && se !== null && se < h) vitrineStatue(c);
  return done(c);
}

// 手すり（マス1つぶんの辺）。edge は 'se'・'sw'・'ne'。z0・z1 は辺の始め（北寄り）と終わりの手すりの下の線の高さ（階段は傾く）。
// floor を渡すと（階段）、手すり子と親柱はその段の踏み面から立ち、下の横木は付けない（段ごとに手すり子の長さが変わる）
export function railDots(edge, z0, z1, floor = null) {
  const RH = 30;
  const c = iso(-0.1, 1.1, -0.1, 1.1, Math.max(z0, z1) + RH + 6, { z0: Math.min(0, floor ?? 0) });
  const { d, P } = c;
  const at = (k) => (edge === 'se' ? [1, k] : edge === 'sw' ? [k, 1] : [k, 0]);
  const z = (k) => z0 + (z1 - z0) * k;
  const base = (k) => (floor === null ? z(k) : floor);
  const seg = (k0, k1, dz0, dz1, w) => {
    const [ua, va] = at(k0);
    const [ub, vb] = at(k1);
    return poly([P(ua, va, z(k0) + dz0 - w / 2), P(ub, vb, z(k1) + dz1 - w / 2), P(ub, vb, z(k1) + dz1 + w / 2), P(ua, va, z(k0) + dz0 + w / 2)]);
  };
  // 手すり子（細い柱）
  for (let k = 0.0625; k < 1; k += 0.125) {
    const [u, v] = at(k);
    const [x, y0] = P(u, v, base(k));
    const [, y1] = P(u, v, z(k) + RH);
    d.fill(poly([[x - 1, y0 - 3], [x + 1, y0 - 3], [x + 1, y1 + 3], [x - 1, y1 + 3]]), (px) => (px < x ? WOOD.lighter : WOOD.mid), { group: 'rail' });
  }
  if (floor === null) d.fill(seg(0, 1, 2, 2, 3), flat(WOOD.mid), { group: 'rail' });
  d.fill(seg(0, 1, RH, RH, 4), (x, y) => (y % 2 ? WOOD.light : WOOD.lighter), { group: 'rail' });
  // 端の親柱
  for (const k of [0, 1]) {
    const [u, v] = at(k);
    const [x, y0] = P(u, v, base(k));
    const [, y1] = P(u, v, z(k) + RH + 4);
    d.fill(poly([[x - 2, y0], [x + 2, y0], [x + 2, y1], [x - 2, y1]]), (px) => (px < x ? WOOD.light : WOOD.dark), { group: 'rail' });
  }
  return done(c);
}

// ---------------------------------------------------------------- 家具

const CUSHION = { top: '#4f7060', side: '#2e463a', mid: '#3e5c4c' };
const RED = { top: '#b03a48', mid: '#9a3040', dark: '#78202e', button: '#e2c9a8' };

// 細い脚（画面の2点を結ぶ）
const leg = (c, a, b, w, col, opts = {}) => c.d.fill(capsule(a, b, w), (x) => (x < Math.min(a[0], b[0]) + w / 2 ? mix(col, '#ffffff', 0.15) : col), opts);

// 木の椅子（テーブルのまわり。参考：後ろの2本の柱はそのまま床まで続く後ろ脚で、下で少し後ろへ開く。柱の上に、座面の丸に沿って
// 曲がった幅の広い笠木（真ん中に花の彫り）を渡し、笠木と座面のあいだは抜けている。丸い緑の座面のふちに真鍮の鋲、下に丸い木の枠、
// 前の2本の脚はまっすぐ）。dir は座った人の向き
const FACING = { se: [1, 0], nw: [-1, 0], sw: [0, 1], ne: [0, -1] };
function chairDots(dir) {
  const c = iso(-0.15, 1.15, -0.15, 1.15, 80);
  const S = solid3d(c);
  const L = S.L;
  const [fu, fv] = FACING[dir];
  const [su, sv] = [-fv, fu];   // 座った人の左右
  const at = (f, s, z) => [L * (0.5 + fu * f + su * s), L * (0.5 + fv * f + sv * s), z];
  const SEAT = 28;
  const TOP = 62;    // 笠木のてっぺん
  const RAIL = 15;   // 笠木の幅（高さ）
  const R = 0.27;    // 座面の半径（マス）
  const woodP = (n) => woodShade(S.shade(n));
  // 前の脚（まっすぐ）
  for (const s of [-0.17, 0.17]) S.line(at(0.19, s, 0), at(0.19, s, SEAT - 4), 1.7, woodP);
  // 後ろの脚＝背もたれの柱（床では少し後ろへ開き、上は笠木まで）
  const A = 0.95;   // 柱の位置の角度（後ろから左右へ）
  const postAt = (side, z) => {
    const spread = z < SEAT ? (1 - z / SEAT) * 0.07 : 0;
    const r = R * 0.96 + spread;
    return at(-Math.cos(A) * r, side * Math.sin(A) * r, z);
  };
  for (const side of [-1, 1]) S.tube((t) => postAt(side, t * (TOP - 2)), () => 1.9, woodP);
  // 笠木：座面の丸に沿って曲がった幅の広い板（厚み 2）。真ん中に花の彫り
  for (let a = -A; a <= A; a += 0.015) {
    for (const dr of [0, 1, 2]) {
      const r = L * R * 0.96 + dr * 0.7;
      const n = [-(fu * Math.cos(a)) + su * Math.sin(a), -(fv * Math.cos(a)) + sv * Math.sin(a), 0];
      for (let z = TOP - RAIL; z <= TOP + 2 * Math.cos(a * 1.6); z += 0.5) {
        const p = [L * 0.5 + n[0] * r, L * 0.5 + n[1] * r, z];
        const k = S.shade(n);
        const flower = Math.hypot(a * L * R * 0.96, z - (TOP - RAIL / 2)) < 4.5;
        let color = woodShade(k);
        if (z > TOP - 1.5) color = WOOD.lighter;
        else if (z < TOP - RAIL + 1.5) color = WOOD.dark;
        else if (flower) color = Math.hypot(a * L * R * 0.96, z - (TOP - RAIL / 2)) < 1.6 ? WOOD.deep : WOOD.dark;
        S.plot(...p, color);
      }
    }
  }
  // 座面：丸い木の枠と、緑のクッション（ふちに真鍮の鋲）
  S.disk(at(0, 0, SEAT - 1), L * R, 4, () => WOOD.mid, (n) => woodShade(S.shade(n)));
  S.ellipsoid(at(0, 0, SEAT), [L * R, L * R, 3.2], (n) => {
    if (n[2] < 0.35) return Math.floor((Math.atan2(n[1], n[0]) + 7) * 9) % 2 ? WOOD.brassLight : '#2e463a';   // 鋲
    const k = S.shade(n);
    return k > 0.7 ? '#6a8c7a' : k > 0.4 ? CUSHION.top : CUSHION.mid;
  });
  S.flush('chair');
  return done(c);
}

// カウンターの前の高い椅子（参考：細い4本脚が少し開いて、真ん中より下に木の輪の足かけ。丸い座面は木の枠に花の飾り、上に緑のクッション。
// 背もたれは2本の柱に、上が反った笠木と下の横木、そのあいだに細い縦の桟が3本で、真ん中は矢のような形）。客はカウンター（北西）を向く
function barChairDots() {
  const c = iso(-0.1, 1.1, -0.1, 1.1, 96);
  const S = solid3d(c);
  const L = S.L;
  const SEAT = 44;
  const R = 0.25;
  const P = (u, v, z) => [L * u, L * v, z];
  const woodP = (n) => woodShade(S.shade(n));
  // 脚（下へ少し開く。上に挽き物の輪）
  const legs = [[0.33, 0.33], [0.67, 0.33], [0.33, 0.67], [0.67, 0.67]];
  for (const [u, v] of legs) {
    S.tube((t) => P(u + (u - 0.5) * 0.35 * (1 - t), v + (v - 0.5) * 0.35 * (1 - t), t * (SEAT - 5)), (t) => (t > 0.9 ? 2 : 1.3 + 0.4 * t), woodP);
  }
  // 木の輪の足かけ（高さ 16）
  S.tube((t) => { const a = t * Math.PI * 2; return P(0.5 + 0.215 * Math.cos(a), 0.5 + 0.215 * Math.sin(a), 16); }, () => 1.1, woodP, { steps: 160, ends: false });
  // 背もたれ（座る人の後ろ＝南東の側。2本の柱、下の横木、反った笠木、縦の桟3本）
  const bu = 0.5 + 0.21;
  for (const v of [0.3, 0.7]) S.line(P(bu, v, SEAT), P(bu + 0.03, v, SEAT + 28), 1.4, woodP);
  S.line(P(bu + 0.01, 0.3, SEAT + 8), P(bu + 0.01, 0.7, SEAT + 8), 1.1, woodP);
  S.tube((t) => P(bu + 0.03, 0.28 + 0.44 * t, SEAT + 27 + 2.5 * Math.sin(Math.PI * t)), () => 1.8, woodP);
  for (const v of [0.4, 0.6]) S.line(P(bu + 0.02, v, SEAT + 8), P(bu + 0.03, v, SEAT + 26), 0.8, woodP);
  S.line(P(bu + 0.02, 0.5, SEAT + 8), P(bu + 0.03, 0.5, SEAT + 23), 0.8, woodP);
  S.ellipsoid(P(bu + 0.03, 0.5, SEAT + 23), [1.2, 2.2, 2.2], woodP);   // 真ん中の矢の頭
  // 座面：木の枠（手前に花の飾り）と緑のクッション
  S.disk(P(0.5, 0.5, SEAT - 1), L * R, 6, () => WOOD.mid, (n, f, th) => {
    if (Math.abs(Math.atan2(n[1], n[0]) - Math.PI / 4) < 0.18 && f > 0.25 && f < 0.85) return WOOD.brass;   // 花の飾り
    return woodShade(S.shade(n));
  });
  S.ellipsoid(P(0.5, 0.5, SEAT), [L * R, L * R, 3], (n) => {
    const k = S.shade(n);
    return k > 0.7 ? '#6a8c7a' : k > 0.4 ? CUSHION.top : n[2] < 0.3 ? CUSHION.side : CUSHION.mid;
  });
  S.flush('chair');
  return done(c);
}

// 丸テーブル（太い1本脚に台座、上にレースの敷物・ランプ・花瓶）。big は手前の大きなテーブル、そうでなければ階段のそばの小さなテーブル
// テーブルの上の物（レースの敷物・ガラスのランプ・白い花の花瓶）
function tableItems(c, u, v, z) {
  const { d, P } = c;
  const [x, y] = P(u, v, z);
  d.fill(ellipse(x, y, 10, 4.5), (px, py) => ((px + py) % 3 === 0 ? '#cfc9be' : '#ece7dd'), { line: false, group: 'items' });
  // ガラスのランプ（暖かい光）
  d.fill(poly([[x - 4, y - 1], [x + 1, y - 1], [x + 1, y - 11], [x - 4, y - 11]]), (px, py) => (py > y - 4 ? '#f2b452' : '#ffe7a8'), { group: 'lamp' });
  d.fill(poly([[x - 5, y - 11], [x + 2, y - 11], [x - 1.5, y - 15]]), flat(WOOD.dark), { group: 'lampCap' });
  // 花瓶と白い花
  d.fill(poly([[x + 4, y + 1], [x + 8, y + 1], [x + 8, y - 6], [x + 4, y - 6]]), flat('#b8d4d0'), { group: 'vase' });
  for (const [fx, fy] of [[5, -11], [8, -12], [6, -14], [9, -9], [3, -9]]) d.put(x + fx, y + fy, '#f6f2ea');
  for (const [fx, fy] of [[6, -8], [7, -10], [5, -9]]) d.put(x + fx, y + fy, '#4f8a4a');
}
function roundTableDots(big) {
  const c = iso(-0.2, 1.2, -0.2, 1.2, 76);
  const { d, P } = c;
  const [rx, ry, top] = big ? [33, 16.5, 50] : [22, 11, 46];
  const [tx, ty] = P(0.5, 0.5, top);
  // 太い1本脚（ろくろ挽きの真ん中のふくらみ）が、床の近くで3本の足に分かれて、外へ反って床に着く
  const S = solid3d(c);
  const L = S.L;
  const woodP = (n) => woodShade(S.shade(n));
  const F = 14;   // 足が分かれる高さ
  S.tube((t) => [L * 0.5, L * 0.5, F + t * (top - F - 2)], (t) => 3 + (Math.abs(t - 0.4) < 0.12 ? 1.5 : 0) + (t < 0.08 ? 1 : 0), woodP);
  const reach = big ? 0.36 : 0.28;
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 4;
    S.tube((t) => {
      const r = reach * Math.sin((t * Math.PI) / 2);
      return [L * (0.5 + Math.cos(a) * r), L * (0.5 + Math.sin(a) * r), F * (1 - t) ** 1.6 + 1.5];
    }, (t) => 2.4 - 0.9 * t, woodP);
  }
  S.flush('base');
  d.fill(ellipse(tx, ty + 4, rx, ry), flat('#3e2414'), { group: 'top' });
  d.fill(ellipse(tx, ty, rx, ry), (x, y) => (((x - tx + rx * 0.3) / (rx * 0.45)) ** 2 + ((y - ty + ry * 0.3) / (ry * 0.35)) ** 2 <= 1 ? '#7a4e30' : '#5e3a22'), { group: 'topFace' });
  d.finish();
  const items = iso(-0.2, 1.2, -0.2, 1.2, 76);
  tableItems(items, 0.5, 0.5, top);
  items.d.finish();
  const a = d.result();
  const b = items.d.result();
  return { dots: a.map((r, y) => r.map((col, x) => b[y][x] ?? col)), ax: c.ax, ay: c.ay };
}

// カウンター（1マスぶん）。上は磨いた木に真鍮の縁、手前（南東）は飾り板、足元に真鍮の足かけ。end は手前の端（南西の面も描く）
function counterDots(end) {
  const c = iso(0, 1, 0, 1, 70);
  const H = 60;
  box(c, 0.1, 0.9, 0, end ? 0.92 : 1, 0, H, {
    sw: end ? (u, z) => (z < 6 ? WOOD.deep : z > H - 5 ? WOOD.light : u > 0.2 && u < 0.8 && z > 12 && z < H - 10 ? '#4a2c1a' : WOOD.mid) : null,
    se: (v, z) => {
      if (z < 6) return WOOD.deep;
      if (z > H - 5) return WOOD.light;
      if (Math.abs(z - 10) < 1) return WOOD.brass;
      const f = (v * 2) % 1;
      return f > 0.14 && f < 0.86 && z > 14 && z < H - 10 ? '#4a2c1a' : WOOD.mid;
    },
    top: (u, v, x, y) => (u > 0.82 ? WOOD.brass : (x + y * 3) % 23 === 0 ? '#7a4e30' : '#5a3420'),
  });
  // 輪郭の線は手で引く。天板は隣のマスとつながる一枚板に見せたいので、マスの境目には線を引かない（手前の面の板の継ぎ目には引く）
  const { d, P } = c;
  const v1 = end ? 0.92 : 1;
  const ln = (a, b) => d.stroke(linePoints(...a.map(Math.round), ...b.map(Math.round)), '#231815');
  ln(P(0.1, 0, H), P(0.1, v1, H));     // 天板の奥の縁
  ln(P(0.9, 0, H), P(0.9, v1, H));     // 天板の手前の縁
  ln(P(0.9, 0, 0), P(0.9, v1, 0));     // 手前の面の下の縁
  ln(P(0.9, 0, 0), P(0.9, 0, H - 6));  // 手前の面の板の継ぎ目（天板の厚みの所には引かない）
  if (end) {
    ln(P(0.1, v1, H), P(0.9, v1, H));
    ln(P(0.1, v1, 0), P(0.9, v1, 0));
    ln(P(0.1, v1, 0), P(0.1, v1, H));
    ln(P(0.9, v1, 0), P(0.9, v1, H));
  }
  return done(c, false);
}

// ボックス席の長椅子（参考：赤いボタン留めの高い背もたれを木の枠で囲み、窓から部屋のほうへ向かい合って並ぶ）。
// dir は座った人の向き：'se'（背もたれは北西の辺）か 'nw'（背もたれは南東の辺。部屋からは背もたれの裏の木の面が見える）
const tufted = (s, z) => {
  const a = (s * 40 + z) % 14;
  const b = (s * 40 - z + 1400) % 14;
  if (a < 1.1 || b < 1.1) return RED.dark;
  if (a > 6.5 && a < 7.6 && b > 6.5 && b < 7.6) return RED.button;
  return RED.mid;
};
function boothBenchDots(dir) {
  const D = 1.92;   // 窓から部屋へ2マス
  const c = iso(0, 1, 0, 2, 92);
  const se = dir === 'se';
  const T = 0.3;    // 背もたれの厚み（木の枠で囲んだ仕切り）
  const BH = 76;    // 背もたれのてっぺん
  const SZ = 22;    // 座面の下の木の台の高さ
  const CZ = 34;    // 座面のクッションの上
  const [b0, b1] = se ? [0, T] : [1 - T, 1];
  const [s0, s1] = se ? [T, 0.94] : [0.06, 1 - T];
  // 木の板張り（縦の板目と、はめ込みの板）
  const boards = (s, z, z0, z1) => {
    if (z < z0 + 5) return WOOD.deep;
    if (z > z1 - 4) return WOOD.lighter;
    const f = (s * 2.2) % 1;
    if (f > 0.12 && f < 0.88 && z > z0 + 9 && z < z1 - 8) return Math.floor(s * 40) % 5 === 0 ? '#4a2e1c' : WOOD.mid;
    return WOOD.light;
  };
  // 仕切りの端の板（部屋の側の面。上が尖ったアーチのはめ込み）
  const endPanel = (u, z) => {
    const k = (u - b0) / T;
    if (z < 6) return WOOD.deep;
    if (z > BH - 6) return WOOD.lighter;
    if (k < 0.18 || k > 0.82) return WOOD.light;
    const arch = BH - 14 - 8 * Math.abs(k - 0.5) * 2;
    if (z > 14 && z < arch) return Math.abs(k - 0.5) < 0.04 ? WOOD.dark : WOOD.mid;
    return z >= arch && z < arch + 2 ? WOOD.dark : WOOD.light;
  };
  const back = () => {
    box(c, b0, b1, 0, D, 0, BH, {
      sw: endPanel,
      se: se
        ? (v, z) => {   // 座る側：木の枠の中に、ボタン留めの赤い背もたれ
          if (z > BH - 6 || v > D - 0.08 || v < 0.06) return WOOD.light;
          if (z < CZ) return WOOD.mid;
          return tufted(v, z);
        }
        : (v, z) => boards(v, z, 0, BH),   // 背中の側：木の板張り
      top: (u, v) => (Math.abs(u - (b0 + b1) / 2) < 0.03 ? WOOD.light : WOOD.lighter),
    });
  };
  if (se) back();
  // 座面の下の木の台と、厚いクッション
  box(c, s0, s1, 0.03, D - 0.03, 0, SZ, { sw: (u, z) => boards(u * 2, z, 0, SZ), se: (v, z) => boards(v, z, 0, SZ) });
  box(c, s0, s1, 0.03, D - 0.03, SZ, CZ, {
    sw: (u, z) => (Math.abs(z - (SZ + CZ) / 2) < 0.6 && Math.floor(u * 40) % 3 === 0 ? RED.button : RED.dark),
    se: (v, z) => (Math.abs(z - (SZ + CZ) / 2) < 0.6 && Math.floor(v * 40) % 3 === 0 ? RED.button : RED.dark),
    top: (u, v) => { const t = tufted(v, u * 20 + 40); return t === RED.mid ? RED.top : t; },
  });
  if (!se) back();
  return done(c);
}

// ボックス席の後ろの棚（ボックス席の背もたれと同じ高さ・背もたれより厚い木の棚。背もたれにくっつけて置く。板張りで、引き出しは無い）
function drawerChestDots() {
  const D = 1.92;
  const c = iso(0, 1, 0, 2, 90);
  const H = 76;
  const T = 0.45;   // 厚み（背もたれの1.5倍）
  const boards = (s, z) => {
    if (z < 5) return WOOD.deep;
    if (z > H - 4) return WOOD.lighter;
    const f = (s * 2.2) % 1;
    if (f > 0.12 && f < 0.88 && z > 9 && z < H - 8) return Math.floor(s * 40) % 5 === 0 ? '#4a2e1c' : WOOD.mid;
    return WOOD.light;
  };
  box(c, 1 - T, 1, 0.05, D, 0, H, {
    sw: (u, z) => (z < 5 ? WOOD.deep : z > H - 4 ? WOOD.lighter : WOOD.light),
    se: (v, z) => boards(v, z),
    top: () => WOOD.lighter,
  });
  return done(c);
}

// ボックス席のテーブル（窓から部屋へ2マスの長い天板。天板の下に2本のろくろ挽きの脚があり、それぞれ床の近くで4本の短い足に開いて床に着く。
// 上にランプと花瓶）
function boothTableDots() {
  const c = iso(-0.2, 1.2, 0, 2, 80);
  const S = solid3d(c);
  const L = S.L;
  const woodP = (n) => woodShade(S.shade(n));
  for (const v of [0.55, 1.45]) {
    S.tube((t) => [L * 0.5, L * v, 10 + t * 30], (t) => 2.6 + (Math.abs(t - 0.45) < 0.12 ? 1.2 : 0) + (t < 0.08 ? 0.8 : 0), woodP);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      S.tube((t) => {
        const r = 0.22 * Math.sin((t * Math.PI) / 2);
        return [L * (0.5 + Math.cos(a) * r), L * (v + Math.sin(a) * r), 10 * (1 - t) ** 1.6 + 1.5];
      }, (t) => 2 - 0.7 * t, woodP);
    }
  }
  S.flush('legs');
  // 天板。ランプのまわりは、丸テーブルと同じように灯りが照り返して明るい
  const [lx, ly] = c.P(0.5, 1, 45);
  box(c, -0.18, 1.18, 0.1, 1.86, 40, 45, { sw: () => '#3e2414', se: () => '#3e2414', top: (u, v, x, y) => {
    if (((x - lx + 9) / 13) ** 2 + ((y - ly + 2) / 6.5) ** 2 <= 1) return '#7a4e30';
    return (x + y * 3) % 19 === 0 ? '#7a4e30' : '#5e3a22';
  } });
  c.d.finish();
  const items = iso(-0.2, 1.2, 0, 2, 80);
  tableItems(items, 0.5, 1, 45);
  items.d.finish();
  const a = c.d.result();
  const b = items.d.result();
  return { dots: a.map((r, y) => r.map((col, x) => b[y][x] ?? col)), ax: c.ax, ay: c.ay };
}

// 天井から下がるランタン（真鍮の鎖に、六角の枠のガラスの箱。2つの見える面が光り、上に屋根、下に台）。
// z はランタンの下の端の高さ、top は天井の高さ（どちらもそのマスの床から。ロフトの上は天井が低い）
function pendantDots(z, top) {
  const c = iso(0, 1, 0, 1, Math.max(top, z + 27) + 4);
  const { d, P } = c;
  const [k0, k1] = [0.4, 0.6];
  const glassTop = z + 18;
  const roofTop = glassTop + 9;
  const [cx, cy] = P(0.5, 0.5, roofTop);
  const [, yt] = P(0.5, 0.5, top);
  if (cy > yt) d.stroke(Array.from({ length: Math.round(cy - yt) + 1 }, (_, n) => [Math.round(cx), Math.round(yt + n)]), WOOD.dark);
  box(c, k0, k1, k0, k1, z - 3, z, { sw: () => WOOD.brass, se: () => WOOD.brassDark, top: () => WOOD.brassLight }, { group: 'base' });
  box(c, k0, k1, k0, k1, z, glassTop, { sw: (u, zz) => (Math.abs(u - 0.5) < 0.02 ? WOOD.brassDark : zz < z + 6 ? '#f2b452' : '#ffe7a8'), se: (v, zz) => (Math.abs(v - 0.5) < 0.02 ? WOOD.brassDark : '#e8a040') }, { group: 'glass' });
  const corner = [P(k0, k1, glassTop), P(k1, k1, glassTop), P(k1, k0, glassTop), P(k0, k0, glassTop)];
  const apex = P(0.5, 0.5, roofTop);
  d.fill(poly([corner[0], corner[1], apex]), flat(WOOD.brassLight), { group: 'roofA' });
  d.fill(poly([corner[1], corner[2], apex]), flat(WOOD.brass), { group: 'roofB' });
  return done(c);
}

// 蓄音機（ラッパの付いた蓄音機の作り：横長の木の箱の上にレコードの盤、右の横にぜんまいの取っ手。
// 箱の奥の真鍮の支え（肘）から、トーンアームが盤の上を手前へ伸び、先のサウンドボックスの針がレコードに乗る。
// ラッパは細い端が奥の肘につながり、上へ立ち上がって手前へ弧を描きながら太くなり、口を手前（聞く人のほう）へ大きく開く。
// ラッパは何枚もの板を継いだ形で、継ぎ目が縦に走る。手前は箱の南西の面）
// ラッパ・アーム・サウンドボックスは、立体の点を画面へ写して、手前の点が奥の点を隠すように描く
const GRAM_L = 48;   // 1マスの辺の長さ（立体の計算の単位。高さの1ドットと同じ尺度）
function gramophoneDots() {
  const c = iso(-0.4, 1.3, 0, 1.7, 150);
  const { d, P } = c;
  // 戸棚
  box(c, 0.12, 0.88, 0.12, 0.88, 0, 46, {
    sw: (u, z) => (z < 5 ? WOOD.deep : Math.abs(u - 0.5) < 0.02 ? WOOD.deep : (z > 8 && z < 40 && Math.abs(u - 0.5) > 0.06 && u > 0.18 && u < 0.82 ? '#4a2c1a' : WOOD.mid)),
    se: (v, z) => (z < 5 ? WOOD.deep : z > 8 && z < 40 && v > 0.2 && v < 0.8 ? '#3a2416' : WOOD.dark),
    top: () => WOOD.light,
  });
  // 蓄音機の箱（戸棚より一回り小さい）：下に台座の縁、上に蓋の縁、横の面は彫りのはめ込みの板
  const BZ = 58;   // 箱の上の面
  const face = (s, z) => {
    if (z < 48) return WOOD.brassDark;
    if (z > BZ - 3) return z > BZ - 1 ? WOOD.lighter : WOOD.light;
    if (s < 0.1 || s > 0.9 || z < 50 || z > BZ - 4.5) return '#6e4228';
    return (Math.floor(s * 40) + Math.floor(z)) % 5 === 0 ? '#4a2a18' : '#5a3420';
  };
  box(c, 0.26, 0.74, 0.28, 0.72, 46, BZ, {
    sw: (u, z) => face((u - 0.26) / 0.48, z),
    se: (v, z) => face((v - 0.28) / 0.44, z),
    top: () => '#3a2416',
  });
  // ぜんまいの取っ手（右の横の面から外へ出て、先に握り）
  const [hx, hy] = P(0.74, 0.55, 52);
  d.fill(poly([[hx, hy - 1], [hx + 5, hy + 2], [hx + 5, hy + 3], [hx, hy + 1]]), flat(WOOD.brassDark), { group: 'crank' });
  d.fill(ellipse(hx + 6, hy + 2, 1.4, 2.2), flat(WOOD.dark), { group: 'crank' });
  // 盤とレコード
  const [rx, ry] = P(0.5, 0.5, BZ + 1);
  d.fill(ellipse(rx, ry, 8.5, 4.3), (x, y) => {
    const r = Math.hypot((x + 0.5 - rx) / 8.5, (y + 0.5 - ry) / 4.3);
    if (r < 0.12) return WOOD.brassLight;
    if (r < 0.34) return '#c0392b';
    return Math.floor(r * 8) % 2 === 0 && x < rx ? '#3a3632' : '#1a1614';
  }, { group: 'disc' });

  // ---- 立体の部品（世界の座標：U = u×L, V = v×L, Z = 高さ）
  const L = GRAM_L;
  const view = (() => { const k = 40 / L; const n = Math.hypot(1, 1, k); return [1 / n, 1 / n, k / n]; })();   // 見る人のほうへの向き
  const light = (() => { const v = [-0.5, 0.35, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const W = c.W;
  const zbuf = new Float64Array(W * c.H).fill(-Infinity);
  const col = new Array(W * c.H).fill(null);
  const plot = (U, V, Z, color) => {
    const [x, y] = P(U / L, V / L, Z);
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= c.H) return;
    const depth = dot([U, V, Z], view);
    const k = yi * W + xi;
    if (depth > zbuf[k]) { zbuf[k] = depth; col[k] = color; }
  };
  const shadeBrass = (n, seam) => {
    const k = dot(n, light);
    if (seam) return k > 0.3 ? WOOD.brass : WOOD.brassDark;
    return k > 0.75 ? '#fff0c0' : k > 0.4 ? WOOD.brassLight : k > -0.1 ? WOOD.brass : k > -0.5 ? WOOD.brassDark : '#5a4018';
  };
  // 管（中心線 path(t)、太さ rad(t)）を表面の点で描く。bell なら、口の縁と内側と継ぎ目も描く
  const tube = (path, rad, { bell = false, steps = 260 } = {}) => {
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const C = path(t);
      const C2 = path(Math.min(1, t + 0.002));
      const C1 = path(Math.max(0, t - 0.002));
      let T = [C2[0] - C1[0], C2[1] - C1[1], C2[2] - C1[2]];
      const tn = Math.hypot(...T); T = T.map((a) => a / tn);
      // 管の断面の2つの向き
      let N = [1, 0, 0];   // U の軸から T の向きを除いた向き
      N = N.map((a, k) => a - dot([1, 0, 0], T) * T[k]);
      const nn = Math.hypot(...N); N = N.map((a) => a / nn);
      const B = [T[1] * N[2] - T[2] * N[1], T[2] * N[0] - T[0] * N[2], T[0] * N[1] - T[1] * N[0]];
      const r = rad(t);
      const na = Math.max(24, Math.ceil(r * 8));
      for (let a = 0; a < na; a++) {
        const th = (a / na) * Math.PI * 2;
        const wav = bell && t > 0.9 ? 1 + 0.05 * Math.cos(8 * th) * (t - 0.9) / 0.1 : 1;   // 口の縁は花びらのように波打つ
        const n = [0, 1, 2].map((k) => Math.cos(th) * N[k] + Math.sin(th) * B[k]);
        const p = [0, 1, 2].map((k) => C[k] + r * wav * n[k]);
        const outer = dot(n, view) > -0.05;
        const seam = bell && Math.abs(((th / (Math.PI * 2)) * 8 + 0.5) % 1 - 0.5) < 0.05;
        let color;
        if (bell && t > 0.985) color = outer ? WOOD.brassLight : WOOD.brass;   // 口の縁
        else if (outer) color = shadeBrass(n, seam);
        else color = t < 0.75 ? '#2a1c0c' : t < 0.88 ? '#4a3414' : t < 0.95 ? '#7a5a24' : '#a8843a';   // 内側（奥ほど暗い）
        plot(p[0], p[1], p[2], color);
      }
    }
  };
  const bez = (pts) => (t) => {
    const [a, b2, cc, dd] = pts;
    const m = 1 - t;
    return [0, 1, 2].map((k) => m * m * m * a[k] + 3 * m * m * t * b2[k] + 3 * m * t * t * cc[k] + t * t * t * dd[k]);
  };
  const X = 0.5 * L;
  // 奥の真鍮の支え（肘）：箱の奥の端から立つ短い柱。上でラッパとトーンアームが分かれる
  tube((t) => [X, 0.32 * L, BZ + 9 * t], () => 1.8, { steps: 30 });
  // トーンアーム：肘から盤の上を手前へ、少し下りながら細くなり、サウンドボックスの裏につながる
  const SB = [X, 0.6 * L, BZ + 4.5];
  tube((t) => [X, (0.32 + (0.6 - 0.32 - 0.03) * t) * L, BZ + 7 - 2.5 * t], (t) => 1.3 - 0.4 * t, { steps: 60 });
  // サウンドボックス：手前を向いた丸い真鍮の縁と、黒い膜。下から針がレコードの溝へ
  for (let rr = 0; rr <= 3.2; rr += 0.2) {
    for (let a = 0; a < 48; a++) {
      const th = (a / 48) * Math.PI * 2;
      for (const dv of [0, 0.8]) plot(SB[0] + rr * Math.cos(th), SB[1] + dv, SB[2] + rr * Math.sin(th), rr > 2.4 ? (Math.sin(th) > 0 ? WOOD.brassLight : WOOD.brass) : '#2a2420');
    }
  }
  for (let k = 0; k <= 10; k++) plot(SB[0], SB[1] + 0.8 + 0.1 * k, SB[2] - 3.2 - 0.25 * k, '#d8d8d0');   // 針（銀）
  // ラッパ：細い端は肘の上。短い首から斜め上・手前へ伸び、先で一気に大きく開いて、広い口を手前の上へ向ける（チューリップのような形）
  tube(bez([[X, 0.32 * L, BZ + 9], [X, 0.35 * L, BZ + 16], [X, 0.48 * L, BZ + 22], [X, 0.68 * L, BZ + 30]]), (t) => 1.3 + 16 * t ** 3, { bell: true, steps: 300 });
  d.fill((x, y) => x >= 0 && y >= 0 && x < W && y < c.H && col[Math.floor(y) * W + Math.floor(x)] !== null,
    (x, y) => col[y * W + x], { group: 'horn' });
  return done(c);
}

// ---------------------------------------------------------------- 演奏の場所（右の手前の角）

// 大きさは主人公の体に合わせる（主人公の高さ 132：膝 約32・腰 約50・手 約47・肩 約85・口 約92。座る所の高さは椅子と同じ 28）

// 縦型のピアノ（奥行き2マスぶんの長さ。鍵盤は北西＝お客さんのいる部屋のほうを向き、こちらからは背中と横の面が見える）。
// 黒い塗り。高さ 98（立った主人公の肩より少し上）、鍵盤の高さ 58（座った主人公の手の高さ）
function pianoDots() {
  const c = iso(0, 1, 0, 2, 112);
  const BLK = '#1e1a1c';
  const GL = '#3a3438';
  const H = 98;
  const K = 58;
  const lacquer = (z, z1) => (z > z1 - 2 ? GL : z < 4 ? '#141012' : BLK);
  // 鍵盤（胴の向こう。こちらからは横の端だけが少し見える）
  box(c, 0.04, 0.44, 0.08, 1.92, K - 4, K, { sw: () => '#d8d2c4', top: (u, v) => (Math.floor(v * 26) % 7 === 2 ? '#1a1414' : '#f2eee2') });
  box(c, 0.04, 0.44, 1.84, 1.94, K - 4, K + 6, { sw: () => BLK, se: () => GL, top: () => GL });
  // 下の胴と上の胴。背中（南東の面）は板を縦に並べ、横木を渡した裏板
  const back = (v, z, z1) => {
    if (z > z1 - 2) return GL;
    if (z < 4) return '#141012';
    if (Math.abs(z - 34) < 2 || Math.abs(z - 74) < 2) return '#2c2628';   // 横木
    return Math.floor(v * 40) % 9 === 0 ? '#141012' : BLK;
  };
  box(c, 0.3, 0.8, 0.06, 1.94, 0, K - 4, { sw: (u, z) => lacquer(z, K - 4), se: (v, z) => back(v, z, K - 4) });
  box(c, 0.44, 0.8, 0.06, 1.94, K - 4, H, {
    sw: (u, z) => (z > H - 24 && z < H - 10 && Math.abs(u - 0.62) < 0.1 ? '#2a2426' : lacquer(z, H)),
    se: (v, z) => back(v, z, H),
    top: () => GL,
  });
  return done(c);
}

// ドラムセット（2×2マス。お客さんのいる北西を向き、叩く人は南東の側に座る。こちらからは叩く人の側から見える）。
// 赤い胴の大太鼓（直径 44）、その上のタム2つ、叩く人の左に小太鼓とハイハット、右に床のタム、シンバル2枚、椅子
function drumsDots() {
  const c = iso(-0.4, 2.4, -0.4, 2.4, 120);
  const { d, P } = c;
  const L = 48;
  const view = (() => { const k = 40 / L; const n = Math.hypot(1, 1, k); return [1 / n, 1 / n, k / n]; })();
  const light = (() => { const v = [-0.5, 0.35, 1]; const n = Math.hypot(...v); return v.map((a) => a / n); })();
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const W = c.W;
  const zbuf = new Float64Array(W * c.H).fill(-Infinity);
  const col = new Array(W * c.H).fill(null);
  const plot = (U, V, Z, color) => {
    const [x, y] = P(U / L, V / L, Z);
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= W || yi >= c.H) return;
    const depth = dot([U, V, Z], view);
    const k = yi * W + xi;
    if (depth > zbuf[k]) { zbuf[k] = depth; col[k] = color; }
  };
  // 円柱（中心 C、軸の向き A（単位）、半径 r、長さ h）。side は胴、cap は面（膜）の色を返す
  const cyl = (C, A, r, h, side, cap) => {
    const N = Math.abs(A[2]) > 0.9 ? [1, 0, 0] : [0, 0, 1];
    let B = [A[1] * N[2] - A[2] * N[1], A[2] * N[0] - A[0] * N[2], A[0] * N[1] - A[1] * N[0]];
    const bn = Math.hypot(...B); B = B.map((a) => a / bn);
    const M = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]];
    const na = Math.ceil(r * 9);
    for (let s = 0; s <= h; s += 0.3) {
      for (let a = 0; a < na; a++) {
        const th = (a / na) * Math.PI * 2;
        const n = [0, 1, 2].map((k) => Math.cos(th) * M[k] + Math.sin(th) * B[k]);
        plot(...[0, 1, 2].map((k) => C[k] + A[k] * (s - h / 2) + r * n[k]), side(dot(n, light), s / h));
      }
    }
    for (const e of [-1, 1]) {
      for (let rr = 0; rr <= r; rr += 0.3) {
        for (let a = 0; a < na; a++) {
          const th = (a / na) * Math.PI * 2;
          plot(...[0, 1, 2].map((k) => C[k] + A[k] * e * h / 2 + rr * (Math.cos(th) * M[k] + Math.sin(th) * B[k])), cap(rr / r, th));
        }
      }
    }
  };
  const pole = (x, y, z0, z1) => { for (let z = z0; z <= z1; z += 0.4) for (const [dx, dy] of [[0, 0], [0.5, 0], [0, 0.5]]) plot(x + dx, y + dy, z, '#a8acb0'); };
  const tripod = (x, y, r) => { for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.5; for (let t = 0; t <= 1; t += 0.05) plot(x + Math.cos(a) * r * t, y + Math.sin(a) * r * t, 10 * (1 - t), '#7a7e84'); } };
  const shell = (k, f) => (f < 0.07 || f > 0.93 ? '#d0d4d8' : k > 0.4 ? '#c03848' : k > -0.2 ? '#9a2232' : '#6a1622');
  const head = (r) => (r > 0.9 ? '#d0d4d8' : '#ece6d6');
  const cym = (C, r, tilt) => {
    const na = Math.ceil(r * 9);
    for (let rr = 0; rr <= r; rr += 0.3) {
      for (let a = 0; a < na; a++) {
        const th = (a / na) * Math.PI * 2;
        const dz = Math.cos(th) * rr * tilt + (r - rr) * 0.12;   // 叩く人のほう（南東）へ少し傾く
        plot(C[0] + rr * Math.cos(th), C[1] + rr * Math.sin(th), C[2] - dz, rr < 1.5 ? '#8a6a2a' : Math.floor(rr * 0.8) % 2 ? '#e2c060' : '#c9a24a');
      }
    }
  };
  // 椅子（叩く人の側）
  tripod(72, 48, 8);
  pole(72, 48, 0, 26);
  cyl([72, 48, 28], [0, 0, 1], 8, 4, () => '#2a2426', () => '#3a3436');
  // 大太鼓（膜が北西と南東を向いて立つ）と、叩く人の側のペダル
  cyl([30, 48, 22], [1, 0, 0], 22, 18, shell, (r) => (r > 0.92 ? '#d0d4d8' : r > 0.5 && r < 0.56 ? '#c03848' : '#ece6d6'));
  for (let u = 40; u <= 50; u += 0.5) for (let v = 45; v <= 51; v += 0.5) plot(u, v, 2, '#3a3a3e');
  // 大太鼓の上のタム2つ（叩く人のほうへ傾く）
  const tilt = [0.42, 0, 0.91];
  cyl([34, 36, 52], tilt, 10, 11, shell, head);
  cyl([34, 60, 52], tilt, 11, 12, shell, head);
  // 床のタム（叩く人の右）
  for (const [dx, dy] of [[-9, -9], [9, -9], [0, 11]]) pole(64 + dx, 82 + dy, 0, 12);
  cyl([64, 82, 26], [0, 0, 1], 14, 30, shell, head);
  // 小太鼓（叩く人の左）とハイハット
  tripod(60, 20, 9);
  pole(60, 20, 0, 40);
  cyl([60, 20, 44], [0, 0, 1], 12, 8, (k, f) => (f < 0.15 || f > 0.85 ? '#d0d4d8' : k > 0 ? '#e8eaec' : '#b8bcc0'), head);
  tripod(52, 0, 10);
  pole(52, 0, 0, 62);
  cym([52, 0, 62], 13, 0);
  cym([52, 0, 65], 13, 0);
  // シンバル（左の奥と右）
  tripod(18, 12, 10);
  pole(18, 12, 0, 80);
  cym([18, 12, 80], 16, 0.2);
  tripod(40, 92, 10);
  pole(40, 92, 0, 76);
  cym([40, 92, 76], 18, 0.2);
  d.fill((x, y) => x >= 0 && y >= 0 && x < W && y < c.H && col[Math.floor(y) * W + Math.floor(x)] !== null, (x, y) => col[y * W + x], { group: 'drums' });
  return done(c);
}

// マイクスタンド（三脚の台、銀の柱、上に黒い頭の丸いマイク。マイクは主人公の胸の高さで、歌う人の立つ南東へ向く）
function micStandDots() {
  const c = iso(0, 1, 0, 1, 100);
  const { d, P } = c;
  const top = P(0.5, 0.5, 68);
  const head = P(0.66, 0.5, 74);
  for (const [u, v] of [[0.3, 0.3], [0.78, 0.45], [0.45, 0.78]]) leg(c, P(0.5, 0.5, 8), P(u, v, 0), 1.5, '#7a7e84');
  leg(c, P(0.5, 0.5, 0), top, 1.6, '#b8bcc0');
  leg(c, top, head, 1.2, '#3a3a3e', { group: 'mic' });
  d.fill(ellipse(head[0] + 1, head[1] - 1, 2.6, 3), (x, y) => ((x + y) % 2 ? '#9a9ea4' : '#5a5e64'), { group: 'micHead' });
  return done(c);
}

// ロフトの真ん中に立つ本棚（1マスぶん。両面に3段の本、上は木の天板）。end は南西の端（側板を描く）
function loftShelfDots(end) {
  const c = iso(0, 1, 0, 1, 130);
  const H = 118;
  const books = (s, z) => {
    if (z < 6) return WOOD.deep;
    if (z > H - 6 || s < 0.04 || (end && s > 0.92)) return WOOD.mid;
    const row = Math.min(2, Math.floor((z - 6) / 37));
    const bottom = 6 + row * 37;
    if (z < bottom + 3) return WOOD.light;   // 棚板
    const k = Math.floor(s * 40 / 3);
    const hb = 22 + Math.floor(hash(k, row, 5) * 10);
    if (z > bottom + 3 + hb || hash(k, row, 77) < 0.08) return '#24160e';
    const col = BOOKS[Math.floor(hash(k, row, 3) * BOOKS.length)];
    if (Math.abs(z - (bottom + hb - 3)) < 0.6 && hash(k, row, 8) < 0.5) return WOOD.brass;
    return Math.floor(s * 40) % 3 === 0 ? mix(col, '#000000', 0.25) : col;
  };
  box(c, 0.14, 0.86, 0, end ? 0.96 : 1, 0, H, {
    sw: end ? (u, z) => (z < 6 ? WOOD.deep : Math.floor(u * 40) % 7 === 0 ? WOOD.dark : WOOD.mid) : null,
    se: (v, z) => books(v, z),
    top: () => WOOD.light,
  });
  return done(c);
}

export const CAFE_PROPS = {
  barChair: () => barChairDots(),
  roundTableBig: () => roundTableDots(true),
  roundTableSmall: () => roundTableDots(false),
  chairSE: () => chairDots('se'),
  chairNW: () => chairDots('nw'),
  chairSW: () => chairDots('sw'),
  chairNE: () => chairDots('ne'),
  counter: () => counterDots(false),
  counterEnd: () => counterDots(true),
  boothBenchSE: () => boothBenchDots('se'),
  boothBenchNW: () => boothBenchDots('nw'),
  boothTable: () => boothTableDots(),
  drawerChest: () => drawerChestDots(),
  piano: () => pianoDots(),
  drums: () => drumsDots(),
  micStand: () => micStandDots(),
  gramophone: () => gramophoneDots(),
  pendant: () => pendantDots(150, CAFE.wallH - 12),
  pendantLoft: () => pendantDots(136, 136 + 27 + 8),   // ロフトの上（主人公の頭のすぐ上。鎖は短い）
  pendantLow: () => pendantDots(96, WINDOW_WALL_TOP - 12),   // 水槽の窓の側（壁が低い。ボックス席のテーブルの上に下がる）
  loftShelf: () => loftShelfDots(false),
  loftShelfEnd: () => loftShelfDots(true),
};
