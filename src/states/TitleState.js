import { STATES } from '../core/constants.js';
import { text, sprite } from '../core/draw.js';

const PAPER = '#fbf7ee';
const INK = '#3a2c24';
const FADED = '#b3a595';
// 線画の飾りを避けて、ロゴの下の空いた帯（y=180〜226）に収める
const MENU = { x: 322, y: 180, step: 16 };
const SOON_MS = 1200;

// 線画のタイトル。PRESS START → START でメニュー（NEW GAME / LOAD DATA / OPTION）
export class TitleState {
  name = STATES.TITLE;

  constructor(game) {
    this.game = game;
    this.phase = 'press';
    this.sel = 0;
    this.starting = false;
    this.soonAt = -1e9;
    this.items = [
      { label: 'NEW GAME', run: () => this.newGame() },
      { label: 'LOAD DATA', run: null },
      { label: 'OPTION', run: null },
    ];
  }

  update(dt, presses) {
    if (this.starting) return;
    for (const { btn } of presses) {
      if (this.phase === 'press') {
        if (btn !== 'start') continue;
        this.phase = 'menu';
        this.game.sfx.play('confirm');
        return;
      }
      if (btn === 'up' || btn === 'down') {
        this.sel = (this.sel + this.items.length + (btn === 'up' ? -1 : 1)) % this.items.length;
        this.game.sfx.play('select');
      } else if (btn === 'a' || btn === 'start') {
        const it = this.items[this.sel];
        if (it.run) { it.run(); return; }
        this.soonAt = performance.now();
        this.game.sfx.play('miss');
      } else if (btn === 'b') {
        this.phase = 'press';
      }
    }
  }

  newGame() {
    this.starting = true;
    this.game.sfx.play('confirm');
    this.game.newGame();
  }

  render(g, ms) {
    const { config, assets } = this.game;
    g.fillStyle = PAPER;
    g.fillRect(0, 0, config.screen.width, config.screen.height);
    sprite(g, assets.get('title', 'default'), assets.def('title'), 0, 0);

    text(g, 'シュバルツスタ', 262, 106, { color: INK, shadow: null });

    const { x, y, step } = MENU;
    if (this.phase === 'press') {
      if (Math.floor(ms / 500) % 2 === 0) text(g, 'PRESS START', x, y + step, { color: INK, shadow: null });
      return;
    }
    const soon = performance.now() - this.soonAt < SOON_MS;
    this.items.forEach((it, i) => {
      const active = i === this.sel;
      if (active && (!this.starting || Math.floor(ms / 80) % 2 === 0)) text(g, '▶', x - 16, y + i * step, { color: INK, shadow: null });
      const label = active && soon ? '準備中' : it.label;
      text(g, label, x, y + i * step, { color: it.run ? INK : FADED, shadow: null });
    });
  }
}
