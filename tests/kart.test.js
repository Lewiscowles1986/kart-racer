import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}),
}));

import { buildScene, Track } from '../src/track/track';
import { TRACKS, WORLD } from '../src/config';
import { Kart } from '../src/game/Kart';
import { SimEventQueue } from '../src/sim/events';

function makeKart() {
  const scene = new THREE.Scene();
  const track = new Track(TRACKS[0].points, WORLD.roadWidth);
  buildScene(scene, track);
  const world = {
    events: new SimEventQueue(), // J-4: sim emits events; presentation pumps them
    items: { use() {} },
    karts: [],
    timeMs: 0,
    totalLaps: 3,
  };
  const visual = { root: new THREE.Group(), wheels: [], driver: new THREE.Group(), setShield() {}, orient() {}, animate() {} };
  const kart = new Kart({ index: 0, name: 'You', color: 0xff0000, accent: 0xffffff, track, world, visual });
  return { kart, world, samples: track.samples };
}

const input = (steer) => ({ steer, throttle: 1, brake: false, itemPressed: false, itemHeld: false });

describe('Kart physics', () => {
  it('steering: steer=-1 (right) decreases yaw -> turns right', () => {
    const { kart, samples } = makeKart();
    const s = samples[0];
    kart.setPos(s.x, s.z);
    kart.yaw = 0;
    kart.speed = 10;
    const yaw0 = kart.yaw;
    kart.update(1 / 60, input(-1));
    expect(kart.yaw).toBeLessThan(yaw0);
  });

  it('steering: steer=+1 (left) increases yaw', () => {
    const { kart, samples } = makeKart();
    const s = samples[0];
    kart.setPos(s.x, s.z);
    kart.yaw = 0;
    kart.speed = 10;
    const yaw0 = kart.yaw;
    kart.update(1 / 60, input(1));
    expect(kart.yaw).toBeGreaterThan(yaw0);
  });

  it('speed is clamped to top speed (no runaway)', () => {
    const { kart, samples } = makeKart();
    const s = samples[0];
    kart.setPos(s.x, s.z);
    kart.speed = 1000;
    kart.update(1 / 60, input(0));
    expect(kart.speed).toBeLessThanOrEqual(50);
  });

  it('a banana hit spins the kart, slows it, and emits spin+sfx events (J-4 contract)', () => {
    const { kart, world } = makeKart();
    kart.speed = 20;
    const ok = kart.hitBanana();
    expect(ok).toBe(true);
    expect(kart.spinning).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(20);
    const evs = world.events.drain();
    expect(evs.map((e) => e.t)).toEqual(['spinStars', 'sfx']);
    expect(evs[1].name).toBe('slip');
  });

  it('a shielded kart is immune to banana hits', () => {
    const { kart } = makeKart();
    kart.shieldT = 1;
    const ok = kart.hitBanana();
    expect(ok).toBe(false);
    expect(kart.spinning).toBe(0);
  });
});
