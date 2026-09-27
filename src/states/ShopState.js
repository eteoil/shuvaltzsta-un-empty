import { STATES } from '../core/constants.js';
import { COLORS, text, panel, wrap } from '../core/draw.js';
import { money, count, addItem } from '../core/Items.js';

const CHAR_MS = 32;
const ROWS = 5;   // 一度に見せる品数。多ければ選んでいる品に合わせて送る

// お店。NPC の選択肢「買い物」から入る。品物と値段は data/npcs/*.json の shop（憲法⑨）。
// 十字で選んで A で買う。続けて何個でも買え、B で店を出る（出たら会話も終わる）
export class ShopState {
  name = STATES.SHOP;

  // sale：値段に掛ける倍率（祭りの日の特売など）。1 なら定価
  constructor(game, npc, shop, itemDefs, onClose, sale = 1) {
    this.game = game;
    this.npc = npc;
    this.shop = shop;
    this.defs = itemDefs;
    this.onClose = onClose;
    this.sale = sale;
    this.sel = 0;
    this.say(shop.prompt);
  }

  get session() {
    return this.game.session;
  }

  say(line) {
    this.line = line;
    this.shownAt = performance.now();
  }

  price(base) {
    return Math.round(base * this.sale);
  }

  update(dt, presses) {
    const list = this.shop.items;
    for (const { btn } of presses) {
      if (btn === 'up' || btn === 'down') {
        this.sel = (this.sel + list.length + (btn === 'up' ? -1 : 1)) % list.length;
        this.game.sfx.play('select');
      } else if (btn === 'a') {
        this.buy(list[this.sel][0], this.price(list[this.sel][1]));
      } else if (btn === 'b') {
        this.game.sfx.play('select');
        this.game.states.pop();
        this.onClose?.();
        return;
      }
    }
  }

  buy(id, price) {
    if (this.session.money < price) {
      this.game.sfx.play('miss');
      this.say(this.shop.poor);
      return;
    }
    this.session.money -= price;
    addItem(this.session, id);
    this.game.sfx.play('confirm');
    this.say(this.shop.thanks);
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    g.fillStyle = 'rgba(11,12,24,0.6)';
    g.fillRect(0, 0, W, H);

    // 品物の一覧と説明
    const listH = H - 128;
    panel(g, 12, 8, W - 24, listH);
    text(g, this.sale < 1 ? '買い物　特売！' : '買い物', 28, 18, { color: COLORS.brass });
    text(g, money(this.session.money), W - 28, 18, { align: 'right', color: COLORS.perfect });
    const list = this.shop.items;
    const first = Math.max(0, Math.min(this.sel - ROWS + 1, list.length - ROWS));
    list.slice(first, first + ROWS).forEach(([id, base], k) => {
      const price = this.price(base);
      const i = first + k;
      const y = 46 + k * 22;
      const active = i === this.sel;
      const poor = this.session.money < price;
      if (active) text(g, '▶', 26, y, { color: COLORS.signal });
      text(g, this.defs[id].name, 44, y, { color: active ? COLORS.ink : COLORS.muted });
      text(g, `×${count(this.session, id)}`, W - 150, y, { size: 12, align: 'right', color: COLORS.dim });
      text(g, money(price), W - 28, y, { align: 'right', color: poor ? COLORS.miss : COLORS.perfect });
    });
    if (first > 0) text(g, '▲', W / 2, 30, { size: 12, align: 'center', color: COLORS.dim });
    if (first + ROWS < list.length) text(g, '▼', W / 2, 46 + ROWS * 22 - 8, { size: 12, align: 'center', color: COLORS.dim });
    const d = this.defs[list[this.sel][0]];
    const descY = 46 + Math.min(ROWS, list.length) * 22 + 10;
    g.fillStyle = COLORS.line;
    g.fillRect(24, descY - 6, W - 48, 1);
    wrap(g, d.desc, W - 64).slice(0, 2).forEach((l, i) => text(g, l, 28, descY + i * 22));
    if (d.battleOnly) text(g, '戦闘中のみ', W - 28, descY + 22, { size: 12, align: 'right', color: COLORS.brass });

    // 店の人のセリフ
    const top = H - 92;
    panel(g, 8, top, W - 16, 84);
    panel(g, 16, top - 26, Math.max(80, [...this.npc.name].length * 16 + 24), 30);
    text(g, this.npc.name, 28, top - 21, { color: COLORS.brass });
    const shown = [...this.line].slice(0, Math.floor((performance.now() - this.shownAt) / CHAR_MS)).join('');
    wrap(g, shown, W - 48).slice(0, 2).forEach((l, i) => text(g, l, 24, top + 16 + i * 24));
    text(g, 'A：買う　B：店を出る', W - 20, top + 62, { size: 12, align: 'right', color: COLORS.dim });
  }
}
