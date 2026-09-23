// 敵として動く仕組み。中身（HP・Pattern・見た目）は data/enemies/*.json（憲法⑨）。
// 選択ルールは設計案 9-1 の案A（ここに条件分岐で書く）。敵が3体を超えたら敵JSONのルール表へ移す
export class Enemy {
  constructor(def, patterns) {
    this.def = def;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.patterns = patterns;
    this.history = [];
  }

  get down() {
    return this.hp <= 0;
  }

  // 見るのは HP・Beat・プレイヤーの戦闘傾向だけ。入力の先読みはしない（憲法⑤⑥）
  choosePattern(profile, random = Math.random) {
    if (!this.history.length && this.def.opening) return this.pick(this.find(this.def.opening));

    const wants = [];
    if (profile.total >= 4) {
      if (profile.dodgeRate > 0.5) wants.push('feint');     // 回避主体 → フェイント増加
      if (profile.attackRate > 0.5) wants.push('counter');  // 攻撃主体 → カウンター主体
    }
    if (this.hp / this.maxHp < 0.35) wants.push('rush');

    const tagged = (tags) => this.patterns.filter((p) => p.tags.some((t) => tags.includes(t)));
    let pool = tagged(wants);
    if (!pool.length || random() < 0.35) pool = tagged(['basic']);

    // 同じ Pattern を3回続けない
    const [a, b] = this.history.slice(-2);
    if (a && a === b && pool.length > 1) pool = pool.filter((p) => p.id !== a);

    return this.pick(pool[Math.floor(random() * pool.length)]);
  }

  find(id) {
    return this.patterns.find((p) => p.id === id);
  }

  pick(pattern) {
    this.history.push(pattern.id);
    return pattern;
  }
}
