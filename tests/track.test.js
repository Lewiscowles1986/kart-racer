import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

// The texture module needs a DOM canvas; mock it so we can build the scene in Node.
vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}),
  curbTexture: () => ({}),
  dirtTexture: () => ({}),
  grassTexture: () => ({}),
  sandTexture: () => ({}),
  woodTexture: () => ({}),
}));

import { buildScene, Track, terrainHeight, ROAD_HALF } from '../src/track/track';
import { TRACKS, WORLD } from '../src/config';

function makeTrack() {
  const track = new Track(TRACKS[0].points, WORLD.roadWidth);
  const scene = new THREE.Scene();
  buildScene(scene, track);
  return { track, scene };
}

describe('track geometry', () => {
  it('ROAD_HALF is positive and matches the config width', () => {
    expect(ROAD_HALF).toBeGreaterThan(0);
    expect(ROAD_HALF).toBe(WORLD.roadWidth / 2);
  });

  it('terrainHeight is finite everywhere on the playfield', () => {
    for (const x of [-200, -50, 0, 50, 200]) {
      for (const z of [-150, -30, 0, 30, 150]) {
        expect(Number.isFinite(terrainHeight(x, z))).toBe(true);
      }
    }
  });

  it('sampleAtU wraps around the closed loop', () => {
    const { track } = makeTrack();
    const a = track.sampleAtU(0);
    const b = track.sampleAtU(track.totalLen);
    expect(a.sample.x).toBeCloseTo(b.sample.x, 1);
    expect(a.sample.z).toBeCloseTo(b.sample.z, 1);
  });

  it('worldToTrack reports ~0 lateral offset for a point on the centerline', () => {
    const { track } = makeTrack();
    const idx = Math.floor(track.samples.length / 2);
    const s = track.samples[idx];
    const t = track.worldToTrack({ x: s.x, z: s.z }, idx);
    expect(Math.abs(t.lat)).toBeLessThan(1.5);
  });

  it('each selectable track builds a closed loop with positive length', () => {
    for (const def of TRACKS) {
      const track = new Track(def.points, WORLD.roadWidth);
      expect(track.totalLen).toBeGreaterThan(0);
      expect(track.samples.length).toBeGreaterThan(0);
      expect(track.halfWidth).toBe(WORLD.roadWidth / 2);
      const a = track.sampleAtU(0);
      const b = track.sampleAtU(track.totalLen);
      expect(a.sample.x).toBeCloseTo(b.sample.x, 1);
      expect(a.sample.z).toBeCloseTo(b.sample.z, 1);
    }
  });
});

describe('track props (regression: trees must never sit on the road)', () => {
  it('no tree is placed on or near the road surface', () => {
    const { scene } = makeTrack();

    // collect trees = groups whose direct child is a sphere (crown). The track
    // root group now wraps everything, so we only match the per-tree groups.
    const trees = [];
    scene.traverse((o) => {
      if (o.isGroup && o.children.some((c) => c.isMesh && c.geometry.type === 'SphereGeometry')) {
        trees.push(o);
      }
    });
    expect(trees.length).toBeGreaterThan(0);

    // road edge vertices (the asphalt mesh sits at y=0.06)
    let roadVerts = [];
    scene.traverse((o) => {
      if (o.isMesh && Math.abs(o.position.y - 0.06) < 0.01) {
        const p = o.geometry.attributes.position;
        for (let i = 0; i < p.count; i++) roadVerts.push([p.getX(i), p.getZ(i)]);
      }
    });
    expect(roadVerts.length).toBeGreaterThan(0);

    for (const t of trees) {
      let minD = Infinity;
      for (const [vx, vz] of roadVerts) {
        const d = Math.hypot(t.position.x - vx, t.position.z - vz);
        if (d < minD) minD = d;
      }
      // tree must be well clear of the road edge (>= 5m)
      expect(minD).toBeGreaterThan(5);
    }
  });
});
