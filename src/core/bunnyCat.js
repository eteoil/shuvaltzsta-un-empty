// バニーキャット（ウサギの耳の二足歩行の猫。駅員のチェルー・ドルー・デルー）のドット絵。1ドット＝1px、線も1ドット。
// 輪郭は手で打った点を滑らかにした形（core/dotArt.js の smooth）で塗り、パーツの境目と外側に1ドットの線を引く。
// 帽子・首元・目は手で描いたドット。
//
// 大きさ：耳を除いた帽子のてっぺんから爪先まで約 66 ドットで、主人公（約 132 ドット）の半分。耳はその上に立つ。
// 参考画像（チェルー）：丸い頭に、離れて付いた大きな黄緑の目（同心円の輪と右上の光・太いまぶた）。ほおの毛は輪郭の毛先。
//   駅員の帽子（淡い青の山・濃い帯・黒く光るつば・正面に金の丸い記章）を、耳と耳の間に少し傾けて乗せる。
//   首元は、白い立ち襟・サーモンピンクのネクタイ・ベストの幅の広い襟（ラペル）。ベストは青灰色で、金ボタンと懐中時計の鎖。
//   白いシャツの袖は腕の半ばまで、その先は毛の腕と丸い手。耳は根元が細く、先は丸い。
// シルエット：マスコットらしく、首から爪先までをひし形（◇）に近くする。首は細く、おなかでいちばん広く、爪先へすぼまる。
//   ズボンは履かず、ベストの裾から下は毛の脚と足。
// 骨格：頭は大きめ。耳は頭のてっぺんの左右から V 字に生える。腕は肩から下ろす。しっぽは腰の後ろから出る。
// 向き（クォータービュー）：南西（sw）は体を左下へ向けた斜め前。顔・胸の合わせ・帽子の前は左へ寄り、
//   奥（左）の目は細く、奥の腕は胴の後ろに半分隠れ、手前（右）の足は少し下。しっぽは右の後ろからのぞく。
//   南東（se）はその左右反転。北東（ne）は右上へ向けた斜め後ろ、北西（nw）はその反転。どちらも手前は右。
// 手は下ろし、口は閉じている。画像に無い脚・しっぽ・背中は想像
import { createDots, flat, tube, smooth, LINE } from './dotArt.js';

export const BUNNY_CAT_SIZE = [96, 144];
export const BUNNY_CAT_ANCHOR = [48, 136];

// ear は耳の長さ（頭の輪郭から先まで、およそ）。チェルーはドルーの半分
export const BUNNY_CAT_STYLES = {
  cheru: { ear: 11, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  doru: { ear: 22, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  deru: { ear: 11, fur: '#cbb892', furDark: '#a3906c', earIn: '#e8b8b0' },
};

const C = {
  cap: '#c3d2de', capDark: '#9cadbd', capTop: '#e2eaf1', band: '#4f5a73', bandLight: '#7c88a3', visor: '#2e3444', visorLight: '#5c667c',
  gold: '#e3b95e', goldDark: '#a67a30',
  vest: '#a3bcc4', vestDark: '#8199a6', lapel: '#bfd3d9',
  shirt: '#f6f3ec', shirtDark: '#d6d0d8',
  tie: '#e3969c', tieDark: '#b3646e',
  eye: '#e2e66c', ring: '#a9b242', white: '#ffffff', nose: '#d98e9a',
};

// 帽子（手描き）。o 線・K 山のてっぺん・C 山・c 山の影・B 帯・b 帯の縁取り・D つば・d つばの光・G 記章・g 記章の影
// 前（sw）：つばは左下へ丸く張り出し、記章は左寄り。右が少し高く傾く。後ろ（ne）：つばは向こう側で見えない
const CAP_FRONT = [
  '.........oooooo......',
  '......oooKKKKKKoo....',
  '....ooKKKKKKKKKKKo...',
  '...oKKKKKKKKKKKKKKo..',
  '...oCKKKKKKKKKKKKco..',
  '..oCCCCCCCCCCCCCcco..',
  '..oCCCoooCCCCCCccco..',
  '..oCCoGGGoCCCCcccco..',
  '..oCCoGgGoCCCCcccco..',
  '..oCCCoooCCCCCcccco..',
  '..obbbbbbbbbbbbbbbo..',
  '..oBBBBBBBBBBBBBBBo..',
  '.oDDDDDDDDBBBBBBBBo..',
  'oddDDDDDDDDDoooooo...',
  'oDDDDDDDDDo..........',
  '.oooooooo............',
];
const CAP_BACK = [
  '.....oooooo.........',
  '...ooKKKKKKoooo.....',
  '..oKKKKKKKKKKKKoo...',
  '.oKKKKKKKKKKKKKKKo..',
  '.ocKKKKKKKKKKKKKCo..',
  '.occCCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCo.',
  '.obbbbbbbbbbbbbbbbo.',
  '.oBBBBBBBBBBBBBBBBo.',
  '.oBBBBBBBBBBBBBBBBo.',
  '..oooooooooooooooo..',
];
const CAP_COLORS = {
  K: C.capTop, C: C.cap, c: C.capDark, B: C.band, b: C.bandLight, D: C.visor, d: C.visorLight, G: C.gold, g: C.goldDark,
};

// 首元（手描き）。o 線・L ベストの襟（ラペル。肩から V 字に下り、下の端で止まる）・W 白い立ち襟とシャツ・T／t ネクタイ。
// '.' はベストのまま
const NECK = [
  '..oWWWWoTtoWWWWo..',
  '.oLoWWWoTtoWWWoLo.',
  'oLLLoWWoTtoWWoLLLo',
  'oLLLLoWoTtoWoLLLLo',
  'oLLLLoWTTttWoLLLLo',
  '.oLLLoTTTtttoLLLo.',
  '.oLLLLoTTttoLLLLo.',
  '..oLLLoTTttoLLLo..',
  '..oLLLLooooLLLLo..',
  '...oLLLo..oLLLo...',
  '....oLLo..oLLo....',
  '.....oo....oo.....',
];
const NECK_COLORS = { o: LINE, L: C.lapel, W: C.shirt, T: C.tie, t: C.tieDark };

// 閉じた口（ω）と鼻。n 鼻・o 線
const MOUTH = [
  'onno.',
  '.oo..',
  '.o...',
  'o.o.o',
];

// 目。大きな黄緑に、同心円の濃い輪と小さな瞳、右上の白い光。上のまぶたは太く、外側（side：-1 左・1 右）へ少しはねる
function eye(d, cx, cy, rx, ry, side) {
  const inE = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
    for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      if (!inE(x, y)) continue;
      const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
      let c = C.eye;
      if (N4.some(([a, b]) => !inE(x + a, y + b))) c = LINE;
      else if (y + 0.5 < cy - ry * 0.68) c = LINE;                  // 太いまぶた
      else if (r > 0.4 && r < 0.62) c = C.ring;                     // 同心円の輪
      d.put(x, y, c);
    }
  }
  const px = Math.round(cx - 0.5);
  const py = Math.round(cy - 0.5);
  d.rect(px, py, px + 1, py + 1, LINE);                             // 瞳
  const hx = Math.round(cx + rx * 0.2);
  const hy = Math.round(cy - ry * 0.45);
  d.rect(hx, hy, hx + 1, hy + 1, C.white);                          // 光
  const ex = side > 0 ? Math.round(cx + rx) : Math.round(cx - rx) - 1;
  d.put(ex, Math.round(cy - ry * 0.6), LINE);                       // まぶたの外のはね
}

// 耳：根元 (x, y) から、傾き deg（0 で真上、+ で右へ）に、頭から出る長さ len。根元の 4 ドットは頭に埋まる。
// 根元は細く、3割ほどの所がいちばん広く、先は丸く閉じる。外側へ少し反る（bend）。inner は内側の薄い色の形
function earShapes(x, y, len, deg, w, bend) {
  const total = len + 4;
  const r = (deg * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);   // 先へ向かう向き
  const nx = -uy;
  const ny = ux;             // 右へ向かう向き
  const side = (scale, t0, t1) => {
    const left = [];
    const right = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const t = t0 + ((t1 - t0) * i) / n;
      const u = (t - t0) / (t1 - t0);
      const round = u > 0.72 ? Math.sqrt(Math.max(0, 1 - ((u - 0.72) / 0.28) ** 2)) : 1;   // 先を丸く閉じる
      const width = w * scale * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.6))) * round;
      const off = bend * t * t;
      const cx = x + ux * total * t + nx * off;
      const cy = y + uy * total * t + ny * off;
      left.push([cx - nx * width, cy - ny * width]);
      right.push([cx + nx * width, cy + ny * width]);
    }
    return smooth([...left, ...right.reverse()], 1);
  };
  return { outer: side(1, 0, 1), inner: side(0.45, 0.3, 0.95) };
}

// 頭の輪郭。face が -1 なら顔は左（sw）、1 なら右（ne の後ろ頭）。向いている側のほおが少し張り、両ほおの下に毛先が2つずつ
function headShape(face) {
  const pts = [
    [47, 56], [54, 56.5], [60, 58.5], [64.5, 61.5], [67.5, 65.5], [68.5, 70],
    [69, 74], [72.5, 76.5, 1], [68.5, 78], [71, 82, 1], [66.5, 82.5], [64.5, 86],
    [60.5, 88.5], [54.5, 90], [47, 90.5], [39, 90], [33, 88.5],
    [29, 86], [26.5, 83], [21.5, 82, 1], [25.5, 79.5], [21, 75.5, 1], [25.5, 74.5],
    [26, 70], [27.5, 65.5], [30.5, 61.5], [35, 58.5], [40.5, 56.5],
  ].map(([x, y, s]) => [47 + (x - 47) * 0.72, 91 + (y - 73) * 0.74, s]);   // 大きさを合わせる
  return smooth(face < 0 ? pts : pts.map(([x, y, s]) => [94 - x, y, s]), 2);
}

export function bunnyCatDots(styleId, frame) {
  const st = BUNNY_CAT_STYLES[styleId] ?? BUNNY_CAT_STYLES.cheru;
  const [W, H] = BUNNY_CAT_SIZE;
  const back = frame.startsWith('n');
  const d = createDots(W, H);
  const fur = flat(st.fur, st.furDark);
  const shirt = flat(C.shirt, C.shirtDark);
  const vest = flat(C.vest, C.vestDark);
  const L = st.ear;

  // ---- 奥（左）の腕：胴の後ろに半分隠れる。白い袖は腕の半ばまで、先は毛の腕と丸い手
  d.fill(smooth([[31.5, 113], [35.5, 114], [35, 118.5], [33, 121.5], [30, 121.5], [29, 119], [30, 115.5]]), fur);
  d.fill(smooth([[36, 105], [39.5, 106.5], [38, 112], [35, 115], [31.5, 114], [32.5, 109]]), shirt);
  // ---- しっぽ（sw：右の後ろから上へ巻く）
  if (!back) d.fill(tube([55, 124], [66, 127], [65.5, 115], 2.2, 1.6), fur);

  // ---- 首から爪先までのひし形（◇）。毛の脚は短く、足先は向いている方へ。手前（右）の足が少し下
  const feet = back
    ? [[38.5, 130.5], [38.5, 134.5], [42, 136.5], [45, 134.5], [46.5, 132.5, 1], [48, 134.5], [51.5, 137], [55.5, 136], [56, 131]]
    : [[38.5, 130.5], [35.5, 134.5], [38, 136.5], [43, 136.5], [45, 134.5], [46.5, 132.5, 1], [48, 134.5], [50, 137], [55, 137], [57, 135], [56, 131]];
  const body = [[42, 102], [37.5, 106], [31.5, 116], [34, 124], ...feet, [60, 124], [62.5, 116], [56.5, 106], [52, 102]];
  d.fill(smooth(body), fur);
  // ベスト（◇の上半分。前の裾は合わせで少し尖る）
  d.fill(smooth([[42, 102], [37.5, 106], [31.5, 116], [32.5, 120], [38.5, 124], back ? [46.5, 125.5] : [45, 127, 1], [51, 124], [61.5, 120], [62.5, 116], [56.5, 106], [52, 102]]), vest);
  if (back) {
    // 首の後ろのシャツの襟
    d.fill(smooth([[39.5, 101], [54.5, 101], [54, 105], [47, 106], [40, 105]], 1), shirt);
    // しっぽ（腰の後ろ＝こちらから左下へ垂れて先を上げる。胴より手前）
    d.fill(tube([46, 124], [36, 129], [34, 119], 2.2, 1.6), fur);
  }

  // ---- 手前（右）の腕：胴の横に出る
  d.fill(smooth([[57, 114], [61.5, 113.5], [63, 117], [63.5, 120.5], [62, 122.5], [59, 122.5], [57, 120.5], [56.5, 117]]), fur);
  d.fill(smooth([[55, 105.5], [58.5, 105], [62, 109], [63.5, 113.5], [60, 115.5], [56.5, 113], [55.5, 109]]), shirt);

  // ---- 頭。前は耳が頭の後ろ。後ろ（ne）は耳が帽子より手前で、付け根は頭と同じまとまり（線を引かない）
  const ears = back
    ? [earShapes(39, 82, L, -16, 3.8, -1.5), earShapes(55, 81.5, L, 16, 4.2, 1.5)]
    : [earShapes(38, 82.5, L, -18, 3.8, -1.5), earShapes(56, 82, L, 13, 4.2, 1.5)];
  if (!back) {
    for (const e of ears) d.fill(e.outer, (x, y, edge) => (e.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
  }
  d.fill(headShape(back ? 1 : -1), fur, { group: 'head', tag: 'head' });
  if (back) d.fillStamp(CAP_BACK, 38, 71, CAP_COLORS);
  else d.fillStamp(CAP_FRONT, 35, 69, CAP_COLORS);
  if (back) for (const e of ears) d.fill(e.outer, fur, { group: 'head' });

  d.finish();
  if (!back) {
    // 首元・ベストの前の合わせ・金ボタン・懐中時計の鎖
    d.stamp(NECK, 37, 102, NECK_COLORS, { skip: 'head' });
    for (let y = 114; y <= 126; y++) d.put(45, y, C.vestDark);
    for (const [bx, by] of [[42, 117], [42, 121], [47, 117], [47, 121]]) d.stamp(['gg', 'gG'], bx, by, { g: C.gold, G: C.goldDark });
    for (const [x, y] of [[49, 119], [50, 120], [51, 120], [52, 120], [53, 119]]) d.put(x, y, C.gold);
    // 目・鼻・口
    eye(d, 39.5, 94, 3.2, 4.8, -1);
    eye(d, 52, 94, 4.4, 5, 1);
    d.stamp(MOUTH, 43, 98, { n: C.nose, o: LINE });
    // 手の指の線
    for (const [x, y] of [[59, 123], [61, 122], [32, 122]]) d.put(x, y, LINE);
  } else {
    // ベストの背中の縫い目
    for (let y = 106; y <= 124; y++) d.put(48, y, C.vestDark);
    for (const [x, y] of [[59, 123], [61, 122], [32, 122]]) d.put(x, y, LINE);
  }

  const flip = frame.endsWith('e') !== back;   // se は sw の反転、nw は ne の反転
  return d.result(flip);
}
