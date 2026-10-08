import * as THREE from 'three';
import type { Team } from '../../../shared/types';

export function createCharacter(team: Team, variant: number): THREE.Group {
  const group = new THREE.Group();
  const colors = team === 'attackers' ? [0xd98e52, 0xd05850, 0xe0bc68, 0xa87752] : [0x55a99a, 0x4d7fa3, 0x72b765, 0x7282bd];
  const cloth = new THREE.MeshStandardMaterial({ color: colors[variant % colors.length]!, roughness: 0.9, flatShading: true });
  const armor = new THREE.MeshStandardMaterial({ color: team === 'attackers' ? 0x6d5544 : 0x304845, roughness: 0.85, flatShading: true });
  const skin = new THREE.MeshStandardMaterial({ color: [0xb98564, 0xd5a17e, 0x875b48, 0xd1b091][variant % 4]!, flatShading: true });
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(new THREE.BoxGeometry(0.72, 0.8, 0.38), armor, 0, 1.15, 0);
  add(new THREE.BoxGeometry(0.76, 0.22, 0.4), cloth, 0, 0.68, 0);
  add(new THREE.BoxGeometry(0.55, 0.52, 0.49), cloth, 0, 1.83, 0);
  add(variant % 2 === 0 ? new THREE.SphereGeometry(0.24, 8, 6) : new THREE.BoxGeometry(0.4, 0.4, 0.4), skin, 0, 2.42, 0);
  add(new THREE.BoxGeometry(0.52, 0.13, 0.48), armor, 0, 2.57, 0);
  for (const side of [-1, 1]) {
    const leg = add(new THREE.BoxGeometry(0.24, 0.68, 0.3), cloth, side * 0.2, 0.36, 0);
    leg.userData.limb = 'leg';
    leg.userData.side = side;
    const arm = add(new THREE.BoxGeometry(0.2, 0.65, 0.25), armor, side * 0.49, 1.28, 0);
    arm.userData.limb = 'arm';
    arm.userData.side = side;
  }
  return group;
}

export function animateCharacter(group: THREE.Group, time: number, moving: boolean): void {
  const swing = moving ? Math.sin(time * 9) * 0.35 : 0;
  for (const child of group.children) {
    if (child.userData.limb === 'leg') child.rotation.x = swing * Number(child.userData.side);
    if (child.userData.limb === 'arm') child.rotation.x = -swing * Number(child.userData.side);
  }
}
