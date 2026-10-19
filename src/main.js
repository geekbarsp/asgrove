import { Game } from './game/Game.js';

const game = new Game(document.getElementById('view'));
window.game = game;
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('loadText').textContent = 'The house refused to open: ' + e.message;
});
