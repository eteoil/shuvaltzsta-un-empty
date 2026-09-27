// レベル。総スコア（session.totalScore）だけから決まり、レベルそのものはどこにも持たない（憲法⑧）。
// 数値は gameConfig の level（憲法⑯）

export function levelOf(config, score) {
  const L = config.level;
  return Math.min(L.max, 1 + Math.floor(score / L.scorePerLevel));
}

// そのレベルになる最小の総スコア
export function scoreFor(config, level) {
  return (level - 1) * config.level.scorePerLevel;
}

export function maxHpOf(config, level) {
  return config.battle.player.hp + (level - 1) * config.level.hpPerLevel;
}

// 総スコアを変えるときは必ずここを通す。最大HPを合わせ、増えたぶんは今のHPにも足す。
// 戻り値は変わる前と後のレベル
export function setTotalScore(game, score) {
  const { config, session: s } = game;
  const from = levelOf(config, s.totalScore);
  s.totalScore = Math.max(0, score);
  const to = levelOf(config, s.totalScore);
  const max = maxHpOf(config, to);
  s.hero.hp = Math.max(1, Math.min(max, s.hero.hp + max - s.hero.maxHp));
  s.hero.maxHp = max;
  return { from, to };
}

// エンディングの分岐に使う（エンディングはまだ無い）
export function avoidsBadEnd(config, session) {
  return levelOf(config, session.totalScore) >= config.level.badEndAvoidLevel;
}
