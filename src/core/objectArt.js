// マップに置く物の、コードで描くドット絵（クォータービュー）。1ドット＝1px、線も1ドット。
// 床のマス（80×40 のひし形）と同じ角度の箱として組み立てる。iso(i, j, z) はマスの中心からのずれ
// （i・j はマス単位、z は高さのドット）を絵の中の座標にする。i は右下（南東）、j は左下（南西）へ伸びる。
import { createDots, flat, poly } from './dotArt.js';

const TILE_HALF = [40, 20];   // マスの半分の幅と高さ（data/sprites.json の floor.tile の半分）

// 銀行の出納機。レトロなスチームパンク風：マホガニーの箱を真鍮の縁と鋲で留め、正面に圧力計と琥珀色に光るガラス窓、
// タイプライターのような丸い真鍮のキー、取っ手の付いた引き出し。左の面には銅の管とバルブの輪、上には煙突。
// 正面は南東（+i）を向く（左の壁に並べ、右下から向き合う）。
// 高さは本体 96 ドット（煙突を入れて約 110）で、主人公（約 132 ドット）の肩から頭くらい。幅はマスの 3/4 ほど
export const ATM = { size: [96, 150], anchor: [48, 132] };

const COL = {
  wood: '#6e3b26', woodDark: '#552c1c', woodLight: '#8a5034',
  brass: '#c9a14a', brassLight: '#ecd08a', brassDark: '#8a6a2a',
  copper: '#b8673a', copperLight: '#e39a66', copperDark: '#7e4024',
  iron: '#3d3b42', ironLight: '#5c5963',
  dial: '#efe6cf', needle: '#c0392b', tick: '#5a4a3a',
  glass: '#e8a43a', glassLight: '#ffd98a', glassDark: '#a8661e',
  key: '#f3eee6', slot: '#231815',
};

export function atmDots() {
  const [W, H] = ATM.size;
  const [ax, ay] = ATM.anchor;
  const d = createDots(W, H, { shade: 0 });
  const iso = (i, j, z) => [ax + (i - j) * TILE_HALF[0], ay + (i + j) * TILE_HALF[1] - z];
  const round = ([x, y]) => [Math.round(x), Math.round(y)];
  // 箱（i0〜i1, j0〜j1, z0〜z1）の見える3面：左（南西向き・光が当たる）・正面（南東向き）・上
  const box = (i0, i1, j0, j1, z0, z1, c, opts = {}) => {
    d.fill(poly([iso(i0, j1, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.left), opts);
    d.fill(poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]), flat(c.front), opts);
    d.fill(poly([iso(i0, j0, z1), iso(i1, j0, z1), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.top), opts);
  };
  // 正面（i = i1 の面）の上の四角と円（j・z で書く。円は面に沿ってつぶれる）
  const onFront = (i1, j0, j1, z0, z1) => poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]);
  const frontDisc = (i1, jc, zc, rj, rz) => poly(Array.from({ length: 28 }, (_, k) => {
    const a = (k / 28) * Math.PI * 2;
    return iso(i1, jc + Math.cos(a) * rj, zc + Math.sin(a) * rz);
  }));
  // 左の面（j = j1 の面）の上の四角
  const onLeft = (j1, i0, i1, z0, z1) => poly([iso(i0, j1, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i0, j1, z1)]);
  // 立てた管（(i, j) に立つ太さ w の筒。z0〜z1）
  const pipe = (i, j, z0, z1, w) => {
    const [x0, y0] = iso(i, j, z0);
    const [, y1] = iso(i, j, z1);
    return poly([[x0 - w / 2, y0], [x0 + w / 2, y0], [x0 + w / 2, y1], [x0 - w / 2, y1]]);
  };
  const metal = (c, light, dark, x0) => (x) => (x < x0 ? light : x > x0 + 1 ? dark : c);

  const I0 = -0.3;
  const I1 = 0.2;
  const J = 0.38;
  const wood = { left: COL.woodLight, front: COL.wood, top: COL.woodLight };
  const brass = { left: COL.brassLight, front: COL.brass, top: COL.brassLight };
  const iron = { left: COL.ironLight, front: COL.iron, top: COL.ironLight };

  // 鉄の台と、マホガニーの本体
  box(I0 - 0.03, I1 + 0.03, -J - 0.03, J + 0.03, 0, 7, iron);
  box(I0, I1, -J, J, 7, 82, wood);
  // 真鍮の縁（角の縦の帯と、上下の横の帯）。木の上に重ねるので線は引かない
  const trim = { line: false };
  d.fill(onFront(I1, -J, -J + 0.06, 7, 82), flat(COL.brassDark), trim);
  d.fill(onFront(I1, J - 0.06, J, 7, 82), flat(COL.brass), trim);
  d.fill(onLeft(J, I0, I0 + 0.06, 7, 82), flat(COL.brass), trim);
  d.fill(onFront(I1, -J, J, 7, 10), flat(COL.brassDark), trim);
  d.fill(onLeft(J, I0, I1, 7, 10), flat(COL.brass), trim);
  // 左の面：床から上へ登る銅の管と、バルブの輪
  const PI = -0.06;
  const PJ = J + 0.05;
  const px = Math.round(iso(PI, PJ, 0)[0]);
  d.fill(pipe(PI, PJ, 4, 86, 6), metal(COL.copper, COL.copperLight, COL.copperDark, px - 1));
  for (const z of [16, 38, 66]) d.fill(pipe(PI, PJ, z, z + 3, 8), metal(COL.brass, COL.brassLight, COL.brassDark, px - 2));
  // 上の真鍮の冠（少し張り出す）と、その上の段
  box(I0 - 0.03, I1 + 0.03, -J - 0.03, J + 0.03, 82, 89, brass);
  box(I0 + 0.05, I1 - 0.04, -J + 0.08, J - 0.08, 89, 93, { left: COL.woodLight, front: COL.wood, top: COL.brassLight });
  // 煙突（奥から立つ銅の管と、頭の輪）
  const [cx] = iso(-0.16, 0.12, 0);
  d.fill(pipe(-0.16, 0.12, 92, 106, 5), metal(COL.copper, COL.copperLight, COL.copperDark, Math.round(cx) - 1));
  d.fill(pipe(-0.16, 0.12, 106, 109, 7), metal(COL.brass, COL.brassLight, COL.brassDark, Math.round(cx) - 2));

  // 正面：圧力計（真鍮の縁の丸い文字盤）
  d.fill(frontDisc(I1, 0, 72, 0.2, 8), flat(COL.brass, COL.brassDark));
  d.fill(frontDisc(I1, 0, 72, 0.15, 6), flat(COL.dial));
  // 正面：琥珀色に光るガラス窓（真鍮の枠）
  d.fill(onFront(I1, -0.27, 0.27, 50, 62), flat(COL.brassDark));
  d.fill(onFront(I1, -0.23, 0.23, 52, 60), (x, y) => (y % 3 === 0 ? COL.glassLight : COL.glass), { line: false });
  // キーの台（正面から手前へ張り出す真鍮の台）
  box(I1, I1 + 0.18, -0.3, 0.3, 40, 46, brass);
  // カードの差し込み口と、引き出し（取っ手は真鍮）
  d.fill(onFront(I1, 0.06, 0.26, 33, 35), flat(COL.slot));
  d.fill(onFront(I1, -0.27, 0.27, 14, 28), flat(COL.woodDark));
  d.finish();

  // 鋲（真鍮の縁と冠に、一定の間隔で光る点）
  for (let z = 14; z <= 78; z += 10) {
    d.put(...round(iso(I1, -J + 0.03, z)), COL.brassLight);
    d.put(...round(iso(I1, J - 0.03, z)), COL.brassLight);
    d.put(...round(iso(I0 + 0.03, J, z)), COL.brassLight);
  }
  for (let j = -0.3; j <= 0.31; j += 0.1) d.put(...round(iso(I1 + 0.03, j, 85)), COL.brassDark);
  for (let i = I0 + 0.02; i <= I1; i += 0.1) d.put(...round(iso(i, J + 0.03, 85)), COL.brassDark);
  // 圧力計の目盛りと針（左上を指す）
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * (0.75 + (k / 7) * 1.5);
    d.put(...round(iso(I1, Math.cos(a) * 0.13, 72 + Math.sin(a) * 5)), COL.tick);
  }
  for (let t = 0; t <= 1; t += 0.2) d.put(...round(iso(I1, 0.1 * t, 72 + 3.5 * t)), COL.needle);
  d.put(...round(iso(I1, 0, 72)), COL.tick);
  // ガラス窓の中の数字の影（2行）
  for (const [z, j0, j1] of [[57, -0.16, 0.16], [54, -0.16, 0.06]]) {
    for (let j = j0; j <= j1; j += 0.05) d.put(...round(iso(I1, -j, z)), COL.glassDark);
  }
  // キー（台の上に、丸い白いキーを2列）
  for (const i of [I1 + 0.06, I1 + 0.13]) {
    for (const j of [-0.2, -0.07, 0.06, 0.19]) {
      const [x, y] = round(iso(i, j, 46));
      d.put(x, y, COL.key);
      d.put(x + 1, y, COL.brassDark);
    }
  }
  // 引き出しの取っ手と、バルブの輪
  for (let j = -0.1; j <= 0.1; j += 0.025) d.put(...round(iso(I1, j, 21)), COL.brassLight);
  const [vx, vy] = round(iso(PI, PJ, 52));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    d.put(Math.round(vx + Math.cos(a) * 4), Math.round(vy + Math.sin(a) * 4), COL.needle);
  }
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) d.put(vx + dx, vy + dy, COL.copperDark);
  d.put(vx, vy, COL.brassLight);
  return d.result();
}
