import { STATES } from '../core/constants.js';
import { COLORS, text, panel, wrap } from '../core/draw.js';
import { saveOptions } from '../core/Options.js';

// タイトルの OPTION。いまはチートモードの切り替えだけ。変えたらすぐこのブラウザに覚える
export class OptionState {
  name = STATES.MENU;

  constructor(game) {
    this.game = game;
    this.sel = 0;
    this.items = [
      { label: 'チートモード', value: () => (game.options.cheat ? 'ON' : 'OFF'), run: () => this.toggleCheat() },
      { label: 'もどる', run: () => this.close() },
    ];
  }

  toggleCheat() {
    const o = this.game.options;
    o.cheat = !o.cheat;
    saveOptions(o);
    this.game.sfx.play(o.cheat ? 'confirm' : 'select');
  }

  close() {
    this.game.sfx.play('select');
    this.game.states.pop();
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      if (btn === 'up' || btn === 'down') {
        this.sel = (this.sel + this.items.length + (btn === 'up' ? -1 : 1)) % this.items.length;
        this.game.sfx.play('select');
      } else if ((btn === 'left' || btn === 'right') && this.items[this.sel].value) {
        this.items[this.sel].run();
      } else if (btn === 'a' || btn === 'start') {
        this.items[this.sel].run();
        return;
      } else if (btn === 'b') {
        this.close();
        return;
      }
    }
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const cheat = this.game.config.cheat;
    g.fillStyle = 'rgba(11,12,24,0.7)';
    g.fillRect(0, 0, W, H);
    panel(g, 40, 24, W - 80, H - 48);
    text(g, 'OPTION', W / 2, 38, { size: 24, color: COLORS.brass, align: 'center' });
    this.items.forEach((it, i) => {
      const y = 84 + i * 30;
      const active = i === this.sel;
      if (active) text(g, '▶', 62, y, { color: COLORS.signal });
      text(g, it.label, 82, y, { color: active ? COLORS.ink : COLORS.muted });
      if (it.value) {
        const on = it.value() === 'ON';
        text(g, `◀ ${it.value()} ▶`, W - 64, y, { align: 'right', color: on ? COLORS.perfect : COLORS.muted });
      }
    });
    g.fillStyle = COLORS.line;
    g.fillRect(56, 150, W - 112, 1);
    const desc = `チートモード：毒が${cheat.poisonTicks}回で治り、HPが自動で回復し、敵へのダメージが${cheat.attackMultiplier}倍になる。`;
    wrap(g, desc, W - 124, 14).slice(0, 5).forEach((l, i) => text(g, l, 62, 162 + i * 22, { size: 14, color: COLORS.muted }));
  }
}
