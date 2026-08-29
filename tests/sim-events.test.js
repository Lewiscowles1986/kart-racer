import { describe, it, expect } from 'vitest';
import { SimEventQueue } from '../src/sim/events';

describe('SimEventQueue (M1 step 4, J-4)', () => {
  it('preserves emission order and drains atomically', () => {
    const q = new SimEventQueue();
    q.emit({ t: 'sfx', name: 'pickup' });
    q.emit({ t: 'ring', at: { x: 1, y: 2, z: 3 }, rgb: [1, 0, 0], max: 2 });
    const out = q.drain();
    expect(out.map((e) => e.t)).toEqual(['sfx', 'ring']);
    expect(q.length).toBe(0); // drained
    expect(q.drain()).toEqual([]); // second drain is empty
  });

  it('events are plain data (JSON-serialisable — the EVENT message contract)', () => {
    const q = new SimEventQueue();
    q.emit({ t: 'boostTrail', at: { x: 0, y: 0.5, z: 0 }, dir: { x: 0, y: 0, z: 1 }, rgb: [1, 0.6, 0.2], count: 4 });
    q.emit({ t: 'dust', at: { x: 0, y: 0, z: 0 }, count: 2 });
    q.emit({ t: 'spinStars', at: { x: 0, y: 1, z: 0 }, count: 12 });
    const round = JSON.parse(JSON.stringify(q.drain()));
    expect(round).toHaveLength(3);
    expect(round[0].t).toBe('boostTrail');
  });

  it('clear() empties without returning events (race restart)', () => {
    const q = new SimEventQueue();
    q.emit({ t: 'sfx', name: 'star' });
    q.clear();
    expect(q.drain()).toEqual([]);
    expect(q.length).toBe(0);
  });

  it('sfx names are limited to the known sound catalogue', () => {
    const q = new SimEventQueue();
    for (const name of ['slip', 'hit', 'boost', 'jump', 'land', 'lap', 'pickup', 'star']) {
      q.emit({ t: 'sfx', name });
    }
    expect(q.length).toBe(8);
  });
});