import { describe, it, expect } from 'vitest';
import { scoreOf, collideKarts, fabricatePodium, GHOST_MS } from '../src/sim/raceSim';

function mk(partial) {
  return {
    isPlayer: partial.index === 0,
    pos: { x: 0, z: 0 },
    speed: 0, radius: 1, lap: 0, dist: 0, prevU: 0, trackHint: 0,
    finished: false, finishTime: null, respawnT: 0, ghostT: 0,
    shieldT: 0, respawn() {}, ...partial,
  };
}

describe('raceSim podium fabrication (M1 step 8, GP-7 fix)', () => {
  it('assigns fabricated times in RACE order, not array order', () => {
    const karts = [
      mk({ index: 0, name: 'You', isPlayer: true, finished: true, finishTime: 100, lap: 3, dist: 10 }),
      mk({ index: 1, name: 'Trail', isPlayer: false, finished: false, finishTime: null, lap: 1, dist: 5 }),
      mk({ index: 2, name: 'Ahead', isPlayer: false, finished: false, finishTime: null, lap: 2, dist: 200 }),
    ];
    fabricatePodium(karts, 3, 100);
    const ahead = karts[2], trail = karts[1];
    expect(ahead.finished).toBe(true);
    expect(ahead.finishTime).toBeLessThan(trail.finishTime); // the fix: position order
    expect(ahead.finishTime).toBeCloseTo(100.6, 9);
    expect(trail.finishTime).toBeCloseTo(101.2, 9);
  });

  it('scoreOf: finished karts always outrank unfinished; lap-major ordering', () => {
    const fin = mk({ index: 0, name: 'f', finished: true, finishTime: 50 });
    const lap2 = mk({ index: 1, name: 'l2', lap: 2, dist: 0 });
    const lap1far = mk({ index: 2, name: 'l1', lap: 1, dist: 400 });
    expect(scoreOf(fin, 3)).toBeGreaterThan(scoreOf(lap2, 3));
    expect(scoreOf(lap2, 3)).toBeGreaterThan(scoreOf(lap1far, 3));
  });

  it('fabricatePodium stops everyone (speed 0) and never touches already-finished karts', () => {
    const karts = [
      mk({ index: 0, name: 'a', finished: true, finishTime: 42, speed: 99 }),
      mk({ index: 1, name: 'b', dist: 999, speed: 7 }),
    ];
    fabricatePodium(karts, 2, 42);
    expect(karts[0].finishTime).toBe(42);
    expect(karts[1].speed).toBe(0);
    expect(karts[1].finished).toBe(true);
  });
});

describe('raceSim ghost grace (M1 step 8, GP-9 fix)', () => {
  it('ghosted karts are skipped by the collision pass entirely', () => {
    const a = mk({ index: 0, name: 'ghost', ghostT: GHOST_MS / 1000, speed: 5 });
    const b = mk({ index: 1, name: 'next', speed: -2 });
    a.pos = { x: 0, z: 0 }; b.pos = { x: 0.5, z: 0 }; // overlapping
    collideKarts([a, b]);
    expect(a.speed).toBe(5); // untouched
    expect(b.speed).toBe(-2);
    expect(a.ghostT).toBeGreaterThan(0);
  });

  it('non-ghost karts still push apart (v1 parity of the pair loop)', () => {
    const a = mk({ index: 0, name: 'a', ghostT: 0, speed: 5 });
    const b = mk({ index: 1, name: 'b', ghostT: 0, speed: 0 });
    a.pos = { x: 0, z: 0 };
    b.pos = { x: 0.5, z: 0 };
    collideKarts([a, b]);
    expect(Math.hypot(b.pos.x - a.pos.x, b.pos.z - a.pos.z)).toBeGreaterThanOrEqual(0.5);
    expect(a.speed).not.toBe(5); // momentum exchange happened
  });
});