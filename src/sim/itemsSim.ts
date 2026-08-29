// Item state + logic, purified (M1 step 6, judge backlog J-6).
//
// Everything race-outcome-relevant about item boxes, placed pads/jumps, the
// roulette and dropped bananas lives here as PLAIN RECORDS (no THREE, no DOM;
// deterministic draw order identical to v1 — architecture.md step 6 and the
// purity gate in tests/sim-track.test.js). The presentation layer
// (src/game/Items.ts) mirrors this state into meshes keyed by index.
//
// Kart is consumed structurally via KartLike: v1's Kart satisfies it exactly,
// and the sim never imports from src/game/** (one-way dependency graph).

import { ITEM, KART_SCALE } from '../config';

export interface SimItemBox {
  frac: number;
  lateral: number;
  x: number;
  z: number;
  taken: boolean;
  respawn: number; // seconds until respawn (countdown form, v1 parity)
}

export interface SimBanana {
  x: number;
  z: number;
  dropper: number; // kart index; a kart never slips on its own banana
  dropT: number;
}

export interface SimPad {
  frac: number;
  lateral: number;
  index: number; // nearest sample index for proximity detection (v1 behaviour)
  x: number;
  z: number;
}

export interface SimJump {
  frac: number;
  lateral: number;
  index: number;
  x: number;
  z: number;
}

export interface Placements {
  itemBoxes: { frac: number; lateral: number }[];
  boostPads: { frac: number; lateral: number }[];
  jumps: { frac: number; lateral: number }[];
}

// The slice of Kart (+ track surface) the items sim needs.
export interface KartLike {
  pos: { x: number; y: number; z: number };
  trackHint: number;
  index: number;
  item: string | null;
  rouletteT: number;
  shieldT: number;
  airborne: boolean;
  applyPad(): void;
  launch(): void;
  hitBanana(): boolean;
}

export interface ItemsTrack {
  samples: { length: number };
  totalLen: number;
  sampleAtU(u: number): { sample: { x: number; z: number; nx: number; nz: number }; index: number };
  worldToTrack(pos: { x: number; z: number }, hint?: number): { index: number; lat: number };
}

export class ItemsSim {
  boxes: SimItemBox[] = [];
  bananas: SimBanana[] = [];
  pads: SimPad[] = [];
  jumps: SimJump[] = [];
  placements: Placements = { itemBoxes: [], boostPads: [], jumps: [] };
  #track: ItemsTrack;

  constructor(track: ItemsTrack) {
    this.#track = track;
  }

  setPlacements(p: Placements): void {
    this.placements = p;
    this.boxes = p.itemBoxes.map(({ frac, lateral }) => ({ frac, lateral, ...this.#place(frac, lateral), taken: false, respawn: 0 }));
    this.pads = p.boostPads.map(({ frac, lateral }) => this.#placeIndexed(frac, lateral));
    this.jumps = p.jumps.map(({ frac, lateral }) => this.#placeIndexed(frac, lateral));
    this.bananas = [];
  }

  #place(frac: number, lateral: number): { x: number; z: number } {
    const { sample } = this.#track.sampleAtU(frac * this.#track.totalLen);
    return { x: sample.x + sample.nx * lateral, z: sample.z + sample.nz * lateral };
  }

  #placeIndexed(frac: number, lateral: number): SimPad {
    const { sample, index } = this.#track.sampleAtU(frac * this.#track.totalLen);
    return { frac, lateral, index, x: sample.x + sample.nx * lateral, z: sample.z + sample.nz * lateral };
  }

  // Full reset for a new race: clear dropped bananas and restore all boxes.
  reset(): void {
    this.bananas = [];
    for (const b of this.boxes) { b.taken = false; b.respawn = 0; }
  }

  // v1 parity: bananas drop 1.8 world units BEHIND the kart along its heading.
  addBanana(kart: KartLike, yaw: number, terrainY: (x: number, z: number) => number): SimBanana {
    const px = kart.pos.x - Math.sin(yaw) * 1.8;
    const pz = kart.pos.z - Math.cos(yaw) * 1.8;
    void terrainY; // terrain height only matters to visuals, not sim state
    const b: SimBanana = { x: px, z: pz, dropper: kart.index, dropT: 0 };
    this.bananas.push(b);
    return b;
  }

  // Roulette a random item with weighted odds (children-friendly).
  // Deterministic: draws from the seeded 'items' stream (M1 step 5, J-5).
  rollItem(drand: () => number): 'banana' | 'mushroom' | 'star' {
    const total = ITEM.weights.banana + ITEM.weights.mushroom + ITEM.weights.star;
    let r = drand() * total;
    if ((r -= ITEM.weights.banana) < 0) return 'banana';
    if ((r -= ITEM.weights.mushroom) < 0) return 'mushroom';
    return 'star';
  }

  // M4 (J-32): rank-weighted roulette — leaders get defensive junk, trailers
  // get comeback power. Pure function of (drand, rank, count, strength): two
  // peers with the same seed and scoreOf agree bit-for-bit. `rank` is 1-based,
  // count >= 1. `strength` interpolates toward the neutral baseline weights:
  // 1 = aggressive comeback curve (multiplayer), 0.5 = single-player fair
  // (leaders keep a ~40% mushroom escape tool, trailers' star maxes lower),
  // 0 = exactly the neutral ITEM.weights distribution.
  rollItemForRank(drand: () => number, rank: number, count: number, strength = 1): 'banana' | 'mushroom' | 'star' {
    const B = ITEM.weights;
    const tot = B.banana + B.mushroom + B.star;
    const base = { banana: B.banana / tot, star: B.star / tot };
    if (count <= 1 || rank < 1) return this.rollItem(drand);
    // progress 0 (leader) .. 1 (last place); smooth curve, not hard buckets
    const progress = Math.min(1, Math.max(0, (rank - 1) / (count - 1)));
    const bananaEnd = 0.55 - 0.45 * progress; // leaders: mostly junk
    const starEnd = 0.08 + 0.34 * progress;   // trailers: comeback star
    const s = Math.min(1, Math.max(0, strength));
    const banana = base.banana + (bananaEnd - base.banana) * s;
    const star = base.star + (starEnd - base.star) * s;
    const mushroom = 1 - banana - star;       // middle-cream always fills
    let r = drand();
    if ((r -= banana) < 0) return 'banana';
    if ((r -= mushroom) < 0) return 'mushroom';
    return 'star';
  }

  // The single per-tick item step: pad kicks, jump launches, box respawn +
  // pickup, roulette resolution, banana collisions. Event-emitting (J-4).
  // `rollFor(kart)` resolves the roulette — the facade weights it by rank.
  update(dt: number, karts: KartLike[], events: { emit(ev: unknown): void }, rollFor: (k: KartLike) => 'banana' | 'mushroom' | 'star'): void {
    const M = this.#track.samples.length;
    for (const pd of this.pads) {
      for (const k of karts) {
        const t = this.#track.worldToTrack(k.pos, k.trackHint);
        let di = Math.abs(t.index - pd.index);
        di = Math.min(di, M - di); // wrap around the loop
        if (di < 9 && Math.abs(t.lat) < 2.3) k.applyPad();
      }
    }

    for (const j of this.jumps) {
      for (const k of karts) {
        if (k.airborne) continue;
        const t = this.#track.worldToTrack(k.pos, k.trackHint);
        let di = Math.abs(t.index - j.index);
        di = Math.min(di, M - di);
        if (di < 9 && Math.abs(t.lat) < 2.3) k.launch();
      }
    }

    // respawn boxes + pickup (starts the roulette reveal; item locks in when it resolves)
    for (const b of this.boxes) {
      if (b.respawn > 0) {
        b.respawn -= dt;
        if (b.respawn <= 0) b.taken = false;
      }
      if (b.taken) continue;
      for (const k of karts) {
        if (k.item || k.rouletteT > 0) continue;
        const dx = k.pos.x - b.x, dz = k.pos.z - b.z;
        // generous pickup radius (1.8 world units) so boxes are grabbed even at
        // top speed / from the road centre, not just on a perfect line
        if (dx * dx + dz * dz < 1.8 * 1.8) {
          k.rouletteT = ITEM.rouletteMs / 1000;
          events.emit({ t: 'sfx', name: 'pickup' });
          events.emit({ t: 'ring', at: { x: k.pos.x, y: k.pos.y + 0.6 * KART_SCALE, z: k.pos.z }, rgb: [1, 0.9, 0.3], max: 1.6 });
          b.taken = true; b.respawn = ITEM.boxRespawnMs / 1000;
          break;
        }
      }
    }

    // resolve roulette reveals into real items. The roll callback receives the
    // kart so the caller can weight by race rank (M4 J-32).
    for (const k of karts) {
      if (k.rouletteT > 0) {
        k.rouletteT -= dt;
        if (k.rouletteT <= 0) { k.rouletteT = 0; k.item = rollFor(k); }
      }
    }

    // bananas: drop protection then make hazardous
    const dead: SimBanana[] = [];
    for (const b of this.bananas) {
      b.dropT += dt;
      for (const k of karts) {
        if (b.dropT < 0.4) continue; // avoid immediate self-hit
        if (k.shieldT > 0) continue;
        if (k.index === b.dropper) continue; // a kart never slips on its own banana
        const dx = k.pos.x - b.x, dz = k.pos.z - b.z;
        if (dx * dx + dz * dz < 0.9 * 0.9) {
          if (k.hitBanana()) { dead.push(b); break; }
        }
      }
    }
    for (const b of dead) {
      const i = this.bananas.indexOf(b);
      if (i >= 0) this.bananas.splice(i, 1);
    }
  }
}