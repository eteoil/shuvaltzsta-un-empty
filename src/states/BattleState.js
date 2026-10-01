import { STATES } from '../core/constants.js';
import { BeatManager } from '../core/BeatManager.js';
import { WHITE } from '../core/Assets.js';
import { COLORS, text, panel, gauge, sprite, diamond, isoTop, isoCenter } from '../core/draw.js';
import { DIRS, FACE_STEP, distance, stepToward, faceToward, frameOf } from '../core/grid.js';
import { EventTrack } from '../battle/EventTrack.js';
import { Sequencer } from '../battle/Sequencer.js';
import { Judge } from '../battle/Judge.js';
import { PlayerProfile } from '../battle/PlayerProfile.js';
import { Enemy } from '../battle/Enemy.js';
import { areaTiles } from '../battle/areas.js';
import { DialogState } from './DialogState.js';
import { poisonTick, regen, regenStep, attackMultiplier } from '../core/Hero.js';
import { passTime, eventsOf } from '../core/Calendar.js';

const THREATS = new Set(['enemy.attack', 'enemy.feint']);
const LANE = { y: 280, h: 40, judgeX: 44 };
const key = (i, j) => `${i},${j}`;
const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

// 戦場を十字キーで自由に歩き、隣の敵を A で殴り、予告されたマスへの攻撃を B で避ける。
// 歩くのは自由、A と B だけが拍で判定される（憲法③：リズム入力は戦闘とダンジョンだけ。DungeonState はこれを土台にする）。
// 敵は「一団（unit）」ごとに HP と AI（Enemy）と EventTrack を1つずつ持つ。
// 1対1の戦闘は一団が1つ（チャック＆ジッパーは2人で1つ）、ダンジョンはスライム1匹ごとに1つ
export class BattleState {
  name = STATES.RHYTHM_BATTLE;
  pausable = true;
  rhythm = true;              // 戦闘中にだけ効くアイテムが使える State

  // giveUp：勝ったとき、リザルトの前に流す会話（無ければすぐリザルト）
  constructor(game, { def, patterns, giveUp = null, onEnd }) {
    this.game = game;
    this.giveUp = giveUp;
    this.def = def;
    this.patternData = patterns;
    this.onEnd = onEnd;
  }

  enter() {
    const { config, clock } = this.game;
    this.cfg = config.battle;
    this.bpb = config.beatsPerBar;
    this.beats = new BeatManager(clock, config);
    this.tracks = { system: new EventTrack('system') };
    this.seq = new Sequencer(this.tracks, config);
    this.judge = new Judge(config);
    this.profile = new PlayerProfile(config.profileWindow);

    // HP と毒は探索と戦闘をまたいで持ち越す（session.hero）
    this.hero = this.game.session.hero;
    // buffs：アイテムの一時効果（名前 → { until, def }）。終わりは EventTrack の system.status で知らせる
    this.buffs = {};
    this.ticking = { hero: false, regen: false };   // 毒・自動回復の次の1回を載せてあるか（一団の毒は unit:id）
    // actors は今いるマス。plan は確定済み区間の先頭時点でいる予定のマス（範囲と移動先はこちらで決める）
    // face は向いている方向の1歩。背中や横から殴ると2倍になる
    this.units = [];
    this.unitMap = {};
    this.actors = {};
    this.actorDefs = {};
    this.plan = {};
    this.moves = new Map();   // enemy.move の id → 移動先
    this.zones = new Map();   // enemy.attack / enemy.feint の id → 攻撃範囲

    this.combo = 0;
    this.maxCombo = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, damage: 0, kills: 0 };
    this.results = new Map();   // enemy イベントの id → 'dodge' | 'hit' | 'clear' | 'baited' | 'void'
    this.pending = [];          // 範囲内にいるまま拍を迎えた enemy.attack
    this.lastSlot = null;
    this.phase = 'intro';       // intro → fight → result
    this.outcome = null;
    this.finishBeat = null;
    this.resultBeat = null;
    this.leaving = false;

    // 演出（ゲーム性に影響しないので rAF の時刻で動かしてよい）
    this.anims = {};
    this.popups = [];
    this.banner = null;
    this.shakeAt = -1e9;
    this.flash = null;
    this.cam = null;
    this.runPhase = 0;          // 走ったマス数。走りのコマ送りに使う（1マスで2コマ）

    this.fightBeat = (config.bgm.battle.loopFromBar - 1) * this.bpb;
    this.dayRates = this.dayEffects();   // 行事によるザコの強さと落とす物の数
    this.setupStage();
    this.warmPoses();
    this.startMusic();
    if (this.hero.poisoned) this.startHeroPoison();
    if (this.hero.regen) this.startHeroRegen();
  }

  // 1対1：cfg.arena の広さの床に、相手の一団を1つ置く
  setupStage() {
    const { cols, rows } = this.cfg.arena;
    this.floor = Array.from({ length: rows }, () => '#'.repeat(cols));
    const [pi, pj] = this.cfg.player.start;
    this.player = { i: pi, j: pj, dir: 'ne', move: null };
    this.addUnit('main', this.def, this.patternData, this.def.actors.map((a) => ({ ...a, at: a.stage })));
  }

  // 曲を予約して Beat 0 を決める。1対1は前奏から（READY → FIGHT）
  startMusic() {
    const { clock, bgm } = this.game;
    this.beats.start(bgm.play('battle', clock.now + 0.1));
    this.tracks.system.add({ beat: this.fightBeat - 2 * this.bpb, type: 'system.phase', payload: { phase: 'ready' } });
    this.tracks.system.add({ beat: this.fightBeat, type: 'system.phase', payload: { phase: 'fight' } });
  }

  // 行事による敵の強さ（HP と攻撃力の倍率）と、ダンジョンで落とす物の数。強さが変わるのはザコだけ（ボスはいつも同じ）。
  // 忌み月：強い（taboo の倍率）・落とす物2個。祭り：落とす物2個（festival）。天赦日：弱い（restDay の倍率）。
  // 忌み月の祭り（水亀節20区のクイン＝ド＝レンチ）：強さはふだんどおり・落とす物3個（taboo.withFestival）
  dayEffects() {
    const { taboo, festival, restDay } = this.game.config;
    const ev = eventsOf(this.game.calendar, this.game.session.day);
    if (ev.taboo && ev.festival) return { enemyHp: 1, enemyPower: 1, dropCount: taboo.withFestival.dropCount };
    if (ev.taboo) return { enemyHp: taboo.enemyHp, enemyPower: taboo.enemyPower, dropCount: taboo.dropCount };
    if (ev.festival) return { enemyHp: 1, enemyPower: 1, dropCount: festival.dropCount };
    if (ev.rest) return { enemyHp: restDay.enemyHp, enemyPower: restDay.enemyPower, dropCount: 1 };
    return { enemyHp: 1, enemyPower: 1, dropCount: 1 };
  }

  // actors：[{ id, name, sprite, palette, at: [i, j] }]。id は戦闘の中で重ならない名前にする。
  // ザコ（boss の無い敵）は、行事の倍率で HP を変え、攻撃力の倍率を powerRate に持つ
  addUnit(id, def, patterns, actors) {
    const track = new EventTrack(`enemy:${id}`);
    const rates = def.boss ? { enemyHp: 1, enemyPower: 1 } : this.dayRates;
    const scaled = { ...def, hp: Math.max(1, Math.round(def.hp * rates.enemyHp)) };
    const unit = {
      id, def: scaled, enemy: new Enemy(scaled, patterns), track, actorIds: [],
      powerRate: rates.enemyPower, poisonUntil: -Infinity, confusedUntil: -Infinity, dead: false,
    };
    const me = { i: this.player.i, j: this.player.j };
    for (const a of actors) {
      const at = { i: a.at[0], j: a.at[1] };
      this.actorDefs[a.id] = a;
      this.actors[a.id] = { ...at, face: stepToward(at, me), from: null, movedBeat: -1e9, unit };
      this.plan[a.id] = { ...at };
      unit.actorIds.push(a.id);
    }
    this.units.push(unit);
    this.unitMap[id] = unit;
    this.tracks[track.name] = track;
    return unit;
  }

  unitOf(actorId) {
    return this.actors[actorId]?.unit ?? null;
  }

  get liveTracks() {
    return this.units.filter((u) => !u.dead).map((u) => u.track);
  }

  // 敵のイベントのうち from〜to 拍のもの（生きている一団すべて）
  enemyEvents(from, to) {
    return this.liveTracks.flatMap((t) => t.between(from, to));
  }

  // 色替えは初回に画像を作るので、戦闘中に引っかからないよう全コマ先に済ませておく
  warmPoses() {
    const { assets } = this.game;
    const seen = new Set();
    for (const a of [...Object.values(this.actorDefs), { sprite: 'player', palette: null }]) {
      const k = `${a.sprite}/${a.palette?.id ?? ''}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const sd = assets.def(a.sprite);
      for (const dir of Object.keys(sd.frames)) {
        for (const anim of [null, ...Object.keys(sd.anims ?? {})]) {
          for (let n = 0; n < (anim ? assets.frameCount(a.sprite, anim) : 1); n++) {
            assets.pose(a.sprite, dir, anim, n, a.palette);
            assets.pose(a.sprite, dir, anim, n, WHITE);
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- 盤面

  inArena(i, j) {
    return this.floor[j]?.[i] === '#';
  }

  // 歩いている途中は、半分を過ぎたら次のマスにいることにする
  get tile() {
    const m = this.player.move;
    if (m && m.t >= 0.5) return { i: m.to[0], j: m.to[1] };
    return { i: this.player.i, j: this.player.j };
  }

  actorAt(i, j) {
    return Object.keys(this.actors).find((id) => this.actors[id].i === i && this.actors[id].j === j) ?? null;
  }

  // 一団のうち、向かう先にいちばん近い者までの距離（確定済み区間の先頭時点の位置で）。向かう先が無ければ遠いことにする
  unitDistance(unit, beat) {
    return Math.min(...unit.actorIds.map((id) => {
      const goal = this.goalOf(id, beat);
      return goal ? distance(this.plan[id], goal) : 99;
    }));
  }

  confused(unit, beat) {
    return unit.confusedUntil > beat;
  }

  // 敵が向かう先。ふだんはプレイヤー。混乱中は一番近いほかの敵（いなければ null で、うろつくだけ）
  goalOf(id, beat) {
    const unit = this.unitOf(id);
    if (!unit || !this.confused(unit, beat)) return this.tile;
    const me = this.plan[id];
    const others = Object.keys(this.plan).filter((o) => o !== id && !this.unitOf(o)?.dead);
    if (!others.length) return null;
    return this.plan[others.reduce((a, b) => (distance(this.plan[a], me) <= distance(this.plan[b], me) ? a : b))];
  }

  walk(dt) {
    const p = this.player;
    if (p.hp <= 0) return;
    if (p.move) {
      const step = dt / this.cfg.moveSecPerTile;
      p.move.t += step;
      this.runPhase += step;
      if (p.move.t < 1) return;
      [p.i, p.j] = p.move.to;
      p.move = null;
      this.onStep();
    }
    const btn = this.game.input.latest(Object.keys(DIRS));
    if (!btn) return;
    const d = DIRS[btn];
    p.dir = d.face;
    const ni = p.i + d.di;
    const nj = p.j + d.dj;
    if (this.inArena(ni, nj) && !this.actorAt(ni, nj)) p.move = { from: [p.i, p.j], to: [ni, nj], t: 0 };
  }

  // 1マス歩き終えたとき（ダンジョンの出口など）
  onStep() {}

  // ---------------------------------------------------------------- 進行

  update(dt, presses) {
    passTime(this.game.session, dt * this.game.config.time.minutesPerSec);
    const beat = this.beats.currentBeat;
    // チートモードの自動回復。ポーズメニューで途中から ON にしても、次の小節から始まる
    if (this.game.options.cheat && !this.ticking.regen && !this.outcome) this.scheduleTick('regen', Math.max(beat, this.fightBeat));
    this.seq.update(beat, this);
    if (!this.outcome) this.refill(beat);
    for (const p of presses) this.onPress(p);
    this.walk(dt);
    this.expire();
    this.profile.prune(beat);
  }

  refill(beat) {
    for (const unit of this.units) {
      if (unit.dead) continue;
      const { track } = unit;
      while (this.seq.needsRefill(track, beat)) {
        let start = Math.max(track.endBeat, this.fightBeat);
        if (start < track.lockedUntil) start = ceilTo(track.lockedUntil, this.bpb);
        // 混乱中は毒でも逃げない（逃げると、混乱して狙ったほかの敵から離れてしまい、同士討ちが減る）
        const poisoned = unit.poisonUntil > beat && !this.confused(unit, beat);
        const pattern = unit.enemy.choosePattern(this.profile, { distance: this.unitDistance(unit, beat), poisoned });
        track.addPattern(this.bindPattern(pattern, unit), start);
      }
    }
  }

  // Pattern の actor をこの一団の役者に直し、一団の id を添える。
  // actor を省くか "self" と書くと一団の1人目（スライムのように1匹で1団の敵は、これで同じ Pattern を使い回せる）
  bindPattern(pattern, unit) {
    const actorOf = (name) => (unit.actorIds.includes(name) ? name : unit.actorIds[0]);
    return {
      ...pattern,
      events: pattern.events.map((e) => ({ ...e, payload: { ...e.payload, actor: actorOf(e.payload?.actor), unit: unit.id } })),
    };
  }

  // 確定済み区間に入った時点で、移動先と攻撃範囲を決める。以後は変えない（憲法⑮）
  prepare(ev) {
    const p = ev.payload;
    if (p.unit && this.unitMap[p.unit].dead) return;
    const at = this.beats.beatToTime(ev.beat);
    switch (ev.type) {
      case 'bgm.outro':
        this.game.bgm.outro(at);
        break;
      case 'enemy.telegraph':
        if (!this.outcome) this.game.sfx.play('telegraph', at);
        break;
      case 'enemy.move': {
        const from = this.plan[p.actor];
        const goal = this.goalOf(p.actor, ev.beat);
        const to = p.wander || !goal ? this.wanderStep(p.actor, from) : this.planStep(p.actor, from, p.away, goal);
        this.moves.set(ev.id, to);
        this.plan[p.actor] = to;
        break;
      }
      case 'enemy.attack':
      case 'enemy.feint': {
        const from = this.plan[p.actor];
        const goal = this.goalOf(p.actor, ev.beat);
        const dir = goal ? stepToward(from, goal) : this.actors[p.actor].face;
        const tiles = areaTiles(p.area, from, dir.di || dir.dj ? dir : { di: 0, dj: 1 })
          .filter(([i, j]) => this.inArena(i, j));
        this.zones.set(ev.id, {
          beat: ev.beat,
          feint: ev.type === 'enemy.feint',
          // 混乱した敵の攻撃。ほかの敵にだけ当たり、主人公には当たらない
          confused: this.confused(this.unitOf(p.actor), ev.beat),
          dodgeable: p.dodgeable !== false,
          tiles,
          set: new Set(tiles.map(([i, j]) => key(i, j))),
        });
        break;
      }
      default:
        break;
    }
  }

  // goal（ふだんはプレイヤー）へ1歩（away なら離れる1歩）。塞がっていたらもう一方の軸、それも駄目ならその場
  planStep(id, from, away = false, goal = this.tile) {
    const me = this.tile;
    const target = away ? { i: 2 * from.i - goal.i, j: 2 * from.j - goal.j } : goal;
    const taken = (i, j) => (i === me.i && j === me.j)
      || Object.entries(this.plan).some(([other, q]) => other !== id && q.i === i && q.j === j);
    const di = Math.sign(target.i - from.i);
    const dj = Math.sign(target.j - from.j);
    const tries = Math.abs(target.i - from.i) >= Math.abs(target.j - from.j) ? [[di, 0], [0, dj]] : [[0, dj], [di, 0]];
    for (const [a, b] of tries) {
      if (!a && !b) continue;
      const i = from.i + a;
      const j = from.j + b;
      if (this.inArena(i, j) && !taken(i, j)) return { i, j };
    }
    return { ...from };
  }

  // 行き先の決まっていない1歩（うろつき）。塞がっていればその場
  wanderStep(id, from) {
    const me = this.tile;
    const dirs = Object.values(DIRS).filter(({ di, dj }) => {
      const i = from.i + di;
      const j = from.j + dj;
      return this.inArena(i, j) && !(i === me.i && j === me.j)
        && !Object.entries(this.plan).some(([other, q]) => other !== id && q.i === i && q.j === j);
    });
    if (!dirs.length) return { ...from };
    const d = dirs[Math.floor(Math.random() * dirs.length)];
    return { i: from.i + d.di, j: from.j + d.dj };
  }

  fire(ev) {
    const p = ev.payload;
    // 倒れた一団のイベントは何も起こさない
    if (p.unit && this.unitMap[p.unit].dead) {
      this.results.set(ev.id, 'void');
      return;
    }
    switch (ev.type) {
      case 'system.phase':
        if (p.phase === 'fight') this.phase = 'fight';
        this.banner = { text: p.phase === 'fight' ? 'FIGHT!' : 'READY', beat: ev.beat };
        break;
      case 'system.finish':
        if (this.outcome === 'win' && this.giveUp) {
          this.phase = 'talk';
          this.game.states.push(new DialogState(this.game, this.giveUp, () => this.showResult(this.beats.currentBeat)));
        } else {
          this.showResult(ev.beat);
        }
        break;
      case 'enemy.move': {
        const to = this.moves.get(ev.id);
        const a = this.actors[p.actor];
        const me = this.tile;
        const blocked = (to.i === me.i && to.j === me.j)
          || (this.player.move && to.i === this.player.move.to[0] && to.j === this.player.move.to[1]);
        if (blocked) break;
        a.face = stepToward(a, to);
        a.from = { i: a.i, j: a.j };
        a.i = to.i;
        a.j = to.j;
        a.movedBeat = ev.beat;
        break;
      }
      case 'enemy.telegraph':
        if (this.outcome) break;
        this.turn(p.actor);
        this.anim(p.actor, 'windup', ev.beat);
        break;
      case 'enemy.attack':
        if (this.outcome) { this.results.set(ev.id, 'void'); break; }
        this.turn(p.actor);
        this.anim(p.actor, 'strike', ev.beat);
        if (this.results.has(ev.id)) break;
        if (this.zones.get(ev.id)?.confused) { this.confusedHit(ev, this.zones.get(ev.id)); break; }
        if (this.zones.get(ev.id)?.set.has(key(this.tile.i, this.tile.j))) this.pending.push(ev);
        else this.results.set(ev.id, 'clear');
        break;
      case 'enemy.feint':
        if (this.outcome) break;
        this.turn(p.actor);
        this.anim(p.actor, 'feint', ev.beat);
        break;
      case 'system.status':
        this.onStatus(ev);
        break;
      case 'fx.flash':
        this.flash = { color: p.color, at: performance.now() };
        break;
      default:
        break;
    }
  }

  // 行動するたびに向かう先（ふだんはプレイヤー）へ向き直る。その合間が回り込むすき
  turn(id) {
    const a = this.actors[id];
    const goal = this.goalOf(id, this.beats.currentBeat);
    if (!goal) return;
    const s = stepToward(a, goal);
    if (s.di || s.dj) a.face = s;
  }

  // 混乱した敵の攻撃は、範囲にいるほかの敵に当たる（主人公には当たらない）
  confusedHit(ev, zone) {
    this.results.set(ev.id, 'clear');
    for (const [id, a] of Object.entries(this.actors)) {
      if (id === ev.payload.actor || a.unit.dead || !zone.set.has(key(a.i, a.j))) continue;
      const { unit } = a;
      const n = Math.min(ev.payload.power ?? 10, unit.enemy.hp);
      unit.enemy.hp -= n;
      this.popup(String(n), COLORS.unguard, id);
      this.anim(id, 'hurt', ev.beat);
      this.game.sfx.play('hit');
      if (unit.enemy.down) this.unitDown(unit, ev.beat);
    }
  }

  // プレイヤーが敵の背中側か横にいるか
  behind(id) {
    const a = this.actors[id];
    const me = this.tile;
    return (me.i - a.i) * a.face.di + (me.j - a.j) * a.face.dj <= 0;
  }

  onPress({ btn, t }) {
    if (this.phase === 'result') {
      if (this.resultReady && (btn === 'a' || btn === 'start')) this.leave();
      return;
    }
    if (btn === 'pause' || btn === 'start') { this.game.pause(); return; }
    if ((btn !== 'a' && btn !== 'b') || this.phase !== 'fight' || this.outcome) return;

    const b = this.beats.perceivedBeatAt(t);
    const slot = Math.round(b);
    if (slot === this.lastSlot) return;   // 1拍につき1アクション
    this.lastSlot = slot;
    if (btn === 'a') this.attack(t, b, slot);
    else this.dodge(t, b);
  }

  // 隣（斜めを含む8マス）にいる敵。毒針・パニックドロップの間は reach マス先まで。向いている方を優先する
  // 隣に何匹かいるときは、目の前のマス（届くなら2マス先も）の敵を最優先にする。
  // 斜めの敵を先に選ぶと、殴ったつもりのない敵に当たってしまう
  adjacentActor() {
    const me = this.tile;
    const reach = Math.max(1, ...Object.values(this.buffs).map((v) => v.def.reach ?? 1));
    const ids = Object.keys(this.actors)
      .filter((id) => !this.actors[id].unit.dead && distance(this.actors[id], me) <= reach)
      .sort((x, y) => distance(this.actors[x], me) - distance(this.actors[y], me));
    const step = FACE_STEP[this.player.dir];
    for (let k = 1; k <= reach; k++) {
      const front = ids.find((id) => this.actors[id].i === me.i + step.di * k && this.actors[id].j === me.j + step.dj * k);
      if (front) return front;
    }
    const facing = ids.find((id) => faceToward(me, this.actors[id]) === this.player.dir);
    return facing ?? ids[0] ?? null;
  }

  attack(t, b, slot) {
    const target = this.adjacentActor();
    if (target) this.player.dir = faceToward(this.tile, this.actors[target]);
    this.anim('player', 'attack', b);
    let grade = this.judge.grade(this.beats.deltaMs(t, slot));
    if (!grade) return this.fail(b, 'MISS');
    if (!target) return this.fail(b, 'とどかない');
    if (this.buffs.perfect) grade = 'perfect';
    const back = this.behind(target);
    if (!back && this.spanAt('enemy.guard', slot, target)) {
      this.combo = 0;
      this.profile.record('attack', b);
      this.popup('BLOCK', COLORS.guard, target);
      this.game.sfx.play('block');
      return undefined;
    }
    const c = this.cfg;
    const dmg = Math.round(c.player.attack
      * (grade === 'perfect' ? c.perfectMultiplier : 1)
      * (1 + Math.min(this.combo * c.comboBonus, c.comboBonusMax))
      * (this.spanAt('enemy.open', slot, target) ? c.openMultiplier : 1)
      * (back ? c.backMultiplier : 1)
      * attackMultiplier(this.game));
    const unit = this.unitOf(target);
    this.lastHit = unit;
    unit.enemy.hp = Math.max(0, unit.enemy.hp - dmg);
    this.success(grade, 'attack', b);
    this.popup(back ? `BACK! ${dmg}` : String(dmg), back ? COLORS.perfect : COLORS.ink, target);
    this.anim(target, 'hurt', b);
    // 毒針・パニックドロップ：1回使うごとに、それぞれの敵を1回だけ毒・混乱にする（殴り続けても延びない）
    const { needle, panic } = this.buffs;
    if (needle && !needle.struck.has(unit.id)) {
      needle.struck.add(unit.id);
      this.poisonEnemy(unit, b, needle.def.poisonBeats);
    }
    if (panic && !panic.struck.has(unit.id)) {
      panic.struck.add(unit.id);
      this.confuse(unit, b, panic.def.confuseBeats);
    }
    if (unit.enemy.down) this.unitDown(unit, b);
    return undefined;
  }

  // 一団を倒した。全部倒したら勝ち
  unitDown(unit) {
    unit.dead = true;
    this.stats.kills++;
    this.game.sfx.play('ko');
    if (this.units.every((u) => u.dead)) this.decide('win');
  }

  // 拍の近くにある攻撃のうち、自分が範囲に入っているものを避ける
  dodge(t, b) {
    this.anim('player', 'dodge', b);
    const here = key(this.tile.i, this.tile.j);
    const near = this.enemyEvents(b - 2, b + 2)
      .filter((e) => THREATS.has(e.type) && !this.results.has(e.id) && this.zones.get(e.id)?.dodgeable && !this.zones.get(e.id).confused
        && this.dodgeGrade(this.beats.deltaMs(t, e.beat)))
      .sort((x, y) => Math.abs(this.beats.deltaMs(t, x.beat)) - Math.abs(this.beats.deltaMs(t, y.beat)));
    const target = near.find((e) => this.zones.get(e.id)?.set.has(here));
    if (!target) return this.fail(b, 'MISS');
    if (target.type === 'enemy.feint') {
      this.results.set(target.id, 'baited');
      return this.fail(b, 'FEINT!');
    }
    this.results.set(target.id, 'dodge');
    this.success(this.dodgeGrade(this.beats.deltaMs(t, target.beat)), 'dodge', b);
    this.game.sfx.play('dodge');
    return undefined;
  }

  // 回避の判定。ローリングスター（酔拳）の間は、拍から dodgeWindowMs 以内ならすべて PERFECT
  dodgeGrade(deltaMs) {
    const sway = this.buffs.sway;
    if (!sway) return this.judge.grade(deltaMs);
    return Math.abs(deltaMs) <= sway.def.dodgeWindowMs ? 'perfect' : null;
  }

  // enemy.guard / enemy.open のように長さを持つイベントの区間内か
  spanAt(type, slot, actor) {
    const tracks = actor ? [this.unitOf(actor)?.track].filter(Boolean) : this.liveTracks;
    return tracks.some((t) => t.between(slot - 16, slot + 1)
      .some((e) => e.type === type && (!actor || e.payload.actor === actor)
        && e.beat <= slot && slot < e.beat + (e.payload.length ?? 1)));
  }

  success(grade, kind, b) {
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.stats[grade]++;
    this.profile.record(kind, b);
    this.popup(grade === 'perfect' ? 'PERFECT' : 'GOOD', COLORS[grade]);
    if (kind === 'attack') this.game.sfx.play(grade);
  }

  fail(b, label) {
    this.combo = 0;
    this.stats.miss++;
    this.profile.record('miss', b);
    this.popup(label, COLORS.miss);
    this.game.sfx.play('miss');
    return undefined;
  }

  hit(ev) {
    this.results.set(ev.id, 'hit');
    // 痛み止めの間は damageRate 倍（半分）。powerRate は行事によるザコの攻撃力の倍率（dayEffects）
    const rate = this.unitMap[ev.payload.unit]?.powerRate ?? 1;
    const power = Math.max(1, Math.round((ev.payload.power ?? 10) * rate * (this.buffs.guard?.def.damageRate ?? 1)));
    this.hero.hp = Math.max(0, this.hero.hp - power);
    this.stats.damage += power;
    this.fail(ev.beat, 'HIT');
    this.game.sfx.play('hit');
    this.anim('player', 'hurt', ev.beat);
    this.shakeAt = performance.now();
    if (this.hero.hp <= 0) this.decide('lose');
  }

  // 範囲内で拍を迎え、判定ウィンドウのうちに避けも逃げもしなかったら被弾。
  // ローリングスターの間は回避の幅が広いので、そのぶん待ってから被弾にする
  expire() {
    const now = this.beats.perceivedNow;
    const good = Math.max(this.judge.goodSec, (this.buffs.sway?.def.dodgeWindowMs ?? 0) / 1000);
    this.pending = this.pending.filter((ev) => {
      if (this.results.has(ev.id)) return false;
      if (now <= this.beats.beatToTime(ev.beat) + good) return true;
      const inside = this.zones.get(ev.id).set.has(key(this.tile.i, this.tile.j));
      if (this.outcome) this.results.set(ev.id, 'void');
      else if (inside) this.hit(ev);
      else this.results.set(ev.id, 'clear');
      return false;
    });
  }

  // 決着。終了は確定済み区間の先の小節頭に載せる（憲法⑭⑮）。
  // 曲は途中で切ると不自然なので、アウトロへ自然につながる小節頭まで待ってから切り替える。
  // 勝つと「まいった」の会話が上に乗って戦闘の update は止まるが、曲は流れ続ける。
  // 切り替えの予約が遅れないよう、載せたその場で prepare しておく（2度目の prepare は Bgm が無視する）
  decide(outcome) {
    if (this.outcome) return;
    this.outcome = outcome;
    const at = ceilTo(this.tracks.system.lockedUntil, this.bpb);
    this.prepare(this.tracks.system.add({ beat: this.game.bgm.joinBeat('battle', at), type: 'bgm.outro' }));
    this.tracks.system.add({ beat: at, type: 'system.finish', payload: { outcome } });
    this.finishBeat = at;
  }

  // ---------------------------------------------------------------- 状態異常とアイテム効果

  // 確定済み区間の先の小節頭（ここより手前にはイベントを足せない。憲法⑮）
  nextOpenBar(minBeat = -Infinity) {
    return ceilTo(Math.max(this.tracks.system.lockedUntil, minBeat), this.bpb);
  }

  addBuff(def) {
    const until = this.beats.currentBeat + def.beats;
    // struck：この効き目のあいだに毒・混乱にした一団（毒針・パニックドロップは1回の使用で1体1回まで）
    this.buffs[def.buff] = { until, def, struck: new Set() };
    this.tracks.system.add({ beat: Math.max(until, this.tracks.system.lockedUntil), type: 'system.status', payload: { action: 'end', buff: def.buff } });
  }

  startHeroPoison() {
    this.scheduleTick('hero');
  }

  // 食べ物の継続回復（フライドドラコ）。毒と同じく小節頭で、status.regen.tickBeats 拍ごと
  startHeroRegen() {
    this.scheduleTick('food');
  }

  // パニックドロップで殴った敵を混乱させる。混乱は確定済み区間の先の行動から効く（憲法⑮）
  confuse(unit, beat, beats) {
    if (!this.confused(unit, beat)) this.popup('混乱！', COLORS.perfect, unit.actorIds[0]);
    unit.confusedUntil = Math.max(unit.confusedUntil, beat + beats);
  }

  poisonEnemy(unit, beat, beats) {
    const first = unit.poisonUntil <= beat;
    unit.poisonUntil = Math.max(unit.poisonUntil, beat + beats);
    if (first) this.popup('毒！', COLORS.unguard, unit.actorIds[0]);
    this.scheduleTick(`unit:${unit.id}`);
  }

  // 毒のダメージ（とチートモードの自動回復）は一定拍ごとの小節頭。次の1回だけを載せ、発火したらまた次を載せる
  scheduleTick(target, after = this.fightBeat) {
    if (this.ticking[target]) return;
    this.ticking[target] = true;
    this.tracks.system.add({ beat: this.nextOpenBar(after), type: 'system.status', payload: { action: 'tick', target } });
  }

  onStatus(ev) {
    const p = ev.payload;
    if (p.action === 'end') {
      if (this.buffs[p.buff]?.until <= ev.beat + 1e-6) delete this.buffs[p.buff];
      return;
    }
    this.ticking[p.target] = false;
    if (this.outcome) return;
    const poison = this.game.config.status.poison;
    const next = ev.beat + poison.tickBeats;
    // 毒では倒れない（HP は 1 残る）
    if (p.target === 'hero' && this.hero.poisoned) {
      const { damage, cured } = poisonTick(this.game, Math.max(1, Math.round(poison.heroDamage * (this.buffs.guard?.def.damageRate ?? 1))));
      if (damage) this.popup(`毒 ${damage}`, COLORS.unguard);
      if (cured) this.popup('毒が消えた', COLORS.open);
      else this.scheduleTick('hero', next);
    }
    if (p.target === 'food' && this.hero.regen) {
      const n = regenStep(this.hero);
      if (n) this.popup(`+${n}`, COLORS.open);
      if (this.hero.regen) this.scheduleTick('food', ev.beat + this.game.config.status.regen.tickBeats);
    }
    if (p.target === 'regen' && this.game.options.cheat) {
      const cheat = this.game.config.cheat;
      regen(this.game, cheat.battleRegen);
      this.scheduleTick('regen', ev.beat + cheat.battleRegenBeats);
    }
    const unit = p.target.startsWith('unit:') ? this.unitMap[p.target.slice(5)] : null;
    if (unit && !unit.dead && unit.poisonUntil > ev.beat) {
      const n = Math.min(Math.round(poison.enemyDamage * attackMultiplier(this.game)), unit.enemy.hp - 1);
      unit.enemy.hp -= n;
      if (n) this.popup(`毒 ${n}`, COLORS.unguard, unit.actorIds[0]);
      this.scheduleTick(p.target, next);
    }
  }

  // リザルトは、アウトロが鳴り終わるまで閉じられない
  get resultReady() {
    return this.beats.currentBeat >= this.resultBeat + this.bpb && this.game.clock.now >= this.game.bgm.outroEndsAt;
  }

  // スコアはリザルトを出した時点で決める。あとで HP が変わっても（レベルアップなど）表示も渡す値も変わらない
  showResult(beat) {
    this.phase = 'result';
    this.resultBeat = beat;
    this.resultAt = performance.now();
    this.finalScore = this.score;
  }

  // 係数は gameConfig の battle.score。勝ったときだけ勝利ボーナスと残りHPを足す
  get score() {
    const k = this.cfg.score;
    const base = this.stats.perfect * k.perfect + this.stats.good * k.good + this.maxCombo * k.maxCombo;
    return this.outcome === 'win' ? base + k.win + this.hero.hp * k.hpLeft : base;
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.bgm.stop(0.6);
    this.onEnd(this.outcome, this.finalScore ?? this.score, this);
  }

  // ---------------------------------------------------------------- 演出

  anim(id, kind, beat) {
    this.anims[id ?? this.units[0].actorIds[0]] = { kind, beat };
  }

  popup(label, color, at = 'player') {
    this.popups.push({ label, color, at, t: performance.now() });
    if (this.popups.length > 6) this.popups.shift();
  }

  offsetOf(id, beat, toward) {
    const a = this.anims[id];
    const none = { dx: 0, dy: 0, white: false };
    if (!a) return none;
    const age = beat - a.beat;
    const k = (dur) => Math.max(0, 1 - age / dur);
    switch (a.kind) {
      // 構えや跳ぶ動きはコマで描く。ここは画面上の踏み込みと被弾ののけぞりだけ
      case 'strike': return age < 0.6 ? { dx: toward.x * 12 * k(0.6), dy: toward.y * 12 * k(0.6), white: false } : none;
      case 'attack': return age < 0.5 ? { dx: toward.x * 8 * k(0.5), dy: toward.y * 8 * k(0.5), white: false } : none;
      case 'hurt': return age < 0.4 ? { dx: -toward.x * 6 * k(0.4), dy: 0, white: age < 0.15 } : none;
      default: return none;
    }
  }

  // いまのモーションとコマ番号。攻撃・回避・構えは拍で、走りは進んだ距離でコマを送る
  poseOf(id, beat) {
    const a = this.anims[id];
    const age = a ? beat - a.beat : Infinity;
    const at = (dur, count) => Math.min(count - 1, Math.floor((age / dur) * count));
    if (id === 'player') {
      if (a?.kind === 'attack' && age < 0.5) return { anim: 'attack', n: at(0.5, 3) };
      if (a?.kind === 'dodge' && age < 0.6) return { anim: 'dodge', n: at(0.6, 3) };
      if (this.player.move) return { anim: 'run', n: Math.floor(this.runPhase * 2) };
      return { anim: null, n: 0 };
    }
    if ((a?.kind === 'windup' && age < 1) || (a?.kind === 'feint' && age < 0.5)) return { anim: 'attack', n: 0 };
    if (a?.kind === 'strike' && age < 0.6) return { anim: 'attack', n: age < 0.25 ? 1 : 2 };
    const actor = this.actors[id];
    const moved = beat - actor.movedBeat;
    if (actor.from && moved < 0.5) return { anim: 'run', n: Math.floor((moved / 0.5) * 4) };
    return { anim: null, n: 0 };
  }

  // 描画用の位置（歩きと敵の移動をなめらかにつなぐ）
  playerPos() {
    const p = this.player;
    if (!p.move) return { i: p.i, j: p.j };
    const t = Math.min(1, p.move.t);
    return {
      i: p.move.from[0] + (p.move.to[0] - p.move.from[0]) * t,
      j: p.move.from[1] + (p.move.to[1] - p.move.from[1]) * t,
    };
  }

  actorPos(a, beat) {
    const t = Math.min(1, Math.max(0, (beat - a.movedBeat) / 0.5));
    if (!a.from || t >= 1) return { i: a.i, j: a.j };
    return { i: a.from.i + (a.i - a.from.i) * t, j: a.from.j + (a.j - a.from.j) * t };
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const beat = this.beats.currentBeat;
    const now = performance.now();
    const { assets } = this.game;
    const floorDef = assets.def('floor');
    const tile = floorDef.tile;

    const pp = this.playerPos();
    const ids = Object.keys(this.actors);
    const ap = Object.fromEntries(ids.map((id) => [id, this.actorPos(this.actors[id], beat)]));
    const target = this.cameraTarget(pp, ap);
    this.cam = this.cam ? { i: this.cam.i + (target.i - this.cam.i) * 0.12, j: this.cam.j + (target.j - this.cam.j) * 0.12 } : target;
    const ox = Math.round(W / 2 - (this.cam.i - this.cam.j) * tile[0] / 2);
    const oy = Math.round(196 - tile[1] / 2 - (this.cam.i + this.cam.j) * tile[1] / 2);

    g.save();
    const shake = now - this.shakeAt < 180 ? 3 : 0;
    if (shake) g.translate(Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));
    g.fillStyle = '#12142a';
    g.fillRect(-4, -4, W + 8, H + 8);
    const barPulse = Math.max(0, 1 - (beat - Math.floor(beat / this.bpb) * this.bpb));
    g.fillStyle = `rgba(123,216,201,${0.08 * barPulse})`;
    g.fillRect(0, 0, W, H);

    this.drawArena(g, ox, oy, tile, floorDef);
    this.drawZones(g, beat, ox, oy, tile);
    this.drawPeople(g, beat, ox, oy, tile, pp, ap);
    this.drawPopups(g, now);
    g.restore();

    if (this.flash && now - this.flash.at < 120) {
      g.fillStyle = this.flash.color;
      g.globalAlpha = 0.25;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    this.drawHud(g, beat);
    this.drawLane(g, beat);
    this.drawOverlay(g, beat, now);
  }

  // カメラはプレイヤー寄りに、敵との間を見る
  cameraTarget(pp, ap) {
    const ids = Object.keys(ap);
    if (!ids.length) return pp;
    const ci = ids.reduce((s, id) => s + ap[id].i, 0) / ids.length;
    const cj = ids.reduce((s, id) => s + ap[id].j, 0) / ids.length;
    return { i: pp.i * 0.65 + ci * 0.35, j: pp.j * 0.65 + cj * 0.35 };
  }

  drawArena(g, ox, oy, tile, floorDef) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const img = this.game.assets.get('floor', 'default');
    const rows = this.floor.length;
    const cols = this.floor[0].length;
    for (let s = 0; s <= cols + rows - 2; s++) {
      for (let i = 0; i < cols; i++) {
        const j = s - i;
        if (j < 0 || j >= rows || !this.inArena(i, j)) continue;
        const p = isoTop(i, j, ox, oy, tile);
        if (p.x < -tile[0] || p.x > W + tile[0] || p.y > H || p.y < -floorDef.size[1]) continue;
        sprite(g, img, floorDef, p.x, p.y);
      }
    }
  }

  // 攻撃の予告。拍が近づくほど濃くなる。フェイントは枠だけ
  drawZones(g, beat, ox, oy, tile) {
    const look = this.game.config.lookaheadBeats;
    const [tw, th] = tile;
    for (const [id, z] of this.zones) {
      const left = z.beat - beat;
      if (left < -0.35 || left > look) continue;
      if (this.results.get(id) === 'void' || (left < 0 && z.feint)) continue;
      const heat = Math.min(1, Math.max(0, 1 - left / look));
      for (const [i, j] of z.tiles) {
        const p = isoTop(i, j, ox, oy, tile);
        g.beginPath();
        g.moveTo(p.x, p.y + 2);
        g.lineTo(p.x + tw / 2 - 4, p.y + th / 2);
        g.lineTo(p.x, p.y + th - 2);
        g.lineTo(p.x - tw / 2 + 4, p.y + th / 2);
        g.closePath();
        if (z.feint) {
          g.lineWidth = 2;
          g.strokeStyle = `rgba(255,95,95,${0.35 + 0.5 * heat})`;
          g.stroke();
        } else {
          const rgb = z.confused ? '245,201,57' : z.dodgeable ? '255,70,70' : '196,107,255';
          g.fillStyle = left < 0 ? 'rgba(255,255,255,0.6)' : `rgba(${rgb},${0.18 + 0.5 * heat})`;
          g.fill();
        }
      }
    }
  }

  drawPeople(g, beat, ox, oy, tile, pp, ap) {
    const { assets } = this.game;
    const people = [{ id: 'player', sprite: 'player', frame: this.player.dir, palette: null, i: pp.i, j: pp.j, down: this.hero.hp <= 0, lift: this.playerLift(), shift: this.playerShift() }];
    for (const [id, a] of Object.entries(this.actors)) {
      const d = this.actorDefs[id];
      const pos = ap[id];
      // 気絶する敵（敵データの faints。監獄の看守）は、倒れても点滅せず、気絶した姿（frame の faint）で残る
      const fainted = a.unit.dead && a.unit.def.faints;
      people.push({ id, sprite: d.sprite, frame: fainted ? 'faint' : frameOf(a.face), palette: d.palette, i: pos.i, j: pos.j, down: a.unit.dead && !fainted, fainted, unit: a.unit });
    }
    people.push(...this.extraPeople(beat));
    const screen = (c) => isoCenter(c.i, c.j, ox, oy, tile);
    const me = screen(people[0]);
    // プレイヤーは一番近い敵のほうへ身を乗り出す
    const nearest = people.slice(1).sort((x, y) => Math.hypot(x.i - pp.i, x.j - pp.j) - Math.hypot(y.i - pp.i, y.j - pp.j))[0];
    people.sort((a, b) => a.i + a.j - (b.i + b.j));
    for (const c of people) {
      const def = assets.def(c.sprite);
      const pos = screen(c);
      const other = c.id === 'player' ? (nearest ? screen(nearest) : pos) : me;
      const len = Math.hypot(other.x - pos.x, other.y - pos.y) || 1;
      const toward = { x: (other.x - pos.x) / len, y: (other.y - pos.y) / len };
      const o = this.offsetOf(c.id, beat, toward);
      const alpha = c.down ? 0.35 + 0.3 * Math.sin(performance.now() / 60) : 1;
      g.fillStyle = 'rgba(11,12,24,0.45)';
      g.beginPath();
      g.ellipse(pos.x, pos.y, 22, 8, 0, 0, Math.PI * 2);
      g.fill();
      const { anim, n } = c.down || c.fainted || c.still ? { anim: null, n: 0 } : this.poseOf(c.id, beat);
      const pose = assets.pose(c.sprite, c.frame, anim, n, o.white ? WHITE : c.palette);
      sprite(g, pose.img, pose.def, pos.x + o.dx + (c.shift ?? 0), pos.y + o.dy + (c.down ? 6 : 0) + (c.lift ?? 0), alpha);
      const top = pos.y - def.anchor[1] - 4;
      if (c.fainted) this.drawDizzy(g, pos.x, pos.y - 84);
      else if (c.label) text(g, c.label, pos.x, top - 6, { size: 12, align: 'center', color: COLORS.brass });
      else if (c.id !== 'player' && !c.down) this.drawActorMarks(g, c, pos, top, beat);
      c.screen = { x: pos.x, y: pos.y - def.anchor[1] };
    }
    this.lastPeople = people;
  }

  // 主人公を上へ浮かせて描くドット数（負で上。奈落へ落ちてくるところ）
  playerLift() {
    return 0;
  }

  // 主人公を横へずらして描くドット数（崖を滑り落ちてくるところ）
  playerShift() {
    return 0;
  }

  // 敵のほかに並べて描く人（ダンジョンの NPC）。{ id, sprite, frame, palette, i, j, label, still }
  extraPeople() {
    return [];
  }

  // 気絶した敵の頭の上を回る星
  drawDizzy(g, x, y) {
    const t = performance.now() / 500;
    for (let k = 0; k < 3; k++) {
      const a = t + (k * Math.PI * 2) / 3;
      text(g, '★', x + Math.cos(a) * 14, y + Math.sin(a) * 4, { size: 12, align: 'center', color: COLORS.perfect });
    }
  }

  // 敵の頭上の「!」「GUARD」「CHANCE」
  drawActorMarks(g, c, pos, top, beat) {
    const slot = Math.floor(beat);
    if (this.anims[c.id]?.kind === 'windup' && beat - this.anims[c.id].beat < 1) text(g, '!', pos.x, top - 14, { color: COLORS.brass, align: 'center' });
    if (this.spanAt('enemy.guard', slot, c.id)) text(g, 'GUARD', pos.x, top, { size: 12, color: COLORS.guard, align: 'center' });
    if (this.spanAt('enemy.open', slot, c.id)) text(g, 'CHANCE', pos.x, top, { size: 12, color: COLORS.open, align: 'center' });
    if (this.confused(c.unit, beat)) text(g, '混乱', pos.x, top - 30, { size: 12, color: COLORS.perfect, align: 'center' });
  }

  drawPopups(g, now) {
    const people = this.lastPeople || [];
    this.popups = this.popups.filter((p) => now - p.t < 650);
    // 新しいものほど下。古いものは押し上げる
    const stack = {};
    for (let k = this.popups.length - 1; k >= 0; k--) {
      const p = this.popups[k];
      const anchor = people.find((c) => c.id === p.at);
      if (!anchor?.screen) continue;
      const age = (now - p.t) / 650;
      const n = (stack[p.at] = (stack[p.at] ?? -1) + 1);
      text(g, p.label, anchor.screen.x, anchor.screen.y + 10 - age * 18 - n * 16, { color: p.color, align: 'center', alpha: 1 - age * age });
    }
  }

  // 上の帯に HP を出す一団（1対1は相手、ダンジョンは一番近い敵）
  focusUnit() {
    return this.units[0];
  }

  hudTitle(unit) {
    return unit.def.name;
  }

  drawHud(g, beat) {
    const W = this.game.config.screen.width;
    g.fillStyle = 'rgba(11,12,24,0.8)';
    g.fillRect(0, 0, W, 26);
    const unit = this.focusUnit();
    text(g, this.hudTitle(unit), 8, 5);
    if (unit) {
      gauge(g, 150, 9, 110, 9, unit.enemy.hp / unit.enemy.maxHp, COLORS.rose);
      if (unit.poisonUntil > beat) text(g, '毒', 150, 26, { size: 12, color: COLORS.unguard });
      if (this.confused(unit, beat)) text(g, '混乱', 168, 26, { size: 12, color: COLORS.perfect });
    }
    if (this.hero.poisoned) text(g, '毒', 344, 26, { size: 12, color: COLORS.unguard });
    if (this.hero.regen) text(g, '回復', this.hero.poisoned ? 362 : 344, 26, { size: 12, color: COLORS.open });
    Object.values(this.buffs).forEach((v, i) => {
      text(g, `${v.def.name} ${Math.max(0, Math.ceil(v.until - beat))}`, W - 8, 28 + i * 14, { size: 12, align: 'right', color: COLORS.perfect });
    });
    text(g, 'HP', 318, 5, { color: COLORS.signal });
    gauge(g, 344, 9, 128, 9, this.hero.hp / this.hero.maxHp, COLORS.signal);
    const inBar = ((Math.floor(beat) % this.bpb) + this.bpb) % this.bpb;
    for (let i = 0; i < this.bpb; i++) {
      g.fillStyle = beat >= 0 && i === inBar ? (i === 0 ? COLORS.brass : COLORS.ink) : COLORS.line;
      g.fillRect(274 + i * 9, 10, 6, 6);
    }
    if (this.combo >= 2) {
      text(g, String(this.combo), 10, LANE.y - 44, { size: 32, color: COLORS.perfect });
      text(g, 'COMBO', 12, LANE.y - 14, { size: 12, color: COLORS.brass });
    }
  }

  // 拍の目安。敵の攻撃が流れてきて、左端の線に重なった瞬間が拍
  drawLane(g, beat) {
    const W = this.game.config.screen.width;
    const { y, h, judgeX } = LANE;
    const vis = this.cfg.laneBeatsVisible;
    const ppb = (W - judgeX - 8) / vis;
    const xOf = (b) => judgeX + (b - beat) * ppb;
    const mid = y + h / 2;

    g.fillStyle = COLORS.deep;
    g.fillRect(0, y, W, h);
    g.fillStyle = COLORS.panel;
    g.fillRect(judgeX, y, this.game.config.lookaheadBeats * ppb, h);
    for (let b = Math.ceil(beat - 1); b <= beat + vis + 1; b++) {
      const x = Math.round(xOf(b));
      if (x < 0 || x > W) continue;
      const head = b % this.bpb === 0;
      g.fillStyle = head ? COLORS.dim : COLORS.line;
      g.fillRect(x, y + (head ? 3 : 12), 1, head ? h - 6 : h - 24);
    }
    const here = key(this.tile.i, this.tile.j);
    for (const e of this.enemyEvents(beat - 1, beat + vis + 1)) {
      if (!THREATS.has(e.type)) continue;
      const x = xOf(e.beat);
      if (x < judgeX - 16 || x > W + 10) continue;
      const res = this.results.get(e.id);
      if (res === 'void' || res === 'clear' || res === 'baited') continue;
      if (this.zones.get(e.id)?.confused) continue;
      const aimed = this.zones.get(e.id)?.set.has(here);
      if (e.type === 'enemy.feint') diamond(g, x, mid, 7, null, aimed ? COLORS.danger : COLORS.dim);
      else if (res === 'dodge') diamond(g, x, mid, 5, COLORS.good);
      else if (res === 'hit') diamond(g, x, mid, 5, COLORS.dim);
      else {
        const color = this.zones.get(e.id)?.dodgeable === false ? COLORS.unguard : COLORS.danger;
        diamond(g, x, mid, aimed ? 9 : 6, aimed ? color : COLORS.dim, COLORS.deep);
      }
    }
    const onBeat = Math.max(0, 1 - (beat - Math.floor(beat)) * 3);
    g.fillStyle = onBeat > 0 ? COLORS.ink : COLORS.muted;
    g.fillRect(judgeX - 1, y + 2, 3, h - 4);
    diamond(g, judgeX, mid, 10 + onBeat * 2, null, onBeat > 0.3 ? COLORS.ink : COLORS.muted);
  }

  resultTitle() {
    return this.outcome === 'win' ? { text: 'WIN!', color: COLORS.perfect } : { text: 'LOSE…', color: COLORS.rose };
  }

  resultRows() {
    return [['PERFECT', this.stats.perfect], ['GOOD', this.stats.good], ['MISS', this.stats.miss], ['MAX COMBO', this.maxCombo]];
  }

  drawOverlay(g, beat, now) {
    const W = this.game.config.screen.width;
    const cx = W / 2;
    if (this.phase === 'intro') {
      if (beat < 8) {
        text(g, `VS ${this.def.name}`, cx, 100, { size: 24, color: COLORS.rose, align: 'center' });
      } else if (beat < this.fightBeat - 2 * this.bpb) {
        panel(g, 24, 50, W - 48, 172, { alpha: 0.92 });
        text(g, this.def.tagline ?? '', cx, 64, { color: COLORS.brass, align: 'center' });
        text(g, '十字：いどう　A：となりの敵をこうげき', cx, 92, { align: 'center' });
        text(g, '赤いマスは攻撃の予告。拍に合わせて B で回避', cx, 118, { align: 'center' });
        text(g, '紫のマスは B でよけられない。歩いて逃げろ', cx, 144, { color: COLORS.unguard, align: 'center' });
        text(g, '敵の背中や横から殴るとダメージ2倍', cx, 170, { color: COLORS.perfect, align: 'center' });
        text(g, 'GUARD 中でも背中なら通る', cx, 194, { color: COLORS.muted, align: 'center' });
      }
    }
    if (this.banner) {
      const age = beat - this.banner.beat;
      const fight = this.banner.text === 'FIGHT!' || this.banner.steady;
      if (age >= 0 && age < (fight ? 3 : 8) && (fight || Math.floor(age * 2) % 2 === 0)) {
        text(g, this.banner.text, cx, 104, { size: 32, color: fight ? COLORS.perfect : COLORS.ink, align: 'center' });
      }
    }
    if (this.phase === 'result') {
      const title = this.resultTitle();
      panel(g, 110, 34, W - 220, 232, { alpha: 0.95 });
      text(g, title.text, cx, 44, { size: 32, color: title.color, align: 'center' });
      const rows = this.resultRows();
      const step = Math.min(22, 88 / rows.length);
      rows.forEach(([k, v], i) => {
        text(g, k, 138, 88 + i * step, { color: COLORS.muted });
        text(g, String(v), W - 138, 88 + i * step, { align: 'right' });
      });
      g.fillStyle = COLORS.line;
      g.fillRect(134, 180, W - 268, 1);
      // 総スコアはカウントアップで出す（演出）
      const shown = Math.round(this.finalScore * Math.min(1, (now - this.resultAt) / 900));
      text(g, 'SCORE', 138, 192, { color: COLORS.brass });
      text(g, shown.toLocaleString('en-US'), W - 138, 186, { size: 24, color: COLORS.perfect, align: 'right' });
      if (this.resultReady && Math.floor(now / 400) % 2 === 0) {
        text(g, 'A：つぎへ', cx, 232, { color: COLORS.signal, align: 'center' });
      }
    }
  }
}
