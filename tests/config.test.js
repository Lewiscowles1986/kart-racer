import { describe, it, expect } from 'vitest';
import { RACE, PHYS, TERRAIN, ITEM, CAMERA, WORLD, GRID_GAP, TRACKS } from '../src/config';

describe('config sanity', () => {
  it('race has a sensible kart count and laps', () => {
    expect(RACE.kartCount).toBeGreaterThanOrEqual(2);
    expect(RACE.totalLaps).toBeGreaterThanOrEqual(1);
    expect(RACE.respawnTimeoutMs).toBeGreaterThan(0);
  });

  it('steering never inverts: turnDropoff < 1', () => {
    expect(PHYS.turnDropoff).toBeLessThan(1);
    expect(PHYS.turnDropoff).toBeGreaterThan(0);
  });

  it('boost tops are above base max speed but not absurd', () => {
    expect(PHYS.boost.mushroom.top).toBeGreaterThan(PHYS.maxSpeed);
    expect(PHYS.boost.star.top).toBeGreaterThan(PHYS.maxSpeed);
    expect(PHYS.boost.mushroom.top).toBeLessThan(PHYS.maxSpeed * 2);
  });

  it('road is wide enough to be forgiving', () => {
    expect(WORLD.roadWidth).toBeGreaterThanOrEqual(10);
  });

  it('terrain factors are positive and road is faster than grass', () => {
    expect(TERRAIN.road).toBeGreaterThan(TERRAIN.grass);
    expect(TERRAIN.road).toBeGreaterThan(0);
  });

  it('camera FOV boost is a modest kick, not a seizure', () => {
    expect(CAMERA.fovBoost - CAMERA.fovBase).toBeLessThanOrEqual(20);
  });

  it('grid gap is positive', () => {
    expect(GRID_GAP).toBeGreaterThan(0);
  });

  it('exposes multiple selectable tracks with valid point loops', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(2);
    for (const t of TRACKS) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(Array.isArray(t.points)).toBe(true);
      expect(t.points.length).toBeGreaterThanOrEqual(4);
      for (const [x, z] of t.points) {
        expect(typeof x).toBe('number');
        expect(typeof z).toBe('number');
      }
    }
    // ids must be unique (used as keys)
    expect(new Set(TRACKS.map((t) => t.id)).size).toBe(TRACKS.length);
  });
});
