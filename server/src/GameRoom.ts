import { GAME } from '../../shared/constants';
import type { MatchState, PlayerState, Team } from '../../shared/types';
import { WEAPONS, type WeaponId } from '../../shared/weapons';

interface RuntimePlayer extends PlayerState {
  fireAt: number;
  reloadUntil: number;
  plantStarted: number | null;
  defuseStarted: number | null;
  abilityReadyAt: number[];
}

const obstacles = [
  { x: 0, z: 0, halfX: 2.5, halfZ: 2.5 },
  { x: -14, z: -9, halfX: 2, halfZ: 3 },
  { x: 14, z: 9, halfX: 2, halfZ: 3 },
  { x: -22, z: 12, halfX: 4, halfZ: 1 },
  { x: 22, z: -12, halfX: 4, halfZ: 1 },
];

export class GameRoom {
  private readonly players = new Map<string, RuntimePlayer>();
  private phase: MatchState['phase'] = 'lobby';
  private round = 0;
  private attackersScore = 0;
  private defendersScore = 0;
  private secondsLeft = GAME.roundSeconds;
  private objective: MatchState['objective'] = 'none';
  private objectivePosition: MatchState['objectivePosition'] = null;
  private message = 'Waiting for players';
  private elapsed = 0;
  private nextSnapshotAt = 0;

  constructor(private readonly publish: (message: string, event: 'kill' | 'round' | 'info') => void = () => {}) {}

  get size(): number { return this.players.size; }

  publicPlayers(): PlayerState[] {
    return [...this.players.values()].map(({ fireAt: _fireAt, reloadUntil: _reloadUntil, plantStarted: _plantStarted, defuseStarted: _defuseStarted, abilityReadyAt: _abilityReadyAt, ...player }) => player);
  }

  matchState(): MatchState {
    return {
      phase: this.phase,
      round: this.round,
      attackersScore: this.attackersScore,
      defendersScore: this.defendersScore,
      secondsLeft: Math.max(0, Math.ceil(this.secondsLeft)),
      objective: this.objective,
      objectivePosition: this.objectivePosition,
      message: this.message,
    };
  }

  join(id: string, name: string): PlayerState | null {
    if (this.players.size >= GAME.maxPlayers || [...this.players.values()].some((player) => player.name.toLowerCase() === name.toLowerCase())) return null;
    const attackers = [...this.players.values()].filter((player) => player.team === 'attackers').length;
    const defenders = this.players.size - attackers;
    const team: Team = attackers <= defenders ? 'attackers' : 'defenders';
    const spawn = team === 'attackers' ? { x: -34, z: (attackers * 3) - 4 } : { x: 34, z: (defenders * 3) - 4 };
    const player: RuntimePlayer = {
      id, name, team, x: spawn.x, y: 0, z: spawn.z, yaw: team === 'attackers' ? Math.PI / 2 : -Math.PI / 2, pitch: 0,
      health: GAME.maxHealth, armor: 0, alive: true, weapon: 'sidearm', ammo: WEAPONS.sidearm.magazineSize,
      reserveAmmo: WEAPONS.sidearm.reserveAmmo, credits: 800, kills: 0, deaths: 0, assists: 0,
      lastInputSequence: 0, fireAt: 0, reloadUntil: 0, plantStarted: null, defuseStarted: null, abilityReadyAt: [0, 0, 0, 0],
    };
    this.players.set(id, player);
    if (this.players.size >= 2 && this.phase === 'lobby') this.startRound();
    return this.publicPlayer(player);
  }

  remove(id: string): void {
    this.players.delete(id);
    if (this.players.size < 2 && this.phase !== 'lobby' && this.phase !== 'matchEnd') {
      this.phase = 'lobby';
      this.message = 'Waiting for players';
    }
  }

  input(id: string, data: { sequence: number; forward: number; strafe: number; yaw: number; pitch: number; sprint: boolean; crouch: boolean }): void {
    const player = this.players.get(id);
    if (!player || !player.alive || data.sequence <= player.lastInputSequence) return;
    player.lastInputSequence = data.sequence;
    player.yaw = data.yaw;
    player.pitch = data.pitch;
    const speed = GAME.movementSpeed * (data.crouch ? GAME.crouchMultiplier : data.sprint ? GAME.sprintMultiplier : 1);
    const forward = Math.max(-1, Math.min(1, data.forward));
    const strafe = Math.max(-1, Math.min(1, data.strafe));
    const length = Math.hypot(forward, strafe) || 1;
    const dt = 1 / GAME.tickRate;
    const dx = (Math.sin(player.yaw) * forward + Math.cos(player.yaw) * strafe) * speed * dt / length;
    const dz = (Math.cos(player.yaw) * forward - Math.sin(player.yaw) * strafe) * speed * dt / length;
    this.move(player, dx, dz);
  }

  shoot(id: string, yaw: number, pitch: number, now = Date.now()): boolean {
    const shooter = this.players.get(id);
    if (!shooter || !shooter.alive || (this.phase !== 'combat' && this.phase !== 'planted') || now < shooter.fireAt || now < shooter.reloadUntil) return false;
    const weapon = WEAPONS[shooter.weapon];
    if (shooter.ammo <= 0) return false;
    shooter.fireAt = now + 1000 / weapon.fireRate;
    shooter.ammo -= 1;
    const direction = { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
    let nearest: { player: RuntimePlayer; distance: number; headshot: boolean } | undefined;
    for (const target of this.players.values()) {
      if (!target.alive || target.team === shooter.team || target.id === shooter.id) continue;
      const center = { x: target.x - shooter.x, y: 1.05 - (shooter.y + 1.55), z: target.z - shooter.z };
      const along = center.x * direction.x + center.y * direction.y + center.z * direction.z;
      if (along < 0 || along > weapon.range) continue;
      const closest = { x: direction.x * along, y: direction.y * along, z: direction.z * along };
      const miss = Math.hypot(center.x - closest.x, center.y - closest.y, center.z - closest.z);
      if (miss < GAME.playerRadius + weapon.spread * along && (!nearest || along < nearest.distance)) {
        nearest = { player: target, distance: along, headshot: direction.y > 0.12 };
      }
    }
    if (nearest) this.damage(shooter, nearest.player, weapon.damage * (nearest.headshot ? weapon.headMultiplier : weapon.bodyMultiplier), nearest.headshot);
    return true;
  }

  reload(id: string, now = Date.now()): void {
    const player = this.players.get(id);
    if (!player || !player.alive || player.ammo >= WEAPONS[player.weapon].magazineSize || player.reserveAmmo <= 0 || now < player.reloadUntil) return;
    const weapon = WEAPONS[player.weapon];
    player.reloadUntil = now + weapon.reloadTime * 1000;
    setTimeout(() => {
      if (!this.players.has(id) || !player.alive) return;
      const count = Math.min(weapon.magazineSize - player.ammo, player.reserveAmmo);
      player.ammo += count;
      player.reserveAmmo -= count;
      player.reloadUntil = 0;
    }, weapon.reloadTime * 1000);
  }

  buy(id: string, item: WeaponId | 'armor'): boolean {
    const player = this.players.get(id);
    if (!player || this.phase !== 'buy' || !player.alive) return false;
    if (item === 'armor') {
      if (player.armor >= GAME.maxArmor || player.credits < 600) return false;
      player.credits -= 600;
      player.armor = GAME.maxArmor;
      return true;
    }
    const weapon = WEAPONS[item];
    if (item === 'knife' || player.credits < weapon.cost) return false;
    player.credits -= weapon.cost;
    player.weapon = item;
    player.ammo = weapon.magazineSize;
    player.reserveAmmo = weapon.reserveAmmo;
    return true;
  }

  setObjective(id: string, kind: 'plant' | 'defuse', active: boolean): void {
    const player = this.players.get(id);
    if (!player || !player.alive) return;
    if (kind === 'plant' && player.team === 'attackers' && this.phase === 'combat' && this.objective === 'carried' && this.nearSite(player)) {
      player.plantStarted = active ? (player.plantStarted ?? this.elapsed) : null;
    }
    if (kind === 'defuse' && player.team === 'defenders' && this.phase === 'planted' && this.nearObjective(player)) {
      player.defuseStarted = active ? (player.defuseStarted ?? this.elapsed) : null;
    }
  }

  useAbility(id: string, slot: number): boolean {
    const player = this.players.get(id);
    if (!player || !player.alive || this.phase !== 'combat' && this.phase !== 'planted' || slot < 0 || slot > 3) return false;
    const readyAt = player.abilityReadyAt[slot] ?? 0;
    if (this.elapsed < readyAt) return false;
    player.abilityReadyAt[slot] = this.elapsed + [12, 18, 22, 60][slot]!;
    this.publish(`${player.name} used ability ${slot + 1}`, 'info');
    return true;
  }

  tick(dt: number): void {
    this.elapsed += dt;
    if (this.phase === 'buy') {
      this.secondsLeft -= dt;
      if (this.secondsLeft <= 0) this.beginCombat();
    } else if (this.phase === 'combat' || this.phase === 'planted') {
      this.secondsLeft -= dt;
      this.updateObjective();
      this.checkElimination();
      if (this.phase === 'combat' && this.secondsLeft <= 0) this.finishRound('defenders', 'Time expired');
    } else if (this.phase === 'intermission') {
      this.secondsLeft -= dt;
      if (this.secondsLeft <= 0) this.startRound();
    }
  }

  snapshotDue(): boolean {
    if (this.elapsed < this.nextSnapshotAt) return false;
    this.nextSnapshotAt = this.elapsed + 1 / GAME.snapshotRate;
    return true;
  }

  private damage(attacker: RuntimePlayer, target: RuntimePlayer, amount: number, headshot: boolean): void {
    let damage = amount;
    if (!headshot && target.armor > 0) {
      const absorbed = Math.min(target.armor, damage * 0.5);
      target.armor -= absorbed;
      damage -= absorbed;
    }
    target.health = Math.max(0, target.health - Math.round(damage));
    if (target.health <= 0) {
      target.alive = false;
      target.deaths += 1;
      attacker.kills += 1;
      attacker.credits += 200;
      this.publish(`${attacker.name} eliminated ${target.name}${headshot ? ' (headshot)' : ''}`, 'kill');
      this.checkElimination();
    }
  }

  private move(player: RuntimePlayer, dx: number, dz: number): void {
    const nextX = Math.max(-GAME.mapBounds, Math.min(GAME.mapBounds, player.x + dx));
    const nextZ = Math.max(-GAME.mapBounds, Math.min(GAME.mapBounds, player.z + dz));
    if (!obstacles.some((wall) => Math.abs(nextX - wall.x) < wall.halfX + GAME.playerRadius && Math.abs(player.z - wall.z) < wall.halfZ + GAME.playerRadius)) player.x = nextX;
    if (!obstacles.some((wall) => Math.abs(player.x - wall.x) < wall.halfX + GAME.playerRadius && Math.abs(nextZ - wall.z) < wall.halfZ + GAME.playerRadius)) player.z = nextZ;
  }

  private updateObjective(): void {
    for (const player of this.players.values()) {
      if (player.plantStarted !== null && this.elapsed - player.plantStarted >= GAME.plantSeconds) {
        player.plantStarted = null;
        this.objective = 'planted';
        this.phase = 'planted';
        this.objectivePosition = { x: player.x, z: player.z };
        this.secondsLeft = GAME.deviceSeconds;
        this.publish(`${player.name} planted the device`, 'round');
      }
      if (player.defuseStarted !== null && this.elapsed - player.defuseStarted >= GAME.defuseSeconds) {
        player.defuseStarted = null;
        this.objective = 'defused';
        this.finishRound('defenders', `${player.name} defused the device`);
      }
    }
    if (this.phase === 'planted' && this.secondsLeft <= 0) {
      this.objective = 'exploded';
      this.finishRound('attackers', 'Device detonated');
    }
  }

  private checkElimination(): void {
    if (this.phase !== 'combat' && this.phase !== 'planted') return;
    const alive = [...this.players.values()].filter((player) => player.alive);
    const defendersAlive = alive.some((player) => player.team === 'defenders');
    const attackersAlive = alive.some((player) => player.team === 'attackers');
    if (!defendersAlive) this.finishRound('attackers', 'Defenders eliminated');
    else if (!attackersAlive && this.phase !== 'planted') this.finishRound('defenders', 'Attackers eliminated');
  }

  private finishRound(winner: Team, reason: string): void {
    if (this.phase === 'intermission' || this.phase === 'matchEnd' || this.phase === 'lobby') return;
    if (winner === 'attackers') this.attackersScore += 1;
    else this.defendersScore += 1;
    for (const player of this.players.values()) {
      if (player.team === winner) player.credits += 3000;
      else player.credits += 1900;
    }
    this.message = `${winner === 'attackers' ? 'Attackers' : 'Defenders'} win — ${reason}`;
    this.publish(this.message, 'round');
    const score = Math.max(this.attackersScore, this.defendersScore);
    const tied = this.attackersScore === this.defendersScore;
    if (score >= GAME.roundsToWin && !tied || score >= GAME.roundsToWin + GAME.maxOvertimeRounds && tied) {
      this.phase = 'matchEnd';
      return;
    }
    this.phase = 'intermission';
    this.secondsLeft = GAME.intermissionSeconds;
  }

  private startRound(): void {
    this.round += 1;
    this.phase = 'buy';
    this.objective = 'carried';
    this.objectivePosition = null;
    this.secondsLeft = GAME.buyPhaseSeconds;
    this.message = `Round ${this.round} — buy phase`;
    for (const player of this.players.values()) {
      player.alive = true;
      player.health = GAME.maxHealth;
      player.armor = 0;
      player.weapon = 'sidearm';
      player.ammo = WEAPONS.sidearm.magazineSize;
      player.reserveAmmo = WEAPONS.sidearm.reserveAmmo;
      player.x = player.team === 'attackers' ? -34 : 34;
      player.z = 0;
      player.y = 0;
      player.plantStarted = null;
      player.defuseStarted = null;
      player.fireAt = 0;
      player.reloadUntil = 0;
    }
    this.publish(this.message, 'round');
  }

  private beginCombat(): void {
    this.phase = 'combat';
    this.secondsLeft = GAME.roundSeconds;
    this.message = `Round ${this.round} — fight`;
    this.publish(this.message, 'round');
  }

  private nearSite(player: RuntimePlayer): boolean {
    return (Math.hypot(player.x - 23, player.z) < 7 || Math.hypot(player.x + 23, player.z) < 7);
  }

  private nearObjective(player: RuntimePlayer): boolean {
    return this.objectivePosition !== null && Math.hypot(player.x - this.objectivePosition.x, player.z - this.objectivePosition.z) < 3;
  }

  private publicPlayer(player: RuntimePlayer): PlayerState {
    const { fireAt: _fireAt, reloadUntil: _reloadUntil, plantStarted: _plantStarted, defuseStarted: _defuseStarted, abilityReadyAt: _abilityReadyAt, ...state } = player;
    return state;
  }
}
