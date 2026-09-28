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

// オオカミ（1ドット＝2px。64×48 ドットで、スライムのおよそ2倍の大きさ）。frame は向き（「se」）か、
// モーションのコマ（「run_se_2」「attack_nw_1」）。右向きに組み立て、西向き（nw・sw）は左右を反転する。
// 形は図形を塗ってから、まわりに1ドットの輪郭を付ける。
// 脚は「付け根 → 膝 → 足先」の2本の線（太さ4ドット）で、立ちポーズ以外は膝で曲げる（後ろ脚は膝が後ろ、前脚は膝が前）。
// 耳は頭に重ねた三角形なので、頭が動いても離れない。しっぽは付け根から先へ太さを細らせた曲線で、歩くと上下に振る。
// run：トロット（対角の脚がペアで動く：手前の前脚＋奥の後ろ脚、奥の前脚＋手前の後ろ脚）。
//   脚はそれぞれ「着く（前へ伸ばして着地）→ 支える（真下）→ 蹴る（後ろへ伸ばす）→ 運ぶ（曲げて持ち上げ、前へ）」を回し、
//   2つのペアは半周ずれる。2・4コマ目は体が1ドット浮く。
// attack：0 構え（脚を曲げて沈み、頭を下げ、しっぽを下げる）・1 飛びかかる（前へ、前脚を前へ・後ろ脚を後ろへ伸ばし、口を開けて牙）・2 噛みつく
const WOLF_COLORS = { f: BASE.wolf, d: BASE.wolfDark, l: BASE.wolfLight, o: BASE.line, e: BASE.eye, w: BASE.fang };
const WOLF_W = 64;        // 体の組み立てに使う広さ（座標はこの中で考える）
const WOLF_H = 48;
const WOLF_GROUND = 43;   // 足の裏の行
// 体が浮いたときの耳の先や、構えたときのしっぽの先が 64×48 の外へ出ても途切れないよう、まわりに余白を足した広さで描く
const WOLF_PAD_X = 6;     // 左右それぞれ
const WOLF_PAD_TOP = 8;

function wolfDots(anim, n) {
  // m は余白を含めた広さ。座標 (x, y) は m[y + WOLF_PAD_TOP][x + WOLF_PAD_X]（x・y は負にもなる）
  const X0 = -WOLF_PAD_X;
  const X1 = WOLF_W + WOLF_PAD_X;
  const Y0 = -WOLF_PAD_TOP;
  const Y1 = WOLF_H;
  const m = Array.from({ length: Y1 - Y0 }, () => Array(X1 - X0).fill(null));
  const get = (x, y) => m[y - Y0]?.[x - X0] ?? null;
  const put = (x, y, c) => { if (x >= X0 && x < X1 && y >= Y0 && y < Y1) m[y - Y0][x - X0] = c; };
  const each = (f) => { for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) f(x, y); };
  const ell = (cx, cy, rx, ry, c) => {
    each((x, y) => { if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1) put(x, y, c); });
  };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };
  const tri = (a, b, c, col) => {
    const side = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    each((x, y) => {
      const pt = [x + 0.5, y + 0.5];
      const s1 = side(a, b, pt);
      const s2 = side(b, c, pt);
      const s3 = side(c, a, pt);
      if ((s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0)) put(x, y, col);
    });
  };
  let dx = 0;      // 体の前後
  let dy = 0;      // 体の上下
  let head = 0;    // 頭の下げ
  let open = false;
  let wag = 0;     // しっぽの先の上下（+ で下）
  // 脚ごとに [膝のずれ, 足先のずれ, 足先の持ち上げ]（右向きで前が +）。並びは 手前の後ろ脚・奥の後ろ脚・手前の前脚・奥の前脚
  const STAND = [0, 0, 0];
  let legs = [STAND, STAND, STAND, STAND];
  if (anim === 'run') {
    const k = n % 4;
    dy = k % 2 ? -1 : 0;
    wag = [-4, 0, 4, 0][k];
    // 脚の1周ぶんの形。0 着く・1 支える・2 蹴る・3 運ぶ
    const FRONT = [[2, 4, 0], [0, 0, 0], [-2, -4, 0], [3, -1, 6]];   // 運ぶときは手首を後ろへ折る
    const HIND = [[2, 3, 0], [-2, 0, 0], [-2, -4, 0], [2, 0, 6]];    // 支えるときは膝が後ろ（かかと）
    const a = k;             // 手前の前脚・奥の後ろ脚
    const b = (k + 2) % 4;   // 奥の前脚・手前の後ろ脚
    legs = [HIND[b], HIND[a], FRONT[a], FRONT[b]];
  } else if (anim === 'attack') {
    if (n === 0) { dx = -2; dy = 2; head = 2; wag = 6; legs = [[-4, -2, 0], [-4, 0, 0], [2, 0, 0], [2, 2, 0]]; }
    if (n === 1) { dx = 4; open = true; wag = -2; legs = [[-4, -8, 2], [-2, -6, 0], [4, 6, 2], [2, 6, 0]]; }
    if (n === 2) { dx = 2; open = true; wag = 0; legs = [[-2, -4, 0], [-2, -2, 0], [2, 2, 0], [0, 2, 0]]; }
  }
  // 太さ4ドットの線を上から下へ（1行ごとに横へずらす）
  const line = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) {
      const x = Math.round(x0 + ((x1 - x0) * (y - y0)) / Math.max(1, y1 - y0));
      rect(x, y, x + 3, y, c);
    }
  };
  // 脚（奥の脚を先に、暗く描く）。足先は1ドット前へ出す
  [1, 3, 0, 2].forEach((k) => {
    const x = [15, 21, 37, 43][k] + dx;
    const [knee, paw, lift] = legs[k];
    const top = 26 + dy;
    const bottom = WOLF_GROUND - lift;
    const kneeY = Math.min(35, bottom - 4);
    const c = k % 2 ? 'd' : 'f';
    line(x, top, x + knee, kneeY, c);
    line(x + knee, kneeY, x + paw, bottom, c);
    rect(x + paw, bottom, x + paw + 4, bottom, c);
  });
  // しっぽ：付け根から後ろ下がりに、ふさふさの円を並べる（先は wag で上下に振る）
  const base = [16 + dx, 18 + dy];
  const ctrl = [8 + dx, 17 + dy + wag / 2];
  const tip = [3 + dx, 25 + dy + wag];
  for (let t = 0; t <= 1.001; t += 0.05) {
    const x = (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * tip[0];
    const y = (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * tip[1];
    const r = 3.6 + 1.2 * Math.sin(Math.PI * t) - 1.6 * t;   // 真ん中がふくらみ、先は細い
    ell(x, y, r, r * 0.9, 'f');
  }
  ell(30 + dx, 22 + dy, 17, 8.5, 'f');           // 胴
  ell(42 + dx, 18 + dy + head, 7.2, 8.4, 'f');   // 胸と首
  const hy = 12 + dy + head;
  const hx = 48 + dx;
  ell(hx, hy, 7.2, 6, 'f');                      // 頭
  rect(hx + 4, hy - 2, hx + 10, hy + 2, 'f');    // 口先
  // 耳（頭に重ねた三角形）
  tri([hx - 6, hy - 2], [hx - 1, hy - 3], [hx - 4, hy - 11], 'f');
  tri([hx - 2, hy - 3], [hx + 3, hy - 3], [hx, hy - 12], 'f');
  if (open) {
    rect(hx + 4, hy + 1, hx + 10, hy + 2, null);   // 上あごと下あごのすき間
    rect(hx + 5, hy + 3, hx + 10, hy + 4, 'f');    // 下あご
  }
  // 胴の下の影と、喉の明るいところ、耳の内側
  each((x, y) => {
    if (get(x, y) !== 'f') return;
    if (y >= 28 + dy && y <= 30 + dy && x >= 17 + dx && x <= 42 + dx) put(x, y, 'd');
    else if (((x + 0.5 - (46 + dx)) / 3.6) ** 2 + ((y + 0.5 - (21 + dy + head)) / 4.4) ** 2 <= 1) put(x, y, 'l');
  });
  rect(hx - 1, hy - 8, hx, hy - 4, 'd');         // 耳の内側
  rect(hx + 9, hy - 2, hx + 10, hy - 1, 'o');    // 鼻
  rect(hx + 1, hy - 3, hx + 2, hy - 2, 'e');     // 目
  put(hx + 2, hy - 3, 'o');
  if (open) { rect(hx + 6, hy + 1, hx + 6, hy + 2, 'w'); rect(hx + 9, hy + 1, hx + 9, hy + 2, 'w'); }   // 牙
  // 輪郭：塗った所の上下左右にある空きを線にする（牙のまわりは線にしない）
  const out = m.map((r) => r.slice());
  each((x, y) => {
    if (get(x, y)) return;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => get(x + a, y + b) && get(x + a, y + b) !== 'w')) out[y - Y0][x - X0] = 'o';
  });
  return out;
}

function drawWolf(g, w, h, frame) {
  const parts = frame.split('_');
  const [anim, dir, n] = parts.length === 3 ? [parts[0], parts[1], Number(parts[2])] : [null, frame, 0];
  const dots = wolfDots(anim, n);
  const scale = 2;
  const cols = dots[0].length;   // 余白を含めた幅（左右の余白は同じなので、反転しても体の位置は変わらない）
  const left = Math.round(w / 2 - (cols * scale) / 2);
  const top = h - 8 - (WOLF_PAD_TOP + WOLF_GROUND + 1) * scale;   // 足の裏が画像の下から8pxのところ
  const flip = dir.endsWith('w');
  dots.forEach((row, j) => row.forEach((c, i) => {
    if (!c) return;
    g.fillStyle = WOLF_COLORS[c];
    g.fillRect(left + (flip ? cols - 1 - i : i) * scale, top + j * scale, scale, scale);
  }));
}
