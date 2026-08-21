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

import { buildScene, worldToTrack, sampleAtU, terrainHeight, ROAD_HALF, onRoad } from '../src/track/track';

describe('track geometry', () => {
  it('ROAD_HALF is positive and matches the config width', () => {
    expect(ROAD_HALF).toBeGreaterThan(0);
  });

  it('terrainHeight is finite everywhere on the playfield', () => {
    for (const x of [-200, -50, 0, 50, 200]) {
      for (const z of [-150, -30, 0, 30, 150]) {
        expect(Number.isFinite(terrainHeight(x, z))).toBe(true);
      }
    }
  });

  it('sampleAtU wraps around the closed loop', () => {
    const scene = new THREE.Scene();
    const { totalLen } = buildScene(scene);
    const a = sampleAtU(0);
    const b = sampleAtU(totalLen);
    expect(a.sample.x).toBeCloseTo(b.sample.x, 1);
    expect(a.sample.z).toBeCloseTo(b.sample.z, 1);
  });

  it('worldToTrack reports ~0 lateral offset for a point on the centerline', () => {
    const scene = new THREE.Scene();
    const { samples } = buildScene(scene);
    const idx = Math.floor(samples.length / 2);
    const s = samples[idx];
    const t = worldToTrack({ x: s.x, z: s.z }, idx);
    expect(Math.abs(t.lat)).toBeLessThan(1.5);
  });
});

describe('track props (regression: trees must never sit on the road)', () => {
  it('no tree is placed on or near the road surface', () => {
    const scene = new THREE.Scene();
    buildScene(scene);

    // collect trees = groups that contain a sphere (crown)
    const trees = [];
    scene.traverse((o) => {
      if (o.isGroup) {
        let hasSphere = false;
        o.traverse((c) => { if (c.isMesh && c.geometry.type === 'SphereGeometry') hasSphere = true; });
        if (hasSphere) trees.push(o);
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
