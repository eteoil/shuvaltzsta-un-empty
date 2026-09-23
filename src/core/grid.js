// 十字ボタンと等角グリッドの対応。上＝北東、右＝南東、下＝南西、左＝北西
export const DIRS = {
  up: { di: 0, dj: -1, face: 'ne' },
  right: { di: 1, dj: 0, face: 'se' },
  down: { di: 0, dj: 1, face: 'sw' },
  left: { di: -1, dj: 0, face: 'nw' },
};

export const FACE_STEP = Object.fromEntries(Object.values(DIRS).map((d) => [d.face, d]));

export const distance = (a, b) => Math.max(Math.abs(a.i - b.i), Math.abs(a.j - b.j));

// 差の大きい軸だけを見た4方向の1歩
export function stepToward(from, to) {
  const di = to.i - from.i;
  const dj = to.j - from.j;
  if (!di && !dj) return { di: 0, dj: 0 };
  return Math.abs(di) >= Math.abs(dj) ? { di: Math.sign(di), dj: 0 } : { di: 0, dj: Math.sign(dj) };
}

export function faceToward(from, to) {
  const s = stepToward(from, to);
  if (s.di > 0) return 'se';
  if (s.di < 0) return 'nw';
  if (s.dj > 0) return 'sw';
  return 'ne';
}
