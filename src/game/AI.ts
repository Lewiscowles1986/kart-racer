import type { Kart, Track, World } from './Kart';
import type { InputFrame } from './Input';
import type { RngStream } from '../sim/rng';

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Friendly rubber-banded AI that races the track, steers through corners,
// grabs item boxes and uses them at smart moments — never unfair, always fun.
export class AI {
  track: Track;
  world: World;
  #rand: RngStream; // dedicated 'ai' stream (J-5): never Math.random in sim

  constructor({ track, world }: { track: Track; world: World }) {
    this.track = track;
    this.world = world;
    this.#rand = world.rng.stream('ai');
  }

  // Basic but convincing racing AI producing an Input-shaped object per frame.
  think(kart: Kart, dt: number): InputFrame {
    const u = kart.prevU;
    const look = 13;
    const p2 = this.track.sampleAtU(u + look).sample;
    const desiredYaw = Math.atan2(p2.x - kart.pos.x, p2.z - kart.pos.z);
    let dYaw = wrapAngle(desiredYaw - kart.yaw);
    let steer = Math.max(-1, Math.min(1, dYaw / 0.6));

    // curvature of the road ahead -> ease off the throttle for sharper bends
    const a1 = Math.atan2(this.track.sampleAtU(u + look).sample.tx, this.track.sampleAtU(u + look).sample.tz);
    const a2 = Math.atan2(this.track.sampleAtU(u + look * 2).sample.tx, this.track.sampleAtU(u + look * 2).sample.tz);
    const curve = Math.abs(wrapAngle(a2 - a1)) / look;
    let throttle = 1;
    const brake = false; // AI corners by lifting, never "brake" (avoids an unwanted drift)
    if (curve > 0.06) throttle = Math.max(0.25, 1 - (curve - 0.06) * 9);
    if (curve > 0.13) throttle = 0.3;

    // rubber-banding keeps races exciting — softened after playtest feedback
    // ("too hard to win"): the AI pack no longer glues itself to the player
    const player = this.world.karts[0];
    if (!kart.isPlayer && player) {
      const behind = kart.lap < player.lap || (kart.lap === player.lap && kart.dist < player.dist);
      if (behind) throttle = Math.min(1, throttle * 1.12);
      else if (kart.lap === player.lap && kart.dist > player.dist + 65) throttle *= 0.92;
    }

    // steering wobble so they feel human
    const noise = Math.sin(this.world.timeMs / 900 + kart.index * 2.4) * 0.12;
    steer = Math.max(-1, Math.min(1, steer + noise));

    // use item when it pays off (deterministic per-stream draw)
    let itemPressed = false;
    if (kart.item) {
      if (this.#rand() < dt * 1.4) {
        if (kart.item === 'banana' && this.#hasOpponentBehind(kart)) itemPressed = true;
        else if (kart.item === 'star') itemPressed = true;
        else if (kart.item === 'mushroom') itemPressed = true;
      }
    }

    return { steer, throttle, brake, itemPressed, itemHeld: false };
  }

  #hasOpponentBehind(kart: Kart): boolean {
    const L = this.track.totalLen;
    for (const k of this.world.karts) {
      if (k === kart) continue;
      let d = kart.prevU - k.prevU;
      if (d < -L / 2) d += L;
      if (d > 0 && d < 30) return true;
    }
    return false;
  }
}
