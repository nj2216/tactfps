import './styles.css';
import { NetworkClient } from './networking/NetworkClient';
import { Game } from './game/Game';

const nameInput = document.getElementById('name') as HTMLInputElement;
const hostInput = document.getElementById('host') as HTMLInputElement;
const portInput = document.getElementById('port') as HTMLInputElement;
const status = document.getElementById('status')!;
const joinButton = document.getElementById('join') as HTMLButtonElement;
hostInput.value = location.hostname || '127.0.0.1';

let network: NetworkClient | undefined;
let game: Game | undefined;
joinButton.addEventListener('click', () => {
  const name = nameInput.value.trim();
  const host = hostInput.value.trim();
  const port = Number(portInput.value);
  if (!name || !host || !Number.isInteger(port) || port < 1 || port > 65535) {
    status.textContent = 'Enter a player name, server IP, and valid port.';
    return;
  }
  joinButton.disabled = true;
  status.textContent = 'Connecting to LAN server…';
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  network?.close();
  network = new NetworkClient(`${scheme}://${host}:${port}`, (message) => game?.handle(message), (message) => {
    status.textContent = message;
    if (message.startsWith('Unable') || message.startsWith('Disconnected')) {
      joinButton.disabled = false;
      document.getElementById('menu')?.removeAttribute('hidden');
    }
  });
  if (game) game.setNetwork(network);
  else game = new Game(network);
  network.send({ type: 'join', name, version: 1 });
});

document.getElementById('close-buy')?.addEventListener('click', () => {
  document.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyB' }));
});
