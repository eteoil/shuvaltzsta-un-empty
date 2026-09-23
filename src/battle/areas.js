// 攻撃範囲の形。Pattern の payload.area で名前を指定する（憲法⑨）。
// from は攻撃する敵のマス、dir はプレイヤーへ向かう4方向の1歩
const SHAPES = {
  front1: ({ i, j }, { di, dj }) => [[i + di, j + dj]],
  front3: ({ i, j }, { di, dj }) => [[i + di, j + dj], [i + di - dj, j + dj + di], [i + di + dj, j + dj - di]],
  line3: ({ i, j }, { di, dj }) => [1, 2, 3].map((k) => [i + di * k, j + dj * k]),
  around: ({ i, j }) => ring(i, j, 1),
  around2: ({ i, j }) => ring(i, j, 2),
};

// 距離 r 以内のマス（自分のマスは除く）
function ring(i, j, r) {
  const out = [];
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) if (a || b) out.push([i + a, j + b]);
  return out;
}

export function areaTiles(shape, from, dir) {
  return (SHAPES[shape] ?? SHAPES.front1)(from, dir);
}
