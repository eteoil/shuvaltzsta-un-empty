import { STATES } from '../core/constants.js';
import { COLORS, text, panel } from '../core/draw.js';

// ポーズ。開いている間は AudioContext ごと止めるので、戦闘の Beat も曲も止まる
export class MenuState {
  name = STATES.MENU;

  constructor(game) {
    this.game = game;
    this.sel = 0;
    this.items = [
      { label: 'さいかい', run: () => this.game.states.pop() },
      { label: 'タイトルへ', run: () => this.game.toTitle() },
    ];
  }

  enter() {
    this.game.clock.suspend();
  }

  exit() {
    this.game.clock.resume();
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      if (btn === 'up' || btn === 'down') this.sel = (this.sel + this.items.length + (btn === 'up' ? -1 : 1)) % this.items.length;
      if (btn === 'a') { this.items[this.sel].run(); return; }
      if (btn === 'b' || btn === 'pause' || btn === 'start') { this.game.states.pop(); return; }
    }
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    g.fillStyle = 'rgba(11,12,24,0.6)';
    g.fillRect(0, 0, W, H);
    panel(g, W / 2 - 90, 84, 180, 128);
    text(g, 'PAUSE', W / 2, 98, { size: 24, color: COLORS.brass, align: 'center' });
    this.items.forEach((it, i) => {
      const y = 140 + i * 28;
      if (i === this.sel) text(g, '▶', W / 2 - 62, y, { color: COLORS.signal });
      text(g, it.label, W / 2 - 40, y, { color: i === this.sel ? COLORS.ink : COLORS.muted });
    });
  }
}
