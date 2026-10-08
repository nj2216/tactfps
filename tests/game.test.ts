import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME } from '../shared/constants';
import { parseClientMessage } from '../shared/protocol';
import { WEAPONS } from '../shared/weapons';
import { GameRoom } from '../server/src/GameRoom';

test('team assignment balances players and rejects duplicate names', () => {
  const room = new GameRoom();
  assert.equal(room.join('a', 'Alpha')?.team, 'attackers');
  assert.equal(room.join('b', 'Bravo')?.team, 'defenders');
  assert.equal(room.join('c', 'Charlie')?.team, 'attackers');
  assert.equal(room.join('d', 'ALPHA'), null);
});

test('server rejects invalid purchase and permits valid buy-phase purchase', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  const player = room.publicPlayers().find((entry) => entry.id === 'a')!;
  assert.equal(room.buy('a', 'rifle'), false);
  assert.equal(room.buy('a', 'armor'), true);
  assert.equal(room.publicPlayers().find((entry) => entry.id === 'a')?.armor, GAME.maxArmor);
  assert.equal(player.credits, 200);
});

test('movement packets are sequence checked and kept within the arena', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  const initial = room.publicPlayers()[0]!;
  room.input('a', { sequence: 2, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false });
  const moved = room.publicPlayers().find((entry) => entry.id === 'a')!;
  assert.ok(moved.x > initial.x);
  room.input('a', { sequence: 1, forward: -1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false });
  assert.equal(room.publicPlayers().find((entry) => entry.id === 'a')?.x, moved.x);
});

test('shooting spends ammo, enforces fire rate, and applies authoritative damage', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  room.tick(GAME.buyPhaseSeconds);
  let sequence = 0;
  for (let i = 0; i < 200; i += 1) {
    room.input('a', { sequence: ++sequence, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false });
  }
  const initialHealth = room.publicPlayers().find((player) => player.id === 'b')!.health;
  assert.equal(room.shoot('a', Math.PI / 2, 0, 100_000), true);
  assert.equal(room.shoot('a', Math.PI / 2, 0, 100_000), false);
  assert.ok(room.publicPlayers().find((player) => player.id === 'b')!.health < initialHealth);
  assert.equal(room.publicPlayers().find((player) => player.id === 'a')!.ammo, WEAPONS.sidearm.magazineSize - 1);
});

test('protocol rejects malformed messages and bounds client movement input', () => {
  assert.equal(parseClientMessage('{broken'), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'buy', item: 'credits' })), null);
  const input = parseClientMessage(JSON.stringify({
    type: 'input', sequence: 1, forward: 50, strafe: -50, yaw: 0, pitch: 0, sprint: true, crouch: false,
  }));
  assert.equal(input?.type, 'input');
  if (input?.type === 'input') {
    assert.equal(input.forward, 1);
    assert.equal(input.strafe, -1);
  }
});
