// 憲法①：ゲームは必ず1つのStateだけが動作する
export const STATES = Object.freeze({
  TITLE: 'TITLE',
  TOWN: 'TOWN',
  FIELD: 'FIELD',
  DUNGEON: 'DUNGEON',
  RHYTHM_BATTLE: 'RHYTHM_BATTLE',
  SHOP: 'SHOP',
  DIALOG: 'DIALOG',
  MENU: 'MENU',
  // 憲法①の一覧には無い。カフェバイトなどのミニゲーム用（憲法への追加は TODO.md）
  MINIGAME: 'MINIGAME',
});
