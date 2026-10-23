import './style.css';

import { createGame } from './game/createGame';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app game mount');
}

createGame(app);
