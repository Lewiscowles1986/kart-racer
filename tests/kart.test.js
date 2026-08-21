import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}),
}));

import { buildScene, sampleAtU } from '../src/track/track';
import { Kart } from '../src/game/Kart';

function makeKart() {
  const scene = new THREE.Scene();
  const { totalLen, samples, halfWidth } = buildScene(scene);
  const track = { totalLen, samples, halfWidth, sampleAtU };
  const world = {
    effects: { boost() {}, dust() {}, spinStars() {}, ring() {} },
    audio: { lap() {}, slip() {}, hit() {}, boost() {} },
    items: { use() {} },
    karts: [],
  };
  const visual = { root: new THREE.Group(), wheels: [], driver: new THREE.Group(), setShield() {} };
  const kart = new Kart({ index: 0, name: 'You', color: 0xff0000, accent: 0xffffff, track, world, visual });
  return { kart, samples };
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

  it('a banana hit spins the kart and slows it', () => {
    const { kart } = makeKart();
    kart.speed = 20;
    const ok = kart.hitBanana();
    expect(ok).toBe(true);
    expect(kart.spinning).toBeGreaterThan(0);
    expect(kart.speed).toBeLessThan(20);
  });

  it('a shielded kart is immune to banana hits', () => {
    const { kart } = makeKart();
    kart.shieldT = 1;
    const ok = kart.hitBanana();
    expect(ok).toBe(false);
    expect(kart.spinning).toBe(0);
  });
});
