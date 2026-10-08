import * as THREE from 'three';

export function buildMap(scene: THREE.Scene): void {
  const materials = {
    ground: new THREE.MeshStandardMaterial({ color: 0x56685f, roughness: 1 }),
    wall: new THREE.MeshStandardMaterial({ color: 0x899087, roughness: 0.95, flatShading: true }),
    dark: new THREE.MeshStandardMaterial({ color: 0x46534f, roughness: 1, flatShading: true }),
    crate: new THREE.MeshStandardMaterial({ color: 0x9c7953, roughness: 1, flatShading: true }),
    siteA: new THREE.MeshStandardMaterial({ color: 0x8b6750, roughness: 1 }),
    siteB: new THREE.MeshStandardMaterial({ color: 0x507d70, roughness: 1 }),
  };
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), materials.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const box = (x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  // Perimeter walls leave gates at both team spawns.
  box(0, 2, -43, 90, 4, 2, materials.wall);
  box(0, 2, 43, 90, 4, 2, materials.wall);
  box(-43, 2, 0, 2, 4, 86, materials.wall);
  box(43, 2, 0, 2, 4, 86, materials.wall);
  // Modular lane dividers form three routes between the two sides.
  for (const z of [-17, 17]) {
    box(-15, 1.5, z, 24, 3, 1.2, materials.dark);
    box(15, 1.5, z, 24, 3, 1.2, materials.dark);
    box(0, 1.5, z, 8, 3, 1.2, materials.dark);
  }
  box(0, 1.6, 0, 5, 3.2, 5, materials.dark);
  for (const [x, z, color] of [[-23, -4, materials.siteA], [23, 4, materials.siteB]] as const) {
    const site = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.08, 6), color);
    site.position.set(x, 0.06, z);
    site.receiveShadow = true;
    scene.add(site);
    box(x - 8, 1.2, z, 1, 2.4, 11, materials.wall);
    box(x + 8, 1.2, z, 1, 2.4, 11, materials.wall);
  }
  for (const [x, z] of [[-14, -9], [14, 9], [-22, 12], [22, -12], [-29, 5], [29, -5], [-4, 10], [4, -10]]) {
    box(x, 0.8, z, 3.4, 1.6, 3.4, materials.crate);
  }
  const light = new THREE.HemisphereLight(0xd5e9d9, 0x364039, 2.1);
  scene.add(light);
  const sun = new THREE.DirectionalLight(0xffe5c2, 2);
  sun.position.set(-20, 35, -15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  scene.background = new THREE.Color(0x9ab4a5);
  scene.fog = new THREE.Fog(0x9ab4a5, 58, 100);
}
