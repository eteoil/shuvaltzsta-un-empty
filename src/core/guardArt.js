// 監獄の看守（敵）のドット絵。1ドット＝1px、線も1ドット。主人公と同じ 64×136 の枠で、足元は (32, 128)。
// 紺の制帽（金の記章・黒いつば）と詰め襟の上着（金ボタン・茶の革ベルト・腰の鍵束）、黒い長靴、手に黒い警棒。
// 絵の向き：front は南西（左下）を向いた斜め前、back は北東（右上）を向いた斜め後ろ。南東と北西はそれぞれの左右反転。
// faint は倒されて気絶した姿（床に座り込んで頭を垂れ、帽子が脱げて横に落ちている。目は ×）
import { createDots, flat, ellipse, poly, capsule } from './dotArt.js';

export const GUARD_SIZE = [64, 136];
export const GUARD_ANCHOR = [32, 128];

const C = {
  skin: '#feebc8',
  skinDark: '#efd2a6',
  hair: '#4a3426',
  cap: '#26304e',
  capTop: '#33406a',
  band: '#1b2238',
  visor: '#15161e',
  gold: '#e0b53a',
  goldDark: '#a77d22',
  coat: '#2f3a5c',
  coatDark: '#232c47',
  pants: '#262f4b',
  belt: '#5a3a22',
  shirt: '#f2f2ee',
  boot: '#25222b',
  bootLight: '#45414f',
  baton: '#34343e',
  batonLight: '#62627a',
  brow: '#2e2018',
  mustache: '#4a3426',
};

// 帽子（てっぺんの大きな丸い天井・帯・記章）。dy で上下にずらす
function cap(d, dy = 0, { back = false } = {}) {
  d.fill(poly([[9, 17 + dy], [12, 7 + dy], [24, 2 + dy], [42, 2 + dy], [54, 7 + dy], [57, 16 + dy], [52, 22 + dy], [12, 23 + dy]]),
    (x, y) => (y < 9 + dy ? C.capTop : C.cap), { tag: 'cap' });
  d.fill(poly([[11, 19 + dy], [53, 18 + dy], [53, 24 + dy], [11, 25 + dy]]), flat(C.band), { group: 'cap' });
  if (!back) d.fill(ellipse(26, 12 + dy, 4, 4), (x, y) => ((x + y) % 3 === 0 ? C.goldDark : C.gold), { group: 'badge' });
}

export function guardDots(view) {
  const [W, H] = GUARD_SIZE;
  const d = createDots(W, H, { shade: 0 });
  if (view === 'faint') return faintDots(d);
  const back = view === 'back';

  // 奥の腕（体の右側）と、奥の脚・長靴
  d.fill(capsule([45, 58], [53, 84], 10), flat(C.coatDark));
  d.fill(ellipse(54, 89, 5, 5), flat(back ? C.skin : C.skinDark));
  d.fill(poly([[33, 94], [45, 94], [45, 116], [34, 116]]), flat(C.pants));
  d.fill(poly([[33, 113], [46, 113], [48, 122], [47, 127], [33, 127]]), (x, y) => (y < 116 ? C.bootLight : C.boot));
  // 手前の脚と長靴（つま先は左下へ）
  d.fill(poly([[19, 94], [32, 94], [31, 117], [20, 117]]), flat(C.pants));
  d.fill(poly([[19, 114], [32, 114], [32, 130], [12, 130], [11, 125], [18, 121]]), (x, y) => (y < 117 ? C.bootLight : C.boot));
  // 上着（すそが少し広がる）
  d.fill(poly([[17, 53], [46, 53], [49, 62], [48, 98], [15, 98], [14, 62]]), (x, y) => (x > 40 ? C.coatDark : C.coat), { tag: 'coat' });
  if (!back) {
    // 詰め襟の白いのぞきと、前立ての金ボタン
    d.fill(poly([[24, 53], [34, 53], [29, 59]]), flat(C.shirt), { group: 'coat' });
    for (const y of [64, 72, 80, 93]) d.fill(ellipse(28, y, 1.6, 1.6), flat(C.gold), { line: false });
    d.stroke([[28, 60], [28, 61], [28, 62], [28, 66], [28, 67], [28, 68], [28, 74], [28, 75], [28, 76], [28, 89], [28, 90], [28, 91], [28, 95], [28, 96], [28, 97]], C.coatDark);
  } else {
    // 背中の縫い目
    d.stroke(Array.from({ length: 30 }, (_, k) => [33, 60 + k]), C.coatDark);
  }
  // 革ベルトと、腰の鍵束
  d.fill(poly([[15, 84], [48, 84], [48, 89], [15, 89]]), flat(C.belt), { group: 'coat' });
  if (!back) d.fill(poly([[24, 84], [31, 84], [31, 89], [24, 89]]), flat(C.gold));
  d.fill(ellipse(back ? 18 : 44, 94, 3.5, 3.5), flat(C.gold));
  d.fill(ellipse(back ? 18 : 44, 94, 1.6, 1.6), flat(C.coatDark), { line: false });
  // 手前の腕（体の左側）と手、警棒（手から下へ）
  if (!back) d.fill(capsule([8, 86], [3, 112], 5), (x, y) => (x < 5 ? C.batonLight : C.baton));
  d.fill(capsule([17, 58], [11, 84], 10), flat(C.coat));
  d.fill(ellipse(10, 89, 5, 5), flat(C.skin));
  if (back) d.fill(capsule([56, 86], [61, 110], 5), (x, y) => (x > 59 ? C.batonLight : C.baton));

  // 首と頭
  d.fill(poly([[25, 47], [37, 47], [36, 55], [26, 55]]), flat(back ? C.skin : C.skinDark));
  if (back) {
    // 後ろ頭：刈り上げた髪と、左の耳
    d.fill(ellipse(32, 34, 21, 16), (x, y) => (y > 44 ? C.skin : C.hair));
    d.fill(ellipse(11, 34, 4, 5), flat(C.skin));
    cap(d, 0, { back: true });
    // 後ろから見えるつばの端
    d.fill(poly([[52, 22], [57, 21], [57, 25], [52, 25]]), flat(C.visor));
  } else {
    d.fill(ellipse(52, 33, 4, 5), flat(C.skin));          // 奥の耳
    d.fill(ellipse(48, 30, 7, 9), flat(C.hair));          // 帽子の下の後ろ髪
    d.fill(ellipse(29, 34, 21, 16), (x, y) => (x > 44 ? C.skinDark : C.skin), { tag: 'face' });
    cap(d);
    // 黒いつば（左下へ張り出す）
    d.fill(poly([[7, 22], [33, 23], [36, 28], [9, 29], [5, 26]]), flat(C.visor));
  }
  d.finish();
  if (!back) {
    // 顔：つり上がった太い眉、細めた目、鼻、八の字のひげ
    d.rect(15, 32, 21, 32, C.brow); d.rect(17, 31, 21, 31, C.brow);
    d.rect(30, 31, 34, 31, C.brow); d.rect(30, 32, 36, 32, C.brow);
    d.rect(16, 36, 21, 36, '#231815'); d.rect(18, 37, 20, 37, '#231815');
    d.rect(30, 36, 35, 36, '#231815'); d.rect(31, 37, 33, 37, '#231815');
    d.put(24, 40, C.skinDark); d.put(24, 41, C.skinDark); d.put(23, 42, C.skinDark);
    d.rect(17, 44, 31, 45, C.mustache); d.rect(16, 46, 19, 46, C.mustache); d.rect(29, 46, 32, 46, C.mustache);
    d.rect(21, 48, 27, 48, '#231815');
  }
  return d.result();
}

// 気絶：床に座り込み、上体を少し後ろへ倒して頭を垂れる。脱げた帽子は右の床に落ちている
function faintDots(d) {
  // 落ちた帽子（右の床）
  d.fill(poly([[42, 116], [46, 110], [56, 109], [61, 113], [60, 120], [44, 121]]), (x, y) => (y < 112 ? C.capTop : C.cap));
  d.fill(poly([[43, 118], [60, 117], [60, 121], [44, 122]]), flat(C.band));
  // 投げ出した脚（左下へ）と長靴
  d.fill(poly([[22, 104], [38, 104], [30, 122], [16, 122]]), flat(C.pants));
  d.fill(poly([[30, 108], [42, 110], [36, 124], [26, 120]]), flat(C.pants));
  d.fill(poly([[16, 116], [28, 118], [24, 130], [8, 130], [7, 124]]), (x, y) => (y < 120 ? C.bootLight : C.boot));
  d.fill(poly([[28, 118], [38, 120], [36, 130], [24, 130]]), (x, y) => (y < 122 ? C.bootLight : C.boot));
  // 奥の腕（だらりと床へ）
  d.fill(capsule([44, 82], [50, 104], 9), flat(C.coatDark));
  d.fill(ellipse(51, 107, 4.5, 4), flat(C.skinDark));
  // 上着（座っているので短い）とベルト
  d.fill(poly([[18, 76], [44, 74], [47, 84], [46, 110], [16, 110], [15, 84]]), (x, y) => (x > 39 ? C.coatDark : C.coat), { tag: 'coat' });
  d.fill(poly([[16, 100], [47, 100], [47, 105], [16, 105]]), flat(C.belt), { group: 'coat' });
  d.fill(poly([[25, 100], [31, 100], [31, 105], [25, 105]]), flat(C.gold));
  // 手前の腕と、床に転がった警棒
  d.fill(capsule([4, 116], [22, 124], 5), (x, y) => (y < 119 ? C.batonLight : C.baton));
  d.fill(capsule([18, 80], [11, 104], 9), flat(C.coat));
  d.fill(ellipse(10, 108, 4.5, 4), flat(C.skin));
  // 垂れた頭（髪が見える。目は ×）
  d.fill(ellipse(30, 58, 20, 16), (x, y) => (y < 50 ? C.hair : x > 44 ? C.skinDark : C.skin));
  d.finish();
  for (const [cx, cy] of [[20, 60], [33, 60]]) {
    for (let k = -2; k <= 2; k++) { d.put(cx + k, cy + k, '#231815'); d.put(cx + k, cy - k, '#231815'); }
  }
  d.rect(19, 66, 31, 67, C.mustache);
  d.rect(23, 70, 27, 70, '#231815');
  return d.result();
}
