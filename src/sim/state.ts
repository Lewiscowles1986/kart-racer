// Race state serialisation (M1 step 9, judge backlog J-9).
//
// Snapshots are PLAIN, sorted-key structures (stableStringify) with floats
// quantised to the protocol grid, so hash(snapshot) is a portable race
// identity: identical across two machines or two weeks later. This is what
// makes fixtures bit-reproducible and gives lockstep multiplayer its
// desync detector (per-tick stateHash exchange, docs/multiplayer.md §4).
//
// pos stays a Vector3 inside the sim (structurally a plain {x,y,z} record,
// see step 7) — snapshots copy it out as data.

import { stateHash, stableStringify, quantise } from './protocol';
import type { ItemsSim } from './itemsSim';

export interface KartSnapshot {
  index: number;
  name: string;
  isPlayer: boolean;
  x: number; y: number; z: number;
  yaw: number;
  speed: number;
  trackHint: number;
  spinning: number;
  boostT: number;
  shieldT: number;
  starT: number;
  padT: number;
  airborne: boolean;
  vy: number;
  airT: number;
  item: string | null;
  drifting: boolean;
  driftT: number;
  lap: number;
  dist: number;
  prevU: number;
  finished: boolean;
  finishTime: number | null;
  raceTime: number;
  respawnT: number;
  ghostT: number;
  rouletteT: number;
}

const q = (x: number) => quantise(x, 1e-4);

export function snapshotKart(k: any): KartSnapshot {
  return {
    index: k.index,
    name: k.name,
    isPlayer: !!k.isPlayer,
    x: q(k.pos.x), y: q(k.pos.y), z: q(k.pos.z),
    yaw: q(k.yaw),
    speed: q(k.speed),
    trackHint: k.trackHint,
    spinning: q(k.spinning),
    boostT: q(k.boostT),
    shieldT: q(k.shieldT),
    starT: q(k.starT),
    padT: q(k.padT),
    airborne: !!k.airborne,
    vy: q(k.vy),
    airT: q(k.airT),
    item: k.item,
    drifting: !!k.drifting,
    driftT: q(k.driftT),
    lap: k.lap,
    dist: q(k.dist),
    prevU: q(k.prevU),
    finished: !!k.finished,
    finishTime: k.finishTime == null ? null : q(k.finishTime),
    raceTime: q(k.raceTime),
    respawnT: q(k.respawnT),
    ghostT: q(k.ghostT ?? 0),
    rouletteT: q(k.rouletteT),
  };
}

export function applyKartSnapshot(k: any, s: KartSnapshot): void {
  k.pos.set(s.x, s.y, s.z);
  k.yaw = s.yaw;
  k.speed = s.speed;
  k.trackHint = s.trackHint;
  k.spinning = s.spinning;
  k.boostT = s.boostT;
  k.shieldT = s.shieldT;
  k.starT = s.starT;
  k.padT = s.padT;
  k.airborne = s.airborne;
  k.vy = s.vy;
  k.airT = s.airT;
  k.item = s.item;
  k.drifting = s.drifting;
  k.driftT = s.driftT;
  k.lap = s.lap;
  k.dist = s.dist;
  k.prevU = s.prevU;
  k.finished = s.finished;
  k.finishTime = s.finishTime;
  k.raceTime = s.raceTime;
  k.respawnT = s.respawnT;
  k.ghostT = s.ghostT;
  k.rouletteT = s.rouletteT;
}

export interface RaceSnapshot {
  timeMs: number;
  raceTimeMs: number;
  karts: KartSnapshot[];
  boxes: { frac: number; lateral: number; x: number; z: number; taken: boolean; respawn: number }[];
  bananas: { x: number; z: number; dropper: number; dropT: number }[];
}

export function snapshotRace(karts: any[], items: ItemsSim, timeMs: number, raceTimeMs: number): RaceSnapshot {
  return {
    timeMs: q(timeMs),
    raceTimeMs: q(raceTimeMs),
    karts: karts.map(snapshotKart),
    boxes: items.boxes.map((b) => ({ frac: q(b.frac), lateral: q(b.lateral), x: q(b.x), z: q(b.z), taken: b.taken, respawn: q(b.respawn) })),
    bananas: items.bananas.map((b) => ({ x: q(b.x), z: q(b.z), dropper: b.dropper, dropT: q(b.dropT) })),
  };
}

export function hashSnapshot(s: RaceSnapshot): string {
  return stateHash(stableStringify(s));
}

export function hashRace(karts: any[], items: ItemsSim, timeMs: number, raceTimeMs: number): string {
  return hashSnapshot(snapshotRace(karts, items, timeMs, raceTimeMs));
}