import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { readFile, stat } from 'node:fs/promises';
import { WebSocketServer, WebSocket } from 'ws';
import { GAME } from '../../shared/constants';
import { encodeServerMessage, parseClientMessage } from '../../shared/protocol';
import type { ClientMessage, ServerMessage } from '../../shared/types';
import { GameRoom } from './GameRoom';

const host = '0.0.0.0';
const port = Number(process.env.PORT ?? 3000);
const dist = join(process.cwd(), 'dist');
const contentTypes: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const clients = new Map<WebSocket, string>();

const server = createServer(async (request, response) => {
  const requestedPath = new URL(request.url ?? '/', 'http://localhost').pathname;
  const path = normalize(join(dist, requestedPath === '/' ? 'index.html' : requestedPath));
  if (!path.startsWith(dist)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const info = await stat(path);
    const filePath = info.isDirectory() ? join(path, 'index.html') : path;
    response.writeHead(200, { 'Content-Type': contentTypes[extname(filePath)] ?? 'application/octet-stream' });
    response.end(await readFile(filePath));
  } catch {
    try {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      response.end(await readFile(join(dist, 'index.html')));
    } catch {
      response.writeHead(503, { 'Content-Type': 'text/plain' });
      response.end('Game files are not built. Run npm run build first.');
    }
  }
});

const room = new GameRoom((message, event) => broadcast({ type: 'event', message, event }));
const sockets = new WebSocketServer({ server, maxPayload: 2048 });

sockets.on('connection', (socket) => {
  let playerId: string | undefined;
  socket.on('message', (raw) => {
    const message = parseClientMessage(raw.toString());
    if (!message) {
      send(socket, { type: 'error', message: 'Invalid network message.' });
      return;
    }
    if (message.type === 'join') {
      if (playerId) return;
      if (!message.name || message.name.length > 18) {
        send(socket, { type: 'error', message: 'Enter a player name (1–18 characters).' });
        return;
      }
      const id = crypto.randomUUID();
      const player = room.join(id, message.name);
      if (!player) {
        send(socket, { type: 'error', message: 'Server full or that name is already in use.' });
        return;
      }
      playerId = id;
      clients.set(socket, id);
      send(socket, { type: 'welcome', id, players: room.publicPlayers(), match: room.matchState() });
      broadcast({ type: 'event', message: `${player.name} joined as ${player.team}.`, event: 'info' });
      return;
    }
    if (!playerId) {
      send(socket, { type: 'error', message: 'Join the match first.' });
      return;
    }
    handleMessage(playerId, message);
  });
  socket.on('close', () => {
    if (playerId) {
      const departed = room.publicPlayers().find((player) => player.id === playerId);
      room.remove(playerId);
      clients.delete(socket);
      if (departed) broadcast({ type: 'event', message: `${departed.name} disconnected.`, event: 'info' });
    }
  });
  socket.on('error', () => socket.terminate());
});

function handleMessage(id: string, message: ClientMessage): void {
  switch (message.type) {
    case 'input': room.input(id, message); break;
    case 'shoot': room.shoot(id, message.yaw, message.pitch); break;
    case 'reload': room.reload(id); break;
    case 'buy':
      if (!room.buy(id, message.item)) send(findSocket(id), { type: 'error', message: 'Purchase unavailable or insufficient credits.' });
      break;
    case 'plant': room.setObjective(id, 'plant', message.active); break;
    case 'defuse': room.setObjective(id, 'defuse', message.active); break;
    case 'ability':
      if (!room.useAbility(id, message.slot)) send(findSocket(id), { type: 'error', message: 'Ability is unavailable.' });
      break;
    case 'join': break;
  }
}

function findSocket(id: string): WebSocket | undefined {
  for (const [socket, playerId] of clients) if (playerId === id) return socket;
  return undefined;
}

function send(socket: WebSocket | undefined, message: ServerMessage): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(encodeServerMessage(message));
}

function broadcast(message: ServerMessage): void {
  const encoded = encodeServerMessage(message);
  for (const socket of clients.keys()) if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
}

setInterval(() => room.tick(1 / GAME.tickRate), 1000 / GAME.tickRate);
setInterval(() => {
  if (room.snapshotDue()) broadcast({ type: 'snapshot', timestamp: Date.now(), players: room.publicPlayers(), match: room.matchState() });
}, 1000 / GAME.snapshotRate);

server.listen(port, host, () => {
  console.log('\nLAN Tactical FPS Server\n');
  console.log(`Listening on: ${host}:${port}`);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) if (address.family === 'IPv4' && !address.internal) console.log(`LAN address: http://${address.address}:${port}`);
  }
  console.log(`Players: 0/${GAME.maxPlayers}\nWaiting for players...`);
});

process.on('SIGINT', () => {
  for (const socket of sockets.clients) socket.close(1001, 'Server shutting down');
  server.close(() => process.exit(0));
});
