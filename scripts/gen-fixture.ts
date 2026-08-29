import * as fs from 'node:fs';
import { TRACKS, WORLD } from '../src/config';
import { createHeadlessRace } from '../src/fixture/runner';
import { hashRace } from '../src/sim/state';

const SUNNY = TRACKS[0].points;
const fixture: any = { name: 'sunny-smoke-600', seed: 0x5eed, trackId: TRACKS[0].id, kartCount: 8, ticks: 600, commands: [], checkpoints: [] };
for (let t = 0; t < 600; t += 120) fixture.commands.push({ atTick: t, kart: 0, input: { steer: (t / 120) % 2 === 0 ? 0.6 : -0.6, throttle: 1, brake: false, itemPressed: false, itemHeld: false } });
fixture.commands.push({ atTick: 10, kart: 0, input: { steer: 0.2, throttle: 1, brake: false, itemPressed: false, itemHeld: false } });
fixture.commands.sort((a, b) => a.atTick - b.atTick);
const race = createHeadlessRace(SUNNY, WORLD.roadWidth, fixture.seed, fixture.kartCount);
const current = Array.from({ length: 8 }, () => ({ steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false }));
let ci = 0;
for (let tick = 0; tick <= fixture.ticks; tick++) {
  while (ci < fixture.commands.length && fixture.commands[ci].atTick === tick) { current[fixture.commands[ci].kart] = { ...fixture.commands[ci].input }; ci++; }
  if (tick > 0) { race.stepTick(current); race.events.drain(); }
  if (tick % 240 === 0) fixture.checkpoints.push({ tick, hash: hashRace(race.karts, race.items.sim, race.world.timeMs, race.world.raceTimeMs) });
}
fs.mkdirSync('fixtures', { recursive: true });
fs.writeFileSync('fixtures/sunny-smoke-600.json', JSON.stringify(fixture, null, 2) + '\n');
console.log('wrote', fixture.checkpoints.length, 'checkpoints');
