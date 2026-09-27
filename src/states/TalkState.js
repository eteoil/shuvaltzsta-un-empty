import { STATES } from '../core/constants.js';
import { COLORS, text, panel, wrap } from '../core/draw.js';
import { loadItems, money, count, addItem, takeItem } from '../core/Items.js';
import { loadJSON } from '../core/Data.js';
import { setTotalScore } from '../core/Level.js';
import { cure } from '../core/Hero.js';
import { dateText, eventsOf, isNight, isOpen, passTime, sleep } from '../core/Calendar.js';
import { CafeJobState } from './CafeJobState.js';
import { ShopState } from './ShopState.js';

const CHAR_MS = 32;
// ベッドで休むときの暗転（秒）。暗くなる → 真っ暗のままメロディ → 明るくなる
const SLEEP = { out: 0.8, hold: 2.2, in: 0.8 };

// NPC との会話。あいさつ → 選択肢 → 世間話・買い物（SHOP）・鑑定・交換・買い取り・バイト（MINIGAME）・休む。
// 中身は data/npcs/*.json（憲法⑨）。ベッドのような家具も、選択肢を持つ NPC として同じ仕組みで話しかける。
// quest を持つ NPC（エレナ）は、選択肢の代わりにクエストの進み具合で会話が変わる（data/quests/*.json）
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
    this.speaker = null;     // 名前札に出す名前（null なら話しかけた相手、'' なら名前札なし）
  }

  async enter() {
    this.items = await loadItems();
    if (this.npc.quest) {
      this.quest = await loadJSON(`data/quests/${this.npc.quest}.json`);
      this.questTalk();
      return;
    }
    this.menu();
  }

  get session() {
    return this.game.session;
  }

  say(line, next = () => this.close(), speaker = null) {
    this.line = line;
    this.shownAt = performance.now();
    this.choices = null;
    this.next = next;
    this.speaker = speaker;
  }

  choose(line, options, cancel = () => this.close(), speaker = null) {
    this.say(line, null, speaker);
    this.choices = { options, sel: 0, cancel };
  }

  // { speaker, text } の並びを順に言い、最後に then（省略時は会話を終える）
  sayLines(lines, then = () => this.close(), k = 0) {
    if (k >= lines.length) { then(); return; }
    this.say(lines[k].text, () => this.sayLines(lines, then, k + 1), lines[k].speaker ?? null);
  }

  // ---------------------------------------------------------------- クエスト
  // session.quests[id] が 無い → 頼まれる／'active' → 受注中／'done' → 完了

  questTalk() {
    const q = this.quest;
    const state = this.session.quests[q.id];
    if (state === 'done') { this.sayLines(q.done); return; }
    if (state === 'active') {
      if (count(this.session, q.need.item) < q.need.count) { this.sayLines(q.waiting); return; }
      const d = q.deliver;
      const no = () => this.sayLines(d.no);
      this.choose(d.prompt.text, [
        { label: 'はい', run: () => this.completeQuest() },
        { label: 'いいえ', run: no },
      ], no, d.prompt.speaker);
      return;
    }
    const { lines, accept, decline } = q.offer;
    const last = lines[lines.length - 1];
    const no = () => this.sayLines(decline.lines);
    this.sayLines(lines.slice(0, -1), () => this.choose(last.text, [
      { label: accept.label, run: () => { this.session.quests[q.id] = 'active'; this.game.sfx.play('confirm'); this.sayLines(accept.lines); } },
      { label: decline.label, run: no },
    ], no, last.speaker));
  }

  // 渡して報酬（お金と総スコア）。レベルが上がったら会話のあとに知らせる
  completeQuest() {
    const q = this.quest;
    const s = this.session;
    for (let k = 0; k < q.need.count; k++) takeItem(s, q.need.item);
    const { money: gain = 0, score = 0 } = q.deliver.reward;
    s.money += gain;
    const { from, to } = setTotalScore(this.game, s.totalScore + score);
    s.quests[q.id] = 'done';
    this.game.sfx.play('levelup');
    const got = { speaker: '', text: `${money(gain)}と${score.toLocaleString('en-US')}スコアを手に入れた` };
    this.sayLines([...q.deliver.yes, got], () => {
      this.close();
      if (to > from) this.game.levelUp(to);
    });
  }

  close() {
    this.game.states.pop();
  }

  // 売れる物（items.json に sell がある物）のうち持っている物
  sellables() {
    return Object.keys(this.session.items).filter((id) => this.items[id]?.sell && count(this.session, id) > 0);
  }

  // 出す選択肢。if.has の持ち物が if.count 個（省略時 1 個）以上、if.sellable なら売れる物を持っているときだけ
  visibleOptions() {
    return this.npc.options.filter((o) => (!o.if?.has || count(this.session, o.if.has) >= (o.if.count ?? 1))
      && (!o.if?.sellable || this.sellables().length > 0));
  }

  // if.has の持ち物が if.count 個（省略時 1 個）以上あるときだけ出す選択肢がある。
  // cancel の付いた選択肢（「なんでもない」）を除いて1つしか残らなければ、あいさつも選択肢も出さずにそれを始める。
  // B で抜けたときは cancel の付いた選択肢を選んだのと同じ。無ければそのまま終わる
  get today() {
    return eventsOf(this.game.calendar, this.session.day);
  }

  get night() {
    return isNight(this.game.config, this.session.minute);
  }

  // いまいるマップが営業時間外（hours の外）なら、closedText だけ言って終わる（店じまいのジャグジー）。
  // nightGreet：夜のあいさつ（バーのシャルヴィス）
  menu() {
    if (this.npc.closedText && !isOpen(this.session.map.hours, this.session.minute)) { this.say(this.npc.closedText); return; }
    const shown = this.visibleOptions();
    const main = shown.filter((o) => !o.cancel);
    if (main.length === 1) { this.act(main[0]); return; }
    const cancel = shown.find((o) => o.cancel);
    const greet = this.night && this.npc.nightGreet ? this.npc.nightGreet : this.npc.greet;
    this.choose(greet, shown.map((o) => ({ label: o.label, run: () => this.act(o) })), cancel ? () => this.act(cancel) : undefined);
  }

  // closedOnRestDay の選択肢は、天赦日には restDayText だけ言って終わる（カフェの休み）
  act(o) {
    if (o.closedOnRestDay && this.today.rest) this.say(this.npc.restDayText);
    else if (o.say) this.say(o.say);
    else if (o.shop) this.shop(o.shop);
    else if (o.appraise) this.appraise(o.appraise);
    else if (o.trade) this.trade(o.trade);
    else if (o.job) this.job(o.job);
    else if (o.buy) this.buy(o.buy);
    else if (o.rest) this.rest(o.rest);
    else this.close();
  }

  // 買い物は専用の State で。店を出たら会話も終わる
  shop(s) {
    const sale = s.festivalSale && this.today.festival ? s.festivalSale : 1;
    this.game.states.push(new ShopState(this.game, this.npc, s, this.items, () => this.close(), sale));
  }

  appraise(a) {
    if (!takeItem(this.session, a.item)) { this.say(a.none); return; }
    const results = Object.keys(a.results);
    const got = results[Math.floor(Math.random() * results.length)];
    addItem(this.session, got);
    this.say(a.results[got]);
  }

  // 「いいえ」と B は同じ。no があればそのセリフを言ってから終わる
  trade(t) {
    const no = () => (t.no ? this.say(t.no) : this.close());
    this.choose(t.prompt, [
      {
        label: 'はい',
        run: () => {
          const n = t.giveCount ?? 1;
          if (this.session.money < t.price) { this.say(t.poor); return; }
          if (count(this.session, t.give) < n) { this.close(); return; }
          for (let k = 0; k < n; k++) takeItem(this.session, t.give);
          this.session.money -= t.price;
          addItem(this.session, t.get);
          this.game.sfx.play('confirm');
          this.say(t.yes);
        },
      },
      { label: 'いいえ', run: no },
    ], no);
  }

  // 持っている売れる物を買い取る。1種類でも、どれを見せるか選んでもらう。
  // 値段はその種類を全部売ったときの合計。「いいえ」と B は no のセリフで終わる
  buy(b) {
    const list = this.sellables();
    const no = () => this.say(b.no);
    this.choose(b.which, list.map((id) => ({ label: `${this.items[id].name}×${count(this.session, id)}`, run: () => this.offer(b, id) })), no);
  }

  offer(b, id) {
    const n = count(this.session, id);
    const price = this.items[id].sell * n;
    const no = () => this.say(b.no);
    this.choose(b.prompt.replace('{price}', money(price)), [
      {
        label: 'はい',
        run: () => {
          for (let k = 0; k < n; k++) takeItem(this.session, id);
          this.session.money += price;
          this.game.sfx.play('confirm');
          this.say(b.yes);
        },
      },
      { label: 'いいえ', run: no },
    ], no);
  }

  // ベッドで休む。HP が満タンになり毒も消え、次の日になる（バイトがまたできる）
  // 暗転しているあいだに眠る（回復・日付）。明るくなってから起きたときのセリフ
  rest(r) {
    this.line = '';
    this.choices = null;
    this.next = null;
    this.sleeping = { t: 0, r, slept: false };
    this.game.sfx.play('rest');
  }

  updateSleep(dt) {
    const z = this.sleeping;
    z.t += dt;
    if (!z.slept && z.t >= SLEEP.out) {
      const s = this.session;
      s.hero.hp = s.hero.maxHp;
      cure(s.hero);
      sleep(s, this.game.config);
      z.slept = true;
    }
    if (z.t < SLEEP.out + SLEEP.hold + SLEEP.in) return;
    this.sleeping = null;
    const s = this.session;
    this.sayAll([z.r.say.replace('{date}', dateText(this.game.calendar, s.day)), ...eventsOf(this.game.calendar, s.day).wake]);
  }

  // 暗さ（0〜1）
  get darkness() {
    const z = this.sleeping;
    if (!z) return 0;
    if (z.t < SLEEP.out) return z.t / SLEEP.out;
    if (z.t < SLEEP.out + SLEEP.hold) return 1;
    return Math.max(0, 1 - (z.t - SLEEP.out - SLEEP.hold) / SLEEP.in);
  }

  // 何行かを順に言って終わる
  sayAll(lines, k = 0) {
    this.say(lines[k], k + 1 < lines.length ? () => this.sayAll(lines, k + 1) : undefined);
  }

  // バイトは1日1回（ベッドで休むと次の日）
  job(j) {
    if (this.session.worked[j.game] === this.session.day) { this.say(j.tired); return; }
    this.session.worked[j.game] = this.session.day;
    passTime(this.session, this.game.config.time.jobMinutes);
    this.game.states.push(new CafeJobState(this.game, j.game, (reward) => {
      this.session.money += reward;
      this.say(`${j.done}（${money(reward)}もらった）`);
    }));
  }

  visible() {
    return Math.floor((performance.now() - this.shownAt) / CHAR_MS);
  }

  update(dt, presses) {
    if (this.sleeping) { this.updateSleep(dt); return; }   // 暗転中は入力を受けない
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
    // お店の画面の裏に会話のウィンドウが透けないように
    if (!this.items || this.game.states.top instanceof ShopState) return;
    const W = this.game.config.screen.width;
    const H = this.game.config.screen.height;
    if (this.sleeping) {
      g.fillStyle = `rgba(0,0,0,${this.darkness})`;
      g.fillRect(0, 0, W, H);
      return;
    }
    const top = H - 108;
    panel(g, 8, top, W - 16, 100);
    const name = this.speaker ?? this.npc.name;
    if (name) {
      panel(g, 16, top - 26, Math.max(80, [...name].length * 16 + 24), 30);
      text(g, name, 28, top - 21, { color: COLORS.brass });
    }
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
