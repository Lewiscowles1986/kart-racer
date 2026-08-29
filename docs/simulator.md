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
   same engine re-executes them identically (determinism is per-engine).
   Cross-engine lockstep stays gated: ADR-0004's amendment makes deterministic
   lockstep PRIMARY (docs/multiplayer.md §4b), and rooms gate on an engine/
   protocol signature in HELLO until J-23/J-26 replace the transcendentals.

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

## 5. Fixtures — IMPLEMENTED (M1 step 9, `0dec72a`)

The first fixture format is live and committed: `fixtures/sunny-smoke-600.json`
(8 karts, 600 ticks, 3 hash checkpoints), replayed bit-identically by
`tests/fixture.test.js` via `src/fixture/runner.ts`. The format (v1) evolved
from the sketch below to what the runner actually consumes:

```jsonc
{
  "name": "sunny-smoke-600",
  "seed": 24301,                    // SFC32 root seed (0x5eed default in Game)
  "trackId": "sunny",
  "kartCount": 8,
  "ticks": 600,                     // replay length at 120Hz
  "commands": [                     // command queue, sticky per kart
    { "atTick": 0,   "kart": 0,
      "input": { "steer": 0.6, "throttle": 1, "brake": false, "itemPressed": false, "itemHeld": false } }
  ],
  "checkpoints": [                  // stateHash (FNV-1a of a sorted-key snapshot)
    { "tick": 0, "hash": "8f0a…" }, // bit-identical replay OR the runner throws
    { "tick": 240, "hash": "e510…" },
    { "tick": 480, "hash": "…" }
  ]
}
```

Semantics, as implemented:
- **Command queue**: a command's input becomes the kart's sticky input from
  `atTick` on, until that kart's next command. Neutral input before the first
  command. `kart` indexes the v1 start grid (P1 front-left, `L - row*7`, lane ±2).
- **Controllable time**: `runner.stepTick(inputs)` advances exactly one 120Hz
  tick (`TICK_MS`); no wall clock, no DOM. The game runs the identical tick body
  (`Game.#simUpdate`).
- **Race identity**: `stateHash` over `snapshotRace()` — plain sorted-key docs,
  floats on the 1e-4 grid (`src/sim/state.ts`). A 1cm position nudge flips the
  hash (desync detector for M3 lockstep, verified by test).
- **Snapshots**: `hashSnapshot(apply) — applyKartSnapshot/snapshotRace` support
  `restore` semantics; `startSnapshot?` remains the planned extension.
- **Scenario fixtures** for playwright demos (`?fixture=<name>&shot=at:400`)
  remain SPEC'd but not yet built — first M3/M4 nicety, not a blocker.

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