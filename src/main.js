import { Game } from './Game.js';
import { loadJSON } from './core/Data.js';
import { fitScreen } from './core/fitScreen.js';

const config = await loadJSON('data/gameConfig.json');
fitScreen(document.getElementById('screen'));
const game = new Game(document.getElementById('screen'), document.getElementById('console'), config);
// デバッグ用。ブラウザのコンソールから状態を覗ける
window.game = game;
await game.load();
game.start();
