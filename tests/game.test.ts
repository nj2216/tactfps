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
  assert.equal(room.buy('a', 'rifle'), false);
  assert.equal(room.buy('a', 'armor'), true);
  const player = room.publicPlayers().find((entry) => entry.id === 'a')!;
  assert.equal(player.armor, GAME.maxArmor);
  assert.equal(player.credits, 200);
});

test('movement packets are sequence checked and kept within the arena', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  const initial = room.publicPlayers()[0]!;
  room.input('a', { sequence: 2, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  const moved = room.publicPlayers().find((entry) => entry.id === 'a')!;
  assert.ok(moved.x > initial.x);
  room.input('a', { sequence: 1, forward: -1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  assert.equal(room.publicPlayers().find((entry) => entry.id === 'a')?.x, moved.x);
});

test('server simulates jump arcs and returns players to ground', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  room.input('a', { sequence: 1, forward: 0, strafe: 0, yaw: 0, pitch: 0, sprint: false, crouch: false, jump: true });
  room.tick(0.1);
  assert.ok(room.publicPlayers().find((entry) => entry.id === 'a')!.y > 0);
  room.tick(2);
  assert.equal(room.publicPlayers().find((entry) => entry.id === 'a')!.y, 0);
});

test('round timer awards the defenders when the objective is not planted', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  room.tick(GAME.buyPhaseSeconds);
  room.tick(GAME.roundSeconds);
  assert.equal(room.matchState().phase, 'intermission');
  assert.equal(room.matchState().defendersScore, 1);
});

test('attackers can plant and defenders can complete a defuse', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  room.tick(GAME.buyPhaseSeconds);
  let attackerSequence = 0;
  for (let i = 0; i < 100; i += 1) {
    room.input('a', { sequence: ++attackerSequence, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  room.setObjective('a', 'plant', true);
  room.tick(GAME.plantSeconds);
  assert.equal(room.matchState().phase, 'planted');
  let defenderSequence = 0;
  for (let i = 0; i < 40; i += 1) {
    room.input('b', { sequence: ++defenderSequence, forward: 0, strafe: -1, yaw: -Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  for (let i = 0; i < 480; i += 1) {
    room.input('b', { sequence: ++defenderSequence, forward: 1, strafe: 0, yaw: -Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  for (let i = 0; i < 40; i += 1) {
    room.input('b', { sequence: ++defenderSequence, forward: 0, strafe: 1, yaw: -Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  room.setObjective('b', 'defuse', true);
  room.tick(GAME.defuseSeconds);
  assert.equal(room.matchState().phase, 'intermission');
  assert.equal(room.matchState().objective, 'defused');
  assert.equal(room.matchState().defendersScore, 1);
});

test('shooting spends ammo, enforces fire rate, and applies authoritative damage', () => {
  const room = new GameRoom();
  room.join('a', 'Alpha');
  room.join('b', 'Bravo');
  room.tick(GAME.buyPhaseSeconds);
  let sequence = 0;
  for (let i = 0; i < 60; i += 1) {
    room.input('a', { sequence: ++sequence, forward: 0, strafe: -1, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  for (let i = 0; i < 230; i += 1) {
    room.input('a', { sequence: ++sequence, forward: 1, strafe: 0, yaw: Math.PI / 2, pitch: 0, sprint: false, crouch: false, jump: false });
  }
  const initialHealth = room.publicPlayers().find((player) => player.id === 'b')!.health;
  const attacker = room.publicPlayers().find((player) => player.id === 'a')!;
  const defender = room.publicPlayers().find((player) => player.id === 'b')!;
  const aimYaw = Math.atan2(defender.x - attacker.x, defender.z - attacker.z);
  assert.equal(room.shoot('a', aimYaw, 0, 100_000), true);
  assert.equal(room.shoot('a', Math.PI / 2, 0, 100_000), false);
  assert.ok(room.publicPlayers().find((player) => player.id === 'b')!.health < initialHealth);
  assert.equal(room.publicPlayers().find((player) => player.id === 'a')!.ammo, WEAPONS.sidearm.magazineSize - 1);
});

test('protocol rejects malformed messages and bounds client movement input', () => {
  assert.equal(parseClientMessage('{broken'), null);
  assert.equal(parseClientMessage(JSON.stringify({ type: 'buy', item: 'credits' })), null);
  const input = parseClientMessage(JSON.stringify({
    type: 'input', sequence: 1, forward: 50, strafe: -50, yaw: 0, pitch: 0, sprint: true, crouch: false, jump: false,
  }));
  assert.equal(input?.type, 'input');
  if (input?.type === 'input') {
    assert.equal(input.forward, 1);
    assert.equal(input.strafe, -1);
  }
});
