import * as THREE from 'three';
import { ITEM, ITEM_BOX_PLACEMENTS, PHYS } from '../config.js';
import { itemBoxTexture } from '../util/tex.js';
import { terrainHeight, worldToTrack, sampleAtU } from '../track/track.js';

// Item boxes, the roulette that picks the item, and the active items on the
// road (bananas) plus their effects (mushroom boost, star/shield invincibility).
export class Items {
  constructor({ scene, track, world }) {
    this.scene = scene;
    this.track = track;
    this.world = world;

    this.boxes = [];
    this.bananas = [];
    this.buildBoxes();
  }

  buildBoxes() {
    const tex = itemBoxTexture();
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: 0x222200 });
    const count = ITEM_BOX_PLACEMENTS.length;
    ITEM_BOX_PLACEMENTS.forEach((frac, i) => {
      const u = frac * this.track.totalLen;
      const lateral = i % 2 === 0 ? -1.6 : 1.6;
      const box = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 1.1), mat);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.9, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffdd66, transparent: true, opacity: 0.18, depthWrite: false }));
      body.position.y = 0.65; glow.position.y = 0.7;
      box.add(body, glow);
      this.placeOnTrack(box, u, lateral);
      this.scene.add(box);
      this.boxes.push({ mesh: box, u, lateral, respawn: 0, taken: false });
    });
  }

  placeOnTrack(obj, u, lateral) {
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
  rollItem() {
    const total = ITEM.weights.banana + ITEM.weights.mushroom + ITEM.weights.star;
    let r = Math.random() * total;
    if ((r -= ITEM.weights.banana) < 0) return 'banana';
    if ((r -= ITEM.weights.mushroom) < 0) return 'mushroom';
    return 'star';
  }

  use(kart, id) {
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
      this.world.effects.ring(kart.pos.clone().setY(kart.pos.y + 0.6), new THREE.Color(1, 0.9, 0.2), 3.2);
    }
  }

  dropBanana(kart) {
    const back = new THREE.Vector3(-Math.sin(kart.yaw), 0, -Math.cos(kart.yaw));
    const px = kart.pos.x + back.x * 1.8;
    const pz = kart.pos.z + back.z * 1.8;
    const mesh = this.#makeBananaMesh();
    mesh.position.set(px, terrainHeight(px, pz) + 0.18, pz);
    mesh.rotation.y = Math.random() * 6.28;
    this.scene.add(mesh);
    this.bananas.push({ mesh, pos: new THREE.Vector3(px, 0, pz), dropper: kart, dropT: 0 });
  }

  #makeBananaMesh() {
    const g = new THREE.Group();
    const yellow = new THREE.MeshPhongMaterial({ color: 0xffd23f, shininess: 70, specular: 0x555500 });
    const brown = new THREE.MeshPhongMaterial({ color: 0x8a5a00, shininess: 30 });
    const segs = 5;
    const torus = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.16, 8, 12, Math.PI * 1.5), yellow);
    torus.rotation.y = Math.PI / 2;
    torus.position.y = 0.1;
    g.add(torus);
    return g;
  }

  // ---- per-frame update ----
  update(dt, karts) {
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
          if (dx * dx + dz * dz < 2.2 * 2.2) {
            k.rouletteT = ITEM.rouletteMs / 1000;
            this.world.audio.pickup();
            this.world.effects.ring(k.pos.clone().setY(k.pos.y + 0.6), new THREE.Color(1, 0.9, 0.3), 1.6);
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
    const toRemove = [];
    for (const b of this.bananas) {
      b.dropT += dt;
      b.mesh.rotation.y += dt * 2;
      for (const k of karts) {
        if (b.dropT < 0.4) continue; // avoid immediate self-hit
        if (k.shieldT > 0) continue;
        if (k === b.dropper) continue; // a kart never slips on its own banana
        const dx = k.pos.x - b.mesh.position.x, dz = k.pos.z - b.mesh.position.z;
        if (dx * dx + dz * dz < 1.4 * 1.4) {
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
