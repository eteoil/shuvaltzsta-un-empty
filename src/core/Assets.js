import { loadJSON } from './Data.js';

export const WHITE = { id: '__white', all: '#ffffff' };

const loadImage = (src) => new Promise((ok) => {
  const img = new Image();
  img.onload = () => ok(img);
  img.onerror = () => ok(null);
  img.src = src;
});

const hex = (r, g, b) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

// 画像が無いものは、同じ大きさ・同じ基本色のプレースホルダーを描いて返す（憲法⑩）
export class Assets {
  constructor() {
    this.defs = {};
    this.images = new Map();
    this.cache = new Map();
  }

  async loadSprites(url) {
    this.defs = await loadJSON(url);
    const jobs = [];
    for (const [key, def] of Object.entries(this.defs)) {
      for (const [frame, src] of Object.entries(def.frames)) {
        jobs.push(loadImage(src).then((img) => this.images.set(`${key}/${frame}`, img)));
      }
    }
    await Promise.all(jobs);
  }

  def(key) {
    return this.defs[key];
  }

  get(key, frame, palette = null) {
    const id = `${key}/${frame}/${palette?.id ?? ''}`;
    if (!this.cache.has(id)) {
      let img = palette ? this.get(key, frame) : this.images.get(`${key}/${frame}`);
      if (!img) img = placeholder(this.defs[key], frame);
      if (palette) img = recolor(img, palette);
      this.cache.set(id, img);
    }
    return this.cache.get(id);
  }
}

function canvasOf(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function recolor(src, palette) {
  const c = canvasOf(src.width, src.height);
  const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const map = new Map(Object.entries(palette.map || {}).map(([k, v]) => [k.toLowerCase(), rgb(v)]));
  const all = palette.all ? rgb(palette.all) : null;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const to = all || map.get(hex(d[i], d[i + 1], d[i + 2]));
    if (to) [d[i], d[i + 1], d[i + 2]] = to;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// 仮の絵。色は本番のドット絵と同じ基本色を使うので、色替え（palette）もそのまま効く
const BASE = {
  hair: '#394660', skin: '#feebc8', line: '#231815', top: '#187fc4', bottom: '#801e6b',
  floorTop: '#97b8c0', floorL: '#858ba7', floorR: '#866b92', floorLine: '#440e36',
};

function placeholder(def, frame) {
  const [w, h] = def.size;
  const c = canvasOf(w, h);
  const g = c.getContext('2d');
  if (def.placeholder === 'block') drawBlock(g, w, h);
  else drawFigure(g, w, h, frame);
  return c;
}

function drawBlock(g, w, h) {
  const hw = w / 2;
  const th = w / 4;
  const poly = (pts, fill) => {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
  };
  poly([[0, th], [hw, th * 2], [hw, h], [0, h - th]], BASE.floorL);
  poly([[w, th], [hw, th * 2], [hw, h], [w, h - th]], BASE.floorR);
  poly([[hw, 0], [w, th], [hw, th * 2], [0, th]], BASE.floorTop);
  g.strokeStyle = BASE.floorLine;
  g.strokeRect(hw - 8, th - 4, 16, 8);
}

function drawFigure(g, w, h, frame) {
  const front = frame === 'se' || frame === 'sw';
  const cx = w / 2;
  const box = (x, y, bw, bh, fill) => {
    g.fillStyle = BASE.line;
    g.fillRect(x - 1, y - 1, bw + 2, bh + 2);
    g.fillStyle = fill;
    g.fillRect(x, y, bw, bh);
  };
  box(cx - 22, 4, 44, 52, BASE.hair);
  if (front) box(cx - 14, 26, 28, 24, BASE.skin);
  box(cx - 16, 60, 32, 30, BASE.top);
  box(cx - 26, 62, 8, 34, BASE.skin);
  box(cx + 18, 62, 8, 34, BASE.skin);
  box(cx - 16, 90, 32, 16, BASE.bottom);
  box(cx - 12, 106, 9, 20, BASE.bottom);
  box(cx + 3, 106, 9, 20, BASE.bottom);
  box(cx - 18, 126, 16, 8, BASE.hair);
  box(cx + 2, 126, 16, 8, BASE.hair);
  // 向きの矢印（北東・北西は背面、南東・南西は正面）
  const dx = frame.endsWith('e') ? 1 : -1;
  const dy = frame.startsWith('n') ? -1 : 1;
  g.fillStyle = BASE.line;
  g.font = '10px monospace';
  g.textAlign = 'center';
  g.fillText(frame.toUpperCase(), cx, 78);
  g.fillRect(cx + dx * 6, 46 + dy * 4, 3, 3);
}
