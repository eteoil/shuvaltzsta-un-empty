import { Game } from './Game.js';
import { loadJSON } from './core/Data.js';

const config = await loadJSON('data/gameConfig.json');
const game = new Game(document.getElementById('screen'), document.getElementById('console'), config);
// デバッグ用。ブラウザのコンソールから状態を覗ける
window.game = game;
await game.load();
game.start();
