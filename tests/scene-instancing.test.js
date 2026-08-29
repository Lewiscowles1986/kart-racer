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

import { buildScene, Track, terrainHeight } from '../src/track/track';
import { TRACKS, WORLD } from '../src/config';

function makeTrack(opts) {
  const track = new Track(TRACKS[0].points, WORLD.roadWidth);
  const scene = new THREE.Scene();
  const group = buildScene(scene, track, opts);
  return { track, scene, group };
}

// AR-12 regression: fence posts and trees must be drawn via InstancedMeshes
// instead of one mesh per post / trunk / crown.
describe('scene instancing (fence + trees)', () => {
  it('draws all fence posts from one InstancedMesh and all trees from two', () => {
    const { track, group } = makeTrack();

    const expectedPosts = Math.ceil(track.samples.length / 4);
    const instanced = [];
    let meshCount = 0;
    group.traverse((o) => {
      if (!o.isMesh) return;
      meshCount++;
      if (o.isInstancedMesh) instanced.push(o);
    });

    const postIM = instanced.filter((o) => o.geometry.type === 'CylinderGeometry' && o.count === expectedPosts);
    expect(postIM.length).toBe(1);            // every post, one draw call
    expect(instanced.filter((o) => o.geometry.type === 'SphereGeometry').length).toBe(1);  // crowns
    expect(instanced.filter((o) => o.geometry.type === 'CylinderGeometry' && o.count !== expectedPosts).length).toBe(1); // trunks

    const crowns = instanced.find((o) => o.geometry.type === 'SphereGeometry');
    expect(crowns.count).toBe(65);            // TREE_TARGET 55 + 10 giant horizon landmarks

    // whole track group must stay far below the pre-instancing ~386 meshes
    // (ground + shoulder + road + 2 kerbs + posts IM + trunk IM + crown IM + 3 banner parts)
    expect(meshCount).toBeLessThanOrEqual(11);
  });

  it('per-tree instances reproduce buildTree placement, scale and colors', () => {
    const trees = [[-80, 40, 1.2], [30, -95, 2.1], [140, 70, 0.95]];
    const { group } = makeTrack({ trees });

    const trunks = [], crowns = [];
    group.traverse((o) => {
      if (!o.isInstancedMesh) return;
      if (o.geometry.type === 'CylinderGeometry' && o.count === trees.length) trunks.push(o);
      if (o.geometry.type === 'SphereGeometry' && o.count === trees.length) crowns.push(o);
    });
    expect(trunks.length).toBe(1);
    expect(crowns.length).toBe(1);
    expect(trunks[0].count).toBe(trees.length);
    expect(crowns[0].count).toBe(trees.length);

    const mtx = new THREE.Matrix4(), pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    for (let i = 0; i < trees.length; i++) {
      const [x, z, r] = trees[i];
      const y = terrainHeight(x, z);

      trunks[0].getMatrixAt(i, mtx); mtx.decompose(pos, quat, scl);
      expect(pos.x).toBeCloseTo(x, 5);
      expect(pos.y).toBeCloseTo(y + r * 0.7, 5);
      expect(pos.z).toBeCloseTo(z, 5);
      expect(scl.x).toBeCloseTo(r, 5);        // uniform radial/height scale ⇒ same silhouette
      expect(scl.y).toBeCloseTo(r, 5);

      crowns[0].getMatrixAt(i, mtx); mtx.decompose(pos, quat, scl);
      expect(pos.x).toBeCloseTo(x, 5);
      expect(pos.y).toBeCloseTo(y + r * 2.0, 5);
      expect(pos.z).toBeCloseTo(z, 5);
      expect(scl.x).toBeCloseTo(r, 5);
      expect(scl.y).toBeCloseTo(r * 1.15, 5); // same crown squash as buildTree
      expect(scl.z).toBeCloseTo(r, 5);
    }

    // same material colors buildTree always used
    expect(trunks[0].material.color.getHex()).toBe(0x7a4a24);
    expect(crowns[0].material.color.getHex()).toBe(0x3f9d3c);
    expect(trunks[0].castShadow).toBe(true);
    expect(crowns[0].castShadow).toBe(true);
  });
});