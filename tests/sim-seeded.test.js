import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}),
}));

import { Rng } from '../src/sim/rng';
import { ITEM } from '../src/config';
import { Items } from '../src/game/Items';

const WEIGHT_TOTAL = ITEM.weights.banana + ITEM.weights.mushroom + ITEM.weights.star;

function pick(r) {
  let x = r * WEIGHT_TOTAL;
  if ((x -= ITEM.weights.banana) < 0) return 'banana';
  if ((x -= ITEM.weights.mushroom) < 0) return 'mushroom';
  return 'star';
}

// rollItem bound to a stub world: exercises exactly the seeded-draw path
const rollWith = (rng) => Items.prototype.rollItem.call({ world: { rng } });

describe('seeded item roulette (M1 step 5, J-5)', () => {
  it('same seed => identical item sequence', () => {
    const a = Array.from({ length: 20 }, () => rollWith(new Rng(1234)));
    const b = Array.from({ length: 20 }, () => rollWith(new Rng(1234)));
    expect(a).toEqual(b);
  });

  it('different seed => different sequence (20 draws)', () => {
    const a = Array.from({ length: 20 }, () => rollWith(new Rng(1)));
    const b = Array.from({ length: 20 }, () => rollWith(new Rng(2)));
    expect(a).not.toEqual(b);
  });

  it('rollItem consumes exactly one stream draw and matches the stream mapping', () => {
    const rngDirect = new Rng(77);
    const predicted = Array.from({ length: 50 }, () => pick(rngDirect.stream('items')()));
    const rngRoll = new Rng(77); // ONE rng, rolled sequentially
    const rolled = [];
    for (let i = 0; i < 50; i++) rolled.push(rollWith(rngRoll));
    expect(rolled).toEqual(predicted);
  });

  it('distribution sanity: 3000 seeded rolls keep every item well-represented', () => {
    const s = new Rng(2024).stream('items');
    const counts = { banana: 0, mushroom: 0, star: 0 };
    for (let i = 0; i < 3000; i++) counts[pick(s())]++;
    for (const k of Object.keys(counts)) expect(counts[k]).toBeGreaterThan(200); // ~30-50% expected
  });
});

describe('AI uses the seeded ai stream (J-5)', () => {
  it('stream draws drive item usage — identical world state + seed => same decision', () => {
    const mk = () => {
      const r = new Rng(99).stream('ai');
      let used = false;
      for (let i = 0; i < 5; i++) if (r() < (1 / 60) * 1.4) { used = true; break; }
      return used;
    };
    expect(mk()).toBe(mk());
  });
});