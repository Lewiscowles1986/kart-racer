import * as THREE from 'three';
import { ITEM_BOX_PLACEMENTS, PHYS, KART_SCALE, BOOST_PADS, JUMPS } from '../config';
import { itemBoxTexture } from '../util/tex';
import { terrainHeight } from '../track/track';
import { ItemsSim } from '../sim/itemsSim';
import { scoreOf } from '../sim/raceSim';
import type { Placements, SimBanana, SimItemBox } from '../sim/itemsSim';
import type { Kart, Track, World } from './Kart';

export type { Placements, SimItemBox } from '../sim/itemsSim';

// Item boxes, the roulette that picks the item, and the active items on the
// road (bananas) — the FACADE. All race-outcome state and logic live in
// ItemsSim (src/sim/itemsSim.ts, M1 step 6 / J-6); this class only owns
// Three.js meshes and mirrors the sim records into them.
export class Items {
  world: World;
  sim: ItemsSim;
  #track: Track;
  #scene: THREE.Scene;

  #boxMeshes: THREE.Group[] = [];
  #padMeshes: THREE.Group[] = [];
  #jumpMeshes: THREE.Group[] = [];
  #bananaMeshes = new Map<SimBanana, THREE.Group>();

  constructor({ scene, track, world }: { scene: THREE.Scene; track: Track; world: World }) {
    this.#scene = scene;
    this.#track = track;
    this.world = world;
    this.sim = new ItemsSim(track);
    this.setPlacements({
      itemBoxes: ITEM_BOX_PLACEMENTS.map((frac, i) => ({ frac, lateral: i % 2 === 0 ? -1.6 : 1.6 })),
      boostPads: BOOST_PADS,
      jumps: JUMPS,
    });
  }

  // kept as a property for v1 compatibility (Game reassigns it per track build)
  get track(): Track { return this.#track; }
  set track(t: Track) {
    this.#track = t;
    this.sim = new ItemsSim(t);
  }

  setPlacements(p: Placements) {
    this.sim.setPlacements(p);
    this.#rebuildMeshes();
  }

  #clearMeshes(): void {
    for (const m of [...this.#boxMeshes, ...this.#padMeshes, ...this.#jumpMeshes, ...this.#bananaMeshes.values()]) {
      this.#scene.remove(m);
    }
    this.#boxMeshes = []; this.#padMeshes = []; this.#jumpMeshes = [];
    this.#bananaMeshes.clear();
  }

  #rebuildMeshes(): void {
    this.#clearMeshes();
    const tex = itemBoxTexture();
    const boxMat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x222200 });
    for (const b of this.sim.boxes) {
      const box = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), boxMat);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.18, depthWrite: false }));
      body.position.y = 0.65; glow.position.y = 0.7;
      box.add(body, glow);
      this.#placeOnTrack(box, b.x, b.z);
      this.#scene.add(box);
      this.#boxMeshes.push(box);
    }
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff6a00, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55 });
    for (const pd of this.sim.pads) {
      const pad = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 4.4), plateMat);
      plate.position.y = 0.07;
      pad.add(plate);
      for (let i = 0; i < 3; i++) {
        const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.34), arrowMat);
        arrow.position.set(0, 0.12, -1.3 + i * 1.3);
        pad.add(arrow);
      }
      this.#placeOnTrack(pad, pd.x, pd.z);
      this.#scene.add(pad);
      this.#padMeshes.push(pad);
    }
    const topMat = new THREE.MeshStandardMaterial({ color: 0xe0a83f, emissive: 0x6a4a00, emissiveIntensity: 0.4, roughness: 0.6 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8 });
    for (const j of this.sim.jumps) {
      const ramp = new THREE.Group();
      const top = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.5, 5.2), topMat);
      top.rotation.x = -0.45;
      top.position.y = 0.2;
      ramp.add(top);
      for (const s of [-1, 1]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 5.4), railMat);
        rail.rotation.x = -0.45;
        rail.position.set(s * 1.4, 0.22, 0);
        ramp.add(rail);
      }
      // face the direction of travel (v1 #placeJump behaviour)
      const { sample } = this.#track.sampleAtU(j.frac * this.#track.totalLen);
      ramp.position.set(j.x, terrainHeight(j.x, j.z), j.z);
      ramp.rotation.y = Math.atan2(sample.tx, sample.tz);
      this.#scene.add(ramp);
      this.#jumpMeshes.push(ramp);
    }
  }

  #placeOnTrack(obj: THREE.Object3D, x: number, z: number) {
    obj.position.set(x, terrainHeight(x, z), z);
    obj.rotation.y = 0;
  }

  // Full reset for a new race: clear dropped bananas and restore all boxes.
  reset() {
    this.sim.reset();
    for (const m of this.#bananaMeshes.values()) this.#scene.remove(m);
    this.#bananaMeshes.clear();
  }

  // Roulette a random item with weighted odds (children-friendly, no rare-only).
  // Deterministic: draws from the seeded 'items' stream (M1 step 5, J-5).
  rollItem(): 'banana' | 'mushroom' | 'star' {
    return this.sim.rollItem(this.world.rng.stream('items'));
  }

  // M4 (J-32): rank-weighted roll for the live roulette — the kart's race
  // position (scoreOf) biases what it gets. Deterministic across peers.
  rollItemFor(kart: Kart, kartCount: number): 'banana' | 'mushroom' | 'star' {
    const ranked = [...this.world.karts].sort((a, b) => scoreOf(b, kartCount) - scoreOf(a, kartCount));
    const rank = Math.max(1, ranked.findIndex((k) => k === kart) + 1);
    return this.sim.rollItemForRank(this.world.rng.stream('items'), rank, kartCount);
  }

  use(kart: Kart, id: string) {
    if (id === 'banana') {
      this.#dropBanana(kart);
    } else if (id === 'mushroom') {
      kart.boostT = PHYS.boost.mushroom.time / 1000;
      this.world.events.emit({ t: 'sfx', name: 'boost' });
      this.world.events.emit({ t: 'ring', at: { x: kart.pos.x, y: kart.pos.y + 0.6, z: kart.pos.z }, rgb: [1, 0.8, 0.2], max: 2.4 });
    } else if (id === 'star') {
      kart.starT = PHYS.boost.star.time / 1000;
      kart.shieldT = kart.starT;
      this.world.events.emit({ t: 'sfx', name: 'star' });
      this.world.events.emit({ t: 'ring', at: { x: kart.pos.x, y: kart.pos.y + 0.6 * KART_SCALE, z: kart.pos.z }, rgb: [1, 0.9, 0.2], max: 3.2 });
    }
  }

  #dropBanana(kart: Kart) {
    const b = this.sim.addBanana(kart, kart.yaw, terrainHeight);
    const mesh = this.#makeBananaMesh();
    mesh.position.set(b.x, terrainHeight(b.x, b.z) + 0.18, b.z);
    mesh.rotation.y = Math.random() * 6.28; // presentation-only spin (ADR-0003)
    this.#scene.add(mesh);
    this.#bananaMeshes.set(b, mesh);
  }

  #makeBananaMesh(): THREE.Group {
    const g = new THREE.Group();
    const yellow = new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 70, specular: 0x555500 });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.16, 8, 12, Math.PI * 1.5), yellow);
    torus.rotation.y = Math.PI / 2;
    torus.position.y = 0.1;
    g.add(torus);
    return g;
  }

  // ---- per-frame update: sim step, then mirror visuals ----
  update(dt: number, karts: Kart[]) {
    this.sim.update(dt, karts, this.world.events, (k) => this.rollItemFor(k as Kart, karts.length));
    this.#syncVisuals(dt);
  }

  #syncVisuals(dt: number) {
    // boxes: spin + bob + visibility from sim state (index-aligned arrays)
    const now = this.world.timeMs;
    for (let i = 0; i < this.sim.boxes.length; i++) {
      const b: SimItemBox = this.sim.boxes[i];
      const mesh = this.#boxMeshes[i];
      mesh.visible = !b.taken; // taken implies respawn countdown; v1 identical
      if (!b.taken) {
        mesh.rotation.y += dt * 2.4;
        mesh.position.y = terrainHeight(b.x, b.z) + 0.7 + Math.sin(now / 300) * 0.12;
      }
    }
    // bananas: add/remove meshes to match the sim record list
    for (const b of this.sim.bananas) {
      let mesh = this.#bananaMeshes.get(b);
      if (!mesh) {
        mesh = this.#makeBananaMesh();
        mesh.position.set(b.x, terrainHeight(b.x, b.z) + 0.18, b.z);
        this.#scene.add(mesh);
        this.#bananaMeshes.set(b, mesh);
      }
      mesh.rotation.y += dt * 2;
    }
    for (const [b, mesh] of this.#bananaMeshes) {
      if (!this.sim.bananas.includes(b)) {
        this.#scene.remove(mesh);
        this.#bananaMeshes.delete(b);
      }
    }
  }
}