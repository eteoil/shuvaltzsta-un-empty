import { STATES } from '../core/constants.js';
import { COLORS, text, panel, gauge, wrap } from '../core/draw.js';
import { loadItems, money, useItem, count } from '../core/Items.js';
import { loadJSON } from '../core/Data.js';
import { saveOptions } from '../core/Options.js';
import { dateText, dateNumber, timeText, clockText, eventsOf, passTime } from '../core/Calendar.js';
import { levelOf, scoreFor, setTotalScore } from '../core/Level.js';

const ROWS = 7;
const QUEST_ROWS = 4;
const MESSAGE_MS = 1800;

// ポーズ。開いている間は AudioContext ごと止めるので、戦闘の Beat も曲も止まる。
// アイテムはここから使う。戦闘中なら、その戦闘に効果が掛かる
export class MenuState {
  name = STATES.MENU;

  constructor(game) {
    this.game = game;
    this.sel = 0;
    this.mode = 'main';
    this.itemSel = 0;
    this.defs = null;
    this.message = null;
    loadItems().then((d) => { this.defs = d; });
    this.items = [
      { label: 'さいかい', run: () => this.game.states.pop() },
      { label: 'アイテム', run: () => { this.mode = 'items'; this.itemSel = 0; } },
      { label: 'クエスト', run: () => this.openQuests() },
      { label: '時間を進める', run: () => this.openWait() },
      { label: () => `チート：${this.game.options.cheat ? 'ON' : 'OFF'}`, run: () => this.toggleCheat() },
      { label: 'タイトルへ', run: () => this.game.toTitle() },
    ];
    // 開発モード（URL に ?dev）のときだけ、レベルを変える項目。◀▶ で1ずつ、A で10ずつ（100の次は1）
    if (game.dev && game.session) {
      this.items.splice(3, 0, {
        label: () => `レベル ◀ ${this.level} ▶`,
        adjust: (d) => this.setLevel(this.level + d),
        run: () => this.setLevel(this.level >= this.game.config.level.max ? 1 : this.level + 10),
      });
    }
  }

  // クエストの一覧。受けたもの（受注中・完了）を受けた順に。中身は data/quests/*.json
  openQuests() {
    this.mode = 'quests';
    this.questSel = 0;
    const ids = Object.keys(this.session.quests);
    this.questDefs = null;
    Promise.all(ids.map((id) => loadJSON(`data/quests/${id}.json`).catch(() => null)))
      .then((defs) => { this.questDefs = defs.filter(Boolean); });
  }

  updateQuests(btn) {
    if (btn === 'b' || btn === 'pause' || btn === 'start') { this.mode = 'main'; return; }
    const n = this.questDefs?.length ?? 0;
    if (n && (btn === 'up' || btn === 'down')) {
      this.questSel = (this.questSel + n + (btn === 'up' ? -1 : 1)) % n;
      this.game.sfx.play('select');
    }
  }

  // 時間を進める。戦闘とダンジョンの中では拍と噛み合わなくなるので使えない
  openWait() {
    if (this.battle) { this.message = { lines: ['戦闘中は時間を進められない'], at: performance.now() }; return; }
    this.mode = 'wait';
    this.waitHours = 1;
  }

  // ◀▶（上下でも）で1時間ずつ、1〜waitMaxHours 時間
  updateWait(btn) {
    const max = this.game.config.time.waitMaxHours;
    if (btn === 'b' || btn === 'pause' || btn === 'start') { this.mode = 'main'; return; }
    const d = { right: 1, up: 1, left: -1, down: -1 }[btn];
    if (d) {
      this.waitHours = ((this.waitHours - 1 + d + max) % max) + 1;
      this.game.sfx.play('select');
    }
    if (btn === 'a') {
      const h = this.waitHours;
      passTime(this.session, h * 60);
      this.game.sfx.play('confirm');
      const cal = this.game.calendar;
      this.message = { lines: [`${h}時間待った`, `${dateText(cal, this.session.day)}　${timeText(cal, this.session.minute)}`], at: performance.now() };
    }
  }

  get level() {
    return levelOf(this.game.config, this.session.totalScore);
  }

  // レベルは総スコアから決まるので、そのレベルになる総スコアに書き換える
  setLevel(level) {
    const { config } = this.game;
    setTotalScore(this.game, scoreFor(config, Math.max(1, Math.min(config.level.max, level))));
  }

  // タイトルの OPTION と同じ設定。切り替えたらすぐ効き、このブラウザに覚える
  toggleCheat() {
    const o = this.game.options;
    o.cheat = !o.cheat;
    saveOptions(o);
  }

  enter() {
    this.game.clock.suspend();
    this.game.sfx.play('confirm');
  }

  exit() {
    this.game.clock.resume();
  }

  get session() {
    return this.game.session;
  }

  get battle() {
    return this.game.states.stack.find((s) => s.rhythm) ?? null;
  }

  owned() {
    return Object.keys(this.defs ?? {}).filter((id) => this.session?.items[id]);
  }

  update(dt, presses) {
    for (const { btn } of presses) {
      // メッセージは A・B で閉じる（一定時間たてば次の入力で閉じる）
      if (this.message) {
        const fresh = performance.now() - this.message.at < MESSAGE_MS;
        this.message = null;
        if (fresh || btn === 'a' || btn === 'b') continue;
      }
      if (this.mode === 'items') { this.updateItems(btn); continue; }
      if (this.mode === 'wait') { this.updateWait(btn); continue; }
      if (this.mode === 'quests') { this.updateQuests(btn); continue; }
      if (btn === 'up' || btn === 'down') {
        this.sel = (this.sel + this.items.length + (btn === 'up' ? -1 : 1)) % this.items.length;
        this.game.sfx.play('select');
      }
      if ((btn === 'left' || btn === 'right') && this.items[this.sel].adjust) {
        this.items[this.sel].adjust(btn === 'left' ? -1 : 1);
        this.game.sfx.play('select');
      }
      if (btn === 'a') {
        this.game.sfx.play('select');
        this.items[this.sel].run();
        return;
      }
      if (btn === 'b' || btn === 'pause' || btn === 'start') { this.game.sfx.play('select'); this.game.states.pop(); return; }
    }
  }

  updateItems(btn) {
    const list = this.owned();
    if (btn === 'b' || btn === 'pause' || btn === 'start') { this.mode = 'main'; return; }
    if (!list.length) return;
    if (btn === 'up' || btn === 'down') {
      this.itemSel = (this.itemSel + list.length + (btn === 'up' ? -1 : 1)) % list.length;
      this.game.sfx.play('select');
    }
    if (btn === 'a') {
      const r = useItem(this.defs, this.session, list[this.itemSel], this.battle);
      this.game.sfx.play(r.sound);
      this.message = { lines: r.lines, at: performance.now() };
      this.itemSel = Math.min(this.itemSel, Math.max(0, this.owned().length - 1));
    }
  }

  render(g) {
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    g.fillStyle = 'rgba(11,12,24,0.6)';
    g.fillRect(0, 0, W, H);
    if (this.mode === 'items') this.renderItems(g, W, H);
    else if (this.mode === 'quests') this.renderQuests(g, W, H);
    else this.renderMain(g, W);
    if (this.mode === 'wait') this.renderWait(g, W);
    this.renderStatus(g, W);
    // 長い行は枠の幅で折り返し、行数に合わせて枠を高くする
    if (this.message) {
      const lines = this.message.lines.flatMap((l) => wrap(g, l, W - 152)).slice(-5);
      const h = 20 + lines.length * 22;
      panel(g, 60, H - 12 - h, W - 120, h);
      lines.forEach((l, i) => text(g, l, 76, H - h + i * 22));
    }
  }

  renderStatus(g, W) {
    const s = this.session;
    if (!s) return;
    const tags = [this.game.options.cheat && 'CHEAT', this.game.dev && 'DEV'].filter(Boolean);
    // 日付と時刻（右に数字）。その下に、その日の行事（祭り・天赦日・忌み月）を1行ずつ、最後に CHEAT / DEV
    const cal = this.game.calendar;
    const lines = [...eventsOf(cal, s.day).labels, ...(tags.length ? [tags.join(' ')] : [])];
    panel(g, W - 176, 8, 168, 96 + lines.length * 16);
    text(g, dateText(cal, s.day), W - 164, 64, { size: 12, color: COLORS.muted });
    text(g, `(${dateNumber(cal, s.day)})`, W - 66, 64, { size: 12, color: COLORS.muted });
    text(g, timeText(cal, s.minute), W - 164, 80, { size: 12, color: COLORS.muted });
    text(g, `(${clockText(s.minute)})`, W - 66, 80, { size: 12, color: COLORS.muted });
    lines.forEach((l, i) => text(g, l, W - 164, 96 + i * 16, { size: 12, color: COLORS.brass }));
    text(g, `Lv ${this.level}`, W - 164, 48, { color: COLORS.ink });
    text(g, 'HP', W - 164, 18, { color: COLORS.signal });
    gauge(g, W - 136, 23, 90, 8, s.hero.hp / s.hero.maxHp, COLORS.signal);
    if (s.hero.poisoned) text(g, '毒', W - 40, 18, { color: COLORS.unguard });
    text(g, `${s.hero.hp} / ${s.hero.maxHp}`, W - 136, 34, { size: 12, color: COLORS.muted });
    text(g, money(s.money), W - 18, 48, { align: 'right', color: COLORS.perfect });
  }

  renderMain(g, W) {
    // 項目が多い（開発モード）ときは、画面の下にはみ出さないよう行を詰める
    const H = this.game.config.screen.height;
    const step = Math.min(28, (H - 84 - 64 - 8) / this.items.length);
    panel(g, W / 2 - 110, 84, 220, 64 + this.items.length * step);
    text(g, 'PAUSE', W / 2, 98, { size: 24, color: COLORS.brass, align: 'center' });
    this.items.forEach((it, i) => {
      const y = 140 + i * step;
      if (i === this.sel) text(g, '▶', W / 2 - 82, y, { color: COLORS.signal });
      const label = typeof it.label === 'function' ? it.label() : it.label;
      text(g, label, W / 2 - 60, y, { color: i === this.sel ? COLORS.ink : COLORS.muted });
    });
  }

  // 1件を2行で：名前と、受注中／完了・進み具合
  renderQuests(g, W, H) {
    panel(g, 12, 8, W - 196, H - 16);
    text(g, 'クエスト', 28, 20, { color: COLORS.brass });
    const list = this.questDefs ?? [];
    if (!list.length) {
      text(g, this.questDefs ? '受けているクエストはない' : '…', 28, 56, { color: COLORS.muted });
      return;
    }
    const first = Math.max(0, Math.min(this.questSel - QUEST_ROWS + 1, list.length - QUEST_ROWS));
    list.slice(first, first + QUEST_ROWS).forEach((q, k) => {
      const i = first + k;
      const y = 48 + k * 42;
      const active = i === this.questSel;
      if (active) text(g, '▶', 26, y, { color: COLORS.signal });
      text(g, q.name, 44, y, { color: active ? COLORS.ink : COLORS.muted });
      text(g, this.questProgress(q), 44, y + 20, { size: 12, color: this.session.quests[q.id] === 'done' ? COLORS.dim : COLORS.perfect });
    });
    const q = list[this.questSel];
    g.fillStyle = COLORS.line;
    g.fillRect(24, 226, W - 220, 1);
    wrap(g, q.summary, W - 236).slice(0, 2).forEach((l, i) => text(g, l, 28, 236 + i * 22));
  }

  questProgress(q) {
    if (this.session.quests[q.id] === 'done') return '完了';
    if (!q.need) return '受注中';
    const have = Math.min(count(this.session, q.need.item), q.need.count);
    return `受注中　${this.defs?.[q.need.item]?.name ?? q.need.item} ${have}/${q.need.count}`;
  }

  // 何時間進めるか。進めたあとの時刻も見せる
  renderWait(g, W) {
    const cal = this.game.calendar;
    const after = { ...this.session };
    passTime(after, this.waitHours * 60);
    const x = W / 2 - 90;
    const y = 132;
    panel(g, x, y, 180, 96);
    text(g, '時間を進める', W / 2, y + 12, { size: 12, align: 'center', color: COLORS.brass });
    text(g, `◀ ${this.waitHours}時間 ▶`, W / 2, y + 34, { align: 'center', color: COLORS.ink });
    text(g, `${dateText(cal, after.day)}　${timeText(cal, after.minute)}`, W / 2, y + 60, { size: 12, align: 'center', color: COLORS.muted });
    text(g, `(${dateNumber(cal, after.day)} ${clockText(after.minute)})　A：決定`, W / 2, y + 76, { size: 12, align: 'center', color: COLORS.dim });
  }

  renderItems(g, W, H) {
    panel(g, 12, 8, W - 196, H - 16);
    text(g, 'アイテム', 28, 20, { color: COLORS.brass });
    const list = this.owned();
    if (!list.length) {
      text(g, 'なにも持っていない', 28, 56, { color: COLORS.muted });
      return;
    }
    const first = Math.max(0, Math.min(this.itemSel - ROWS + 1, list.length - ROWS));
    list.slice(first, first + ROWS).forEach((id, k) => {
      const i = first + k;
      const y = 50 + k * 24;
      if (i === this.itemSel) text(g, '▶', 26, y, { color: COLORS.signal });
      text(g, this.defs[id].name, 44, y, { color: i === this.itemSel ? COLORS.ink : COLORS.muted });
      text(g, `×${this.session.items[id]}`, W - 204, y, { align: 'right', color: COLORS.muted });
    });
    const d = this.defs[list[this.itemSel]];
    g.fillStyle = COLORS.line;
    g.fillRect(24, 226, W - 220, 1);
    wrap(g, d.desc, W - 236).slice(0, 2).forEach((l, i) => text(g, l, 28, 236 + i * 22));
    if (d.battleOnly) text(g, '戦闘中のみ', 28, 282, { size: 12, color: COLORS.brass });
  }
}
