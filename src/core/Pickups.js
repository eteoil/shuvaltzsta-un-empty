import { eventsOf } from './Calendar.js';

// マップに落ちている物。町（FieldState）とダンジョン（DungeonState）で共通。
// 置き方はマップの pickups：count 個（天赦日は gameConfig の restDay.pickupRate 倍）を、table（[アイテム, 重み]）の重みで選んで空いている床へランダムに。
// 状態は session.pickups[マップid] = { spots: [{ item, at }], waits: [秒] }。
// 拾うと waits に pickupRespawnSec を積み、0 になったら別の場所に1つ置き直す。
// 町のマップには pickups を書かない（特別なイベントのときだけ書く）。
// 敵が落とした物（drop）も同じ場所に置くが、count には数えず、拾っても置き直さない
export class Pickups {
  // blocked(i, j)：置いてはいけないマス（人のそばなど）なら true
  constructor(game, map, blocked) {
    this.game = game;
    this.map = map;
    this.def = map.pickups ?? null;
    this.blocked = blocked;
    const all = game.session.pickups;
    all[map.id] ??= { spots: [], waits: [] };
    this.state = all[map.id];
  }

  get spots() {
    return this.state.spots;
  }

  fill() {
    if (!this.def) return;
    const s = this.state;
    const placed = () => s.spots.filter((p) => !p.drop).length + s.waits.length;
    const rest = eventsOf(this.game.calendar, this.game.session.day).rest;
    const count = this.def.count * (rest ? this.game.config.restDay.pickupRate : 1);
    while (placed() < count && this.spawn()) { /* 置けるだけ置く */ }
  }

  // 敵が倒れたマスに落とす
  drop(item, at) {
    this.state.spots.push({ item, at, drop: true });
  }

  spawn() {
    const free = [];
    this.map.floor.forEach((row, j) => [...row].forEach((c, i) => {
      if (c === '#' && !this.at(i, j) && !this.blocked(i, j)) free.push([i, j]);
    }));
    if (!free.length) return false;
    const { table } = this.def;
    const total = table.reduce((sum, [, w]) => sum + w, 0);
    let r = Math.random() * total;
    const [item] = table.find(([, w]) => (r -= w) < 0) ?? table[0];
    this.state.spots.push({ item, at: free[Math.floor(Math.random() * free.length)] });
    return true;
  }

  at(i, j) {
    return this.spots.find((p) => p.at[0] === i && p.at[1] === j) ?? null;
  }

  // 拾った物を取り除き、次に現れるまでの秒を積む
  take(p) {
    this.state.spots.splice(this.state.spots.indexOf(p), 1);
    if (!p.drop) this.state.waits.push(this.game.config.field.pickupRespawnSec);
  }

  // dt は AudioContext の時刻から出した秒（憲法⑫）
  tick(dt) {
    if (!this.def) return;
    const s = this.state;
    s.waits = s.waits.map((w) => w - dt);
    const due = s.waits.filter((w) => w <= 0).length;
    s.waits = s.waits.filter((w) => w > 0);
    for (let k = 0; k < due; k++) this.spawn();
  }
}
