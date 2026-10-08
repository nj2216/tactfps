import type { ClientMessage, ServerMessage } from './types';
import type { WeaponId } from './weapons';

export const PROTOCOL_VERSION = 1;

export function parseClientMessage(data: string): ClientMessage | null {
  try {
    const value: unknown = JSON.parse(data);
    if (!value || typeof value !== 'object' || !('type' in value)) return null;
    const message = value as Record<string, unknown>;
    switch (message.type) {
      case 'join':
        if (typeof message.name === 'string' && message.version === PROTOCOL_VERSION) {
          return { type: 'join', name: message.name.slice(0, 18).trim(), version: 1 };
        }
        return null;
      case 'input':
        if (typeof message.sequence === 'number' && typeof message.forward === 'number' && typeof message.strafe === 'number' &&
            typeof message.yaw === 'number' && typeof message.pitch === 'number') {
          return {
            type: 'input',
            sequence: message.sequence,
            forward: clamp(message.forward, -1, 1),
            strafe: clamp(message.strafe, -1, 1),
            yaw: clamp(message.yaw, -Math.PI, Math.PI),
            pitch: clamp(message.pitch, -Math.PI / 2, Math.PI / 2),
            sprint: message.sprint === true,
            crouch: message.crouch === true,
          };
        }
        return null;
      case 'shoot':
        if (typeof message.yaw === 'number' && typeof message.pitch === 'number') {
          return { type: 'shoot', yaw: clamp(message.yaw, -Math.PI, Math.PI), pitch: clamp(message.pitch, -Math.PI / 2, Math.PI / 2) };
        }
        return null;
      case 'reload':
        return { type: 'reload' };
      case 'buy':
        if (['sidearm', 'smg', 'rifle', 'shotgun', 'sniper', 'knife', 'armor'].includes(String(message.item))) {
          return { type: 'buy', item: message.item as WeaponId | 'armor' };
        }
        return null;
      case 'plant':
      case 'defuse':
        if (typeof message.active === 'boolean') return { type: message.type, active: message.active };
        return null;
      case 'ability':
        if (typeof message.slot === 'number') return { type: 'ability', slot: message.slot };
        return null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function encodeServerMessage(message: ServerMessage): string {
  return JSON.stringify(message);
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : 0;
}
