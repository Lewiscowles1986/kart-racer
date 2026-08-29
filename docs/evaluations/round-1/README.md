# Evaluation round 1

- **Date:** 2025-08-26 → 08-29 (session)
- **Baseline:** 24/24 tests, strict typecheck, build ok, headless auto-race clean.
- **Reports:**
  - `ux.md` — UX/content/audio/a11y critic (delivered)
  - `architecture.md` — architecture/netcode critic (delivered)
  - `visual.md` — visual/rendering critic (delivered; white-quad root cause: `Effects.ts:48-51` PointsMaterial without map)
  - `gameplay.md` — gameplay/physics critic (running; finalisation requested)
- **Fresh baseline captures** taken from the v2-webgl worktree's own dev server
  (port 5174; the stray port-5173 server belongs to the main checkout):
  `scripts/shots/{menu,race-start,race-mid1..3}.png` — confirm critic evidence
  first-hand (kerb barber-stripes, flat boost-pad, translucent minimap, sky smear).
- **Judge:** `JUDGE.md` (after all four report)

Critic remits are anchored in ADR-0002; find all four live in `docs/evaluations/round-1/` once complete.