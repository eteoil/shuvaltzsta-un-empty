import { STATES } from '../core/constants.js';
import { COLORS, isoCenter } from '../core/draw.js';
import { distance, FACE_STEP, frameOf } from '../core/grid.js';
import { loadJSON } from '../core/Data.js';
import { loadItems, addItem } from '../core/Items.js';
import { Pickups } from '../core/Pickups.js';
import { drawPickup, drawExit, drawHole } from '../core/icons.js';
import { BattleState } from './BattleState.js';

// ダンジョン。入った瞬間から戦闘で、戦闘曲がループし続ける。仕組みは BattleState と同じ
// （拍の判定・攻撃の予告・回避・毒・EventTrack）で、違うのは次のところだけ。
// - 床はマップの floor。敵はマップの spawns に1匹ずつ（1匹で1つの一団）。ザコは遠いとうろつく
// - 敵を倒すと消える。全部倒しても勝ちにはならず、出口に乗ると終わる（EXIT）
// - 隣に敵がいないときの A は、足元か目の前に落ちている物を拾う（拍の判定はしない）
// - 倒れたら LOSE。どちらもリザルトのあと町へ戻る
// - 敵データに faints のある敵（監獄の看守）は、倒しても消えずに気絶した姿で残る（そのマスは通れない）
// - マップの npcs に、話しかけると出口まで連れて行ってくれる NPC を置ける（NPC の escort。奈落の鬼灯）。
//   話しかけると、NPC が先に立って出口へ歩き、主人公はその後ろをついて歩く（その間は操作できない）。
//   NPC は出口の手前で脇へよけ、主人公が出口に乗って終わる。歩く間は escort.sound の音を鳴らし続ける
// - 出口の hole は穴（奈落へ落ちる）。マップの fallIn は、主人公が上から落ちてきて始まる
// - マップの warps は、同じマップの中の別の場所へ移るマス（森の崖）。乗ると暗くなって to のマスへ移り、
//   fall なら上から落ちてくる、slide なら崖を滑り落ちてくる。ダンジョンは続くので、リザルトもスコアも分かれない
// - マップの areas（from〜to の四角）ごとに、名前（左上の帯）と色味（tint）を変えられる（森と深い森）
const ESCORT_SEC = 0.34;         // 鬼灯と歩く1マスの秒数
const ESCORT_SOUND_SEC = 1.3;    // 歩く間に音を鳴らす間隔
const FALL_SEC = 0.7;            // 落ちてくる秒数
const WARP_SEC = 0.3;            // 崖へ乗ってから暗くなるまで（と、明るくなるまで）の秒数
const SLIDE_SEC = 0.6;           // 崖を滑り落ちてくる秒数

export class DungeonState extends BattleState {
  name = STATES.DUNGEON;

  // enemies：敵の id → { def, patterns }（loadEnemy の結果）
  constructor(game, { map, enemies, onEnd }) {
    super(game, { def: null, patterns: null, onEnd });
    this.map = map;
    this.enemyData = enemies;
    this.exitTaken = null;
    this.fadeIn = game.config.field.fadeSec;   // 暗い画面から明るくなる
    this.itemDefs = null;
    loadItems().then((d) => { this.itemDefs = d; });
    // マップの npcs（i・j は今いるマス、from は歩き始めたマス）
    this.npcs = (map.npcs ?? []).map((n) => ({ ...n, i: n.at[0], j: n.at[1], from: null, def: null }));
    for (const n of this.npcs) loadJSON(`data/npcs/${n.id}.json`).then((def) => { n.def = def; });
    this.escort = null;
    this.fall = map.fallIn ? { t: -game.config.field.fadeSec } : null;   // 暗い画面が明けてから落ち始める
    this.warp = null;
    this.slide = null;
  }

  setupStage() {
    this.floor = this.map.floor;
    const { i, j, dir } = this.game.session.player;
    this.player = { i, j, dir, move: null };
    // 行事による強さは addUnit が掛ける（ザコだけ）
    this.map.spawns.forEach((sp, k) => {
      const { def, patterns } = this.enemyData[sp.enemy];
      const id = `${sp.enemy}${k + 1}`;
      const one = def.actors.length === 1;
      this.addUnit(id, def, patterns, def.actors.map((a) => ({ ...a, id: one ? id : `${id}.${a.id}`, at: sp.at })));
    });
    this.drops = new Pickups(this.game, this.map, (pi, pj) => this.nearSomeone(pi, pj));
    this.drops.fill();
  }

  // 前奏を飛ばし、ループの頭から鳴らす。READY も FIGHT も無く、すぐ動ける
  startMusic() {
    const { clock, bgm, config } = this.game;
    this.beats.start(bgm.play('battle', clock.now + 0.1, config.bgm.battle.loopFromBar));
    this.phase = 'fight';
    this.banner = { text: this.areaName(), beat: this.fightBeat, steady: true };
  }

  // 主人公・生きている敵・出口・崖のそばには物を置かない
  nearSomeone(i, j) {
    const near = ([a, b]) => Math.abs(a - i) <= 1 && Math.abs(b - j) <= 1;
    return near([this.player.i, this.player.j])
      || Object.values(this.actors).some((a) => !a.unit.dead && near([a.i, a.j]))
      || (this.map.exits ?? []).some((e) => near(e.at))
      || (this.map.warps ?? []).some((w) => near(w.at));
  }

  // 主人公のいる場所（マップの areas）。無ければ null
  area() {
    const { i, j } = this.tile;
    return (this.map.areas ?? []).find((a) => i >= a.from[0] && i <= a.to[0] && j >= a.from[1] && j <= a.to[1]) ?? null;
  }

  areaName() {
    return this.area()?.name ?? this.map.name;
  }

  warpAt(i, j) {
    return (this.map.warps ?? []).find((w) => w.at[0] === i && w.at[1] === j) ?? null;
  }

  // 崖に乗った。暗くなりきったら to のマスへ移し、落ちてくる（fall）か滑り落ちてくる（slide）
  updateWarp(dt) {
    const w = this.warp;
    w.t += dt;
    if (!w.moved && w.t >= WARP_SEC) {
      w.moved = true;
      const before = this.areaName();
      const [i, j, dir] = w.to.to;
      Object.assign(this.player, { i, j, dir, move: null });
      this.cam = null;
      if (w.to.fall) this.fall = { t: 0 };
      if (w.to.slide) this.slide = { t: 0 };
      if (this.areaName() !== before) this.banner = { text: this.areaName(), beat: this.beats.currentBeat, steady: true };
    }
    if (w.t >= WARP_SEC * 2) this.warp = null;
  }

  exitAt(i, j) {
    return (this.map.exits ?? []).find((e) => e.at[0] === i && e.at[1] === j) ?? null;
  }

  update(dt, presses) {
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    if (this.warp) this.updateWarp(dt);
    if (this.slide) {
      this.slide.t += dt;
      if (this.slide.t >= SLIDE_SEC) { this.slide = null; this.game.sfx.play('step'); }
    }
    if (this.fall) {
      this.fall.t += dt;
      if (this.fall.t >= FALL_SEC) { this.fall = null; this.game.sfx.play('block'); this.shakeAt = performance.now(); }
    }
    super.update(dt, presses);
    this.drops.tick(dt);
    // 倒れた敵は1拍のあいだ点滅してから消える（気絶する敵は残る）
    const beat = this.beats.currentBeat;
    for (const unit of this.units) {
      if (!unit.dead || unit.gone || beat - unit.deadBeat < 1) continue;
      unit.gone = true;
      if (unit.def.faints) continue;
      for (const id of unit.actorIds) {
        delete this.actors[id];
        delete this.plan[id];
      }
    }
  }

  onStep() {
    const warp = this.warpAt(this.player.i, this.player.j);
    if (warp && !this.outcome) {
      this.warp = { to: warp, t: 0, moved: false };
      this.game.sfx.play(warp.slide ? 'dodge' : 'miss');
      return;
    }
    const exit = this.exitAt(this.player.i, this.player.j);
    if (!exit || this.outcome) return;
    this.exitTaken = exit;
    this.game.sfx.play('confirm');
    this.decide('exit');
  }

  // 倒れた敵は、落とす物（敵データの drop）をそのマスに残す
  unitDown(unit) {
    unit.dead = true;
    unit.deadBeat = this.beats.currentBeat;
    this.stats.kills++;
    this.game.sfx.play('ko');
    const a = this.actors[unit.actorIds[0]];
    if (!unit.def.drop || !a) return;
    // 2個目からは、倒れたマスのまわりの空いている床に置く
    const spots = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([di, dj]) => [a.i + di, a.j + dj])
      .filter(([i, j]) => this.inArena(i, j) && !this.drops.at(i, j));
    const n = this.dayRates.dropCount;
    for (let k = 0; k < n; k++) this.drops.drop(unit.def.drop, spots[k] ?? [a.i, a.j]);
  }

  attack(t, b, slot) {
    if (!this.adjacentActor()) {
      const npc = this.npcInFront();
      if (npc?.def?.escort) { this.startEscort(npc); return undefined; }
      if (this.pickUp()) return undefined;
    }
    return super.attack(t, b, slot);
  }

  // ---------------------------------------------------------------- NPC（鬼灯）

  npcAt(i, j) {
    return this.npcs.find((n) => n.i === i && n.j === j) ?? null;
  }

  npcInFront() {
    const me = this.tile;
    const d = FACE_STEP[this.player.dir];
    return this.npcAt(me.i + d.di, me.j + d.dj);
  }

  // NPC のいるマスは通れない
  actorAt(i, j) {
    return super.actorAt(i, j) ?? (this.npcAt(i, j) ? 'npc' : null);
  }

  // from から to への最短の道（床だけを通る。両端を含む [i, j] の並び）。行けなければ null
  findPath(from, to) {
    const k = ([i, j]) => `${i},${j}`;
    const prev = new Map([[k(from), null]]);
    const queue = [from];
    while (queue.length) {
      const cur = queue.shift();
      if (cur[0] === to[0] && cur[1] === to[1]) {
        const path = [];
        for (let c = cur; c; c = prev.get(k(c))) path.unshift(c);
        return path;
      }
      for (const { di, dj } of Object.values(FACE_STEP)) {
        const next = [cur[0] + di, cur[1] + dj];
        if (!this.inArena(...next) || prev.has(k(next))) continue;
        prev.set(k(next), cur);
        queue.push(next);
      }
    }
    return null;
  }

  // NPC が先に立って出口へ。主人公は NPC のいたマスをたどってついて行く。
  // NPC は出口の手前で脇のマスへよけ、主人公が出口へ乗る
  startEscort(npc) {
    const exit = this.map.exits?.[0];
    const path = exit && this.findPath([npc.i, npc.j], exit.at);
    if (!path || path.length < 2) return;
    const steps = [];
    for (let k = 1; k <= path.length - 2; k++) steps.push({ npc: path[k], player: path[k - 1] });
    const stop = path[path.length - 2];
    const before = path[path.length - 3] ?? [this.player.i, this.player.j];
    const side = Object.values(FACE_STEP).map(({ di, dj }) => [stop[0] + di, stop[1] + dj])
      .find(([i, j]) => this.inArena(i, j) && !(i === exit.at[0] && j === exit.at[1]) && !(i === before[0] && j === before[1]));
    steps.push(side ? { npc: side, player: stop } : { player: stop });
    steps.push({ player: exit.at });
    this.escort = { npc, steps, k: -1, t: ESCORT_SEC, soundT: 0 };
    this.player.move = null;
  }

  // 1マスずつ、NPC と主人公を同時に動かす
  stepEscort(dt) {
    const e = this.escort;
    const sound = e.npc.def.escort.sound;
    e.soundT -= dt;
    if (e.soundT <= 0) {
      e.soundT = ESCORT_SOUND_SEC;
      this.game.sfx.play(sound);
      this.popup('ホヨヨ〜ン', COLORS.perfect, `npc:${e.npc.id}`);
    }
    e.t += dt;
    const p = this.player;
    if (p.move) p.move.t = Math.min(1, e.t / ESCORT_SEC);
    if (e.t < ESCORT_SEC) return;
    // 1マス歩き終えた
    if (p.move) {
      [p.i, p.j] = p.move.to;
      p.move = null;
      this.onStep();
    }
    e.npc.from = null;
    e.k++;
    const step = e.steps[e.k];
    if (!step) { this.escort = null; return; }
    e.t = 0;
    const face = (from, to) => frameOf({ di: to[0] - from[0], dj: to[1] - from[1] });
    if (step.npc) {
      e.npc.from = [e.npc.i, e.npc.j];
      e.npc.dir = face(e.npc.from, step.npc);
      [e.npc.i, e.npc.j] = step.npc;
    }
    if (step.player[0] !== p.i || step.player[1] !== p.j) {
      p.dir = face([p.i, p.j], step.player);
      p.move = { from: [p.i, p.j], to: step.player, t: 0 };
    }
  }

  // 鬼灯と歩いている間と、落ちてくる間は操作できない
  walk(dt) {
    if (this.fall || this.warp || this.slide) return;
    if (this.escort) { this.stepEscort(dt); return; }
    super.walk(dt);
  }

  onPress(press) {
    if ((this.escort || this.fall || this.warp || this.slide) && press.btn !== 'pause' && press.btn !== 'start' && this.phase !== 'result') return;
    super.onPress(press);
  }

  // 滑り落ちてくる：左上（崖の上）から斜めに
  playerShift() {
    if (!this.slide) return 0;
    const k = 1 - this.slide.t / SLIDE_SEC;
    return -Math.round(90 * k);
  }

  playerLift() {
    if (this.slide) {
      const k = 1 - this.slide.t / SLIDE_SEC;
      return -Math.round(120 * k);
    }
    if (!this.fall) return 0;
    const k = 1 - Math.max(0, this.fall.t) / FALL_SEC;
    return -Math.round(260 * k * k);
  }

  extraPeople() {
    const e = this.escort;
    return this.npcs.filter((n) => n.def).map((n) => {
      const k = e && n.from ? Math.min(1, e.t / ESCORT_SEC) : 1;
      const [fi, fj] = n.from ?? [n.i, n.j];
      return {
        id: `npc:${n.id}`, sprite: n.def.sprite, frame: n.dir, palette: n.def.palette ?? null,
        i: fi + (n.i - fi) * k, j: fj + (n.j - fj) * k, label: n.def.name, still: true,
      };
    });
  }

  pickUp() {
    if (!this.itemDefs) return false;
    const me = this.tile;
    const d = FACE_STEP[this.player.dir];
    const p = this.drops.at(me.i, me.j) ?? this.drops.at(me.i + d.di, me.j + d.dj);
    if (!p) return false;
    addItem(this.game.session, p.item);
    this.drops.take(p);
    this.popup(this.itemDefs[p.item].name, COLORS.signal);
    this.game.sfx.play('confirm');
    return true;
  }

  render(g) {
    super.render(g);
    const { width: W, height: H } = this.game.config.screen;
    const w = this.warp;
    const dark = Math.max(this.fadeIn / this.game.config.field.fadeSec, w ? (w.t < WARP_SEC ? w.t / WARP_SEC : 2 - w.t / WARP_SEC) : 0);
    if (dark <= 0) return;
    g.fillStyle = `rgba(0,0,0,${Math.min(1, dark)})`;
    g.fillRect(0, 0, W, H);
  }

  cameraTarget(pp) {
    return pp;
  }

  // 上の帯に出すのは、最後に殴った敵（生きていて focusRange マス以内なら）。いなければ一番近い敵
  focusUnit() {
    const me = this.tile;
    const range = this.game.config.dungeon.focusRange;
    const last = this.lastHit;
    if (last && !last.dead && Math.min(...last.actorIds.map((id) => distance(this.actors[id], me))) <= range) return last;
    let best = null;
    let bestD = this.game.config.dungeon.focusRange + 1;
    for (const unit of this.units) {
      if (unit.dead) continue;
      const d = Math.min(...unit.actorIds.map((id) => distance(this.actors[id], me)));
      if (d < bestD) { best = unit; bestD = d; }
    }
    return best;
  }

  hudTitle(unit) {
    return unit ? unit.def.name : this.areaName();
  }

  drawArena(g, ox, oy, tile, floorDef) {
    super.drawArena(g, ox, oy, tile, floorDef);
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    // 森の色味は床だけに掛ける（人より先に描く）。areas があれば、主人公のいる場所の色味
    const tint = this.area()?.tint ?? this.map.tint;
    if (tint) {
      g.fillStyle = tint;
      g.fillRect(-4, -4, W + 8, H + 8);
    }
    const ms = performance.now();
    for (const e of this.map.exits ?? []) {
      const pos = isoCenter(e.at[0], e.at[1], ox, oy, tile);
      if (e.hole) drawHole(g, pos.x, pos.y, e.label, ms);
      else drawExit(g, pos.x, pos.y, e.label, ms);
    }
    for (const w of this.map.warps ?? []) {
      const pos = isoCenter(w.at[0], w.at[1], ox, oy, tile);
      drawHole(g, pos.x, pos.y, w.label, ms);
    }
    for (const p of this.drops.spots) {
      const pos = isoCenter(p.at[0], p.at[1], ox, oy, tile);
      drawPickup(g, p.item, pos.x, pos.y, ms);
    }
  }

  // 得点は判定と最大コンボに、倒した数 × killScore を足す（勝利ボーナスは無い）
  get score() {
    const k = this.cfg.score;
    return this.stats.perfect * k.perfect + this.stats.good * k.good + this.maxCombo * k.maxCombo
      + this.stats.kills * this.game.config.dungeon.killScore;
  }

  resultTitle() {
    return this.outcome === 'exit' ? { text: 'EXIT', color: COLORS.signal } : { text: 'LOSE…', color: COLORS.rose };
  }

  resultRows() {
    return [['KILLS', this.stats.kills], ...super.resultRows()];
  }
}
