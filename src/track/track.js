import * as THREE from 'three';
import { TRACK_POINTS, WORLD } from '../config.js';
import { asphaltTexture, curbTexture, dirtTexture, grassTexture, sandTexture, woodTexture } from '../util/tex.js';

// ---- Catmull-Rom closed spline helpers ------------------------------------
const PTS = TRACK_POINTS.map(([x, z]) => ({ x, z }));
const N = PTS.length;

function splinePoint(i, t, out) {
  const p0 = PTS[(i - 1 + N) % N];
  const p1 = PTS[i % N];
  const p2 = PTS[(i + 1) % N];
  const p3 = PTS[(i + 2) % N];
  const t2 = t * t, t3 = t2 * t;
  out.x = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.z = 0.5 * (2 * p1.z + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3);
}

function splineTangent(i, t, out) {
  const p0 = PTS[(i - 1 + N) % N];
  const p1 = PTS[i % N];
  const p2 = PTS[(i + 1) % N];
  const p3 = PTS[(i + 2) % N];
  const t2 = t * t;
  out.x = 0.5 * ((-p0.x + p2.x) + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2);
  out.z = 0.5 * ((-p0.z + p2.z) + 2 * (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t + 3 * (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t2);
}

// ---- Rolling, gentle terrain heightfield ----------------------------------
export function terrainHeight(x, z) {
  let h = 0;
  h += 2.4 * Math.sin(x * 0.018) * Math.cos(z * 0.02);
  h += 1.3 * Math.sin(x * 0.045 + z * 0.03);
  const hill = (cx, cz, s, a) => {
    const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz);
    return a * Math.exp(-d2 / (2 * s * s));
  };
  h += hill(-20, 30, 26, 4.2);
  h += hill(45, -10, 30, 3.6);
  h += hill(5, -50, 34, 3.0);
  return h;
}

// Terrain normal via finite differences (for orienting karts to the slope).
export function terrainNormal(x, z) {
  const e = 0.35;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  const nx = (hL - hR) / (2 * e);
  const nz = (hD - hU) / (2 * e);
  return new THREE.Vector3(nx, 1, nz).normalize();
}

function buildSamples() {
  const raw = [];
  const pt = { x: 0, z: 0 };
  const segSteps = 80;
  for (let i = 0; i < N; i++) {
    for (let s = 0; s < segSteps; s++) {
      splinePoint(i, s / segSteps, pt);
      raw.push({ x: pt.x, z: pt.z });
    }
  }
  const samples = [];
  const spacing = WORLD.roadRes;
  let prev = raw[0];
  let u = 0;
  samples.push({ x: prev.x, z: prev.z, u: 0 });
  for (let i = 1; i <= raw.length; i++) {
    const p = raw[i % raw.length];
    let dx = p.x - prev.x, dz = p.z - prev.z;
    let d = Math.hypot(dx, dz);
    while (d > 0) {
      const step = Math.min(spacing, d);
      prev = { x: prev.x + (dx / d) * step, z: prev.z + (dz / d) * step };
      u += step;
      samples.push({ x: prev.x, z: prev.z, u });
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

const { samples, totalLen, M } = buildSamples();
export const ROAD_HALF = WORLD.roadWidth / 2;
const offroadHalf = ROAD_HALF + WORLD.curbWidth;

export function worldToTrack(pos, hint = 0) {
  let best = hint, bestD = Infinity;
  const M = samples.length;
  for (let k = -14; k <= 14; k++) {
    const i = (((best + k) % M) + M) % M;
    const s = samples[i];
    const dx = pos.x - s.x, dz = pos.z - s.z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  const s = samples[best];
  const dx = pos.x - s.x, dz = pos.z - s.z;
  const lat = dx * s.nx + dz * s.nz;
  const lon = dx * s.tx + dz * s.tz;
  return { index: best, lat, lon, u: s.u + lon, tangent: { x: s.tx, z: s.tz }, normal: { x: s.nx, z: s.nz } };
}

export function onRoad(pos, hint = 0) {
  const t = worldToTrack(pos, hint);
  return { road: Math.abs(t.lat) <= offroadHalf, ...t };
}

export function sampleAtU(u) {
  const L = totalLen;
  let uu = u;
  while (uu < 0) uu += L;
  while (uu >= L) uu -= L;
  const idx = Math.min(M - 1, Math.floor((uu / L) * M));
  return { sample: samples[idx], u: uu, index: idx };
}

// Builds a ribbon between signed lateral offsets [offA..offB] around the centerline.
// Returns a BufferGeometry. `repeatEvery` controls the along-track UV scale so the
// texture tiles once per `repeatEvery` metres of track. Winding is oriented UP for
// every quad so the road never flips invisible on a closed loop.
function buildRibbon(offA, offB, repeatEvery = 8) {
  const positions = [];
  const uvs = [];
  for (let i = 0; i < M; i++) {
    const p = samples[i];
    const ax = p.x + p.nx * offA, az = p.z + p.nz * offA;
    const bx = p.x + p.nx * offB, bz = p.z + p.nz * offB;
    const ha = terrainHeight(ax, az), hb = terrainHeight(bx, bz);
    positions.push(ax, ha, az, bx, hb, bz);
    uvs.push(0, p.u / repeatEvery, 1, p.u / repeatEvery);
  }
  const idx = [];
  const v = (i) => positions[i * 3];
  // orient helper: returns 1 if winding (a,b,c) is up-facing, else -1
  const upWinding = (a, b, c) => {
    const ax = v(a), ay = positions[a * 3 + 1], az = positions[a * 3 + 2];
    const bx = v(b), by = positions[b * 3 + 1], bz = positions[b * 3 + 2];
    const cx = v(c), cy = positions[c * 3 + 1], cz = positions[c * 3 + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    const ny = uz * wx - ux * wz; // y-component of cross (u × w)
    return ny >= 0 ? 1 : -1;
  };
  for (let i = 0; i < M; i++) {
    const a = i * 2, b = i * 2 + 1;
    const c = ((i + 1) % M) * 2, d = ((i + 1) % M) * 2 + 1;
    if (upWinding(a, b, c) > 0) idx.push(a, b, c); else idx.push(a, c, b);
    if (upWinding(b, d, c) > 0) idx.push(b, d, c); else idx.push(b, c, d);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geom.setIndex(idx);
  geom.computeVertexNormals();
  return geom;
}

export function buildScene(scene) {
  const grassTex = grassTexture();
  const groundGeom = new THREE.PlaneGeometry(560, 460, 80, 64);
  groundGeom.rotateX(-Math.PI / 2);
  const gp = groundGeom.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrainHeight(gp.getX(i), gp.getZ(i)));
  groundGeom.computeVertexNormals();
  const ground = new THREE.Mesh(groundGeom, new THREE.MeshStandardMaterial({ map: grassTex, color: 0xf0f0e8, roughness: 0.95, metalness: 0 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // dirt shoulder beneath road
  const shoulder = new THREE.Mesh(
    buildRibbon(-ROAD_HALF - 1.8, ROAD_HALF + 1.8, 6),
    new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 0.9, metalness: 0 })
  );
  shoulder.position.y = -0.2;
  shoulder.receiveShadow = true;
  scene.add(shoulder);

  // asphalt (raised just above the ground to avoid z-fighting)
  const road = new THREE.Mesh(buildRibbon(-ROAD_HALF, ROAD_HALF, 16), new THREE.MeshStandardMaterial({ map: asphaltTexture(), roughness: 0.45, metalness: 0 }));
  road.position.y = 0.06;
  road.receiveShadow = true;
  scene.add(road);

  // kerbs
  const curbMat = new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.3, metalness: 0 });
  const ci = ROAD_HALF - 0.25, co = ROAD_HALF + 1.0;
  for (const s of [1, -1]) {
    const curb = new THREE.Mesh(buildRibbon(s > 0 ? ci : -co, s > 0 ? co : -ci, 4), curbMat);
    curb.position.y = 0.1;
    curb.receiveShadow = true;
    scene.add(curb);
  }

  addProps(scene);
  return { totalLen, samples, halfWidth: ROAD_HALF };
}

// Cartoony fence + trees + start arch props to sell the setting.
function addProps(scene) {
  const woodTex = woodTexture();
  const woodMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8, metalness: 0 });

  // white picket-style barrier on the outside shoulder, following the loop
  const barrierMat = new THREE.MeshStandardMaterial({ color: 0xf4ead8, roughness: 0.6, metalness: 0 });
  const outer = ROAD_HALF + 2.6;
  // post positions every ~3.2m
  for (let i = 0; i < M; i += 4) {
    const p = samples[i];
    const px = p.x + p.nx * outer, pz = p.z + p.nz * outer;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.9, 6), barrierMat);
    post.position.set(px, terrainHeight(px, pz) + 0.45, pz);
    post.castShadow = true;
    scene.add(post);
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
    // keep clear of the road
    const t = worldToTrack({ x, z });
    if (Math.abs(t.lat) < ROAD_HALF + 6) continue;
    const r = 0.9 + rand() * 1.6;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.22, r * 0.32, r * 1.4, 6), trunks);
    trunk.position.y = r * 0.7;
    const crown = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 8), foliage);
    crown.position.y = r * 2.0;
    crown.scale.y = 1.15;
    tree.add(trunk, crown);
    tree.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    tree.position.set(x, terrainHeight(x, z), z);
    tree.rotation.y = rand() * 6.28;
    scene.add(tree);
    placed++;
  }
  addStartBanner(scene);
}

function addStartBanner(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: 0.5, metalness: 0 });
  const p = samples[0];
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
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(bx, terrainHeight(bx, bz), bz);
  g.rotation.y = Math.atan2(p.tx, p.tz);
  scene.add(g);
}
