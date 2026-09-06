import { Game } from './game.js';

const game = new Game(document.getElementById('game'));
window.__g = game;
game.start();
