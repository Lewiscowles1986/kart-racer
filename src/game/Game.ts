import * as THREE from 'three';
import { RENDERER, RACE, PHYS, GRID_GAP, CAMERA, TRACKS, WORLD } from '../config';
import { buildScene, Track } from '../track/track';
import { skyboxTexture } from '../util/tex';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Kart, type World } from './Kart';
import { Items } from './Items';
import { Effects } from './Effects';
import { AI } from './AI';
import { HUD } from './HUD';
import { Input } from './Input';
import { Audio } from './Audio';
import { createKartMesh } from './KartVisual';
import type { InputFrame } from './Input';

type GameState = 'MENU' | 'COUNTDOWN' | 'RACING' | 'FINISHED';

interface DriverStyle {
  name: string;
  body: number;
  accent: number;
  helmet: number;
  driver: number;
  driverStyle: string;
}

const DRIVER_STYLES: DriverStyle[] = [
  { name: 'You',   body: 0xff3b30, accent: 0xffd23f, helmet: 0xffffff, driver: 0x3b82f6, driverStyle: 'racer' },
  { name: 'Tess',  body: 0x4fd1c5, accent: 0xffffff, helmet: 0xf472b6, driver: 0x8b5cf6, driverStyle: 'tall' },
  { name: 'Marco', body: 0xf59e0b, accent: 0x111111, helmet: 0x34d399, driver: 0xf59e0b, driverStyle: 'monster' },
  { name: 'Nia',   body: 0x818cf8, accent: 0xffffff, helmet: 0xfb7185, driver: 0x22d3ee, driverStyle: 'round' },
  { name: 'Bruno', body: 0x34d399, accent: 0xffffff, helmet: 0xfbbf24, driver: 0xa3e635, driverStyle: 'big' },
  { name: 'Ivy',   body: 0xf472b6, accent: 0xffffff, helmet: 0x34d399, driver: 0xfb923c, driverStyle: 'robot' },
  { name: 'Oscar', body: 0x38bdf8, accent: 0x1e293b, helmet: 0xfacc15, driver: 0x818cf8, driverStyle: 'cap' },
  { name: 'Lulu',  body: 0xfacc15, accent: 0x1e293b, helmet: 0xfda4af, driver: 0x4ade80, driverStyle: 'round' },
];

export class Game {
  app: HTMLElement;
  world: World;
  state: GameState;
  timeMs: number;
  totalLaps: number;

  renderer!: THREE.WebGLRenderer;
  camera!: THREE.PerspectiveCamera;
  scene!: THREE.Scene;
  track!: Track;
  trackGroup!: THREE.Group;
  audio!: Audio;
  input!: Input;
  effects!: Effects;
  items!: Items;
  ai!: AI;
  hud!: HUD;
  karts!: Kart[];

  raceTimeMs: number;
  paused: boolean;
  reduceMotion: boolean;
  selectedCharacter = 0;
  selectedMap = 0;
  countdown = 0;
  countdownAccum = 0;
  clock!: THREE.Clock;
  auto = false;
  _finalLapShown = 0;
  finishWait = 0;

  constructor(app: HTMLElement) {
    this.app = app;
    this.world = this; // single facade so subsystems reach race/karts
    this.state = 'MENU';
    this.timeMs = 0;
    this.totalLaps = RACE.totalLaps;

    this.#setupRenderer();
    this.#setupScene();
    this.#buildTrack();
    this.#makeEntities();
    this.#bindGlobal();
    this.raceTimeMs = 0;
    this.paused = false;
    this.reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  #bindGlobal() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'KeyQ') this.quitToMenu();
    });
  }

  togglePause() {
    if (this.state !== 'RACING' && this.state !== 'FINISHED') return;
    this.paused = !this.paused;
    if (this.paused) { this.hud.showPause(); this.audio.stopMusic(); }
    else { this.hud.hidePause(); if (this.state !== 'FINISHED') this.audio.startMusic(); }
  }
  toggleMute() {
    this.audio.setMuted(!this.audio.muted);
  }
  quitToMenu() {
    this.paused = false;
    this.hud.hidePause();
    this.hud.hideRaceHud();
    this.state = 'MENU';
    this.hud.showMenu();
  }

  #setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = RENDERER.exposure;
    this.app.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(CAMERA.fovBase, window.innerWidth / window.innerHeight, 0.1, 900);
    this.camera.position.set(0, 14, -18);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  #setupScene() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x6fb1e8);
    scene.fog = new THREE.FogExp2(0x9ec6ec, 0.0021);

    scene.add(new THREE.HemisphereLight(0xdff1ff, 0x9fc28a, 0.5));
    const sun = new THREE.DirectionalLight(0xffe8c8, 2.6);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
    sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
    sun.shadow.camera.far = 200;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);
    // cool rim/backlight for depth
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.5);
    rim.position.set(-40, 30, -60);
    scene.add(rim);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), new THREE.MeshBasicMaterial({ map: skyboxTexture(), side: THREE.BackSide }));
    scene.add(sky);

    // Environment reflections so glossy kart/character materials look PBR-shiny
    // (RoomEnvironment gives neutral studio reflections without any HDR asset).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  #buildTrack() {
    this.track = new Track(TRACKS[this.selectedMap].points, WORLD.roadWidth);
    this.trackGroup = buildScene(this.scene, this.track);
  }

  // Rebuild the track for the currently selected map, and point every subsystem
  // (karts/items/ai) at the fresh Track so nothing keeps the old geometry.
  #rebuildTrack() {
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.geometry?.dispose();
          const m = mesh.material as THREE.Material | THREE.Material[];
          if (Array.isArray(m)) m.forEach((x) => x.dispose());
          else m?.dispose();
        }
      });
    }
    this.#buildTrack();
    for (const k of this.karts) k.track = this.track;
    if (this.items) this.items.track = this.track;
    if (this.ai) this.ai.track = this.track;
  }

  #makeEntities() {
    this.audio = new Audio();
    this.input = new Input();
    this.effects = new Effects(this.scene, 2000);
    this.items = new Items({ scene: this.scene, track: this.track, world: this });
    this.ai = new AI({ track: this.track, world: this });
    this.hud = new HUD(this.app);

    this.karts = [];
    for (let i = 0; i < RACE.kartCount; i++) {
      const style = DRIVER_STYLES[i];
      const visual = createKartMesh(style);
      this.scene.add(visual.root);
      const kart = new Kart({ index: i, name: style.name, color: style.body, accent: style.accent, track: this.track, world: this, visual });
      this.karts.push(kart);
    }

    this.hud.onStart = () => this.startRace();
    this.hud.onRestart = () => this.restart();
    this.hud.onTouch = (act, down) => this.input.setTouch(act, down);
    this.hud.onPause = () => this.togglePause();
    this.hud.onMute = () => this.toggleMute();
    this.hud.onResume = () => this.togglePause();
    this.hud.onQuit = () => this.quitToMenu();
    const GLYPHS = ['⭐', '🧢', '😈', '🎀', '🦸', '🤖', '🎩', '🌺'];
    this.hud.setMenuData(
      DRIVER_STYLES.map((s, i) => ({ name: s.name, color: '#' + s.body.toString(16).padStart(6, '0'), style: s.driverStyle, glyph: GLYPHS[i] })),
      TRACKS.map((t) => ({ id: t.id, name: t.name, color: t.color })),
    );
    this.hud.onSelectCharacter = (i) => { this.selectedCharacter = i; };
    this.hud.onSelectMap = (i) => { this.selectedMap = i; };
  }

  get player(): Kart { return this.karts[0]; }

  // Move the menu-selected character to the front so they become the player kart.
  #applyPlayerSelection() {
    const sel = this.selectedCharacter % this.karts.length;
    if (sel === 0) return;
    const [picked] = this.karts.splice(sel, 1);
    this.karts.unshift(picked);
    this.karts.forEach((k, i) => { k.isPlayer = i === 0; });
  }

  startRace() {
    this.audio.init();
    this.audio.startMusic();
    this.hud.hideOverlay();
    this.hud.showRaceHud();
    this.#applyPlayerSelection();
    this.#rebuildTrack();
    const L = this.track.totalLen;
    const lat = [-2.6, 2.6, -1.4, 1.4, -3.6, 3.6, -0.4, 0.4];
    for (let i = 0; i < this.karts.length; i++) this.karts[i].placeAt(L - i * GRID_GAP, lat[i]);
    this.countdown = 3;
    this.state = 'COUNTDOWN';
    this.hud.setCountdown('3');
    this.audio.count('3');
    this.countdownAccum = 0;
  }

  restart() {
    for (const k of this.karts) {
      k.spinning = 0; k.boostT = 0; k.shieldT = 0; k.starT = 0; k.item = null; k.speed = 0;
      k.finished = false; k.finishTime = null; k.raceTime = 0; k.rouletteT = 0; k.respawnT = 0;
    }
    this.timeMs = 0;
    this.raceTimeMs = 0;
    this.paused = false;
    this._finalLapShown = 0;
    this.items.reset();
    this.startRace();
  }

  start() {
    this.clock = new THREE.Clock();
    this.auto = new URLSearchParams(location.search).has('auto');
    if (this.auto) this.startRace();
    else { this.hud.hideRaceHud(); this.hud.showMenu(); }
    requestAnimationFrame(this.#loop);
  }

  #loop = () => {
    requestAnimationFrame(this.#loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.timeMs += dt * 1000;

    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.state === 'COUNTDOWN') {
      this.countdownAccum += dt;
      if (this.countdownAccum >= 1) {
        this.countdownAccum -= 1; this.countdown -= 1;
        if (this.countdown > 0) { this.hud.setCountdown(String(this.countdown)); this.audio.count(String(this.countdown)); }
        else { this.state = 'RACING'; this.raceTimeMs = 0; this.hud.setCountdown('GO!'); this.audio.count('GO'); setTimeout(() => this.hud.setCountdown(''), 800); }
      }
      this.#updateKarts(dt, false);
    } else if (this.state === 'RACING') {
      this.raceTimeMs += dt * 1000;
      this.#updateKarts(dt, true);
      this.#collide();
      this.#respawnCheck(dt);
      this.#finalLapCallout();
      this.#checkFinish();
      this.#finishGuarantee(dt);
    } else if (this.state === 'FINISHED') {
      this.#updateKarts(dt, true);
    }

    this.items.update(dt, this.karts);
    this.effects.update(dt);
    this.#updateCamera(dt);
    if (this.state !== 'MENU') this.#updateHud();

    if (this.audio.enabled) this.audio.engine(Math.abs(this.player.speed) / PHYS.maxSpeed, this.player.boostT > 0 || this.player.starT > 0);
    this.renderer.render(this.scene, this.camera);

    // lightweight runtime diagnostic (used by headless QA tooling)
    const d = document.getElementById('diag');
    if (d) {
      const p = this.player;
      const t = this.track.worldToTrack(p.pos, p.trackHint);
      d.textContent = JSON.stringify({ state: this.state, lap: p.lap, u: Math.round(p.prevU), lat: Math.round(t.lat), onRoad: p.onRoad, speed: Math.round(p.speed), karts: this.karts.map((k) => Math.round(k.prevU)) });
    }
  }

  #respawnCheck(dt: number) {
    const limit = RACE.respawnTimeoutMs / 1000;
    const offroad = this.track.halfWidth + 12;
    for (const k of this.karts) {
      if (k.finished) continue;
      const t = this.track.worldToTrack(k.pos, k.trackHint);
      k.trackHint = t.index;
      if (Math.abs(t.lat) > offroad) k.respawnT += dt;
      else k.respawnT = 0;
      if (k.respawnT > limit) k.respawn();
    }
  }

  #finalLapCallout() {
    const p = this.player;
    if (!p || p.finished) return;
    if (p.lap === this.totalLaps - 1 && this._finalLapShown !== this.totalLaps) {
      this._finalLapShown = this.totalLaps;
      this.hud.setCountdown('FINAL LAP!');
      this.audio.finalLap();
      setTimeout(() => this.hud.setCountdown(''), 1400);
    }
  }

  #updateKarts(dt: number, canMove: boolean) {
    for (const kart of this.karts) {
      let inp: InputFrame;
      if (kart.isPlayer) {
        this.input.resetFrame();
        inp = this.auto ? this.ai.think(kart, dt) : this.input.read();
        if (inp.itemPressed && kart.item) kart.useItem();
      } else {
        inp = this.ai.think(kart, dt);
        if (inp.itemPressed && kart.item) kart.useItem();
      }
      if (!canMove) inp = { steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false };
      kart.update(dt, inp);
    }
  }

  #collide() {
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i], b = ks[j];
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const d = Math.hypot(dx, dz);
        const min = (a.radius + b.radius) * 0.85;
        if (d < min && d > 0.001) {
          const push = (min - d) * 0.5;
          const nx = dx / d, nz = dz / d;
          a.pos.x -= nx * push; a.pos.z -= nz * push;
          b.pos.x += nx * push; b.pos.z += nz * push;
          const rel = (a.speed - b.speed) * 0.3;
          a.speed -= rel; b.speed += rel;
          // star plow: a shielded kart knocks the other one over
          const shove = new THREE.Vector3(nx, 0, nz);
          if (a.shieldT > 0 && !b.shieldT) b.hitPlow(shove);
          else if (b.shieldT > 0 && !a.shieldT) a.hitPlow(shove.clone().negate());
        }
      }
    }
  }

  #checkFinish() {
    if (this.karts.every((k) => k.finished)) this.#doFinish();
  }

  #doFinish() {
    this.state = 'FINISHED';
    this.audio.finish();
    const sorted = [...this.karts].sort((x, y) => (x.finishTime ?? Infinity) - (y.finishTime ?? Infinity));
    this.hud.showFinish(sorted.map((k) => ({ name: k.name, player: k.isPlayer, timeMs: k.finishTime! * 1000 })));
  }

  // Guarantee the race always ends: once the player crosses, wrap up stragglers.
  #finishGuarantee(dt: number) {
    if (this.state !== 'RACING' || !this.player || !this.player.finished) return;
    this.finishWait = (this.finishWait || 0) + dt;
    if (this.finishWait > 6) {
      const base = this.player.finishTime!;
      let i = 1;
      for (const k of this.karts) {
        if (!k.finished) { k.finished = true; k.finishTime = base + i * 0.6; k.speed = 0; i++; }
      }
      this.#doFinish();
    }
  }

  #updateHud() {
    if (!this.player) return;
    const ranked = [...this.karts].sort((a, b) => score(b) - score(a));
    const position = ranked.indexOf(this.player) + 1;
    this.hud.update({
      position,
      lap: Math.min(this.player.lap, this.totalLaps),
      timeMs: this.raceTimeMs,
      item: this.player.item,
      rouletteT: this.player.rouletteT,
      muted: this.audio.muted,
    });
    this.hud.setPlayerPos(this.player.pos);
    this.hud.setKartDots(this.karts.map((k) => ({ x: k.pos.x, z: k.pos.z, color: '#' + k.color.toString(16).padStart(6, '0'), isPlayer: k.isPlayer })));
    this.hud.drawMinimap();
  }

  #updateCamera(dt: number) {
    const p = this.player;
    if (!p) return;
    const forward = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const boosting = p.boostT > 0 || p.starT > 0;
    const want = p.pos.clone().addScaledVector(forward, -CAMERA.distance).setY(p.pos.y + CAMERA.height);
    this.camera.position.lerp(want, Math.min(1, CAMERA.lerp * dt));
    const look = p.pos.clone().addScaledVector(forward, CAMERA.lookAhead).setY(p.pos.y + 0.6);
    this.camera.lookAt(look);
    const fov = CAMERA.fovBase + (boosting && !this.reduceMotion ? CAMERA.fovBoost - CAMERA.fovBase : 0);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();
  }
}

function score(k: Kart): number {
  if (k.finished) return (RACE.kartCount + 1) * 1e9 + (1e9 - k.finishTime!);
  return k.lap * 1e9 + k.dist;
}
