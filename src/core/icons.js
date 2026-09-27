// 探索マップに落ちている物の仮のドット絵（本番の絵ができたら data/sprites.json の画像へ移す）。
// 1文字＝1ドット、'.' は透明。表示は2倍
const SCALE = 2;
const PALETTE = {
  g: '#5fbf5a', r: '#d8394f', R: '#ff8a9a',
  b: '#a8643a', B: '#c98452', w: '#f3e6cf', s: '#efe0c2',
  h: '#3f9e6a', H: '#8fe07a', t: '#6b4a2a',
};
const ICONS = {
  wild_berry: [
    '....g....',
    '...ggg...',
    '..g.g.g..',
    '.rRr.rRr.',
    '.rrr.rrr.',
    '..rrRr...',
    '...rrr...',
    '....r....',
  ],
  antidote: [
    '.H....H.',
    'hHh..hHh',
    'hhHhhHhh',
    '.hhHHhh.',
    '..hHHh..',
    '...hh...',
    '...tt...',
    '..t..t..',
  ],
  mushroom: [
    '..bbbb..',
    '.bwBBwb.',
    'bBBBBBBb',
    'bwBBBBwb',
    '..ssss..',
    '..ssss..',
    '..ssss..',
    '...ss...',
  ],
};

function dots(g, rows, x, y, color) {
  rows.forEach((row, j) => {
    [...row].forEach((c, i) => {
      if (c === '.') return;
      g.fillStyle = color ?? PALETTE[c];
      g.fillRect(x + i * SCALE, y + j * SCALE, SCALE, SCALE);
    });
  });
}

// (x, y) は置いてあるマスの中心。ms で少し上下に揺らし、ときどき光らせる（演出）
export function drawPickup(g, item, x, y, ms) {
  const rows = ICONS[item] ?? ICONS.wild_berry;
  const w = rows[0].length * SCALE;
  const h = rows.length * SCALE;
  const bob = Math.round(Math.sin(ms / 300) * 1.5);
  const left = Math.round(x - w / 2);
  const top = Math.round(y - h + 2 + bob);
  g.fillStyle = 'rgba(11,12,24,0.45)';
  g.beginPath();
  g.ellipse(x, y + 2, w / 2, 4, 0, 0, Math.PI * 2);
  g.fill();
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) dots(g, rows, left + dx * SCALE, top + dy * SCALE, '#0b0c18');
  dots(g, rows, left, top);
  if (Math.floor(ms / 180) % 12 === 0) {
    g.fillStyle = '#fff6c8';
    g.fillRect(left + w - 2, top - 4, 2, 6);
    g.fillRect(left + w - 4, top - 2, 6, 2);
  }
}
