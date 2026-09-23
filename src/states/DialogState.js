import { STATES } from '../core/constants.js';
import { COLORS, text, panel, wrap } from '../core/draw.js';

const CHAR_MS = 32;

export class DialogState {
  name = STATES.DIALOG;

  constructor(game, dialog, onDone) {
    this.game = game;
    this.lines = dialog.lines;
    this.onDone = onDone;
    this.index = 0;
    this.shownAt = performance.now();
  }

  // 文字送りは演出なので rAF の時刻でよい
  visible() {
    return Math.floor((performance.now() - this.shownAt) / CHAR_MS);
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      if (btn !== 'a' && btn !== 'b' && btn !== 'start') continue;
      if (this.visible() < [...this.lines[this.index].text].length) {
        this.shownAt = -1e9;
        continue;
      }
      this.index++;
      this.shownAt = performance.now();
      this.game.sfx.play('select');
      if (this.index >= this.lines.length) {
        this.game.states.pop();
        this.onDone?.();
        return;
      }
    }
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const line = this.lines[Math.min(this.index, this.lines.length - 1)];
    const top = H - 108;
    panel(g, 8, top, W - 16, 100);
    if (line.speaker) {
      panel(g, 16, top - 26, Math.max(80, [...line.speaker].length * 16 + 24), 30);
      text(g, line.speaker, 28, top - 19, { color: COLORS.brass });
    }
    const shown = [...line.text].slice(0, this.visible()).join('');
    wrap(g, shown, W - 48).slice(0, 3).forEach((l, i) => text(g, l, 24, top + 16 + i * 24));
    if (this.visible() >= [...line.text].length && Math.floor(performance.now() / 350) % 2 === 0) {
      text(g, '▼', W - 30, top + 76, { size: 12, color: COLORS.signal });
    }
  }
}
