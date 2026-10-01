// 奈落の鬼、鬼灯（ほおずき）のドット絵。1ドット＝1px、線も1ドット。80×160 の枠で、足元は (40, 152)（主人公より2割ほど大きい）。
// 頭に鬼の面（朱の顔・小さな角・白い太眉・垂れ目・団子鼻・ひげ・赤い唇）をのせ、赤い頭巾に灰色の角と銀の鈴。
// 面の下から本人の顔（白い肌・紫の前髪・赤い目）がのぞき、頭巾のふちは白いぎざぎざ。
// 白いふわふわの襟に、緑の葉と橙の鬼灯の首飾り。白い着物の長い袖、赤い帯、紫の袴に赤い前垂れ、赤い鉤爪の足。
// 背中に大きな緑の葉。手前の手に、赤い目の紫の小さな人形を持つ。
// 向きは南西（左下）を向いた斜め前。南東は左右反転
import { createDots, flat, ellipse, poly, capsule } from './dotArt.js';

export const HOZUKI_SIZE = [80, 160];
export const HOZUKI_ANCHOR = [40, 152];

const C = {
  leaf: '#6e8f3a', leafDark: '#557130',
  horn: '#6c6c80', hornLight: '#9a9ab0',
  bell: '#c9cdd8', bellDark: '#8d92a4',
  hood: '#b8322e', hoodDark: '#8e2321',
  mask: '#d4673a', maskDark: '#b04f2a', maskHorn: '#c45a30',
  brow: '#f6f2ea', eye: '#5c7bb0', nose: '#c25a32', stache: '#5a3324', lip: '#c03030',
  skin: '#f4e6dc', hair: '#3a2a55', redEye: '#c8343a',
  fur: '#f6f4f8', furShade: '#cfc9df',
  hozuki: '#e07a2e', hozukiDark: '#b85a1e', green: '#6aa24a', greenDark: '#4b7d34',
  sleeve: '#f6f4f8', sleeveShade: '#c9c3dc',
  obi: '#c0302c', obiDark: '#93231f',
  hakama: '#4f4590', hakamaDark: '#3b3470',
  apron: '#c0302c', apronDark: '#93231f',
  foot: '#c8352c', footDark: '#982620',
  doll: '#5b4e7a', dollDark: '#43395c',
};

export function hozukiDots() {
  const [W, H] = HOZUKI_SIZE;
  const d = createDots(W, H, { shade: 0 });

  // 背中の大きな葉（左上へ伸びる）
  d.fill(poly([[30, 34], [8, 14], [4, 4], [16, 2], [34, 18], [40, 30]]), (x, y) => (x + y < 30 ? C.leafDark : C.leaf));
  // 頭巾の角と鈴
  d.fill(poly([[50, 22], [62, 18], [64, 2]]), (x, y) => (x > 59 ? C.hornLight : C.horn));
  // 奥の袖（右に垂れる）
  d.fill(poly([[54, 66], [70, 70], [74, 108], [58, 112], [54, 100]]), (x, y) => (x > 66 ? C.sleeveShade : C.sleeve));
  // 袴（裾が広がる）と赤い前垂れ
  d.fill(poly([[18, 104], [62, 104], [68, 144], [56, 146], [40, 142], [24, 146], [12, 144]]), (x, y) => (x > 54 ? C.hakamaDark : C.hakama));
  d.fill(poly([[26, 104], [50, 104], [52, 140], [40, 144], [24, 140]]), (x, y) => ([32, 39, 46].includes(x) ? C.apronDark : C.apron));
  // 赤い鉤爪の足
  for (const [x0, y0] of [[14, 142], [44, 142]]) {
    d.fill(poly([[x0 + 4, y0], [x0 + 16, y0], [x0 + 18, y0 + 9], [x0, y0 + 10], [x0 - 2, y0 + 7]]), (x, y) => (y > y0 + 7 ? C.footDark : C.foot));
  }
  // 着物の胴と赤い帯
  d.fill(poly([[18, 62], [62, 62], [64, 106], [16, 106]]), (x, y) => (x > 56 ? C.sleeveShade : C.sleeve), { tag: 'body' });
  d.fill(poly([[16, 96], [64, 96], [64, 106], [16, 106]]), (x, y) => (y > 103 ? C.obiDark : C.obi));
  // 手前の袖（前へ出した腕から大きく垂れる）と、手に持つ人形
  d.fill(poly([[18, 64], [30, 70], [28, 88], [24, 112], [6, 110], [4, 92], [10, 76]]), (x, y) => (y > 104 ? C.sleeveShade : C.sleeve));
  d.fill(ellipse(9, 86, 7, 6), (x, y) => (y > 88 ? C.dollDark : C.doll));
  // ふわふわの白い襟（毛先がぎざぎざ）
  const ruff = (x, y) => {
    const r = ((x - 40) / 27) ** 2 + ((y - 56) / 10) ** 2;
    const tuft = 0.12 * Math.sin(x * 1.1) + 0.1 * Math.sin(x * 0.53 + 1);
    return r <= 1 + tuft;
  };
  d.fill(ruff, (x, y) => (y > 60 ? C.furShade : C.fur));
  // 首飾り：橙の鬼灯と緑の葉を交互に
  [[18, 63, 'h'], [24, 66, 'g'], [30, 67, 'h'], [36, 68, 'g'], [43, 68, 'h'], [50, 67, 'g'], [56, 65, 'h'], [62, 62, 'g']].forEach(([x, y, k]) => {
    if (k === 'h') d.fill(poly([[x - 3, y - 2], [x + 3, y - 2], [x + 4, y + 2], [x, y + 5], [x - 4, y + 2]]), (px, py) => (py > y + 2 ? C.hozukiDark : C.hozuki));
    else d.fill(poly([[x - 4, y], [x, y - 3], [x + 4, y], [x, y + 3]]), (px, py) => (px > x ? C.greenDark : C.green));
  });
  // 赤い頭巾と、下のふちの白いぎざぎざ
  d.fill(ellipse(44, 34, 20, 18), (x, y) => (x > 56 ? C.hoodDark : C.hood), { tag: 'hood' });
  d.fill(ellipse(62, 34, 4.5, 4.5), (x, y) => (x + y > 98 ? C.bellDark : C.bell));
  // 面の下からのぞく本人の顔と前髪
  d.fill(poly([[34, 38], [56, 36], [58, 46], [52, 52], [38, 52]]), (x, y) => (y < 42 ? C.hair : C.skin));
  d.fill((x, y) => y >= 47 && y <= 52 && x >= 30 && x <= 60 && (y - 47) < 3 + 2 * Math.abs(((x - 30) % 6) - 3) - 2, flat(C.fur), { line: false });
  // 鬼の面（頭の左前にのる。顔は左下を向く）
  d.fill(poly([[16, 10], [12, 2], [20, 8]]), flat(C.maskHorn));
  d.fill(poly([[30, 6], [32, -2], [36, 8]]), flat(C.maskHorn));
  d.fill(poly([[10, 14], [20, 6], [36, 6], [42, 14], [42, 36], [36, 48], [22, 50], [12, 44], [8, 30]]), (x, y) => (x > 38 ? C.maskDark : C.mask), { tag: 'mask' });
  d.finish();

  // 面の顔：白い太眉（外へ垂れる）、垂れ目、団子鼻、ひげ、赤い唇
  d.rect(11, 18, 21, 20, C.brow); d.rect(9, 21, 13, 22, C.brow);
  d.rect(25, 17, 35, 19, C.brow); d.rect(33, 20, 37, 21, C.brow);
  d.rect(13, 24, 19, 25, '#231815'); d.rect(14, 26, 18, 26, C.eye);
  d.rect(27, 23, 33, 24, '#231815'); d.rect(28, 25, 32, 25, C.eye);
  d.rect(19, 28, 26, 33, C.nose); d.rect(18, 30, 18, 33, '#231815'); d.rect(27, 30, 27, 33, '#231815'); d.rect(19, 34, 26, 34, '#231815');
  d.rect(12, 36, 33, 37, C.stache); d.rect(10, 38, 15, 39, C.stache); d.rect(30, 38, 35, 39, C.stache);
  d.rect(17, 40, 28, 42, C.lip); d.rect(17, 41, 28, 41, '#231815');
  // 本人の赤い目と、人形の赤い目
  d.rect(42, 44, 45, 46, '#231815'); d.rect(43, 45, 44, 45, C.redEye);
  d.put(6, 85, C.redEye); d.put(10, 85, C.redEye);
  return d.result();
}
