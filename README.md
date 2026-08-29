# 🏎️ Kart Kingdom

A joyful, child-safe 3D kart racer built with **Three.js** — tuned to feel like the
best of the genre (Mario Kart / Crash Team Racing) without looking or sounding like
any of them. Cartoony-but-glossy PBR visuals, synthesized audio, and snappy arcade
physics. No external art, models, or audio assets — everything is generated
procedurally so it loads fast and looks cohesive.

## Play

```bash
npm install          # (uses a local npm cache to avoid permission issues)
npm run dev          # then open http://localhost:5173
```

**Controls (keyboard):**
- **W / ↑** — accelerate
- **A / D or ← / →** — steer
- **Space** — use item
- **S / ↓** — brake; hold **W + S** at speed to **drift** (builds a mini-turbo)
- **P / Esc** — pause · **M** — mute · **Q** — quit to menu
- On touch devices, on-screen buttons appear (with a brake button for drifting).

## What's in it

- **3-lap races** vs 7 friendly rubber-banded AI racers across a 3D track with
  rolling hills, kerbs, fences, trees and a start arch.
- **Items** from glowing boxes (with a roulette reveal): 🍌 **banana** (dropped,
  makes a kart spin), 🍄 **mushroom** (speed boost), ⭐ **invincible star** (shield +
  boost). No tradmarkable names or art.
- **Arcade kart physics**: grip-heavy steering, kart-style drift with a charged
  mini-turbo, off-road slowdown on grass, banana spin-outs, kart-to-kart bumps.
- **Polish**: PBR/clearcoat materials with environment reflections, soft shadows,
  ACES tone mapping, hemisphere + key-sun + rim lighting, particles (boost flames,
  drift dust, spin stars, pickup rings), procedural textures, animated character
  drivers, synthesized engine/item/music audio, minimap with racer dots, item
  roulette, HUD, countdown, pause/mute, finish results.
- **Accessibility & safety**: no flashing/strobing, clear large controls, no mature
  content, `prefers-reduced-motion`-friendly, mute toggle.

## Architecture

```
src/
  main.ts            bootstrap + window.THREE for tooling
  config.ts          every tuning constant in one place (typed)
  sim/               DETERMINISTIC CORE (M1): pure track math, raceSim,
                     ItemsSim, SFC32 seeded Rng, SimEvents, 120Hz loop,
                     state snapshots + FNV-1a stateHash; no THREE/DOM/clock
  net/               MULTIPLAYER (M3): Transport (Loopback / BroadcastChannel /
                     WebRTC manual-SDP), Lockstep (2-tick input delay +
                     20Hz stateHash), NetController lobby + AI backfill
  fixture/           headless deterministic race runner (command queues)
  game/
    Game.ts          renderer, scene, state machine, net session wiring
    Kart.ts          arcade physics (steer/accel/drift/boost/spin)
    KartVisual.ts    procedural kart + driver meshes (visual controller)
    Items.ts         item boxes, rank-weighted roulette (M4), bananas
    Effects.ts       pooled GPU particles + soft sprite (M2) + rings
    Post.ts          bloom + vignette composer (M2, reduced-motion safe)
    HUD.ts           DOM overlay (rank ladder, timer, minimap, menus, a11y)
    Prefs → src/prefs.ts  persisted volume/mute/camera/motion
  track/track.ts     Catmull-Rom loop, instanced fences/trees (M2), terrain
  util/tex.ts        procedural canvas textures (kerb/sky/clouds rebuilt M2)
  prefs.ts           corruption-tolerant localStorage settings
fixtures/            committed replayable races (bit-identical stateHash)
docs/                architecture, simulator contract, multiplayer handbook
                     + design ADRs + journals 0002..0004 (per-milestone)
tests/               95 Vitest tests incl. the sim purity gate + net suites
scripts/             headless QA: race/loop vqa, 2-tab MP check, WebRTC check
```

## Multiplayer (zero servers in the data path)

- **Same-browser tabs**: open `?room=<code>&host=1` in one tab and
  `?room=<code>&name=You` in another — the lobby auto-starts at 2 racers via
  `BroadcastChannel`.
- **Cross-device**: the WebRTC transport carries the same protocol with
  manual offer/answer codes (paste, no signalling server). LAN works with host
  candidates alone; `?stun=` lifts it onto the internet.
- **Lockstep, not snapshots**: every peer runs the same 120Hz deterministic
  sim with a 2-tick input delay and a 20Hz `stateHash` agreement — a desync
  is an alarm, not a state transfer. A dropped player's kart is backfilled by
  every peer's *identical* local AI (same seed ⇒ same consumption), so the
  race never stalls; rematch replays the same seed in the same room.

## Deterministic simulator

`?seed=` pins the RNG. `fixtures/*.json` script command-queue inputs per tick
and pin FNV-1a stateHashes at checkpoints — replays are bit-identical or the
test suite fails (`DESYNC`). `docs/simulator.md` is the contract;
`docs/multiplayer.md` §4b is the lockstep spec.

## Development

```bash
npm install
npm run dev          # dev server (Vite, TS transpiled on the fly)
npm run build        # production build
npm run test         # Vitest regression suite (95 tests)
npm run typecheck    # tsc --noEmit (strict)
node scripts/vqa.mjs race     # headless visual QA (screenshots + diag)
node scripts/mp-check.mjs     # two-tab multiplayer live check
```

The project is **TypeScript** (strict mode) with a typed `config.ts` as the single
source of tuning truth. The sim purity gate (`tests/sim-track.test.js`) blocks
`Math.random`/`performance.now`/DOM from `src/sim/**` — determinism is
mechanically enforced, not promised.

## QA methodology

Because the runtime model has no image input, visual verification is done through a
headless-Chrome pipeline that **actually runs the game** (auto-race via `?auto=1`)
and checks objective frame metrics (brightness/saturation/palette/road-vs-grass
composition) plus a live scene-graph raycast. Four independent harsh-critic
sub-agents audited gameplay feel, visuals, polish/UX/audio, and bugs; their P0/P1
findings were integrated. This caught and fixed real issues, including:
- a steering-inversion bug that sent karts off the road (boost made steering flip),
- a road that was invisible because ribbon triangle winding flipped on half the loop,
- trees that could spawn on the track (hint-windowed `worldToTrack`),
- a missing shadow system and flat Lambert materials → PBR + shadows added,
- a particle-system crash (`Effects._setZero`), a dust-call crash on drift, and
  banana self-hits,
- missing respawn, item reset, pause/mute/quit, item roulette and minimap dots.
