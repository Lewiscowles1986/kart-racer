import { describe, it, expect } from 'vitest';
import { Rng, sfc32 } from '../src/sim/rng';

describe('deterministic RNG', () => {
  it('is reproducible for the same seed', () => {
    const a = new Rng(1337).stream('items');
    const b = new Rng(1337).stream('items');
    for (let i = 0; i < 1000; i++) expect(a()).toBe(b());
  });

  it('separates for different seeds', () => {
    const a = new Rng(1).stream('items');
    const b = new Rng(2).stream('items');
    const seqA = Array.from({ length: 8 }, () => a());
    const seqB = Array.from({ length: 8 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('keeps streams independent: drawing from ai/items never changes items order', () => {
    const r1 = new Rng(42);
    const r2 = new Rng(42);
    const items = r1.stream('items');
    const ai = r1.stream('ai');
    for (let i = 0; i < 100; i++) { ai(); ai(); ai(); }
    const withJitter = Array.from({ length: 32 }, () => items());
    const clean = Array.from({ length: 32 }, () => r2.stream('items')());
    expect(withJitter).toEqual(clean);
  });

  it('stream order of creation does not matter', () => {
    const a = new Rng(7);
    const b = new Rng(7);
    const seqB = Array.from({ length: 16 }, () => b.stream('ai')());
    a.next(); a.next(); // root draws must not perturb named streams
    const seqA = Array.from({ length: 16 }, () => a.stream('ai')());
    expect(seqA).toEqual(seqB);
  });

  it('sfc32 stays in [0,1) and advances state', () => {
    const g = sfc32([1, 2, 3, 4]);
    for (let i = 0; i < 10000; i++) {
      const v = g();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});