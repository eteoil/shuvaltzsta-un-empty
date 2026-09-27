// 所持品とアイテムの効果。アイテムの中身は data/items.json（憲法⑨）。
// 効果はデータのフィールドの組み合わせで決まる：heal / damage / poison / cure / buff / outcomes
import { loadJSON } from './Data.js';

export const loadItems = () => loadJSON('data/items.json');

export const money = (n) => `${n.toLocaleString('en-US')}$`;

const part = ([num, den], max) => Math.max(1, Math.round((max * num) / den));

export function count(session, id) {
  return session.items[id] ?? 0;
}

export function addItem(session, id, n = 1) {
  session.items[id] = count(session, id) + n;
}

export function takeItem(session, id) {
  if (!count(session, id)) return false;
  session.items[id] -= 1;
  if (!session.items[id]) delete session.items[id];
  return true;
}

// アイテムを使う。battle は戦闘中なら BattleState、探索中なら null。
// 戻り値の lines は画面に出すメッセージ
export function useItem(items, session, id, battle = null) {
  const def = items[id];
  if (def.battleOnly && !battle) return { used: false, lines: ['戦闘中にしか使えない'] };
  if (def.heal && session.hero.hp >= session.hero.maxHp) return { used: false, lines: ['HPはまんたんだ'] };
  if (!takeItem(session, id)) return { used: false, lines: [] };
  const lines = [`${def.name}を使った`];
  let effect = def;
  if (def.outcomes) {
    const pick = def.outcomes[Math.floor(Math.random() * def.outcomes.length)];
    effect = items[pick];
    lines.push(`${effect.name}だった！`);
  }
  const hero = session.hero;
  if (effect.heal) {
    const n = Math.min(part(effect.heal, hero.maxHp), hero.maxHp - hero.hp);
    hero.hp += n;
    lines.push(`HPが${n}回復した`);
  }
  if (effect.damage) {
    // アイテムでは倒れない（HP は 1 残る）
    const n = Math.min(part(effect.damage, hero.maxHp), hero.hp - 1);
    hero.hp -= n;
    lines.push(`${n}のダメージ！`);
  }
  if (effect.poison && !hero.poisoned) {
    hero.poisoned = true;
    battle?.startHeroPoison();
    lines.push('毒におかされた');
  }
  if (effect.cure === 'poison') {
    lines.push(hero.poisoned ? '毒が消えた' : 'なにも起きなかった');
    hero.poisoned = false;
  }
  if (effect.buff) {
    battle.addBuff(effect);
    lines.push(effect.buff === 'needle' ? 'しばらく攻撃が2マス先まで届き、毒を与える' : 'しばらく攻撃がすべて PERFECT になる');
  }
  return { used: true, lines };
}
