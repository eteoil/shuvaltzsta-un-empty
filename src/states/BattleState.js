import { STATES } from '../core/constants.js';
import { BeatManager } from '../core/BeatManager.js';
import { WHITE } from '../core/Assets.js';
import { COLORS, text, panel, gauge, sprite, diamond, isoTop, isoCenter } from '../core/draw.js';
import { EventTrack } from '../battle/EventTrack.js';
import { Sequencer } from '../battle/Sequencer.js';
import { Judge } from '../battle/Judge.js';
import { PlayerProfile } from '../battle/PlayerProfile.js';
import { Enemy } from '../battle/Enemy.js';

const ACTIONS = { a: 'attack', b: 'guard', left: 'dodge', right: 'dodge' };
const THREATS = new Set(['enemy.attack', 'enemy.feint']);
const STAGE = { size: 4, ox: 240, oy: 112 };
const LANE = { y: 262, h: 58, judgeX: 44 };

const ceilTo = (v, step) => Math.ceil(v / step - 1e-9) * step;

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
    this.player = { hp: this.cfg.player.hp, maxHp: this.cfg.player.hp };

    this.combo = 0;
    this.maxCombo = 0;
    this.stats = { perfect: 0, good: 0, miss: 0, damage: 0 };
    this.results = new Map();   // enemy イベントの id → 'dodge' | 'guard' | 'hit' | 'baited' | 'void'
    this.pending = [];          // 発火済みでまだ受け止めていない enemy.attack
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

    const bgmDef = config.bgm.battle;
    this.fightBeat = (bgmDef.loopBars[0] - 1) * this.bpb;
    this.beats.start(bgm.play('battle', clock.now + 0.1));
    this.tracks.system.add({ beat: this.fightBeat - 2 * this.bpb, type: 'system.phase', payload: { phase: 'ready' } });
    this.tracks.system.add({ beat: this.fightBeat, type: 'system.phase', payload: { phase: 'fight' } });
  }

  // ---------------------------------------------------------------- 進行

  update(dt, presses) {
    const beat = this.beats.currentBeat;
    this.seq.update(beat, this);
    if (!this.outcome) this.refill(beat);
    for (const p of presses) this.onPress(p);
    this.expire();
    this.profile.prune(beat);
  }

  refill(beat) {
    const track = this.tracks.enemy;
    while (this.seq.needsRefill(track, beat)) {
      let start = Math.max(track.endBeat, this.fightBeat);
      if (start < track.lockedUntil) start = ceilTo(track.lockedUntil, this.bpb);
      track.addPattern(this.enemy.choosePattern(this.profile), start);
    }
  }

  prepare(ev) {
    const at = this.beats.beatToTime(ev.beat);
    if (ev.type === 'bgm.outro') this.game.bgm.outro(at);
    if (ev.type === 'enemy.telegraph' && !this.outcome) this.game.sfx.play('telegraph', at);
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
      case 'enemy.telegraph':
        if (!this.outcome) this.anim(p.actor, 'windup', ev.beat);
        break;
      case 'enemy.attack':
        if (this.outcome) { this.results.set(ev.id, 'void'); break; }
        this.anim(p.actor, 'strike', ev.beat);
        if (!this.results.has(ev.id)) this.pending.push(ev);
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
    const kind = ACTIONS[btn];
    if (!kind || this.phase !== 'fight' || this.outcome) return;

    const b = this.beats.perceivedBeatAt(t);
    const slot = Math.round(b);
    if (slot === this.lastSlot) return;   // 1拍につき1アクション
    this.lastSlot = slot;
    if (kind === 'attack') this.attack(t, b, slot);
    else this.defend(kind, t, b);
  }

  attack(t, b, slot) {
    this.anim('player', 'attack', b);
    const grade = this.judge.grade(this.beats.deltaMs(t, slot));
    if (!grade) return this.fail(b, 'MISS');
    if (this.spanAt('enemy.guard', slot)) {
      this.combo = 0;
      this.profile.record('attack', b);
      this.popup('BLOCK', COLORS.guard);
      this.game.sfx.play('block');
      return undefined;
    }
    const c = this.cfg;
    const dmg = Math.round(c.player.attack
      * (grade === 'perfect' ? c.perfectMultiplier : 1)
      * (1 + Math.min(this.combo * c.comboBonus, c.comboBonusMax))
      * (this.spanAt('enemy.open', slot) ? c.openMultiplier : 1));
    this.enemy.hp = Math.max(0, this.enemy.hp - dmg);
    this.success(grade, 'attack', b);
    this.popup(String(dmg), COLORS.ink, 'enemy');
    for (const a of this.def.actors) this.anim(a.id, 'hurt', b);
    if (this.enemy.down) {
      this.game.sfx.play('ko');
      this.decide('win');
    }
    return undefined;
  }

  defend(kind, t, b) {
    this.anim('player', kind, b);
    const target = this.nearestThreat(t, b);
    if (!target) return this.fail(b, 'MISS');
    if (target.type === 'enemy.feint') {
      this.results.set(target.id, 'baited');
      return this.fail(b, 'FEINT!');
    }
    if (kind === 'guard' && target.payload.guardable === false) return this.hit(target, 'BREAK!');
    this.results.set(target.id, kind);
    this.success(this.judge.grade(this.beats.deltaMs(t, target.beat)), kind, b);
    this.game.sfx.play(kind);
    return undefined;
  }

  nearestThreat(t, b) {
    let best = null;
    let bestAbs = Infinity;
    for (const e of this.tracks.enemy.between(b - 2, b + 2)) {
      if (!THREATS.has(e.type) || this.results.has(e.id)) continue;
      const d = Math.abs(this.beats.deltaMs(t, e.beat));
      if (d < bestAbs) { best = e; bestAbs = d; }
    }
    return best && this.judge.grade(bestAbs) ? best : null;
  }

  // enemy.guard / enemy.open のように長さを持つイベントの区間内か
  spanAt(type, slot) {
    return this.tracks.enemy.between(slot - 16, slot + 1)
      .some((e) => e.type === type && e.beat <= slot && slot < e.beat + (e.payload.length ?? 1));
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

  hit(ev, label = 'HIT') {
    this.results.set(ev.id, 'hit');
    const power = ev.payload.power ?? 10;
    this.player.hp = Math.max(0, this.player.hp - power);
    this.stats.damage += power;
    this.fail(ev.beat, label);
    this.game.sfx.play('hit');
    this.anim('player', 'hurt', ev.beat);
    this.shakeAt = performance.now();
    if (this.player.hp <= 0) this.decide('lose');
    return undefined;
  }

  // 受け止められないまま判定ウィンドウを過ぎた攻撃は被弾になる
  expire() {
    const now = this.beats.perceivedNow;
    const good = this.judge.goodSec;
    this.pending = this.pending.filter((ev) => {
      if (this.results.has(ev.id)) return false;
      if (now <= this.beats.beatToTime(ev.beat) + good) return true;
      if (this.outcome) this.results.set(ev.id, 'void');
      else this.hit(ev);
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
    if (!a) return { dx: 0, dy: 0, white: false };
    const age = beat - a.beat;
    const k = (dur) => Math.max(0, 1 - age / dur);
    switch (a.kind) {
      case 'windup': return age < 1 ? { dx: -toward.x * 4 * k(1), dy: -3 * k(1), white: false } : { dx: 0, dy: 0 };
      case 'strike': return age < 0.6 ? { dx: toward.x * 26 * k(0.6), dy: toward.y * 26 * k(0.6), white: false } : { dx: 0, dy: 0 };
      case 'feint': return age < 0.5 ? { dx: toward.x * 8 * k(0.5), dy: toward.y * 8 * k(0.5), white: false } : { dx: 0, dy: 0 };
      case 'attack': return age < 0.5 ? { dx: toward.x * 20 * k(0.5), dy: toward.y * 20 * k(0.5), white: false } : { dx: 0, dy: 0 };
      case 'dodge': return age < 0.8 ? { dx: -toward.y * 24 * k(0.8), dy: toward.x * 12 * k(0.8), white: false } : { dx: 0, dy: 0 };
      case 'hurt': return age < 0.4 ? { dx: -toward.x * 6 * k(0.4), dy: 0, white: age < 0.2 } : { dx: 0, dy: 0 };
      default: return { dx: 0, dy: 0, white: false };
    }
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const beat = this.beats.currentBeat;
    const now = performance.now();

    g.save();
    const shake = now - this.shakeAt < 180 ? 3 : 0;
    if (shake) g.translate(Math.round((Math.random() - 0.5) * 2 * shake), Math.round((Math.random() - 0.5) * 2 * shake));

    g.fillStyle = '#12142a';
    g.fillRect(-4, -4, W + 8, H + 8);
    // 小節頭で床の下がほのかに光る
    const barPulse = Math.max(0, 1 - (beat - Math.floor(beat / this.bpb) * this.bpb));
    g.fillStyle = `rgba(123,216,201,${0.08 * barPulse})`;
    g.fillRect(0, 0, W, H);

    this.drawStage(g, beat);
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

  drawStage(g, beat) {
    const { assets } = this.game;
    const floorDef = assets.def('floor');
    const floorImg = assets.get('floor', 'default');
    const tile = floorDef.tile;
    for (let s = 0; s <= (STAGE.size - 1) * 2; s++) {
      for (let i = 0; i < STAGE.size; i++) {
        const j = s - i;
        if (j < 0 || j >= STAGE.size) continue;
        const p = isoTop(i, j, STAGE.ox, STAGE.oy, tile);
        sprite(g, floorImg, floorDef, p.x, p.y);
      }
    }

    const pTile = this.cfg.player.tile;
    const pPos = isoCenter(pTile[0], pTile[1], STAGE.ox, STAGE.oy, tile);
    const actors = [];
    for (const a of this.def.actors) {
      const pos = isoCenter(a.stage[0], a.stage[1], STAGE.ox, STAGE.oy, tile);
      const len = Math.hypot(pPos.x - pos.x, pPos.y - pos.y) || 1;
      actors.push({ id: a.id, sprite: a.sprite, frame: 'sw', palette: a.palette, pos, toward: { x: (pPos.x - pos.x) / len, y: (pPos.y - pos.y) / len }, down: this.enemy.down });
    }
    const e0 = actors[0].pos;
    const plen = Math.hypot(e0.x - pPos.x, e0.y - pPos.y) || 1;
    actors.push({ id: 'player', sprite: 'player', frame: 'ne', palette: null, pos: pPos, toward: { x: (e0.x - pPos.x) / plen, y: (e0.y - pPos.y) / plen }, down: this.player.hp <= 0 });
    actors.sort((a, b) => a.pos.y - b.pos.y);

    for (const a of actors) {
      const def = assets.def(a.sprite);
      const o = this.offsetOf(a.id, beat, a.toward);
      let alpha = 1;
      let dy = 0;
      if (a.down) {
        alpha = 0.35 + 0.3 * Math.sin(performance.now() / 60);
        dy = 6;
      }
      const img = o.white ? assets.get(a.sprite, a.frame, WHITE) : assets.get(a.sprite, a.frame, a.palette);
      // 足元の影
      g.fillStyle = 'rgba(11,12,24,0.45)';
      g.beginPath();
      g.ellipse(a.pos.x, a.pos.y, 24, 8, 0, 0, Math.PI * 2);
      g.fill();
      sprite(g, img, def, a.pos.x + o.dx, a.pos.y + o.dy + dy, alpha);
      if (a.id === 'player' && this.anims.player?.kind === 'guard' && beat - this.anims.player.beat < 0.8) {
        g.strokeStyle = COLORS.guard;
        g.lineWidth = 3;
        g.beginPath();
        g.arc(a.pos.x + a.toward.x * 20, a.pos.y - 60, 30, -Math.PI / 2 - 0.9, -Math.PI / 2 + 0.9);
        g.stroke();
      }
      if (a.id !== 'player' && !a.down) {
        const top = a.pos.y - def.anchor[1] - 4;
        if (this.anims[a.id]?.kind === 'windup' && beat - this.anims[a.id].beat < 1) text(g, '!', a.pos.x, top - 14, { size: 16, color: COLORS.brass, align: 'center' });
        if (this.spanAt('enemy.guard', Math.floor(beat))) text(g, 'GUARD', a.pos.x, top, { size: 12, color: COLORS.guard, align: 'center' });
        if (this.spanAt('enemy.open', Math.floor(beat))) text(g, 'CHANCE', a.pos.x, top, { size: 12, color: COLORS.open, align: 'center' });
      }
      a.screen = { x: a.pos.x, y: a.pos.y - def.anchor[1] };
    }
    this.lastActors = actors;
  }

  drawPopups(g, now) {
    const actors = this.lastActors || [];
    const player = actors.find((a) => a.id === 'player');
    const enemy = actors.find((a) => a.id !== 'player');
    this.popups = this.popups.filter((p) => now - p.t < 650);
    // 新しいものほど下。古いものは押し上げる
    const stack = { player: 0, enemy: 0 };
    for (let k = this.popups.length - 1; k >= 0; k--) {
      const p = this.popups[k];
      const anchor = p.at === 'enemy' ? enemy : player;
      if (!anchor) continue;
      const age = (now - p.t) / 650;
      const n = stack[p.at]++;
      text(g, p.label, anchor.screen.x, anchor.screen.y + 10 - age * 18 - n * 16, { size: 16, color: p.color, align: 'center', alpha: 1 - age * age });
    }
  }

  drawHud(g, beat) {
    const W = this.game.config.screen.width;
    g.fillStyle = 'rgba(11,12,24,0.8)';
    g.fillRect(0, 0, W, 26);
    text(g, this.def.name, 8, 5, { size: 16 });
    gauge(g, 150, 9, 110, 9, this.enemy.hp / this.enemy.maxHp, COLORS.rose);
    text(g, 'HP', 318, 5, { size: 16, color: COLORS.signal });
    gauge(g, 344, 9, 128, 9, this.player.hp / this.player.maxHp, COLORS.signal);
    // 小節内の拍
    const inBar = ((Math.floor(beat) % this.bpb) + this.bpb) % this.bpb;
    for (let i = 0; i < this.bpb; i++) {
      g.fillStyle = beat >= 0 && i === inBar ? (i === 0 ? COLORS.brass : COLORS.ink) : COLORS.line;
      g.fillRect(274 + i * 9, 10, 6, 6);
    }
    if (this.combo >= 2) {
      text(g, String(this.combo), 10, LANE.y - 40, { size: 32, color: COLORS.perfect });
      text(g, 'COMBO', 12, LANE.y - 12 - 6, { size: 12, color: COLORS.brass });
    }
  }

  drawLane(g, beat) {
    const W = this.game.config.screen.width;
    const { y, h, judgeX } = LANE;
    const vis = this.cfg.laneBeatsVisible;
    const ppb = (W - judgeX - 8) / vis;
    const xOf = (b) => judgeX + (b - beat) * ppb;
    const mid = y + h / 2 - 3;

    g.fillStyle = COLORS.deep;
    g.fillRect(0, y, W, h);
    // 確定済み区間（ここに載ったものはもう変わらない）
    g.fillStyle = COLORS.panel;
    g.fillRect(judgeX, y, this.game.config.lookaheadBeats * ppb, h);

    for (let b = Math.ceil(beat - 1); b <= beat + vis + 1; b++) {
      const x = Math.round(xOf(b));
      if (x < 0 || x > W) continue;
      const head = b % this.bpb === 0;
      g.fillStyle = head ? COLORS.dim : COLORS.line;
      g.fillRect(x, y + (head ? 4 : 16), 1, head ? h - 8 : h - 32);
    }

    const evs = this.tracks.enemy.between(beat - 20, beat + vis + 1);
    for (const e of evs) {
      if (e.type !== 'enemy.guard' && e.type !== 'enemy.open') continue;
      const x0 = Math.max(judgeX, xOf(e.beat));
      const x1 = Math.min(W, xOf(e.beat + (e.payload.length ?? 1)));
      if (x1 <= x0) continue;
      g.fillStyle = e.type === 'enemy.guard' ? COLORS.guard : COLORS.open;
      g.globalAlpha = 0.5;
      g.fillRect(x0, y + h - 14, x1 - x0, 8);
      g.globalAlpha = 1;
      if (xOf(e.beat) >= judgeX - 4) text(g, e.type === 'enemy.guard' ? 'GUARD' : 'CHANCE', xOf(e.beat) + 3, y + h - 28, { size: 12, color: g.fillStyle });
    }
    for (const e of evs) {
      const x = xOf(e.beat);
      if (x < judgeX - 24 || x > W + 10) continue;
      const res = this.results.get(e.id);
      const past = x < judgeX;
      if (e.type === 'enemy.telegraph') {
        if (!past) text(g, '!', x, y + 3, { size: 12, color: COLORS.brass, align: 'center' });
      } else if (e.type === 'enemy.attack') {
        const color = e.payload.guardable === false ? COLORS.unguard : COLORS.danger;
        if (res === 'dodge' || res === 'guard') diamond(g, x, mid, 5, COLORS.good);
        else if (res === 'hit') diamond(g, x, mid, 5, COLORS.dim);
        else if (res !== 'void') {
          diamond(g, x, mid, 9, color, COLORS.deep);
          text(g, e.payload.guardable === false ? '←→' : 'B', x, mid, { size: 12, align: 'center', baseline: 'middle', shadow: null, color: COLORS.deep });
        }
      } else if (e.type === 'enemy.feint') {
        if (!res) diamond(g, x, mid, 8, null, COLORS.danger);
      }
    }

    const onBeat = Math.max(0, 1 - (beat - Math.floor(beat)) * 3);
    g.fillStyle = onBeat > 0 ? COLORS.ink : COLORS.muted;
    g.fillRect(judgeX - 1, y + 2, 3, h - 4);
    diamond(g, judgeX, mid, 11 + onBeat * 2, null, onBeat > 0.3 ? COLORS.ink : COLORS.muted);
  }

  drawOverlay(g, beat, now) {
    const W = this.game.config.screen.width;
    const cx = W / 2;
    if (this.phase === 'intro') {
      if (beat < 8) {
        text(g, `VS ${this.def.name}`, cx, 100, { size: 24, color: COLORS.rose, align: 'center' });
      } else if (beat < this.fightBeat - 2 * this.bpb) {
        panel(g, 40, 70, W - 80, 104, { alpha: 0.92 });
        text(g, this.def.tagline ?? '', cx, 84, { size: 16, color: COLORS.brass, align: 'center' });
        text(g, 'A：こうげき　B：ガード　←→：かいひ', cx, 112, { size: 16, align: 'center' });
        text(g, '赤は B か ←→、紫は ←→ だけ', cx, 138, { size: 16, color: COLORS.muted, align: 'center' });
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
        text(g, 'A：つぎへ', cx, 196, { size: 16, color: COLORS.signal, align: 'center' });
      }
    }
  }
}
