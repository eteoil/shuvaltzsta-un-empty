import { STATES } from '../core/constants.js';
import { loadEnemy, loadJSON, loadMap } from '../core/Data.js';
import { COLORS, text, panel, sprite, gauge, isoTop, isoCenter } from '../core/draw.js';
import { loadItems, money, addItem } from '../core/Items.js';
import { poisonTick, regen, regenStep } from '../core/Hero.js';
import { drawPickup, drawExit, drawObject, objectHeight, drawWall, drawProp, drawTileBox, drawRail } from '../core/icons.js';
import { Pickups } from '../core/Pickups.js';
import { passTime, isNight, isMapOpen, eventsOf } from '../core/Calendar.js';
import { DIRS, FACE_STEP } from '../core/grid.js';

// 探索。リズム入力は受け付けない（憲法③）。町のマップ（kind: town）では TOWN として動く。
// 町に落ちている物は無い（特別なイベントのときだけ、マップに pickups を書く）
export class FieldState {
  name = STATES.FIELD;
  pausable = true;

  constructor(game) {
    this.game = game;
    this.session = game.session;
    this.map = game.session.map;
    if (this.map.kind === 'town') this.name = STATES.TOWN;
    this.move = null;
    this.stride = 0;            // 歩いたマス数。歩きのコマ送りに使う（1マスで2コマ）
    this.poisonT = 0;           // 毒のダメージまでの経過秒（AudioContext の時刻から。憲法⑫）
    this.foodT = 0;             // 食べ物の継続回復（フライドドラコ）までの経過秒
    this.regenT = 0;            // チートモードの自動回復までの経過秒
    this.hurtAt = -1e9;
    this.toast = null;          // 拾ったときの一言（演出なので rAF の時刻で消す）
    this.itemDefs = null;
    // マップに入った直後は、十字キーをいったん離すまで歩かない（押したまま出口を出て、すぐ入り直さないように）
    this.waitRelease = true;
    // 暗転：着いたときは暗い画面から明るくなる（fadeIn）。出口を通るときは暗くなってから切り替える（leaving）
    this.fadeIn = game.config.field.fadeSec;
    this.leaving = null;
    this.onArrive = null;       // 明るくなりきったら一度だけ呼ぶ（戦闘後の会話など。暗いうちに出さない）
    this.enemyDefs = {};
    this.npcDefs = {};
  }

  get p() {
    return this.session.player;
  }

  enter() {
    loadItems().then((d) => { this.itemDefs = d; });
    this.destMaps = {};
    for (const e of this.map.exits ?? []) loadMap(e.to).then((m) => { this.destMaps[e.to] = m; });
    this.drops = new Pickups(this.game, this.map, (i, j) => this.nearCharacter(i, j));
    this.drops.fill();
    for (const enc of this.map.encounters) {
      loadEnemy(enc.enemy).then(({ def }) => { this.enemyDefs[enc.id] = def; });
    }
    for (const n of this.map.npcs ?? []) {
      loadJSON(`data/npcs/${n.id}.json`).then((def) => { this.npcDefs[n.id] = def; });
    }
  }

  npcAt(i, j) {
    return this.presentNpcs().find((n) => n.at[0] === i && n.at[1] === j);
  }

  // 主人公・NPC・敵のいるマスと、その周り8マス。拾い物は取りにくいので置かない
  nearCharacter(i, j) {
    const people = [
      [this.p.i, this.p.j],
      ...(this.map.npcs ?? []).map((n) => n.at),
      ...this.map.encounters.flatMap((e) => e.actors.map((x) => x.at)),
    ];
    return people.some(([pi, pj]) => Math.abs(pi - i) <= 1 && Math.abs(pj - j) <= 1);
  }

  // A で拾う。乗っているマスか、向いている1歩先のマスにある物
  pickUp(fi, fj) {
    const p = this.drops.at(this.p.i, this.p.j) ?? this.drops.at(fi, fj);
    if (!p || !this.itemDefs) return false;
    addItem(this.session, p.item);
    this.drops.take(p);
    this.toast = { text: `${this.itemDefs[p.item].name}を拾った`, at: performance.now() };
    this.game.sfx.play('confirm');
    return true;
  }

  exitAt(i, j) {
    return (this.map.exits ?? []).find((e) => e.at[0] === i && e.at[1] === j) ?? null;
  }

  get night() {
    return isNight(this.game.config, this.session.minute);
  }

  // このマップが営業中か（hours が無ければいつでも。closedOnRestDay なら天赦日は休み）
  get open() {
    return isMapOpen(this.game.calendar, this.map, this.session.day, this.session.minute);
  }

  // 出口の行き先が営業中か。行き先のマップは enter で読んでおく（まだなら開いていることにする）
  destOpen(exit) {
    return isMapOpen(this.game.calendar, this.destMaps[exit.to], this.session.day, this.session.minute);
  }

  // 営業時間のある場所の店の人（map の npcs で staff: true）は、時間外はいない。night: true の人は夜だけ（バーのエレナ）。
  // restDay: true の人は天赦日だけ、restDay: false の人は天赦日以外だけいる（天赦日のコウはカフェでなく、フェストの東の端の、図書館と森へ行く道の入り口の前）
  presentNpcs() {
    const rest = eventsOf(this.game.calendar, this.session.day).rest;
    return (this.map.npcs ?? []).filter((n) => (!n.staff || this.open) && (!n.night || this.night)
      && (n.restDay === undefined || n.restDay === rest));
  }

  // 出口に乗ったら行き先へ。requires のフラグ（勝った戦闘など）が無ければ通れない。
  // 行き先のマップが営業時間外（hours の外。天赦日に休む店は天赦日も）なら、closedText を出して入れない（薬屋）
  // edge の付いた出口（カフェのロフトの奥の端）は、乗っても出ない。そのマスから edge の向きへ進もうとしたときに出る
  takeExit(dir = null) {
    const exit = this.exitAt(this.p.i, this.p.j);
    if (!exit || (exit.edge ?? null) !== dir) return false;
    const locked = exit.requires && !this.session.flags[exit.requires] ? exit.locked
      : exit.closedText && !this.destOpen(exit) ? exit.closedText : null;
    if (locked) {
      this.toast = { text: locked, at: performance.now() };
      this.game.sfx.play('miss');
      return false;
    }
    this.depart(exit);
    return true;
  }

  // 暗くしてから exit.to のマップの exit.spawn へ（出口と、駅員に話しかけたときの電車）
  depart(exit) {
    this.game.sfx.play('steps');
    this.leaving = { exit, t: 0, gone: false };
  }

  // 暗くなりきったら次のマップへ
  updateLeaving(dt) {
    const l = this.leaving;
    l.t += dt;
    if (l.gone || l.t < this.game.config.field.fadeSec) return;
    l.gone = true;
    this.game.enterMap(l.exit.to, l.exit.spawn);
  }

  // 暗転の暗さ（0〜1）
  get darkness() {
    const fade = this.game.config.field.fadeSec;
    if (this.leaving) return Math.min(1, this.leaving.t / fade);
    return Math.max(0, this.fadeIn / fade);
  }

  // 歩ける床は '#'。'-' は床を描くが歩けない（カウンターの内側など）
  isFloor(i, j) {
    return this.map.floor[j]?.[i] === '#';
  }

  drawnFloor(i, j) {
    const c = this.map.floor[j]?.[i];
    return c === '#' || c === '-';
  }

  // 床の高さ（ドット）。マップの heights（数字1文字＝stepH ドット。カフェのロフトと階段）。無ければ 0
  heightAt(i, j) {
    const c = this.map.heights?.[j]?.[i];
    return c >= '0' && c <= '9' ? Number(c) * (this.map.stepH ?? 0) : 0;
  }

  // そのマスに置いてある家具（マップの props。size はマスの数 [i の向き, j の向き]）
  propAt(i, j) {
    return (this.map.props ?? []).find((p) => {
      const [w, d] = p.size ?? [1, 1];
      return i >= p.at[0] && i < p.at[0] + w && j >= p.at[1] && j < p.at[1] + d;
    }) ?? null;
  }

  encounterAt(i, j) {
    return this.map.encounters.find((e) => e.actors.some((a) => a.at[0] === i && a.at[1] === j));
  }

  // 床の高さが1段（stepH）より違うマスへは行けない（ロフトの上と下）。家具は blocks が false でなければ通れない
  walkable(i, j, from = null) {
    if (!this.isFloor(i, j) || this.encounterAt(i, j) || this.npcAt(i, j)) return false;
    const prop = this.propAt(i, j);
    if (prop && prop.blocks !== false) return false;
    return !from || Math.abs(this.heightAt(i, j) - this.heightAt(...from)) <= (this.map.stepH ?? 0);
  }

  update(dt, presses) {
    if (this.leaving) { this.updateLeaving(dt); return; }   // 出口を通って暗くなっている間と、次のマップを読み込んでいる間
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    if (this.fadeIn === 0 && this.onArrive) {
      const arrive = this.onArrive;
      this.onArrive = null;
      arrive();
      return;
    }
    passTime(this.session, dt * this.game.config.time.minutesPerSec);
    for (const { btn } of presses) {
      if (btn === 'pause' || btn === 'start') { this.game.pause(); return; }
      if (btn === 'a' && !this.move) {
        const d = FACE_STEP[this.p.dir];
        const [fi, fj] = [this.p.i + d.di, this.p.j + d.dj];
        const enc = this.encounterAt(fi, fj);
        if (enc) { this.trigger(enc); return; }
        // カウンターや椅子（props の across）が続いていれば、その向こうの人にも話しかけられる（丸椅子とカウンター越しのシャルヴィス）
        let [ti, tj] = [fi, fj];
        let npc = this.npcAt(ti, tj);
        for (let k = 0; k < 3 && !npc && this.propAt(ti, tj)?.across; k++) {
          ti += d.di;
          tj += d.dj;
          npc = this.npcAt(ti, tj);
        }
        if (npc && this.npcDefs[npc.id]) {
          this.game.sfx.play('confirm');
          this.game.talk(this.npcDefs[npc.id]);
          return;
        }
        this.pickUp(fi, fj);
      }
    }

    this.poisonTick(dt);
    this.regenTick(dt);
    this.foodTick(dt);
    this.drops.tick(dt);

    if (this.move) {
      const step = dt / this.game.config.field.moveSecPerTile;
      this.move.t += step;
      this.stride += step;
      if (this.move.t < 1) return;
      [this.p.i, this.p.j] = this.move.to;
      this.move = null;
      if (this.takeExit()) return;
    }

    const btn = this.game.input.latest(Object.keys(DIRS));
    if (this.waitRelease) {
      if (btn) return;
      this.waitRelease = false;
    }
    if (!btn) return;
    const d = DIRS[btn];
    this.p.dir = d.face;
    const ni = this.p.i + d.di;
    const nj = this.p.j + d.dj;
    // ぶつかっても話しかけはしない。向きだけ変わるので、A で話しかける
    if (!this.walkable(ni, nj, [this.p.i, this.p.j])) {
      if (!this.drawnFloor(ni, nj) && this.takeExit(d.face)) return;
    } else {
      this.move = { from: [this.p.i, this.p.j], to: [ni, nj], t: 0 };
      this.game.sfx.play('step');
    }
  }

  // 探索中も毒なら fieldTickSec 秒ごとに減る。毒では倒れない（HP は 1 残る）
  poisonTick(dt) {
    const hero = this.session.hero;
    if (!hero.poisoned) { this.poisonT = 0; return; }
    const { fieldTickSec, fieldDamage } = this.game.config.status.poison;
    this.poisonT += dt;
    while (hero.poisoned && this.poisonT >= fieldTickSec) {
      this.poisonT -= fieldTickSec;
      const { damage, cured } = poisonTick(this.game, fieldDamage);
      if (cured) this.toast = { text: '毒が消えた', at: performance.now() };
      if (!damage) continue;
      this.hurtAt = performance.now();
      this.game.sfx.play('telegraph');
    }
  }

  // チートモードでは fieldRegenSec 秒ごとに HP が戻る
  // 食べ物の継続回復。status.regen.fieldTickSec 秒ごとに1回
  foodTick(dt) {
    const hero = this.session.hero;
    if (!hero.regen) { this.foodT = 0; return; }
    const sec = this.game.config.status.regen.fieldTickSec;
    this.foodT += dt;
    while (hero.regen && this.foodT >= sec) {
      this.foodT -= sec;
      regenStep(hero);
    }
  }

  regenTick(dt) {
    if (!this.game.options.cheat) { this.regenT = 0; return; }
    const { fieldRegenSec, fieldRegen } = this.game.config.cheat;
    this.regenT += dt;
    while (this.regenT >= fieldRegenSec) {
      this.regenT -= fieldRegenSec;
      regen(this.game, fieldRegen);
    }
  }

  trigger(enc) {
    this.game.sfx.play('confirm');
    this.game.runEncounter(enc);
  }

  render(g) {
    const { config, assets } = this.game;
    const W = config.screen.width;
    const H = config.screen.height;
    // 床の絵はマップの floorSprite（無ければふつうの floor）。銀行は floor_bank
    const floorKey = this.map.floorSprite ?? 'floor';
    const floorDef = assets.def(floorKey);
    const floorImg = assets.get(floorKey, 'default');
    const tile = floorDef.tile;

    let pi = this.p.i;
    let pj = this.p.j;
    let ph = this.heightAt(pi, pj);
    if (this.move) {
      const t = Math.min(1, this.move.t);
      pi = this.move.from[0] + (this.move.to[0] - this.move.from[0]) * t;
      pj = this.move.from[1] + (this.move.to[1] - this.move.from[1]) * t;
      const h0 = this.heightAt(...this.move.from);
      ph = h0 + (this.heightAt(...this.move.to) - h0) * t;
    }
    // プレイヤーが画面の中ほどに来るようにカメラを合わせる（ロフトの上では、そのぶん下げる）
    const ox = Math.round(W / 2 - (pi - pj) * tile[0] / 2);
    const oy = Math.round(232 - tile[1] / 2 - (pi + pj) * tile[1] / 2 + ph);

    g.fillStyle = '#12142a';
    g.fillRect(0, 0, W, H);

    const rows = this.map.floor.length;
    const cols = this.map.floor[0].length;
    for (let s = 0; s <= rows + cols - 2; s++) {
      for (let i = 0; i < cols; i++) {
        const j = s - i;
        if (j < 0 || j >= rows || !this.drawnFloor(i, j) || this.heightAt(i, j) > 0) continue;
        const p = isoTop(i, j, ox, oy, tile);
        if (p.x < -tile[0] || p.x > W + tile[0] || p.y > H || p.y < -floorDef.size[1]) continue;
        sprite(g, floorImg, floorDef, p.x, p.y);
      }
    }
    // 奥の壁（マップの walls）。ne は1行目の各マスの右奥の縁、nw は1列目の各マスの左奥の縁に立つ。床のあと、人より先に描く。
    // 右奥の壁の右端・左奥の壁の手前の端・2つの壁が出会う角に、縦の線を引く。絵はマップの wallArt（'bank'・'cafe'）
    const walls = this.map.walls;
    const art = this.map.wallArt ?? 'bank';
    // そのマスにかかる窓口の窓（隣のマスの窓もはみ出してくる）のずれ
    const nearOf = (list, k) => [-1, 0, 1].filter((d) => list[k + d] === 'teller');
    if (walls) {
      (walls.nw ?? []).forEach((style, j) => {
        if (!style) return;   // null の所には壁が無い（カフェの、ロフトの手前へずれた角）
        const p = isoTop(0, j, ox, oy, tile);
        drawWall(g, 'nw', style, p.x, p.y, { start: j === walls.nw.length - 1, end: j === 0, near: nearOf(walls.nw, j), art, seed: 100 + j });
      });
      (walls.ne ?? []).forEach((style, i) => {
        if (!style) return;
        const p = isoTop(i, 0, ox, oy, tile);
        drawWall(g, 'ne', style, p.x, p.y, { end: i === walls.ne.length - 1, near: nearOf(walls.ne, i), art, seed: i, top: this.map.neWallTop ?? null });
      });
    }
    // 1行目・1列目のほかのマスの縁に立つ壁（extraWalls：{ side, at, style, start, end }。カフェのロフトの奥の壁・扉の上の三角の壁・額の壁）
    for (const w of this.map.extraWalls ?? []) {
      const p = isoTop(w.at[0], w.at[1], ox, oy, tile);
      drawWall(g, w.side, w.style, p.x, p.y, { start: !!w.start, end: !!w.end, art, seed: w.at[0] * 31 + w.at[1] });
    }
    // 壁に掛ける物（wallDecor）。flag があれば、そのフラグが立ってから（カフェの蓄音機の上の絵はイベントのあと）
    for (const w of this.map.wallDecor ?? []) {
      if (w.flag && !this.session.flags[w.flag]) continue;
      const p = Array.isArray(w.at) ? isoTop(w.at[0], w.at[1], ox, oy, tile) : w.side === 'ne' ? isoTop(w.at, 0, ox, oy, tile) : isoTop(0, w.at, ox, oy, tile);
      drawWall(g, w.side, w.style, p.x, p.y, { art });
    }
    // マップの色味（砂漠の村）。床だけに掛ける（人より先に描く）
    if (this.map.tint) {
      g.fillStyle = this.map.tint;
      g.fillRect(0, 0, W, H);
    }

    // 奥から順に描く物：床の高さのあるマスの箱・手すり・出口・拾い物・家具・人。key が小さいほど奥（i + j が基準）
    const items = [];
    const step = this.map.stepH ?? 0;
    const loftH = this.map.loftH ?? Infinity;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const h = this.heightAt(i, j);
        if (h <= 0 || !this.drawnFloor(i, j)) continue;
        const loft = h >= loftH;
        const nb = (a, b) => (this.drawnFloor(a, b) ? this.heightAt(a, b) : 0);
        const p = isoTop(i, j, ox, oy, tile);
        // 階段の向き（マップの stairAxis）：'i' なら段は i の向きに並び、'j' なら j の向き（カフェは j：バーの壁に沿って上る）
        const axis = this.map.stairAxis ?? 'i';
        const face = loft ? (this.map.loftFront?.[j] ?? 'panel') : `stairs_${axis}`;
        items.push({ key: i + j - 0.5, draw: () => drawTileBox(g, loft ? 'loft' : 'stairs', h, nb(i + 1, j), nb(i, j + 1), face, j, p.x, p.y) });
        // 手すり：隣が低い辺（ロフトは2段以上）。階段は段の並びに沿った辺だけで、前後の段の高さで傾ける。入口（マップの外）の辺には付けない
        const [pi0, pj0, pi1, pj1] = axis === 'i' ? [i - 1, j, i + 1, j] : [i, j - 1, i, j + 1];
        const hPrev = this.heightAt(pi0, pj0);
        const hNext = this.drawnFloor(pi1, pj1) ? this.heightAt(pi1, pj1) : 0;
        const run = (x) => Math.abs(x - h) === step;
        const zStart = run(hPrev) ? (h + hPrev) / 2 : run(hNext) ? h + (h - hNext) / 2 : h;
        const zEnd = run(hNext) ? (h + hNext) / 2 : run(hPrev) ? h - (hPrev - h) / 2 : h;
        const along = axis === 'i' ? ['ne', 'sw'] : ['se'];
        for (const [edge, a, b] of [['ne', i, j - 1], ['se', i + 1, j], ['sw', i, j + 1]]) {
          if (b < 0 || a >= cols || b >= rows || !this.drawnFloor(a, b)) continue;   // 床の無い側（壁の向こう）には付けない
          const drop = h - nb(a, b);
          if (loft ? drop <= step : drop < step || !along.includes(edge)) continue;
          const [z0, z1] = loft ? [h, h] : [zStart, zEnd];
          items.push({ key: i + j + (edge === 'ne' ? -0.45 : 0.6), draw: () => drawRail(g, edge, Math.round(z0), Math.round(z1), p.x, p.y) });
        }
      }
    }
    for (const e of this.map.exits ?? []) {
      const [i, j] = e.at;
      items.push({ key: i + j - 0.2, draw: () => {
        const pos = isoCenter(i, j, ox, oy, tile);
        const open = this.destOpen(e);
        const closed = (e.requires && !this.session.flags[e.requires]) || (e.closedText && !open);
        drawExit(g, pos.x, pos.y - this.heightAt(i, j), this.night && open && e.nightLabel ? e.nightLabel : e.label, performance.now(), closed);
      } });
    }
    for (const sp of this.drops.spots) {
      const [i, j] = sp.at;
      items.push({ key: i + j - 0.2, draw: () => {
        const pos = isoCenter(i, j, ox, oy, tile);
        drawPickup(g, sp.item, pos.x, pos.y - this.heightAt(i, j), performance.now());
      } });
    }
    for (const pr of this.map.props ?? []) {
      const [w, d] = pr.size ?? [1, 1];
      const p = isoTop(pr.at[0], pr.at[1], ox, oy, tile);
      items.push({ key: pr.key ?? pr.at[0] + w - 1 + pr.at[1] + d - 1 - 0.4, draw: () => drawProp(g, pr.art, p.x, p.y - this.heightAt(...pr.at)) });
    }

    const people = [{ sprite: 'player', frame: this.p.dir, anim: this.move ? 'walk' : null, n: Math.floor(this.stride * 2), palette: null, i: pi, j: pj, h: ph }];
    for (const enc of this.map.encounters) {
      const def = this.enemyDefs[enc.id];
      if (!def) continue;
      for (const a of enc.actors) {
        const actor = def.actors.find((x) => x.id === a.id);
        people.push({ sprite: actor.sprite, frame: a.dir, anim: null, n: 0, palette: actor.palette, i: a.at[0], j: a.at[1], h: this.heightAt(...a.at) });
      }
    }
    for (const n of this.presentNpcs()) {
      const def = this.npcDefs[n.id];
      // hidden の NPC は絵を描かない（銀行の窓口。壁の奥のバニーキャット）
      if (!def || def.hidden) continue;
      // 絵に idle のモーション（data/sprites.json）があれば、その場でくり返す（ドルー）
      const idle = def.sprite && assets.def(def.sprite)?.anims?.idle;
      const frameN = idle ? Math.floor((performance.now() / 1000) * (idle.fps ?? 4)) : 0;
      people.push({ sprite: def.sprite, object: def.object, frame: n.dir, anim: idle ? 'idle' : null, n: frameN, palette: def.palette, i: n.at[0], j: n.at[1], h: this.heightAt(...n.at), sit: n.sit, label: def.hideName ? null : def.name });
    }
    for (const c of people) {
      items.push({ key: c.i + c.j, draw: () => {
        const pos = isoCenter(c.i, c.j, ox, oy, tile);
        const y = pos.y - c.h;
        // ベッドなどの家具は NPC と同じ扱いで、絵だけコードで描く
        if (c.object) { drawObject(g, c.object, pos.x, y); return; }
        const { img, def } = assets.pose(c.sprite, c.frame, c.anim, c.n, c.palette);
        // 座っている人（マップの npcs の sit：座面の高さ）。腰（足元から36ドット）より下は描かず、腰を座面の高さに下ろす
        if (c.sit !== undefined) {
          g.save();
          g.beginPath();
          g.rect(0, 0, W, y - c.sit);
          g.clip();
          sprite(g, img, def, pos.x, y + 36 - c.sit);
          g.restore();
          return;
        }
        g.fillStyle = 'rgba(11,12,24,0.45)';
        g.beginPath();
        g.ellipse(pos.x, y, 22, 8, 0, 0, Math.PI * 2);
        g.fill();
        sprite(g, img, def, pos.x, y);
      } });
    }
    items.sort((a, b) => a.key - b.key);
    for (const it of items) it.draw();
    // 名前はほかのキャラに隠れないよう、全員を描いたあとに（hideName の NPC は出さない。並んだ出納機）
    for (const c of people) {
      if (!c.label) continue;
      const pos = isoCenter(c.i, c.j, ox, oy, tile);
      const height = c.object ? objectHeight(c.object) : assets.height(c.sprite, c.frame, c.palette) - (c.sit !== undefined ? 36 - c.sit : 0);
      // 奥にいる人の名前が上の帯（HP・所持金）に重ならないよう、帯より下に収める
      text(g, c.label, pos.x, Math.max(30, pos.y - c.h - height - 16), { size: 12, align: 'center', color: COLORS.brass });
    }

    // 夜は少し暗く（演出）。brightNight のマップ（白夜砂漠の村）は夜も明るいまま
    if (this.night && !this.map.brightNight) {
      g.fillStyle = 'rgba(10,14,40,0.38)';
      g.fillRect(0, 0, W, H);
    }

    // 毒で減った瞬間は画面が紫に光る（演出）
    const hurt = performance.now() - this.hurtAt;
    if (hurt < 180) {
      g.fillStyle = `rgba(196,107,255,${0.22 * (1 - hurt / 180)})`;
      g.fillRect(0, 0, W, H);
    }

    g.fillStyle = 'rgba(11,12,24,0.55)';
    g.fillRect(0, 0, W, 26);
    text(g, this.night && this.open && this.map.nightName ? this.map.nightName : this.map.name, 8, 5);
    const hero = this.session.hero;
    text(g, 'HP', 236, 5, { color: COLORS.signal });
    gauge(g, 262, 9, 90, 9, hero.hp / hero.maxHp, COLORS.signal);
    if (hero.poisoned) text(g, '毒', 358, 5, { color: COLORS.unguard });
    if (hero.regen) text(g, '回復', hero.poisoned ? 376 : 358, 5, { size: 12, color: COLORS.open });
    text(g, money(this.session.money), W - 8, 5, { align: 'right', color: COLORS.perfect });

    const age = this.toast ? performance.now() - this.toast.at : Infinity;
    if (age < 1600) {
      const w = [...this.toast.text].length * 16 + 32;
      panel(g, W / 2 - w / 2, 34, w, 32, { alpha: age > 1300 ? (1600 - age) / 300 : 1 });
      text(g, this.toast.text, W / 2, 42, { align: 'center', alpha: age > 1300 ? (1600 - age) / 300 : 1 });
    }
    if (this.darkness > 0) {
      g.fillStyle = `rgba(0,0,0,${this.darkness})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
