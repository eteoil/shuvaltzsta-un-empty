// 称号。条件を満たしたら session.titles に覚えて、画面の上に「称号獲得：〇〇」を出す。
// 中身は data/titles.json。いまの条件は図鑑（core/Dex.js）を全部埋めること（dex: items / enemies）
import { loadJSON } from './Data.js';
import { loadDex, hasSeenItem, hasMetEnemy } from './Dex.js';
import { loadItems } from './Items.js';
import { COLORS, text, panel } from './draw.js';

const SHOW_MS = 3200;
const FADE_MS = 400;

export class Titles {
  constructor(game) {
    this.game = game;
    this.defs = [];
    this.all = { items: [], enemies: [] };   // 図鑑に載るものすべて
    this.queue = [];                          // 出す知らせ（{ text, at }。at は出し始めた時刻）
  }

  async load() {
    const [t, items, dex] = await Promise.all([loadJSON('data/titles.json'), loadItems(), loadDex()]);
    this.defs = t.titles;
    this.all = { items: Object.keys(items), enemies: dex.enemies };
  }

  complete(session, kind) {
    const has = kind === 'items' ? (id) => hasSeenItem(session, id) : (id) => hasMetEnemy(session, id);
    return this.all[kind].length > 0 && this.all[kind].every(has);
  }

  // 毎フレーム呼ぶ。まだ持っていない称号の条件を満たしていたら取る
  check() {
    const s = this.game.session;
    if (!s) return;
    s.titles ??= {};
    for (const d of this.defs) {
      if (s.titles[d.id] || !d.dex || !this.complete(s, d.dex)) continue;
      s.titles[d.id] = true;
      this.queue.push({ text: `称号獲得：${d.name}`, at: null });
    }
  }

  // 知らせは1つずつ、どの画面の上にも出す（ポーズ中でも出るよう、時刻は performance.now）
  render(g) {
    const n = this.queue[0];
    if (!n) return;
    const now = performance.now();
    if (n.at == null) { n.at = now; this.game.sfx.play('levelup'); }
    const age = now - n.at;
    if (age >= SHOW_MS) { this.queue.shift(); return; }
    const alpha = Math.min(1, age / FADE_MS, (SHOW_MS - age) / FADE_MS);
    const W = this.game.config.screen.width;
    const w = [...n.text].length * 16 + 40;
    panel(g, (W - w) / 2, 54, w, 36, { alpha });
    text(g, n.text, W / 2, 63, { align: 'center', color: COLORS.perfect, alpha });
  }
}
