import * as THREE from 'three';
import { RENDERER, RACE, PHYS, GRID_GAP, CAMERA, CAMERA_MODES, TRACKS, WORLD, ITEM_BOX_PLACEMENTS, BOOST_PADS, JUMPS, type TrackDef } from '../config';
import { upsertCustomLevel } from './catalog';
import { collideKarts, respawnCheck, fabricatePodium, scoreOf } from '../sim/raceSim';
import { RacerPreview } from './RacerPreview';
import { buildScene, Track } from '../track/track';
import { skyboxTexture } from '../util/tex';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Kart, type World } from './Kart';
import { Items, type Placements } from './Items';
import { Effects } from './Effects';
import { PostStack } from './Post';
import { loadPrefs, savePrefs, motionReduced, type PrefShape, PREF_DEFAULTS } from '../prefs';
import { BroadcastTransport } from '../net/transport';
import { NetController } from '../net/NetController';
import { hashRace } from '../sim/state';
import { AI } from './AI';
import { HUD } from './HUD';
import { Input } from './Input';
import { Audio } from './Audio';
import { createKartMesh } from './KartVisual';
import { createTicker, TICK_MS } from '../sim/loop';
import { SimEventQueue } from '../sim/events';
import { Rng } from '../sim/rng';
import { EventBridge } from './EventBridge';
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
  // deterministic 120Hz simulation clock (M1 J-3); wall time only enters here
  simTicker = createTicker({ tickMs: TICK_MS, maxCatchUp: 5, onTick: (dt) => this.#simUpdate(dt) });
  // sim-visible event bus (M1 J-4): the ONLY side-channel sim code may use
  events = new SimEventQueue();
  // seeded deterministic RNG (M1 J-5): single random source for the sim
  rng: Rng;
  #eventBridge!: EventBridge;

  renderer!: THREE.WebGLRenderer;
  camera!: THREE.PerspectiveCamera;
  scene!: THREE.Scene;
  sunLight!: THREE.DirectionalLight; // M2 J-16: shadow frustum tracks the player
  post!: PostStack; // M2 J-17: bloom + vignette (null-safe fallback path)
  prefs: PrefShape = { ...PREF_DEFAULTS }; // M2 J-21: device-local settings
  net: NetController | null = null; // M3 J-26: live or null (pure single-player)
  netTick = 0;
  rngSeed = 0x5eed; // lobby-agreed race seed (host shares via START)
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
  racerPreview: RacerPreview | null = null;
  builtMap = -1; // the map the current track geometry is built for
  cameraMode = 0; // index into CAMERA_MODES
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
    // seed: ?seed=<int> (headless QA pins a seed); deterministic default so
    // two loads of the same URL produce the same item/AI stream (J-5/J-9)
    const seedParam = Number(new URLSearchParams(location.search).get('seed'));
    this.rngSeed = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : 0x5eed;
    this.rng = new Rng(this.rngSeed);
    // M2 (J-21): device-local preferences (volume/mute/camera/motion); absent
    // or corrupt storage yields defaults — prefs never block gameplay.
    this.prefs = loadPrefs(typeof localStorage !== 'undefined' ? localStorage : null);

    this.#setupRenderer();
    this.#setupScene();
    this.loadCustomLevel();
    this.#buildTrack();
    this.#makeEntities();
    this.items.setPlacements(placementsFor(this.trackCatalog[this.selectedMap])); // apply custom level's placements
    this.#bindGlobal();
    this.raceTimeMs = 0;
    this.paused = false;
    this.reduceMotion = (() => {
      try {
        return motionReduced(this.prefs, !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
      } catch {
        return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      }
    })();
    // M2 (J-21): prefs drive camera + audio defaults; camera cycles persist.
    this.cameraMode = this.prefs.camera < CAMERA_MODES.length ? this.prefs.camera : 0;
  }

  #bindGlobal() {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') this.togglePause();
      else if (e.code === 'KeyM') this.toggleMute();
      else if (e.code === 'KeyQ') this.quitToMenu();
      else if (e.code === 'KeyC') this.cycleCamera();
    });
  }

  // Cycle the player camera through the available modes, showing the new mode.
  cycleCamera() {
    if (this.cameraMode < 0) this.cameraMode = 0;
    this.cameraMode = (this.cameraMode + 1) % CAMERA_MODES.length;
    const m = CAMERA_MODES[this.cameraMode];
    this.hud && this.hud.showCameraMode(m.name);
    // M2 (J-21): remember the camera choice across sessions
    this.prefs.camera = this.cameraMode;
    savePrefs(this.prefs, typeof localStorage !== 'undefined' ? localStorage : null);
    if (this.audio) this.audio.pickup();
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
    this.#showMenuPreview();
    this.#prebuildSelectedTrack();
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
      this.post?.resize(window.innerWidth, window.innerHeight); // M2 J-17
    });
  }

  #setupScene() {
    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x6fb1e8);
    scene.fog = new THREE.FogExp2(0x9ec6ec, 0.0021);

    scene.add(new THREE.HemisphereLight(0xdff1ff, 0x9fc28a, 0.5));
    this.sunLight = new THREE.DirectionalLight(0xffe8c8, 2.6);
    this.sunLight.position.set(60, 90, 30);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.left = -60; this.sunLight.shadow.camera.right = 60;
    this.sunLight.shadow.camera.top = 60; this.sunLight.shadow.camera.bottom = -60;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.02;
    scene.add(this.sunLight);
    scene.add(this.sunLight.target); // M2 (J-16): target tracks the player
    // cool rim/backlight for depth
    const rim = new THREE.DirectionalLight(0x9fd8ff, 0.5);
    rim.position.set(-40, 30, -60);
    scene.add(rim);

    // M2 (J-17): subtle bloom on emissive moments + static vignette.
    // OFF when the user prefers reduced motion (AR-6); the PostStack itself
    // also falls back silently where WebGL2/SwiftShader can't run it.
    this.post = new PostStack({ renderer: this.renderer, scene, camera: this.camera, enabled: !this.reduceMotion });
    this.post.resize(this.renderer.domElement.width, this.renderer.domElement.height);

    const sky = new THREE.Mesh(new THREE.SphereGeometry(160, 24, 16), new THREE.MeshBasicMaterial({ map: skyboxTexture(), side: THREE.BackSide }));
    scene.add(sky);

    // Environment reflections so glossy kart/character materials look PBR-shiny
    // (RoomEnvironment gives neutral studio reflections without any HDR asset).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    pmrem.dispose();
  }

  #showMenuPreview() {
    this.#hideMenuPreview();
    const canvas = this.hud.getRacerPreviewCanvas();
    if (!canvas) return;
    this.racerPreview = new RacerPreview(canvas);
    this.#setPreviewCharacter();
  }

  // Rebuild the 3D kart shown in the menu to match the currently selected racer.
  #setPreviewCharacter() {
    if (!this.racerPreview) return;
    const s = DRIVER_STYLES[this.selectedCharacter];
    this.racerPreview.setCharacter({ bodyColor: s.body, accent: s.accent, helmet: s.helmet, driverColor: s.driver, driverStyle: s.driverStyle });
  }

  #hideMenuPreview() {
    if (this.racerPreview) { this.racerPreview.stop(); this.racerPreview = null; }
  }

  #buildTrack() {
    this.track = new Track(this.trackCatalog[this.selectedMap].points, WORLD.roadWidth);
    this.trackGroup = buildScene(this.scene, this.track, { trees: this.trackCatalog[this.selectedMap].trees });
    // HUD may not exist yet during the constructor's initial build; it is set
    // again on every rebuild (map selection / restart) once the HUD is live.
    if (this.hud) this.hud.setTrackPoints(this.trackCatalog[this.selectedMap].points);
    this.builtMap = this.selectedMap;
  }

  // Ensure the track geometry for the currently selected map is built. Building
  // it while in the menu (where it is rendered each frame behind the overlay)
  // removes the synchronous ~200ms hitch + shader compile that otherwise happens
  // the instant the user clicks Start.
  #prebuildSelectedTrack() {
    if (this.builtMap !== this.selectedMap) this.#rebuildTrack();
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
    if (this.items) { this.items.track = this.track; this.items.setPlacements(placementsFor(this.trackCatalog[this.selectedMap])); }
    if (this.ai) this.ai.track = this.track;
  }

  #makeEntities() {
    this.audio = new Audio();
    this.audio.warmup(); // create the AudioContext during load, not on Start click
    this.input = new Input();
    this.effects = new Effects(this.scene, 2000);
    this.#eventBridge = new EventBridge(this.effects, this.audio);
    this.items = new Items({ scene: this.scene, track: this.track, world: this });
    this.ai = new AI({ track: this.track, world: this });
    // QA affordance (M2): `?debug` exposes the game for headless inspection
    // (vqa/tests count scene objects; never used by gameplay code).
    if (new URLSearchParams(window.location.search).has('debug')) {
      (window as any).__kk = this;
    }
    // M3 (J-23/J-26): room-code sessions — `?room=<code>&host=1` opens a lobby
    // on a BroadcastChannel; guests just pass `?room=<code>&name=<name>`.
    const room = new URLSearchParams(window.location.search).get('room');
    if (room && typeof BroadcastChannel !== 'undefined') {
      const transport = new BroadcastTransport('tab-' + Math.random().toString(36).slice(2, 8), room);
      const params = new URLSearchParams(window.location.search);
      const isHost = params.has('host');
      this.net = new NetController(transport, 0, {
        asHost: isHost,
        localName: params.get('name') || undefined,
      });
      this.net.onStart = (seed) => this.beginNetRace(seed);
      // zero-UI lobby flow: as soon as one guest joins, the host starts
      this.net.onLobby = (players, isHost2) => {
        if (isHost2 && players.length >= 2 && this.state === 'MENU') {
          this.net?.startRace(this.rngSeed);
        }
      };
      if (!isHost) this.net.join(params.get('name') || 'guest'); // knock on the lobby
    }
    this.hud = new HUD(this.app);

    this.karts = [];
    for (let i = 0; i < RACE.kartCount; i++) {
      const style = DRIVER_STYLES[i];
      const visual = createKartMesh(style);
      // M2 (J-18): camera-facing name plate above every kart — the identity
      // cue multiplayer needs; player kart gets no plate (you know who you are).
      if (i !== 0) visual.root.add(this.#makeNamePlate(style.name, style.body));
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
    const GLYPHS = ['🥇', '🧢', '😈', '🎀', '🦸', '🤖', '🎩', '🌺'];
    this.hud.setMenuData(
      DRIVER_STYLES.map((s, i) => ({ name: s.name, color: '#' + s.body.toString(16).padStart(6, '0'), style: s.driverStyle, glyph: GLYPHS[i] })),
      this.trackCatalog.map((t) => ({ id: t.id, name: t.name, desc: t.desc, color: t.color, points: t.points })),
    );
    this.hud.onSelectCharacter = (i) => { this.selectedCharacter = i; this.#setPreviewCharacter(); };
    this.hud.onSelectMap = (i) => {
      this.selectedMap = i;
      // Pre-build the newly chosen track in the background so clicking Start
      // doesn't hitch on the synchronous build (which also warms its shaders
      // while it renders behind the menu).
      setTimeout(() => this.#prebuildSelectedTrack(), 20);
    };
  }

  get player(): Kart { return this.karts[this.net?.selfIndex ?? 0]; }

  // Move the menu-selected character to the front so they become the player kart.
  #applyPlayerSelection() {
    const sel = this.selectedCharacter % this.karts.length;
    if (sel === 0) return;
    const [picked] = this.karts.splice(sel, 1);
    this.karts.unshift(picked);
    this.karts.forEach((k, i) => { k.isPlayer = i === 0; });
  }

  startRace() {
    this.#hideMenuPreview();
    this.audio.init();
    this.audio.startMusic();
    this.hud.hideOverlay();
    this.hud.showRaceHud();
    this.#applyPlayerSelection();
    this.#prebuildSelectedTrack(); // reuse track built during the menu, if any
    const L = this.track.totalLen;
    // Clean 2-column x 4-row starting grid. P1 sits front-left; everyone else
    // pairs up side-by-side and falls back in rows, so every restart lines up in
    // the same, clearly-readable race formation.
    for (let i = 0; i < this.karts.length; i++) {
      const row = Math.floor(i / 2); // 0 = front row, 1..N going back
      const lane = i % 2 === 0 ? -2.0 : 2.0; // left / right column
      this.karts[i].placeAt(L - row * GRID_GAP, lane);
    }
    // Start the camera already framed on the player kart instead of lerping it
    // down from the distant menu viewpoint, so the countdown reads clearly.
    this.#snapCamera();
    this.countdown = 3;
    this.state = 'COUNTDOWN';
    this.hud.setCountdown('3');
    this.audio.count('3');
    this.countdownAccum = 0;
  }

  restart() {
    for (const k of this.karts) {
      k.spinning = 0; k.boostT = 0; k.shieldT = 0; k.starT = 0; k.padT = 0; k.item = null; k.speed = 0;
      k.airborne = false; k.vy = 0; k.airT = 0;
      k.finished = false; k.finishTime = null; k.raceTime = 0; k.rouletteT = 0; k.respawnT = 0;
    }
    this.timeMs = 0;
    this.raceTimeMs = 0;
    this.paused = false;
    this.simTicker.reset();
    this._finalLapShown = 0;
    this.items.reset();
    this.startRace();
  }

  // If the track editor saved a level via "Load in Game", register it as a
  // custom track and pre-select it so the game races it immediately.
  // The exported TRACKS is never mutated (J-2): Game owns an instance catalog.
  trackCatalog: TrackDef[] = [...TRACKS];
  loadCustomLevel() {
    const raw = localStorage.getItem('customLevel');
    if (!raw) return;
    try {
      const d = JSON.parse(raw);
      const next = upsertCustomLevel(this.trackCatalog, d);
      if (!next) return; // malformed — leave the catalog untouched
      this.trackCatalog = next;
      this.selectedMap = this.trackCatalog.length - 1;
    } catch {
      localStorage.removeItem('customLevel'); // malformed — drop it
    }
  }

  start() {
    this.clock = new THREE.Clock();
    this.auto = new URLSearchParams(location.search).has('auto');
    if (this.auto) this.startRace();
    else { this.hud.hideRaceHud(); this.hud.showMenu(); this.#showMenuPreview(); this.#prebuildSelectedTrack(); }
    requestAnimationFrame(this.#loop);
  }

  #loop = () => {
    requestAnimationFrame(this.#loop);
    // SIM: fixed timestep (M1 step 3, J-3). The wall delta only feeds the
    // accumulator; simulation advances in exact TICK_MS steps. Paused ⇒ the
    // ticker consumes the frame and simulates nothing (AR-11: timeMs now
    // freezes while paused — an allowed deviation of the parity contract).
    const wallDelta = Math.min(this.clock.getDelta(), 0.25);
    this.simTicker.paused = this.paused;
    this.simTicker.tick(wallDelta * 1000);
    this.#eventBridge.pump(this.events); // sim events -> particles/sonics
    const dt = wallDelta; // presentation dt (camera smoothing, effects, audio)

    // PRESENTATION: once per rAF frame, reading the post-tick sim state.
    this.effects.update(dt);
    this.#updateCamera(dt);
    if (this.state !== 'MENU') this.#updateHud();

    // M2 (J-17): composer when available, plain render as guaranteed fallback
    if (this.post.composer) this.post.render(dt);
    else this.renderer.render(this.scene, this.camera);

    if (!this.paused && this.audio.enabled) this.audio.engine(Math.abs(this.player.speed) / PHYS.maxSpeed, this.player.boostT > 0 || this.player.starT > 0);

    // lightweight runtime diagnostic (used by headless QA tooling)
    const d = document.getElementById('diag');
    if (d) {
      const p = this.player;
      const t = this.track.worldToTrack(p.pos, p.trackHint);
      d.textContent = JSON.stringify({ state: this.state, lap: p.lap, u: Math.round(p.prevU), lat: Math.round(t.lat), onRoad: p.onRoad, speed: Math.round(p.speed), karts: this.karts.map((k) => Math.round(k.prevU)) });
    }
  }

  // One fixed-timestep simulation step (120Hz). Everything here must stay
  // deterministic: only dt-fixed math, ordered array iteration, no DOM.
  #simUpdate = (dtMs: number) => {
    const dt = dtMs / 1000;
    this.timeMs += dtMs;

    if (this.state === 'COUNTDOWN') {
      this.countdownAccum += dt;
      if (this.countdownAccum >= 1) {
        this.countdownAccum -= 1; this.countdown -= 1;
        if (this.countdown > 0) { this.hud.setCountdown(String(this.countdown)); this.audio.count(String(this.countdown)); }
        else { this.state = 'RACING'; this.raceTimeMs = 0; this.hud.setCountdown('GO!'); this.audio.count('GO'); setTimeout(() => this.hud.setCountdown(''), 800); }
      }
      this.#updateKarts(dt, false);
    } else if (this.state === 'RACING') {
      this.raceTimeMs += dtMs;
      this.#updateKarts(dt, true);
      this.#collide();
      this.#respawnCheck(dt);
      this.#finalLapCallout();
      this.#checkFinish();
      this.#finishGuarantee(dt);
      // M3 (J-25): per-tick race hash — Lockstep publishes at its own cadence
      // (20Hz) and fires onDesync on peer mismatch.
      if (this.net) {
        this.net.postTick(this.netTick++, hashRace(this.karts, this.items.sim, this.timeMs, this.raceTimeMs));
      }
    } else if (this.state === 'FINISHED') {
      // karts are parked (speed forced to 0); keep them static by disabling input
      this.#updateKarts(dt, false);
    }

    this.items.update(dt, this.karts);
  }

  // Sim machines delegated to src/sim/raceSim.ts (M1 step 8) — Game only
  // supplies the frame inputs and presentation.
  #respawnCheck(dt: number) {
    respawnCheck(this.karts, this.track, dt, RACE.respawnTimeoutMs, 12);
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
    // M3 (J-26): when a net session is live, the local player's input is read
    // ONCE per tick and submitted through the lockstep gate (2-tick delay);
    // returned frames drive every human kart. AI karts stay locally simulated
    // by each peer (same seed, same consumption order; the stateHash tripwire
    // catches transient divergence). No net => identical single-player path.
    let netFrames: InputFrame[] | null = null;
    if (this.net) {
      this.input.resetFrame();
      const local = this.auto ? this.ai.think(this.player, dt) : this.input.read();
      netFrames = this.net.preTick(local);
    }
    for (const kart of this.karts) {
      let inp: InputFrame;
      const humanKart = this.net?.humanKartIndex(kart.index);
      if (netFrames && humanKart !== null && humanKart !== undefined) {
        inp = netFrames[kart.index];
        this.input.resetFrame();
        if (inp.itemPressed && kart.item) kart.useItem();
      } else if (kart.isPlayer) {
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
    collideKarts(this.karts);
  }

  #checkFinish() {
    if (this.karts.every((k) => k.finished)) this.#doFinish();
  }

  #doFinish() {
    this.state = 'FINISHED';
    // Bring every kart to a standstill so the podium readout isn't a racing view.
    for (const k of this.karts) { k.speed = 0; k.boostT = 0; k.starT = 0; k.padT = 0; k.spinning = 0; k.airborne = false; k.vy = 0; }
    this.audio.finish();
    const sorted = [...this.karts].sort((x, y) => (x.finishTime ?? Infinity) - (y.finishTime ?? Infinity));
    this.hud.showFinish(sorted.map((k) => ({ name: k.name, player: k.isPlayer, timeMs: k.finishTime! * 1000 })));
  }

  // Guarantee the race always ends: once the player crosses, wrap up stragglers.
  #finishGuarantee(dt: number) {
    if (this.state !== 'RACING' || !this.player || !this.player.finished) return;
    this.finishWait = (this.finishWait || 0) + dt;
    if (this.finishWait > 6) {
      // GP-7 FIX: stragglers ranked by race score, not array order.
      fabricatePodium(this.karts, RACE.kartCount, this.player.finishTime!);
      this.#doFinish();
    }
  }

  #updateHud() {
    if (!this.player) return;
    const ranked = [...this.karts].sort((a, b) => scoreOf(b, RACE.kartCount) - scoreOf(a, RACE.kartCount));
    const position = ranked.indexOf(this.player) + 1;
    this.hud.update({
      position,
      lap: Math.min(this.player.lap, this.totalLaps),
      timeMs: this.raceTimeMs,
      item: this.player.item,
      rouletteT: this.player.rouletteT,
      muted: this.audio.muted,
      standings: ranked.map((k) => ({ name: k.name, isPlayer: k.isPlayer })),
    });
    this.hud.setPlayerPos(this.player.pos);
    this.hud.setKartDots(this.karts.map((k) => ({ x: k.pos.x, z: k.pos.z, color: '#' + k.color.toString(16).padStart(6, '0'), isPlayer: k.isPlayer })));
    this.hud.drawMinimap();
  }

  // Place the camera instantly on the player's chosen view, skipping the menu→race
  // lerp so the countdown opens already framed on the kart.
  #snapCamera() {
    const p = this.player;
    if (!p) return;
    const m = CAMERA_MODES[this.cameraMode] ?? CAMERA_MODES[0];
    const forward = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    if (m.overhead) {
      this.camera.position.copy(p.pos).setY(p.pos.y + m.height);
    } else {
      this.camera.position.copy(p.pos).addScaledVector(forward, -m.distance).setY(p.pos.y + m.height);
    }
    this.camera.lookAt(p.pos.clone().setY(p.pos.y + 0.6));
    this.camera.fov = m.fov;
    this.camera.updateProjectionMatrix();
  }

  #updateCamera(dt: number) {
    const p = this.player;
    if (!p) return;
    const m = CAMERA_MODES[this.cameraMode] ?? CAMERA_MODES[0];
    const forward = new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const boosting = p.boostT > 0 || p.starT > 0;

    let want: THREE.Vector3;
    let look: THREE.Vector3;
    if (m.overhead) {
      // bird's-eye: hover straight above the kart, looking straight down
      want = p.pos.clone().setY(p.pos.y + m.height);
      look = p.pos.clone().addScaledVector(forward, 0).setY(p.pos.y);
    } else {
      want = p.pos.clone().addScaledVector(forward, -m.distance).setY(p.pos.y + m.height);
      look = p.pos.clone().addScaledVector(forward, m.lookAhead).setY(p.pos.y + 0.6);
    }

    this.camera.position.lerp(want, Math.min(1, CAMERA.lerp * dt));
    this.camera.lookAt(look);
    const fov = m.fov + (boosting && !this.reduceMotion ? CAMERA.fovBoost - CAMERA.fovBase : 0);
    this.camera.fov += (fov - this.camera.fov) * Math.min(1, 5 * dt);
    this.camera.updateProjectionMatrix();

    // M2 (J-16): shadow frustum follows the player — the 2048² map stays crisp
    // around the kart instead of covering the whole ~400-unit track.
    const p2 = this.player;
    if (this.sunLight && p2) {
      this.sunLight.target.position.set(p2.pos.x, 0, p2.pos.z);
      this.sunLight.position.set(p2.pos.x + 60, 90, p2.pos.z + 30);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  // M3 (J-26): begin a net race — re-seed the sim with the lobby-agreed seed,
  // swap the local "player" kart to our net slot, and start. Inputs for human
  // karts flow through NetController.preTick; AI karts stay peer-local.
  beginNetRace(seed: number): void {
    this.rng = new Rng(seed >>> 0);
    if (this.net) {
      const me = this.net.selfIndex;
      if (me !== 0 && this.karts[me]) {
        for (const k of this.karts) k.isPlayer = false;
        this.karts[me].isPlayer = true;
      }
      this.player; // getter now resolves to our net slot
    }
    this.restart();
    this.startRace();
  }

  #makeNamePlate(name: string, color: number): THREE.Sprite {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const g = c.getContext('2d')!;
    g.font = '700 34px ui-rounded, system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const w = Math.min(232, g.measureText(name).width + 28);
    g.fillStyle = 'rgba(10,14,24,0.62)';
    g.beginPath();
    g.roundRect(128 - w / 2, 8, w, 46, 14);
    g.fill();
    g.strokeStyle = '#' + color.toString(16).padStart(6, '0');
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#ffffff';
    g.fillText(name, 128, 32);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.position.set(0, 2.7, 0); // floats above the kart, root-yaws never tilt it
    s.scale.set(3.1, 0.78, 1); // M2-close: legible past ~40m (critic item 5)
    return s;
  }
}

// Resolve a track's object placements, falling back to the shared defaults for
// built-in tracks that don't specify their own.
function placementsFor(def: TrackDef): Placements {
  return {
    itemBoxes: def.itemBoxes ?? ITEM_BOX_PLACEMENTS.map((frac, i) => ({ frac, lateral: i % 2 === 0 ? -1.6 : 1.6 })),
    boostPads: def.boostPads ?? BOOST_PADS,
    jumps: def.jumps ?? JUMPS,
  };
}
