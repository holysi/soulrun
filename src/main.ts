import './style.css';

import { createGame } from './game/createGame';
import { installTestApi } from './game/testing/installTestApi';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('Missing #app game mount');
}

const game = createGame(app);
installTestApi(game);
