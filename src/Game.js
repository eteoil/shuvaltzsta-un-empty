import { AudioClock } from './core/AudioClock.js';
import { Input } from './core/Input.js';
import { Assets } from './core/Assets.js';
import { Sfx } from './core/Sfx.js';
import { Bgm } from './core/Bgm.js';
import { StateMachine } from './core/StateMachine.js';
import { loadMap, loadDialog, loadEnemy } from './core/Data.js';
import { FONT } from './core/draw.js';
import { TitleState } from './states/TitleState.js';
import { FieldState } from './states/FieldState.js';
import { DialogState } from './states/DialogState.js';
import { BattleState } from './states/BattleState.js';
import { MenuState } from './states/MenuState.js';
import { TalkState } from './states/TalkState.js';
import { loadOptions } from './core/Options.js';
import { cure } from './core/Hero.js';
import { maxHpOf, setTotalScore } from './core/Level.js';

const wait = (ms) => new Promise((ok) => { setTimeout(ok, ms); });

export class Game {
  constructor(canvas, root, config) {
    this.config = config;
    canvas.width = config.screen.width;
    canvas.height = config.screen.height;
    this.g = canvas.getContext('2d');
    this.clock = new AudioClock(config);
    this.input = new Input(this.clock, root);
    this.assets = new Assets();
    this.sfx = new Sfx(this.clock, config);
    this.bgm = new Bgm(this.clock, config);
    this.states = new StateMachine();
    this.session = null;
    this.options = loadOptions();
    // 開発モード：URL に ?dev を付けたときだけ。ポーズメニューでレベルを変えられる
    this.dev = new URLSearchParams(location.search).has('dev');
    this.lastT = 0;
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.pause(); });
  }

  async load() {
    const font = document.fonts ? Promise.race([document.fonts.load(`16px ${FONT}`), wait(3000)]) : null;
    await Promise.all([font, this.assets.loadSprites('data/sprites.json'), this.bgm.load('battle')]);
  }

  start() {
    this.states.change(new TitleState(this));
    requestAnimationFrame(this.frame);
  }

  // 描画は rAF、ゲームの進み（dt）は AudioContext の時刻から出す（憲法⑫）
  frame = (ms) => {
    const t = this.clock.now;
    const dt = Math.min(Math.max(t - this.lastT, 0), 0.1);
    this.lastT = t;
    this.states.update(dt, this.input.drain());
    this.bgm.tick();
    this.g.imageSmoothingEnabled = false;
    this.states.render(this.g, ms);
    requestAnimationFrame(this.frame);
  };

  pause() {
    if (this.states.top?.pausable) this.states.push(new MenuState(this));
  }

  async newGame() {
    const map = await loadMap(this.config.startMap);
    const [i, j, dir] = map.start;
    // totalScore はプロットの「総スコア」。戦闘ごとのスコアを足していき、ここからレベルが決まる（core/Level.js）。
    // hero の HP と毒は探索と戦闘をまたいで持ち越す
    const maxHp = maxHpOf(this.config, 1);
    const start = this.config.start;
    this.session = {
      map,
      player: { i, j, dir },
      hero: { hp: maxHp, maxHp, poisoned: false, poisonTicks: 0 },
      money: start.money,
      items: { ...start.items },
      flags: {},
      pickups: {},        // マップの id → 落ちている物と、次に現れるまでの秒（FieldState）
      totalScore: 0,
    };
    this.states.change(new FieldState(this));
  }

  toTitle() {
    this.bgm.stop(0.2);
    this.states.change(new TitleState(this));
  }

  async runEncounter(enc) {
    const won = !!this.session.flags[enc.id];
    const enemy = loadEnemy(enc.enemy);
    const giveUp = enc.dialogGiveUp ? loadDialog(enc.dialogGiveUp) : null;
    const dialog = await loadDialog(won ? enc.dialogRematch : enc.dialogBefore);
    this.states.push(new DialogState(this, dialog, async () => {
      const { def, patterns } = await enemy;
      this.states.change(new BattleState(this, {
        def,
        patterns,
        giveUp: await giveUp,
        onEnd: (outcome, score) => this.afterBattle(enc, outcome, score),
      }));
    }));
  }

  talk(npc) {
    this.states.push(new TalkState(this, npc));
  }

  // 負けたらマップの開始地点から、HP を満タンにしてやり直し（仮。セーブポイントができたらそこへ）
  async afterBattle(enc, outcome, score) {
    const s = this.session;
    const { from, to } = setTotalScore(this, s.totalScore + score);
    if (outcome === 'win') {
      s.flags[enc.id] = true;
    } else {
      const [i, j, dir] = s.map.start;
      s.player = { i, j, dir };
      s.hero.hp = s.hero.maxHp;
      cure(s.hero);
    }
    const dialog = await loadDialog(outcome === 'win' ? enc.dialogWin : enc.dialogLose);
    this.states.change(new FieldState(this));
    this.states.push(new DialogState(this, dialog, () => { if (to > from) this.levelUp(to); }));
  }

  levelUp(level) {
    this.sfx.play('levelup');
    this.states.push(new DialogState(this, {
      lines: [{ text: `レベルが ${level} に上がった！` }, { text: `最大HPが ${this.session.hero.maxHp} になった` }],
    }));
  }
}
