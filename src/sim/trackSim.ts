// Pure track math for the deterministic simulation core (M1 step 1, J-1).
//
// This module is the SINGLE source of truth for the racing line geometry:
// Catmull-Rom closed spline sampling, terrain height, and the world↔track
// coordinate mapping. It imports NOTHING from three, the DOM, or textures —
// Node-importable, Worker-safe, byte-identical semantics with the previous
// implementations in src/track/track.ts (which now re-exports from here).
//
// Determinism notes (docs/simulator.md §1):
// - all math here is deterministic per engine; `terrainHeight` uses
//   Math.sin/cos/exp (transcendental ULP risk across engines is a known,
//   gated risk — ADR-0004 amendment + judge J-23: same-engine rooms until
//   this becomes polynomial evaluation).

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

import { WORLD } from '../config';

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
// Pure form: unit vector as a plain record — presentation wraps it in
// THREE.Vector3 where needed (setFromUnitVectors takes a Vector3).
// v1 bit-parity: this is exactly `new THREE.Vector3(nx, 1, nz).normalize()`,
// i.e. length = Math.sqrt(x*x + y*y + z*z) then divideScalar(len || 1)
// (THREE's divideScalar multiplies each component by 1/len).
export function terrainNormal(x: number, z: number): { x: number; y: number; z: number } {
  const e = 0.35;
  const hL = terrainHeight(x - e, z), hR = terrainHeight(x + e, z);
  const hD = terrainHeight(x, z - e), hU = terrainHeight(x, z + e);
  const nx = (hL - hR) / (2 * e);
  const nz = (hD - hU) / (2 * e);
  const len = Math.sqrt(nx * nx + 1 + nz * nz) || 1;
  const inv = 1 / len;
  return { x: nx * inv, y: inv, z: nz * inv };
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