// バニーキャット（ウサギの耳の二足歩行の猫。駅員のチェルーとドルー）のドット絵。1ドット＝1px、線も1ドット。
// 図形を奥から順に塗り、パーツの境目と外側に1ドットの線を引く。
// 高さは耳の先から足の裏まで約 190 ドットで、主人公（約 130 ドット）の 3/2 くらい。
// 南西（sw）は正面で、顔を少し左へ寄せる。南東（se）はその左右反転。北東（ne）は背中で、北西（nw）はその左右反転。
// 手は下ろし、口は閉じている。帽子・襟・ネクタイ・ボタンは参考画像（チェルー）から、画像に無い脚・しっぽ・背中は想像

export const BUNNY_CAT_SIZE = [112, 208];
export const BUNNY_CAT_ANCHOR = [56, 199];

const LINE = '#231815';

// style ごとの違い。ear は耳の長さを足すドット数（ドルーはチェルーより少し長い）
export const BUNNY_CAT_STYLES = {
  cheru: {
    ear: 0,
    fur: '#8e9a90', furDark: '#6a756d', earIn: '#c9a7b9',
  },
  doru: {
    ear: 10,
    fur: '#c8b48c', furDark: '#9c8a66', earIn: '#e0b0a8',
  },
};

const UNIFORM = {
  cap: '#b3c3d0', capDark: '#8a9cad', capTop: '#d5e0e8',
  band: '#4f5a6c', visor: '#3a4254', visorLight: '#6a768c',
  gold: '#d8ac5a', goldDark: '#9a6f2e',
  jacket: '#8fa9b4', jacketDark: '#6b8490',
  shirt: '#f3eee6', shirtDark: '#cfc6cf',
  tie: '#c86a78', tieDark: '#8e3f52',
  pants: '#56657a', pantsDark: '#414d60',
  eye: '#d6dc4a', eyeDark: '#9ca232', white: '#ffffff', nose: '#c9848e',
};

// 1枚ぶんのドット（[y][x] に色か null）を返す
export function bunnyCatDots(styleId, frame) {
  const st = BUNNY_CAT_STYLES[styleId] ?? BUNNY_CAT_STYLES.cheru;
  const [W, H] = BUNNY_CAT_SIZE;
  const back = frame.startsWith('n');
  const part = Array.from({ length: H }, () => Array(W).fill(0));   // パーツの番号（0 は空き）
  const color = Array.from({ length: H }, () => Array(W).fill(null));
  const parts = [null];   // 番号 → { line }
  const each = (f) => { for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) f(x, y); };
  const inside = (x, y) => x >= 0 && x < W && y >= 0 && y < H;

  // 形（(x, y) → 真偽）を1つのパーツとして塗る。paint(x, y, isEdge) で色を決める
  const fill = (shape, paint, { line = true } = {}) => {
    const id = parts.push({ line }) - 1;
    const mine = [];
    each((x, y) => { if (shape(x + 0.5, y + 0.5)) { part[y][x] = id; mine.push([x, y]); } });
    const has = (x, y) => inside(x, y) && part[y][x] === id;
    // 光は左上から。右と下の縁（3ドット）を影にする
    for (const [x, y] of mine) color[y][x] = paint(x, y, !has(x + 3, y) || !has(x, y + 3));
  };
  const flat = (c, dark = c) => (x, y, edge) => (edge ? dark : c);

  const ellipse = (cx, cy, rx, ry, deg = 0) => {
    const r = (deg * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    return (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * cos + dy * sin;
      const v = -dx * sin + dy * cos;
      return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
    };
  };
  const poly = (pts) => (x, y) => {
    let inPoly = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inPoly = !inPoly;
    }
    return inPoly;
  };
  const any = (...shapes) => (x, y) => shapes.some((s) => s(x, y));
  // 太さ w の線分（腕・しっぽ）
  const capsule = ([x0, y0], [x1, y1], w) => (x, y) => {
    const vx = x1 - x0;
    const vy = y1 - y0;
    const t = Math.max(0, Math.min(1, ((x - x0) * vx + (y - y0) * vy) / (vx * vx + vy * vy)));
    return Math.hypot(x - (x0 + vx * t), y - (y0 + vy * t)) <= w / 2;
  };

  // ---- 耳（帽子と頭の後ろから立つ。内側は薄い色）
  const e = st.ear;
  for (const [cx, deg] of [[38, -12], [76, 14]]) {
    const cy = 46 - e / 2;
    const outer = ellipse(cx, cy, 10, 36 + e / 2, deg);
    const inner = ellipse(cx + (deg < 0 ? 1 : -1), cy + 4, 4.5, 27 + e / 2, deg);
    fill(outer, (x, y, edge) => (!back && inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
  }

  // ---- 脚（ズボン）と足（毛の色）
  fill(any(poly([[38, 174], [53, 174], [52, 192], [39, 192]]), poly([[59, 174], [74, 174], [73, 192], [60, 192]])), flat(UNIFORM.pants, UNIFORM.pantsDark));
  fill(any(ellipse(44, 195, 9, 5), ellipse(68, 195, 9, 5)), flat(st.fur, st.furDark));

  // ---- 胴（上着）
  fill((x, y) => ellipse(56, 154, 27, 28)(x, y) && y < 181, flat(UNIFORM.jacket, UNIFORM.jacketDark));
  if (!back) {
    // 白いシャツの V 字と、赤いネクタイ（蝶結び）
    fill(poly([[43, 128], [69, 128], [56, 162]]), flat(UNIFORM.shirt, UNIFORM.shirtDark));
    fill(any(poly([[44, 131], [56, 136], [44, 142]]), poly([[68, 131], [56, 136], [68, 142]])), flat(UNIFORM.tie, UNIFORM.tieDark));
    fill(any(ellipse(56, 136, 3.5, 3.5), poly([[53, 138], [59, 138], [60, 150], [56, 154], [52, 150]])), flat(UNIFORM.tie, UNIFORM.tieDark));
  }

  // ---- 腕（袖は上着の色。手は下ろして、先に毛の色の手）
  fill(any(capsule([33, 136], [27, 166], 13), capsule([79, 136], [85, 166], 13)), flat(UNIFORM.jacket, UNIFORM.jacketDark));
  fill(any(ellipse(27, 171, 7, 6.5), ellipse(85, 171, 7, 6.5)), flat(st.fur, st.furDark));
  if (back) {
    // しっぽ（背中の下から横へ出て、先を上げる。背中では腕より手前）
    const tail = [];
    for (let t = 0; t <= 1.001; t += 0.05) {
      const x = (1 - t) ** 2 * 60 + 2 * (1 - t) * t * 100 + t * t * 96;
      const y = (1 - t) ** 2 * 172 + 2 * (1 - t) * t * 176 + t * t * 140;
      tail.push(ellipse(x, y, 5.5, 5.5));
    }
    fill(any(...tail), flat(st.fur, st.furDark));
  }

  // ---- 頭（丸く、ほおの横に毛の房）
  const tufts = [
    poly([[25, 104], [25, 118], [15, 114]]), poly([[27, 116], [31, 128], [18, 124]]),
    poly([[87, 104], [87, 118], [97, 114]]), poly([[85, 116], [81, 128], [94, 124]]),
  ];
  fill(any(ellipse(56, 104, 34, 28), ...tufts), flat(st.fur, st.furDark));

  // ---- 帽子（駅員の帽子。少し右へ傾く。帯・つば・金の記章）
  fill(poly([[36, 55], [78, 50], [82, 80], [32, 82]]), (x, y, edge) => (y < 57 ? UNIFORM.capTop : edge ? UNIFORM.capDark : UNIFORM.cap));
  fill(poly([[32, 76], [81, 73], [82, 81], [32, 83]]), flat(UNIFORM.band));
  if (!back) fill((x, y) => ellipse(57, 83, 27, 6)(x, y) && y > 82, (x, y) => (y < 85 && x > 40 && x < 70 ? UNIFORM.visorLight : UNIFORM.visor));

  // ---- 線：外側の空きと、奥のパーツとの境目（手前のパーツの縁）に1ドット
  const out = color.map((r) => r.slice());
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  each((x, y) => {
    const p = part[y][x];
    if (!p) {
      if (N4.some(([a, b]) => inside(x + a, y + b) && part[y + b][x + a])) out[y][x] = LINE;
      return;
    }
    if (!parts[p].line) return;
    if (N4.some(([a, b]) => inside(x + a, y + b) && part[y + b][x + a] && part[y + b][x + a] < p && parts[part[y + b][x + a]].line)) out[y][x] = LINE;
  });
  const put = (x, y, c) => { if (inside(x, y)) out[y][x] = c; };
  const rect = (x0, y0, x1, y1, c) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c); };

  if (!back) {
    // 帽子の記章（金のひし形）
    for (let d = 0; d <= 4; d++) { rect(57 - (4 - d), 62 + d, 57 + (4 - d), 62 + d, UNIFORM.gold); rect(57 - d, 66 + d, 57 + d, 66 + d, UNIFORM.gold); }
    rect(56, 65, 58, 67, UNIFORM.goldDark);
    // 上着の金ボタン（左右に2つずつ）
    for (const [bx, by] of [[46, 163], [64, 163], [47, 172], [63, 172]]) { rect(bx, by, bx + 2, by + 2, UNIFORM.gold); put(bx + 2, by + 2, UNIFORM.goldDark); }
    // 顔。目は大きな黄緑、瞳は縦長、白い光。鼻は小さく、口は閉じた「ω」
    const s = -3;   // 顔を向いている側（左）へ寄せる
    for (const ex of [43 + s, 68 + s]) {
      const cy = 104;
      const eye = ellipse(ex, cy, 8, 9.5);
      for (let y = 92; y <= 116; y++) {
        for (let x = ex - 10; x <= ex + 10; x++) {
          const inEye = eye(x + 0.5, y + 0.5);
          const edge = inEye && N4.some(([a, b]) => !eye(x + a + 0.5, y + b + 0.5));
          const r = Math.hypot((x + 0.5 - ex) / 8, (y + 0.5 - cy) / 9.5);
          if (edge) put(x, y, LINE);
          else if (inEye) put(x, y, r > 0.52 && r < 0.68 ? UNIFORM.eyeDark : y >= cy + 5 ? UNIFORM.eyeDark : UNIFORM.eye);
        }
      }
      rect(ex - 1, cy - 1, ex, cy, LINE);            // 瞳（小さく）
      rect(ex + 2, cy - 6, ex + 4, cy - 4, UNIFORM.white);   // 光
      rect(ex - 5, cy - 10, ex + 4, cy - 10, LINE);  // まぶたの線を太めに
    }
    const nx = 55 + s;
    rect(nx - 1, 114, nx + 2, 115, UNIFORM.nose);
    rect(nx - 1, 116, nx + 2, 116, LINE);
    put(nx, 117, LINE); put(nx + 1, 117, LINE);
    for (const [dx, dy] of [[-1, 118], [-2, 119], [-3, 119], [-4, 118], [2, 118], [3, 119], [4, 119], [5, 118]]) put(nx + dx, dy, LINE);
  } else {
    // 背中：上着の真ん中の縫い目と、帽子の後ろの記章は無し
    rect(56, 132, 56, 166, UNIFORM.jacketDark);
  }

  const flip = frame.endsWith('e') !== back;   // se は正面の反転、nw は背中の反転
  return flip ? out.map((r) => r.slice().reverse()) : out;
}
