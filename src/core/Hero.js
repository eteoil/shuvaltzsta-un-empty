// 主人公の HP と毒の変化。探索（秒）と戦闘（拍）のどちらから呼んでも同じ結果になるよう、ここにまとめる。
// 数値は gameConfig の status.poison と cheat（憲法⑯）

// 毒を1回ぶん進める。毒では倒れない（HP は 1 残る）。
// チートモードでは cheat.poisonTicks 回で自然に治る。戻り値は { damage, cured }
export function poisonTick(game, damage) {
  const hero = game.session.hero;
  const n = Math.min(damage, hero.hp - 1);
  hero.hp -= n;
  hero.poisonTicks = (hero.poisonTicks ?? 0) + 1;
  const cured = game.options.cheat && hero.poisonTicks >= game.config.cheat.poisonTicks;
  if (cured) cure(hero);
  return { damage: n, cured };
}

export function poison(hero) {
  hero.poisoned = true;
  hero.poisonTicks = 0;
}

export function cure(hero) {
  hero.poisoned = false;
  hero.poisonTicks = 0;
}

// 食べ物の継続回復（ドラゴンフライ）。hero.regen = { left: 残りの回数, rate: [分子, 分母]（最大HPに対する1回の回復量） }。
// 食べ直すと回数が元に戻る（重ねがけはしない）
export function startRegen(hero, { rate, ticks }) {
  hero.regen = { left: ticks, rate };
}

// 継続回復を1回ぶん進める。戻り値は回復した量。回数を使い切ったら終わる
export function regenStep(hero) {
  const r = hero.regen;
  if (!r) return 0;
  const n = Math.min(Math.max(1, Math.round((hero.maxHp * r.rate[0]) / r.rate[1])), hero.maxHp - hero.hp);
  hero.hp += n;
  r.left -= 1;
  if (r.left <= 0) hero.regen = null;
  return n;
}

// チートモードの自動回復。戻り値は回復した量
export function regen(game, amount) {
  const hero = game.session.hero;
  if (!game.options.cheat) return 0;
  const n = Math.min(amount, hero.maxHp - hero.hp);
  hero.hp += n;
  return n;
}

// チートモードでは敵へのダメージが cheat.attackMultiplier 倍
export function attackMultiplier(game) {
  return game.options.cheat ? game.config.cheat.attackMultiplier : 1;
}
