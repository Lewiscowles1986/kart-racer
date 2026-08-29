# ADR-0006: Feature flags & compatibility during the v2 migration

- **Status:** Accepted
- **Date:** 2025-08-26 (session)

## Context

The v2 program replaces the game's timing model, state model and adds
multiplayer. Doing that as one big rewrite would strand the green test suite,
the working Pages deploy, and every visual QA script for weeks.

## Decision

- **URL + localStorage feature flags**, centralised in `src/config.ts` as a
  typed `FEATURES` record (e.g. `simCore`, `net`, `session`), overridable per
  load via `?feat=simCore,net` for QA.
  - Old path stays the default until the new path passes its round of critic
    verification; the flag is flipped by simply changing the default.
  - Each feature lands behind its flag with its own tests; flag + feature are
    deleted in the same release the old path dies (no permanent dual paths).
- **Save/persistence compatibility:** localStorage keys for v1 stay readable;
  new keys are namespaced `kk2.*`, with a one-time import of mute/options
  preferences and a legacy `kk1.` cleanup.
- **Network protocol compatibility:** every netcode message and replay fixture
  carries `v: 1`; parsers reject unknown major versions loudly rather than
  guessing.
- **Level format compatibility:** editor custom levels (`localStorage` JSON)
  keep loading; the sim adopts the same placements schema as its canonical
  level format.

## Consequences

- Any commit on `v2-webgl` is playable and testable: `npm run test` +
  `?feat=` matrix in visual QA.
- Rollback to the pre-refactor play path is a URL flag, not a git archaeology.
- The final v2 milestone deletes flag scaffolding; README then documents the
  settled architecture.