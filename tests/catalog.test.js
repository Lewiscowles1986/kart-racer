import { describe, it, expect } from 'vitest';
import { TRACKS } from '../src/config';
import { upsertCustomLevel } from '../src/game/catalog';

const BASE = JSON.stringify(TRACKS);

const fakeLevel = {
  name: 'Test Loop',
  points: [[10, 10], [20, 10], [20, 20], [10, 20]],
  trees: [[15, 15, 2]],
  objects: [
    { type: 'box', frac: 0.25, lateral: 0 },
    { type: 'pad', frac: 0.5, lateral: -1 },
    { type: 'jump', frac: 0.75, lateral: 1 },
  ],
};

describe('track catalog immutability (M1 step 2, J-2)', () => {
  it('never mutates the exported TRACKS; returns a patched copy', () => {
    const next = upsertCustomLevel(TRACKS, fakeLevel);
    expect(JSON.stringify(TRACKS)).toBe(BASE); // global catalog untouched
    expect(next).not.toBe(TRACKS);
    const custom = next[next.length - 1];
    expect(custom.id).toBe('custom');
    expect(custom.name).toBe('Test Loop');
    expect(custom.itemBoxes).toHaveLength(1);
    expect(custom.boostPads).toHaveLength(1);
    expect(custom.jumps).toHaveLength(1);
    expect(JSON.stringify(TRACKS)).toBe(BASE); // still untouched after the call
  });

  it('upserts: a second custom level replaces the custom entry instead of appending', () => {
    const first = upsertCustomLevel(TRACKS, fakeLevel);
    const second = upsertCustomLevel(first, { ...fakeLevel, name: 'V2' });
    expect(second.filter((t) => t.id === 'custom')).toHaveLength(1);
    expect(second[second.length - 1].name).toBe('V2');
    expect(second.length).toBe(first.length);
  });

  it('falls back to the catalog first track when points are missing (v1 parity)', () => {
    const next = upsertCustomLevel(TRACKS, { name: 'No Points' });
    expect(next[next.length - 1].points).toBe(TRACKS[0].points);
  });

  it('returns null for unusable levels (caller keeps catalog and drops storage)', () => {
    expect(upsertCustomLevel(TRACKS, null)).toBeNull();
    expect(upsertCustomLevel(TRACKS, 'not an object')).toBeNull();
  });

  it('TRACKS survives a whole game-level load sequence untouched', () => {
    for (const raw of [JSON.stringify(fakeLevel), JSON.stringify({ ...fakeLevel, name: 'V3' })]) {
      upsertCustomLevel(TRACKS, JSON.parse(raw));
    }
    expect(JSON.stringify(TRACKS)).toBe(BASE);
  });
});