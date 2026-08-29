# ARCHITECTURE CRITIQUE: Kart Kingdom v2-webgl — as a base for deterministic multiplayer

(Evaluation-only; no repo files touched. All 24 tests verified passing; typecheck clean; every claim below has file:line evidence read directly.)

## VERDICT

**4/10 from a solid multiplayer-ready deterministic core — but the distance is short and cheap.** All four pillars of determinism are broken today: variable wall-clock `dt` feeds integration (`Game.ts:364-367`), unseeded `Math.random` decides sim outcomes (`Items.ts:198`, `AI.ts:54`), sim ground truth lives on THREE scene objects (`Items.ts:273/281/312`), and `Kart.update` calls audio/effects synchronously mid-step (`Kart.ts:155-375`) — no two machines can agree on a race. Yet the genuinely sim-relevant code is only ~720 LOC, hot loops iterate arrays in fixed order (no Set/Map hazards found), tree/texture generation already uses seeded PRNGs (`track.ts:280-281`, `tex.ts:9-16`), and `kart.test.js:17-23` proves the kernel is exactly one interface away from headless. This is a 9-step refactor, not a rewrite.

## FINDINGS

- **AR-1 | P0 | Sim-critical RNG is global `Math.random`, interleaved with cosmetic draws** — `Items.ts:198` (roulette *decides the actual item*), `AI.ts:54` (AI item usage), share one stream with cosmetic FX (`Effects.ts:82-110`, `Items.ts:225`, `HUD.ts:326`) — so cosmetic call order is load-bearing and unreplayable. *Fix: inject `IRng` (seeded per race, per-kart substreams); detach cosmetic FX stream.*
- **AR-2 | P0 | No fixed timestep; frame-dependent physics** — `Game.ts:364-367` (rAF + `THREE.Clock.getDelta()` clamp 0.05) feeds `Kart.update` (`Kart.ts:208-335`) including frame-rate-dependent approximations `speed *= (1 - 0.9*dt)` (`Kart.ts:249`) and `(1 - JUMP.airDrag*dt)` (`Kart.ts:238`). 60Hz vs 120Hz ProMotion plays differently. *Fix: accumulator at h=1/60 (≤5 catch-up steps).*
- **AR-3 | P0 | Sim calls presentation synchronously through the World facade** — `world.audio.*` at `Kart.ts:170,181,186,204,292,328` and `world.effects.*` at `Kart.ts:155,169,180,187,205,293,375-378`; `Items.ts:209-215,286-287`; `Kart` holds `visualRoot` and writes quaternions inside `update` (`Kart.ts:333-334, 346-381`). Headless requires stubbing 10+ methods — `kart.test.js:17-23` maintains exactly those stubs, the brittleness proof. *Fix: SimEvents queue; Game drains to Audio/Effects.*
- **AR-4 | P0 | Sim truth on THREE objects** — box pickup reads `b.mesh.position`/`b.mesh.visible` (`Items.ts:273, 281-284`), sets visibility as state (`288`); banana collisions read `b.mesh.position` (`312`) while `Banana.pos` (`227`) is a dead duplicate (y always 0). A net sync layer would have to scrape the scene graph. *Fix: plain fields; meshes as projections.*
- **AR-5 | P1 | `world = this` god-facade** (`Game.ts:76`) satisfying `World {karts,timeMs,totalLaps,effects,audio,items}` (`Kart.ts:23-30`), held by Kart/Items/AI alike. No event bus. *Split SimWorld vs presentation handles.*
- **AR-6 | P1 | Game.ts = 576-line god-object mixing 5 roles** — renderer/lights/PMREM (`130-178`), inline DI of all subsystems (`237-275`), race machine+collision+finish (`288-501`), camera/HUD (`503-560`), localStorage/URLSearchParams platform code (`331-354, 358`). Zero DI seams (clock, matchMedia, location).
- **AR-7 | P1 | Runtime mutation of global config** — `loadCustomLevel` splices/pushes into the exported `TRACKS` const (`Game.ts:348-350`), breaking the "config is constants" contract (`tests/config.test.js:39-53` would observe pollution). *Instance-level catalog.*
- **AR-8 | P1 | Input edge state is imperative and order-sensitive** — `itemPressed` set on keydown (`Input.ts:32,39`), cleared only via `resetFrame` (`42`) on the player path (`Game.ts:440-441`); a skipped/double read loses edges. The `InputFrame` type itself (`Input.ts:4-10`) is plain and command-perfect. *Frame-indexed InputSource buffers for local/remote/AI.*
- **AR-9 | P1 | Transcendental float math in the hot path — cross-engine lockstep risk** — `Math.sin/cos/exp` in `terrainHeight` (`track.ts:39-47`), finite-difference normals (`52-58`), `atan2/hypot` in yaw and AI (`Kart.ts:141,268`, `AI.ts:26-32`, `Game.ts:458`). JS arithmetic is IEEE-deterministic, but transcendental ULPs differ across V8/JSC/SpiderMonkey → lockstep desync on mixed browsers. *Gate rooms to same-engine peers, or port terrain to polynomial/fixed-point.*
- **AR-10 | P1 | Race orchestration is private to the renderer loop class** — `#collide` (`Game.ts:452-474`), `#respawnCheck` (`412-423`), finish logic (`476-501`): deterministic today but untestable/unreachable by a host or guest sim process.
- **AR-11 | P2 | Clock advances while paused** — `timeMs += dt*1000` runs before the paused early-return (`Game.ts:367` vs `369`), so AI noise (`AI.ts:48`) and box bob (`Items.ts:267,275`) keep drifting; sim time must tick only in steps.
- **AR-12 | P2 | Kart array order is runtime-mutable and load-bearing** — `#applyPlayerSelection` splices/unshifts (`Game.ts:280-286`); array order gates pickup priority (`Items.ts:289`), collision pair order (`Game.ts:454-455`), AI rubber-band target `karts[0]` (`AI.ts:40`). Order must be part of the race seed.
- **AR-13 | P2 | Duplicated prop-building code already diverged** — `editor.ts:35-70` vs `Items.ts:87-178,219-238`; emissive differs (`editor.ts:37` 0x664400 vs `Items.ts:89` 0x222200). Netcode-identical static geometry needs one source.
- **AR-14 | P2 | Zero state serialisation** — nothing to/from JSON for karts/boxes/race; only the editor's `LevelDef` is serialisable (`editor.ts:21-27, 440-443`) and it's a good model. *State is small (~28 numeric fields/kart) — mechanical to add.*
- **AR-15 | P2 | Platform touchpoints scattered, unmockable** — `Game.ts:90` matchMedia, `94` keydown, `132-145` resize, `361` rAF, `404` document#diag; `HUD.ts:131,209,299` triple `'ontouchstart'`; localStorage `Game.ts:332`/`editor.ts:474`. *Inject a Platform port.*
- **AR-16 | P3 | Nits** — `Audio.warmup()` builds AudioContext at Game-construction (`Audio.ts:42-44` via `Game.ts:239`), crashes Node import tests; gamepad advertised but not implemented (`Input.ts:1`); hard-coded world bounds ±250 (`Kart.ts:283-284`); double `worldToTrack` per kart/frame (`Kart.ts:218+298`, fine at n=8); `Date.now` editor IDs (`editor.ts:32`).

## NONDETERMINISM INVENTORY

**Clock**: `Game.ts:357` (THREE.Clock), `364-367` (rAF, wall-dt clamp, timeMs accumulation), `369-372` (timeMs advances while paused), `273/379/432` (setTimeout banners), `main.ts:18-31` (rAF + performance.now boot), `RacerPreview.ts:63-75` (own rAF, fake fixed 0.016 — cosmetic), `Audio.ts:63` (ctx.currentTime), `Audio.ts:135` (setInterval music), `editor.ts:32` (Date.now IDs, editor-only).

**RNG — sim-bearing**: `Items.ts:198`, `AI.ts:54`. **RNG — cosmetic**: `Effects.ts:82,83,84,88,89,97,98,99,107,109,110`, `Items.ts:225`, `HUD.ts:326`, `editor.ts:212`. **Seeded (fine)**: `tex.ts:9-16` mulberry32 (all 10 texture generators), `track.ts:280-281` LCG seed 12345 → random tree scatter is deterministic.

**THREE objects in sim**: `Kart.ts:51,93,129-130,281-284` (pos as Vector3 — vec-math OK, blocker for serialisation only), `Kart.ts:347,365,371-372,380` (visualRoot writes inside update), `Items.ts:273,275,281,288,307,312` (mesh.visible/position as truth), `Items.ts:96-98,105-119,145-149,174-177` (static props positioned via meshes).

**DOM/window in game code**: `Game.ts:90,94,132-145,332,358,361,403-409`; `Input.ts:29-36`; `HUD.ts:72-140, 122-135, 263-280, 409-430`; `tex.ts:19-21` + getContext ×10 (`38,85,119,140,153,169,196,222…`); `Audio.ts:47`; `main.ts:5-31`; `RacerPreview.ts:17,20`; editor `103-104,283-343,395,440-443,474`.

**Iteration order**: clean — no Set/Map/for-in/Object.keys in any sim path (grep-verified); all hot loops index-ordered arrays (`Game.ts:454-455`, `Items.ts:268-322`). Sole hazard is the karts permutation (AR-12).

## KEY ANSWERS PER CRITERION (compressed)

**1. Sim/presentation split & LOC**: Game.ts 576 ≈ **sim 185 / render 95 / UI glue 95 / audio+input glue 25 / wiring+platform 175**. Kart.ts 382 ≈ sim 250 / visual 60 / fx-audio glue 40 / meta 30. Items.ts 324 ≈ sim 120 / mesh-build 130 / glue 70. track.ts 327 ≈ sim math 100 / geometry 200. AI 74 sim. Input 72, HUD 432, Effects 160, Audio 138, KartVisual 218, tex 232 = presentation/platform. **Total sim-relevant ≈ 720 LOC.**
**2. State model**: enumerated in the report delivered above (per-kart 28 fields, boxes, bananas, race state); ~70% serialisable today, rest mechanical after AR-4.
**3. Timing**: variable rAF dt only; countdown accumulator shows the right instinct at wrong grain (`Game.ts:374-380`).
**4. Input**: `InputFrame` is command-shaped and AI is literally a second InputFrame producer (`AI.ts:22,62`) — injection point is `Game.ts:441`; blocked only by the `resetFrame` edge discipline (AR-8).
**5. Tests (24 verified green)**: kart 5, input 5, track 6, config 8. Untestable today: `#collide`, lap counting, `Items.update` proximity (`Items.ts:249-251`), roulette, respawn, Game FSM. Top-5 headless unlocks: bit-identical 60s replay; two-peer checksum match; item-interaction matrix (banana×shield×star, pad+jump overlap); reverse-line lap-cheat prevention (`Kart.ts:314-319`); snapshot round-trip equality.
**6. Debt ratings**: Game/Kart/Items/track/HUD → SPLIT; AI/Effects/Audio/KartVisual/minimap/RacerPreview/config/tex → KEEP; Input → REFACTOR (port); main → ABSORB into platform bootstrap; editor → KEEP-as-tool (move LevelDef types to shared).

## NETCODE FIT RANK (for THIS codebase)

**Primary: (a) deterministic lockstep + input-delay (2-3 ticks @60Hz) + input replay.** Reasons grounded in the code: tiny sim, no physics engine, pairwise circle push only (`Game.ts:452-474`); state ≈250 floats; item boxes/pads/jumps are static placements derived from serialisable frac/lateral config (`config.ts:207-244`, `Items.ts:31-35`) so only taken/respawn state matters; inputs already commands; AI already an input source; free replays/spectating; checksum-divergence even gives free cheat detection.
**Fallback: (b) host-authoritative snapshot P2P with interpolation** — works with variable dt *today*: host runs the existing single-Game world, remote karts injected at `#updateKarts` (`Game.ts:436-449`), only snapshots + interp buffer needed. Costs: serialisation, no replay story, host bookkeeping.
**Rejected for now: (c) rollback** — needs sub-frame serialise/resim plus pure events; AR-3/AR-4 make undo semantics expensive. After lockstep determinism exists, rollback becomes an incremental protocol change, not an architectural one.

**Cross-engine caveat (AR-9)**: same-engine rooms first (friends via manual signalling anyway); polynomial terrain as the permanent fix.

## SYSTEM BOUNDARIES (few/no servers)

```
[Browser A — host peer, runs sim]          [Browser B — guest peer]
   ⇅ RTCDataChannel ×2 (unreliable: per-tick input; reliable: lobby/restart/track JSON)
   ⇄ BroadcastChannel (same-origin tabs: local 2P + automated lockstep test rig)
   → STUN stun:…:3478/udp        (public, untrusted, ICE only)
   → TURN coturn 3478/5349+TCP443 (OPTIONAL, trusted relay = weakest link; degrade = refuse)
   → signalling: manual SDP copy/paste (zero-trust default) ∥ ~20-line ephemeral WS relay
```
Custom tracks ride the reliable channel; `localStorage 'customLevel'` (`Game.ts:332`, `editor.ts:474`) already provides same-origin sharing. **Trust rules**: guests submit only clamped `InputFrame` values (one-line validator steer∈[-1,1], throttle∈[0,1]); host==authority for lap/finish; no server ever sees game state. **Acceptable cheating for friends-racing**: input-spoofing bots (yes), client tampering (detectable via lockstep checksum divergence), do not build anti-cheat beyond clamps + checksum alerts.

## PROPOSED v2 MODULE MAP

```
src/
├─ sim/                     # PURE: no THREE/DOM/audio/wall-time/global-random; Node+Worker safe
│  ├─ trackSim.ts           # spline samples, terrainHeight/Normal, worldToTrack (from track.ts math)
│  ├─ state.ts              # SimState schema + serialize/deserialize + tick checksum
│  ├─ kartSim.ts            # kart.step(): physics, drift, boost, laps (from Kart.ts core)
│  ├─ itemsSim.ts           # seeded roulette, pad/jump proximity, bananas, box respawn
│  ├─ raceSim.ts            # collide, respawn, finish, countdown, final-lap
│  ├─ aiSim.ts              # rubber-band AI → InputFrame (seeded)
│  ├─ events.ts             # SimEvent queue sim→presentation (fx/audio/UI triggers)
│  ├─ rng.ts                # seeded PRNG + per-kart substreams
│  └─ loop.ts               # fixed-step accumulator, headless runner, replay recorder
├─ render/                  # three.js only; reads state, consumes SimEvents
│  ├─ renderer.ts / sceneSetup.ts / trackVisual.ts / kartVisual.ts / effects.ts / cameraRig.ts
├─ ui/                      # DOM: hud.ts, menu/ (menu, pause, results), editor/
├─ net/
│  ├─ transport.ts          # unreliable-tick + reliable-control channel interface
│  ├─ broadcastChannel.ts / rtcPeer.ts / signal.ts (manual SDP paste / tiny relay)
│  ├─ lockstep.ts           # input-delay ring buffer, per-tick checksum, resync
│  └─ snapshotHost.ts       # fallback path: host-authoritative deltas + interp
├─ platform/                # injectable edges: clock.ts, storage.ts, inputBridge.ts, audioBridge.ts
└─ main.ts                  # composition root
```

## REFACTOR SEQUENCE (each step keeps 24 tests green)

1. **Extract pure track math** → `src/sim/trackSim.ts` (THREE-free); `track/track.ts` re-exports so `track.test.js:14` passes; `terrainNormal` returns plain `{x,y,z}`.
2. **Freeze the catalog** — `loadCustomLevel` (`Game.ts:331-354`) feeds an instance catalog; test asserts `TRACKS` never mutates.
3. **Fixed timestep** — accumulator (h=1/60, ≤5 substeps) + tick counter; test: N fixed steps ⇒ identical `prevU/lap/pos` for scripted inputs.
4. **SimEvent queue** — replace every `world.audio/effects` call in `Kart.ts`/`Items.ts`; Game drains per frame; add event assertions to kart tests.
5. **Injected RNG** — `IRng` into `rollItem` + AI; same-seed sequence tests; cosmetic FX isolated.
6. **Purify Items state** — plain `{taken, respawn, pos}`; fix reads at `Items.ts:273/281/288/312`; add `update()` table tests.
7. **Purify Kart** — move `#orient/#visuals` (`Kart.ts:346-381`) behind a visual controller fed by events + state; drop visual from Kart.
8. **Extract `raceSim.ts`** — move `Game.ts:412-501` onto plain state; collision/lap/finish unit tests.
9. **Serialisation** — `state.ts` schema; round-trip equality test.
10. **InputSource port** — frame-indexed buffers for local/remote/AI (retires `resetFrame`); replay-equals-original test.
11. **Net skeleton** — BroadcastChannel transport first (free loopback), lockstep host/guest on the headless sim, manual-paste RTC signalling.

Steps 1-8 are each one small, visually-invisible PR; after step 8 the codebase can negotiate any of the three netcode models, and after step 11 it is multiplayer.