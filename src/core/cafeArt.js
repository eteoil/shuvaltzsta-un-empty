// シャルヴィスのカフェ（バー）の内装。参考は、ランプの灯った木の酒場：左奥の壁にバーカウンターと、緑に光る酒棚の上のロフト（手すりと本棚）、
// ロフトから降りる階段、右奥の壁に水槽をのぞくアーチ窓、窓の前の赤いボックス席、蓄音機、丸テーブルと椅子、スレートの石の床。
// どれも 1ドット＝1px で、クォータービュー（床のマスは 80×40 のひし形）の角度で組み立てる。
// 物の絵は { dots, ax, ay }：dots の (ax, ay) が、置いたマス（アンカーのマス）の上の頂点に来る。
import { createDots, flat, poly, ellipse, capsule } from './dotArt.js';

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
//   'loft'（ロフトの上の壁：ロフトの床の高さから本棚、その上は漆喰）・'loftLamp'（＋壁のランプ）・
//   'door'（扉。ひし形の飾りの付いた木の扉）・'plain'（腰板と漆喰）・'lamp'（＋壁のランプ）・
//   'window'（水槽をのぞくアーチ窓。外は青い水で、水草と魚と泡）・'painting'（絵だけ。イベントで後から掛ける額）。
// seed は窓ごとに魚や水草を変えるための番号
export function cafeWallDots(side, style, { start = false, end = false, seed = 0 } = {}) {
  const H0 = CAFE.wallH;
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

  if (style === 'painting') {
    // 蓄音機の上に掛ける額（イベントで後から）。金の額縁に、青いドレスと緑の服の2人の肖像
    const frame = region((t, z) => t >= 0.22 && t <= 0.78 && z >= 116 && z <= 186);
    const canvas = region((t, z) => t >= 0.27 && t <= 0.73 && z >= 122 && z <= 180);
    d.fill(frame, (x, y) => ((x + y) % 4 === 0 ? WOOD.brassLight : WOOD.brass), plain);
    d.fill(canvas, (x, y) => {
      const [t, z] = at(x, y);
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
  const lampZ = style === 'loftLamp' ? CAFE.loftH + 118 : 170;
  d.fill(band(0, 1, 0, H0), (x, y) => {
    const [t, z] = at(x, y);
    if (lamp && Math.hypot((t - 0.5) * 40, (z - lampZ) * 0.8) < 26) return (x + y) % 2 ? C.glow : mix(C.glow, '#f4e2b0', 0.3);
    return hash(x, y, 11) < 0.07 ? C.speck : C.plaster;
  }, plain);
  // てっぺんの梁
  d.fill(band(0, 1, H0 - 12, H0), (x, y) => (at(x, y)[1] > H0 - 4 ? C.beamLight : C.beam), plain);
  line(0, H0 - 12, 1, H0 - 12, LINE);

  const post = () => {
    d.fill(band(0, 0.06, 0, H0 - 12), flat(C.beam), plain);
    line(0.06, 0, 0.06, H0 - 12, LINE);
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
    // ロフトの床から上：幅木、本棚（2段、色とりどりの背表紙）、その上は漆喰
    const L = CAFE.loftH;
    d.fill(band(0, 1, L, L + 6), flat(C.woodDark), plain);
    d.fill(band(0, 1, L + 6, L + 88), (x, y) => {
      const [t, z] = at(x, y);
      if (t < 0.05 || t > 0.95 || z > L + 84 || (z > L + 44 && z < L + 48)) return C.wood;
      const row = z < L + 46 ? 0 : 1;
      const bottom = row ? L + 48 : L + 10;
      if (z < bottom) return C.wood;
      const k = Math.floor((x - 1) / 3);
      const hb = 24 + Math.floor(hash(k, row, seed) * 10);
      if (z > bottom + hb || hash(k, row, 77) < 0.08) return '#24160e';
      const col = BOOKS[Math.floor(hash(k, row, 3) * BOOKS.length)];
      const spine = (x - 1) % 3 === 0 ? mix(col, '#000000', 0.25) : col;
      return Math.abs(z - (bottom + hb - 5)) < 0.6 && hash(k, row, 8) < 0.5 ? WOOD.brass : (side === 'nw' ? mix(spine, '#000000', 0.15) : spine);
    }, plain);
    line(0, L + 6, 1, L + 6, LINE);
    line(0, L + 88, 1, L + 88, LINE);
    line(0, L + 46, 1, L + 46, C.woodDark);
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
    const top = (t) => 236 + 26 * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.38) ** 2));
    const outer = region((t, z) => t >= 0.09 && t <= 0.91 && z >= 46 && z <= top(t) + 4);
    const glass = region((t, z) => t >= 0.14 && t <= 0.86 && z >= 52 && z <= top(t) - 1);
    d.fill(band(0.06, 0.94, 44, 50), flat(C.beamLight), plain);
    d.fill(outer, flat(C.beam), plain);
    const fish = [0, 1].map((k) => ({ t: 0.25 + 0.5 * hash(seed, k, 1), z: 100 + 120 * hash(seed, k, 2), dir: hash(seed, k, 3) < 0.5 ? -1 : 1, col: hash(seed, k, 4) < 0.35 ? '#e3893c' : '#1d4a60' }));
    const weeds = [0, 1, 2].map((k) => ({ t: 0.2 + 0.6 * hash(seed, k, 6), h: 90 + 90 * hash(seed, k, 7), ph: hash(seed, k, 8) * 6 }));
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
      if (((tx * 0.9 + z * 0.55) % 24) < 3.5 && z > 120) return mix('#5fc0d0', '#bdeef0', (z - 120) / 140);
      if (z < 64) return '#2a6070';
      return mix('#2e7088', '#6cc4d2', (z - 52) / 210);
    }, plain);
    const rimOf = (shape, c) => {
      const pts = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (shape(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
      d.stroke(pts, c);
    };
    // 桟
    d.fill(region((t, z) => glass(...p(t, z)) && (Math.abs(t - 0.5) < 0.03 || Math.abs(z - 124) < 1.5 || Math.abs(z - 196) < 1.5)), flat(C.beam), plain);
    rimOf(outer, LINE);
    rimOf(glass, LINE);
    line(0.06, 44, 0.94, 44, LINE);
  } else {
    // plain・lamp：腰板と漆喰。lamp は真鍮の腕に下がったランタン
    wainscot(56);
    post();
  }
  if (lamp) {
    const z0 = lampZ;
    d.fill(region((t, z) => t > 0.47 && t < 0.53 && z > z0 + 14 && z < z0 + 24), flat(WOOD.brassDark), plain);
    const lan = region((t, z) => Math.abs(t - 0.5) * 40 < 6 - Math.max(0, z - z0 - 8) * 0.6 && z > z0 - 12 && z < z0 + 14);
    d.fill(lan, (x, y) => {
      const [t, z] = at(x, y);
      if (z > z0 + 8 || z < z0 - 9) return WOOD.dark;
      return Math.abs(t - 0.5) * 40 < 1 ? WOOD.dark : (z > z0 ? '#ffe7a8' : '#f2b452');
    }, plain);
    const pts = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lan(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !lan(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
    }
    d.stroke(pts, '#231815');
  }
  line(0, 0, 1, 0, LINE);
  line(0, H0, 1, H0, LINE);
  if (start) line(0, 0, 0, H0, LINE);
  if (end) line(1, 0, 1, H0, LINE);
  d.finish({ outline: false });
  return d.result();
}

// ---------------------------------------------------------------- ロフトと階段（床の高さのあるマス）

// 背の高い酒棚（ロフトの南東向きの面）。下は扉の付いた戸棚、上は緑に光る3段の棚に色とりどりの瓶
const BOTTLES = ['#3a6a3a', '#8a3a2a', '#d8b050', '#4a5a8a', '#c87a3a', '#e8e0c8', '#6a2a4a', '#2a7a6a', '#b0b8a0'];
function backBar(v, z, seed) {
  if (v < 0.05 || v > 0.95) return WOOD.dark;
  if (z < 6) return WOOD.deep;
  if (z < 42) return (v > 0.12 && v < 0.46) || (v > 0.54 && v < 0.88) ? (z > 10 && z < 37 ? '#4a2e1c' : WOOD.mid) : WOOD.mid;
  if (z < 46) return z > 44 ? WOOD.lighter : WOOD.light;
  if (z > 122) return Math.abs(z - 125) < 0.8 ? WOOD.brass : WOOD.dark;
  if ([[68, 70], [94, 96]].some(([a, b]) => z >= a && z <= b)) return '#4a3020';
  const row = z < 70 ? 0 : z < 96 ? 1 : 2;
  const bottom = [46, 70, 96][row];
  const k = Math.floor(v * 14);
  const f = v * 14 - k;
  const hb = 13 + Math.floor(hash(k, row, seed) * 9);
  const neck = z - bottom > hb * 0.62;
  const inBottle = z - bottom <= hb && (neck ? f > 0.38 && f < 0.62 : f > 0.16 && f < 0.84) && hash(k, row, seed + 3) > 0.12;
  if (inBottle) {
    const col = BOTTLES[Math.floor(hash(k, row, seed + 9) * BOTTLES.length)];
    return f < 0.3 && !neck ? mix(col, '#ffffff', 0.45) : col;
  }
  return mix('#4aa77a', '#a8e8c2', (z - bottom) / 26);
}
// ガラスの飾り棚（青い光の中の、青いガラスの像）
function vitrine(v, z) {
  if (v < 0.05 || v > 0.95) return WOOD.dark;
  if (z < 46 || z > 122) return backBar(v, z, 0);
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
    if (face === 'backbar') return backBar(v, z, seed);
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
  const c = iso(0, 1, 0, 1, 56);
  const H = 46;
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
  const c = iso(0, 1, 0, 1, 110);
  const backFirst = dir === 'se';
  const [b0, b1] = backFirst ? [0.06, 0.22] : [0.78, 0.94];
  const back = () => {
    box(c, b0, b1, 0, 0.92, 0, 96, {
      sw: (u, z) => (z > 90 ? WOOD.lighter : z < 26 ? WOOD.mid : backFirst ? WOOD.mid : WOOD.light),
      se: backFirst
        ? (v, z) => (z > 90 || v > 0.86 || v < 0.05 || z < 26 ? WOOD.light : tufted(v, z))
        : (v, z) => (z < 6 ? WOOD.deep : z > 90 ? WOOD.light : Math.floor(v * 40) % 9 === 0 ? WOOD.dark : WOOD.mid),
      top: () => WOOD.lighter,
    });
  };
  if (backFirst) back();
  box(c, 0.08, 0.92, 0, 0.92, 0, 20, { sw: (u, z) => (z < 5 ? WOOD.deep : WOOD.mid), se: (v, z) => (z < 5 ? WOOD.deep : WOOD.dark) });
  box(c, 0.08, 0.92, 0, 0.92, 20, 28, { sw: () => RED.dark, se: () => RED.dark, top: (u, v) => tufted(v, u * 20 + 40) === RED.mid ? RED.top : tufted(v, u * 20 + 40) });
  if (!backFirst) back();
  return done(c);
}

// ボックス席のテーブル（1マス。1本脚の四角い天板、上に花瓶とランプ）
function boothTableDots() {
  const c = iso(0, 1, 0, 1, 80);
  const { P } = c;
  leg(c, P(0.5, 0.5, 0), P(0.5, 0.5, 42), 6, WOOD.mid);
  box(c, 0.16, 0.84, 0.1, 0.86, 40, 45, { sw: () => '#3e2414', se: () => '#3e2414', top: (u, v, x, y) => ((x + y * 3) % 19 === 0 ? '#7a4e30' : '#5e3a22') });
  c.d.finish();
  const items = iso(0, 1, 0, 1, 80);
  tableItems(items, 0.5, 0.5, 45);
  items.d.finish();
  const a = c.d.result();
  const b = items.d.result();
  return { dots: a.map((r, y) => r.map((col, x) => b[y][x] ?? col)), ax: c.ax, ay: c.ay };
}

// 天井から下がるランタン（参考：窓のそばとバーの上。真鍮の枠に暖かい光）
function pendantDots() {
  const c = iso(0, 1, 0, 1, CAFE.wallH);
  const { d, P } = c;
  const [x, y] = P(0.5, 0.5, 176);
  const [, yt] = P(0.5, 0.5, CAFE.wallH - 12);
  d.stroke(Array.from({ length: Math.round(y - 14 - yt) }, (_, k) => [Math.round(x), Math.round(yt + k)]), WOOD.dark);
  d.fill(poly([[x - 6, y - 14], [x + 6, y - 14], [x + 4, y - 18], [x - 4, y - 18]]), flat(WOOD.brass), { group: 'cap' });
  d.fill(poly([[x - 6, y - 14], [x + 6, y - 14], [x + 5, y + 4], [x - 5, y + 4]]), (px, py) => (Math.abs(px - x) < 1 ? WOOD.brassDark : py > y - 4 ? '#f2b452' : '#ffe7a8'), { group: 'glass' });
  d.fill(poly([[x - 5, y + 4], [x + 5, y + 4], [x, y + 9]]), flat(WOOD.brass), { group: 'base' });
  return done(c);
}

// 蓄音機（木の戸棚の上に、黒いレコードと真鍮の大きなラッパ）
function gramophoneDots() {
  const c = iso(0, 1, 0, 1, 120);
  const { d, P } = c;
  box(c, 0.15, 0.85, 0.15, 0.8, 0, 50, {
    sw: (u, z) => (z < 5 ? WOOD.deep : Math.abs(u - 0.5) < 0.02 ? WOOD.deep : (z > 8 && z < 44 && Math.abs(u - 0.5) > 0.06 && u > 0.2 && u < 0.8 ? '#4a2c1a' : WOOD.mid)),
    se: (v, z) => (z < 5 ? WOOD.deep : WOOD.dark),
    top: () => WOOD.light,
  });
  const [rx, ry] = P(0.45, 0.5, 50);
  d.fill(ellipse(rx, ry - 2, 13, 6), (x, y) => (Math.hypot((x - rx) / 2, y - ry + 2) < 2 ? '#c0392b' : (x + y) % 5 === 0 ? '#3a3632' : '#1e1a18'), { group: 'disc' });
  const [bx, by] = P(0.62, 0.42, 54);
  const bell = [bx + 6, by - 46];
  d.fill(poly([[bx - 2, by], [bx + 2, by], [bell[0] + 12, bell[1] + 6], [bell[0] - 12, bell[1] + 2]]), (x, y) => (x < (bx + bell[0]) / 2 ? WOOD.brassLight : WOOD.brass), { group: 'horn' });
  d.fill(ellipse(bell[0], bell[1] + 2, 16, 11, -15), flat(WOOD.brass), { group: 'bell' });
  d.fill(ellipse(bell[0] + 1, bell[1] + 2, 11, 7, -15), (x, y) => (y < bell[1] ? '#5a3c18' : '#7a5420'), { group: 'bellIn' });
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
  gramophone: () => gramophoneDots(),
  pendant: () => pendantDots(),
};
