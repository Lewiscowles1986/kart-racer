# The Deterministic Simulator — command queues, controllable time, fixtures

This is the contract the simulation core (`src/sim/`) implements and the one
tests, QA scripts, demos and the netcode all build on. See ADR-0003 for the
why.

## 1. The determinism contract

> **Running the same race twice from the same snapshot, with the same command
> trace, under the same seed, produces bit-identical state** (checked with a
> state hash after every tick, in CI, every commit).

To make that true, the sim obeys four commandments:

1. **No wall clock.** Time exists only as `tick` (fixed `TICK_MS`).
2. **No free variables.** No `Math.random`, no `Date.now`, no
   `performance.now`, no `setTimeout`, no globals mutated mid-sim. Use the
   injected `Rng` and tick-based timers.
3. **No hidden inputs.** Everything the race outcome depends on enters
   through `commands` or `config` (or the seeded rng).
4. **Float discipline.** Only `+ - * /` and integer ops inside the step.
   Transcendentals (`sin/cos/atan2`) are allowed inside a *step* because the
   same engine re-executes them identically (determinism is per-engine);
   cross-engine lockstep is deliberately out of scope (ADR-0004 uses
   host-authoritative snapshots instead).

## 2. Time control

`RaceSim.advance(n = 1)` steps the race exactly `n` ticks. Nothing else moves
time. This one API gives you:

- **Instant replay**: `advance(6000)` → 50 seconds later, immediately.
- **Freeze**: stop calling `advance` — presentation keeps rendering.
- **Slow-mo / fast-forward**: presentation's accumulator ratio vs sim ticker.
- **Scenario fixtures**: `restore(snapshotA); advance(N); inject(cmd); advance(1)`
  → assert on a single tick's consequences.

## 3. Commands

```ts
type Command =
  | { v: 1; kind: 'INPUT';  tick: number; seq: number; playerId: number;
      frame: { steer: number; throttle: number; brake: boolean;
               itemPressed: boolean; itemHeld: boolean } }
  | { v: 1; kind: 'SET';    tick: number; seq: number; playerId: number;
      key: string; value: number };   // for fixtures: teleport, boost, etc.
```

- Queued per tick; consumed exactly once; late commands are dropped loudly
  (console.warn in dev, test failure in CI) — never silently applied late.
- `seq` orders commands from one player within a tick.

## 4. State & snapshots

```ts
interface RaceState {
  v: number;                // snapshot version, always written
  tick: number;             // sim tick = time
  seed: number;             // current RNG stream positions derived deterministically
  phase: 'countdown' | 'racing' | 'finished';
  countdownTicks: number;
  karts: KartState[];       // plain records: pos{x,y,z}, yaw, speed, boostT, …
  items: ItemState;         // boxes, pending roulettes, dropped hazards
  events: SimEvent[];       // tick-scoped, consumed by presentation/net
}
```

`snapshot(): RaceState` / `restore(s)` / `hash(state)` (FNV-1a over a stable
serialisation) are the whole memory API. Snapshots are versioned; readers
bail on unknown `v`.

## 5. Fixtures

A **fixture** is a JSON file: `{ seed, trackId, startSnapshot?, commands[] }`.
It is a full, resumable scenario: tests, playwright demos, and the netcode's
"state sync on join" all consume the same shape.

```jsonc
{
  "name": "drift-charge-release-at-tick-400",
  "seed": 1337, "trackId": "sunny",
  "commands": [
    { "kind": "INPUT", "tick": 10,   "seq": 0, "playerId": 0,
      "frame": { "steer": -1, "throttle": 1, "brake": true, "itemPressed": false, "itemHeld": false } },
    { "kind": "INPUT", "tick": 400,  "seq": 1, "playerId": 0,
      "frame": { "steer": -1, "throttle": 1, "brake": false, "itemPressed": false, "itemHeld": false } }
  ]
}
```

**Playback = restore + replay + assert.** Visual demos pick a fixture, play it
in a real browser and screenshot at labelled moments
(`?fixture=<name>&shot=at:400`), so "highlight sections, scenarios and
interactions for demonstrating to others" is a file + a query param, not a
scripted puppet dance.

## 6. Who drives the sim in production

- **Local play:** keyboard/touch/gamepad adapters translate device events into
  the same `Command` records just before each tick closes.
- **Host:** guests' netcode commands join the local queue (netcode layer, ADR-0004).
- **Guest:** `restore(hostSnapshot)` then only *presents*; its local inputs are
  sent to the host.

## 7. Testing pyramid

| Layer | Runs | Example |
| ----- | ---- | ------- |
| unit | node, µs | drift charge math; two karts colliding from snapshot |
| property | node | random command fuzz: sim never NaNs, never tunnels through fences |
| determinism | node | same fixture ×2 → identical hashes; different seed ≠ |
| golden race | node | full 3-lap race fixture; hash must match pinned value (bump consciously) |
| scenario | playwright | fixture + labelled screenshots reviewed as images in CI artifacts |