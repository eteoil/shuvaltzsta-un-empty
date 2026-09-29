// マップに置く物の、コードで描くドット絵（クォータービュー）。1ドット＝1px、線も1ドット。
// 床のマス（80×40 のひし形）と同じ角度の箱として組み立てる。iso(i, j, z) はマスの中心からのずれ
// （i・j はマス単位、z は高さのドット）を絵の中の座標にする。i は右下（南東）、j は左下（南西）へ伸びる。
import { createDots, flat, poly } from './dotArt.js';

const TILE_HALF = [40, 20];   // マスの半分の幅と高さ（data/sprites.json の floor.tile の半分）

// 銀行の出納機。正面は南東（+i）を向く（左の壁に並べ、右下から向き合う）。
// 高さは 96 ドットで、主人公（約 132 ドット）の肩から頭くらい。幅はマスの 3/4 ほど
export const ATM = { size: [96, 150], anchor: [48, 132] };

const COL = {
  top: '#c9d1da', left: '#a2adba', front: '#7f8b9b', frontDark: '#6b7686', base: '#505a68',
  sign: '#e0b660', signDark: '#a0742e',
  frame: '#3a4254', screen: '#7bd8c9', screenLight: '#c8f4ec', screenDark: '#4fa89c',
  key: '#f3eee6', slot: '#231815',
};

export function atmDots() {
  const [W, H] = ATM.size;
  const [ax, ay] = ATM.anchor;
  const d = createDots(W, H, { shade: 0 });
  const iso = (i, j, z) => [ax + (i - j) * TILE_HALF[0], ay + (i + j) * TILE_HALF[1] - z];
  // 箱（i0〜i1, j0〜j1, z0〜z1）の見える3面：左（南西向き）・正面（南東向き）・上
  const box = (i0, i1, j0, j1, z0, z1, c) => {
    d.fill(poly([iso(i0, j1, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.left));
    d.fill(poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]), (x, y) => (c.frontDark && y > iso(i1, 0, z0 + 6)[1] ? c.frontDark : c.front));
    d.fill(poly([iso(i0, j0, z1), iso(i1, j0, z1), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.top));
  };
  // 正面（i = i1 の面）の上の四角（j0〜j1, z0〜z1）
  const onFront = (i1, j0, j1, z0, z1) => poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]);

  const I0 = -0.3;
  const I1 = 0.2;
  const J = 0.38;
  // 本体
  box(I0, I1, -J, J, 0, 96, { left: COL.left, front: COL.front, frontDark: COL.base, top: COL.top });
  // 上の看板（金の帯）
  d.fill(onFront(I1, -J, J, 84, 94), flat(COL.sign, COL.signDark));
  // 画面（濃い枠の中に、光る画面）
  d.fill(onFront(I1, -0.28, 0.28, 56, 80), flat(COL.frame));
  d.fill(onFront(I1, -0.24, 0.24, 59, 77), (x, y) => (y % 4 === 0 ? COL.screenLight : COL.screen), { line: false });
  // キーの台（正面から手前へ張り出す）
  box(I1, I1 + 0.2, -0.3, 0.3, 44, 51, { left: COL.left, front: COL.front, top: COL.top });
  // カードの差し込み口と、お金の出口
  d.fill(onFront(I1, 0.08, 0.26, 36, 38), flat(COL.slot));
  d.fill(onFront(I1, -0.22, 0.12, 22, 27), flat(COL.slot));
  d.finish();

  // キー（台の上に 3×2 の白い点）
  for (const i of [I1 + 0.07, I1 + 0.14]) {
    for (const j of [-0.18, -0.06, 0.06, 0.18]) {
      const [x, y] = iso(i, j, 51);
      d.put(Math.round(x), Math.round(y), COL.key);
    }
  }
  // 看板の硬貨の印と、画面の文字の仮の線
  const [sx, sy] = iso(I1, 0, 89);
  d.rect(Math.round(sx) - 1, Math.round(sy) - 2, Math.round(sx) + 1, Math.round(sy) + 2, COL.signDark);
  d.put(Math.round(sx), Math.round(sy), COL.sign);
  for (const [j0, j1, z] of [[-0.18, 0.1, 72], [-0.18, 0.18, 66]]) {
    const [x0, y0] = iso(I1, j1, z);
    const [x1] = iso(I1, j0, z);
    for (let x = Math.round(x0); x <= Math.round(x1); x++) d.put(x, Math.round(y0 - (x - x0) / 2), COL.screenDark);
  }
  return d.result();
}
