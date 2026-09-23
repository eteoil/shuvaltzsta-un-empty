import { STATES } from '../core/constants.js';
import { COLORS, text, sprite, isoTop, isoCenter } from '../core/draw.js';

// 「しゅばるつすた」をシュバル語の辞書（eteoil/vtb の shvlangDictionary.json）で引いたもの
const SHVLANG = "ʒyóuwybhyɔ':ykhyéəryvly";

export class TitleState {
  name = STATES.TITLE;

  constructor(game) {
    this.game = game;
    this.starting = false;
  }

  update(dt, presses) {
    if (this.starting) return;
    if (presses.some((p) => p.btn === 'start' || p.btn === 'a')) {
      this.starting = true;
      this.game.sfx.play('confirm');
      this.game.newGame();
    }
  }

  render(g, ms) {
    const { config, assets } = this.game;
    const W = config.screen.width;
    const H = config.screen.height;
    g.fillStyle = '#0b0c18';
    g.fillRect(0, 0, W, H);

    const floorDef = assets.def('floor');
    const floorImg = assets.get('floor', 'default');
    const tile = floorDef.tile;
    const ox = 330;
    const oy = 150;
    for (let s = 0; s <= 2; s++) {
      for (let i = 0; i <= s; i++) {
        const j = s - i;
        if (i > 1 || j > 1) continue;
        const p = isoTop(i, j, ox, oy, tile);
        sprite(g, floorImg, floorDef, p.x, p.y);
      }
    }
    const faces = ['se', 'sw', 'nw', 'ne'];
    const frame = faces[Math.floor(ms / 1600) % faces.length];
    const pos = isoCenter(0.5, 0.5, ox, oy, tile);
    sprite(g, assets.get('player', frame), assets.def('player'), pos.x, pos.y);

    text(g, 'シュバルツスタ', 36, 64, { size: 32, color: COLORS.ink });
    text(g, "-ʌ'n*empty-", 40, 104, { size: 24, color: COLORS.rose });
    text(g, SHVLANG, 40, 138, { size: 12, color: COLORS.signal });
    text(g, '8BIT RHYTHM BATTLE RPG', 40, 158, { size: 12, color: COLORS.dim });
    if (this.starting || Math.floor(ms / 500) % 2 === 0) {
      text(g, 'PRESS START', 40, 236, { size: 16, color: COLORS.brass });
    }
    text(g, '音が出ます', 40, 262, { size: 12, color: COLORS.dim });
  }
}
