// Critic scratch vitest: fixed-dt handling curves, drift dominance, feedback,
// off-road, wall clamp frame-rate dependence, corner-cut/teleport safety.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

vi.mock('../../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}),
}));
import { Track } from '../../src/track/track';
import { TRACKS, WORLD, PHYS } from '../../src/config';
import { Kart } from '../../src/game/Kart';

function makeKart(trackId = 0) {
  const scene = new THREE.Scene();
  const track = new Track(TRACKS[trackId].points, WORLD.roadWidth);
  buildScene(scene, track);
  const world = {
    effects: { boost() {}, dust() {}, spinStars() {}, ring() {} },
    audio: { lap() {}, slip() {}, hit() {}, boost() {}, land() {}, jump() {}, pickup() {} },
    items: { use() {} },
    karts: [],
    timeMs: 0, totalLaps: 3,
  };
  const visual = { root: new THREE.Group(), wheels: [], driver: new THREE.Group(), setShield() {} };
  return { kart: new Kart({ index: 0, name: 't', color: 1, accent: 1, track, world, visual }), track };
}
const inp = (o = {}) => ({ steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false, ...o });
const step = (kart, dt, frames, i) => { for (let n = 0; n < frames; n++) kart.update(dt, typeof i === 'function' ? i(n) : i); };

it('A. turn radius vs speed (full steer, no drift)', () => {
  const { kart, track } = makeKart();
  const radii = {};
  for (const v of [10, 17, 25, 34]) {
    kart.setPos(track.samples[10].x, track.samples[10].z);
    kart.yaw = 0; kart.speed = v; kart.onRoad = true; kart.terrainFactor = 1; kart.driftT = 0; kart.drifting = false;
    const s0 = { x: kart.pos.x, z: kart.pos.z }; let yaw0 = kart.yaw;
    kart.update(1 / 60, inp({ steer: 1, throttle: 1 }));
    // yaw rate at this speed
    const yawRate = Math.abs(kart.yaw - yaw0) * 60;
    radii[v] = { radius: v / yawRate, yawRate: +yawRate.toFixed(3) };
  }
  console.log('A turn radius vs speed:', JSON.stringify(radii));
});

it('B. drift is FREE: identical speed with gas+brake (drift) vs gas only', () => {
  const { kart: k1, track } = makeKart();
  const { kart: k2 } = makeKart();
  for (const k of [k1, k2]) { k.setPos(track.samples[10].x, track.samples[10].z); k.yaw = 0; k.speed = 0; }
  k1.update(1 / 60, inp({ throttle: 1 })); // warm to speed, no drift
  k2.update(1 / 60, inp({ throttle: 1 }));
  // 5s straight: k1 gas only, k2 gas+brake (drift)
  step(k1, 1 / 60, 300, inp({ throttle: 1 }));
  step(k2, 1 / 60, 300, inp({ throttle: 1, brake: true }));
  console.log('B speed no-drift', k1.speed.toFixed(3), 'drift-held', k2.speed.toFixed(3), 'drifting:', k2.drifting, 'driftT', k2.driftT.toFixed(3));
  console.log('B distance no-drift', k1.dist.toFixed(1), 'drift', k2.dist.toFixed(1));
});

it('C. drift charge thresholds + release boost sizing', () => {
  const { kart: k, track } = makeKart();
  k.setPos(track.samples[10].x, track.samples[10].z); k.yaw = 0; k.speed = 25;
  k.update(1 / 60, inp({ throttle: 1, brake: true })); // establish drift
  // release after 0.70s -> no boost
  for (let n = 0; n < Math.round(0.70 * 60); n++) k.update(1 / 60, inp({ throttle: 1, brake: true }));
  k.update(1 / 60, inp({ throttle: 1 }));
  const boostAt070 = k.boostT;
  // again, hold 0.76s
  k.speed = 25; k.driftT = 0; k.drifting = false;
  k.update(1 / 60, inp({ throttle: 1, brake: true }));
  for (let n = 0; n < Math.round(0.76 * 60); n++) k.update(1 / 60, inp({ throttle: 1, brake: true }));
  k.update(1 / 60, inp({ throttle: 1 }));
  const boostAt076 = k.boostT;
  // hold 3s -> same boost? (tiering check)
  k.speed = 25; k.driftT = 0; k.drifting = false;
  k.update(1 / 60, inp({ throttle: 1, brake: true }));
  for (let n = 0; n < 180; n++) k.update(1 / 60, inp({ throttle: 1, brake: true }));
  k.update(1 / 60, inp({ throttle: 1 }));
  console.log('C charge 0.70s boost', +boostAt070.toFixed(3), '| 0.76s boost', +boostAt076.toFixed(3), '| 3.0s boost', +k.boostT.toFixed(3), '(PHYS.miniTurboMinTime', PHYS.miniTurboMinTime + 'ms)');
  // top speed while mini-turbo active vs mushroom
  k.speed = 40; k.boostT = 1.3;
  k.update(1 / 60, inp({ throttle: 1 }));
  console.log('C mini-turbo cap', k.speed.toFixed(2), 'mushroom top', PHYS.boost.mushroom.top, 'force', PHYS.boost.mushroom.force, 'dur', PHYS.boost.mushroom.time + 'ms vs miniTurbo 1300ms');
});

it('D. off-road numbers', () => {
  const { kart, track } = makeKart();
  kart.setPos(track.samples[10].x, track.samples[10].z); kart.yaw = 0; kart.speed = 34;
  // push 8m laterally off road (beyond halfWidth 6) using track normal
  const s = track.samples[10];
  kart.pos.x += s.nx * 8; kart.pos.z += s.nz * 8;
  step(kart, 1 / 60, 120, inp({ throttle: 1 }));
  console.log('D off-road top speed', kart.speed.toFixed(2), 'cap=34*TERRAIN.grass=', (34 * 0.32).toFixed(2));
});

it('E. soft-wall speed penalty is FRAME-RATE dependent (per-frame 0.985)', () => {
  const clamp = async (dt, secs) => {
    const { kart, track } = makeKart();
    kart.setPos(track.samples[10].x, track.samples[10].z); kart.yaw = 0; kart.speed = 30;
    const s0 = track.samples[10];
    kart.pos.x += s0.nx * 11; kart.pos.z += s0.nz * 11; // outside maxLat=10.5
    const n = Math.round(secs / dt);
    for (let i = 0; i < n; i++) kart.update(dt, inp({ throttle: 1, steer: 0 }));
    return kart.speed;
  };
  const s30 = clamp(1 / 30, 5), s60 = clamp(1 / 60, 5), s144 = clamp(1 / 144, 5);
  console.log('E speed after 5s grinding soft wall @30fps', s30.toFixed(2), '@60fps', s60.toFixed(2), '@144fps', s144.toFixed(2));
});

it('F. coast decel same 5s: 60fps vs 30fps (Euler (1-0.9dt))', () => {
  const run = (dt) => {
    const { kart, track } = makeKart();
    kart.setPos(track.samples[10].x, track.samples[10].z); kart.yaw = 0; kart.speed = 34;
    for (let i = 0; i < Math.round(5 / dt); i++) kart.update(dt, inp({}));
    return kart.speed;
  };
  const s60 = run(1 / 60), s30 = run(1 / 30);
  console.log('F coast 5s: 60fps ->', s60.toFixed(3), '30fps ->', s30.toFixed(3));
});

it('G. teleport/corner-cut safety: jump 40m across track, dist must not skip a lap', () => {
  const { kart, track } = makeKart();
  kart.placeAt(track.totalLen / 2, 0);
  const dist0 = kart.dist;
  // teleport 30m forward along tangent + drop on other side of a hairpin
  kart.pos.x += track.samples[0].tx * 20; kart.pos.z += track.samples[0].tz * 20;
  step(kart, 1 / 60, 10, inp({}));
  console.log('G dist after teleport-in-track-plane', kart.dist.toFixed(1), '(start', dist0.toFixed(1), ') lap=', kart.lap);
  // big lateral jump across the road (24m) mid-corner: does u wrap ahead?
  kart.placeAt(track.totalLen * 0.5, 0);
  const s = track.sampleAtU(track.totalLen * 0.5).sample;
  kart.pos.x += s.nx * 24; kart.pos.z += s.nz * 24;
  kart.update(1 / 60, inp({}));
  console.log('G2 after 24m lateral jump: u=', kart.prevU.toFixed(1), 'dist=', kart.dist.toFixed(1), 'lat clamp should pull back');
});

it('H. wrong way: drive backward over start line — any penalty/wrongway state?', () => {
  const { kart, track } = makeKart();
  kart.placeAt(track.totalLen - 5, 0);
  for (let i = 0; i < 120; i++) kart.update(1 / 60, inp({ throttle: -1, brake: true, steer: 0 })); // reverse hard
  console.log('H after 2s reversing: dist=', kart.dist.toFixed(1), 'lap=', kart.lap, 'prevU=', kart.prevU.toFixed(1), '(no wrong-way flag exists on Kart)');
});

it('I. canyon hairpin: min road clearance vs maxLat clamp (can you cut infield?)', () => {
  const { kart, track } = makeKart(1);
  // closest non-adjacent legs
  let best = Infinity, pair = null;
  const S = track.samples;
  for (let i = 0; i < S.length; i++) for (let j = i + 25; j < S.length; j++) {
    const d = Math.hypot(S[i].x - S[j].x, S[i].z - S[j].z);
    if (d < best) { best = d; pair = [i, j]; }
  }
  console.log('I canyon closest non-adjacent road sections gap=', best.toFixed(1), 'm at samples', pair, 'maxLat clamp=', (track.halfWidth + 4.5));
});

it('J. AI rubber-band is a no-op at top speed (throttle only affects accel)', () => {
  // simulate: throttle 0.8 vs 1.25* capped — top speed identical since cap uses terrainFactor only
  const t = (throttle) => {
    const { kart, track } = makeKart();
    kart.setPos(track.samples[10].x, track.samples[10].z); kart.yaw = 0; kart.speed = 0;
    for (let i = 0; i < 60 * 20; i++) kart.update(1 / 60, inp({ throttle, steer: 0 }));
    return kart.speed;
  };
  console.log('J top speed throttle=0.8:', t(0.8).toFixed(2), 'throttle=1.0:', t(1).toFixed(2), '-> rubber-band x1.25 does nothing at cap');
});