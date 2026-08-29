# KART KINGDOM — ROUND-1 JUDGE VERDICT

Judge scope: the four round-1 critic reports read in full; ADR-0003/0004 and docs/multiplayer.md read for binding decisions; src spot-checks limited to `src/sim/rng.ts` + `src/sim/protocol.ts` (2 of 6 allowed; src listing confirmed nothing else exists under `src/sim/`). No tracked files modified, no tests run, no browsers.

---

## 1. TRUTH-CHECK

**No substantive contradictions between critics. Where they overlap, they corroborate.**

- **GP-7 ⇄ UX-10 (explicit corroboration).** Both point at the same code: GP-7 (`Game.ts:490-501`) shows `#finishGuarantee` stamps straggler finish times by **array/grid order** and `#doFinish` (`Game.ts:485`) sorts by that fabricated time → wrong podium; UX-10 cites the same construct (`Game.ts:497`) for its **symptom**: fabricated 0.6-second-apart clock times on the results screen. Same root bug, two valid facets — *ordering is race-wrong* (gameplay) and *the times are fake* (UX). Both P0/P2 flags stand together; fix as one item (J-30).
- **GP-1 ⇄ GP-11**: same measure (mini-turbo 1.3s/47m/s/900 vs mushroom 1.5s/47/900), stated consistently. Duplicated evidence, not conflict.
- **UX-6 ⇄ GP-3 ⇄ VS-1**: three critiques of the same drift-charge invisibility; VS-1 supplies the true root cause (Effects.ts:48-51 untextured PointsMaterial). Consistent.
- **AR-2 vs GP-10 — timestep mismatch, resolved here:** architecture proposes h=1/60; gameplay recommends 120Hz; **ADR-0003 (Accepted) already fixes `TICK_MS = 1000/120`**. Binding: 120Hz wins; architecture.md step 3's "1/60" is superseded. GP-10's "render interpolation" matches ADR-0003 exactly.
- **Cosmetic doc nits in architecture.md**: verdict says "9-step refactor" but the sequence lists 11 steps; **VS-2's "350–500 draw calls ×2" is a projection** — the measured grid baseline is 155 draw calls / 476 geometries. Neither changes any decision.
- **UX-2's zero-multiplayer claim is confirmed by the src listing** (no `src/net/`, no transport modules) — not an overstatement.

---

## 2. NETCODE RECONCILIATION (binding)

**Decision: DETERMINISTIC LOCKSTEP + INPUT DELAY is the primary in-race netcode for this codebase. Host-snapshot survives only as join/resync/migration and as the mixed-engine fallback. The host is demoted from race authority to session coordinator (seed, roster, start tick, relay).**

Grounded reasons:

1. **The sim is exactly the profile where lockstep is cheap.** ~720 LOC total sim, no physics engine, pairwise circle push, ~28 numeric fields per kart; static track content (boxes/pads/jumps) derives from serialisable config (`config.ts:207-244`, `Items.ts:31-35`) so only taken/respawn state syncs. Exchanging 2-3-tick-delayed `InputFrame`s and running the sim on every peer costs less compute and bandwidth than a 250-float snapshot stream @20Hz — and the state is already proven small enough to snapshot for free.
2. **The deterministic-product mandate is lockstep-shaped.** Replays, time-trial ghosts, daily-seeded modes, spectator trails, and CI fixtures are all *the same command-trace replay* as multiplayer lockstep. Host-snapshot delivers none of those; lockstep gets them as a side effect. `InputFrame` is already a plain serialisable command (Input.ts:4-10) and AI is already an `InputFrame` producer (AI.ts:22,62) — the two input sources netcode needs already exist.
3. **The enabling primitives are already built and tested.** `src/sim/rng.ts`: SFC32 with named streams ('items'/'ai' pre-seeded) — the exact "adding a consumer never renumbers streams" requirement of ADR-0003. `src/sim/protocol.ts`: `stableStringify` (sorted keys), `quantise` (1e-4 boundary quantisation), `stateHash` (FNV-1a) — these are the per-tick lockstep checksum inputs. The codebase is already pointed at lockstep; nothing about it points at snapshot-first.
4. **Cross-engine risk (AR-9) is real but bounded and manageable — it is a gating problem, not an architecture choice.** Transcendental ULPs (`sin/cos/exp/atan2/hypot` in track.ts:39-58, Kart.ts:141/268) desync mixed V8/JSC/SpiderMonkey games. Mitigations in priority order: (a) gate rooms by engine family at room creation (friends pick rooms anyway; the dominant flows — same-browser tabs and one-household devices — are same-engine ~always); (b) `stateHash` divergence detected within one tick = loud alert, not silent desync; (c) M4/ongoing work replaces `terrainHeight` with polynomial/Bézier evaluation and kills `atan2/hypot` from the per-tick path, removing the engine dependency permanently. Rollback remains rejected (AR-3/AR-4 undo semantics); after lockstep exists it is an incremental protocol change, not a rewrite.
5. **Host-snapshot is retained, not deleted.** The `REJOIN`/`MIGRATE`/`START` messages in multiplayer.md §3 already specify snapshot + command tail + RNG state. That snapshot path *is* the lockstep resync, late-join catch-up, host-migration, and mixed-engine fallback mechanism. Building it is required anyway; building it *first* would forfeit the replay/ghost/spectate economy and the free checksum cheat detection.

Final deliverable of this section — **the one-sentence amendment to docs/adr/0004**:

> **Amendment (round-1 judge, binding):** *In-race authority is deterministic lockstep with 2–3-tick input delay — every peer runs the same sim and exchanges delayed, clamped `InputFrame`s with per-tick `stateHash` exchange (rooms are gated to same-engine peers until AR-9's transcendental math is replaced by polynomial evaluation; divergence triggers an alert and a snapshot+command-tail resync) — while the host is only a session coordinator (seed, roster, start tick), and host-authoritative snapshots remain solely for late-join, migration, resync, and mixed-engine fallback, never as the primary race authority.*

---

## 3. RANKED BACKLOG (merged, de-duplicated, phased)

Phases are sequential; within a phase, order is dependency order. Effort: S ≤ 1 day, M ≤ 3 days, L > 3 days.

### M1 — Deterministic core (sim extraction, fixtures) — nothing here is player-visible except the listed exceptions (§4)
| Id | Item | Resolves | Effort |
|---|---|---|---|
| J-1 | `src/sim/trackSim.ts` pure track math (terrainHeight/Normal, worldToTrack, sampleAtU); `track.ts` re-exports for tests | AR-3 substrate, GP-10 (hot path purity) | S |
| J-2 | Catalog immutability: instance-level track catalog; test locks `TRACKS` against loadCustomLevel mutation | AR-7 | S |
| J-3 | Fixed-timestep core: `src/sim/loop.ts`, accumulator at **TICK_MS=1000/120 (ADR-0003, not architecture's 1/60)**, ≤5 catch-up ticks, tick counter, command queue per tick; `timeMs` advances only in ticks and freezes when paused | AR-2, AR-11, GP-10, GP-14 (countdown cadence) | M |
| J-4 | SimEvent queue: every `world.audio/effects` call in Kart/Items replaced by queued events; Game drains to presentation; `visualRoot` writes leave the sim step | AR-3, AR-5 (sim half), GP-10 testability | M |
| J-5 | Inject seeded `Rng` (rng.ts exists): roulette → stream('items'), AI → stream('ai'); per-*second* rates preserved on conversion; cosmetic FX stay unseeded | AR-1, GP determinism inventory | S |
| J-6 | Purify Items: plain `{taken, respawnAt, pos}` state; meshes become projections; delete dead `Banana.pos` duplicate | AR-4 | M |
| J-7 | Purify Kart: plain-number state, dedicated visual controller mirrors state+events; Kart renders nothing itself | AR-4, AR-5, AR-14 (serialisable prerequisite) | M |
| J-8 | Extract `raceSim` (collide, respawn, finish, countdown) from Game.ts onto plain state; **fixes GP-7 (score-ordered podium) and GP-9 (off-road-time respawn + 2s ghost) in the move** | AR-10, GP-7, GP-9, UX-10 (ordering half) | M |
| J-9 | Serialisable SimState + snapshot/restore; per-tick `stateHash` via protocol.ts | AR-14, GP-10 test gap | M |
| J-10 | InputSource port: frame-indexed command buffers for local/AI (retires `resetFrame` discipline); replay-equals-original test | AR-8 | M |
| J-11 | Karts order stamped from race seed (no runtime splice/unshift); pickup/collision order becomes seed-stable | AR-12 | S |
| J-12 | Replay + fixture harness: JSON fixtures (seed+commands+expected hashes), headless `advance(n)`, demo scenarios; platform seams (inject clock/storage; lazy Audio warmup for Node imports) | Mandate (controllable time; fixtures, replays, demo scenarios), AR-15, AR-16 | M |

### M2 — Presentation (particles, instancing, bloom, sky, shadows, HUD)
| Id | Item | Resolves | Effort |
|---|---|---|---|
| J-13 | Particle fix: 64×64 radial sprite map + alphaTest on Effects.ts:48-51 material; retint flames; dust → NormalBlending; `addUpdateRange` for idle buffer | VS-1 (P0 root cause documented in visual.md) | S |
| J-14 | Instancing/merge: fence posts, trees, kart chassis; unify editor.ts/Items.ts prop builders; kill per-frame Vector3/Quaternion allocation in Kart/#collide | VS-2, AR-13, perf notes | M |
| J-15 | Post chain: UnrealBloom (subtle) + speed-scaled speedline/vignette + state screen edges; reduced-motion opt-out | VS-13, UX-11 slice | S |
| J-16 | Sky rebuild: shader dome (not 14 circles), horizon-matched fog ~0.004, sky-derived env replacing RoomEnvironment | VS-6, VS-13 | M |
| J-17 | Shadows: sun follows player, ortho ≈±45, texel snapping, blob shadow per kart | VS-5 | S |
| J-18 | Track/material polish: kerb repeat fix (VS-4), splotch/cyan-dot contrast (VS-7), item-box + pad language | VS-4, VS-7, VS-8 | M |
| J-19 | Readability: name plates, driver hands/lean/helmet rig, roof stripes, start-arch camera collision | VS-3, VS-11 | M |
| J-20 | HUD/UI pass: styled result/pause buttons, hide race HUD when FINISHED, opaque minimap + road casing, dt-based roulette reel with end-snap, countdown pop, menu clip fix, "press C" hint | VS-9, VS-10, VS-12, UX-4, UX-6 (meter), UX-9 (partial) | M |
| J-21 | `Prefs` utility: persist mute/camera/racer/touch options; show stored bests/splits in results | UX-1, UX-10 (display half) | S |

### M3 — Multiplayer session (BroadcastChannel → room codes)
| Id | Item | Resolves | Effort |
|---|---|---|---|
| J-22 | `net/transport.ts` + Loopback + BroadcastChannel (freshness-filtered unreliability emulation) | UX-2 foundation, multiplayer.md §2 | S |
| J-23 | Lockstep core on headless sim: input-delay ring (2-3 ticks), per-tick `stateHash` exchange, snapshot+command-tail resync | ADR-0004 amendment, UX-2 | M |
| J-24 | Trust set: `InputFrame` clamp validator (steer∈[-1,1], throttle∈[0,1]), engine-family room gate, divergence alert | AR-9 mitigation, AR-8 remote | S |
| J-25 | Tab session/lobby over BroadcastChannel: HELLO/LOBBY/READY/START/REMATCH, names, roster | UX-2, multiplayer milestone 1+4 | M |
| J-26 | WebRTC transport + manual-SDP-paste signalling, then tiny static relay with room codes | Milestone 2 | L |
| J-27 | AI backfill on drop (>5s), REJOIN with snapshot+tail, host migration by election | Milestone 3, AR-9 fallback | M |
| J-28 | Local 2P one keyboard (two command producers, one sim) | multiplayer.md §1; UX backlog 1 | S |
| J-29 | Emote/quick-chat wheel (fixed set) | multiplayer.md §1 | S |

### M4 — Content & feel (drift rework, items, AI roster, audio, persistence, race rules)
| Id | Item | Resolves | Effort |
|---|---|---|---|
| J-30 | Drift rework: hop + direction lock, real drift speed cost, tiered mini-turbo config entries **strictly weaker than mushroom** (never reuse the item boost channel), post-boost steer clamp, charge decay | GP-1, GP-2, GP-3, UX-6 | L |
| J-31 | Items economy: rank-weighted tables, one forward projectile, triple slots for rear, banana lifetime + immunity window, held defense | GP-4, GP-13, UX-3 | M |
| J-32 | AI roster: per-kart lookahead/gain/wobble/line offsets, corner-depth braking, banana avoidance, honest **top-speed** rubber-band (GP-5's math), drift usage, defense | GP-5, GP-6 | M |
| J-33 | Race rules: GP-12 fixes (wrong-way warning, per-grid-slot lap-flash parity via dist seeding), rocket start, off-road recovery tuning | GP-12, GP-14 (rocket start half), GP-11 | M |
| J-34 | Podium & finish honesty: fabricated finishers ordered by `score()` and shown **without fake 0.6s clocks** (progress-ordered, honest labels) — closes both GP-7 remnants and UX-10 | GP-7 (final), UX-10 | S |
| J-35 | Collision feel: yaw disturbance on bump, contact cooldown, bump audio, slipstream draft | GP-8 | M |
| J-36 | Audio: lookahead-scheduled layered music with intensity/final-lap lift, panned second engine, real UI sounds, ducking, drift charge whine | UX-7, GP-3 (audio), UX-11 audio rows | M |
| J-37 | Juice package per UX table: box-grab, roulette lock-in, banana telegraph, pad sound, hit flash + `navigator.vibrate`, position-change sting, lap-split popup, off-road rumble, win stinger | UX-11 table | M |
| J-38 | Modes & meta: Time Trial + local ghosts + ghost-by-URL, Daily seeded Dash, 3-race GP scoring, results share card (consumes M1 replay format) | UX-3, backlog 3/7/9; replays mandate | M |
| J-39 | Touch + a11y: touch cluster rework (reachable ITEM, two-thumb split), haptics, drift onboarding, colourblind-safe HUD palette, real reduced-motion coverage, gamepad claim resolved | UX-5, UX-8 | M |
| J-40 | Cleanup: pause during countdown, Q-confirm mid-race, editor links from menu, README claims aligned to reality | UX-9, UX-12 | S |

---

## 4. NEXT BUILDER INSTRUCTION

Builder: you have NOT read the critics; everything you need is here. Work in the `v2-webgl` worktree, stay on its branch, commit per step, never touch `docs/evaluations/**`. Run typecheck and the existing 24 vitest tests after **every** step. **M1 = the eight steps below (+ step 9 closure). Use `TICK_MS = 1000/120` (ADR-0003) — not 60Hz.** Two helpers already exist and MUST be reused, not reimplemented: `src/sim/rng.ts` (`Rng`, named streams `items`/`ai`, SFC32) and `src/sim/protocol.ts` (`stableStringify`, `quantise`, `stateHash`). Presentation must look and play **identically** in M1 except the allowed changes listed after step 9.

**Step 1 — Extract pure track math → `src/sim/trackSim.ts`.**
Move `terrainHeight`, `terrainNormal` (return plain `{x,y,z}`), `worldToTrack`, `sampleAtU` out of `src/track/track.ts` with zero THREE/DOM imports. `track.ts` re-exports them so `tests/track.test.js` passes untouched.
*Accept:* all 6 track tests pass unchanged; new `src/sim/trackSim` test does a 100-point `terrainHeight` sample and asserts values equal the track.ts originals; grep proves `src/sim/**` imports nothing from `src/game`, `three`, or `util/tex`.

**Step 2 — Freeze the track catalog.**
`loadCustomLevel` (Game.ts:331-354) must build/patch an *instance* catalog owned by Game — never splice/push into the exported `TRACKS`.
*Accept:* new test deep-snapshots `TRACKS` before/after simulated `loadCustomLevel` and asserts equality; all 8 config tests green.

**Step 3 — Fixed-timestep core → `src/sim/loop.ts`.**
Accumulator: rAF supplies wall delta; sim advances only in `TICK_MS=1000/120` steps, ≤5 catch-up ticks; every tick increments a tick counter; `timeMs` advances only inside ticks; paused ⇒ nothing ticks (fixes the pause-clock bug, AR-11). Keep the accumulator in Game for now; it calls `advance(ticks)`.

*Accept:* scripted 1,200-tick run with fixed inputs ⇒ identical `prevU/lap/pos` every run; re-running the same script fed by simulated 30/60/144fps rAF cadences yields the same `stateHash` (from `src/sim/protocol.ts`) of the final state; ≤5-step clamp verified by a test that starves rAF.

**Step 4 — SimEvent queue → `src/sim/events.ts`.**
Replace every `world.audio.*`/`world.effects.*` call in Kart.ts and Items.ts with typed events pushed onto a queue; Game drains the queue once per frame and feeds Audio/Effects. Kart stops holding `visualRoot` or writing quaternions inside `update` (move those writes to a visual pass that mirrors state).
*Accept:* `grep -n "world\.\(audio\|effects\)\|visualRoot" src/sim` (after later extraction: `src/game/Kart.ts`) shows zero sim-path hits; kart tests assert event payloads instead of stubbing 10+ methods; all 5 kart tests pass without the current stub block.

**Step 5 — Inject the seeded RNG.**
`rollItem` (Items.ts:198) uses `rng.stream('items')`; AI decisions (AI.ts:54) use `rng.stream('ai')`. Convert per-frame probability `Math.random() < dt*1.4` to per-tick probability `p = 1.4/120` so the *per-second* rate is preserved. Cosmetic FX randomness (Effects.ts, Items.ts:225, HUD.ts:326) gets a separate presentation source, excluded from the sim.
*Accept:* same race seed ⇒ identical item sequence over 10,000 rolls; test asserts two runs with different seeds diverge only in the seeded stream; the expected first-roulette item for a recorded seed is asserted exactly.

**Step 6 — Purify Items state.**
Boxes get plain `{taken, respawnAt, pos:{x,y,z}}`; proximity/collision reads those fields (not `mesh.position`/`mesh.visible`, Items.ts:273-288, 312); meshes become write-only projections. Delete the dead `Banana.pos` duplicate (one source of truth).
*Accept:* table tests for `Items.update`: pickup priority in kart-array order, roulette duration, box respawn timing, banana arming after 0.4s; meshes verified not to be read anywhere in sim code.

**Step 7 — Purify Kart.**
Sim kart = plain record (position fields as numbers or a tiny pure vec helper — no `THREE.Vector3`); all timers (spin/boost/shield/star/pad) tick on sim time. Build a `KartVisual` pass fed by state + events that reproduces today's transforms exactly (the current `#orient/#visuals` writes at Kart.ts:346-381 are the spec).
*Accept:* new `src/sim/kartSim.ts` is Node-importable with no THREE in its module graph; a scripted 60s race renders screenshots/golden transform dumps identical to pre-refactor within tolerance; all kart tests green.

**Step 8 — Extract race rules → `src/sim/raceSim.ts`.**
Move `#collide`, `#respawnCheck`, lap/finish/`#doFinish` (Game.ts:412-501) onto plain SimState. While moving, make these two fixes (the only gameplay changes in M1): **(a) GP-7** — fabricated/deferred finishers gain their finishing result in `score()` (lap, dist) order, never array order; **(b) GP-9** — respawn triggers on off-road *time* (tune so 10s of wall-grinding triggers it; the current `|lat|>18` path stays as the fallback) and `respawn()` grants a 2.0s ghost window (no banana/plow hits).
*Accept:* unit/table tests for collide pairs (order-independent for symmetric outcomes), lap counting incl. reverse-line cheat prevention (Kart.ts:314-319), respawn firing in normal play (the probe-L scenario), ghost window; property test: for shuffled unfinished karts, reported finish order == `score()` order.

**Step 9 (closes M1) — Serialisation + fixtures.**
`src/sim/state.ts`: SimState schema (karts, boxes, bananas, race machine, seed, tick) with `serialize/deserialize` (plain JSON, ids not refs) and `snapshot/restore`; per-tick `stateHash` via protocol.ts; a fixture runner records `{seed, commands[], expectedHashes[]}` and replays it headless with `advance(n)`.
*Accept:* round-trip `restore(snap(t))` + replaying the recorded tail reaches `stateHash(tick=M)`; a 60s recorded race replay is **bit-identical** across 5 runs; ≥3 committed fixtures incl. one item-interaction case (banana×shield×star, pad+jump overlap).

**What must NOT change during M1 (presentation/behaviour parity contract).** No visual differences: particles remain current squares (the VS-1 sprite fix is M2 — do not touch `Effects.ts`'s material), no bloom, no sky change, no shadow changes, no HUD/menu changes, no new content, no items added, no item weight changes, no AI tuning (AI *policy* is frozen — only its random source changes), no physics feel-tuning (all constants except below carry over), `InputFrame` semantics unchanged, key mappings unchanged, audio must trigger at the same moments (via events now). **Allowed visible exceptions (the complete list):** 1) GP-7 podium ordering; 2) GP-9 respawn trigger + 2s ghost; 3) dt-free per-frame multipliers `Kart.ts:236` (banana ×0.9) and `Kart.ts:311` (wall-grind ×0.985) re-derived as per-*tick* constants preserving the old 60fps-fps-equivalent intent; 4) Euler decays `Kart.ts:238` (airDrag) and `Kart.ts:249` (coast) likewise re-derived for 120Hz (re-derive, don't just halve); 5) AI item probability becomes per-tick at the same per-second rate (step 5); 6) paused game now fully freezes (AR-11 — box bob/AI wobble freeze visually); 7) countdown is tick-driven, so its real-world duration is frame-rate-independent (GP-14 cadence half); 8) input edges are delivered exactly once per tick (AR-8) — timing at most one tick different; 9) kart ordering is seed-stamped but the visible grid/menu order (player first) is preserved. If you discover any other behaviour-changing necessity during extraction, STOP and record it in the round notes rather than "fixing" it.

---

## 5. ACCEPTANCE BAR (whole programme)

The programme is **done** when all of these are demonstrably true:

1. **Determinism contract:** same initial snapshot + same command trace + same seed ⇒ bit-identical `stateHash` after 12,000+ ticks, in CI, on 5 consecutive runs (Node) and one browser run.
2. **Frame-rate independence:** a recorded race driven by simulated 30/60/144fps presentation loops ends at the same `stateHash`; `grep` finds no frame-multiplied (`*=` without dt/tick) sim constant and no wall-clock/`Math.random`/`Date.now` read inside `src/sim/**`.
3. **Time control:** `advance(n)` fast-forwards a full 3-lap fixture headless in <2s; ≥5 committed fixtures (JSON seed+commands+hashes) cover replay, item matrix, respawn, and lap-cheat cases.
4. **Presentation parity (M1 exit):** golden scripted race (grid + midrace + finish screenshots and the audio-event sequence) is visually/aurally identical before and after the extraction, apart from the §4 allowed exceptions.
5. **Multiplayer milestone (multiplayer.md §6, verbatim):** two tabs one browser full race with positions/items/chat and no flags; two devices one Wi-Fi via room code or manual blobs same behaviour; AI backfill after a >5s drop with no race stall; rematch + next-track; all powered by the same sim and command format the tests replay.
6. **Desync safety:** an injected divergence (seeded-RNG skip or unclamped input) is detected by per-tick `stateHash` within ≤10 ticks, surfaced to players, and resolves via snapshot+command-tail resync without ending the race; same-engine room gating is enforced at room creation.
7. **Trust envelope:** guest inputs are clamped server-lessly at the boundary (property test: no InputFrame value outside steer∈[-1,1]/throttle∈[0,1]/brake∈[0,1] can enter a sim), and no race state ever crosses a server (verified by the transport-boundary test matrix: Loopback/BroadcastChannel/RTC only).
8. **Product persistence:** mute, camera mode, racer, and touch options survive reload from localStorage; results screen shows stored personal best for that track; zero fabricated times anywhere in the finish flow.
9. **Feel floor:** drift has hop + direction lock + ≥2 visible charge tiers; mini-turbo's best tier is strictly weaker than mushroom (asserted by a config test comparing force/top/duration); AI roster has ≥3 distinguishable profiles that finish a 90s race spread >150m without rubber-band no-ops (top-speed-based, probe-reproducible).
10. **Visual floor:** no untextured particle quads (sprite-mapped material asserted in code + screenshot), ≤100 draw calls at grid with shadows on (renderer.info probe), bloom + speed vignette present with a reduced-motion opt-out, shadows track the player within ±45 units.
11. **Rules integrity:** property test with randomized stragglers proves podium order ≡ `score()` order always; wrong-way produces a warning within 2s; a new-respawn kart is invulnerable for 2.0s; respawn triggers inside 12s of wall-grinding in normal play.
12. **Programme hygiene:** every M-phase ends with the full suite green (24 legacy + new sim/net suites), typecheck clean, docs updated in same commit (simulator.md, ADR-0003/0004 amendments), and each architecture.md step landed as its own visually-invisible commit.

---

## 6. RISKS

- **Cross-engine lockstep desync (AR-9).** `sin/cos/exp/atan2/hypot` ULP differences across V8/JSC/SpiderMonkey make mixed-browser rooms diverge despite everything above. Mitigation is staged: same-engine gating + hash alert from day one; terrain→polynomial and atan2→bounded approximations as a standing M3/M4 item. Residual risk: engine-family detection is heuristic (UA probing is spoofable and awkward); accept "friends choose rooms," retest on engines that ship libm updates. The snapshot resync path (J-27/J-23) is the safety net — *do not let it become the primary path*.
- **Determinism refactor silently retunes the game.** The largest schedule risk is physics *feel* change during purification: per-frame constants re-derived at 120Hz (§4 exceptions 3-5) can shift boost/decay behaviour if anyone patches the number instead of deriving it. Mitigation: record a pre-refactor golden race (inputs + state dumps) before step 3 and diff every step against it; re-derive constants analytically (e.g., `wallGrindPerTick = 0.985^(60/120)`) and assert 60fps-equivalence in a test.
- **SwiftShader-vs-GPU visual QA deltas.** All screenshot evidence so far was captured on headless SwiftShader at ~10fps; bloom, PMREM env, shadow softness, and antialiasing differ materially on real GPUs — an "approved" look in CI may ship ugly (or broken) on hardware, and the 0.42× sim-vs-wall distortion already contaminated GP-14's countdown observations (fixed by J-3, but historical evidence is tainted). Mitigation: assert structural things in CI (renderer.info counts, material maps, presence of post passes), reserve judgement-on-beauty for one human pass on a real GPU before closing M2; don't tune visuals against SwiftShader.
- **Scope traps.** The programme dies of ambition, not math. Enumerated: (1) building rollback "while we're at it" — it's explicitly rejected until lockstep exists; (2) netcode-first — any Transport code before M1 exits is forbidden, there is nothing deterministic to connect; (3) UI-framework rewrite instead of the surgical HUD fixes; (4) anti-cheat beyond clamps + checksum alerts (mandate says no); (5) servers — a TURN relay, not a game server, is the only permitted extra boundary; drift back to "tiny static relay" in review; (6) new items/modes before J-30's drift rework makes them fun; (7) ghost/replay features built on ad-hoc state dumps instead of the M1 fixture format — forcing reuse is why J-38 consumes the fixture format; (8) instancing "later" — at 476 geometries, M2 without J-14 means shipping a 60fps demo that only 60fps machines enjoy; (9) the 24 legacy tests rotting — they are the parity contract for M1; a step that red-greens them is wrong, not the tests.
- **Hash fragility.** `stateHash` canonicalises keys but shares float representation; `quantise(1e-4)` at the boundary can mask or (worse, on collision edges) flip ordering. Keep quantisation at serialization boundaries only, add a hash-collision-orientation test (item pickup ties must resolve by array index, not by float luck), and pin SFC32 as the only PRNG so stream additions can't renumber (rng.ts already satisfies this — keep it that way).
