import * as THREE from 'three';
import { PHYS, TERRAIN, KART_SCALE, PAD } from '../config';
import { terrainHeight, terrainNormal } from '../track/track';
import type { Sample, TrackResult } from '../track/track';
import type { KartVisual } from './KartVisual';
import type { InputFrame } from './Input';
import type { Effects } from './Effects';
import type { Audio } from './Audio';
import type { Items } from './Items';

const UP = new THREE.Vector3(0, 1, 0);
// ride height of the kart's center above the terrain, scaled with the kart
const RIDE_HEIGHT = 0.9 * KART_SCALE;

export interface Track {
  totalLen: number;
  samples: Sample[];
  halfWidth: number;
  sampleAtU: (u: number) => { sample: Sample; u: number; index: number };
  worldToTrack: (pos: { x: number; z: number }, hint?: number) => TrackResult;
}

export interface World {
  karts: Kart[];
  timeMs: number;
  totalLaps: number;
  effects: Effects;
  audio: Audio;
  items: Items;
}

export interface KartOptions {
  index: number;
  name: string;
  color: number;
  accent: number;
  track: Track;
  world: World;
  visual: KartVisual;
}

// Arcade kart physics tuned to feel instantly fun (genre-standard: heavy on
// grip, playful on drift) with faithful off-road slowdown, boost, and spin-out.
export class Kart {
  index: number;
  name: string;
  world: World;
  track: Track;
  isPlayer: boolean;

  pos: THREE.Vector3;
  yaw: number;
  speed: number;
  radius: number;

  trackHint: number;
  onRoad: boolean;

  spinning: number;      // >0 while slipping on a banana
  boostT: number;
  shieldT: number;
  starT: number;
  padT: number;          // >0 while boosted by a track boost pad
  item: string | null;

  drifting: boolean;
  driftT: number;

  lap: number;
  dist: number;          // cumulative along-track distance this lap
  prevU: number;
  finished: boolean;
  finishTime: number | null;
  raceTime: number;
  respawnT: number;
  rouletteT: number;     // item-box reveal countdown before the item locks in

  visual: KartVisual;
  visualRoot: THREE.Group;
  color: number;
  terrainFactor!: number;

  constructor({ index, name, color, track, world, visual }: KartOptions) {
    this.index = index;
    this.name = name;
    this.world = world;
    this.track = track;
    this.isPlayer = index === 0;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.radius = 1.05 * KART_SCALE;

    this.trackHint = 0;
    this.onRoad = true;

    this.spinning = 0;      // >0 while slipping on a banana
    this.boostT = 0;
    this.shieldT = 0;
    this.starT = 0;
    this.padT = 0;
    this.item = null;

    this.drifting = false;
    this.driftT = 0;

    this.lap = 0;
    this.dist = 0;          // cumulative along-track distance this lap
    this.prevU = 0;
    this.finished = false;
    this.finishTime = null;
    this.raceTime = 0;
    this.respawnT = 0;
    this.rouletteT = 0;     // item-box reveal countdown before the item locks in

    this.visual = visual;
    this.visualRoot = visual.root;
    this.color = color;
  }

  setPos(x: number, z: number) {
    this.pos.set(x, terrainHeight(x, z) + RIDE_HEIGHT, z);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + RIDE_HEIGHT;
  }
  faceTangent(u: number) {
    const { sample } = this.track.sampleAtU(u);
    this.yaw = Math.atan2(sample.tx, sample.tz);
  }
  placeAt(u: number, lateral: number) {
    const { sample } = this.track.sampleAtU(u);
    const x = sample.x + sample.nx * lateral;
    const z = sample.z + sample.nz * lateral;
    this.setPos(x, z);
    this.yaw = Math.atan2(sample.tx, sample.tz);
    this.dist = u;
    this.lap = 0;
    this.prevU = u;
  }

  // Re-drop the kart onto the track when it goes far off-road / gets stuck.
  respawn() {
    const s = this.track.samples[this.trackHint] || this.track.samples[0];
    this.setPos(s.x, s.z);
    this.yaw = Math.atan2(s.tx, s.tz);
    this.speed = 0;
    this.spinning = 0;
    this.respawnT = 0;
    this.world.effects.ring(this.pos.clone().setY(this.pos.y + 0.6 * KART_SCALE), new THREE.Color(0.45, 0.85, 1), 2.2);
  }

  useItem() {
    if (!this.item) return;
    const id = this.item;
    this.item = null;
    this.world.items.use(this, id);
  }

  hitBanana(): boolean {
    if (this.shieldT > 0 || this.spinning > 0) return false;
    this.spinning = PHYS.bananaSpinMs / 1000;
    this.speed *= 0.62;
    this.world.effects.spinStars(this.pos.clone().setY(this.pos.y + 0.4 * KART_SCALE), 12);
    this.world.audio.slip();
    return true;
  }

  // A shielded (star) kart plows into this one: hard shove + brief spin.
  hitPlow(shoveDir: THREE.Vector3) {
    if (this.shieldT > 0 || this.spinning > 0) return;
    this.spinning = Math.max(this.spinning, 0.65);
    this.speed *= 0.35;
    this.pos.addScaledVector(shoveDir, 2.2 * KART_SCALE);
    this.world.effects.spinStars(this.pos.clone().setY(this.pos.y + 0.4 * KART_SCALE), 8);
    this.world.audio.hit();
  }

  #miniTurbo() {
    this.boostT = 1.3;
    this.world.audio.boost();
    this.world.effects.ring(this.pos.clone().setY(this.pos.y + 0.5 * KART_SCALE), new THREE.Color(1, 0.4, 0.2), 2.2);
    this.driftT = 0;
    this.drifting = false;
  }

  // Track boost pad: a moderate speed kick (refreshed while the kart stays on
  // the pad, so riding the racing line keeps you boosted).
  applyPad() {
    this.padT = PAD.time;
  }

  update(dt: number, input: InputFrame) {
    this.raceTime += dt;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + RIDE_HEIGHT;

    const t = this.track.worldToTrack(this.pos, this.trackHint);
    this.trackHint = t.index;
    this.onRoad = Math.abs(t.lat) <= this.track.halfWidth;
    this.terrainFactor = this.onRoad ? TERRAIN.road : TERRAIN.grass;

    if (this.spinning > 0) this.spinning -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.starT > 0) this.starT -= dt;
    if (this.padT > 0) this.padT -= dt;

    let steer = input.steer;
    const throttle = input.throttle;
    const brake = input.brake;

    if (this.spinning > 0) {
      this.yaw += dt * 9;
      this.speed *= 0.9;
    } else {
      // throttle / brake
      if (throttle > 0) {
        this.speed += PHYS.accel * throttle * this.terrainFactor * dt;
        this.speed = Math.min(this.speed, this.#topSpeed(false));
      } else if (brake) {
        if (this.speed > 0.5) this.speed -= PHYS.accel * 1.6 * dt;
        else this.speed = Math.max(this.speed - PHYS.accel * 0.8 * dt, PHYS.reverseSpeed);
      } else {
        this.speed *= (1 - 0.9 * dt);
      }

      // kart drift: hold GAS + BRAKE while moving fast (real kart-style).
      if (brake && throttle > 0 && Math.abs(this.speed) > PHYS.driftMinSpeed) {
        if (!this.drifting) { this.drifting = true; this.driftT = 0; }
        this.driftT += dt;
        steer *= PHYS.driftSteerBoost;
      } else {
        if (this.drifting && this.driftT >= PHYS.miniTurboMinTime / 1000 && Math.abs(this.speed) > PHYS.driftMinSpeed) {
          this.#miniTurbo();
        }
        this.drifting = false;
        this.driftT = 0;
      }

      // steering (clamped ratio so boost NEVER inverts the controls)
      const speedRatio = Math.min(1, Math.abs(this.speed) / PHYS.maxSpeed);
      const turn = PHYS.turnRate * (1 - PHYS.turnDropoff * speedRatio);
      this.yaw += steer * turn * dt;
    }

    // boost (star = sustained invincibility + modest speed; mushroom = burst;
    // pad = a track boost-pad kick, weakest of the three)
    const padBoost = this.padT > 0;
    const boosting = this.boostT > 0 || this.starT > 0 || padBoost;
    if (this.starT > 0) this.speed += PHYS.boost.star.force * dt;
    else if (this.boostT > 0) this.speed += PHYS.boost.mushroom.force * dt;
    else if (padBoost) this.speed += PAD.force * dt;
    this.speed = Math.min(this.speed, this.#topSpeed(boosting));

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.z += fwd.z * this.speed * dt;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -250, 250);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -250, 250);

    // track progress + laps
    const t2 = this.track.worldToTrack(this.pos, this.trackHint);
    this.trackHint = t2.index;

    // soft edge walls: let the kart run a little onto the grass, then gently
    // push it back toward the road so it's hard to actually leave the track.
    const maxLat = this.track.halfWidth + 4.5;
    if (Math.abs(t2.lat) > maxLat) {
      const s = this.track.sampleAtU(t2.u).sample;
      const over = Math.abs(t2.lat) - maxLat;
      const dx = s.x - this.pos.x, dz = s.z - this.pos.z;
      const len = Math.hypot(dx, dz) || 1;
      this.pos.x += (dx / len) * over;
      this.pos.z += (dz / len) * over;
      this.speed *= 0.985;
    }

    const L = this.track.totalLen;
    let du = t2.u - this.prevU;
    if (du < -L * 0.5) du += L;
    else if (du > L * 0.5) du -= L;
    this.prevU = t2.u;
    this.dist += du;
    if (this.dist >= L) {
      this.dist -= L;
      if (!this.finished) {
        this.lap++;
        if (this.lap >= this.world.totalLaps) {
          this.finished = true;
          this.finishTime = this.raceTime;
        } else {
          this.world.audio.lap();
        }
      }
    }

    this.#orient(dt, steer);
    this.#visuals(dt, steer, boosting);
  }

  #topSpeed(boost: boolean): number {
    const base = PHYS.maxSpeed * this.terrainFactor;
    if (!boost) return base;
    if (this.starT > 0) return PHYS.boost.star.top;
    if (this.boostT > 0) return PHYS.boost.mushroom.top;
    if (this.padT > 0) return PAD.top;
    return base;
  }

  #orient(dt: number, steer: number) {
    this.visualRoot.position.copy(this.pos);
    const n = terrainNormal(this.pos.x, this.pos.z);
    const yawQ = new THREE.Quaternion().setFromAxisAngle(UP, this.yaw);
    const pitchQ = new THREE.Quaternion().setFromUnitVectors(UP, n);
    let target = new THREE.Quaternion().multiplyQuaternions(yawQ, pitchQ);
    // add roll lean in local frame (into the turn)
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), steer * 0.35);
    target = target.multiply(rollQ);
    this.visualRoot.quaternion.slerp(target, Math.min(1, 10 * dt));
  }

  #visuals(dt: number, steer: number, boosting: boolean) {
    const v = this.visual;
    const rot = (this.speed / 0.42) * dt;
    for (const w of v.wheels) w.rotation.x -= rot;
    for (const w of v.wheels) if (w.userData.front) w.rotation.y = steer * 0.5;
    if (boosting) {
      const dir = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      this.world.effects.boost(this.pos.clone().setY(this.pos.y + 0.5), dir, new THREE.Color(1, 0.6, 0.2), 4);
    }
    if (this.drifting) {
      this.world.effects.dust(this.pos.clone().setY(this.pos.y + 0.2), undefined, 2);
    }
    if (this.shieldT > 0) v.setShield(true, this.raceTime); else v.setShield(false, 0);
  }
}
