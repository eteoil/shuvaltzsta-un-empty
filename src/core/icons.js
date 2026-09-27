import { COLORS, text } from './draw.js';

// マップに置く物のドット絵。画像ファイルは使わずコードで描く（落ちている物はこれが本番の絵）。
// 1文字＝1ドット、'.' は透明。落ちている物は2倍、家具は3倍で表示
const SCALE = 2;
const PALETTE = {
  g: '#5fbf5a', r: '#d8394f', R: '#ff8a9a',
  b: '#a8643a', B: '#c98452', w: '#f3e6cf', s: '#efe0c2',
  h: '#3f9e6a', H: '#8fe07a', t: '#6b4a2a',
  c: '#c9e6f0', j: '#5fbf5a', J: '#d8f5c8',
  o: '#231815', n: '#8a5a3a', p: '#f3e6cf', q: '#5a7fc4', Q: '#8fb0e6',
  m: '#b5523b', M: '#e08a6a',
};
const ICONS = {
  slime_jelly: [
    '..tttt..',
    '...tt...',
    '..cccc..',
    '.cjjjjc.',
    '.cJjjjc.',
    '.cjjjjc.',
    '.cjjjjc.',
    '..cccc..',
  ],
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
  wolf_meat: [
    '....mmm.',
    '...mMMmm',
    '..mMMmmm',
    '..mMmmmm',
    '...mmmm.',
    '..wwmm..',
    '.ww.....',
    'www.....',
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

function dots(g, rows, x, y, color, scale = SCALE) {
  rows.forEach((row, j) => {
    [...row].forEach((c, i) => {
      if (c === '.') return;
      g.fillStyle = color ?? PALETTE[c];
      g.fillRect(x + i * scale, y + j * scale, scale, scale);
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

// マップの出口。床の上で脈打つ菱形の枠と、行き先の名前。locked（まだ通れない）なら灰色
export function drawExit(g, x, y, label, ms, locked = false) {
  const pulse = 0.5 + 0.5 * Math.sin(ms / 260);
  const color = locked ? `rgba(146,148,180,${0.35 + 0.25 * pulse})` : `rgba(123,216,201,${0.45 + 0.45 * pulse})`;
  g.save();
  g.lineWidth = 2;
  g.strokeStyle = color;
  for (const k of [0, 6]) {
    g.beginPath();
    g.moveTo(x, y - 16 + k);
    g.lineTo(x + 34 - k * 2, y);
    g.lineTo(x, y + 16 - k);
    g.lineTo(x - 34 + k * 2, y);
    g.closePath();
    g.stroke();
  }
  g.restore();
  if (label) text(g, label, x, y - 36, { size: 12, align: 'center', color: locked ? COLORS.muted : COLORS.signal });
}

// 家具（マップの npcs に object で置く物）
const OBJECTS = {
  bed: [
    'oo..............',
    'ono.............',
    'onppppqqqqqqqqqo',
    'onppppqQQqqqqqqo',
    'onnnnnqqqqqqqqqo',
    'oqqqqqqqqqqqqqqo',
    'onnnnnnnnnnnnnno',
    'on............no',
    'oo............oo',
  ],
};

// (x, y) は置いてあるマスの中心
export function drawObject(g, kind, x, y) {
  const rows = OBJECTS[kind];
  if (!rows) return;
  const scale = 3;
  const w = rows[0].length * scale;
  const h = rows.length * scale;
  g.fillStyle = 'rgba(11,12,24,0.45)';
  g.beginPath();
  g.ellipse(x, y + 2, w / 2, 7, 0, 0, Math.PI * 2);
  g.fill();
  dots(g, rows, Math.round(x - w / 2), Math.round(y - h + 4), null, scale);
}

// 家具の高さ（名前を上に出すため）
export function objectHeight(kind) {
  return (OBJECTS[kind]?.length ?? 0) * 3;
}
