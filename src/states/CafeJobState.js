import { STATES } from '../core/constants.js';
import { COLORS, text, panel } from '../core/draw.js';
import { loadJSON } from '../core/Data.js';
import { money } from '../core/Items.js';

const GLYPH = { up: '↑', down: '↓', left: '←', right: '→', a: 'A', b: 'B' };

// カフェバイト：注文を覚えて同じ順に入力する。拍の判定は無い（憲法③：リズム入力は戦闘だけ）。
// 中身は data/minigames/*.json。報酬は base + perRound × 正解した回数
export class CafeJobState {
  name = STATES.MINIGAME;

  constructor(game, id, onDone) {
    this.game = game;
    this.id = id;
    this.onDone = onDone;
    this.def = null;
    this.phase = 'ready';
    this.round = 0;
    this.correct = 0;
    this.order = [];
    this.typed = [];
    this.t = 0;
  }

  async enter() {
    this.def = await loadJSON(`data/minigames/${this.id}.json`);
    const hero = this.game.session.hero;
    this.hpUsed = Math.min(this.def.hpCost, hero.hp - 1);
    hero.hp -= this.hpUsed;
  }

  get reward() {
    return this.def.reward.base + this.def.reward.perRound * this.correct;
  }

  startRound() {
    const n = this.def.rounds[this.round];
    const s = this.def.symbols;
    this.order = Array.from({ length: n }, () => s[Math.floor(Math.random() * s.length)]);
    this.typed = [];
    this.phase = 'show';
    this.t = 0;
  }

  update(dt, presses) {
    if (!this.def) return;
    this.t += dt;
    const step = this.def.showSec + this.def.gapSec;
    if (this.phase === 'show' && this.t >= step * this.order.length) {
      this.phase = 'input';
      this.t = 0;
    }
    if (this.phase === 'judge' && this.t >= 0.9) {
      this.round++;
      if (this.round < this.def.rounds.length) this.startRound();
      else { this.phase = 'result'; this.t = 0; }
    }
    for (const { btn } of presses) {
      if (this.phase === 'ready' && btn === 'a') { this.game.sfx.play('confirm'); this.startRound(); return; }
      if (this.phase === 'result' && btn === 'a' && this.t > 0.5) {
        this.game.states.pop();
        this.onDone(this.reward);
        return;
      }
      if (this.phase !== 'input' || !GLYPH[btn]) continue;
      this.typed.push(btn);
      const k = this.typed.length - 1;
      if (btn !== this.order[k]) {
        this.ok = false;
        this.phase = 'judge';
        this.t = 0;
        this.game.sfx.play('miss');
        return;
      }
      this.game.sfx.play('good');
      if (this.typed.length === this.order.length) {
        this.ok = true;
        this.correct++;
        this.phase = 'judge';
        this.t = 0;
        this.game.sfx.play('perfect');
        return;
      }
    }
  }

  render(g, ms) {
    if (!this.def) return;
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const cx = W / 2;
    g.fillStyle = '#2a1f1a';
    g.fillRect(0, 0, W, H);
    // カウンター
    g.fillStyle = '#5a3a2a';
    g.fillRect(0, 230, W, 90);
    g.fillStyle = '#7a5238';
    g.fillRect(0, 226, W, 6);
    text(g, this.def.title, 12, 8, { color: COLORS.brass });
    text(g, `${Math.min(this.round + 1, this.def.rounds.length)} / ${this.def.rounds.length}`, W - 12, 8, { align: 'right', color: COLORS.muted });

    if (this.phase === 'ready') {
      panel(g, 40, 70, W - 80, 120);
      text(g, this.def.rule, cx, 88, { align: 'center' });
      text(g, `体力を${this.hpUsed}使った`, cx, 118, { align: 'center', color: COLORS.muted });
      if (Math.floor(ms / 500) % 2 === 0) text(g, 'A：はじめる', cx, 152, { align: 'center', color: COLORS.signal });
      return;
    }
    if (this.phase === 'result') {
      panel(g, 80, 60, W - 160, 150);
      text(g, 'おしまい', cx, 74, { size: 24, color: COLORS.brass, align: 'center' });
      text(g, `正解 ${this.correct} / ${this.def.rounds.length}`, cx, 112, { align: 'center' });
      text(g, `報酬 ${money(this.reward)}`, cx, 140, { size: 24, color: COLORS.perfect, align: 'center' });
      if (Math.floor(ms / 400) % 2 === 0) text(g, 'A：つぎへ', cx, 180, { align: 'center', color: COLORS.signal });
      return;
    }

    // 注文の吹き出し
    panel(g, 60, 50, W - 120, 110);
    const step = this.def.showSec + this.def.gapSec;
    if (this.phase === 'show') {
      const k = Math.floor(this.t / step);
      const on = this.t - k * step < this.def.showSec;
      text(g, 'ご注文は……', cx, 62, { align: 'center', color: COLORS.muted });
      if (on && k < this.order.length) text(g, GLYPH[this.order[k]], cx, 92, { size: 48, align: 'center', color: COLORS.perfect });
    } else {
      text(g, this.phase === 'input' ? '同じ順に入力！' : (this.ok ? 'ありがとう！' : 'あれ、ちがうよ？'), cx, 62, { align: 'center', color: this.phase === 'judge' && !this.ok ? COLORS.rose : COLORS.muted });
      const n = this.order.length;
      const gap = 40;
      const x0 = cx - ((n - 1) * gap) / 2;
      for (let i = 0; i < n; i++) {
        const got = this.typed[i];
        const shown = this.phase === 'judge' ? this.order[i] : got;
        const color = got && got !== this.order[i] ? COLORS.rose : COLORS.ink;
        text(g, shown ? GLYPH[shown] : '？', x0 + i * gap, 100, { size: 24, align: 'center', color: shown ? color : COLORS.dim });
      }
    }
    text(g, '十字・A・B で入力', cx, 250, { align: 'center', color: COLORS.muted });
  }
}
