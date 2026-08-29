# Evaluation round 1

- **Date:** 2025-08-26 → 08-29 (session)
- **Baseline:** 24/24 tests, strict typecheck, build ok, headless auto-race clean.
- **Reports (all four delivered, evidence-verified by the orchestrator):**
  - `ux.md` — UX/content/audio/a11y critic (UX-1..UX-12)
  - `architecture.md` — architecture/netcode critic (AR-1..AR-16; lockstep-primary recommendation)
  - `visual.md` — visual/rendering critic (VS-1..VS-13; white-quad root cause: `Effects.ts:48-51` PointsMaterial without map)
  - `gameplay.md` — gameplay/physics critic (GP-1..GP-14, quantified probes; podium-order bug GP-7 confirmed by independent diag sampling)
- **Judge:** `JUDGE.md` (truth-check, netcode reconciliation, merged ranked backlog, next-builder instruction, acceptance bar)
- **Fresh baseline captures** taken from the v2-webgl worktree's own dev server
  (port 5174; the stray port-5173 server belongs to the main checkout):
  `scripts/shots/{menu,race-start,race-mid1..3}.png` — confirm critic evidence
  first-hand (kerb barber-stripes, flat boost-pad, translucent minimap, sky smear).
- **Judge:** `JUDGE.md` (truth-check, netcode reconciliation, merged ranked backlog, next-builder instruction, acceptance bar)

Critic remits are anchored in ADR-0002; find all four live in `docs/evaluations/round-1/` once complete.