// 図鑑。手に入れたことのあるアイテムと、出会ったことのある敵を覚えておく（session.dex）。
// 載せる敵と並び順は data/dex.json の enemies（敵のファイルは一覧を読めないので、ここに並べる）。アイテムは items.json の順
import { loadJSON } from './Data.js';

export const loadDex = () => loadJSON('data/dex.json');

function dexOf(session) {
  session.dex ??= { items: {}, enemies: {} };
  return session.dex;
}

// 一度でも手に入れたアイテム（もう持っていなくても載ったまま）
export function seeItem(session, id) {
  dexOf(session).items[id] = true;
}

// 出会った敵。戦闘の上の帯に名前が出たとき（1対1は戦闘の始め、ダンジョンは近づいたとき）
export function meetEnemy(session, id) {
  dexOf(session).enemies[id] = true;
}

export const hasSeenItem = (session, id) => !!session.dex?.items[id];
export const hasMetEnemy = (session, id) => !!session.dex?.enemies[id];
