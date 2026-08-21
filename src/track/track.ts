import * as THREE from 'three';
import { WORLD } from '../config';
import { asphaltTexture, curbTexture, dirtTexture, grassTexture } from '../util/tex';

export interface Sample {
  x: number;
  z: number;
  u: number;
  tx: number;
  tz: number;
  nx: number;
  nz: number;
}

export interface TrackResult {
  index: number;
  lat: number;
  lon: number;
  u: number;
  tangent: { x: number; z: number };
  normal: { x: number; z: number };
}

// ---- Catmull-Rom closed spline helpers ------------------------------------
function splinePoint(points: { x: number; z: number }[], i: number, t: number, out: { x: number; z: number }) {
  const N = points.length;
  const p0 = points[(i - 1 + N) % N];
  const p1 = points[i % N];
  const p2 = points[(i + 1) % N];
  const p3 = points[(i + 2) % N];
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
}

// ---- Rolling, gentle terrain heightfield ----------------------------------
export function terrainHeight(x: number, z: number): number {
  let h = 0;
  h += 2.4 * Math.sin(x * 0.018) * Math.cos(z * 0.02);
  h += 1.3 * Math.sin(x * 0.045 + z * 0.03);
  const hill = (cx: number, cz: number, s: number, a: number) => {
    const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    return a * Math.exp(-d2 / (2 * s * s));
  };
  h += hill(-20, 30, 26, 4.2);
  h += hill(45, -10, 30, 3.6);
  h += hill(5, -50, 34, 3.0);
  return h;
}

// Terrain normal via finite differences (for orienting karts to the slope).
export function terrainNormal(x: number, z: number): THREE.Vector3 {
  const e = 0.35;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  const nx = (hL - hR) / (2 * e);
  const nz = (hD - hU) / (2 * e);
  return new THREE.Vector3(nx, 1, nz).normalize();
}

function buildSamples(points: [number, number][]): { samples: Sample[]; totalLen: number; M: number } {
  const PTS = points.map(([x, z]) => ({ x, z }));
  const N = PTS.length;
  const raw: { x: number; z: number }[] = [];
  const pt = { x: 0, z: 0 };
  const segSteps = 80;
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < segSteps; s++) {
      splinePoint(PTS, i, s / segSteps, pt);
      raw.push({ x: pt.x, z: pt.z });
    }
  }
  const samples: Sample[] = [];
  const spacing = WORLD.roadRes;
  let prev = raw[0];
  let u = 0;
  samples.push({ x: prev.x, z: prev.z, u: 0, tx: 0, tz: 0, nx: 0, nz: 0 });
  for (let i = 1; i <= raw.length; i++) {
    const p = raw[i % raw.length];
    let dx = p.x - prev.x, dz = p.z - prev.z;
    let d = Math.hypot(dx, dz);
    while (d > 0) {
      const step = Math.min(spacing, d);
      prev = { x: prev.x + (dx / d) * step, z: prev.z + (dz / d) * step };
      u += step;
      samples.push({ x: prev.x, z: prev.z, u, tx: 0, tz: 0, nx: 0, nz: 0 });
      dx = p.x - prev.x; dz = p.z - prev.z;
      d = Math.hypot(dx, dz);
    }
    prev = p;
  }
  samples.pop(); // drop closing duplicate
  const M = samples.length;
  for (let i = 0; i < M; i++) {
    const a = samples[(i - 1 + M) % M];
    const b = samples[(i + 1) % M];
    let tx = b.x - a.x, tz = b.z - a.z;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    samples[i].tx = tx; samples[i].tz = tz;
    samples[i].nx = -tz; samples[i].nz = tx;
  }
  return { samples, totalLen: u, M };
}

// Half the default road width, kept for back-compat (equals WORLD.roadWidth / 2).
export const ROAD_HALF = WORLD.roadWidth / 2;

// A single selectable track: owns its own centerline samples and the geometry
// queries built on them, so multiple maps can coexist.
export class Track {
  samples: Sample[];
  totalLen: number;
  halfWidth: number;
  private M: number;

  constructor(points: [number, number][], roadWidth: number) {
    const built = buildSamples(points);
    this.samples = built.samples;
    this.totalLen = built.totalLen;
    this.M = built.M;
    this.halfWidth = roadWidth / 2;
  }

  sampleAtU(u: number): { sample: Sample; u: number; index: number } {
    const L = this.totalLen;
    let uu = u;
    while (uu < 0) uu += L;
    while (uu >= L) uu -= L;
    const idx = Math.min(this.M - 1, Math.floor((uu / L) * this.M));
    return { sample: this.samples[idx], u: uu, index: idx };
  }

  worldToTrack(pos: { x: number; z: number }, hint = 0): TrackResult {
    let best = hint, bestD = Infinity;
    for (let k = -14; k <= 14; k++) {
      const i = (((best + k) % this.M) + this.M) % this.M;
      const s = this.samples[i];
      const dx = pos.x - s.x, dz = pos.z - s.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; best = i; }
    }
    const s = this.samples[best];
    const dx = pos.x - s.x, dz = pos.z - s.z;
    const lat = dx * s.nx + dz * s.nz;
    const lon = dx * s.tx + dz * s.tz;
    return { index: best, lat, lon, u: s.u + lon, tangent: { x: s.tx, z: s.tz }, normal: { x: s.nx, z: s.nz } };
  }
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

export function buildScene(scene: THREE.Scene, track: Track): THREE.Group {
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

  addProps(group, track);
  scene.add(group);
  return group;
}

// Cartoony fence + trees + start arch props to sell the setting.
function addProps(group: THREE.Group, track: Track) {
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

  // trees scattered on the surrounding grass (inside + outside), kept clear of road
  const trunks = new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.9, metalness: 0 });
  const foliage = new THREE.MeshStandardMaterial({ color: 0x3f9d3c, roughness: 0.85, metalness: 0 });
  let placed = 0;
  let rng = 12345;
  const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
  while (placed < 90) {
    const x = (rand() - 0.5) * 430;
    const z = (rand() - 0.5) * 350;
    // keep clear of the road: find the TRUE nearest sample (full scan, not the
    // hint-windowed worldToTrack) so trees never land on the track.
    let minD = Infinity;
    for (const s of samples) {
      const dx = x - s.x, dz = z - s.z;
      const d = dx * dx + dz * dz;
      if (d < minD) minD = d;
    }
    if (Math.sqrt(minD) < halfWidth + 6) continue;
    const r = 0.9 + rand() * 1.6;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.32, r * 1.4, 6), trunks);
    trunk.position.y = r * 0.7;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), foliage);
    crown.position.y = r * 2.0;
    crown.scale.y = 1.15;
    tree.add(trunk, crown);
    tree.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    tree.position.set(x, terrainHeight(x, z), z);
    tree.rotation.y = rand() * 6.28;
    group.add(tree);
    placed++;
  }
  addStartBanner(group, track);
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
