import { STATES } from '../core/constants.js';
import { COLORS, text, panel, wrap } from '../core/draw.js';
import { loadItems, money, count, addItem, takeItem } from '../core/Items.js';
import { CafeJobState } from './CafeJobState.js';

const CHAR_MS = 32;

// NPC との会話。あいさつ → 選択肢 → 世間話・買い物・鑑定・交換・バイト。
// 中身は data/npcs/*.json（憲法⑨）。B で選択肢を閉じると会話も終わる
export class TalkState {
  name = STATES.DIALOG;

  constructor(game, npc) {
    this.game = game;
    this.npc = npc;
    this.items = null;
    this.line = '';
    this.shownAt = 0;
    this.choices = null;     // { options: [{ label, run }], sel, cancel }
    this.next = null;        // セリフを読み終えて A を押したら呼ぶ
  }

  async enter() {
    this.items = await loadItems();
    this.menu();
  }

  get session() {
    return this.game.session;
  }

  say(line, next = () => this.close()) {
    this.line = line;
    this.shownAt = performance.now();
    this.choices = null;
    this.next = next;
  }

  choose(line, options, cancel = () => this.close()) {
    this.say(line, null);
    this.choices = { options, sel: 0, cancel };
  }

  close() {
    this.game.states.pop();
  }

  menu() {
    const options = this.npc.options
      .filter((o) => !o.if?.has || count(this.session, o.if.has) > 0)
      .map((o) => ({ label: o.label, run: () => this.act(o) }));
    this.choose(this.npc.greet, options);
  }

  act(o) {
    if (o.say) this.say(o.say);
    else if (o.shop) this.shop(o.shop);
    else if (o.appraise) this.appraise(o.appraise);
    else if (o.trade) this.trade(o.trade);
    else if (o.job) this.job(o.job);
  }

  shop(s) {
    const options = s.items.map(([id, price]) => ({
      label: `${this.items[id].name}　${money(price)}`,
      run: () => {
        if (this.session.money < price) { this.say(s.poor); return; }
        this.session.money -= price;
        addItem(this.session, id);
        this.game.sfx.play('confirm');
        this.say(s.thanks);
      },
    }));
    this.choose(s.prompt, options);
  }

  appraise(a) {
    if (!takeItem(this.session, a.item)) { this.say(a.none); return; }
    const results = Object.keys(a.results);
    const got = results[Math.floor(Math.random() * results.length)];
    addItem(this.session, got);
    this.say(a.results[got]);
  }

  trade(t) {
    this.choose(t.prompt, [
      {
        label: 'はい',
        run: () => {
          if (this.session.money < t.price) { this.say(t.poor); return; }
          if (!takeItem(this.session, t.give)) { this.close(); return; }
          this.session.money -= t.price;
          addItem(this.session, t.get);
          this.game.sfx.play('confirm');
          this.say(t.yes);
        },
      },
      { label: 'いいえ', run: () => this.close() },
    ]);
  }

  job(j) {
    this.game.states.push(new CafeJobState(this.game, j.game, (reward) => {
      this.session.money += reward;
      this.say(`${j.done}（${money(reward)}もらった）`);
    }));
  }

  visible() {
    return Math.floor((performance.now() - this.shownAt) / CHAR_MS);
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      const typing = this.visible() < [...this.line].length;
      if (typing && (btn === 'a' || btn === 'b')) { this.shownAt = -1e9; continue; }
      const c = this.choices;
      if (c) {
        if (btn === 'up' || btn === 'down') {
          c.sel = (c.sel + c.options.length + (btn === 'up' ? -1 : 1)) % c.options.length;
          this.game.sfx.play('select');
        } else if (btn === 'a') {
          this.game.sfx.play('select');
          c.options[c.sel].run();
          return;
        } else if (btn === 'b') {
          c.cancel();
          return;
        }
      } else if (btn === 'a' || btn === 'b') {
        this.game.sfx.play('select');
        this.next?.();
        return;
      }
    }
  }

  render(g) {
    if (!this.items) return;
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    const top = H - 108;
    panel(g, 8, top, W - 16, 100);
    panel(g, 16, top - 26, Math.max(80, [...this.npc.name].length * 16 + 24), 30);
    text(g, this.npc.name, 28, top - 19, { color: COLORS.brass });
    const shown = [...this.line].slice(0, this.visible()).join('');
    wrap(g, shown, W - 48).slice(0, 3).forEach((l, i) => text(g, l, 24, top + 16 + i * 24));
    text(g, money(this.session.money), W - 20, top + 8, { size: 12, align: 'right', color: COLORS.perfect });

    const c = this.choices;
    if (c && this.visible() >= [...this.line].length) {
      const w = Math.max(...c.options.map((o) => [...o.label].length)) * 16 + 44;
      const h = c.options.length * 24 + 16;
      const x = W - 12 - w;
      const y = top - 34 - h;
      panel(g, x, y, w, h);
      c.options.forEach((o, i) => {
        if (i === c.sel) text(g, '▶', x + 10, y + 10 + i * 24, { color: COLORS.signal });
        text(g, o.label, x + 28, y + 10 + i * 24, { color: i === c.sel ? COLORS.ink : COLORS.muted });
      });
    } else if (!c && this.visible() >= [...this.line].length && Math.floor(performance.now() / 350) % 2 === 0) {
      text(g, '▼', W - 30, top + 76, { size: 12, color: COLORS.signal });
    }
  }
}
