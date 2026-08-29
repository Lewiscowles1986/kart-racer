import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Track, terrainHeight, terrainNormal, ROAD_HALF } from '../src/sim/trackSim';
import { TRACKS, WORLD } from '../src/config';

const SUNNY = TRACKS[0].points;

describe('sim/trackSim (M1 step 1 acceptance)', () => {
  it('samples 100 terrain heights: all finite, within the v1 heightfield envelope', () => {
    const track = new Track(SUNNY, WORLD.roadWidth);
    const envelope = 2.4 + 1.3 + 4.2 + 3.6 + 3.0;
    for (let i = 0; i < 100; i++) {
      const s = track.samples[Math.floor((i / 100) * track.samples.length)];
      const h = terrainHeight(s.x, s.z);
      expect(Number.isFinite(h)).toBe(true);
      expect(Math.abs(h)).toBeLessThanOrEqual(envelope + 1e-9);
    }
  });

  it('sampleAtU wraps the loop identically for overruns and negatives', () => {
    const track = new Track(SUNNY, WORLD.roadWidth);
    const overRun = track.sampleAtU(track.totalLen + 12.5);
    expect(overRun.u).toBeCloseTo(12.5, 5);
    const back = track.sampleAtU(-3);
    expect(back.u).toBeCloseTo(track.totalLen - 3, 5);
    const direct = track.sampleAtU(overRun.u);
    expect(overRun.sample).toBe(direct.sample);
    const atL = track.sampleAtU(track.totalLen);
    const at0 = track.sampleAtU(0);
    expect(atL.index).toBe(at0.index);
    expect(atL.sample).toBe(at0.sample);
  });

  it('worldToTrack keeps v1 parity: anchor within 2 samples, |lat| < 1.0 on centerline points', () => {
    const track = new Track(SUNNY, WORLD.roadWidth);
    for (let i = 0; i < track.samples.length; i += 25) {
      const s = track.samples[i];
      const res = track.worldToTrack({ x: s.x, z: s.z }, i);
      // NOTE (v1 parity, documented quirk): the search window drifts because
      // `best` mutates inside the k-loop — a point exactly ON a sample can
      // anchor to an adjacent sample (≤1 sample-spacing of lateral error).
      // The sim copies v1 byte-for-byte; the judge's parity contract says
      // record, don't fix. Assert the real, unchanged guarantee here.
      expect(Math.abs(res.lat)).toBeLessThan(1.0);
      expect(Math.abs(res.index - i)).toBeLessThanOrEqual(2);
      expect(res.u).toBeCloseTo(s.u, 3);
      // compare against the ANCHORED sample (quirk can anchor ±1-2 away)
      const anchored = track.samples[res.index];
      expect(res.tangent.x).toBe(anchored.tx);
      expect(res.normal.x).toBe(anchored.nx);
    }
  });

  it('terrainNormal is a plain {x,y,z} record, unit length with positive y', () => {
    const n = terrainNormal(10, -20);
    expect(typeof n).toBe('object');
    expect(Object.keys(n).sort()).toEqual(['x', 'y', 'z']);
    const len = Math.hypot(n.x, n.y, n.z);
    expect(len).toBeCloseTo(1, 6);
    expect(n.y).toBeGreaterThan(0);
  });

  it('ROAD_HALF equals world road width / 2', () => {
    expect(ROAD_HALF).toBeGreaterThan(0);
    expect(ROAD_HALF).toBe(WORLD.roadWidth / 2);
  });
});

// Purity gate for the whole sim package (docs/simulator.md §1; judge J-3 test).
const SIM_DIR = join(process.cwd(), 'src', 'sim');
function listFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });
}
function stripComments(src) {
  // enough for the purity gate: drop /* */ blocks and // line comments first
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"])\/\/.*$/gm, '$1');
}
describe('sim purity contract', () => {
  it('src/sim imports no three, no DOM, no game/util-tex, and uses no unseeded randomness/time APIs (code only, comments stripped)', () => {
    const forbidden = [
      /from\s+['"]three['"]/, /from\s+['"][^'"]*util\/tex['"]/, /from\s+['"][^'"]*\/game\//,
      /Math\.random/, /performance\.now/, /Date\.now/, /document\./, /window\./,
      /requestAnimationFrame/, /localStorage/, /setTimeout|setInterval/,
    ];
    for (const file of listFiles(SIM_DIR)) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const re of forbidden) {
        expect({ file: file.split(/[\\/]/).slice(-2).join('/'), hit: code.match(re)?.[0] ?? null })
          .toEqual({ file: file.split(/[\\/]/).slice(-2).join('/'), hit: null });
      }
    }
  });
});