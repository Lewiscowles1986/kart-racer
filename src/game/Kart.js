import * as THREE from 'three';
import { PHYS, TERRAIN } from '../config.js';
import { terrainHeight, terrainNormal, worldToTrack } from '../track/track.js';

const UP = new THREE.Vector3(0, 1, 0);

// Arcade kart physics tuned to feel instantly fun (genre-standard: heavy on
// grip, playful on drift) with faithful off-road slowdown, boost, and spin-out.
export class Kart {
  constructor({ index, name, color, accent, track, world, visual }) {
    this.index = index;
    this.name = name;
    this.world = world;
    this.track = track;
    this.isPlayer = index === 0;

    this.pos = new THREE.Vector3();
    this.yaw = 0;
    this.speed = 0;
    this.radius = 1.05;

    this.trackHint = 0;
    this.onRoad = true;

    this.spinning = 0;      // >0 while slipping on a banana
    this.boostT = 0;
    this.shieldT = 0;
    this.starT = 0;
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

  setPos(x, z) {
    this.pos.set(x, terrainHeight(x, z) + 0.9, z);
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + 0.9;
  }
  faceTangent(u) {
    const { sample } = this.track.sampleAtU(u);
    this.yaw = Math.atan2(sample.tx, sample.tz);
  }
  placeAt(u, lateral) {
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
    this.world.effects.ring(this.pos.clone().setY(this.pos.y + 0.6), new THREE.Color(0.45, 0.85, 1), 2.2);
  }

  useItem() {
    if (!this.item) return;
    const id = this.item;
    this.item = null;
    this.world.items.use(this, id);
  }

  hitBanana() {
    if (this.shieldT > 0 || this.spinning > 0) return false;
    this.spinning = PHYS.bananaSpinMs / 1000;
    this.speed *= 0.62;
    this.world.effects.spinStars(this.pos.clone().setY(this.pos.y + 0.4), 12);
    this.world.audio.slip();
    return true;
  }

  // A shielded (star) kart plows into this one: hard shove + brief spin.
  hitPlow(shoveDir) {
    if (this.shieldT > 0 || this.spinning > 0) return;
    this.spinning = Math.max(this.spinning, 0.65);
    this.speed *= 0.35;
    this.pos.addScaledVector(shoveDir, 2.2);
    this.world.effects.spinStars(this.pos.clone().setY(this.pos.y + 0.4), 8);
    this.world.audio.hit();
  }

  #miniTurbo() {
    this.boostT = 1.3;
    this.world.audio.boost();
    this.world.effects.ring(this.pos.clone().setY(this.pos.y + 0.5), new THREE.Color(1, 0.4, 0.2), 2.2);
    this.driftT = 0;
    this.drifting = false;
  }

  update(dt, input) {
    this.raceTime += dt;
    this.pos.y = terrainHeight(this.pos.x, this.pos.z) + 0.9;

    const t = worldToTrack(this.pos, this.trackHint);
    this.trackHint = t.index;
    this.onRoad = Math.abs(t.lat) <= this.track.halfWidth;
    this.terrainFactor = this.onRoad ? TERRAIN.road : TERRAIN.grass;

    if (this.spinning > 0) this.spinning -= dt;
    if (this.boostT > 0) this.boostT -= dt;
    if (this.shieldT > 0) this.shieldT -= dt;
    if (this.starT > 0) this.starT -= dt;

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

    // boost (star = sustained invincibility + modest speed; mushroom = burst)
    const boosting = this.boostT > 0 || this.starT > 0;
    if (boosting) this.speed += (this.starT > 0 ? PHYS.boost.star : PHYS.boost.mushroom).force * dt;
    this.speed = Math.min(this.speed, this.#topSpeed(boosting));

    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.pos.x += fwd.x * this.speed * dt;
    this.pos.z += fwd.z * this.speed * dt;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -250, 250);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -250, 250);

    // track progress + laps
    const t2 = worldToTrack(this.pos, this.trackHint);
    this.trackHint = t2.index;
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

  #topSpeed(boost) {
    const base = PHYS.maxSpeed * this.terrainFactor;
    if (!boost) return base;
    return this.starT > 0 ? PHYS.boost.star.top : PHYS.boost.mushroom.top;
  }

  #orient(dt, steer) {
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

  #visuals(dt, steer, boosting) {
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
