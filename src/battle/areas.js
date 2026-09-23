// 攻撃範囲の形。Pattern の payload.area で名前を指定する（憲法⑨）。
// from は攻撃する敵のマス、dir はプレイヤーへ向かう4方向の1歩
const SHAPES = {
  front1: ({ i, j }, { di, dj }) => [[i + di, j + dj]],
  front3: ({ i, j }, { di, dj }) => [[i + di, j + dj], [i + di - dj, j + dj + di], [i + di + dj, j + dj - di]],
  line3: ({ i, j }, { di, dj }) => [1, 2, 3].map((k) => [i + di * k, j + dj * k]),
  around: ({ i, j }) => [-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => [i + a, j + b])).filter(([x, y]) => x !== i || y !== j),
};

export function areaTiles(shape, from, dir) {
  return (SHAPES[shape] ?? SHAPES.front1)(from, dir);
}
