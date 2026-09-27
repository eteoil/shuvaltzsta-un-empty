import { STATES } from '../core/constants.js';
import { loadEnemy, loadJSON, loadMap } from '../core/Data.js';
import { COLORS, text, panel, sprite, gauge, isoTop, isoCenter } from '../core/draw.js';
import { loadItems, money, addItem } from '../core/Items.js';
import { poisonTick, regen } from '../core/Hero.js';
import { drawPickup, drawExit, drawObject, objectHeight } from '../core/icons.js';
import { Pickups } from '../core/Pickups.js';
import { passTime, isNight, isOpen } from '../core/Calendar.js';
import { DIRS, FACE_STEP } from '../core/grid.js';

// 探索。リズム入力は受け付けない（憲法③）。町のマップ（kind: town）では TOWN として動く。
// 町に落ちている物は無い（特別なイベントのときだけ、マップに pickups を書く）
export class FieldState {
  name = STATES.FIELD;
  pausable = true;

  constructor(game) {
    this.game = game;
    this.session = game.session;
    this.map = game.session.map;
    if (this.map.kind === 'town') this.name = STATES.TOWN;
    this.move = null;
    this.stride = 0;            // 歩いたマス数。歩きのコマ送りに使う（1マスで2コマ）
    this.poisonT = 0;           // 毒のダメージまでの経過秒（AudioContext の時刻から。憲法⑫）
    this.regenT = 0;            // チートモードの自動回復までの経過秒
    this.hurtAt = -1e9;
    this.toast = null;          // 拾ったときの一言（演出なので rAF の時刻で消す）
    this.itemDefs = null;
    // マップに入った直後は、十字キーをいったん離すまで歩かない（押したまま出口を出て、すぐ入り直さないように）
    this.waitRelease = true;
    // 暗転：着いたときは暗い画面から明るくなる（fadeIn）。出口を通るときは暗くなってから切り替える（leaving）
    this.fadeIn = game.config.field.fadeSec;
    this.leaving = null;
    this.onArrive = null;       // 明るくなりきったら一度だけ呼ぶ（戦闘後の会話など。暗いうちに出さない）
    this.enemyDefs = {};
    this.npcDefs = {};
  }

  get p() {
    return this.session.player;
  }

  enter() {
    loadItems().then((d) => { this.itemDefs = d; });
    this.destMaps = {};
    for (const e of this.map.exits ?? []) loadMap(e.to).then((m) => { this.destMaps[e.to] = m; });
    this.drops = new Pickups(this.game, this.map, (i, j) => this.nearCharacter(i, j));
    this.drops.fill();
    for (const enc of this.map.encounters) {
      loadEnemy(enc.enemy).then(({ def }) => { this.enemyDefs[enc.id] = def; });
    }
    for (const n of this.map.npcs ?? []) {
      loadJSON(`data/npcs/${n.id}.json`).then((def) => { this.npcDefs[n.id] = def; });
    }
  }

  npcAt(i, j) {
    return this.presentNpcs().find((n) => n.at[0] === i && n.at[1] === j);
  }

  // 主人公・NPC・敵のいるマスと、その周り8マス。拾い物は取りにくいので置かない
  nearCharacter(i, j) {
    const people = [
      [this.p.i, this.p.j],
      ...(this.map.npcs ?? []).map((n) => n.at),
      ...this.map.encounters.flatMap((e) => e.actors.map((x) => x.at)),
    ];
    return people.some(([pi, pj]) => Math.abs(pi - i) <= 1 && Math.abs(pj - j) <= 1);
  }

  // A で拾う。乗っているマスか、向いている1歩先のマスにある物
  pickUp(fi, fj) {
    const p = this.drops.at(this.p.i, this.p.j) ?? this.drops.at(fi, fj);
    if (!p || !this.itemDefs) return false;
    addItem(this.session, p.item);
    this.drops.take(p);
    this.toast = { text: `${this.itemDefs[p.item].name}を拾った`, at: performance.now() };
    this.game.sfx.play('confirm');
    return true;
  }

  exitAt(i, j) {
    return (this.map.exits ?? []).find((e) => e.at[0] === i && e.at[1] === j) ?? null;
  }

  get night() {
    return isNight(this.game.config, this.session.minute);
  }

  // このマップが営業中か（hours が無ければいつでも）
  get open() {
    return isOpen(this.map.hours, this.session.minute);
  }

  // 出口の行き先が営業中か。行き先のマップは enter で読んでおく（まだなら開いていることにする）
  destOpen(exit) {
    return isOpen(this.destMaps[exit.to]?.hours, this.session.minute);
  }

  // 営業時間のある場所の店の人（map の npcs で staff: true）は、時間外はいない。night: true の人は夜だけ（バーのエレナ）
  presentNpcs() {
    return (this.map.npcs ?? []).filter((n) => (!n.staff || this.open) && (!n.night || this.night));
  }

  // 出口に乗ったら行き先へ。requires のフラグ（勝った戦闘など）が無ければ通れない。
  // 行き先のマップが営業時間外（hours の外）なら、closedText を出して入れない（薬屋）
  takeExit() {
    const exit = this.exitAt(this.p.i, this.p.j);
    if (!exit) return false;
    const locked = exit.requires && !this.session.flags[exit.requires] ? exit.locked
      : exit.closedText && !this.destOpen(exit) ? exit.closedText : null;
    if (locked) {
      this.toast = { text: locked, at: performance.now() };
      this.game.sfx.play('miss');
      return false;
    }
    this.game.sfx.play('steps');
    this.leaving = { exit, t: 0, gone: false };
    return true;
  }

  // 暗くなりきったら次のマップへ
  updateLeaving(dt) {
    const l = this.leaving;
    l.t += dt;
    if (l.gone || l.t < this.game.config.field.fadeSec) return;
    l.gone = true;
    this.game.enterMap(l.exit.to, l.exit.spawn);
  }

  // 暗転の暗さ（0〜1）
  get darkness() {
    const fade = this.game.config.field.fadeSec;
    if (this.leaving) return Math.min(1, this.leaving.t / fade);
    return Math.max(0, this.fadeIn / fade);
  }

  isFloor(i, j) {
    return this.map.floor[j]?.[i] === '#';
  }

  encounterAt(i, j) {
    return this.map.encounters.find((e) => e.actors.some((a) => a.at[0] === i && a.at[1] === j));
  }

  walkable(i, j) {
    return this.isFloor(i, j) && !this.encounterAt(i, j) && !this.npcAt(i, j);
  }

  update(dt, presses) {
    if (this.leaving) { this.updateLeaving(dt); return; }   // 出口を通って暗くなっている間と、次のマップを読み込んでいる間
    this.fadeIn = Math.max(0, this.fadeIn - dt);
    if (this.fadeIn === 0 && this.onArrive) {
      const arrive = this.onArrive;
      this.onArrive = null;
      arrive();
      return;
    }
    passTime(this.session, dt * this.game.config.time.minutesPerSec);
    for (const { btn } of presses) {
      if (btn === 'pause' || btn === 'start') { this.game.pause(); return; }
      if (btn === 'a' && !this.move) {
        const d = FACE_STEP[this.p.dir];
        const [fi, fj] = [this.p.i + d.di, this.p.j + d.dj];
        const enc = this.encounterAt(fi, fj);
        if (enc) { this.trigger(enc); return; }
        const npc = this.npcAt(fi, fj);
        if (npc && this.npcDefs[npc.id]) {
          this.game.sfx.play('confirm');
          this.game.talk(this.npcDefs[npc.id]);
          return;
        }
        this.pickUp(fi, fj);
      }
    }

    this.poisonTick(dt);
    this.regenTick(dt);
    this.drops.tick(dt);

    if (this.move) {
      const step = dt / this.game.config.field.moveSecPerTile;
      this.move.t += step;
      this.stride += step;
      if (this.move.t < 1) return;
      [this.p.i, this.p.j] = this.move.to;
      this.move = null;
      if (this.takeExit()) return;
    }

    const btn = Object.keys(DIRS).find((b) => this.game.input.isDown(b));
    if (this.waitRelease) {
      if (btn) return;
      this.waitRelease = false;
    }
    if (!btn) return;
    const d = DIRS[btn];
    this.p.dir = d.face;
    const ni = this.p.i + d.di;
    const nj = this.p.j + d.dj;
    // ぶつかっても話しかけはしない。向きだけ変わるので、A で話しかける
    if (this.walkable(ni, nj)) {
      this.move = { from: [this.p.i, this.p.j], to: [ni, nj], t: 0 };
      this.game.sfx.play('step');
    }
  }

  // 探索中も毒なら fieldTickSec 秒ごとに減る。毒では倒れない（HP は 1 残る）
  poisonTick(dt) {
    const hero = this.session.hero;
    if (!hero.poisoned) { this.poisonT = 0; return; }
    const { fieldTickSec, fieldDamage } = this.game.config.status.poison;
    this.poisonT += dt;
    while (hero.poisoned && this.poisonT >= fieldTickSec) {
      this.poisonT -= fieldTickSec;
      const { damage, cured } = poisonTick(this.game, fieldDamage);
      if (cured) this.toast = { text: '毒が消えた', at: performance.now() };
      if (!damage) continue;
      this.hurtAt = performance.now();
      this.game.sfx.play('telegraph');
    }
  }

  // チートモードでは fieldRegenSec 秒ごとに HP が戻る
  regenTick(dt) {
    if (!this.game.options.cheat) { this.regenT = 0; return; }
    const { fieldRegenSec, fieldRegen } = this.game.config.cheat;
    this.regenT += dt;
    while (this.regenT >= fieldRegenSec) {
      this.regenT -= fieldRegenSec;
      regen(this.game, fieldRegen);
    }
  }

  trigger(enc) {
    this.game.sfx.play('confirm');
    this.game.runEncounter(enc);
  }

  render(g) {
    const { config, assets } = this.game;
    const W = config.screen.width;
    const H = config.screen.height;
    const floorDef = assets.def('floor');
    const floorImg = assets.get('floor', 'default');
    const tile = floorDef.tile;

    let pi = this.p.i;
    let pj = this.p.j;
    if (this.move) {
      const t = Math.min(1, this.move.t);
      pi = this.move.from[0] + (this.move.to[0] - this.move.from[0]) * t;
      pj = this.move.from[1] + (this.move.to[1] - this.move.from[1]) * t;
    }
    // プレイヤーが画面の中ほどに来るようにカメラを合わせる
    const ox = Math.round(W / 2 - (pi - pj) * tile[0] / 2);
    const oy = Math.round(232 - tile[1] / 2 - (pi + pj) * tile[1] / 2);

    g.fillStyle = '#12142a';
    g.fillRect(0, 0, W, H);

    const rows = this.map.floor.length;
    const cols = this.map.floor[0].length;
    for (let s = 0; s <= rows + cols - 2; s++) {
      for (let i = 0; i < cols; i++) {
        const j = s - i;
        if (j < 0 || j >= rows || !this.isFloor(i, j)) continue;
        const p = isoTop(i, j, ox, oy, tile);
        if (p.x < -tile[0] || p.x > W + tile[0] || p.y > H || p.y < -floorDef.size[1]) continue;
        sprite(g, floorImg, floorDef, p.x, p.y);
      }
    }

    // 出口と拾い物は床の上なので、人より先に描く
    for (const e of this.map.exits ?? []) {
      const pos = isoCenter(e.at[0], e.at[1], ox, oy, tile);
      const open = this.destOpen(e);
      const closed = (e.requires && !this.session.flags[e.requires]) || (e.closedText && !open);
      drawExit(g, pos.x, pos.y, this.night && open && e.nightLabel ? e.nightLabel : e.label, performance.now(), closed);
    }
    for (const p of this.drops.spots) {
      const pos = isoCenter(p.at[0], p.at[1], ox, oy, tile);
      drawPickup(g, p.item, pos.x, pos.y, performance.now());
    }

    const people = [{ sprite: 'player', frame: this.p.dir, anim: this.move ? 'walk' : null, n: Math.floor(this.stride * 2), palette: null, i: pi, j: pj }];
    for (const enc of this.map.encounters) {
      const def = this.enemyDefs[enc.id];
      if (!def) continue;
      for (const a of enc.actors) {
        const actor = def.actors.find((x) => x.id === a.id);
        people.push({ sprite: actor.sprite, frame: a.dir, anim: null, n: 0, palette: actor.palette, i: a.at[0], j: a.at[1] });
      }
    }
    for (const n of this.presentNpcs()) {
      const def = this.npcDefs[n.id];
      if (def) people.push({ sprite: def.sprite, object: def.object, frame: n.dir, anim: null, n: 0, palette: def.palette, i: n.at[0], j: n.at[1], label: def.name });
    }
    people.sort((a, b) => a.i + a.j - (b.i + b.j));
    for (const c of people) {
      const pos = isoCenter(c.i, c.j, ox, oy, tile);
      // ベッドなどの家具は NPC と同じ扱いで、絵だけコードで描く
      if (c.object) { drawObject(g, c.object, pos.x, pos.y); continue; }
      g.fillStyle = 'rgba(11,12,24,0.45)';
      g.beginPath();
      g.ellipse(pos.x, pos.y, 22, 8, 0, 0, Math.PI * 2);
      g.fill();
      const { img, def } = assets.pose(c.sprite, c.frame, c.anim, c.n, c.palette);
      sprite(g, img, def, pos.x, pos.y);
    }
    // 名前はほかのキャラに隠れないよう、全員を描いたあとに
    for (const c of people) {
      if (!c.label) continue;
      const pos = isoCenter(c.i, c.j, ox, oy, tile);
      const height = c.object ? objectHeight(c.object) : assets.def(c.sprite).anchor[1];
      // 奥にいる人の名前が上の帯（HP・所持金）に重ならないよう、帯より下に収める
      text(g, c.label, pos.x, Math.max(30, pos.y - height - 16), { size: 12, align: 'center', color: COLORS.brass });
    }

    // 夜は少し暗く（演出）
    if (this.night) {
      g.fillStyle = 'rgba(10,14,40,0.38)';
      g.fillRect(0, 0, W, H);
    }

    // 毒で減った瞬間は画面が紫に光る（演出）
    const hurt = performance.now() - this.hurtAt;
    if (hurt < 180) {
      g.fillStyle = `rgba(196,107,255,${0.22 * (1 - hurt / 180)})`;
      g.fillRect(0, 0, W, H);
    }

    g.fillStyle = 'rgba(11,12,24,0.55)';
    g.fillRect(0, 0, W, 26);
    text(g, this.night && this.open && this.map.nightName ? this.map.nightName : this.map.name, 8, 5);
    const hero = this.session.hero;
    text(g, 'HP', 236, 5, { color: COLORS.signal });
    gauge(g, 262, 9, 90, 9, hero.hp / hero.maxHp, COLORS.signal);
    if (hero.poisoned) text(g, '毒', 358, 5, { color: COLORS.unguard });
    text(g, money(this.session.money), W - 8, 5, { align: 'right', color: COLORS.perfect });

    const age = this.toast ? performance.now() - this.toast.at : Infinity;
    if (age < 1600) {
      const w = [...this.toast.text].length * 16 + 32;
      panel(g, W / 2 - w / 2, 34, w, 32, { alpha: age > 1300 ? (1600 - age) / 300 : 1 });
      text(g, this.toast.text, W / 2, 42, { align: 'center', alpha: age > 1300 ? (1600 - age) / 300 : 1 });
    }
    if (this.darkness > 0) {
      g.fillStyle = `rgba(0,0,0,${this.darkness})`;
      g.fillRect(0, 0, W, H);
    }
  }
}
