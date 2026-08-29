# Build journal 0000 — kickoff & baseline

**Date:** 2025-08-26 (session) · **Branch:** `v2-webgl` (worktree `.worktrees/v2-webgl`, forked from `main@1ccb5cd`)

## What was done

1. **Worktree + branch** (ADR-0001): v2 work moved to worktree
   `.worktrees/v2-webgl` on branch `v2-webgl`; `main` untouched; pushed to origin.
2. **Baseline health check** (recorded before any change):
   - `npm run test` → **24/24 pass** (input, config, track, kart suites)
   - `npm run typecheck` → **strict-clean**
   - `npm run build` → **ok** (≈1s, Vite)
   - headless auto-race via `scripts/qa.mjs` / new `scripts/vqa.mjs`
     (playwright-core + system Chrome, SwiftShader): no console errors over a
     full multi-minute race; `#diag` exposes live sim state.
   - Visual spot-check (screenshots reviewed with image reading): menu renders
     and reads well; in-race HUD (position/timer/lap/minimap) good; **white
     untextured quads floating near the kart** flagged for the visual critic
     to root-cause; item boxes read as plain gold crates.
3. **Evaluation round 1 kicked off** (ADR-0002): four parallel critics —
   gameplay/physics, architecture/netcode, visuals, UX/content — each
   evidence-bound; reports will land in `docs/evaluations/round-1/`, judged by
   `docs/evaluations/round-1/JUDGE.md`.
4. **Design ADRs 0001–0006** committed (worktree policy, loop process,
   deterministic core, multiplayer boundaries, presentation split, feature
   flags).

## Baseline nondeterminism evidence (first-hand, file:line)

- Variable dt into sim: `Game.ts:366` (`clock.getDelta()` clamped to 0.05)
- `Math.random` in sim paths: `Items.ts:198` (roulette), `AI.ts:54` (decision jitter)
- `setTimeout` in race flow: `Game.ts:379`, `Game.ts:432`
- Serialisable input frames already exist: `Input.ts:4` (`InputFrame`)