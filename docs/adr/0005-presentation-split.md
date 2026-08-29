# ADR-0005: Sim/presentation split — headless-capable core

- **Status:** Accepted
- **Date:** 2025-08-26 (session)

## Context

`src/game/Game.ts` mixes simulation (kart steps, collision, respawn, lap
rules), orchestration (state machine), presentation (camera, particles, HUD
mutation, audio triggers) and platform (renderer setup, DOM bindings, URL
params) in one 576-line class, with `Kart` directly holding `THREE.Vector3`
state and a `visualRoot`. Nothing can be simulated without a WebGL context.

## Decision

**Ports-and-adapters around one `Sim`.**

```mermaid
flowchart TB
    subgraph core["src/sim/  (no imports from three, DOM, or audio)"]
        SIM[RaceSim: snapshot → tick(commands) → snapshot]
        TRACK[Track geometry & sampling]
    end
    subgraph shell["src/game/  (browser shell)"]
        R[Renderer: THREE scene, karts-as-meshes adapter]
        H[HUD/DOM] --- A[Audio]
        FX[Effects]
        IN[Input devices → Command]
    end
    subgraph net["src/net/"]
        NC[NetController: transport + schedule]
    end
    IN --> SIM
    NC --> SIM
    SIM -->|"state"| R & H & A & FX
    SIM -->|"commands out"| NC
```

The sim exposes:
- `createRace(trackDef, opts)` — plain state, no DOM,
- `sim.tick(commands: Command[])` — advances exactly one TICK_MS step,
- `sim.snapshot()` / `restore()` — versioned plain JSON.

The browser shell (`Game.ts`, slimmed) owns the rAF loop, runs the
accumulator → `sim.tick`, mirrors sim state into THREE (one adapter module),
and translates devices/netcode into commands. Headless harnesses (tests,
playwright, demos) import the sim directly with **zero** renderer.

## Consequences

- Deterministic tests, instant-replay fixtures, and CI visual checks all run
  the identical code path players run.
- The same snapshot powers multiplayer host transfer, spectate-late-join, and
  the demo "resume at tick N" artefacts.
- Migration is incremental: extract → keep old `#loop` delegating to the sim
  behind a flag → flip → delete the old path (ADR-0006 flags).