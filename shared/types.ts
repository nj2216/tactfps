import type { WeaponId } from './weapons';

export type Team = 'attackers' | 'defenders';
export type RoundPhase = 'lobby' | 'buy' | 'combat' | 'planted' | 'intermission' | 'matchEnd';

export interface PlayerState {
  id: string;
  name: string;
  team: Team;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  health: number;
  armor: number;
  alive: boolean;
  weapon: WeaponId;
  ammo: number;
  reserveAmmo: number;
  credits: number;
  kills: number;
  deaths: number;
  assists: number;
  lastInputSequence: number;
}

export interface MatchState {
  phase: RoundPhase;
  round: number;
  attackersScore: number;
  defendersScore: number;
  secondsLeft: number;
  objective: 'none' | 'carried' | 'planting' | 'planted' | 'defusing' | 'defused' | 'exploded';
  objectivePosition: { x: number; z: number } | null;
  message: string;
}

export type ClientMessage =
  | { type: 'join'; name: string; version: 1 }
  | { type: 'input'; sequence: number; forward: number; strafe: number; yaw: number; pitch: number; sprint: boolean; crouch: boolean }
  | { type: 'shoot'; yaw: number; pitch: number }
  | { type: 'reload' }
  | { type: 'buy'; item: WeaponId | 'armor' }
  | { type: 'plant'; active: boolean }
  | { type: 'defuse'; active: boolean }
  | { type: 'ability'; slot: number };

export type ServerMessage =
  | { type: 'welcome'; id: string; players: PlayerState[]; match: MatchState }
  | { type: 'snapshot'; timestamp: number; players: PlayerState[]; match: MatchState }
  | { type: 'event'; message: string; event: 'kill' | 'round' | 'info' }
  | { type: 'error'; message: string };
