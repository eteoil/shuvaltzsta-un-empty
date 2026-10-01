// マップに置く物の、コードで描くドット絵（クォータービュー）。1ドット＝1px、線も1ドット。
// 床のマス（80×40 のひし形）と同じ角度の箱として組み立てる。iso(i, j, z) はマスの中心からのずれ
// （i・j はマス単位、z は高さのドット）を絵の中の座標にする。i は右下（南東）、j は左下（南西）へ伸びる。
import { createDots, flat, poly, ellipse, any, linePoints, arcPoints, LINE } from './dotArt.js';

const TILE_HALF = [40, 20];   // マスの半分の幅と高さ（data/sprites.json の floor.tile の半分）

// 銀行の出納機。レトロなスチームパンク風：マホガニーの箱を真鍮の縁と鋲で留め、正面に圧力計と琥珀色に光るガラス窓、
// タイプライターのような丸い真鍮のキー、取っ手の付いた引き出し。左の面には銅の管とバルブの輪、上には煙突。
// 正面は南東（+i）を向く（左の壁に並べ、右下から向き合う）。
// 高さは本体 96 ドット（煙突を入れて約 110）で、主人公（約 132 ドット）の肩から頭くらい。幅はマスの 3/4 ほど
export const ATM = { size: [96, 150], anchor: [48, 132] };

const COL = {
  wood: '#6e3b26', woodDark: '#552c1c', woodLight: '#8a5034',
  brass: '#c9a14a', brassLight: '#ecd08a', brassDark: '#8a6a2a',
  copper: '#b8673a', copperLight: '#e39a66', copperDark: '#7e4024',
  iron: '#3d3b42', ironLight: '#5c5963',
  dial: '#efe6cf', needle: '#c0392b', tick: '#5a4a3a',
  glass: '#e8a43a', glassLight: '#ffd98a', glassDark: '#a8661e',
  key: '#f3eee6', slot: '#231815',
};

export function atmDots() {
  const [W, H] = ATM.size;
  const [ax, ay] = ATM.anchor;
  const d = createDots(W, H, { shade: 0 });
  const iso = (i, j, z) => [ax + (i - j) * TILE_HALF[0], ay + (i + j) * TILE_HALF[1] - z];
  const round = ([x, y]) => [Math.round(x), Math.round(y)];
  // 線は自動では引かず、辺や切り口ごとに手で引く（core/dotArt.js の stroke）。面は線なしで塗る
  const plain = { line: false };
  const edge = (p, q) => d.stroke(linePoints(p[0], p[1], q[0], q[1]));
  const edges = (pts) => pts.forEach((p, k) => edge(p, pts[(k + 1) % pts.length]));
  // 箱（i0〜i1, j0〜j1, z0〜z1）の見える3面：左（南西向き・光が当たる）・正面（南東向き）・上。
  // 辺は、上の面の4辺・手前の縦の3辺・下の2辺。boxEdges を分けてあるのは、面の上に飾りを塗ってから辺を引くため
  const boxFaces = (i0, i1, j0, j1, z0, z1, c) => {
    d.fill(poly([iso(i0, j1, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.left), plain);
    d.fill(poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]), flat(c.front), plain);
    d.fill(poly([iso(i0, j0, z1), iso(i1, j0, z1), iso(i1, j1, z1), iso(i0, j1, z1)]), flat(c.top), plain);
  };
  const boxEdges = (i0, i1, j0, j1, z0, z1) => {
    edges([iso(i0, j0, z1), iso(i1, j0, z1), iso(i1, j1, z1), iso(i0, j1, z1)]);
    for (const [i, j] of [[i0, j1], [i1, j1], [i1, j0]]) edge(iso(i, j, z0), iso(i, j, z1));
    edge(iso(i0, j1, z0), iso(i1, j1, z0));
    edge(iso(i1, j1, z0), iso(i1, j0, z0));
  };
  const box = (...a) => { boxFaces(...a); boxEdges(...a.slice(0, 6)); };
  // 正面（i = i1 の面）の上の四角（j・z で書く）。framed なら縁に線を引く
  const frontRect = (i1, j0, j1, z0, z1, paint, framed = true) => {
    const pts = [iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)];
    d.fill(poly(pts), paint, plain);
    if (framed) edges(pts);
  };
  // 正面（i = I1 の面）に貼りついた円。面は南東を向いていて、横の向きは画面で 2:1 に傾く。
  // 面の上の横の長さ h と高さ z は、画面のずれ (dx, dy) から h = -dx × √5 / 2、z = -dx / 2 - dy で出る。
  // その円（h² + z² ≤ R²）で塗り、縁の線は塗った形の内側の縁（上下左右のどれかが外のドット）にする。左右対称で、角に余分な点が出ない
  const SQ5 = Math.sqrt(5) / 2;
  const onFace = (dx, dy) => [-dx * SQ5, -dx / 2 - dy];
  const faceDisc = (jc, zc, R) => {
    const [cx, cy] = iso(I1, jc, zc);
    return (x, y) => { const [h, v] = onFace(x - cx, y - cy); return h * h + v * v <= R * R; };
  };
  const rim = (shape, c = LINE) => {
    const pts = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!shape(x + 0.5, y + 0.5)) continue;
        if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !shape(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
    }
    d.stroke(pts, c);
  };
  // 面の上の (h, z)（中心からの横と高さのずれ）→ 画面の点
  const facePoint = (jc, zc, h, z) => {
    const [cx, cy] = iso(I1, jc, zc);
    const dx = -h / SQ5;
    return [Math.round(cx + dx - 0.5), Math.round(cy - dx / 2 - z - 0.5)];
  };
  // 左の面（j = j1 の面）の上の四角（飾りの帯。線は引かない）
  const onLeft = (j1, i0, i1, z0, z1) => poly([iso(i0, j1, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i0, j1, z1)]);
  const onFront = (i1, j0, j1, z0, z1) => poly([iso(i1, j0, z0), iso(i1, j1, z0), iso(i1, j1, z1), iso(i1, j0, z1)]);
  // 立てた円柱（(i, j) に立つ半径 r ドットの筒。z0〜z1）。クォータービューでは、上と下の切り口は横長の楕円（高さは幅の半分）。
  // 横の面は左が明るく右が暗い。線は、横の縦線2本と、下の切り口の手前半分の弧（下の物との境目）。
  // top があれば上の切り口を明るい楕円の面として塗り、その縁を一周引く。hole なら中に暗い穴をあける
  const cylinder = (i, j, z0, z1, r, c, { top = false, hole = false, topColor = c.light } = {}) => {
    const [x, y0] = iso(i, j, z0);
    const [, y1] = iso(i, j, z1);
    const side = any(poly([[x - r, y1], [x + r, y1], [x + r, y0], [x - r, y0]]), ellipse(x, y0, r, r / 2), ellipse(x, y1, r, r / 2));
    d.fill(side, (px) => (px + 0.5 < x - r * 0.35 ? c.light : px + 0.5 > x + r * 0.35 ? c.dark : c.base), plain);
    const left = Math.ceil(x - r - 0.5) - 1;
    const right = Math.floor(x + r - 0.5) + 1;
    d.stroke(linePoints(left, y1, left, y0));
    d.stroke(linePoints(right, y1, right, y0));
    d.stroke(arcPoints(x, y0, r + 0.5, r / 2 + 0.5, 0, Math.PI));
    if (top) {
      d.fill(ellipse(x, y1, r, r / 2), flat(topColor), plain);
      d.stroke(arcPoints(x, y1, r + 0.5, r / 2 + 0.5));
    }
    if (hole) d.fill(ellipse(x, y1, r * 0.6, r * 0.3), flat(COL.slot), plain);
  };

  const I0 = -0.3;
  const I1 = 0.2;
  // 辺の位置は 0.05 マス刻み（横 2 ドット・縦 1 ドット）にそろえる。斜めの線が乱れず、きれいな 2:1 の段々になる
  const J = 0.4;
  const wood = { left: COL.woodLight, front: COL.wood, top: COL.woodLight };
  const brass = { left: COL.brassLight, front: COL.brass, top: COL.brassLight };
  const iron = { left: COL.ironLight, front: COL.iron, top: COL.ironLight };

  // 鉄の台。本体より 0.1 マス（画面で縦 2 ドット）はみ出させ、台の辺と本体の下の辺の間に台の上面が見えるようにする。
  // 左（管の側）はさらに広くして、管の台座が台の縁に掛からずに乗るようにする
  box(I0 - 0.1, I1 + 0.1, -J - 0.1, J + 0.25, 0, 7, iron);
  // マホガニーの本体と、真鍮の縁（角の縦の帯と、下の横の帯）。縁を塗ってから辺を引く
  boxFaces(I0, I1, -J, J, 7, 82, wood);
  d.fill(onFront(I1, -J, -J + 0.05, 7, 82), flat(COL.brassDark), plain);
  d.fill(onFront(I1, J - 0.05, J, 7, 82), flat(COL.brass), plain);
  d.fill(onLeft(J, I0, I0 + 0.05, 7, 82), flat(COL.brass), plain);
  d.fill(onFront(I1, -J, J, 7, 10), flat(COL.brassDark), plain);
  d.fill(onLeft(J, I0, I1, 7, 10), flat(COL.brass), plain);
  boxEdges(I0, I1, -J, J, 7, 82);
  // 左の面：床から上へ登る銅の管と、バルブの輪。左の面の角寄りに立てる
  const PI = -0.05;
  const PJ = J + 0.05;
  const copper = { base: COL.copper, light: COL.copperLight, dark: COL.copperDark };
  const brassRing = { base: COL.brass, light: COL.brassLight, dark: COL.brassDark };
  // 下から順に、輪（鉄の台の上の台座と留め輪）→ その上の管、と重ねる。管は輪の上面の楕円から出る
  let z = 7;
  for (const ring of [7, 20, 40, 66]) {
    if (ring > z) cylinder(PI, PJ, z, ring, 3, copper);
    cylinder(PI, PJ, ring, ring + 3, 4.5, brassRing, { top: true });
    z = ring + 3;
  }
  cylinder(PI, PJ, z, 86, 3, copper);
  // 正面：圧力計（真鍮の縁の丸い文字盤）。冠より先に描き、冠との間にすき間をあける
  const GZ = 70;
  const outer = faceDisc(0, GZ, 8);
  const dial = faceDisc(0, GZ, 5.5);
  d.fill(outer, flat(COL.brass), plain);
  rim(outer);
  d.fill(dial, flat(COL.dial), plain);
  rim(dial, COL.brassDark);
  // 正面：琥珀色に光るガラス窓（真鍮の枠）
  frontRect(I1, -0.25, 0.25, 50, 62, flat(COL.brassDark));
  frontRect(I1, -0.2, 0.2, 52, 60, (x, y) => (y % 3 === 0 ? COL.glassLight : COL.glass));
  // キーの台（正面から手前へ張り出す真鍮の台）
  box(I1, I1 + 0.2, -0.3, 0.3, 40, 46, brass);
  // カードの差し込み口（真鍮の縁取り。中の細い穴は finish のあとに1ドットの線で引く）。キー台は手前へ張り出していて、
  // 画面では正面の z 36 あたりまで下に見えるので、それより下に置く
  frontRect(I1, 0.05, 0.25, 25, 30, flat(COL.brass));
  // 引き出し（お金の出し入れ口。取っ手は真鍮）
  frontRect(I1, -0.25, 0.25, 12, 22, flat(COL.woodDark));
  // 冠・上の段・煙突は正面の飾りより後に描く（張り出した冠が、正面の上の端を隠す）
  // 上の真鍮の冠（少し張り出す）と、その上の段
  box(I0 - 0.05, I1 + 0.05, -J - 0.05, J + 0.05, 82, 89, brass);
  box(I0 + 0.05, I1 - 0.05, -J + 0.1, J - 0.1, 89, 93, { left: COL.woodLight, front: COL.wood, top: COL.brassLight });
  // 煙突：上の段の上面（z 93）の奥寄りに真鍮の台座の輪を乗せ、銅の管はその上から立てる
  const [CI, CJ] = [-0.1, 0.15];
  cylinder(CI, CJ, 93, 95, 4, brassRing, { top: true, topColor: COL.brass });
  cylinder(CI, CJ, 95, 105, 2.5, copper);
  cylinder(CI, CJ, 104, 108, 4, brassRing, { top: true, hole: true });   // 頭の輪と、中の暗い穴

  d.finish({ outline: false });
  // 管の留め輪と根元の台座は、計算した線だと管の根元の弧と輪の上面の縁が2本並び、右へはみ出すので、手で描いたドットで上書きする。
  // 上から：輪の奥の縁・管の左右に見える上面・管の根元の線・管の手前の上面・側面（2行）・下の縁。'.' はそのまま
  const RING = [
    '.##CCcckk##.',
    '#L#CCcckk#d#',
    '#LL######dd#',
    '#LLLLLLLLbb#',
    '##bbbbbbdd##',
    '.#bbbbbbdd#.',
    '..########..',
  ];
  const ringColors = { '#': LINE, C: COL.copperLight, c: COL.copper, k: COL.copperDark, L: COL.brassLight, b: COL.brass, d: COL.brassDark };
  for (const ring of [7, 20, 40, 66]) {
    const [rx, ry] = round(iso(PI, PJ, ring + 3));
    d.stamp(RING, rx - 6, ry - 1, ringColors);
  }
  // 計器の縁の、外へ1ドット飛び出して見える右上と左下の角を内側へ寄せる（中心からのずれで書く）
  const [gx, gy] = round(iso(I1, 0, GZ));
  for (const [dx, dy] of [[5, -7], [-6, 6]]) d.put(gx + dx, gy + dy, LINE);
  for (const [dx, dy] of [[5, -8], [6, -7], [-7, 6]]) d.put(gx + dx, gy + dy, COL.wood);

  // 鋲（真鍮の縁と冠に、一定の間隔で光る点）
  for (let z = 14; z <= 78; z += 10) {
    d.put(...round(iso(I1, -J + 0.025, z)), COL.brassLight);
    d.put(...round(iso(I1, J - 0.025, z)), COL.brassLight);
    d.put(...round(iso(I0 + 0.025, J, z)), COL.brassLight);
  }
  for (let j = -0.3; j <= 0.31; j += 0.1) d.put(...round(iso(I1 + 0.05, j, 85)), COL.brassDark);
  for (let i = I0 + 0.05; i <= I1; i += 0.1) d.put(...round(iso(i, J + 0.05, 85)), COL.brassDark);
  // カードの差し込み口の細い穴（縁取りの真ん中を、面に沿って1ドットの線で）
  for (let j = 0.1; j <= 0.2001; j += 0.025) d.put(...round(iso(I1, j, 27.5)), COL.slot);
  // 圧力計の目盛りと針（左上を指す）
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * (1.25 - (k / 6) * 1.5);   // 左下から上を回って右下まで
    d.put(...facePoint(0, GZ, Math.cos(a) * 4, Math.sin(a) * 4), COL.tick);
  }
  for (let t = 0; t <= 3; t += 0.5) d.put(...facePoint(0, GZ, -t * 0.7, t * 0.7), COL.needle);   // 針は左上を指す
  d.put(...facePoint(0, GZ, 0, 0), COL.tick);
  // ガラス窓の中の数字の影（2行）
  for (const [z, j0, j1] of [[57, -0.16, 0.16], [54, -0.16, 0.06]]) {
    for (let j = j0; j <= j1; j += 0.05) d.put(...round(iso(I1, -j, z)), COL.glassDark);
  }
  // キー（台の上に、丸い白いキーを2列）
  for (const i of [I1 + 0.075, I1 + 0.15]) {
    for (const j of [-0.2, -0.07, 0.06, 0.19]) {
      const [x, y] = round(iso(i, j, 46));
      d.put(x, y, COL.key);
      d.put(x + 1, y, COL.brassDark);
    }
  }
  // 引き出しの取っ手と、バルブの輪
  for (let j = -0.1; j <= 0.1; j += 0.025) d.put(...round(iso(I1, j, 17)), COL.brassLight);
  const [vx, vy] = round(iso(PI, PJ, 52));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    d.put(Math.round(vx + Math.cos(a) * 4), Math.round(vy + Math.sin(a) * 4), COL.needle);
  }
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-2, 0], [2, 0], [0, -2], [0, 2]]) d.put(vx + dx, vy + dy, COL.copperDark);
  d.put(vx, vy, COL.brassLight);
  return d.result();
}

// 銀行の床（data/sprites.json の floor_bank）。出納機に合わせた、クルミ材の寄木張りに真鍮の象嵌。
// 形はふつうの床（floor_block.png）と同じ 80×80：上の 80×40 のひし形が床の面、その下が厚み（マップの縁で見える）。
// 床の面は 2×2 の区画に分け、区画ごとに板の向きを互い違いにする（バスケット編み）。板は1区画に3枚で、色を少しずつ変える。
// マスの継ぎ目には真鍮の線（隣のマスと二重にならないよう、北東と北西の2辺だけに引く）、真ん中に小さな真鍮のひし形。
// 厚みはマホガニーで、上の縁は真鍮。左（南西向き）は明るく、右（南東向き）は暗い
const FLOOR_COL = {
  planks: ['#5e3a26', '#52321f', '#6a4430'], seam: '#2e1a10', grain: '#46291a',
  brass: '#c9a14a', brassLight: '#ecd08a', brassDark: '#8a6a2a',
  left: '#6e3b26', right: '#4e2a1b', leftDark: '#5a3020', rightDark: '#3e2015',
};

export function bankFloorDots() {
  const W = 80;
  const H = 80;
  const out = Array.from({ length: H }, () => Array(W).fill(null));
  // 床の面の (x, y) → マスの中の位置 (u, v)。u は北西の辺から南東へ、v は北東の辺から南西へ、どちらも 0〜1
  const uv = (x, y) => [((x + 0.5 - 40) / 40 + (y + 0.5) / 20) / 2, (-(x + 0.5 - 40) / 40 + (y + 0.5) / 20) / 2];
  // 板の番号（区画と、区画の中の何枚目か）。区画は u・v の半分ずつ、板の向きは区画ごとに互い違い
  const plank = (u, v) => {
    const qu = u < 0.5 ? 0 : 1;
    const qv = v < 0.5 ? 0 : 1;
    const alongU = qu === qv;
    const across = (alongU ? v : u) * 2 % 1;
    return { id: qu * 2 + qv, n: Math.min(2, Math.floor(across * 3)), alongU, along: (alongU ? u : v) * 2 % 1 };
  };
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < W; x++) {
      const [u, v] = uv(x, y);
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;
      const p = plank(u, v);
      let c = FLOOR_COL.planks[(p.id + p.n) % 3];
      // 木目（板の向きに沿った、ところどころの濃い筋）
      if (Math.floor(p.along * 9 + p.n * 3 + p.id) % 4 === 0 && (x + y) % 3 === 0) c = FLOOR_COL.grain;
      // 板の継ぎ目：右か下の隣が別の板なら濃い線
      const [ru, rv] = uv(x + 1, y);
      const [du, dv] = uv(x, y + 1);
      const q = plank(ru, rv);
      const r = plank(du, dv);
      if ((q.id !== p.id || q.n !== p.n) || (r.id !== p.id || r.n !== p.n)) c = FLOOR_COL.seam;
      // 北東・北西の辺に真鍮の象嵌（明るい線と、その内側の影）
      if (u < 0.026 || v < 0.026) c = FLOOR_COL.brassLight;
      else if (u < 0.05 || v < 0.05) c = FLOOR_COL.brassDark;
      // 真ん中の真鍮のひし形
      const m = Math.abs(u - 0.5) + Math.abs(v - 0.5);
      if (m < 0.07) c = m < 0.035 ? FLOOR_COL.brassLight : FLOOR_COL.brass;
      out[y][x] = c;
    }
  }
  // 厚み：左（南西向き）と右（南東向き）の面。上の縁 2 ドットは真鍮、下へ行くほど暗い
  for (let y = 20; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const left = x < 40;
      const topY = left ? 20 + x / 2 : 20 + (80 - x) / 2;   // その列の面の上の縁
      if (y + 0.5 < topY || y + 0.5 > topY + 40 || out[y][x]) continue;
      const depth = y + 0.5 - topY;
      if (depth < 2) out[y][x] = left ? FLOOR_COL.brass : FLOOR_COL.brassDark;
      else if (depth > 30) out[y][x] = left ? FLOOR_COL.leftDark : FLOOR_COL.rightDark;
      else out[y][x] = left ? FLOOR_COL.left : FLOOR_COL.right;
    }
  }
  return out;
}

// 銀行の壁（マップの walls）。床のマス1つぶんの奥の縁に立つ、高さ WALL_H の壁。出納機や床と同じ、マホガニーと真鍮。
// side：'ne'（右奥の壁。マスの上の頂点から右の頂点へ。南西を向くので明るい）か 'nw'（左奥の壁。左の頂点から上の頂点へ。暗い）。
// style：'plain'（下から幅木・腰板・真鍮の手すり・深い緑の壁紙に金の細い縦じま・真鍮の飾り縁）か
//   'teller'（窓口。カウンターの上に、真鍮の格子のはまったアーチの窓。奥は明かりのついた事務室で、棚の影が見える。格子の下の真ん中に受け取り窓口）。
// run：[k, n]。続いた teller の n マスのうち k 番目（0 から）。窓は n マスの真ん中に 3n/4 個（切り捨て。1マスなら1個）並ぶ。
// start・end：壁の端（と、左右の壁が出会う角）に縦の線を引く。
// 絵の左上は、ne ならマスの上の頂点から (-1, -WALL_H-1)、nw ならマスの上の頂点から (-41, -WALL_H-1) の所
export const WALL_H = 160;   // 主人公（約 132 ドット）の頭の上に、頭ひとつ分ほどゆとりがある高さ
const WALL_COL = {
  ne: { paper: '#3b5e4c', paperDark: '#33503f', stripe: '#7f7a3c', wood: '#7a4530', woodDark: '#5e3322', panel: '#5a311f' },
  nw: { paper: '#2c4739', paperDark: '#263d31', stripe: '#6a6532', wood: '#5e3322', woodDark: '#48271a', panel: '#422316' },
};

export function bankWallDots(side, style, { start = false, end = false, run = [0, 1] } = {}) {
  const W = 42;
  const H = WALL_H + 22;
  const d = createDots(W, H, { shade: 0 });
  const C = WALL_COL[side];
  const plain = { line: false };
  // 壁の面の上の (t, z)（t は壁の始まりから終わりまで 0〜1、z は床からの高さ）→ 絵の中の点
  const p = (t, z) => [1 + 40 * t, 1 + WALL_H + (side === 'ne' ? 20 * t : 20 - 20 * t) - z];
  const band = (t0, t1, z0, z1) => poly([p(t0, z0), p(t1, z0), p(t1, z1), p(t0, z1)]);
  const line = (t0, z0, t1, z1, c = LINE) => d.stroke(linePoints(...p(t0, z0), ...p(t1, z1)), c);
  // 面の上の形の内側の縁に線を引く
  // （shape.all があれば、マスの外へ続く形として縁を探す。隣のマスとの境目に線を引かないため）
  const rim = (shape, c = LINE) => {
    const pts = [];
    const s = shape.all ?? shape;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (shape(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => !s(x + a + 0.5, y + b + 0.5))) pts.push([x, y]);
      }
    }
    d.stroke(pts, c);
  };
  // 画面の点 → 面の上の (t, z)
  const onWall = (x, y) => {
    const t = (x - 1) / 40;
    return [t, 1 + WALL_H + (side === 'ne' ? 20 * t : 20 - 20 * t) - y];
  };
  const region = (f) => {
    const r = (x, y) => { const [t, z] = onWall(x, y); return t >= 0 && t <= 1 && f(t, z); };
    r.all = (x, y) => f(...onWall(x, y));
    return r;
  };

  // 壁紙と、金の細い縦じま
  d.fill(band(0, 1, 0, WALL_H), (x) => (Math.abs(((x - 1) % 10) - 5) < 0.5 ? C.stripe : C.paper), plain);
  // 真鍮の飾り縁（てっぺん）
  d.fill(band(0, 1, WALL_H - 7, WALL_H), (x, y) => (onWall(x + 0.5, y + 0.5)[1] > WALL_H - 3 ? COL.brassLight : COL.brass), plain);
  line(0, WALL_H - 7, 1, WALL_H - 7);
  // 腰板（窓口ではカウンター）と、その上の真鍮の手すり。手すりは RAIL〜RAIL+3
  const RAIL = 60;
  d.fill(band(0, 1, 0, RAIL), flat(C.wood), plain);
  d.fill(band(0, 1, 0, 5), flat(C.woodDark), plain);
  d.fill(band(0.12, 0.88, 10, RAIL - 6), flat(C.panel), plain);
  rim(band(0.12, 0.88, 10, RAIL - 6), COL.brassDark);
  d.fill(band(0, 1, RAIL, RAIL + 3), (x, y) => (onWall(x + 0.5, y + 0.5)[1] > RAIL + 1.5 ? COL.brassLight : COL.brass), plain);
  line(0, RAIL, 1, RAIL);
  line(0, RAIL + 3, 1, RAIL + 3);
  if (style === 'teller') {
    // 続いた窓口の壁（run の n マス）の真ん中に、窓を n の 3/4 個（切り捨て。1マスなら1個）、L ドットおきに並べる。
    // 窓はマスの境目をまたいでよい。u は、いちばん近い窓の真ん中からの横のずれ（ドット）
    const [k, n] = run;
    const m = Math.max(1, Math.floor((3 * n) / 4));
    const L = Math.min((40 * n) / m, 160 / 3);
    const O = (40 * n - m * L) / 2;   // 窓の並びの左の余白
    const win = (t) => Math.min(m - 1, Math.max(0, Math.floor((40 * (k + t) - O) / L)));
    const uOf = (t) => 40 * (k + t) - O - L * (win(t) + 0.5);
    const FH = L / 2 - 4;     // 枠の半分の幅
    const OH = FH - 2.4;      // 窓の穴の半分の幅
    const archTop = (u, h) => 122 + 14 * Math.sqrt(Math.max(0, 1 - (u / h) ** 2));
    // アーチの窓：真鍮の枠、奥は明かりのついた事務室（上ほど明るい）、棚の影、真鍮の格子
    const frame = region((t, z) => Math.abs(uOf(t)) <= FH && z >= RAIL + 6 && z <= archTop(uOf(t), FH) + 2);
    const opening = region((t, z) => Math.abs(uOf(t)) <= OH && z >= RAIL + 8 && z <= archTop(uOf(t), OH));
    d.fill(frame, flat(COL.brass), plain);
    rim(frame);
    d.fill(opening, (x, y) => {
      const z = onWall(x + 0.5, y + 0.5)[1];
      if ([88, 108].some((s) => Math.abs(z - s) < 0.6)) return '#2a170e';   // 棚
      return z > 108 ? '#8a5a2a' : z > 88 ? '#76491f' : z > RAIL + 16 ? '#5e3a1c' : '#4a2c16';
    }, plain);
    rim(opening);
    // 格子は 4 ドットおき（明るい1本と暗い1本）。真ん中の下は受け取り窓口なので格子を抜く
    const SLOT = 7;
    const SLOT_TOP = RAIL + 20;
    const bars = [];
    const shades = [];
    for (let y = 0; y < H; y++) {
      for (let x = 1; x <= 40; x++) {
        const inner = opening(x + 0.5, y + 0.5) && [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([a, b]) => opening.all(x + a + 0.5, y + b + 0.5));
        if (!inner) continue;
        const [t, z] = onWall(x + 0.5, y + 0.5);
        const u = uOf(t);
        if (Math.abs(u) > OH - 3) continue;
        if (Math.abs(u) <= SLOT + 2 && z <= SLOT_TOP + 2) continue;
        const ub = Math.floor(40 * (k + t)) - Math.round(O + L * (win(t) + 0.5));
        const r = (((ub + 2) % 4) + 4) % 4;
        if (r === 0) bars.push([x, y]);
        else if (r === 1) shades.push([x, y]);
      }
    }
    d.stroke(bars, COL.brass);
    d.stroke(shades, COL.brassDark);
    // 受け取り窓口：格子の下の真ん中にあいた口。真鍮の小さな枠と、手すりの上に張り出した受け皿
    const slotFrame = region((t, z) => Math.abs(uOf(t)) <= SLOT + 2 && z >= RAIL + 6 && z <= SLOT_TOP + 2);
    const slot = region((t, z) => Math.abs(uOf(t)) <= SLOT && z >= RAIL + 6 && z <= SLOT_TOP);
    d.fill(slotFrame, (x, y) => (onWall(x + 0.5, y + 0.5)[1] > SLOT_TOP + 1 ? COL.brassLight : COL.brass), plain);
    rim(slotFrame);
    d.fill(slot, (x, y) => (onWall(x + 0.5, y + 0.5)[1] > SLOT_TOP - 3 ? '#1e1009' : '#2a170e'), plain);
    rim(slot);
    const tray = region((t, z) => Math.abs(uOf(t)) <= SLOT + 4 && z >= RAIL - 1 && z <= RAIL + 6);
    d.fill(tray, (x, y) => (onWall(x + 0.5, y + 0.5)[1] > RAIL + 4 ? COL.brassLight : COL.brass), plain);
    rim(tray);
  }
  // 床との境目、てっぺん、端の縦の線
  line(0, 0, 1, 0);
  line(0, WALL_H, 1, WALL_H);
  if (start) line(0, 0, 0, WALL_H);
  if (end) line(1, 0, 1, WALL_H);
  d.finish({ outline: false });
  return d.result();
}
