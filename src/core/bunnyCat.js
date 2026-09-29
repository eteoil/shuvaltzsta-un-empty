// バニーキャット（ウサギの耳の二足歩行の猫。駅員のチェルー・ドルー・デルー）のドット絵。1ドット＝1px、線も1ドット。
// 図形を奥から順に塗り、パーツの境目と外側に1ドットの線を引く（core/dotArt.js）。目は手で描いたドットを押す。
//
// 大きさ：耳を除いた帽子のてっぺんから足の裏まで約 88 ドットで、主人公（約 132 ドット）の 2/3。耳はその上に立つ。
// 参考画像（チェルー）の雰囲気：大きく丸い頭に、離れて付いた大きな黄緑の目（同心円の輪と右上の大きな光）。
//   ほおの毛は輪郭と一体のギザギザ。小さな駅員の帽子を耳と耳の間にちょこんと乗せる。
//   白いシャツ（大きな襟と白い袖）に、サーモンピンクのネクタイと、金ボタンの青灰色のベスト。
// 骨格：頭が大きい2頭身の猫。耳は頭のてっぺんの左右から V 字に生える（頭の輪郭の後ろから出る）。
//   首は頭に隠れる。胴はずんぐり。腕は肩から胴に沿って下ろし（肩に線は引かず、袖の白で分ける）、先に丸い手。
//   脚は短く、足先は向いている方へ出る。しっぽは腰の後ろから出る。
// 向き（クォータービュー）：南西（sw）は体を左下へ向けた斜め前。顔・胸の合わせ・帽子の前は左へ寄り、
//   奥（左）の目は細く、奥の腕は胴の後ろに半分隠れ、手前（右）の足は少し下。しっぽは右の後ろからのぞく。
//   南東（se）はその左右反転。北東（ne）は右上へ向けた斜め後ろ（背中・帽子の後ろ・しっぽ）、北西（nw）はその反転。
// 手は下ろし、口は閉じている。画像に無い脚・しっぽ・背中は想像
import { createDots, flat, ellipse, poly, any, capsule, tube, LINE } from './dotArt.js';

export const BUNNY_CAT_SIZE = [96, 144];
export const BUNNY_CAT_ANCHOR = [48, 136];

// ear は耳の長さ（頭の輪郭から先まで、およそ）。チェルーはドルーの半分
export const BUNNY_CAT_STYLES = {
  cheru: { ear: 15, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  doru: { ear: 30, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  deru: { ear: 15, fur: '#cbb892', furDark: '#a3906c', earIn: '#e8b8b0' },
};

const C = {
  cap: '#bccbd8', capDark: '#97a8b8', capTop: '#dde6ee', band: '#56607a', visor: '#3c4458',
  gold: '#e3b95e', goldDark: '#a67a30',
  vest: '#9db7c0', vestDark: '#7e98a4',
  shirt: '#f6f3ec', shirtDark: '#d6d0d8',
  tie: '#e3969c', tieDark: '#b3646e',
  pants: '#65738a', pantsDark: '#4d596d',
  eye: '#e2e66c', ring: '#a9b242', white: '#ffffff', nose: '#d98e9a',
};

// 閉じた口（ω）と鼻。n 鼻・o 線
const MOUTH = [
  '..onnno..',
  '...ono...',
  '....o....',
  'o..o.o..o',
  '.oo...oo.',
];

// 目。大きな黄緑に、同心円の濃い輪と小さな瞳、右上の大きな白い光。上のまぶたは太く、外側（side：-1 左・1 右）へ少しはねる。
// 上の方はまぶたの影で少し濃い
function eye(d, cx, cy, rx, ry, side) {
  const inE = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!inE(x, y)) continue;
      const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      let c = C.eye;
      if (N4.some(([a, b]) => !inE(x + a, y + b))) c = LINE;
      else if (y + 0.5 < cy - ry * 0.7) c = LINE;                   // 太いまぶた
      else if (y + 0.5 < cy - ry * 0.5) c = C.ring;                 // まぶたの影
      else if (r > 0.38 && r < 0.56) c = C.ring;                    // 同心円の輪
      d.put(x, y, c);
    }
  }
  const px = Math.round(cx - 0.5);
  const py = Math.round(cy - 0.5);
  d.rect(px, py, px + 1, py + 1, LINE);                             // 瞳
  const hx = Math.round(cx + rx * 0.25);
  const hy = Math.round(cy - ry * 0.5);
  d.rect(hx, hy, hx + (rx > 5 ? 2 : 1), hy + 2, C.white);           // 光
  d.put(Math.round(cx - rx * 0.45), Math.round(cy + ry * 0.45), C.white);
  // まぶたの外のはね
  const ex = side > 0 ? Math.round(cx + rx) : Math.round(cx - rx) - 1;
  const ey = Math.round(cy - ry * 0.55);
  d.put(ex, ey, LINE);
  d.put(ex + side, ey - 1, LINE);
}

export function bunnyCatDots(styleId, frame) {
  const st = BUNNY_CAT_STYLES[styleId] ?? BUNNY_CAT_STYLES.cheru;
  const [W, H] = BUNNY_CAT_SIZE;
  const back = frame.startsWith('n');
  const d = createDots(W, H);
  const fur = flat(st.fur, st.furDark);

  // 頭：大きな丸。下の左右（ほお）は、輪郭がそのままギザギザの毛になる。後ろ向きでは、下の真ん中（うなじ）も少しギザギザ
  const head = (cx, cy) => {
    const rx = 26;
    const ry = 20;
    const zig = (t, from, to, n, a) => {
      if (t < from || t > to) return 0;
      const u = ((t - from) / (to - from)) * n;
      return a * (1 - Math.abs((u % 1) * 2 - 1));   // 山が n 個
    };
    return (x, y) => {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const t = (Math.atan2(dy, dx) * 180) / Math.PI;   // 右が 0、下が 90
      const bump = zig(t, 8, 62, 3, 0.13) + zig(t, 118, 172, 3, 0.13) + (back ? zig(t, 70, 110, 2, 0.08) : 0);
      return Math.hypot(dx, dy) <= 1 + bump;
    };
  };
  // 耳：根元 (x, y) から傾き deg（0 で真上、+ で右へ）に長さ len。根元は頭の輪郭の後ろに隠れる
  const ear = (x, y, len, deg, w) => {
    const r = (deg * Math.PI) / 180;
    const half = len / 2 + 5;   // 根元の 5 ドットは頭の後ろ
    const cx = x + Math.sin(r) * (half - 5);
    const cy = y - Math.cos(r) * (half - 5);
    return {
      outer: ellipse(cx, cy, w, half, deg),
      inner: ellipse(cx + Math.sin(r) * 1, cy - Math.cos(r) * 1, w * 0.45, half - 3, deg),
    };
  };
  // 帽子：耳と耳の間に乗る小さな駅員の帽子。上から見下ろすので、てっぺんは楕円
  const cap = (cx, top, front) => {
    d.fill(any(ellipse(cx, top + 3, 10, 3.2), poly([[cx - 10, top + 3], [cx + 10, top + 3], [cx + 9, top + 11], [cx - 9, top + 11]])), (x, y, edge) => (edge ? C.capDark : C.cap));
    d.fill(ellipse(cx, top + 3, 9, 2.4), flat(C.capTop), { line: false });
    d.fill(poly([[cx - 9.5, top + 8], [cx + 9.5, top + 8], [cx + 9, top + 11.5], [cx - 9, top + 11.5]]), flat(C.band));
    // つば：前（南西では左下）へ三日月形に出る
    if (front) d.fill((x, y) => ellipse(cx - 3, top + 11.5, 10, 3.6)(x, y) && y > top + 11, flat(C.visor));
  };

  const L = st.ear;
  if (!back) {
    // ---------------------------------------------------------------- 斜め前（南西）
    const far = ear(33, 62, L, -16, 5);
    d.fill(far.outer, (x, y, edge) => (far.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
    const near = ear(60, 61, L, 14, 6);
    d.fill(near.outer, (x, y, edge) => (near.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
    // しっぽ（右の後ろ、腰から出て上へ巻く）
    d.fill(tube([57, 123], [70, 126], [70, 111], 2.8, 2), fur);
    // 奥の腕（胴の後ろに半分隠れる）：毛の腕と手、肩に白い袖のふくらみ
    d.fill(any(capsule([33, 104], [31, 116], 6), ellipse(31, 119, 3.8, 3.6)), fur, { group: 'arm' });
    d.fill(ellipse(34, 102, 5, 4), flat(C.shirt, C.shirtDark), { group: 'body' });
    // 脚と足（足先は左下へ。手前（右）の足が少し下）
    d.fill(any(poly([[37, 124], [45, 124], [44, 132], [38, 132]]), poly([[49, 124], [57, 124], [56, 133], [50, 133]])), flat(C.pants, C.pantsDark));
    d.fill(ellipse(39, 133.5, 6, 3), fur);
    d.fill(ellipse(51, 134.5, 6.5, 3.2), fur);
    // 胴（ずんぐりしたベスト）
    d.fill((x, y) => ellipse(47, 111, 16, 16)(x, y) && y < 127, flat(C.vest, C.vestDark), { group: 'body' });
    // シャツの胸（ベストの合わせは左寄り）と、あごの下の大きな白い襟
    d.fill(poly([[37, 96], [55, 96], [45, 113]]), flat(C.shirt, C.shirtDark), { group: 'body' });
    d.fill(any(poly([[32, 96], [45, 98], [36, 105]]), poly([[58, 96], [45, 98], [55, 105]])), flat(C.shirt, C.shirtDark));
    // ネクタイ（大きな蝶結びと、下へ垂れる先）
    d.fill(any(poly([[38, 99], [45, 102], [38, 106]]), poly([[52, 99], [45, 102], [52, 106]])), flat(C.tie, C.tieDark));
    d.fill(any(ellipse(45, 102, 2.2, 2.2), poly([[43.5, 103.5], [46.5, 103.5], [47.5, 111], [45, 113], [42.5, 111]])), flat(C.tie, C.tieDark));
    // 手前の腕：毛の腕と手、肩に白い袖のふくらみ（袖と胴の境には線を引かない）
    d.fill(any(capsule([61, 104], [62, 116], 6.5), ellipse(62, 119.5, 4.3, 4)), fur, { group: 'arm' });
    d.fill(ellipse(60, 102, 5.5, 4.5), flat(C.shirt, C.shirtDark), { group: 'body' });
    // 頭と帽子
    d.fill(head(47, 78), fur);
    cap(46, 49, true);
  } else {
    // ---------------------------------------------------------------- 斜め後ろ（北東）
    // 奥の腕と手、肩の袖
    d.fill(any(capsule([33, 104], [31, 116], 6), ellipse(31, 119, 3.8, 3.6)), fur, { group: 'arm' });
    d.fill(ellipse(34, 102, 5, 4), flat(C.shirt, C.shirtDark), { group: 'body' });
    // 脚と足（かかと側）
    d.fill(any(poly([[38, 124], [46, 124], [45, 132], [39, 132]]), poly([[50, 124], [58, 124], [57, 133], [51, 133]])), flat(C.pants, C.pantsDark));
    d.fill(ellipse(42, 133.5, 5.5, 3), fur);
    d.fill(ellipse(54, 134.5, 5.5, 3.2), fur);
    // 胴（ベストの背中）と、首の後ろの白い襟
    d.fill((x, y) => ellipse(48, 111, 16, 16)(x, y) && y < 127, flat(C.vest, C.vestDark), { group: 'body' });
    d.fill(poly([[36, 96], [60, 96], [58, 101], [38, 101]]), flat(C.shirt, C.shirtDark), { group: 'body' });
    // 手前の腕と手、肩の袖
    d.fill(any(capsule([63, 104], [64, 116], 6.5), ellipse(64, 119.5, 4.3, 4)), fur, { group: 'arm' });
    d.fill(ellipse(62, 102, 5.5, 4.5), flat(C.shirt, C.shirtDark), { group: 'body' });
    // しっぽ（腰の後ろ＝こちら側から出て、左下へ垂れて先を上げる。胴より手前）
    d.fill(tube([46, 121], [33, 128], [31, 114], 2.8, 2), fur);
    // 耳（頭の後ろから V 字に。根元は頭の輪郭に隠れる）
    const far = ear(37, 62, L, -12, 5);
    d.fill(far.outer, fur);
    const near = ear(62, 62, L, 14, 6);
    d.fill(near.outer, fur);
    // 頭の後ろと帽子（つばは向こう側なので見えない）
    d.fill(head(49, 78), fur);
    cap(50, 49, false);
  }

  d.finish();
  const rect = (x0, y0, x1, y1, c) => d.rect(x0, y0, x1, y1, c);
  if (!back) {
    // 帽子の記章（金）。前は左寄り
    d.stamp(['.g.', 'gGg', '.g.'], 40, 55, { g: C.gold, G: C.goldDark });
    // ベストの金ボタン（奥の列は詰まる）
    for (const [bx, by] of [[39, 112], [50, 112], [39, 118], [50, 118]]) d.stamp(['gg', 'gG'], bx, by, { g: C.gold, G: C.goldDark });
    // 目・鼻・口
    eye(d, 35.5, 80, 4.6, 7.4, -1);
    eye(d, 55, 80, 6.6, 7.6, 1);
    d.stamp(MOUTH, 40, 87, { n: C.nose, o: LINE });
  } else {
    // ベストの背中の縫い目と、背中のベルト
    rect(49, 103, 49, 124, C.vestDark);
  }

  const flip = frame.endsWith('e') !== back;   // se は sw の反転、nw は ne の反転
  return d.result(flip);
}
