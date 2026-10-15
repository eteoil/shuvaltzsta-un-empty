import { STATES } from '../core/constants.js';
import { COLORS, text, panel, gauge, wrap, sprite } from '../core/draw.js';
import { loadItems, money, useItem, count } from '../core/Items.js';
import { loadJSON } from '../core/Data.js';
import { loadDex, hasSeenItem, hasMetEnemy } from '../core/Dex.js';
import { saveOptions } from '../core/Options.js';
import { dateOf, dateText, dateNumber, timeText, clockText, eventsOf, moonOf, passTime } from '../core/Calendar.js';
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
      { label: '図鑑', run: () => this.openDex() },
      { label: '称号', run: () => { this.mode = 'titles'; this.titleSel = 0; } },
      { label: '時間を進める', run: () => this.openWait() },
      { label: () => `チート：${this.game.options.cheat ? 'ON' : 'OFF'}`, run: () => this.toggleCheat() },
      { label: 'タイトルへ', run: () => this.game.toTitle() },
    ];
    // 開発モード（URL に ?dev）のときだけ、レベルと日付を変える項目。
    // レベルは ◀▶ で1ずつ、A で10ずつ（100の次は1）。日付は ◀▶ で1日ずつ、A で次の行事の日へ。
    // 節は ◀▶（A でも次へ）で1節ずつ、同じ区のまま（20区までの水亀節では20区に）。時刻はどれもそのまま
    if (game.dev && game.session) {
      this.items.splice(3, 0, {
        label: () => `レベル ◀ ${this.level} ▶`,
        adjust: (d) => this.setLevel(this.level + d),
        run: () => this.setLevel(this.level >= this.game.config.level.max ? 1 : this.level + 10),
      }, {
        label: () => `日付 ◀ ${dateNumber(this.game.calendar, this.session.day)} ▶`,
        adjust: (d) => { this.session.day = Math.max(1, this.session.day + d); },
        run: () => this.nextEventDay(),
      }, {
        label: () => `節 ◀ ${dateOf(this.game.calendar, this.session.day).name}節 ▶`,
        adjust: (d) => this.stepMonth(d),
        run: () => this.stepMonth(1),
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

  // 図鑑。◀▶ でアイテム図鑑とエネミー図鑑を切り替える。手に入れていないアイテム・出会っていない敵は ???
  openDex() {
    this.mode = 'dex';
    this.dexTab = 'items';
    this.dexSel = 0;
    this.dexEnemies = null;
    loadDex()
      .then((d) => Promise.all(d.enemies.map((id) => loadJSON(`data/enemies/${id}.json`))))
      .then((defs) => { this.dexEnemies = defs; });
    loadJSON('data/races.json').then((r) => { this.races = r; });
  }

  dexList() {
    return this.dexTab === 'items' ? Object.keys(this.defs ?? {}) : this.dexEnemies ?? [];
  }

  updateDex(btn) {
    if (btn === 'b' || btn === 'pause' || btn === 'start') { this.mode = 'main'; return; }
    if (btn === 'left' || btn === 'right') {
      this.dexTab = this.dexTab === 'items' ? 'enemies' : 'items';
      this.dexSel = 0;
      this.game.sfx.play('select');
      return;
    }
    const n = this.dexList().length;
    if (n && (btn === 'up' || btn === 'down')) {
      this.dexSel = (this.dexSel + n + (btn === 'up' ? -1 : 1)) % n;
      this.game.sfx.play('select');
    }
  }

  // 称号の一覧（data/titles.json の順）。まだ取っていない称号は ???
  updateTitles(btn) {
    if (btn === 'b' || btn === 'pause' || btn === 'start') { this.mode = 'main'; return; }
    const n = this.game.titles.defs.length;
    if (n && (btn === 'up' || btn === 'down')) {
      this.titleSel = (this.titleSel + n + (btn === 'up' ? -1 : 1)) % n;
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

  // 1節先（d = 1）か前（d = -1）の同じ区へ。1日目より前には戻らない
  stepMonth(d) {
    const cal = this.game.calendar;
    const now = dateOf(cal, this.session.day);
    const days = (m) => cal.months[(m - 1 + cal.months.length) % cal.months.length].days;
    const to = Math.min(now.day, days(now.month + d));
    const delta = d > 0 ? days(now.month) - now.day + to : -(now.day + days(now.month - 1) - to);
    if (this.session.day + delta >= 1) this.session.day += delta;
  }

  // 次の行事が始まる日（祭り・天赦日・忌み月のどれかがあって、前の日と顔ぶれが違う日）へ進める。1年先まで探す。
  // 天赦日が3日続くときは、その1日目で止まる
  nextEventDay() {
    const cal = this.game.calendar;
    const labels = (d) => eventsOf(cal, d).labels.join();
    const year = cal.months.reduce((sum, m) => sum + m.days, 0);
    for (let d = this.session.day + 1; d <= this.session.day + year; d++) {
      if (labels(d) && labels(d) !== labels(d - 1)) { this.session.day = d; return; }
    }
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
      if (this.mode === 'dex') { this.updateDex(btn); continue; }
      if (this.mode === 'titles') { this.updateTitles(btn); continue; }
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
    else if (this.mode === 'dex') this.renderDex(g, W, H);
    else if (this.mode === 'titles') this.renderTitles(g, W, H);
    else this.renderMain(g, W);
    if (this.mode === 'wait') this.renderWait(g, W);
    this.renderStatus(g, W);
    // 右下の枠：エネミー図鑑で出会った敵を選んでいるときは敵の姿、ほかは図鑑と称号の埋まり具合
    if (!(this.mode === 'dex' && this.renderDexPortrait(g, W, H))) this.renderRecord(g, W, H);
    // 長い行は枠の幅で折り返し、行数に合わせて枠を高くする
    if (this.message) {
      const lines = this.message.lines.flatMap((l) => wrap(g, l, W - 152)).slice(-5);
      const h = 20 + lines.length * 22;
      panel(g, 60, H - 12 - h, W - 120, h);
      lines.forEach((l, i) => text(g, l, 76, H - h + i * 22));
    }
  }

  // 右上の枠：HP・レベルとお金・日付と時刻・月相と行事（1行ずつ）・CHEAT / DEV
  renderStatus(g, W) {
    const s = this.session;
    if (!s) return;
    const tags = [this.game.options.cheat && 'CHEAT', this.game.dev && 'DEV'].filter(Boolean);
    const cal = this.game.calendar;
    const moon = moonOf(cal, s.day);
    const lines = [...(moon ? [moon] : []), ...eventsOf(cal, s.day).labels, ...(tags.length ? [tags.join(' ')] : [])];
    const x = W - 164;
    const h = 120 + lines.length * 16;
    panel(g, W - 176, 8, 168, h);
    this.statusBottom = 8 + h;
    text(g, 'HP', x, 20, { color: COLORS.signal });
    gauge(g, x + 28, 25, 90, 8, s.hero.hp / s.hero.maxHp, COLORS.signal);
    if (s.hero.poisoned) text(g, '毒', W - 40, 20, { color: COLORS.unguard });
    text(g, `${s.hero.hp} / ${s.hero.maxHp}`, x + 28, 37, { size: 12, color: COLORS.muted });
    text(g, `Lv ${this.level}`, x, 56, { color: COLORS.ink });
    text(g, money(s.money), W - 20, 56, { align: 'right', color: COLORS.perfect });
    g.fillStyle = COLORS.line;
    g.fillRect(x, 77, 144, 1);
    text(g, `${dateText(cal, s.day)}(${dateNumber(cal, s.day)})`, x, 84, { size: 12, color: COLORS.muted });
    text(g, `${timeText(cal, s.minute)}(${clockText(s.minute)})`, x, 100, { size: 12, color: COLORS.muted });
    lines.forEach((l, i) => text(g, l, x, 118 + i * 16, { size: 12, color: COLORS.brass }));
  }

  // 右下の枠：図鑑と称号がどれだけ埋まったか
  renderRecord(g, W, H) {
    const s = this.session;
    const t = this.game.titles;
    if (!s || !t) return;
    const top = this.statusBottom + 6;
    panel(g, W - 176, top, 168, H - 8 - top);
    const x = W - 164;
    const n = (kind, has) => `${t.all[kind].filter(has).length}/${t.all[kind].length}`;
    const rows = [
      ['アイテム図鑑', n('items', (id) => hasSeenItem(s, id))],
      ['エネミー図鑑', n('enemies', (id) => hasMetEnemy(s, id))],
      ['称号', `${t.defs.filter((d) => s.titles?.[d.id]).length}/${t.defs.length}`],
    ];
    text(g, 'きろく', x, top + 12, { size: 12, color: COLORS.brass });
    rows.forEach(([label, v], i) => {
      const y = top + 32 + i * 20;
      text(g, label, x, y, { size: 12, color: COLORS.muted });
      text(g, v, W - 20, y, { size: 12, align: 'right', color: COLORS.ink });
    });
  }

  // 左の大きな枠に項目を並べる（項目の画面と同じ枠）。下に操作の案内
  renderMain(g, W) {
    const H = this.game.config.screen.height;
    panel(g, 12, 8, W - 196, H - 16);
    text(g, 'PAUSE', 28, 20, { color: COLORS.brass });
    g.fillStyle = COLORS.line;
    g.fillRect(24, 44, W - 220, 1);
    // 項目が多い（開発モード）ときは、案内の上に収まるよう行を詰める
    const top = 58;
    const step = Math.min(30, (H - 44 - top) / this.items.length);
    this.items.forEach((it, i) => {
      const y = top + i * step;
      const on = i === this.sel;
      if (on) text(g, '▶', 26, y, { color: COLORS.signal });
      const label = typeof it.label === 'function' ? it.label() : it.label;
      text(g, label, 44, y, { color: on ? COLORS.ink : COLORS.muted });
    });
    text(g, 'A：けってい　B：とじる', 28, H - 34, { size: 12, color: COLORS.dim });
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
    // 左の枠のまん中に重ねる
    const cx = 12 + (W - 196) / 2;
    const x = cx - 100;
    const y = 112;
    panel(g, x, y, 200, 108);
    text(g, '時間を進める', cx, y + 14, { size: 12, align: 'center', color: COLORS.brass });
    text(g, `◀ ${this.waitHours}時間 ▶`, cx, y + 38, { align: 'center', color: COLORS.ink });
    text(g, `${dateText(cal, after.day)}　${timeText(cal, after.minute)}`, cx, y + 66, { size: 12, align: 'center', color: COLORS.muted });
    text(g, `(${dateNumber(cal, after.day)} ${clockText(after.minute)})　A：決定`, cx, y + 84, { size: 12, align: 'center', color: COLORS.dim });
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

  // 上に一覧（番号と名前。まだなら ???）、線の下に選んでいるものの説明。敵は一覧の右に姿も出す
  renderDex(g, W, H) {
    panel(g, 12, 8, W - 196, H - 16);
    const items = this.dexTab === 'items';
    text(g, `◀ ${items ? 'アイテム図鑑' : 'エネミー図鑑'} ▶`, 28, 20, { color: COLORS.brass });
    const list = this.dexList();
    if (!list.length) { text(g, '…', 28, 56, { color: COLORS.muted }); return; }
    const s = this.session;
    const known = (x) => (items ? hasSeenItem(s, x) : hasMetEnemy(s, x.id));
    const name = (x) => (items ? this.defs[x].name : x.name);
    text(g, `${list.filter(known).length}/${list.length}`, W - 200, 20, { align: 'right', color: COLORS.muted });
    const first = Math.max(0, Math.min(this.dexSel - ROWS + 1, list.length - ROWS));
    list.slice(first, first + ROWS).forEach((x, k) => {
      const i = first + k;
      const y = 50 + k * 24;
      const on = i === this.dexSel;
      if (on) text(g, '▶', 26, y, { color: COLORS.signal });
      text(g, `No.${String(i + 1).padStart(2, '0')}`, 44, y, { size: 12, color: COLORS.dim });
      text(g, known(x) ? name(x) : '???', 92, y, { color: on ? COLORS.ink : COLORS.muted });
    });
    const x = list[this.dexSel];
    g.fillStyle = COLORS.line;
    g.fillRect(24, 226, W - 220, 1);
    if (!known(x)) {
      text(g, items ? 'まだ手に入れていない' : 'まだ出会っていない', 28, 236, { color: COLORS.muted });
      return;
    }
    if (items) {
      const d = this.defs[x];
      wrap(g, d.desc, W - 236).slice(0, 2).forEach((l, i) => text(g, l, 28, 236 + i * 22));
      if (d.battleOnly) text(g, '戦闘中のみ', 28, 282, { size: 12, color: COLORS.brass });
      return;
    }
    // 敵：種族・HP・落とす物（落とす物を手に入れていなければ ???）と、姿
    const race = this.races?.[x.race];
    if (race) text(g, `${race.name}（${race.label}）`, 28, 236, { color: COLORS.ink });
    const drop = x.drop ? (hasSeenItem(s, x.drop) ? this.defs?.[x.drop]?.name ?? x.drop : '???') : 'なし';
    text(g, `HP ${x.hp}　落とす物：${drop}`, 28, 258, { color: COLORS.muted });
    if (x.boss) text(g, 'ボス', 28, 282, { size: 12, color: COLORS.rose });
  }

  // エネミー図鑑で選んでいる敵の姿。右の状態の枠の下に、別の枠を出して描く。
  // 出会っていない敵（とアイテム図鑑）では描かずに false を返し、代わりに「きろく」の枠を出す
  renderDexPortrait(g, W, H) {
    const x = this.dexTab === 'enemies' && this.dexList()[this.dexSel];
    if (!x || !hasMetEnemy(this.session, x.id)) return false;
    const top = this.statusBottom + 6;
    panel(g, W - 176, top, 168, H - 8 - top);
    // 小さい敵は枠のまん中あたりに、大きい敵は足元を枠の下に合わせる
    const poses = (x.actors ?? []).map((a) => this.game.assets.pose(a.sprite, 'sw', null, 0, a.palette));
    const tall = Math.max(...poses.map((p) => p.def.anchor[1]));
    const foot = Math.min(H - 18, (top + H - 8) / 2 + tall / 2);
    poses.forEach(({ img, def }, k) => sprite(g, img, def, W - 92 + (k - (poses.length - 1) / 2) * 52, foot));
    return true;
  }

  renderTitles(g, W, H) {
    panel(g, 12, 8, W - 196, H - 16);
    text(g, '称号', 28, 20, { color: COLORS.brass });
    const list = this.game.titles.defs;
    const got = (t) => !!this.session.titles?.[t.id];
    text(g, `${list.filter(got).length}/${list.length}`, W - 200, 20, { align: 'right', color: COLORS.muted });
    const first = Math.max(0, Math.min(this.titleSel - ROWS + 1, list.length - ROWS));
    list.slice(first, first + ROWS).forEach((t, k) => {
      const i = first + k;
      const y = 50 + k * 24;
      const on = i === this.titleSel;
      if (on) text(g, '▶', 26, y, { color: COLORS.signal });
      text(g, got(t) ? t.name : '???', 44, y, { color: on ? (got(t) ? COLORS.perfect : COLORS.ink) : COLORS.muted });
    });
    const t = list[this.titleSel];
    if (!t) return;
    g.fillStyle = COLORS.line;
    g.fillRect(24, 226, W - 220, 1);
    text(g, got(t) ? t.desc ?? '' : 'まだ取っていない', 28, 236, { color: COLORS.muted });
  }
}
