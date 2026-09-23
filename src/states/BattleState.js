import { STATES } from '../core/constants.js';
import { BeatManager } from '../core/BeatManager.js';
import { WHITE } from '../core/Assets.js';
import { COLORS, text, panel, gauge, sprite, diamond, isoTop, isoCenter } from '../core/draw.js';
import { DIRS, distance, stepToward, faceToward } from '../core/grid.js';
import { EventTrack } from '../battle/EventTrack.js';
import { Sequencer } from '../battle/Sequencer.js';
import { Judge } from '../battle/Judge.js';
import { PlayerProfile } from '../battle/PlayerProfile.js';
import { Enemy } from '../battle/Enemy.js';
import { areaTiles } from '../battle/areas.js';

const THREATS = new Set(['enemy.attack', 'enemy.feint']);
const LANE = { y: 280, h: 40, judgeX: 44 };
const key = (i, j) => `${i},${j}`;
const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

// 戦場を十字キーで自由に歩き、隣の敵を A で殴り、予告されたマスへの攻撃を B で避ける。
// 歩くのは自由、A と B だけが拍で判定される（憲法③：リズム入力はこの State だけ）
export class BattleState {
  name = STATES.RHYTHM_BATTLE;
  pausable = true;

  constructor(game, { def, patterns, onEnd }) {
    this.game = game;
    this.def = def;
    this.patternData = patterns;
    this.onEnd = onEnd;
  }

  enter() {
    const { config, clock, bgm } = this.game;
    this.cfg = config.battle;
    this.bpb = config.beatsPerBar;
    this.beats = new BeatManager(clock, config);
    this.tracks = { enemy: new EventTrack('enemy'), system: new EventTrack('system') };
    this.seq = new Sequencer(this.tracks, config);
    this.judge = new Judge(config);
    this.profile = new PlayerProfile(config.profileWindow);
    this.enemy = new Enemy(this.def, this.patternData);

    const [ps, pj] = this.cfg.player.start;
    this.player = { hp: this.cfg.player.hp, maxHp: this.cfg.player.hp, i: ps, j: pj, dir: 'ne', move: null };
    // actors は今いるマス。plan は確定済み区間の先頭時点でいる予定のマス（範囲と移動先はこちらで決める）
    this.actors = {};
    this.plan = {};
    for (const a of this.def.actors) {
      this.actors[a.id] = { i: a.stage[0], j: a.stage[1], from: null, movedBeat: -1e9 };
      this.plan[a.id] = { i: a.stage[0], j: a.stage[1] };
    }
    this.moves = new Map();   // enemy.move の id → 移動先
    this.zones = new Map();   // enemy.attack / enemy.feint の id → 攻撃範囲

    this.combo = 0;
    this.maxCombo = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, damage: 0 };
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

    // 色替えは初回に画像を作るので、戦闘中に引っかからないよう先に済ませておく
    for (const a of [...this.def.actors, { sprite: 'player', palette: null }]) {
      for (const frame of Object.keys(this.game.assets.def(a.sprite).frames)) {
        this.game.assets.get(a.sprite, frame, a.palette);
        this.game.assets.get(a.sprite, frame, WHITE);
      }
    }

    this.fightBeat = (config.bgm.battle.loopFromBar - 1) * this.bpb;
    this.beats.start(bgm.play('battle', clock.now + 0.1));
    this.tracks.system.add({ beat: this.fightBeat - 2 * this.bpb, type: 'system.phase', payload: { phase: 'ready' } });
    this.tracks.system.add({ beat: this.fightBeat, type: 'system.phase', payload: { phase: 'fight' } });
  }

  // ---------------------------------------------------------------- 盤面

  inArena(i, j) {
    const { cols, rows } = this.cfg.arena;
    return i >= 0 && j >= 0 && i < cols && j < rows;
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

  nearestDistance() {
    return Math.min(...Object.values(this.plan).map((p) => distance(p, this.tile)));
  }

  walk(dt) {
    const p = this.player;
    if (p.hp <= 0) return;
    if (p.move) {
      p.move.t += dt / this.cfg.moveSecPerTile;
      if (p.move.t < 1) return;
      [p.i, p.j] = p.move.to;
      p.move = null;
    }
    const btn = Object.keys(DIRS).find((b) => this.game.input.isDown(b));
    if (!btn) return;
    const d = DIRS[btn];
    p.dir = d.face;
    const ni = p.i + d.di;
    const nj = p.j + d.dj;
    if (this.inArena(ni, nj) && !this.actorAt(ni, nj)) p.move = { from: [p.i, p.j], to: [ni, nj], t: 0 };
  }

  // ---------------------------------------------------------------- 進行

  update(dt, presses) {
    const beat = this.beats.currentBeat;
    this.seq.update(beat, this);
    if (!this.outcome) this.refill(beat);
    for (const p of presses) this.onPress(p);
    this.walk(dt);
    this.expire();
    this.profile.prune(beat);
  }

  refill(beat) {
    const track = this.tracks.enemy;
    while (this.seq.needsRefill(track, beat)) {
      let start = Math.max(track.endBeat, this.fightBeat);
      if (start < track.lockedUntil) start = ceilTo(track.lockedUntil, this.bpb);
      track.addPattern(this.enemy.choosePattern(this.profile, { distance: this.nearestDistance() }), start);
    }
  }

  // 確定済み区間に入った時点で、移動先と攻撃範囲を決める。以後は変えない（憲法⑮）
  prepare(ev) {
    const p = ev.payload;
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
        const to = this.planStep(p.actor, from);
        this.moves.set(ev.id, to);
        this.plan[p.actor] = to;
        break;
      }
      case 'enemy.attack':
      case 'enemy.feint': {
        const from = this.plan[p.actor];
        const dir = stepToward(from, this.tile);
        const tiles = areaTiles(p.area, from, dir.di || dir.dj ? dir : { di: 0, dj: 1 })
          .filter(([i, j]) => this.inArena(i, j));
        this.zones.set(ev.id, { beat: ev.beat, feint: ev.type === 'enemy.feint', tiles, set: new Set(tiles.map(([i, j]) => key(i, j))) });
        break;
      }
      default:
        break;
    }
  }

  // プレイヤーへ1歩。塞がっていたらもう一方の軸、それも駄目ならその場
  planStep(id, from) {
    const target = this.tile;
    const taken = (i, j) => (i === target.i && j === target.j)
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

  fire(ev) {
    const p = ev.payload;
    switch (ev.type) {
      case 'system.phase':
        if (p.phase === 'fight') this.phase = 'fight';
        this.banner = { text: p.phase === 'fight' ? 'FIGHT!' : 'READY', beat: ev.beat };
        break;
      case 'system.finish':
        this.phase = 'result';
        this.resultBeat = ev.beat;
        break;
      case 'enemy.move': {
        if (this.enemy.down) break;
        const to = this.moves.get(ev.id);
        const a = this.actors[p.actor];
        const me = this.tile;
        const blocked = (to.i === me.i && to.j === me.j)
          || (this.player.move && to.i === this.player.move.to[0] && to.j === this.player.move.to[1]);
        if (blocked) break;
        a.from = { i: a.i, j: a.j };
        a.i = to.i;
        a.j = to.j;
        a.movedBeat = ev.beat;
        break;
      }
      case 'enemy.telegraph':
        if (!this.outcome) this.anim(p.actor, 'windup', ev.beat);
        break;
      case 'enemy.attack':
        if (this.outcome) { this.results.set(ev.id, 'void'); break; }
        this.anim(p.actor, 'strike', ev.beat);
        if (this.results.has(ev.id)) break;
        if (this.zones.get(ev.id)?.set.has(key(this.tile.i, this.tile.j))) this.pending.push(ev);
        else this.results.set(ev.id, 'clear');
        break;
      case 'enemy.feint':
        if (!this.outcome) this.anim(p.actor, 'feint', ev.beat);
        break;
      case 'fx.flash':
        this.flash = { color: p.color, at: performance.now() };
        break;
      default:
        break;
    }
  }

  onPress({ btn, t }) {
    if (this.phase === 'result') {
      const ready = this.beats.currentBeat >= this.resultBeat + this.bpb;
      if (ready && (btn === 'a' || btn === 'start')) this.leave();
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

  // 隣（斜めを含む8マス）にいる敵。向いている方を優先する
  adjacentActor() {
    const me = this.tile;
    const ids = Object.keys(this.actors).filter((id) => distance(this.actors[id], me) === 1);
    const facing = ids.find((id) => faceToward(me, this.actors[id]) === this.player.dir);
    return facing ?? ids[0] ?? null;
  }

  attack(t, b, slot) {
    const target = this.adjacentActor();
    if (target) this.player.dir = faceToward(this.tile, this.actors[target]);
    this.anim('player', 'attack', b);
    const grade = this.judge.grade(this.beats.deltaMs(t, slot));
    if (!grade) return this.fail(b, 'MISS');
    if (!target) return this.fail(b, 'とどかない');
    if (this.spanAt('enemy.guard', slot, target)) {
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
      * (this.spanAt('enemy.open', slot, target) ? c.openMultiplier : 1));
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    this.success(grade, 'attack', b);
    this.popup(String(dmg), COLORS.ink, target);
    this.anim(target, 'hurt', b);
    if (this.enemy.down) {
      this.game.sfx.play('ko');
      this.decide('win');
    }
    return undefined;
  }

  // 拍の近くにある攻撃のうち、自分が範囲に入っているものを避ける
  dodge(t, b) {
    this.anim('player', 'dodge', b);
    const here = key(this.tile.i, this.tile.j);
    const near = this.tracks.enemy.between(b - 2, b + 2)
      .filter((e) => THREATS.has(e.type) && !this.results.has(e.id) && this.judge.grade(this.beats.deltaMs(t, e.beat)))
      .sort((x, y) => Math.abs(this.beats.deltaMs(t, x.beat)) - Math.abs(this.beats.deltaMs(t, y.beat)));
    const target = near.find((e) => this.zones.get(e.id)?.set.has(here));
    if (!target) return this.fail(b, 'MISS');
    if (target.type === 'enemy.feint') {
      this.results.set(target.id, 'baited');
      return this.fail(b, 'FEINT!');
    }
    this.results.set(target.id, 'dodge');
    this.success(this.judge.grade(this.beats.deltaMs(t, target.beat)), 'dodge', b);
    this.game.sfx.play('dodge');
    return undefined;
  }

  // enemy.guard / enemy.open のように長さを持つイベントの区間内か
  spanAt(type, slot, actor) {
    return this.tracks.enemy.between(slot - 16, slot + 1)
      .some((e) => e.type === type && (!actor || !e.payload.actor || e.payload.actor === actor)
        && e.beat <= slot && slot < e.beat + (e.payload.length ?? 1));
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
    const power = ev.payload.power ?? 10;
    this.player.hp = Math.max(0, this.player.hp - power);
    this.stats.damage += power;
    this.fail(ev.beat, 'HIT');
    this.game.sfx.play('hit');
    this.anim('player', 'hurt', ev.beat);
    this.shakeAt = performance.now();
    if (this.player.hp <= 0) this.decide('lose');
  }

  // 範囲内で拍を迎え、判定ウィンドウのうちに避けも逃げもしなかったら被弾
  expire() {
    const now = this.beats.perceivedNow;
    const good = this.judge.goodSec;
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

  // 決着。終了と曲の切り替えは確定済み区間の先、次の小節頭に載せる（憲法⑭⑮）
  decide(outcome) {
    if (this.outcome) return;
    this.outcome = outcome;
    const at = ceilTo(this.tracks.system.lockedUntil, this.bpb);
    this.tracks.system.add({ beat: at, type: 'bgm.outro' });
    this.tracks.system.add({ beat: at, type: 'system.finish', payload: { outcome } });
    this.finishBeat = at;
  }

  leave() {
    if (this.leaving) return;
    this.leaving = true;
    this.game.bgm.stop(0.6);
    this.onEnd(this.outcome);
  }

  // ---------------------------------------------------------------- 演出

  anim(id, kind, beat) {
    this.anims[id ?? this.def.actors[0].id] = { kind, beat };
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
      case 'windup': return age < 1 ? { dx: -toward.x * 4 * k(1), dy: -3 * k(1), white: false } : none;
      case 'strike': return age < 0.6 ? { dx: toward.x * 22 * k(0.6), dy: toward.y * 22 * k(0.6), white: false } : none;
      case 'feint': return age < 0.5 ? { dx: toward.x * 8 * k(0.5), dy: toward.y * 8 * k(0.5), white: false } : none;
      case 'attack': return age < 0.5 ? { dx: toward.x * 18 * k(0.5), dy: toward.y * 18 * k(0.5), white: false } : none;
      case 'dodge': return age < 0.6 ? { dx: 0, dy: -16 * Math.sin(Math.min(1, age / 0.6) * Math.PI), white: false } : none;
      case 'hurt': return age < 0.4 ? { dx: -toward.x * 6 * k(0.4), dy: 0, white: age < 0.15 } : none;
      default: return none;
    }
  }

  // 描画用の位置（歩きと敵の移動をなめらかにつなぐ）
  playerPos() {
    const p = this.player;
    if (!p.move) return { i: p.i, j: p.j, bob: 0 };
    const t = Math.min(1, p.move.t);
    return {
      i: p.move.from[0] + (p.move.to[0] - p.move.from[0]) * t,
      j: p.move.from[1] + (p.move.to[1] - p.move.from[1]) * t,
      bob: -Math.round(Math.abs(Math.sin(t * Math.PI)) * 3),
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

    // カメラはプレイヤー寄りに、敵との間を見る
    const pp = this.playerPos();
    const ids = Object.keys(this.actors);
    const ap = Object.fromEntries(ids.map((id) => [id, this.actorPos(this.actors[id], beat)]));
    const ci = ids.reduce((s, id) => s + ap[id].i, 0) / ids.length;
    const cj = ids.reduce((s, id) => s + ap[id].j, 0) / ids.length;
    const target = { i: pp.i * 0.65 + ci * 0.35, j: pp.j * 0.65 + cj * 0.35 };
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

  drawArena(g, ox, oy, tile, floorDef) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const img = this.game.assets.get('floor', 'default');
    const { cols, rows } = this.cfg.arena;
    for (let s = 0; s <= cols + rows - 2; s++) {
      for (let i = 0; i < cols; i++) {
        const j = s - i;
        if (j < 0 || j >= rows) continue;
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
          g.fillStyle = left < 0 ? 'rgba(255,255,255,0.6)' : `rgba(255,70,70,${0.18 + 0.5 * heat})`;
          g.fill();
        }
      }
    }
  }

  drawPeople(g, beat, ox, oy, tile, pp, ap) {
    const { assets } = this.game;
    const people = [{ id: 'player', sprite: 'player', frame: this.player.dir, palette: null, i: pp.i, j: pp.j, bob: pp.bob, down: this.player.hp <= 0 }];
    for (const a of this.def.actors) {
      const pos = ap[a.id];
      people.push({ id: a.id, sprite: a.sprite, frame: faceToward(this.actors[a.id], this.tile), palette: a.palette, i: pos.i, j: pos.j, bob: 0, down: this.enemy.down });
    }
    const screen = (c) => isoCenter(c.i, c.j, ox, oy, tile);
    const me = screen(people[0]);
    people.sort((a, b) => a.i + a.j - (b.i + b.j));
    const slot = Math.floor(beat);
    for (const c of people) {
      const def = assets.def(c.sprite);
      const pos = screen(c);
      const other = c.id === 'player' ? screen(people.find((x) => x.id !== 'player')) : me;
      const len = Math.hypot(other.x - pos.x, other.y - pos.y) || 1;
      const toward = { x: (other.x - pos.x) / len, y: (other.y - pos.y) / len };
      const o = this.offsetOf(c.id, beat, toward);
      const alpha = c.down ? 0.35 + 0.3 * Math.sin(performance.now() / 60) : 1;
      g.fillStyle = 'rgba(11,12,24,0.45)';
      g.beginPath();
      g.ellipse(pos.x, pos.y, 22, 8, 0, 0, Math.PI * 2);
      g.fill();
      const img = o.white ? assets.get(c.sprite, c.frame, WHITE) : assets.get(c.sprite, c.frame, c.palette);
      sprite(g, img, def, pos.x + o.dx, pos.y + o.dy + c.bob + (c.down ? 6 : 0), alpha);
      const top = pos.y - def.anchor[1] - 4;
      if (c.id !== 'player' && !c.down) {
        if (this.anims[c.id]?.kind === 'windup' && beat - this.anims[c.id].beat < 1) text(g, '!', pos.x, top - 14, { color: COLORS.brass, align: 'center' });
        if (this.spanAt('enemy.guard', slot, c.id)) text(g, 'GUARD', pos.x, top, { size: 12, color: COLORS.guard, align: 'center' });
        if (this.spanAt('enemy.open', slot, c.id)) text(g, 'CHANCE', pos.x, top, { size: 12, color: COLORS.open, align: 'center' });
      }
      c.screen = { x: pos.x, y: pos.y - def.anchor[1] };
    }
    this.lastPeople = people;
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

  drawHud(g, beat) {
    const W = this.game.config.screen.width;
    g.fillStyle = 'rgba(11,12,24,0.8)';
    g.fillRect(0, 0, W, 26);
    text(g, this.def.name, 8, 5);
    gauge(g, 150, 9, 110, 9, this.enemy.hp / this.enemy.maxHp, COLORS.rose);
    text(g, 'HP', 318, 5, { color: COLORS.signal });
    gauge(g, 344, 9, 128, 9, this.player.hp / this.player.maxHp, COLORS.signal);
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
    for (const e of this.tracks.enemy.between(beat - 1, beat + vis + 1)) {
      if (!THREATS.has(e.type)) continue;
      const x = xOf(e.beat);
      if (x < judgeX - 16 || x > W + 10) continue;
      const res = this.results.get(e.id);
      if (res === 'void' || res === 'clear' || res === 'baited') continue;
      const aimed = this.zones.get(e.id)?.set.has(here);
      if (e.type === 'enemy.feint') diamond(g, x, mid, 7, null, aimed ? COLORS.danger : COLORS.dim);
      else if (res === 'dodge') diamond(g, x, mid, 5, COLORS.good);
      else if (res === 'hit') diamond(g, x, mid, 5, COLORS.dim);
      else diamond(g, x, mid, aimed ? 9 : 6, aimed ? COLORS.danger : COLORS.dim, COLORS.deep);
    }
    const onBeat = Math.max(0, 1 - (beat - Math.floor(beat)) * 3);
    g.fillStyle = onBeat > 0 ? COLORS.ink : COLORS.muted;
    g.fillRect(judgeX - 1, y + 2, 3, h - 4);
    diamond(g, judgeX, mid, 10 + onBeat * 2, null, onBeat > 0.3 ? COLORS.ink : COLORS.muted);
  }

  drawOverlay(g, beat, now) {
    const W = this.game.config.screen.width;
    const cx = W / 2;
    if (this.phase === 'intro') {
      if (beat < 8) {
        text(g, `VS ${this.def.name}`, cx, 100, { size: 24, color: COLORS.rose, align: 'center' });
      } else if (beat < this.fightBeat - 2 * this.bpb) {
        panel(g, 30, 62, W - 60, 128, { alpha: 0.92 });
        text(g, this.def.tagline ?? '', cx, 76, { color: COLORS.brass, align: 'center' });
        text(g, '十字：いどう　A：となりの敵をこうげき', cx, 104, { align: 'center' });
        text(g, '赤いマスは攻撃の予告。拍に合わせて B で回避', cx, 130, { align: 'center' });
        text(g, 'マスの外へ逃げてもよい', cx, 156, { color: COLORS.muted, align: 'center' });
      }
    }
    if (this.banner) {
      const age = beat - this.banner.beat;
      const fight = this.banner.text === 'FIGHT!';
      if (age >= 0 && age < (fight ? 3 : 8) && (fight || Math.floor(age * 2) % 2 === 0)) {
        text(g, this.banner.text, cx, 104, { size: 32, color: fight ? COLORS.perfect : COLORS.ink, align: 'center' });
      }
    }
    if (this.phase === 'result') {
      const win = this.outcome === 'win';
      panel(g, 110, 48, W - 220, 176, { alpha: 0.95 });
      text(g, win ? 'WIN!' : 'LOSE…', cx, 60, { size: 32, color: win ? COLORS.perfect : COLORS.rose, align: 'center' });
      const rows = [['PERFECT', this.stats.perfect], ['GOOD', this.stats.good], ['MISS', this.stats.miss], ['MAX COMBO', this.maxCombo]];
      rows.forEach(([k, v], i) => {
        text(g, k, 138, 104 + i * 22, { color: COLORS.muted });
        text(g, String(v), W - 138, 104 + i * 22, { align: 'right' });
      });
      if (beat >= this.resultBeat + this.bpb && Math.floor(now / 400) % 2 === 0) {
        text(g, 'A：つぎへ', cx, 196, { color: COLORS.signal, align: 'center' });
      }
    }
  }
}
