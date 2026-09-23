const KINDS = ['dodge', 'guard', 'attack', 'miss'];

// 直近 windowBeats 拍ぶんの行動の記録。予測も学習もしない（設計案 7）。
// 割合は保存せず、参照のたびに数えて出す
export class PlayerProfile {
  constructor(windowBeats) {
    this.windowBeats = windowBeats;
    this.log = [];
  }

  record(kind, beat) {
    if (KINDS.includes(kind)) this.log.push({ kind, beat });
  }

  prune(beat) {
    const from = beat - this.windowBeats;
    if (this.log.length && this.log[0].beat < from) this.log = this.log.filter((e) => e.beat >= from);
  }

  count(kind) {
    return this.log.reduce((n, e) => n + (e.kind === kind), 0);
  }

  get total() { return this.log.length; }
  get dodge() { return this.count('dodge'); }
  get guard() { return this.count('guard'); }
  get attack() { return this.count('attack'); }
  get miss() { return this.count('miss'); }

  get dodgeRate() { return this.total ? this.dodge / this.total : 0; }
  get guardRate() { return this.total ? this.guard / this.total : 0; }
  get attackRate() { return this.total ? this.attack / this.total : 0; }
  get missRate() { return this.total ? this.miss / this.total : 0; }
}
