import * as THREE from 'three';
import { asphaltTexture, curbTexture, dirtTexture, grassTexture } from '../util/tex';

// ---- Pure geometry lives in the deterministic sim core (M1 step 1, J-1) ----
// src/track/track.ts is now the *presentation* layer: THREE mesh/ribbon/prop
// builders + re-exports of the pure math so existing imports keep working.
import {
  type Sample as SimSample,
  type TrackResult as SimTrackResult,
  Track as SimTrack,
  ROAD_HALF as simRoadHalf,
  terrainHeight as simTerrainHeight,
  terrainNormal as simTerrainNormal,
} from '../sim/trackSim';

export type Sample = SimSample;
export type TrackResult = SimTrackResult;
export class Track extends SimTrack {}
export const ROAD_HALF = simRoadHalf;
export function terrainHeight(x: number, z: number): number { return simTerrainHeight(x, z); }
export function terrainNormal(x: number, z: number): THREE.Vector3 {
  const n = simTerrainNormal(x, z);
  return new THREE.Vector3(n.x, n.y, n.z);
}

// Builds a ribbon between signed lateral offsets [offA..offB] around the centerline.
// Returns a BufferGeometry. `repeatEvery` controls the along-track UV scale so the
// texture tiles once per `repeatEvery` metres of track. Winding is oriented UP for
// every quad so the road never flips invisible on a closed loop.
function buildRibbon(samples: Sample[], offA: number, offB: number, repeatEvery = 8): THREE.BufferGeometry {
  const M = samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let i = 0; i < M; i++) {
    const p = samples[i];
    const ax = p.x + p.nx * offA, az = p.z + p.nz * offA;
    const bx = p.x + p.nx * offB, bz = p.z + p.nz * offB;
    // follow the terrain so the road never gets buried under the hills
    positions.push(ax, terrainHeight(ax, az), az, bx, terrainHeight(bx, bz), bz);
    uvs.push(0, p.u / repeatEvery, 1, p.u / repeatEvery);
  }
  const indices: number[] = [];
  for (let i = 0; i < M; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % M) * 2, d = ((i + 1) % M) * 2 + 1;
    // up-facing winding via cross-product y-sign
    const ux = positions[b * 3] - positions[a * 3];
    const uz = positions[b * 3 + 2] - positions[a * 3 + 2];
    const wx = positions[c * 3] - positions[a * 3];
    const wz = positions[c * 3 + 2] - positions[a * 3 + 2];
    const ny = uz * wx - ux * wz; // y-component of cross (u × w)
    if (ny >= 0) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, c, d, b);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

export function buildScene(scene: THREE.Scene, track: Track, opts?: { trees?: [number, number, number][] }): THREE.Group {
  const group = new THREE.Group();
  group.name = 'track';
  const { samples, halfWidth } = track;
  const grassTex = grassTexture();
  const groundGeom = new THREE.PlaneGeometry(560, 460, 80, 64);
  groundGeom.rotateX(-Math.PI / 2);
  const gp = groundGeom.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrainHeight(gp.getX(i), gp.getZ(i)));
  groundGeom.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeom, new THREE.MeshStandardMaterial({ map: grassTex, color: 0xf0f0e8, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  group.add(ground);

  // dirt shoulder beneath road
  const shoulder = new THREE.Mesh(
    buildRibbon(samples, -halfWidth - 1.8, halfWidth + 1.8, 6),
    new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 0.9, metalness: 0 })
  );
  shoulder.position.y = -0.2;
  shoulder.receiveShadow = true;
  group.add(shoulder);

  // asphalt (raised just above the ground to avoid z-fighting)
  const road = new THREE.Mesh(buildRibbon(samples, -halfWidth, halfWidth, 16), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.45, metalness: 0 }));
  road.position.y = 0.06;
  road.receiveShadow = true;
  group.add(road);

  // kerbs
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.3, metalness: 0 });
  const ci = halfWidth - 0.25, co = halfWidth + 1.0;
  for (const s of [1, -1]) {
    const curb = new THREE.Mesh(buildRibbon(samples, s > 0 ? ci : -co, s > 0 ? co : -ci, 4), curbMat);
    curb.position.y = 0.1;
    curb.receiveShadow = true;
    group.add(curb);
  }

  addProps(group, track, opts?.trees);
  scene.add(group);
  return group;
}

// Cartoony fence + trees + start arch props to sell the setting. `treePositions`
// lets an editor supply explicit trees (as [x,z,r]); otherwise random trees are
// generated (kept clear of the road and non-overlapping).
function addProps(group: THREE.Group, track: Track, treePositions?: [number, number, number][]) {
  const { samples, halfWidth } = track;
  // white picket-style barrier on the outside shoulder, following the loop
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.6, metalness: 0 });
  const outer = halfWidth + 2.6;
  const M = samples.length;
  // post positions every ~3.2m
  for (let i = 0; i < M; i += 4) {
    const p = samples[i];
    const px = p.x + p.nx * outer, pz = p.z + p.nz * outer;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6), barrierMat);
    post.position.set(px, terrainHeight(px, pz) + 0.45, pz);
    post.castShadow = true;
    group.add(post);
  }

  const trees = treePositions ?? genTreePositions(samples, halfWidth);
  for (const [x, z, r] of trees) group.add(buildTree(x, z, r));
  addStartBanner(group, track);
}

// Build a single tree (trunk + foliage) centred at (x, z) on the terrain.
export function buildTree(x: number, z: number, r: number): THREE.Group {
  const trunks = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.9, metalness: 0 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x3f9d3c, roughness: 0.85, metalness: 0 });
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.32, r * 1.4, 6), trunks);
  trunk.position.y = r * 0.7;
  const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), foliage);
  crown.position.y = r * 2.0;
  crown.scale.y = 1.15;
  tree.add(trunk, crown);
  tree.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  tree.position.set(x, terrainHeight(x, z), z);
  return tree;
}

// Randomly scatter trees on the surrounding grass, kept clear of the road and of
// each other. Returns [x, z, radius] tuples so a caller can persist/re-edit them.
export function genTreePositions(samples: Sample[], halfWidth: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const TREE_TARGET = 55;       // enough to frame the track, not a forest floor
  const TREE_MIN_SEP = 8;       // min distance between tree centres (no overlap)
  let attempts = 0;
  const placedPos: [number, number][] = [];
  let rng = 12345;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  while (out.length < TREE_TARGET && attempts < 2500) {
    attempts++;
    const x = (rand() - 0.5) * 430;
    const z = (rand() - 0.5) * 350;
    // keep clear of the road: find the TRUE nearest sample (full scan)
    let minD = Infinity;
    for (const s of samples) {
      const dx = x - s.x, dz = z - s.z;
      const d = dx * dx + dz * dz;
      if (d < minD) minD = d;
    }
    if (Math.sqrt(minD) < halfWidth + 6) continue;
    // keep trees from overlapping each other
    let tooClose = false;
    for (const [px, pz] of placedPos) {
      const dx = x - px, dz = z - pz;
      if (dx * dx + dz * dz < TREE_MIN_SEP * TREE_MIN_SEP) { tooClose = true; break; }
    }
    if (tooClose) continue;
    const r = 0.9 + rand() * 1.6;
    out.push([x, z, r]);
    placedPos.push([x, z]);
  }
  return out;
}

function addStartBanner(group: THREE.Group, track: Track) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5, metalness: 0 });
  const p = track.samples[0];
  const bx = p.x - p.tx * 6, bz = p.z - p.tz * 6;
  const g = new THREE.Group();
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5, 0.6), mat);
  const right = left.clone();
  const span = 10;
  const dirX = p.nx, dirZ = p.nz;
  left.position.set(dirX * span, 2.5, dirZ * span);
  right.position.set(-dirX * span, 2.5, -dirZ * span);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, span * 2), new THREE.MeshStandardMaterial({ color: 0x2b3a55, roughness: 0.5, metalness: 0 }));
  beam.position.y = 4.9;
  beam.lookAt(new THREE.Vector3(bx + dirX * 1, 4.9, bz + dirZ * 1));
  g.add(left, right, beam);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  g.position.set(bx, terrainHeight(bx, bz), bz);
  g.rotation.y = Math.atan2(p.tx, p.tz);
  group.add(g);
}
