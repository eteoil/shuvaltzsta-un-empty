// バニーキャット（ウサギの耳の二足歩行の猫。駅員のチェルー・ドルー・デルー）のドット絵。1ドット＝1px、線も1ドット。
// 輪郭は手で打った点を滑らかにした形（core/dotArt.js の smooth）で塗り、パーツの境目と外側に1ドットの線を引く。
// 帽子と目は手で描いたドットを押す。
//
// 大きさ：耳を除いた帽子のてっぺんから足の裏まで約 88 ドットで、主人公（約 132 ドット）の 2/3。耳はその上に立つ。
// 参考画像（チェルー）：丸い頭に、離れて付いた大きな黄緑の目（同心円の輪と右上の光・太いまぶた）。ほおの毛は輪郭の毛先。
//   小さな駅員の帽子を耳と耳の間に乗せる。首元は、シャツの尖った襟・サーモンピンクのネクタイ・ベストの襟（ラペル）。
//   白いシャツの袖は腕の半ば（ひじ）まで、その先は毛の腕と丸い手。ベストは青灰色で金ボタン、懐中時計の金の鎖。
// 骨格：頭は大きめの2頭身半。耳は頭のてっぺんの左右から V 字に生える。首は頭と襟に隠れる。
//   腕はベストの袖ぐりから出て、胴に沿って下ろす。脚は短く、足先は向いている方へ出る。しっぽは腰の後ろから出る。
// 向き（クォータービュー）：南西（sw）は体を左下へ向けた斜め前。顔・胸の合わせ・帽子の前は左へ寄り、
//   奥（左）の目は細く、奥の腕は胴の後ろに半分隠れ、手前（右）の足は少し下。しっぽは右の後ろからのぞく。
//   南東（se）はその左右反転。北東（ne）は右上へ向けた斜め後ろ、北西（nw）はその反転。どちらも手前は右。
// 手は下ろし、口は閉じている。画像に無い脚・しっぽ・背中は想像
import { createDots, flat, tube, smooth, LINE } from './dotArt.js';

export const BUNNY_CAT_SIZE = [96, 144];
export const BUNNY_CAT_ANCHOR = [48, 136];

// ear は耳の長さ（頭の輪郭から先まで、およそ）。チェルーはドルーの半分
export const BUNNY_CAT_STYLES = {
  cheru: { ear: 15, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  doru: { ear: 30, fur: '#a4ada3', furDark: '#858e85', earIn: '#d9b4c6' },
  deru: { ear: 15, fur: '#cbb892', furDark: '#a3906c', earIn: '#e8b8b0' },
};

const C = {
  cap: '#bccbd8', capDark: '#97a8b8', capTop: '#dde6ee', band: '#56607a', visor: '#3c4458', visorLight: '#68738c',
  gold: '#e3b95e', goldDark: '#a67a30',
  vest: '#a3bcc4', vestDark: '#8199a6', lapel: '#cfe0e4',
  shirt: '#f6f3ec', shirtDark: '#d6d0d8',
  tie: '#e3969c', tieDark: '#b3646e',
  pants: '#65738a', pantsDark: '#4d596d',
  eye: '#e2e66c', ring: '#a9b242', white: '#ffffff', nose: '#d98e9a',
};

// 帽子（手描き）。o 線・K てっぺん・C 横・c 横の影・B 帯・D つば・d つばの光・G 記章・g 記章の影
// 前（sw）はつばが左下へ出て、記章は左寄り。後ろ（ne）はつばが向こう側で見えない
const CAP_FRONT = [
  '.....oooooooooo.......',
  '...ooKKKKKKKKKKoo.....',
  '..oKKKKKKKKKKKKKKoo...',
  '.oKKKKKKKKKKKKKKKKKo..',
  '.oCKKKKKKKKKKKKKKKcco.',
  '.oCCCKKKKKKKKKKKccccco',
  '.oCCCCCCCCCCCCCCCccco.',
  '.oCCCCCGCCCCCCCCCccco.',
  '.oCCCCGgGCCCCCCCCccco.',
  '.oCCCCCGCCCCCCCCCccco.',
  '.oCCCCCCCCCCCCCCCccco.',
  '.oBBBBBBBBBBBBBBBBBBo.',
  'oddDBBBBBBBBBBBBBBBBo.',
  'oDDDDDDDDDoooooooooo..',
  '.ooDDDDDoo............',
  '...ooooo..............',
];
const CAP_BACK = [
  '.......oooooooooo.....',
  '.....ooKKKKKKKKKKoo...',
  '...ooKKKKKKKKKKKKKKo..',
  '..oKKKKKKKKKKKKKKKKKo.',
  '.occKKKKKKKKKKKKKKKCo.',
  'occcccKKKKKKKKKKKCCCo.',
  '.occcCCCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCCCo.',
  '.occcCCCCCCCCCCCCCCCo.',
  '.oBBBBBBBBBBBBBBBBBBo.',
  '.oBBBBBBBBBBBBBBBBBBo.',
  '..oooooooooooooooooo..',
];
const CAP_COLORS = {
  o: LINE, K: C.capTop, C: C.cap, c: C.capDark, B: C.band, D: C.visor, d: C.visorLight, G: C.gold, g: C.goldDark,
};
// 首元（手描き）。o 線・L ベストの襟（ラペル）・W シャツ（上の左右は尖った襟）・T／t ネクタイ。'.' はベストのまま
const NECK = [
  'LLLoWWWWWWTtWWWWWWoLLL',
  'LLLoWWWWWoTtoWWWWWoLLL',
  'oLLLoWWWoWTtWoWWWoLLLo',
  'oLLLoWWoWoTtoWoWWoLLLo',
  '.oLLLooWWoTtoWWooLLLo.',
  '.oLLLoWWWoTtoWWWoLLLo.',
  '..oLLLoWWoTtoWWoLLLo..',
  '..oLLLoWoTTttoWoLLLo..',
  '...oLLLooTTttooLLLo...',
  '...oLLLooTTttooLLLo...',
  '....oLLLoTTttoLLLo....',
  '....oLLLoTTttoLLLo....',
  '.....oLLLoTtoLLLo.....',
  '.....oLLLoTtoLLLo.....',
  '......oLLLooLLLo......',
  '......oLLLooLLLo......',
];
// 閉じた口（ω）と鼻。n 鼻・o 線
const MOUTH = [
  '.onno.',
  '..oo..',
  '..o...',
  'o.o.o.',
  '.o...o',
];

// 目。大きな黄緑に、同心円の濃い輪と小さな瞳、右上の大きな白い光。上のまぶたは太く、外側（side：-1 左・1 右）へ少しはねる
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
      else if (r > 0.38 && r < 0.58) c = C.ring;                    // 同心円の輪
      d.put(x, y, c);
    }
  }
  const px = Math.round(cx - 0.5);
  const py = Math.round(cy - 0.5);
  d.rect(px, py, px + 1, py + 1, LINE);                             // 瞳
  const hx = Math.round(cx + rx * 0.2);
  const hy = Math.round(cy - ry * 0.5);
  d.rect(hx, hy, hx + (rx > 5 ? 2 : 1), hy + 2, C.white);           // 光
  d.put(Math.round(cx - rx * 0.45), Math.round(cy + ry * 0.45), C.white);
  const ex = side > 0 ? Math.round(cx + rx) : Math.round(cx - rx) - 1;
  const ey = Math.round(cy - ry * 0.55);
  d.put(ex, ey, LINE);                                              // まぶたの外のはね
  d.put(ex + side, ey - 1, LINE);
}

// 耳：根元 (x, y) から、傾き deg（0 で真上、+ で右へ）に、頭から出る長さ len。根元の 6 ドットは頭に埋まる。
// 根元は細く、3割ほどの所がいちばん広く、先は丸い。外側へ少し反る（bend）。inner は内側の薄い色の形
function earShapes(x, y, len, deg, w, bend) {
  const total = len + 6;
  const r = (deg * Math.PI) / 180;
  const ux = Math.sin(r);
  const uy = -Math.cos(r);   // 先へ向かう向き
  const nx = -uy;
  const ny = ux;             // 右へ向かう向き
  const side = (scale, t0, t1) => {
    const left = [];
    const right = [];
    for (let i = 0; i <= 10; i++) {
      const t = t0 + ((t1 - t0) * i) / 10;
      const width = w * scale * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.6))) * (1 - 0.55 * t ** 3);
      const off = bend * t * t;
      const cx = x + ux * total * t + nx * off;
      const cy = y + uy * total * t + ny * off;
      left.push([cx - nx * width, cy - ny * width]);
      right.push([cx + nx * width, cy + ny * width]);
    }
    return smooth([...left, ...right.reverse()], 2);
  };
  return { outer: side(1, 0, 1), inner: side(0.42, 0.25, 0.93) };
}

// 頭の輪郭。face が -1 なら顔は左（sw）、1 なら右（ne の後ろ頭）。向いている側のほおが少し張り、両ほおの下に毛先が2つずつ
function headShape(face) {
  const pts = [
    [47, 56], [54, 56.5], [60, 58.5], [64.5, 61.5], [67.5, 65.5], [68.5, 70],
    [69, 74], [72.5, 76.5, 1], [68.5, 78], [71, 82, 1], [66.5, 82.5], [64.5, 86],
    [60.5, 88.5], [54.5, 90], [47, 90.5], [39, 90], [33, 88.5],
    [29, 86], [26.5, 83], [21.5, 82, 1], [25.5, 79.5], [21, 75.5, 1], [25.5, 74.5],
    [26, 70], [27.5, 65.5], [30.5, 61.5], [35, 58.5], [40.5, 56.5],
  ];
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

  // ---- 腕（ベストより奥に塗り、袖ぐりはベストの縁の線で分かれる）。白い袖はひじまで、その先は毛の腕と丸い手
  // 奥（左）の腕は胴の後ろに半分隠れ、手前（右）の腕は胴の横に出る
  const arms = [
    { sleeve: [[31, 88], [36, 88], [36.5, 96], [35, 104], [30.5, 105], [27, 103.5], [26.5, 97], [28, 91]],
      fore: [[28, 103], [33.5, 103.5], [33, 110], [32.5, 114], [30.5, 118], [27, 118.5], [25, 116], [25.5, 110], [27, 106]] },
    { sleeve: [[58, 88], [63, 88.5], [66, 92], [67, 99], [66.5, 104.5], [62.5, 106], [59.5, 104], [58.5, 96]],
      fore: [[60, 104], [66, 104], [66.5, 110], [67.5, 115], [66.5, 119], [63.5, 120.5], [60.5, 119], [59.5, 115], [60, 110]] },
  ];
  for (const a of arms) {
    d.fill(smooth(a.fore), fur);
    d.fill(smooth(a.sleeve), shirt);
  }

  // ---- 脚と足。足先は向いている方（sw は左下、ne は右上＝かかとが見える）。手前（右）の足が少し下
  d.fill(smooth([[37, 116], [44.5, 116], [44, 128], [38, 128]], 1), flat(C.pants, C.pantsDark));
  d.fill(smooth([[48.5, 117], [56.5, 117], [56, 129.5], [49.5, 129.5]], 1), flat(C.pants, C.pantsDark));
  const feet = back
    ? [[[37, 127], [44, 127], [46.5, 128.5, 1], [46, 131.5], [44, 133.5], [38.5, 133.5], [36, 131.5]],
      [[49, 128.5], [56, 128.5], [58.5, 130, 1], [58, 133], [56, 135.5], [50.5, 135.5], [48, 133]]]
    : [[[38, 127], [43.5, 127], [44.5, 130], [43.5, 133.5], [36, 133.5], [32.5, 132.5, 1], [33.5, 130], [36, 128.5]],
      [[49.5, 128.5], [55.5, 128.5], [56.5, 131.5], [55.5, 135.5], [47, 135.5], [44, 134.5, 1], [45, 132], [47.5, 130.5]]];
  for (const f of feet) d.fill(smooth(f), fur);

  // ---- しっぽ（sw：右の後ろから上へ巻く。ne：腰の後ろ＝こちらから左下へ垂れて先を上げる。胴より手前）
  if (!back) d.fill(tube([56, 116], [71, 120], [70, 104], 2.8, 2), fur);

  // ---- 胴（ベスト）。ずんぐりした洋なし形で、前の裾は合わせの所が少し尖る
  d.fill(smooth([
    [33, 88], [40, 86], [54, 86], [61, 88], [63, 93], [63.5, 104], [62.5, 112], [60, 117.5], [52, 119.5],
    back ? [47, 120] : [46, 121.5], back ? [42, 119.5] : [44, 123.5, 1], [41, 121], [35, 119], [32, 114.5], [31, 104], [31.5, 93],
  ]), vest);

  if (!back) {
    // 首元は手描き（下の NECK）
  } else {
    // 首の後ろのシャツの襟と、ベストの背中の襟
    d.fill(smooth([[36, 86], [58, 86], [57, 91], [47, 92.5], [37, 91]], 1), shirt);
    d.fill(tube([45, 116], [30, 125], [28, 108], 2.8, 2), fur);
  }

  // ---- 頭。前は耳が頭の後ろ、後ろ（ne）は耳が頭の手前で、付け根は頭と同じまとまり（線を引かない）
  const ears = back
    ? [earShapes(37, 63, L, -16, 5, -2), earShapes(58, 62, L, 16, 5.5, 2)]
    : [earShapes(35, 62, L, -18, 5, -2), earShapes(59, 61, L, 13, 5.5, 2)];
  if (!back) {
    const [far, near] = ears;
    d.fill(far.outer, (x, y, edge) => (far.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
    d.fill(near.outer, (x, y, edge) => (near.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
  }
  d.fill(headShape(back ? 1 : -1), fur, { group: 'head', tag: 'head' });
  // 帽子（耳と耳の間にちょこんと乗る）。後ろからは、耳が帽子より手前
  if (back) d.fillStamp(CAP_BACK, 37, 45, CAP_COLORS);
  else d.fillStamp(CAP_FRONT, 35, 45, CAP_COLORS);
  if (back) for (const e of ears) d.fill(e.outer, fur, { group: 'head' });

  d.finish();
  if (!back) d.stamp(NECK, 35, 89, { o: LINE, L: C.lapel, W: C.shirt, T: C.tie, t: C.tieDark }, { skip: 'head' });

  if (!back) {
    // ベストの金ボタンと、懐中時計の金の鎖
    for (const [bx, by] of [[40, 108], [40, 113], [49, 108], [49, 113]]) d.stamp(['gg', 'gG'], bx, by, { g: C.gold, G: C.goldDark });
    for (const [x, y] of [[51, 110], [52, 111], [53, 111], [54, 112], [55, 112], [56, 111]]) d.put(x, y, C.gold);
    // 目・鼻・口
    eye(d, 36.5, 76, 4, 6.2, -1);
    eye(d, 54, 76, 5.8, 6.6, 1);
    d.stamp(MOUTH, 42, 81, { n: C.nose, o: LINE });
    // 手の指の線
    for (const [x, y] of [[62, 119], [64, 119], [28, 117]]) d.put(x, y, LINE);
  } else {
    // ベストの背中の縫い目
    for (let y = 93; y <= 117; y++) d.put(48, y, C.vestDark);
    for (const [x, y] of [[62, 119], [64, 119], [28, 117]]) d.put(x, y, LINE);
  }

  const flip = frame.endsWith('e') !== back;   // se は sw の反転、nw は ne の反転
  return d.result(flip);
}
