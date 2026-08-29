import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}), itemBoxTexture: () => ({}),
}));

import { ItemsSim } from '../src/sim/itemsSim';

function makeSim() {
  return new ItemsSim({}); // rollItemForRank is pure — no track access
}

describe('rank-weighted roulette strength knob (SP/MP fairness split)', () => {
  it('strength 1 keeps the aggressive endpoints (leader junk, trailer stars)', () => {
    const sim = makeSim();
    // leader (s=1): banana .55 / mushroom .37 / star .08 (cumulative)
    expect(sim.rollItemForRank(() => 0.1, 1, 8, 1)).toBe('banana');
    expect(sim.rollItemForRank(() => 0.6, 1, 8, 1)).toBe('mushroom');
    // trailer (s=1): banana .10 / mushroom .48 / star .42 -> star above .58
    expect(sim.rollItemForRank(() => 0.6, 8, 8, 1)).toBe('star');
    expect(sim.rollItemForRank(() => 0.3, 8, 8, 1)).toBe('mushroom');
  });

  it('strength 0.5 (SP fairness) gives leaders a mushroom escape tool and softer star ceiling', () => {
    const sim = makeSim();
    // SAME draw, different mode: leader draw .45 is junk in MP, a mushroom
    // escape tool in SP; trailer draw .6 is a star in MP, just a mushroom in SP
    expect(sim.rollItemForRank(() => 0.45, 1, 8, 0.5)).toBe('mushroom');
    expect(sim.rollItemForRank(() => 0.45, 1, 8, 1)).toBe('banana');
    expect(sim.rollItemForRank(() => 0.6, 8, 8, 0.5)).toBe('mushroom');
    expect(sim.rollItemForRank(() => 0.6, 8, 8, 1)).toBe('star');
  });

  it('strength 0 collapses to the neutral baseline weights', () => {
    const sim = makeSim();
    const total = 30 + 45 + 25; // banana/mushroom/star from ITEM.weights
    const bananaEdge = 30 / total; // 0.3
    expect(sim.rollItemForRank(() => bananaEdge - 0.001, 1, 8, 0)).toBe('banana');
    expect(sim.rollItemForRank(() => bananaEdge + 0.001, 1, 8, 0)).toBe('mushroom');
  });

  it('same stream, same strength, same rank => same item (lockstep determinism)', () => {
    const a = makeSim(), b = makeSim();
    const draws = [0.05, 0.31, 0.44, 0.6, 0.77, 0.93];
    for (const d of draws) {
      for (const s of [0, 0.5, 1]) {
        expect(a.rollItemForRank(() => d, 3, 8, s)).toBe(b.rollItemForRank(() => d, 3, 8, s));
      }
    }
  });
});