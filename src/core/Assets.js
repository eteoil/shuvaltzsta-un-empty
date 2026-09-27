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
        if (!src) continue;   // 絵がまだ無い（仮の絵を描く）
        jobs.push(loadImage(src).then((img) => this.images.set(`${key}/${frame}`, img)));
      }
      // モーションは向きごとに横並びのシート。1コマずつ切り出して「walk_se_2」のような名前で持つ
      for (const [anim, a] of Object.entries(def.anims ?? {})) {
        if (!a.src) continue;   // シートが無い（仮の絵のコマをその場で描く）
        for (const dir of Object.keys(def.frames)) {
          jobs.push(loadImage(a.src.replace('{dir}', dir)).then((sheet) => {
            if (!sheet) return;
            const [w, h] = a.size;
            for (let n = 0; n < a.count; n++) {
              const c = canvasOf(w, h);
              c.getContext('2d').drawImage(sheet, n * w, 0, w, h, 0, 0, w, h);
              this.images.set(`${key}/${anim}_${dir}_${n}`, c);
            }
          }));
        }
      }
    }
    await Promise.all(jobs);
  }

  // モーションの n コマ目と、その描き方（大きさ・足元の位置）。シートが無ければ静止画で代用する。
  // src の無いモーション（オオカミ）は、仮の絵のコマ（「run_se_2」）をその場で描く
  pose(key, dir, anim = null, n = 0, palette = null) {
    const def = this.defs[key];
    const a = anim ? def.anims?.[anim] : null;
    if (a) {
      const frame = `${anim}_${dir}_${((n % a.count) + a.count) % a.count}`;
      if (this.images.get(`${key}/${frame}`) || (!a.src && def.placeholder)) return { img: this.get(key, frame, palette), def: a };
    }
    return { img: this.get(key, dir, palette), def };
  }

  frameCount(key, anim) {
    return this.defs[key].anims?.[anim]?.count ?? 1;
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
  slime: '#5fbf5a', slimeDark: '#2f7a3a', slimeShine: '#d8f5c8',
  wolf: '#7c84a0', wolfDark: '#4e5470', wolfLight: '#c4cade', eye: '#f5c939', fang: '#ffffff',
};

function placeholder(def, frame) {
  const [w, h] = def.size;
  const c = canvasOf(w, h);
  const g = c.getContext('2d');
  if (def.placeholder === 'block') drawBlock(g, w, h);
  else if (def.placeholder === 'figure') drawFigure(g, w, h, frame);
  else if (def.placeholder === 'slime') drawSlime(g, w, h, frame);
  else if (def.placeholder === 'wolf') drawWolf(g, w, h, frame);
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

// ぷるんとした半円のドット絵（1文字＝1ドット、表示は3倍）。正面（南東・南西）だけ目を描き、向いている側へ寄せる。
// o 輪郭・g 体・d 影・s 光・. 透明
const SLIME = [
  '......oooooooo......',
  '....oggggggggggo....',
  '...ogssgggggggggo...',
  '..ogssgggggggggggo..',
  '.ogsggggggggggggggo.',
  '.oggggggggggggggggo.',
  'oggggggggggggggggggo',
  'oggggggggggggggggggo',
  'oggggggggggggggggggo',
  'oddddddddddddddddddo',
  '.oooooooooooooooooo.',
];
const SLIME_COLORS = { o: BASE.line, g: BASE.slime, d: BASE.slimeDark, s: BASE.slimeShine };

function drawSlime(g, w, h, frame) {
  const scale = 3;
  const cols = SLIME[0].length;
  const left = Math.round(w / 2 - (cols * scale) / 2);
  const top = h - 4 - SLIME.length * scale;
  SLIME.forEach((row, j) => [...row].forEach((c, i) => {
    if (c === '.') return;
    g.fillStyle = SLIME_COLORS[c];
    g.fillRect(left + i * scale, top + j * scale, scale, scale);
  }));
  if (frame.startsWith('s')) {
    const eye = frame.endsWith('e') ? 10 : 6;
    g.fillStyle = BASE.line;
    for (const i of [eye, eye + 3]) g.fillRect(left + i * scale, top + 5 * scale, scale, scale * 2);
  }
}

// オオカミ（1ドット＝2px）。frame は向き（「se」）か、モーションのコマ（「run_se_2」「attack_nw_1」）。
// 右向きに組み立て、西向き（nw・sw）は左右を反転する。形は図形を塗ってから、まわりに輪郭を付ける。
// run：4コマで脚を前後に（2・4コマ目は脚を上げて体が1ドット浮く）。
// attack：0 構え（頭を下げて体を引く）・1 飛びかかる（前へ2ドット、口を開けて牙）・2 噛みつく
const WOLF_COLORS = { f: BASE.wolf, d: BASE.wolfDark, l: BASE.wolfLight, o: BASE.line, e: BASE.eye, w: BASE.fang };

function wolfDots(anim, n) {
  const W = 32;
  const H = 24;
  const m = Array.from({ length: H }, () => Array(W).fill(null));
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) m[y][x] = c; };
  const ell = (cx, cy, rx, ry, c) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, c);
  };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
  let dx = 0;
  let dy = 0;
  let head = 0;
  let open = false;
  let tail = 0;
  let legs = [0, 0, 0, 0];
  let lift = [0, 0, 0, 0];
  if (anim === 'run') {
    const k = n % 4;
    dy = k % 2 ? -1 : 0;
    legs = [[1, -1, -1, 1], [0, 0, 0, 0], [-1, 1, 1, -1], [0, 0, 0, 0]][k];
    lift = [[0, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 0], [0, 1, 0, 1]][k];
    tail = k % 2;
  } else if (anim === 'attack') {
    if (n === 0) { dx = -1; dy = 1; head = 1; tail = 1; }
    if (n === 1) { dx = 2; open = true; legs = [2, 1, -1, -2]; }
    if (n === 2) { dx = 1; open = true; legs = [1, 1, 0, 0]; }
  }
  // 脚（後ろ脚 2本・前脚 2本。奥の脚は暗く）
  [8, 11, 19, 22].forEach((x, k) => rect(x + dx + legs[k], 13 + dy, x + dx + legs[k] + 1, 21 - lift[k], k % 2 ? 'd' : 'f'));
  // ふさふさのしっぽ（胴から左上へ）
  for (const [x, y, r] of [[8, 9.5, 1.8], [6.5, 8.5, 2], [5, 7.5, 2], [3.5, 6.5, 1.7], [2.3, 5.8, 1.2]]) ell(x + dx, y + dy + tail, r, r * 0.85, 'f');
  ell(15 + dx, 11 + dy, 8.5, 4.2, 'f');          // 胴
  ell(21 + dx, 9 + dy + head, 3.6, 4.2, 'f');    // 胸と首
  const hy = 6 + dy + head;
  ell(24 + dx, hy, 3.6, 3.0, 'f');               // 頭
  rect(26 + dx, hy - 1, 29 + dx, hy + 1, 'f');   // 口先
  if (open) {
    rect(26 + dx, hy + 1, 29 + dx, hy + 1, null);
    rect(27 + dx, hy + 2, 29 + dx, hy + 2, 'f');
  }
  rect(22 + dx, hy - 4, 22 + dx, hy - 2, 'f');   // 耳
  rect(23 + dx, hy - 3, 23 + dx, hy - 2, 'f');
  rect(24 + dx, hy - 5, 24 + dx, hy - 2, 'f');
  rect(25 + dx, hy - 4, 25 + dx, hy - 2, 'f');
  // 胴の下の影と、喉の明るいところ
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m[y][x] !== 'f') continue;
    if (y >= 14 + dy && y <= 15 + dy && x >= 9 + dx && x <= 21 + dx) m[y][x] = 'd';
    else if (((x + 0.5 - (23 + dx)) / 1.8) ** 2 + ((y + 0.5 - (10 + dy + head)) / 2.2) ** 2 <= 1) m[y][x] = 'l';
  }
  put(29 + dx, hy - 1, 'o');   // 鼻
  put(25 + dx, hy - 1, 'e');   // 目
  if (open) { put(27 + dx, hy + 1, 'w'); put(29 + dx, hy + 1, 'w'); }   // 牙
  // 輪郭：塗った所の上下左右にある空きを線にする（牙のまわりは線にしない）
  const out = m.map((r) => r.slice());
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (m[y][x]) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => m[y + b]?.[x + a] && m[y + b][x + a] !== 'w')) out[y][x] = 'o';
  }
  return out;
}

function drawWolf(g, w, h, frame) {
  const parts = frame.split('_');
  const [anim, dir, n] = parts.length === 3 ? [parts[0], parts[1], Number(parts[2])] : [null, frame, 0];
  const dots = wolfDots(anim, n);
  const scale = 2;
  const cols = dots[0].length;
  const left = Math.round(w / 2 - (cols * scale) / 2);
  const top = h - 8 - 22 * scale;   // 足の裏（22行目）が画像の下から8pxのところ
  const flip = dir.endsWith('w');
  dots.forEach((row, j) => row.forEach((c, i) => {
    if (!c) return;
    g.fillStyle = WOLF_COLORS[c];
    g.fillRect(left + (flip ? cols - 1 - i : i) * scale, top + j * scale, scale, scale);
  }));
}
