import { STATES } from '../core/constants.js';
import { COLORS, isoCenter } from '../core/draw.js';
import { distance, FACE_STEP } from '../core/grid.js';
import { loadItems, addItem } from '../core/Items.js';
import { Pickups } from '../core/Pickups.js';
import { drawPickup, drawExit } from '../core/icons.js';
import { BattleState } from './BattleState.js';

// ダンジョン。入った瞬間から戦闘で、戦闘曲がループし続ける。仕組みは BattleState と同じ
// （拍の判定・攻撃の予告・回避・毒・EventTrack）で、違うのは次のところだけ。
// - 床はマップの floor。敵はマップの spawns に1匹ずつ（1匹で1つの一団）。ザコは遠いとうろつく
// - 敵を倒すと消える。全部倒しても勝ちにはならず、出口に乗ると終わる（EXIT）
// - 隣に敵がいないときの A は、足元か目の前に落ちている物を拾う（拍の判定はしない）
// - 倒れたら LOSE。どちらもリザルトのあと町へ戻る
export class DungeonState extends BattleState {
  name = STATES.DUNGEON;

  // enemies：敵の id → { def, patterns }（loadEnemy の結果）
  constructor(game, { map, enemies, onEnd }) {
    super(game, { def: null, patterns: null, onEnd });
    this.map = map;
    this.enemyData = enemies;
    this.exitTaken = null;
    this.itemDefs = null;
    loadItems().then((d) => { this.itemDefs = d; });
  }

  setupStage() {
    this.floor = this.map.floor;
    const { i, j, dir } = this.game.session.player;
    this.player = { i, j, dir, move: null };
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
    this.banner = { text: this.map.name, beat: this.fightBeat, steady: true };
  }

  // 主人公・生きている敵・出口のそばには物を置かない
  nearSomeone(i, j) {
    const near = ([a, b]) => Math.abs(a - i) <= 1 && Math.abs(b - j) <= 1;
    return near([this.player.i, this.player.j])
      || Object.values(this.actors).some((a) => !a.unit.dead && near([a.i, a.j]))
      || (this.map.exits ?? []).some((e) => near(e.at));
  }

  exitAt(i, j) {
    return (this.map.exits ?? []).find((e) => e.at[0] === i && e.at[1] === j) ?? null;
  }

  update(dt, presses) {
    super.update(dt, presses);
    this.drops.tick(dt);
    // 倒れた敵は1拍のあいだ点滅してから消える
    const beat = this.beats.currentBeat;
    for (const unit of this.units) {
      if (!unit.dead || unit.gone || beat - unit.deadBeat < 1) continue;
      unit.gone = true;
      for (const id of unit.actorIds) {
        delete this.actors[id];
        delete this.plan[id];
      }
    }
  }

  onStep() {
    const exit = this.exitAt(this.player.i, this.player.j);
    if (!exit || this.outcome) return;
    this.exitTaken = exit;
    this.game.sfx.play('confirm');
    this.decide('exit');
  }

  unitDown(unit) {
    unit.dead = true;
    unit.deadBeat = this.beats.currentBeat;
    this.stats.kills++;
    this.game.sfx.play('ko');
  }

  attack(t, b, slot) {
    if (!this.adjacentActor() && this.pickUp()) return undefined;
    return super.attack(t, b, slot);
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

  cameraTarget(pp) {
    return pp;
  }

  // 上の帯に出すのは、focusRange マス以内で一番近い敵
  focusUnit() {
    const me = this.tile;
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
    return unit ? unit.def.name : this.map.name;
  }

  drawArena(g, ox, oy, tile, floorDef) {
    super.drawArena(g, ox, oy, tile, floorDef);
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    // 森の色味は床だけに掛ける（人より先に描く）
    if (this.map.tint) {
      g.fillStyle = this.map.tint;
      g.fillRect(-4, -4, W + 8, H + 8);
    }
    const ms = performance.now();
    for (const e of this.map.exits ?? []) {
      const pos = isoCenter(e.at[0], e.at[1], ox, oy, tile);
      drawExit(g, pos.x, pos.y, e.label, ms);
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
