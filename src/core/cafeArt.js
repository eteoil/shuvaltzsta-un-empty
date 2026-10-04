// シャルヴィスのカフェ（バー）の内装。参考は、ランプの灯った木の酒場：左奥の壁にバーカウンターと、緑に光る酒棚の上のロフト（手すりと本棚）、
// ロフトから降りる階段、右奥の壁に水槽をのぞくアーチ窓、窓の前の赤いボックス席、蓄音機、丸テーブルと椅子、スレートの石の床。
// どれも 1ドット＝1px で、クォータービュー（床のマスは 80×40 のひし形）の角度で組み立てる。
// 物の絵は { dots, ax, ay }：dots の (ax, ay) が、置いたマス（アンカーのマス）の上の頂点に来る。
import { createDots, flat, poly, ellipse, capsule } from './dotArt.js';

// 水槽の窓の壁のてっぺん（酒棚から続く梁と同じ高さ。その上の壁は描かない）と、窓のてっぺん（壁のてっぺんの梁のすぐ下）
export const WINDOW_WALL_TOP = 136;
const WINDOW_TOP = 118;
// 酒棚のてっぺんから扉と額の壁の上へ続く梁（BEAM_Z からロフトの床の高さまで）。扉は梁のすぐ下まで
const BEAM_Z = 122;
const DOOR_H = BEAM_Z;

export const CAFE = {
  stepH: 34,      // 段の高さ（ロフトは4段＝136）
  loftH: 136,     // ロフトの床の高さ。主人公（約132）が下に立っても頭がぶつからない
  wallH: 300,     // 壁の高さ。ロフトの上に、本棚と主人公の背丈ぶん
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

// 床に置いた楕円（u, v の中心、z の高さ、横 rx・縦 ry ドット）
const disc = (c, u, v, z, rx, ry) => { const [x, y] = c.P(u, v, z); return ellipse(x, y, rx, ry); };

const done = (c, outline = true) => { c.d.finish({ outline }); return { dots: c.d.result(), ax: c.ax, ay: c.ay }; };

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
// ガラスの飾り棚（青い光の中の、青いガラスの像）
function vitrine(v, z) {
  if (v < 0.05 || v > 0.95) return WOOD.dark;
  if (z < 46 || z > 122) return backBar(v, z);
  const dv = (v - 0.5) * 40;
  const body = (dv / 7) ** 2 + ((z - 74) / 16) ** 2 <= 1;
  const head = (dv / 8) ** 2 + ((z - 104) / 7) ** 2 <= 1;
  const neck = Math.abs(dv) < 2.2 && z > 88 && z < 100;
  const base = Math.abs(dv) < 7 && z < 54;
  if (base) return '#3a5a8a';
  if (body || head || neck) return dv < -2 && (body || head) ? '#bfe8ff' : (dv > 3 ? '#2a6ab8' : '#3fa0e8');
  return mix('#173a62', '#3f86c8', (z - 46) / 76);
}
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
  return done(c);
}

// 手すり（マス1つぶんの辺）。edge は 'se'・'sw'・'ne'。z0・z1 は辺の始め（北寄り）と終わりの床の高さ（階段は傾く）
export function railDots(edge, z0, z1) {
  const RH = 30;
  const c = iso(-0.1, 1.1, -0.1, 1.1, Math.max(z0, z1) + RH + 6);
  const { d, P } = c;
  const at = (k) => (edge === 'se' ? [1, k] : edge === 'sw' ? [k, 1] : [k, 0]);
  const z = (k) => z0 + (z1 - z0) * k;
  const seg = (k0, k1, dz0, dz1, w) => {
    const [ua, va] = at(k0);
    const [ub, vb] = at(k1);
    return poly([P(ua, va, z(k0) + dz0 - w / 2), P(ub, vb, z(k1) + dz1 - w / 2), P(ub, vb, z(k1) + dz1 + w / 2), P(ua, va, z(k0) + dz0 + w / 2)]);
  };
  // 手すり子（細い柱）
  for (let k = 0.0625; k < 1; k += 0.125) {
    const [u, v] = at(k);
    const [x, y] = P(u, v, z(k));
    d.fill(poly([[x - 1, y - 3], [x + 1, y - 3], [x + 1, y - RH + 3], [x - 1, y - RH + 3]]), (px) => (px < x ? WOOD.lighter : WOOD.mid), { group: 'rail' });
  }
  d.fill(seg(0, 1, 2, 2, 3), flat(WOOD.mid), { group: 'rail' });
  d.fill(seg(0, 1, RH, RH, 4), (x, y) => (y % 2 ? WOOD.light : WOOD.lighter), { group: 'rail' });
  // 端の親柱
  for (const k of [0, 1]) {
    const [u, v] = at(k);
    const [x, y] = P(u, v, z(k));
    d.fill(poly([[x - 2, y], [x + 2, y], [x + 2, y - RH - 4], [x - 2, y - RH - 4]]), (px) => (px < x ? WOOD.light : WOOD.dark), { group: 'rail' });
  }
  return done(c);
}

// ---------------------------------------------------------------- 家具

const CUSHION = { top: '#4f7060', side: '#2e463a', mid: '#3e5c4c' };
const RED = { top: '#b03a48', mid: '#9a3040', dark: '#78202e', button: '#e2c9a8' };

// 細い脚（画面の2点を結ぶ）
const leg = (c, a, b, w, col, opts = {}) => c.d.fill(capsule(a, b, w), (x) => (x < Math.min(a[0], b[0]) + w / 2 ? mix(col, '#ffffff', 0.15) : col), opts);

// 椅子の背もたれ（参考：上が丸く盛り上がった笠木、真ん中に縦の背板、両脇の柱）。
// 面は、座った人の向き（dir）と反対側に立つ。dir が 'se'・'nw' なら u が一定の面、'sw'・'ne' なら v が一定の面
function chairBack(c, dir, z0, z1, crown) {
  const { d, P } = c;
  const alongV = dir === 'se' || dir === 'nw';
  const k = { se: 0.28, nw: 0.72, sw: 0.28, ne: 0.72 }[dir];
  const at = (s, z) => (alongV ? P(k, s, z) : P(s, k, z));
  const pts = [];
  for (let n = 0; n <= 12; n++) { const s = 0.28 + (0.44 * n) / 12; pts.push(at(s, z1 + crown * Math.sin(Math.PI * n / 12))); }
  pts.push(at(0.72, z0), at(0.28, z0));
  const [mx] = at(0.5, 0);
  d.fill(poly(pts), (x, y) => {
    const [, ty] = at(0.5, z1 - 4);
    if (Math.abs(x - mx) < 3.5 && y > ty) return Math.abs(x - mx) < 1 && y > ty + 6 && y < ty + 14 ? WOOD.deep : WOOD.light;   // 背板（真ん中に細い透かし）
    const [lx] = at(0.32, 0);
    const [rx] = at(0.68, 0);
    if (Math.abs(x - lx) < 2 || Math.abs(x - rx) < 2) return WOOD.mid;
    return y < at(0.5, z1 - 6)[1] ? WOOD.light : WOOD.dark;   // 笠木と、その下の抜け
  }, { group: 'back' });
}

// 丸いクッション（緑、ふちに真鍮の鋲）
function cushion(c, z, rx, ry, th) {
  const { d, P } = c;
  const [cx, cy] = P(0.5, 0.5, z);
  d.fill(poly([[cx - rx, cy], [cx + rx, cy], [cx + rx, cy + th], [cx - rx, cy + th]]), (x, y) => (y === Math.round(cy + th / 2) && x % 3 === 0 ? WOOD.brass : CUSHION.side), { group: 'seat' });
  d.fill(ellipse(cx, cy + th, rx, ry), (x, y) => (y > cy + th + ry - 2 && x % 3 === 0 ? WOOD.brass : CUSHION.side), { group: 'seat' });
  d.fill(ellipse(cx, cy, rx, ry), (x, y) => (y < cy - 1 && x < cx ? CUSHION.top : CUSHION.mid), { group: 'seatTop' });
}

// 木の椅子（テーブルのまわり）。dir は座った人の向き。背もたれが奥なら先に、手前なら最後に描く
function chairDots(dir) {
  const c = iso(0, 1, 0, 1, 90);
  const { P } = c;
  const seat = 28;
  const backFirst = dir === 'se' || dir === 'sw';
  if (backFirst) chairBack(c, dir, seat, 74, 6);
  const legs = [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]];
  [0, 1].forEach((k) => leg(c, P(...legs[k], seat), P(...legs[k], 0), 3, WOOD.mid));
  cushion(c, seat, 13, 6.5, 4);
  [2, 3].forEach((k) => leg(c, P(...legs[k], seat - 2), P(...legs[k], 0), 3, WOOD.mid));
  if (!backFirst) chairBack(c, dir, seat, 74, 6);
  return done(c);
}

// カウンターの前の背もたれ付きの高い椅子（参考：細い4本脚、真鍮の足かけ、低い背もたれ、緑のクッション）。客はカウンター（北西）を向く
function barChairDots() {
  const c = iso(0, 1, 0, 1, 90);
  const { d, P } = c;
  const seat = 44;
  const legs = [[0.32, 0.32], [0.68, 0.32], [0.32, 0.68], [0.68, 0.68]];
  [0, 1].forEach((k) => leg(c, P(...legs[k], seat - 2), P(legs[k][0] + (legs[k][0] - 0.5) * 0.3, legs[k][1] + (legs[k][1] - 0.5) * 0.3, 0), 3, WOOD.mid));
  d.fill((x, y) => disc(c, 0.5, 0.5, 16, 12, 6)(x, y) && !disc(c, 0.5, 0.5, 16, 9.5, 4.5)(x, y), flat(WOOD.brass), { group: 'ring' });
  [2, 3].forEach((k) => leg(c, P(...legs[k], seat - 2), P(legs[k][0] + (legs[k][0] - 0.5) * 0.3, legs[k][1] + (legs[k][1] - 0.5) * 0.3, 0), 3, WOOD.mid));
  cushion(c, seat, 12, 6, 4);
  chairBack(c, 'nw', seat, 70, 4);
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
  const [bx, by] = P(0.5, 0.5, 0);
  d.fill(ellipse(bx, by, big ? 18 : 13, big ? 8 : 6), flat(WOOD.dark), { group: 'base' });
  const [tx, ty] = P(0.5, 0.5, top);
  d.fill(poly([[bx - 4, by - 2], [bx + 4, by - 2], [tx + 4, ty], [tx - 4, ty]]), (x, y) => {
    const k = (by - y) / (by - ty);
    const w = 4 + (Math.abs(k - 0.45) < 0.1 ? 1.5 : 0);   // 真ん中のふくらみ（ろくろ挽き）
    if (Math.abs(x - bx) > w) return null;
    return x < bx - 1 ? WOOD.light : WOOD.mid;
  }, { group: 'post' });
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
  return done(c);
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

// ボックス席の後ろの棚（ボックス席の背もたれと同じ高さ・同じ厚みの木の棚。背もたれにくっつけて置く。板張りで、引き出しは無い）
function drawerChestDots() {
  const D = 1.92;
  const c = iso(0, 1, 0, 2, 90);
  const H = 76;
  const T = 0.3;    // 厚み（背もたれと同じ）
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

// ボックス席のテーブル（窓から部屋へ2マスの長い天板。2本脚、上に花瓶とランプ）
function boothTableDots() {
  const c = iso(-0.2, 1.2, 0, 2, 80);
  const { P } = c;
  for (const v of [0.5, 1.5]) leg(c, P(0.5, v, 0), P(0.5, v, 42), 6, WOOD.mid);
  box(c, -0.18, 1.18, 0.1, 1.86, 40, 45, { sw: () => '#3e2414', se: () => '#3e2414', top: (u, v, x, y) => ((x + y * 3) % 19 === 0 ? '#7a4e30' : '#5e3a22') });
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
  const c = iso(0, 1, 0, 1, top + 4);
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
  // 蓄音機の箱：下に台座の縁、上に蓋の縁、横の面は彫りのはめ込みの板
  const face = (s, z) => {
    if (z < 48) return WOOD.brassDark;
    if (z > 61) return z > 63 ? WOOD.lighter : WOOD.light;
    if (s < 0.08 || s > 0.92 || z < 51 || z > 58.5) return '#6e4228';
    return (Math.floor(s * 40) + Math.floor(z)) % 5 === 0 ? '#4a2a18' : '#5a3420';
  };
  box(c, 0.16, 0.84, 0.18, 0.82, 46, 64, {
    sw: (u, z) => face((u - 0.16) / 0.68, z),
    se: (v, z) => face((v - 0.18) / 0.64, z),
    top: () => '#3a2416',
  });
  // ぜんまいの取っ手（右の横の面から外へ出て、先に握り）
  const [hx, hy] = P(0.84, 0.55, 55);
  d.fill(poly([[hx, hy - 1], [hx + 6, hy + 2], [hx + 6, hy + 4], [hx, hy + 1]]), flat(WOOD.brassDark), { group: 'crank' });
  d.fill(ellipse(hx + 7, hy + 2, 1.6, 2.5), flat(WOOD.dark), { group: 'crank' });
  // 盤とレコード
  const [rx, ry] = P(0.5, 0.52, 65);
  d.fill(ellipse(rx, ry, 12, 6), (x, y) => {
    const r = Math.hypot((x + 0.5 - rx) / 12, (y + 0.5 - ry) / 6);
    if (r < 0.1) return WOOD.brassLight;
    if (r < 0.3) return '#c0392b';
    return Math.floor(r * 10) % 2 === 0 && x < rx ? '#3a3632' : '#1a1614';
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
  // 奥の真鍮の支え（肘）：箱の上から立つ太い柱
  tube((t) => [X, 0.24 * L, 64 + 12 * t], () => 2.6, { steps: 30 });
  // トーンアーム：肘から盤の上を手前へ、細くなりながら
  tube((t) => [X, (0.24 + 0.4 * t) * L, 74 - 4 * t], (t) => 2 - 0.8 * t, { steps: 80 });
  // サウンドボックス：手前を向いた丸い真鍮の箱（膜の面）と、下へ針
  const SB = [X, 0.66 * L, 70];
  for (let rr = 0; rr <= 4.5; rr += 0.25) {
    for (let a = 0; a < 64; a++) {
      const th = (a / 64) * Math.PI * 2;
      for (const dv of [0, 1.5]) plot(SB[0] + rr * Math.cos(th), SB[1] + dv, SB[2] + rr * Math.sin(th), rr > 3.6 ? WOOD.brassLight : dv > 1 ? (rr < 1 ? '#3a2c1c' : '#d8c8a0') : WOOD.brass);
    }
  }
  for (let z = 65; z < 66.5; z += 0.25) plot(SB[0], SB[1] + 1, z, '#2a2420');
  // ラッパ：細い端は肘の上。上へ立ち上がり、手前へ弧を描いて、口を手前へ開く
  tube(bez([[X, 0.24 * L, 76], [X, 0.16 * L, 94], [X, 0.43 * L, 102], [X, 0.7 * L, 99]]), (t) => 1.6 + 9.5 * t ** 3.4, { bell: true, steps: 300 });
  d.fill((x, y) => x >= 0 && y >= 0 && x < W && y < c.H && col[Math.floor(y) * W + Math.floor(x)] !== null,
    (x, y) => col[y * W + x], { group: 'horn' });
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
  gramophone: () => gramophoneDots(),
  pendant: () => pendantDots(150, CAFE.wallH - 12),
  pendantLoft: () => pendantDots(140, CAFE.wallH - CAFE.loftH - 12),
  pendantLow: () => pendantDots(96, WINDOW_WALL_TOP - 12),   // 水槽の窓の側（壁が低い。ボックス席のテーブルの上に下がる）
  loftShelf: () => loftShelfDots(false),
  loftShelfEnd: () => loftShelfDots(true),
};
