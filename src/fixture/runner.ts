// Deterministic headless race runner + fixture replay (M1 step 9, J-9).
//
// This is the integration point between the sim modules and the concrete
// Kart/Items classes: it composes 120Hz ticks from src/sim/loop.ts, real Kart
// physics, ItemsSim records and raceSim machines — with NO DOM and NO render.
// Races are driven by a COMMAND QUEUE (docs/simulator.md §2): inputs apply at
// a tick and persist until the next command for that kart. Every checkpoint
// tick produces a stateHash; replaying the same fixture must produce the
// identical hash sequence (bit-identical race).
//
// Lives OUTSIDE src/sim/** deliberately: it imports src/game/** (Kart meshes
// are stubbed) and would otherwise trip the sim purity gate.

import * as THREE from 'three';
import { ITEM_BOX_PLACEMENTS, BOOST_PADS, JUMPS, GRID_GAP, RACE } from '../config';
import { Track } from '../track/track';
import { Kart, type World } from '../game/Kart';
import { Items } from '../game/Items';
import { Rng } from '../sim/rng';
import { SimEventQueue } from '../sim/events';
import { TICK_MS } from '../sim/loop';
import { collideKarts, respawnCheck } from '../sim/raceSim';
import { hashRace } from '../sim/state';

export interface FixtureInput {
  steer: number;
  throttle: number;
  brake: boolean;
  itemPressed: boolean;
  itemHeld: boolean;
}

export interface FixtureCommand {
  atTick: number;
  kart: number;
  input: FixtureInput;
}

export interface Fixture {
  name: string;
  seed: number;
  trackId: string;
  kartCount: number;
  ticks: number;
  commands: FixtureCommand[];
  checkpoints: { tick: number; hash: string }[];
}

const NEUTRAL: FixtureInput = { steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false };

export interface HeadlessRace {
  karts: Kart[];
  world: World & { raceTimeMs?: number };
  items: Items;
  events: SimEventQueue;
  stepTick(inputs: FixtureInput[]): void;
  setTime(timeMs: number, raceTimeMs: number): void;
}

// Compose the real game pieces exactly the way Game.startRace lines them up.
export function createHeadlessRace(trackPoints: [number, number][], roadWidth: number, seed: number, kartCount = RACE.kartCount): HeadlessRace {
  const track = new Track(trackPoints, roadWidth);
  const world: any = {
    karts: [],
    timeMs: 0,
    totalLaps: RACE.totalLaps,
    events: new SimEventQueue(),
    rng: new Rng(seed),
  };
  const items = new Items({ scene: new THREE.Scene(), track, world });
  world.items = items;
  const karts: Kart[] = [];
  for (let i = 0; i < kartCount; i++) {
    const visual = { root: new THREE.Group(), wheels: [], driver: new THREE.Group(), setShield() {}, orient() {}, animate() {} } as any;
    karts.push(new Kart({ index: i, name: `K${i}`, color: 0xff3b30 + i, accent: 0xffffff, track, world, visual }));
  }
  world.karts = karts;
  // v1 startRace grid: 2 columns x N rows, P1 front-left
  const L = track.totalLen;
  for (let i = 0; i < kartCount; i++) {
    const row = Math.floor(i / 2);
    const lane = i % 2 === 0 ? -2.0 : 2.0;
    karts[i].placeAt(L - row * GRID_GAP, lane);
  }
  items.setPlacements({
    itemBoxes: ITEM_BOX_PLACEMENTS.map((frac, i) => ({ frac, lateral: i % 2 === 0 ? -1.6 : 1.6 })),
    boostPads: BOOST_PADS,
    jumps: JUMPS,
  });
  return {
    karts,
    world,
    items,
    events: world.events,
    stepTick(inputs) {
      world.timeMs += TICK_MS;
      world.raceTimeMs = (world.raceTimeMs ?? 0) + TICK_MS;
      for (let i = 0; i < karts.length; i++) {
        karts[i].update(TICK_MS / 1000, inputs[i] ?? NEUTRAL);
      }
      collideKarts(karts);
      respawnCheck(karts, track, TICK_MS / 1000, RACE.respawnTimeoutMs, 12);
      items.update(TICK_MS / 1000, karts);
    },
    setTime(timeMs: number, raceTimeMs: number) {
      world.timeMs = timeMs;
      world.raceTimeMs = raceTimeMs;
    },
  };
}

// Drive a fixture: returns the observed hash at each checkpoint tick.
// Throws on ANY checkpoint mismatch (the "bit-identical" guarantee).
export function runFixture(trackPoints: [number, number][], roadWidth: number, fixture: Fixture, trackId: string): Record<number, string> {
  if (fixture.trackId !== trackId) throw new Error(`fixture ${fixture.name}: trackId mismatch`);
  const race = createHeadlessRace(trackPoints, roadWidth, fixture.seed, fixture.kartCount);
  const commands = [...fixture.commands].sort((a, b) => a.atTick - b.atTick);
  const current: FixtureInput[] = Array.from({ length: fixture.kartCount }, () => ({ ...NEUTRAL }));
  const observed: Record<number, string> = {};
  let ci = 0;
  for (let tick = 0; tick <= fixture.ticks; tick++) {
    while (ci < commands.length && commands[ci].atTick === tick) {
      const cmd = commands[ci++];
      current[cmd.kart] = { ...cmd.input };
    }
    if (tick > 0) {
      race.stepTick(current);
      race.world.events.drain(); // presentation would pump; here we just clear
    }
    const cp = fixture.checkpoints.find((c) => c.tick === tick);
    if (cp) {
      const h = hashRace(race.karts, race.items.sim, race.world.timeMs, race.world.raceTimeMs ?? 0);
      if (h !== cp.hash) {
        throw new Error(`DESYNC at tick ${tick}: expected ${cp.hash}, got ${h}`);
      }
      observed[tick] = h;
    }
  }
  return observed;
}