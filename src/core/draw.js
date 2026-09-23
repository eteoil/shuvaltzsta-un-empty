export const FONT = '"DotGothic16", ui-monospace, monospace';

export const COLORS = {
  ink: '#e6e5f0',
  muted: '#9294b4',
  dim: '#63668b',
  line: '#343a5e',
  panel: '#1b1e33',
  deep: '#0b0c18',
  signal: '#7bd8c9',
  brass: '#d8ac5a',
  rose: '#de7392',
  perfect: '#f5c939',
  good: '#7bd8c9',
  miss: '#de7392',
  danger: '#ff5f5f',
  unguard: '#c46bff',
  guard: '#6ea8ff',
  open: '#8fe07a',
};

export function text(g, str, x, y, { size = 16, color = COLORS.ink, align = 'left', baseline = 'top', shadow = COLORS.deep, alpha = 1 } = {}) {
  g.save();
  g.globalAlpha = alpha;
  g.font = `${size}px ${FONT}`;
  g.textAlign = align;
  g.textBaseline = baseline;
  if (shadow) {
    g.fillStyle = shadow;
    g.fillText(str, Math.round(x) + 1, Math.round(y) + 1);
  }
  g.fillStyle = color;
  g.fillText(str, Math.round(x), Math.round(y));
  g.restore();
}

// 二重枠のウィンドウ
export function panel(g, x, y, w, h, { fill = COLORS.panel, border = COLORS.ink, alpha = 1 } = {}) {
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = COLORS.deep;
  g.fillRect(x, y, w, h);
  g.fillStyle = border;
  g.fillRect(x + 2, y + 2, w - 4, h - 4);
  g.fillStyle = fill;
  g.fillRect(x + 4, y + 4, w - 8, h - 8);
  g.restore();
}

export function gauge(g, x, y, w, h, ratio, color) {
  g.fillStyle = COLORS.deep;
  g.fillRect(x, y, w, h);
  g.fillStyle = COLORS.line;
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  g.fillStyle = color;
  g.fillRect(x + 1, y + 1, Math.round((w - 2) * Math.max(0, Math.min(1, ratio))), h - 2);
}

export function sprite(g, img, def, x, y, alpha = 1) {
  if (alpha <= 0) return;
  g.save();
  g.globalAlpha = alpha;
  g.drawImage(img, Math.round(x - def.anchor[0]), Math.round(y - def.anchor[1]));
  g.restore();
}

export function diamond(g, x, y, r, fill, stroke) {
  g.beginPath();
  g.moveTo(x, y - r);
  g.lineTo(x + r, y);
  g.lineTo(x, y + r);
  g.lineTo(x - r, y);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.lineWidth = 2; g.strokeStyle = stroke; g.stroke(); }
}

// 等角グリッド。tile は床チップの上面の幅と高さ
export function isoTop(i, j, ox, oy, [tw, th]) {
  return { x: ox + (i - j) * tw / 2, y: oy + (i + j) * th / 2 };
}

export function isoCenter(i, j, ox, oy, tile) {
  const p = isoTop(i, j, ox, oy, tile);
  return { x: p.x, y: p.y + tile[1] / 2 };
}

// 1文字ずつ折り返す（日本語は単語の区切りが無いので）
export function wrap(g, str, maxW, size = 16) {
  g.font = `${size}px ${FONT}`;
  const lines = [];
  let line = '';
  for (const ch of str) {
    if (ch === '\n') { lines.push(line); line = ''; continue; }
    if (g.measureText(line + ch).width > maxW && line) { lines.push(line); line = ''; }
    line += ch;
  }
  if (line) lines.push(line);
  return lines;
}
