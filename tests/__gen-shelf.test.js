// Fixture-shelf generator — GUARDED: emits fixtures only with GEN_FIXTURES=1
// (`GEN_FIXTURES=1 npx vitest run tests/__gen-shelf.test.js`), so the normal
// suite just skips it. Extend `specs` then run to add a scenario.
// Usage contract (docs/simulator.md): committed fixtures replay bit-identically
// via runFixture; the shelf test enforces >=5 scenarios.
import { it, vi } from 'vitest';
import * as fs from 'node:fs';
vi.mock('../src/util/tex', () => ({
  asphaltTexture: () => ({}), curbTexture: () => ({}), dirtTexture: () => ({}),
  grassTexture: () => ({}), sandTexture: () => ({}), woodTexture: () => ({}), itemBoxTexture: () => ({}),
}));
import { TRACKS, WORLD } from '../src/config';
import { createHeadlessRace } from '../src/fixture/runner';
import { hashRace } from '../src/sim/state';

const RUN_GEN = !!process.env.GEN_FIXTURES;
const gen = RUN_GEN ? it : it.skip;
const N = { steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false };

gen('generate fixture shelf additions', () => {
  const drive = (spec, ticks, checkpointsEvery, commandsFactory, rankBias = 1) => {
    const fixture = { name: spec.name, seed: spec.seed, trackId: TRACKS[0].id, kartCount: 8, ticks, rankBias, commands: [], checkpoints: [] };
    fixture.commands = commandsFactory();
    fixture.commands.sort((a, b) => a.atTick - b.atTick);
    const race = createHeadlessRace(TRACKS[0].points, WORLD.roadWidth, fixture.seed, fixture.kartCount);
    race.items.rankBias = rankBias;
    const current = Array.from({ length: 8 }, () => ({ ...N }));
    let ci = 0;
    for (let tick = 0; tick <= ticks; tick++) {
      while (ci < fixture.commands.length && fixture.commands[ci].atTick === tick) {
        const c = fixture.commands[ci++];
        current[c.kart] = { ...c.input };
      }
      if (tick > 0) { race.stepTick(current); race.events.drain(); }
      if (tick % checkpointsEvery === 0) {
        fixture.checkpoints.push({ tick, hash: hashRace(race.karts, race.items.sim, race.world.timeMs, race.world.raceTimeMs ?? 0) });
      }
    }
    return fixture;
  };

  const specs = [
    {
      // pins the SP-fairness path: rankBias 0.5 (same commands as the MP box
      // fixture, different roulette strength => different items => own hashes)
      name: 'sp-fair-boxes-1', seed: 0x5eed, rankBias: 0.5,
      commands: () => {
        const c = [];
        for (let t = 0; t < 900; t += 60) {
          c.push({ atTick: t, kart: 0, input: { steer: (t / 60) % 2 === 0 ? 0.35 : -0.35, throttle: 1, brake: false, itemPressed: false, itemHeld: false } });
        }
        for (let t = 200; t < 900; t += 240) {
          c.push({ atTick: t, kart: 0, input: { steer: 0.2, throttle: 1, brake: false, itemPressed: true, itemHeld: false } });
        }
        return c;
      },
    },
  ];
  fs.mkdirSync('fixtures', { recursive: true });
  const built = [];
  for (const s of specs) {
    const f = drive(s, 900, 300, s.commands, s.rankBias ?? 1);
    fs.writeFileSync(`fixtures/${f.name}.json`, JSON.stringify(f, null, 2) + '\n');
    built.push(`${f.name}(${f.checkpoints.length}cp)`);
  }
  console.log('wrote', built.join(' '));
});
