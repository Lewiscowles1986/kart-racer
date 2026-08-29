# Journal 0003 — M2: presentation, polish & preference

**Milestone complete at round 30. Eight judge-mandated steps + a critic-driven close-out; 87/87 tests.**

## What M2 promised (JUDGE.md §5) and what landed

| Step | Commit | Delivery |
|---|---|---|
| 1 | `6e0882c` | Particle sprite (J-13): 64² radial-gradient CanvasTexture + alphaTest; soft glows replace square confetti |
| 2 | `79733ce` | Kerb checker-scale (J-14) + sky rebuild (J-15): barber-stripes → checker bands; seamless banded clouds |
| 3 | `a0afd74` | Instancing (J-16/AR-12, atomic builder): fence posts + trees → 4 InstancedMeshes; **386→11** meshes per track |
| 4 | `7996722` | Shadow-follow player (J-16): 2048² map stays crisp around the kart |
| 5 | `551cf32` | Bloom+vignette (J-17): LDR-safe threshold 1.0, reduced-motion off, SwiftShader fallback |
| 6 | `e42f89c` | Name plates (J-18) + `?debug` scene-inspection handle |
| 7 | `ad2d5e9` | Prefs (J-21/UX-1): volume/mute/camera/reduced-motion, corruption-tolerant, 5 tests |
| 8 | `5289ff0` | Rank ladder (J-19): live P1–P8 from `scoreOf`, player row gold |
| close | `b23035a` | Visual-critic top-5: flame trail, cloud seams, kerb blowout, plate/minimap legibility, banner-camera clip |

## Process record

- The **atomic instancing builder** executed cleanly end-to-end this time
  (baseline audit → InstancedMesh conversion → 2 new tests → its own
  commit+push, zero sim-file touches) — the small-scope pattern works.
- The **M2 exit visual critic** ran after all steps landed and produced the
  top-5 list the close-out commit consumed one-for-one. Its one non-visual QA
  catch (?auto demo resetting ~13s in) is queued for the M4 demo pass.
- The **LDR bloom lesson**: threshold 0.92 white-out the sky on SwiftShader —
  threshold 1.0 (clip-only bloom) is the honest setting for an LDR composer.

## Deferred to M3/M4 (recorded, not lost)

- Camera occlusion handling beyond the banner (full occlusion logic is M4
  juice); `?auto` demo-cycle timer reset; volume pref → audio gain wiring
  (with the M4 audio pass); minimap kart-dots merging at speed.

## M3 running start (landed inside the M2 window)

- `131d986` — Transport interface + Loopback/BroadcastChannel (J-23).
- `55ae577` — Lockstep core (J-24/J-25): 2-tick input delay, neutral-fill
  gate, 20Hz stateHash tripwire; 5 tests prove two peers agree tick-for-tick.
- Next: NetController in Game's tick loop, lobby, WebRTC, docs/multiplayer §4b
  is the implementation contract.