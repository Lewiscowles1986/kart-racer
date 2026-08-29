# Build journal 0001 — evaluation round 1 complete, M1 underway

**Date:** 2025-08-29 · **Branch:** `v2-webgl`

## Evaluation round 1 (complete)

Four independent critics delivered evidence-bound reports (all filed verbatim in
`docs/evaluations/round-1/`), orchestrated by the parent agent and then judged.

- **Gameplay (GP-1..GP-14):** mini-turbo ≈ 87% of a mushroom (P0), drift has
  no cost/commitment/feedback (P1), position-blind items (P0: leader rolls a
  5.4s unkillable star 25% of the time), rubber-band that mathematically no-ops
  at the cap, 8 clones for AI, frame-rate-dependent sim (measured 2.3× wall-grind
  divergence 30 vs 144fps), and a real P0 bug: `finishGuarantee` fabricates the
  podium in **array order** (confirmed by two independent evidence paths).
- **Architecture (AR-1..AR-16):** 4/10 multiplayer-readiness; four pillars of
  determinism broken today (variable wall-clock dt, unseeded sim RNG, sim truth
  on THREE objects, sim→presentation sync calls) but only ~720 LOC of genuinely
  sim-relevant code; an 11-step refactor sequence that keeps 24 legacy tests
  green; lockstep-primary netcode recommendation with ADR-9 cross-engine caveat.
- **Visual (VS-1..VS-13):** P0 root cause for the white-quad particles
  (`Effects.ts:48-51` PointsMaterial without `map`); 476 un-instanced
  geometries; barber-stripe kerbs (UV squash); start-arch camera occlusion;
  sky smear; unstyled result buttons; full top-8 impact-per-effort plan.
- **UX (UX-1..UX-12):** zero persistence, zero multiplayer code paths,
  invisible drift charge (corroborating GP-3/VS-1), menu 720p clipping, cramped
  touch cluster, theatre a11y claims, flat audio, juice gap table.

**Judge verdict** (`docs/evaluations/round-1/JUDGE.md`, binding):
- Truth-check: no substantive contradictions; GP-7 ⇄ UX-10 corroborate;
  timestep fixed at **120Hz per ADR-0003** (supersedes architecture's 1/60).
- **Netcode: deterministic lockstep + input-delay is PRIMARY in-race;** host
  demoted to session coordinator; snapshots retained for join/resync/migrate +
  mixed-engine fallback. ADR-0004 amended accordingly.
- Phased backlog J-1..J-40 across M1 (deterministic core) → M2 (presentation)
  → M3 (multiplayer session) → M4 (content & feel), with a 12-point acceptance
  bar mapping to `docs/multiplayer.md` §6 and the sim determinism contract.
- M1 instruction: 9 steps, each its own commit; parity contract with an
  exhaustive list of allowed deviations (GP-7 podium order, GP-9 respawn+ghost,
  120Hz re-derived per-tick constants, tick-driven pause/countdown, seed-stamped
  kart order).

## M1 build status

- Steps 1–4 (trackSim extraction, catalog freeze, fixed-timestep loop,
  SimEvent queue): **builder dispatched**.
- `src/sim/rng.ts` + `src/sim/protocol.ts` with 10 tests landed pre-build
  (judge ratified both as the lockstep primitives).
- Suite at dispatch: 34/34, typecheck strict-clean, build ok.