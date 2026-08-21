import * as THREE from 'three';
import { ITEM, ITEM_BOX_PLACEMENTS, PHYS, KART_SCALE, BOOST_PADS } from '../config';
import { itemBoxTexture } from '../util/tex';
import { terrainHeight } from '../track/track';
import type { Kart, Track, World } from './Kart';

interface ItemBox {
  mesh: THREE.Group;
  frac: number; // arc-length fraction of the track (0..1) for relayout
  lateral: number;
  respawn: number;
  taken: boolean;
}

interface Banana {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  dropper: Kart;
  dropT: number;
}

interface Pad {
  mesh: THREE.Group;
  frac: number;
  lateral: number;
  index: number; // nearest sample index, used for proximity detection
}

// Item boxes, the roulette that picks the item, and the active items on the
// road (bananas) plus their effects (mushroom boost, star/shield invincibility).
export class Items {
  scene: THREE.Scene;
  track: Track;
  world: World;

  boxes: ItemBox[];
  bananas: Banana[];
  pads: Pad[];

  constructor({ scene, track, world }: { scene: THREE.Scene; track: Track; world: World }) {
    this.scene = scene;
    this.track = track;
    this.world = world;

    this.boxes = [];
    this.bananas = [];
    this.pads = [];
    this.buildBoxes();
    this.buildPads();
  }

  buildBoxes() {
    const tex = itemBoxTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x222200 });
    ITEM_BOX_PLACEMENTS.forEach((frac, i) => {
      const lateral = i % 2 === 0 ? -1.6 : 1.6;
      const box = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.18, depthWrite: false }));
      body.position.y = 0.65; glow.position.y = 0.7;
      box.add(body, glow);
      this.placeOnTrack(box, frac * this.track.totalLen, lateral);
      this.scene.add(box);
      this.boxes.push({ mesh: box, frac, lateral, respawn: 0, taken: false });
    });
  }

  // Reposition every box on the CURRENT track (e.g. after a map is selected or a
  // track is rebuilt). Each box keeps its fraction/lateral, so it always lands
  // on the asphalt of the track actually being raced.
  relayout() {
    for (const b of this.boxes) {
      this.placeOnTrack(b.mesh, b.frac * this.track.totalLen, b.lateral);
    }
    for (const pd of this.pads) {
      const u = pd.frac * this.track.totalLen;
      pd.index = this.track.sampleAtU(u).index;
      this.placeOnTrack(pd.mesh, u, pd.lateral);
    }
  }

  // Bright boost pads on the road surface. Driving onto one gives a moderate
  // speed kick via Kart.applyPad().
  buildPads() {
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xff8c00, emissive: 0xff6a00, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0 });
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.55 });
    for (const { frac, lateral } of BOOST_PADS) {
      const pad = new THREE.Group();
      const plate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 4.4), plateMat);
      plate.position.y = 0.07;
      pad.add(plate);
      // forward chevron arrows
      for (let i = 0; i < 3; i++) {
        const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.06, 0.34), arrowMat);
        arrow.position.set(0, 0.12, -1.3 + i * 1.3);
        pad.add(arrow);
      }
      const u = frac * this.track.totalLen;
      const index = this.track.sampleAtU(u).index;
      this.placeOnTrack(pad, u, lateral);
      this.scene.add(pad);
      this.pads.push({ mesh: pad, frac, lateral, index });
    }
  }

  placeOnTrack(obj: THREE.Object3D, u: number, lateral: number) {
    const { sample } = this.track.sampleAtU(u);
    const x = sample.x + sample.nx * lateral;
    const z = sample.z + sample.nz * lateral;
    obj.position.set(x, terrainHeight(x, z), z);
    obj.rotation.y = 0;
  }

  // Full reset for a new race: clear dropped bananas and restore all boxes.
  reset() {
    for (const b of this.bananas) { this.scene.remove(b.mesh); }
    this.bananas = [];
    for (const b of this.boxes) { b.taken = false; b.respawn = 0; b.mesh.visible = true; }
  }

  // Roulette a random item with weighted odds (children-friendly, no rare-only).
  rollItem(): 'banana' | 'mushroom' | 'star' {
    const total = ITEM.weights.banana + ITEM.weights.mushroom + ITEM.weights.star;
    let r = Math.random() * total;
    if ((r -= ITEM.weights.banana) < 0) return 'banana';
    if ((r -= ITEM.weights.mushroom) < 0) return 'mushroom';
    return 'star';
  }

  use(kart: Kart, id: string) {
    if (id === 'banana') {
      this.dropBanana(kart);
    } else if (id === 'mushroom') {
      kart.boostT = PHYS.boost.mushroom.time / 1000;
      this.world.audio.boost();
      this.world.effects.ring(kart.pos.clone().setY(kart.pos.y + 0.6), new THREE.Color(1, 0.8, 0.2), 2.4);
    } else if (id === 'star') {
      kart.starT = PHYS.boost.star.time / 1000;
      kart.shieldT = kart.starT;
      this.world.audio.star();
      this.world.effects.ring(kart.pos.clone().setY(kart.pos.y + 0.6 * KART_SCALE), new THREE.Color(1, 0.9, 0.2), 3.2);
    }
  }

  dropBanana(kart: Kart) {
    const back = new THREE.Vector3(-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw));
    const px = kart.pos.x + back.x * 1.8;
    const pz = kart.pos.z + back.z * 1.8;
    const mesh = this.#makeBananaMesh();
    mesh.position.set(px, terrainHeight(px, pz) + 0.18, pz);
    mesh.rotation.y = Math.random() * 6.28;
    this.scene.add(mesh);
    this.bananas.push({ mesh, pos: new THREE.Vector3(px, 0, pz), dropper: kart, dropT: 0 });
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

  // ---- per-frame update ----
  update(dt: number, karts: Kart[]) {
    // boost pads: any kart over a pad gets a speed kick (refreshed while it stays
    // on it). Proximity is compared in SAMPLE-INDEX space because sampleAtU (used
    // to place) and worldToTrack (used to detect) disagree on arc length.
    const M = this.track.samples.length;
    for (const pd of this.pads) {
      for (const k of karts) {
        if (k.finished) continue;
        const t = this.track.worldToTrack(k.pos, k.trackHint);
        let di = Math.abs(t.index - pd.index);
        di = Math.min(di, M - di); // wrap around the loop
        if (di < 9 && Math.abs(t.lat) < 2.3) k.applyPad();
      }
    }

    // animate + respawn boxes
    const now = this.world.timeMs;
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) { b.taken = false; b.mesh.visible = true; }
      }
      if (b.mesh.visible) {
        b.mesh.rotation.y += dt * 2.4;
        b.mesh.position.y = terrainHeight(b.mesh.position.x, b.mesh.position.z) + 0.7 + Math.sin(now / 300) * 0.12;
      }
      // pickup (starts the roulette reveal; item locks in when it resolves)
      if (!b.taken && b.mesh.visible) {
        for (const k of karts) {
          if (k.item || k.rouletteT > 0) continue;
          const dx = k.pos.x - b.mesh.position.x, dz = k.pos.z - b.mesh.position.z;
          // generous pickup radius (1.8 world units) so boxes are grabbed even at
          // top speed / from the road centre, not just on a perfect line
          if (dx * dx + dz * dz < 1.8 * 1.8) {
            k.rouletteT = ITEM.rouletteMs / 1000;
            this.world.audio.pickup();
            this.world.effects.ring(k.pos.clone().setY(k.pos.y + 0.6 * KART_SCALE), new THREE.Color(1, 0.9, 0.3), 1.6);
            b.taken = true; b.respawn = ITEM.boxRespawnMs / 1000; b.mesh.visible = false;
            break;
          }
        }
      }
    }

    // resolve roulette reveals into real items
    for (const k of karts) {
      if (k.rouletteT > 0) {
        k.rouletteT -= dt;
        if (k.rouletteT <= 0) { k.rouletteT = 0; k.item = this.rollItem(); }
      }
    }

    // bananas: drop protection then make hazardous
    const toRemove: Banana[] = [];
    for (const b of this.bananas) {
      b.dropT += dt;
      b.mesh.rotation.y += dt * 2;
      for (const k of karts) {
        if (b.dropT < 0.4) continue; // avoid immediate self-hit
        if (k.shieldT > 0) continue;
        if (k === b.dropper) continue; // a kart never slips on its own banana
        const dx = k.pos.x - b.mesh.position.x, dz = k.pos.z - b.mesh.position.z;
        if (dx * dx + dz * dz < 0.9 * 0.9) {
          if (k.hitBanana()) { toRemove.push(b); break; }
        }
      }
    }
    for (const b of toRemove) {
      this.scene.remove(b.mesh);
      const i = this.bananas.indexOf(b);
      if (i >= 0) this.bananas.splice(i, 1);
    }
  }
}
