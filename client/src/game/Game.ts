import * as THREE from 'three';
import { GAME } from '../../../shared/constants';
import type { MatchState, PlayerState, ServerMessage } from '../../../shared/types';
import { WEAPONS, type WeaponId } from '../../../shared/weapons';
import { animateCharacter, createCharacter } from '../assets/CharacterFactory';
import { buildMap } from '../assets/EnvironmentFactory';
import { NetworkClient } from '../networking/NetworkClient';

interface RemoteEntity {
  model: THREE.Group;
  target: THREE.Vector3;
  state: PlayerState;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class Game {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(82, window.innerWidth / window.innerHeight, 0.08, 180);
  private readonly renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  private readonly localModel = new THREE.Group();
  private readonly remotes = new Map<string, RemoteEntity>();
  private readonly keys = new Set<string>();
  private readonly network: NetworkClient;
  private playerId = '';
  private local: PlayerState | undefined;
  private match: MatchState | undefined;
  private sequence = 0;
  private yaw = Math.PI / 2;
  private pitch = 0;
  private x = -34;
  private z = 0;
  private lastFrame = performance.now();
  private noticeTimer = 0;
  private firing = false;
  private buyOpen = false;
  private scoreboardOpen = false;
  private readonly weaponModel = new THREE.Group();
  private readonly objectiveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.42, 0.35), new THREE.MeshStandardMaterial({ color: 0xe6bd67, emissive: 0x4c3210 }));

  constructor(network: NetworkClient) {
    this.network = network;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.id = 'view';
    $('game').append(this.renderer.domElement);
    buildMap(this.scene);
    this.camera.rotation.order = 'YXZ';
    this.camera.add(this.weaponModel);
    this.makeFirstPersonWeapon();
    this.scene.add(this.objectiveMesh);
    this.objectiveMesh.visible = false;
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    this.renderer.domElement.addEventListener('click', this.lockPointer);
    document.addEventListener('pointerlockchange', this.pointerLockChanged);
    document.addEventListener('mousemove', this.mouseMove);
    document.addEventListener('mousedown', this.mouseDown);
    document.addEventListener('mouseup', this.mouseUp);
    window.setInterval(() => this.sendInput(), 1000 / 60);
    requestAnimationFrame(this.frame);
  }

  handle(message: ServerMessage): void {
    if (message.type === 'welcome') {
      this.playerId = message.id;
      this.match = message.match;
      this.updatePlayers(message.players);
      $('menu').setAttribute('hidden', '');
      $('hud').removeAttribute('hidden');
      this.notify(`Joined as ${this.local?.team ?? 'player'} — click to lock mouse`);
    } else if (message.type === 'snapshot') {
      this.match = message.match;
      this.updatePlayers(message.players);
      this.updateHud();
    } else if (message.type === 'event') {
      const feed = $('feed');
      const line = document.createElement('div');
      line.textContent = message.message;
      feed.prepend(line);
      window.setTimeout(() => line.remove(), 5500);
      if (message.event === 'round') this.notify(message.message);
    } else if (message.type === 'error') {
      this.notify(message.message);
      $('status').textContent = message.message;
    }
  }

  private readonly frame = (now: number) => {
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    if (this.local && document.pointerLockElement === this.renderer.domElement) this.predictMovement(dt);
    this.updateRender(now / 1000, dt);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };

  private predictMovement(dt: number): void {
    const forward = Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS'));
    const strafe = Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA'));
    const crouch = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    const speed = GAME.movementSpeed * (crouch ? GAME.crouchMultiplier : this.keys.has('ShiftLeft') ? GAME.sprintMultiplier : 1);
    const length = Math.hypot(forward, strafe) || 1;
    const dx = (Math.sin(this.yaw) * forward + Math.cos(this.yaw) * strafe) * speed * dt / length;
    const dz = (Math.cos(this.yaw) * forward - Math.sin(this.yaw) * strafe) * speed * dt / length;
    this.x = Math.max(-GAME.mapBounds, Math.min(GAME.mapBounds, this.x + dx));
    this.z = Math.max(-GAME.mapBounds, Math.min(GAME.mapBounds, this.z + dz));
  }

  private updateRender(time: number, dt: number): void {
    if (this.local) {
      const dx = this.local.x - this.x;
      const dz = this.local.z - this.z;
      if (Math.hypot(dx, dz) > 2) { this.x = this.local.x; this.z = this.local.z; }
      else { this.x += dx * Math.min(dt * 8, 1); this.z += dz * Math.min(dt * 8, 1); }
      this.camera.position.set(this.x, 1.62, this.z);
      this.camera.rotation.set(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
      this.weaponModel.position.y = -0.26 + (this.firing ? -0.09 : 0);
      this.weaponModel.rotation.x = this.firing ? -0.08 : 0;
    }
    for (const [id, remote] of this.remotes) {
      remote.model.position.lerp(remote.target, Math.min(dt * 12, 1));
      remote.model.rotation.y = remote.state.yaw;
      animateCharacter(remote.model, time, remote.model.position.distanceTo(remote.target) > 0.04);
      remote.model.visible = remote.state.alive;
      if (!remote.state.alive) remote.model.rotation.z = Math.PI / 2;
      else remote.model.rotation.z = 0;
      if (!this.remotes.has(id)) this.scene.remove(remote.model);
    }
    this.objectiveMesh.visible = Boolean(this.match?.objectivePosition && (this.match.phase === 'planted'));
    if (this.match?.objectivePosition) this.objectiveMesh.position.set(this.match.objectivePosition.x, 0.4, this.match.objectivePosition.z);
  }

  private updatePlayers(players: PlayerState[]): void {
    for (const player of players) {
      if (player.id === this.playerId) {
        this.local = player;
        if (this.sequence === 0) { this.x = player.x; this.z = player.z; this.yaw = player.yaw; }
        continue;
      }
      let remote = this.remotes.get(player.id);
      if (!remote) {
        const model = createCharacter(player.team, players.indexOf(player));
        this.scene.add(model);
        remote = { model, target: new THREE.Vector3(player.x, player.y, player.z), state: player };
        this.remotes.set(player.id, remote);
      }
      remote.state = player;
      remote.target.set(player.x, player.y, player.z);
    }
    for (const [id, remote] of this.remotes) {
      if (!players.some((player) => player.id === id)) {
        this.scene.remove(remote.model);
        this.remotes.delete(id);
      }
    }
    this.updateHud();
  }

  private updateHud(): void {
    if (!this.local || !this.match) return;
    $('round').textContent = `ROUND ${this.match.round} · ${this.match.phase.toUpperCase()}`;
    $('score').textContent = `${this.match.attackersScore} — ${this.match.defendersScore}`;
    $('clock').textContent = `${Math.floor(this.match.secondsLeft / 60).toString().padStart(2, '0')}:${(this.match.secondsLeft % 60).toString().padStart(2, '0')}`;
    $('health').textContent = `${this.local.health}`;
    $('armor').textContent = this.local.armor ? `ARMOR ${this.local.armor}` : '';
    $('credits').textContent = `¢${this.local.credits}`;
    $('weapon').textContent = WEAPONS[this.local.weapon].name;
    $('ammo').textContent = `${this.local.ammo} / ${this.local.reserveAmmo}`;
    $('objective').textContent = this.match.objective === 'planted' ? 'DEVICE ACTIVE · DEFUSE OR HOLD' : this.match.phase === 'combat' ? 'ATTACKERS: PLANT AT SITE · DEFENDERS: HOLD' : '';
    $('roster').innerHTML = this.local ? this.rosterHtml() : '';
    if (this.match.phase !== 'buy' && this.buyOpen) this.toggleBuy(false);
    if (this.buyOpen) this.renderShop();
    if (this.scoreboardOpen) this.renderScoreboard();
  }

  private rosterHtml(): string {
    if (!this.local) return '';
    const players = [...this.remotes.values()].filter((entry) => entry.state.team === this.local!.team);
    return `<b>${this.local.team.toUpperCase()}</b><br>${players.map(({ state }) => `${state.alive ? '●' : '×'} ${escapeHtml(state.name)} ${state.kills}/${state.deaths}`).join('<br>')}`;
  }

  private sendInput(): void {
    if (!this.local || document.pointerLockElement !== this.renderer.domElement) return;
    this.network.send({
      type: 'input', sequence: ++this.sequence,
      forward: Number(this.keys.has('KeyW')) - Number(this.keys.has('KeyS')),
      strafe: Number(this.keys.has('KeyD')) - Number(this.keys.has('KeyA')),
      yaw: this.yaw, pitch: this.pitch,
      sprint: this.keys.has('ShiftLeft'), crouch: this.keys.has('ControlLeft') || this.keys.has('ControlRight'),
    });
  }

  private readonly keyDown = (event: KeyboardEvent) => {
    this.keys.add(event.code);
    if (!this.local || event.repeat) return;
    if (event.code === 'KeyR') this.network.send({ type: 'reload' });
    if (event.code === 'KeyB') this.toggleBuy(!this.buyOpen);
    if (event.code === 'Tab') { event.preventDefault(); this.scoreboardOpen = true; $('scoreboard').removeAttribute('hidden'); this.renderScoreboard(); }
    if (event.code === 'KeyF') this.network.send({ type: this.local.team === 'attackers' ? 'plant' : 'defuse', active: true });
    if (['KeyQ', 'KeyE', 'KeyC', 'KeyX'].includes(event.code)) this.network.send({ type: 'ability', slot: ['KeyQ', 'KeyE', 'KeyC', 'KeyX'].indexOf(event.code) });
    if (event.code === 'Digit1') this.network.send({ type: 'buy', item: 'rifle' });
    if (event.code === 'Digit2') this.network.send({ type: 'buy', item: 'sidearm' });
    if (event.code === 'Escape' && !document.pointerLockElement) $('menu').removeAttribute('hidden');
  };

  private readonly keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === 'Tab') { this.scoreboardOpen = false; $('scoreboard').setAttribute('hidden', ''); }
    if (event.code === 'KeyF' && this.local) this.network.send({ type: this.local.team === 'attackers' ? 'plant' : 'defuse', active: false });
  };

  private readonly mouseMove = (event: MouseEvent) => {
    if (document.pointerLockElement !== this.renderer.domElement) return;
    const sensitivity = Number(localStorage.getItem('sensitivity') ?? 0.0022);
    this.yaw -= event.movementX * sensitivity;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch - event.movementY * sensitivity));
  };

  private readonly mouseDown = (event: MouseEvent) => {
    if (event.button !== 0 || document.pointerLockElement !== this.renderer.domElement || !this.local?.alive) return;
    this.firing = true;
    this.network.send({ type: 'shoot', yaw: this.yaw, pitch: this.pitch });
    this.playShot();
    this.showTracer();
  };

  private readonly mouseUp = () => { this.firing = false; };
  private readonly lockPointer = () => {
    if (!this.local) return;
    this.renderer.domElement.requestPointerLock().catch(() => this.notify('Pointer lock was blocked. Click the game canvas again.'));
  };
  private readonly pointerLockChanged = () => { if (!document.pointerLockElement && this.local) this.notify('Click the game to resume. Press Esc to release the mouse.'); };
  private readonly resize = () => {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  private toggleBuy(show: boolean): void {
    this.buyOpen = Boolean(show && this.match?.phase === 'buy');
    $('buy').toggleAttribute('hidden', !this.buyOpen);
    if (this.buyOpen) this.renderShop();
  }

  private renderShop(): void {
    if (!this.local) return;
    $('buy-credits').textContent = `AVAILABLE CREDITS: ¢${this.local.credits}`;
    const items: Array<[string, WeaponId | 'armor', number]> = [
      ['P-8 Sidearm', 'sidearm', 0], ['Kestrel SMG', 'smg', WEAPONS.smg.cost], ['AR-4 Rifle', 'rifle', WEAPONS.rifle.cost],
      ['Breach Shotgun', 'shotgun', WEAPONS.shotgun.cost], ['Longview Sniper', 'sniper', WEAPONS.sniper.cost], ['Armor Vest', 'armor', 600],
    ];
    $('shop').innerHTML = items.map(([name, id, cost]) => `<div class="shop-item"><span>${name}<br><b>¢${cost}</b></span><button data-item="${id}" ${cost > this.local!.credits || (id === 'armor' && this.local!.armor >= GAME.maxArmor) ? 'disabled' : ''}>${this.local!.weapon === id ? 'EQUIPPED' : 'BUY'}</button></div>`).join('');
    $('shop').querySelectorAll<HTMLButtonElement>('button[data-item]').forEach((button) => button.addEventListener('click', () => {
      const item = button.dataset.item as WeaponId | 'armor';
      this.network.send({ type: 'buy', item });
    }, { once: true }));
  }

  private renderScoreboard(): void {
    if (!this.local) return;
    const players = [this.local, ...[...this.remotes.values()].map((entry) => entry.state)];
    const teams: Array<[string, typeof players]> = [['ATTACKERS', players.filter((player) => player.team === 'attackers')], ['DEFENDERS', players.filter((player) => player.team === 'defenders')]];
    $('score-list').innerHTML = teams.map(([team, members]) => `<div class="team-title">${team}</div>${members.map((player) => `<div class="score-row"><span>${escapeHtml(player.name)}${player.alive ? '' : ' ×'}</span><span>${player.kills}</span><span>${player.deaths}</span><span>¢${player.credits}</span></div>`).join('')}`).join('');
  }

  private makeFirstPersonWeapon(): void {
    const metal = new THREE.MeshStandardMaterial({ color: 0x334441, metalness: 0.35, roughness: 0.55, flatShading: true });
    const grip = new THREE.MeshStandardMaterial({ color: 0x20292a, roughness: 0.9 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, position: THREE.Vector3) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      this.weaponModel.add(mesh);
    };
    add(new THREE.BoxGeometry(0.18, 0.17, 0.58), metal, new THREE.Vector3(0.28, -0.1, -0.58));
    add(new THREE.CylinderGeometry(0.035, 0.035, 0.24, 6), metal, new THREE.Vector3(0.28, -0.07, -0.94));
    add(new THREE.BoxGeometry(0.12, 0.25, 0.14), grip, new THREE.Vector3(0.28, -0.28, -0.43));
    this.weaponModel.position.set(0.38, -0.26, -0.62);
    this.weaponModel.scale.setScalar(0.9);
  }

  private showTracer(): void {
    const direction = new THREE.Vector3(Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.yaw)).normalize();
    const start = this.camera.position.clone().add(direction.clone().multiplyScalar(0.6));
    const end = start.clone().add(direction.multiplyScalar(24));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([start, end]), new THREE.LineBasicMaterial({ color: 0xf2d189, transparent: true, opacity: 0.75 }));
    this.scene.add(line);
    window.setTimeout(() => { this.scene.remove(line); line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, 80);
  }

  private playShot(): void {
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(150, context.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(45, context.currentTime + 0.08);
      gain.gain.setValueAtTime(0.06, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.09);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.09);
      oscillator.onended = () => void context.close();
    } catch { /* Audio is optional; gameplay remains available when browser audio is blocked. */ }
  }

  private notify(message: string): void {
    const node = $('notice');
    node.textContent = message;
    window.clearTimeout(this.noticeTimer);
    this.noticeTimer = window.setTimeout(() => { node.textContent = ''; }, 2600);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}
