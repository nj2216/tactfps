export type WeaponId = 'sidearm' | 'smg' | 'rifle' | 'shotgun' | 'sniper' | 'knife';

export interface WeaponDefinition {
  id: WeaponId;
  name: string;
  damage: number;
  fireRate: number;
  magazineSize: number;
  reserveAmmo: number;
  reloadTime: number;
  range: number;
  spread: number;
  cost: number;
  headMultiplier: number;
  bodyMultiplier: number;
  legMultiplier: number;
}

export const WEAPONS: Record<WeaponId, WeaponDefinition> = {
  sidearm: { id: 'sidearm', name: 'P-8 Sidearm', damage: 28, fireRate: 3.2, magazineSize: 12, reserveAmmo: 48, reloadTime: 1.4, range: 45, spread: 0.012, cost: 0, headMultiplier: 2.2, bodyMultiplier: 1, legMultiplier: 0.8 },
  smg: { id: 'smg', name: 'Kestrel SMG', damage: 19, fireRate: 10, magazineSize: 30, reserveAmmo: 90, reloadTime: 1.8, range: 35, spread: 0.035, cost: 1200, headMultiplier: 1.8, bodyMultiplier: 1, legMultiplier: 0.8 },
  rifle: { id: 'rifle', name: 'AR-4 Rifle', damage: 32, fireRate: 7.5, magazineSize: 25, reserveAmmo: 75, reloadTime: 2, range: 65, spread: 0.018, cost: 2700, headMultiplier: 2, bodyMultiplier: 1, legMultiplier: 0.75 },
  shotgun: { id: 'shotgun', name: 'Breach Shotgun', damage: 12, fireRate: 1.2, magazineSize: 8, reserveAmmo: 32, reloadTime: 2.2, range: 18, spread: 0.09, cost: 1800, headMultiplier: 1.5, bodyMultiplier: 1, legMultiplier: 0.8 },
  sniper: { id: 'sniper', name: 'Longview Rifle', damage: 85, fireRate: 0.8, magazineSize: 5, reserveAmmo: 20, reloadTime: 2.5, range: 100, spread: 0.004, cost: 4500, headMultiplier: 2, bodyMultiplier: 1, legMultiplier: 0.75 },
  knife: { id: 'knife', name: 'Field Knife', damage: 50, fireRate: 1.5, magazineSize: 1, reserveAmmo: 0, reloadTime: 0, range: 2.2, spread: 0.3, cost: 0, headMultiplier: 1, bodyMultiplier: 1, legMultiplier: 1 },
};
