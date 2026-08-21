import * as THREE from 'three';
import { Track, buildScene, buildTree } from '../track/track';
import { TRACKS, WORLD } from '../config';

// The editable level model shared with the game (exported/imported as JSON).
export interface TrackObject {
  id: string;
  type: 'box' | 'pad' | 'jump';
  frac: number;    // arc-length fraction along the road (0..1)
  lateral: number; // signed offset from the road centreline
}
export interface TreeObject {
  id: string;
  type: 'tree';
  x: number;
  z: number;
  r: number;
}
export type EditorObject = TrackObject | TreeObject;

export interface LevelDef {
  name: string;
  roadWidth: number;
  points: [number, number][];
  trees: [number, number, number][];
  objects: EditorObject[];
}

type Tool = 'place' | 'select' | 'road';

let uid = 0;
const nid = () => `o${Date.now().toString(36)}${(uid++).toString(36)}`;

// Reusable visual builders so edited objects match the in-game look.
function buildBoxVisual(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x664400 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
  body.position.y = 0.65;
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.18, depthWrite: false }));
  glow.position.y = 0.7;
  g.add(body, glow);
  return g;
}
function buildPadVisual(): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 4.4), new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff6a00, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0 }));
  plate.position.y = 0.07;
  g.add(plate);
  for (let i = 0; i < 3; i++) {
    const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.34), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55 }));
    arrow.position.set(0, 0.12, -1.3 + i * 1.3);
    g.add(arrow);
  }
  return g;
}
function buildJumpVisual(): THREE.Group {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 5.2), new THREE.MeshStandardMaterial({ color: 0xe0a83f, emissive: 0x6a4a00, emissiveIntensity: 0.4, roughness: 0.6 }));
  top.rotation.x = -0.45;
  top.position.y = 0.2;
  g.add(top);
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 5.4), new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8 }));
    rail.rotation.x = -0.45;
    rail.position.set(s * 1.4, 0.22, 0);
    g.add(rail);
  }
  return g;
}

export class Editor {
  app: HTMLElement;
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  track: Track;
  trackGroup: THREE.Group | null = null;
  objectLayer: THREE.Group;

  level: LevelDef;
  tool: Tool = 'place';
  placeType: 'box' | 'pad' | 'jump' | 'tree' = 'box';
  selected: EditorObject | null = null;
  draggingObject = false;

  // orbit camera state
  private target = new THREE.Vector3(0, 0, 0);
  private azimuth = 0.6;
  private polar = 1.1;
  private radius = 60;
  private dragging = false;
  private panning = false;
  private lastX = 0;
  private lastY = 0;
  private raf = 0;

  private roadMarks: THREE.Group;

  constructor(app: HTMLElement) {
    this.app = app;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    app.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x6fb1e8);
    this.scene.fog = new THREE.FogExp2(0x9ec6ec, 0.0021);
    const hemi = new THREE.HemisphereLight(0xdff1ff, 0x9fc28a, 0.6);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe8c8, 2.2);
    sun.position.set(60, 90, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    this.scene.add(sun);

    this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 900);
    this.objectLayer = new THREE.Group();
    this.scene.add(this.objectLayer);
    this.roadMarks = new THREE.Group();
    this.scene.add(this.roadMarks);

    // start from the first built-in track
    const t = TRACKS[0];
    this.level = {
      name: t.name,
      roadWidth: WORLD.roadWidth,
      points: t.points.map(([x, z]) => [x, z]),
      trees: [],
      objects: [],
    };
    this.track = new Track(this.level.points, this.level.roadWidth);
    this.rebuildScene();

    this.#bindInput();
    this.#bindUI();
    this.#updateCamera();
    this.#render();
    this.#status('Ready — pick a tool and click to edit.');
  }

  // ---- scene / road ----
  rebuildScene() {
    // dispose old track + object visuals
    if (this.trackGroup) {
      this.scene.remove(this.trackGroup);
      this.trackGroup.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) { m.geometry?.dispose(); const mats = Array.isArray(m.material) ? m.material : [m.material]; mats.forEach((x) => x?.dispose()); }
      });
    }
    this.objectLayer.clear();
    this.roadMarks.clear();
    this.track = new Track(this.level.points, this.level.roadWidth);
    this.trackGroup = buildScene(this.scene, this.track, { trees: this.level.trees });
    // rebuild object visuals
    for (const o of this.level.objects) this.#addObjectVisual(o);
    this.#renderRoadMarks();
    this.#updateCounts();
    this.target.set(0, 0, 0);
  }

  #placeOnTrack(group: THREE.Object3D, u: number, lateral: number) {
    const { sample } = this.track.sampleAtU(u);
    const x = sample.x + sample.nx * lateral;
    const z = sample.z + sample.nz * lateral;
    group.position.set(x, 0, z);
  }

  #addObjectVisual(o: EditorObject) {
    let v: THREE.Object3D;
    if (o.type === 'tree') v = buildTree(o.x, o.z, o.r);
    else {
      if (o.type === 'box') v = buildBoxVisual();
      else if (o.type === 'pad') v = buildPadVisual();
      else v = buildJumpVisual();
      this.#placeOnTrack(v, o.frac * this.track.totalLen, o.lateral);
      if (o.type !== 'jump') v.rotation.y = 0;
      else { const s = this.track.sampleAtU(o.frac * this.track.totalLen).sample; v.rotation.y = Math.atan2(s.tx, s.tz); }
    }
    v.userData.objId = o.id;
    v.userData.objType = o.type;
    this.objectLayer.add(v);
  }

  // ---- object placement / picking ----
  raycastNDC(x: number, y: number): THREE.Raycaster {
    const ndc = new THREE.Vector2((x / this.renderer.domElement.clientWidth) * 2 - 1, -(y / this.renderer.domElement.clientHeight) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, this.camera);
    return raycaster;
  }

  #groundPoint(x: number, y: number): THREE.Vector3 | null {
    // raycast against the ground plane meshes (road/shoulder/ground)
    const raycaster = this.raycastNDC(x, y);
    const hits = raycaster.intersectObjects(this.trackGroup!.children, false)
      .filter((h) => h.object.userData.objType === undefined)
      .sort((a, b) => a.distance - b.distance);
    if (!hits.length) return null;
    return hits[0].point;
  }

  placeAt(x: number, y: number) {
    const p = this.#groundPoint(x, y);
    if (!p) return;
    if (this.placeType === 'tree') {
      this.level.objects.push({ id: nid(), type: 'tree', x: p.x, z: p.z, r: 0.9 + Math.random() * 1.3 });
    } else {
      // snap to the road: nearest sample + lateral offset
      let best = 0, bd = Infinity;
      for (let i = 0; i < this.track.samples.length; i++) {
        const s = this.track.samples[i];
        const dx = p.x - s.x, dz = p.z - s.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      const s = this.track.samples[best];
      const lat = (p.x - s.x) * s.nx + (p.z - s.z) * s.nz;
      const frac = this.track.samples[best].u / this.track.totalLen;
      this.level.objects.push({ id: nid(), type: this.placeType, frac, lateral: Math.max(-this.track.halfWidth + 1, Math.min(this.track.halfWidth - 1, lat)) });
    }
    const added = this.level.objects[this.level.objects.length - 1];
    this.#addObjectVisual(added);
    this.#updateCounts();
    this.#status(`${this.placeType} placed`);
  }

  pickObject(x: number, y: number): EditorObject | null {
    const raycaster = this.raycastNDC(x, y);
    const hits = raycaster.intersectObjects(this.objectLayer.children, false);
    if (!hits.length) return null;
    const id = hits[0].object.userData.objId as string;
    return this.level.objects.find((o) => o.id === id) ?? null;
  }

  selectTool(t: Tool) {
    this.tool = t;
    this.selected = null;
    this.#syncToolButtons();
    this.#renderRoadMarks();
    this.#status(t === 'road' ? 'Road mode: drag the gold dots to reshape the track.' : `${t} mode`);
  }

  deleteSelected() {
    if (!this.selected) return;
    this.level.objects = this.level.objects.filter((o) => o.id !== this.selected!.id);
    const id = this.selected.id;
    this.selected = null;
    // remove visual
    const ch = this.objectLayer.children.find((c) => c.userData.objId === id);
    if (ch) this.objectLayer.remove(ch);
    this.#updateCounts();
    this.#status('Object removed');
  }

  // ---- road shape editing ----
  #renderRoadMarks() {
    this.roadMarks.clear();
    if (this.tool !== 'road') return;
    const mat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    this.level.points.forEach(([x, z], i) => {
      const d = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10), mat);
      d.position.set(x, 0.3, z);
      d.userData.pointIndex = i;
      this.roadMarks.add(d);
    });
  }

  pickRoadMark(x: number, y: number): number | null {
    const raycaster = this.raycastNDC(x, y);
    const hits = raycaster.intersectObjects(this.roadMarks.children, false);
    return hits.length ? (hits[0].object.userData.pointIndex as number) : null;
  }

  // ---- input ----
  #bindInput() {
    const c = this.renderer.domElement;
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) { this.panning = true; this.lastX = e.clientX; this.lastY = e.clientY; return; }
      if (this.draggingObject) return;
      const rect = c.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (this.tool === 'place') {
        this.placeAt(x, y);
      } else if (this.tool === 'select') {
        const o = this.pickObject(x, y);
        if (o) { this.selected = o; this.draggingObject = true; this.#status(`Selected ${o.type}`); }
        else this.selected = null;
      } else {
        const pi = this.pickRoadMark(x, y);
        if (pi !== null) {
          this.dragRoadIndex = pi;
          this.lastX = x; this.lastY = y;
        } else {
          this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY;
        }
      }
      if (this.tool !== 'road') { this.dragging = true; this.lastX = e.clientX; this.lastY = e.clientY; }
    });
    c.addEventListener('pointermove', (e) => {
      if (this.panning) { this.#pan(e.clientX - this.lastX, e.clientY - this.lastY); this.lastX = e.clientX; this.lastY = e.clientY; return; }
      if (this.dragRoadIndex !== null) {
        const rect = c.getBoundingClientRect();
        const p = this.#groundPoint(e.clientX - rect.left, e.clientY - rect.top);
        if (p) {
          this.level.points[this.dragRoadIndex] = [p.x, p.z];
          this.rebuildScene();
          return;
        }
      }
      if (this.draggingObject && this.selected) {
        const rect = c.getBoundingClientRect();
        const p = this.#groundPoint(e.clientX - rect.left, e.clientY - rect.top);
        if (p) this.#moveSelected(p);
      } else if (this.dragging) {
        const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
        this.azimuth -= dx * 0.006;
        this.polar -= dy * 0.006;
        this.polar = Math.max(0.1, Math.min(Math.PI - 0.1, this.polar));
        this.lastX = e.clientX; this.lastY = e.clientY;
        this.#updateCamera();
      }
    });
    const up = () => { this.dragging = false; this.panning = false; this.draggingObject = false; this.dragRoadIndex = null; };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointerleave', up);
    c.addEventListener('wheel', (e) => {
      this.radius = Math.max(12, Math.min(220, this.radius * (1 + e.deltaY * 0.001)));
      this.#updateCamera();
    }, { passive: true });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') this.deleteSelected();
    });
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
  private dragRoadIndex: number | null = null;

  #moveSelected(p: THREE.Vector3) {
    const o = this.selected!;
    if (o.type === 'tree') { o.x = p.x; o.z = p.z; }
    else {
      let best = 0, bd = Infinity;
      for (let i = 0; i < this.track.samples.length; i++) {
        const s = this.track.samples[i];
        const dx = p.x - s.x, dz = p.z - s.z;
        const d = dx * dx + dz * dz;
        if (d < bd) { bd = d; best = i; }
      }
      const s = this.track.samples[best];
      o.frac = s.u / this.track.totalLen;
      o.lateral = Math.max(-this.track.halfWidth + 1, Math.min(this.track.halfWidth - 1, (p.x - s.x) * s.nx + (p.z - s.z) * s.nz));
    }
    // re-render the moved visual
    const ch = this.objectLayer.children.find((c) => c.userData.objId === o.id);
    if (ch) {
      if (o.type === 'tree') ch.position.set(o.x, 0, o.z);
      else this.#placeOnTrack(ch, o.frac * this.track.totalLen, o.lateral);
    }
  }

  #pan(dx: number, dy: number) {
    const right = new THREE.Vector3();
    this.camera.getWorldDirection(new THREE.Vector3());
    right.crossVectors(this.camera.getWorldDirection(new THREE.Vector3()), new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const scale = this.radius * 0.0016;
    this.target.addScaledVector(right, -dx * scale);
    this.target.addScaledVector(up, dy * scale);
    this.#updateCamera();
  }

  #updateCamera() {
    const c = this.camera;
    const sp = Math.sin(this.polar);
    c.position.set(
      this.target.x + this.radius * sp * Math.sin(this.azimuth),
      this.target.y + this.radius * Math.cos(this.polar),
      this.target.z + this.radius * sp * Math.cos(this.azimuth),
    );
    c.lookAt(this.target);
  }

  // ---- UI ----
  #bindUI() {
    const $ = (s: string) => document.querySelector(s) as HTMLElement;
    const nameEl = $('#name') as HTMLInputElement;
    nameEl.addEventListener('input', () => { this.level.name = nameEl.value || 'My Track'; });
    document.querySelectorAll('.palette button').forEach((b) => {
      b.addEventListener('click', () => {
        document.querySelectorAll('.palette button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        this.placeType = (b as HTMLElement).dataset.type as any;
      });
    });
    document.querySelectorAll('.tools button').forEach((b) => {
      b.addEventListener('click', () => this.selectTool((b as HTMLElement).dataset.tool as Tool));
    });
    ($('.export') as HTMLElement).addEventListener('click', () => this.exportJSON());
    ($('.import') as HTMLElement).addEventListener('click', () => (document.getElementById('file') as HTMLInputElement).click());
    (document.getElementById('file') as HTMLInputElement).addEventListener('change', (e) => this.importJSON((e.target as HTMLInputElement).files?.[0]));
    ($('.load') as HTMLElement).addEventListener('click', () => this.loadInGame());
  }

  #syncToolButtons() {
    document.querySelectorAll('.tools button').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.tool === this.tool);
    });
  }

  #updateCounts() {
    const c = { box: 0, pad: 0, jump: 0, tree: 0 };
    for (const o of this.level.objects) c[o.type]++;
    const set = (id: string, n: number) => { const e = document.getElementById(id); if (e) e.textContent = String(n); };
    set('c-box', c.box); set('c-pad', c.pad); set('c-jump', c.jump); set('c-tree', c.tree);
  }

  #status(msg: string) {
    const el = document.getElementById('status'); if (el) el.textContent = msg;
  }

  // ---- export / import / load ----
  exportJSON() {
    const data: LevelDef = {
      name: this.level.name,
      roadWidth: this.level.roadWidth,
      points: this.level.points,
      trees: this.level.trees,
      objects: this.level.objects.map((o) => ({ ...o })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${(this.level.name || 'track').replace(/[^\w]+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    this.#status('Level exported');
  }

  importJSON(file: File | undefined) {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result as string) as LevelDef;
        this.level = {
          name: d.name || 'Imported',
          roadWidth: d.roadWidth || WORLD.roadWidth,
          points: d.points && d.points.length ? d.points : this.level.points,
          trees: d.trees || [],
          objects: (d.objects || []).map((o: any) => ({ ...o, id: nid() })),
        };
        (document.getElementById('name') as HTMLInputElement).value = this.level.name;
        this.rebuildScene();
        this.#status('Level imported');
      } catch {
        this.#status('Invalid level file');
      }
    };
    r.readAsText(file);
  }

  loadInGame() {
    // stash the level for the game page, then open the game
    localStorage.setItem('customLevel', JSON.stringify(this.exportData()));
    window.location.href = '/';
  }

  exportData(): LevelDef {
    return { name: this.level.name, roadWidth: this.level.roadWidth, points: this.level.points, trees: this.level.trees, objects: this.level.objects.map((o) => ({ ...o })) };
  }

  // ---- loop ----
  #render() {
    this.raf = requestAnimationFrame(() => this.#render());
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
  }
}
