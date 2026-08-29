# Journal 0002 — M1: the deterministic core

**Milestone complete: 2025-06 round 19. Nine judge-mandated steps, ten commits, 72/72 tests.**

## What M1 promised (JUDGE.md §4) and what landed

| Step | Commit | What it is | Acceptance evidence |
|---|---|---|---|
| 1 | `ff7f4ef` (repaired `ccc88d0`) | Pure track math → `src/sim/trackSim.ts` (three-free); `track.ts` re-exports | sim-track tests + purity gate; visual parity by diag + screenshot |
| 2 | `f7906a1` | Frozen track catalog; Game owns `trackCatalog`, pure `upsertCustomLevel` helper | catalog tests; TRACKS provably never mutated |
| 3 | `70ec661` | 120Hz fixed-timestep ticker (`TICK_MS=1000/120`), Game rewired; pause freezes the sim (AR-11 fix) | 9 ticker tests incl. feed-order invariance (10s ≡ 600×16.7ms) |
| 4 | `5e57051` | `SimEventQueue` — sim emits plain events; `EventBridge` pumps them to FX/sonics; World drops effects/audio | 20 side-channel sites migrated; kart test asserts emitted stream |
| 5 | `d794242` | Seeded SFC32 streams (`items`/`ai`) replace `Math.random` in sim; `?seed=` URL param | same-seed identity, stream-mapping equivalence, distribution sanity |
| 6 | `9b2829d` | `ItemsSim` — boxes/bananas/pads/jumps as plain records; Items.ts = mesh facade | race feel identical; sim never imports `src/game/**` |
| 7 | `70dfaad` | Kart's visuals → `KartVisual.orient/animate` controller fed plain records; `hitPlow` takes `{x,z}` | 63/63; screenshot parity |
| 8 | `08da0b0` | `raceSim`: scoreOf/collideKarts/respawnCheck/fabricatePodium — **GP-7 podium fix**, **GP-9 respawn ghost (2s)** | 5 new tests proving both fixes + v1 collision parity |
| 9 | `0dec72a` | `state.ts` snapshots + `fixture/runner.ts` headless races + committed `fixtures/sunny-smoke-600.json` with bit-identical replay | 72/72; DESYNC detector flips on a 1cm nudge |

## Fixes and behaviour changes (judge-parity exceptions only)

- **AR-11**: `timeMs` used to tick while paused; the 120Hz clock now freezes it.
- **GP-7** (fairness): podium times for stragglers ranked by race score, not array order.
- **GP-9** (feel): 2s post-respawn ghost — no instant re-stick; passes through pushes/plows.
- Input delivery timing ±1 tick; countdown still 3 wall-seconds (tick-driven).

## Discoveries recorded, not "fixed" (v1 parity contract)

1. **`worldToTrack` window drift**: the ±14-sample nearest search mutates `best`
   inside the k-loop, so an exact sample can anchor to an adjacent one (~0.5m
   lateral). Benign in practice (hints move with karts); documented in
   `tests/sim-track.test.js` — a deliberate J-23/J-26 candidate, not an M1 fix.
2. **Float tick boundary**: `1000/120` rounds UP in float64, so a naive
   `floor(delta/tick)` eats one tick per second. The ticker carries an
   epsilon-guard; the test suite pins the whole-second case.
3. **Quantisation discipline**: hashing `undefined` yields NaN→null; snapshots
   normalise via `?? 0`, enforced by the fixture tests.

## Process lessons

- Atomic builders > big monoliths. The 4-step builder stalled and a mid-write
  race with the orchestrator briefly corrupted `tests/sim-track.test.js` in
  git history (repaired in `ccc88d0`). Guardrails now: single-turn atomic
  delegation, `add+commit+push` in one call, tree audits after interrupts.
- Verification is cheap when tests, typecheck, build AND a headless
  playwright race run after every step; keep it mandatory.

## Open items handed to M2

- White/blocky particles (VS-2): particle texture fix queued (first M2 commit).
- 476 draw calls (AR-12) → instancing pass.
- `scoreOf` is the single race-order source now (HUD + podium both use it).