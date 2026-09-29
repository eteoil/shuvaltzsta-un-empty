// バニーキャット（ウサギの耳の二足歩行の猫。駅員のチェルー・ドルー・デルー）のドット絵。1ドット＝1px、線も1ドット。
// 図形を奥から順に塗り、パーツの境目と外側に1ドットの線を引く。
//
// 大きさ：耳を除いた帽子のてっぺんから足の裏まで約 88 ドットで、主人公（約 132 ドット）の 2/3。耳はその上に立つ。
// 骨格：頭が大きい2頭身の猫。耳は頭のてっぺんの左右から生え、帽子の後ろを通って後ろへ少し倒れる。
//   首は短く頭に隠れる。胴は洋なし形。腕は肩から下ろし、先に丸い手。脚は短く、足先は向いている方へ出る。
//   しっぽは腰の後ろ（背骨の端）から出る。
// 向き（クォータービュー）：南西（sw）は体を左下へ向けた斜め前。顔と胸は左へ寄り、遠い側（左）の目は細く小さく、
//   遠い側の腕は胴の後ろに半分隠れ、手前の足は少し下。しっぽは右の後ろからのぞく。南東（se）はその左右反転。
//   北東（ne）は右上へ向けた斜め後ろ（背中・帽子の後ろ・しっぽ）。北西（nw）はその左右反転。
// 手は下ろし、口は閉じている。帽子・襟・ネクタイ・ボタン・目は参考画像（チェルー）から、画像に無い脚・しっぽ・背中は想像

import { createDots, flat, ellipse, poly, any, capsule, tube, rotate, LINE } from './dotArt.js';

export const BUNNY_CAT_SIZE = [96, 144];
export const BUNNY_CAT_ANCHOR = [48, 136];


// ear は耳の長さ（根元から先まで）。チェルーはドルーの半分
export const BUNNY_CAT_STYLES = {
  cheru: { ear: 30, fur: '#9aa39c', furDark: '#78817b', earIn: '#d4aec2' },
  doru: { ear: 60, fur: '#9aa39c', furDark: '#78817b', earIn: '#d4aec2' },
  deru: { ear: 30, fur: '#c8b48c', furDark: '#9c8a66', earIn: '#e6b4ac' },
};

const C = {
  cap: '#bccad6', capDark: '#93a4b4', capTop: '#dde6ee',
  band: '#4f5a6c', visor: '#3a4254', visorLight: '#66728a',
  gold: '#e0b660', goldDark: '#a0742e',
  jacket: '#9db6bd', jacketDark: '#7892a0',
  shirt: '#f6f2ea', shirtDark: '#d2cad4',
  tie: '#d2848e', tieDark: '#9a4c5e',
  pants: '#5d6c80', pantsDark: '#475467',
  eye: '#dfe35a', eyeDark: '#a3a938', white: '#ffffff', nose: '#d58a96', blush: '#e6a4ae',
};

export function bunnyCatDots(styleId, frame) {
  const st = BUNNY_CAT_STYLES[styleId] ?? BUNNY_CAT_STYLES.cheru;
  const [W, H] = BUNNY_CAT_SIZE;
  const back = frame.startsWith('n');
  const d = createDots(W, H);
  const { fill } = d;
  // 耳：根元 (x, y) から、傾き deg（0 で真上、+ で右へ倒れる）に長さ len。幅は根元で細く、真ん中が広い
  const ear = (x, y, len, deg, w) => {
    const r = (deg * Math.PI) / 180;
    const cx = x + Math.sin(r) * (len / 2);
    const cy = y - Math.cos(r) * (len / 2);
    return { outer: ellipse(cx, cy, w, len / 2 + 1, deg), inner: ellipse(cx + Math.sin(r) * 1.5, cy - Math.cos(r) * 1.5 + 2, w * 0.45, len / 2 - 3, deg) };
  };

  const L = st.ear;
  // 帽子：上から見下ろすので、てっぺんは広い楕円。胴は下へ少しすぼまり、下に濃い帯。つばは向いている側（左下）へ出る
  // 帽子は頭に合わせて少し傾ける（前＝つばの側が下がる）。南西では前が左なので、左下がり
  const tilt = (shape, deg) => rotate(shape, deg, 47, 62);
  const capDeg = back ? 6 : -7;
  const capTop = tilt(ellipse(47, 54, 16.5, 5.5), capDeg);
  const capShape = tilt(poly([[30.5, 54], [63.5, 54], [62.5, 67], [31.5, 67]]), capDeg);
  const bandShape = tilt(poly([[31, 62], [63, 62], [62.5, 67.5], [31.5, 67.5]]), capDeg);
  // ---------------------------------------------------------------- 斜め前（南西）
  if (!back) {
    // 耳（奥・手前とも帽子の後ろ。後ろ＝右へ倒れる。奥の耳は細く、内側はほとんど見えない）
    const far = ear(38, 60, L, 4, 5);
    fill(far.outer, flat(st.fur, st.furDark));
    const near = ear(56, 61, L, 14, 6);
    fill(near.outer, (x, y, edge) => (near.inner(x + 0.5, y + 0.5) ? st.earIn : edge ? st.furDark : st.fur));
    // しっぽ（右の後ろ、腰から出て上へ巻く）
    fill(tube([58, 122], [74, 125], [73, 108], 3, 2.2), flat(st.fur, st.furDark));
    // 奥の腕（胴の後ろ。先の手だけ見える）
    fill(capsule([33, 105], [29, 120], 8), flat(C.jacket, C.jacketDark));
    fill(ellipse(29, 123, 4, 3.8), flat(st.fur, st.furDark));
    // 脚（ズボン）と足。足先は左下へ出る。手前（右）の足が少し下
    fill(any(poly([[36, 124], [45, 124], [44, 132], [37, 132]]), poly([[48, 124], [57, 124], [56, 133], [49, 133]])), flat(C.pants, C.pantsDark));
    fill(ellipse(38, 133.5, 6, 3), flat(st.fur, st.furDark));
    fill(ellipse(50, 134.5, 6.5, 3.2), flat(st.fur, st.furDark));
    // 胴（上着。洋なし形）
    fill((x, y) => ellipse(46, 113, 16, 15)(x, y) && y < 127, flat(C.jacket, C.jacketDark));
    // 白い襟（胸の真ん中は左へ寄る）とネクタイ
    fill(poly([[33, 99], [53, 99], [41, 116]]), flat(C.shirt, C.shirtDark));
    fill(any(poly([[35, 102], [41, 104], [35, 107]]), poly([[47, 102], [41, 104], [47, 107]])), flat(C.tie, C.tieDark));
    fill(any(ellipse(41, 104.5, 2, 2), poly([[40, 106], [42.5, 106], [43, 112], [41, 114], [39.5, 112]])), flat(C.tie, C.tieDark));
    // 手前の腕（胴の前、少し前へ。先に丸い手）
    fill(capsule([58, 104], [61, 118], 8.5), flat(C.jacket, C.jacketDark));
    fill(ellipse(61, 121.5, 4.5, 4.2), flat(st.fur, st.furDark));
    // 頭（丸く大きい。ほおの毛の房は左右に。顔は左へ寄る）
    const tufts = [poly([[23, 86], [22, 96], [16, 93]]), poly([[25, 94], [27, 101], [18, 99]]), poly([[69, 86], [70, 96], [75, 92]]), poly([[67, 94], [65, 100], [73, 98]])];
    fill(any(ellipse(46, 81, 25, 20.5), ellipse(35, 91, 11, 8), ...tufts), flat(st.fur, st.furDark));
    // 帽子（てっぺんの楕円・胴・帯・左下へ出るつば・金の記章）
    fill(capShape, (x, y, edge) => (edge ? C.capDark : C.cap));
    fill(capTop, flat(C.capTop));
    fill(bandShape, flat(C.band));
    fill(tilt((x, y) => ellipse(37, 67.5, 15, 5)(x, y) && y > 66.5, capDeg), (x, y) => (y < 70 && x < 44 ? C.visorLight : C.visor));
  } else {
    // ---------------------------------------------------------------- 斜め後ろ（北東）
    // しっぽ（腰の後ろ＝こちら側から出て、左下へ垂れて先を上げる。胴より手前）
    // 奥の腕
    fill(capsule([31, 105], [28, 120], 8), flat(C.jacket, C.jacketDark));
    fill(ellipse(28, 123, 4, 3.8), flat(st.fur, st.furDark));
    // 脚と足（かかと側。手前（右）の足が少し下）
    fill(any(poly([[37, 124], [46, 124], [45, 132], [38, 132]]), poly([[49, 124], [58, 124], [57, 133], [50, 133]])), flat(C.pants, C.pantsDark));
    fill(ellipse(42, 133.5, 5.5, 3), flat(st.fur, st.furDark));
    fill(ellipse(54, 134.5, 5.5, 3.2), flat(st.fur, st.furDark));
    // 胴（上着の背中）
    fill((x, y) => ellipse(48, 113, 16, 15)(x, y) && y < 127, flat(C.jacket, C.jacketDark));
    // 手前の腕
    fill(capsule([62, 104], [65, 118], 8.5), flat(C.jacket, C.jacketDark));
    fill(ellipse(65, 121.5, 4.5, 4.2), flat(st.fur, st.furDark));
    fill(tube([44, 121], [29, 128], [27, 113], 3.2, 2.2), flat(st.fur, st.furDark));
    // 頭の後ろ（右のほおの房だけ見える）
    const tufts = [poly([[71, 86], [72, 96], [77, 92]]), poly([[69, 94], [67, 100], [75, 98]]), poly([[42, 99], [48, 99], [45, 104]]), poly([[48, 99], [54, 99], [51, 103]])];
    fill(any(ellipse(48, 81, 25, 20.5), ...tufts), flat(st.fur, st.furDark));
    // 帽子の後ろ（つばは奥なので見えない）
    fill(capShape, (x, y, edge) => (edge ? C.capDark : C.cap));
    fill(capTop, flat(C.capTop));
    fill(bandShape, flat(C.band));
    // 耳（後ろからは帽子より手前。帽子の後ろの縁から立ち、こちらへ少し倒れる）
    const far = ear(38, 64, L, -8, 5);
    fill(far.outer, flat(st.fur, st.furDark));
    const near = ear(57, 65, L, 6, 6);
    fill(near.outer, flat(st.fur, st.furDark));
  }

  // ---------------------------------------------------------------- 線と、線の上に描く細かいところ
  d.finish();
  const put = (x, y, c) => d.put(x, y, c);
  const rect = (x0, y0, x1, y1, c) => d.rect(x0, y0, x1, y1, c);
  const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

  if (!back) {
    // 記章（金のひし形。帽子の前＝左寄り）
    for (const [dx, dy] of [[0, -2], [-1, -1], [0, -1], [1, -1], [-2, 0], [-1, 0], [1, 0], [2, 0], [-1, 1], [0, 1], [1, 1], [0, 2]]) put(40 + dx, 60 + dy, C.gold);
    put(40, 60, C.goldDark);
    // 上着の金ボタン（2列。前の合わせが左寄りなので、奥の列は詰まる）
    for (const [bx, by] of [[36, 112], [45, 112], [37, 119], [45, 119]]) { put(bx, by, C.gold); put(bx + 1, by, C.gold); put(bx + 1, by + 1, C.goldDark); put(bx, by + 1, C.gold); }
    // 目（大きな黄緑。手前（右）の目は大きく、奥（左）の目は細い。濃い輪と、右上に白い光）
    const eye = (cx, cy, rx, ry) => {
      const inE = (x, y) => ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;
      for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
        for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
          if (!inE(x, y)) continue;
          const edge = N4.some(([a, b]) => !inE(x + a, y + b));
          const r = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry);
          put(x, y, edge ? LINE : r > 0.62 ? C.eyeDark : C.eye);
        }
      }
      // 瞳は大きめで少し下。光は右上に大きく、左下に小さく
      const px = Math.round(cx - 0.5);
      const py = Math.round(cy);
      rect(px - 1, py - 1, px + 1, py + 2, LINE);
      rect(px - (rx > 5 ? 2 : 1), py, px + (rx > 5 ? 2 : 1), py + 1, LINE);
      rect(Math.round(cx + rx * 0.2), Math.round(cy - ry * 0.55), Math.round(cx + rx * 0.2) + 1, Math.round(cy - ry * 0.55) + 1, C.white);
      put(px - 1, py + 3, C.white);
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { let y = Math.floor(cy - ry); while (y < cy && !inE(x, y)) y++; if (y < cy) put(x, y + 1, LINE); }   // まぶた（上の縁を内側へ1ドット太く）
    };
    eye(32.5, 85, 4.5, 6.5);
    eye(50, 85, 6.5, 7);
    // ほおの赤み
    rect(55, 94, 58, 95, C.blush);
    rect(26, 94, 27, 95, C.blush);
    // 鼻と、閉じた口（ω）
    rect(38, 92, 40, 93, C.nose);
    put(38, 92, LINE); put(40, 92, LINE);
    put(39, 94, LINE);
    for (const [x, y] of [[38, 95], [37, 96], [36, 96], [35, 95], [40, 95], [41, 96], [42, 96], [43, 95]]) put(x, y, LINE);
  } else {
    // 背中：上着の真ん中の縫い目
    rect(50, 101, 50, 120, C.jacketDark);
  }

  const flip = frame.endsWith('e') !== back;   // se は sw の反転、nw は ne の反転
  return d.result(flip);
}
