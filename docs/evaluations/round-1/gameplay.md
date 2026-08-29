KART KINGDOM — GAMEPLAY/PHYSICS CRITIC REPORT (v2-webgl worktree)
Evidence: 90s live auto-race diag sampling (scripts/scratch-gp/sampler.mjs + race_samples.json, 4 screenshots incl. race_t45.png), fixed-dt scratch vitest suite (scripts/scratch-gp/critic.test.js, 11 probes) driving Kart/AI directly, plus full code read.

VERDICT
The core loop is competent but hollow: the sim is a clean fixed-set-of-numbers arcade racer with sane top speeds and a working pad/boost ladder, yet the drift is a single binary threshold with zero feedback and a free mini-turbo nearly as strong as a mushroom, so optimal play is "tap brake on every corner and ignore the drift system's intent." AI is one centerline-follower cloned 8× with a rubber-band that mathematically does nothing at the speed cap, items are position-blind (leader rolls stars at 25%), and a race-rules bug can hand out a fabricate-in-array-order podium. It's a pleasant prototype, not a kart racer yet.

FINDINGS

- GP-1 | P0 | Mini-turbo is ~87% of a full mushroom, for 0.75s of holding brake+gas
Evidence: Kart.ts:184-190 (`#miniTurbo` = boostT 1.3s) feeds the same boost path as items: Kart.ts:275-278 applies PHYS.boost.mushroom.force=900 and `#topSpeed` (Kart.ts:337-344) caps at mushroom.top=47 (base 34). Measured (probe C2, fixed dt): charge <0.75s → boost 0; ≥0.76s → boost exactly 1.300s, cap 47.00 m/s, force 900 vs mushroom 1500ms/47/900 (config.ts:82). A single-charge-tier system: holding 3s awards nothing more (threshold is binary, Kart.ts:253-263). Every AI kart refuses to drift (AI.ts:35 `brake=false`), so AI never earns this and 8 karts race at exactly 34 m/s while a drifting player carries permanent 47 m/s windows. Recommendation: split mini-turbo into its own config entry (e.g. 0.9s/300 force/top 38 + 1.4s/500/41 tiered at 0.75s and 1.5s), keep mushroom strictly stronger, and never reuse the mushroom boost channel for drift.

- GP-2 | P1 | Drift costs nothing while held, pays a snap-oversteer penalty, and there's no commitment model
Evidence: probe B2 (fixed dt, on-road straight): gas vs gas+brake for 5s → speed 10.52 vs 10.52, distance 70.7 vs 70.7 — identical; Kart.ts:242-247: the throttle branch runs before brake is consulted, so brake+throttle = full acceleration (you cannot even slow down while "drifting"). No hop, no drift-direction lock at initiation (Kart.ts:253-254 just starts a timer). Steer is multiplied ×1.9 after saturating (Kart.ts:256, no re-clamp) → probe B3/K2 using the game's own AI controller: forced always-drift runs 1234m vs 1279m in 60s on sunny (−3.5%, 256 offroad frames vs 0) and 790m vs 920m in 30s on canyon (−14%) — drifting is a net loss on technical tracks and only +1.6% on the flowing coast track. Holding brake to actually slow into a corner at >15 m/s auto-arms a drift (Kart.ts:253 uses |speed|>15), producing accidental boosts. Recommendation: introduce hop + direction lock, drift-specific speed loss (e.g. 8-12%), charge decay when steering through, and clamp post-boost steering.

- GP-3 | P1 | Zero drift charge feedback
Evidence: no spark/stage visuals, sound, gauge or color anywhere: `#visuals` emits 2 generic dust particles while drifting (Kart.ts:377-379); Effects.ts has no drift-charge path; `driftT` is read only in Kart.ts:253-263. Release feedback is one orange ring + boost sound (Kart.ts:186-187). The player can't tell "charging" from "charged" from "armed", and can't time release for corners. Recommendation: tiered spark colors at 50/100/150% of threshold + an escalating charge whine + gauge tick — this is the single cheapest fun multiplier in the genre.

- GP-4 | P0 | Item distribution is position-blind; leader rolls a star 25% of the time with no downside
Evidence: config.ts:95 weights {banana 30, mushroom 45, star 25} consumed identically for every position (Items.ts:196-202). Star = 5.4s of invincibility + plow knockdown at 44 m/s top (config.ts:82, Kart.ts:175-182) ≈ 183m of unkillable lead. No position weighting, no probability table by rank, no 1st-place-only "you get a banana" humiliation rule, no trailing rubber. Recommendation: rank-based rolling tables (1st: banana 70/mushroom 25/star 5; 7-8th: mushroom 45/star 35/triple …) — this is the genre's core comeback economics.

- GP-5 | P1 | Rubber-banding is a no-op at the speed cap
Evidence: AI.ts:41-45 multiplies throttle ×1.25 when behind, ×0.8 when >40m ahead — but top speed comes solely from `Math.min(speed, #topSpeed())` (Kart.ts:244), independent of throttle. Probe J: throttle 0.8 → 34.0, throttle 1.0 → 34.0 after 20s. So AI never catch up by design; field spread comes only from pad/item luck. Recommendation: rubber-band `#topSpeed` (±6-10% by gap), give rear karts better lines/bolder throttle, and add catch-up draft rather than invisible multipliers.

- GP-6 | P1 | All 8 AI are the same racer: shared centerline, shared item dice, no threat model
Evidence: AI.ts:23-28 — every kart pursues `sampleAtU(prevU+13)` with one gain (dYaw/0.6) plus a sin wobble of 0.12 at index-phase offset (AI.ts:48). Live 90s race sampler: karts locked in grid pairs 1-2m apart ten seconds in — t=10s: [57,57,46,47,40,41,34,34] (u, lap 407m) — and stay within pairs for most of lap 1. Item use is `Math.random() < dt*1.4` (AI.ts:54) with the same one-line rule for all three items; AI never avoids bananas, never defends, never varies line by skill. Fixed 13m lookahead at 34 m/s = 0.38s horizon (AI.ts:24) — they can't see a corner they're already in. Recommendation: per-kart lookahead/gain/wobble scales, lateral line offsets, banana avoidance checks, corner-depth braking via drift, and held-item defense.

- GP-7 | P0 | finishGuarantee fabricates the podium in ARRAY order, not race order
Evidence: Game.ts:490-501 — once the player finishes, after 6s every straggler gets `finishTime = base + i*0.6` assigning `i` from `for (const k of this.karts)` (grid/menu array order), and #doFinish sorts by finishTime (Game.ts:485) → the podium for all unfinished karts is grid-column order regardless of progress. Confirmed live: race ended at t≈59s with karts[3] at 54/407 of lap 3 (leader at 178) — such a kart is placed ahead of genuinely-near-the-line karts depending only on array slot. Recommendation: order fabricated finishers by `score()` (lap, dist) before stamping times.

- GP-8 | P1 | Kart-kart collision has no impact feel
Evidence: Game.ts:452-473 — symmetric positional push (min = radii×0.85), speed transfer `(a.speed−b.speed)*0.3`, zero yaw/knock/spin response, no mass, `d>0.001` skips exact overlaps; wall contact is a lerp-back + per-frame ×0.985 (Kart.ts:303-312) with no bounce, scrape or spark. The only "hit" in contact is star plow (Kart.ts:175-182). Recommendation: add yaw disturbance + asymmetric mass-by-position bump so contact is readable, and a short collision cooldown so corner pinwheels don't vibrate.

- GP-9 | P1 | Respawn system is dead code and has no invulnerability
Evidence: soft clamp hard-caps |lat| at halfWidth+4.5 = 10.5 (Kart.ts:303-312); the auto-respawn triggers only at |lat| > 18 for 4.2s (Game.ts:412-423). Probe L: 10s of full-steer wall grinding maxes |lat| = 10.53 → the timeout path can never fire in normal play. `Kart.respawn()` (Kart.ts:148-156) grants no invulnerability window — a re-dropped kart can be banana'd/plowed instantly. Recommendation: trigger respawn on off-road time (not lat), add 2s ghosting, and keep the fallback.

- GP-10 | P1 | Simulation values depend on render frame-rate
Evidence (fixed-dt probes): wall-grind penalty is `speed *= 0.985` per frame with no dt (Kart.ts:311) → 5s pinned to the soft wall ends at 10.72 m/s @30fps, 10.55 @60fps, 4.56 @144fps (2.3×). Banana spin multiplies speed ×0.9 per frame (Kart.ts:236) — at 144fps a spin eats ~10× the speed it does at 30fps. Coast decel `(1−0.9dt)` and jump airDrag `(1−1.4dt)` are Euler approximations (Kart.ts:249, 238). All sim steps run on clamped wall-clock rAF dt (Game.ts:364-366). Recommendation: fixed-timestep accumulator sim (e.g. 120Hz) + render interpolation.

- GP-11 | P2 | Speed/accel numbers are coherent except off-road recovery and boost ladder placement
Evidence: measured accel: 0→30 m/s in 1.0s, cap 34 by ~1.4s (probe F3 timing) — brisk, good. Off-road cap 10.88 (34×0.32) with grass accel 9.6 m/s² (probe D2: 10.54 sustained) — you lose 70% speed but re-enter in <1s, so cutting across grass costs little distance-wise. Boost ladder measured: pad 40 / mini-turbo 47 / mushroom 47 / star 44 (config.ts:82, 218-219) — mini-turbo shouldn't equal the item tier (see GP-1); star slower than mushroom is odd but defensible for duration. Reverse −12 fine. Recommendation: grass accel to ~5, mini-turbo to ~40-41.

- GP-12 | P2 | Lap/progress rules: cutting is well-contained, wrong-way is invisible, lap seeding is skewed
Evidence: teleport probe G2: a 24m lateral jump mid-corner stays in the same u (worldToTrack's ±14-sample/±8.4m hint window, track.ts:134-148, prevents cross-track snapping; hard clamp at lat 10.5, Kart.ts:303-312) — corner-cutting via geometry is essentially impossible. But: no wrong-way detection anywhere (probe H: reversing 2s across the start, dist 418→378, no flag/warning/state) — the game can't tell you you're driving backwards. placeAt seeds dist=u (Kart.ts:142), so back-row karts (7/14/21m behind) register lap increments later than the front row — lap-flash timing differs per grid slot for the first few seconds, and HUD "FINAL LAP" timing is player-only (Game.ts:425-434). Position score `lap*1e9+dist` (Game.ts:563-566) is fine.

- GP-13 | P2 | Items lack the basics of counterplay
Evidence: exactly one item slot; holding anything blocks box pickups (Items.ts:280); roulette (900ms) is pure `Math.random` ×3 (Items.ts:196-202); bananas: immune to dropper forever (Items.ts:311), armed after 0.4s, never expire (no lifetime) so the track accumulates permanent hazards; no projectiles of any kind, no way to clear a banana, no defense (a held banana blocking one hit is missing). Star plow is the only interaction with contact. Recommendation: banana lifetime (~30s) + dropper-immunity-only-first-15s, triple-item slots for rear positions, at minimum a forward projectile (mushroom-style missile) so leading isn't purely a defensive crouch.

- GP-14 | P2 | Start-line: no launch mechanic, and countdown length is render-rate dependent
Evidence: countdown advances by accumulated rAF dt (Game.ts:374-381); all kart inputs are zeroed (Game.ts:447) — no rocket-start reward for timing the gas; in the live headless run the countdown took ~6 wall-seconds (t=0 and t=5 sampler frames both "COUNTDOWN") because SwiftShader ran ~10fps and dt clamps at 0.05 — sim seconds ≠ wall seconds at 0.42× (race clock 18.75s at wall t=45s, visible in race_t45.png HUD). No rule penalizes jumping the start (there's no start at all — karts simply get inputs at GO).

DETERMINISM BLOCKERS (exact coupling points)
- Game.ts:364-366 — entire sim stepped on `THREE.Clock.getDelta()` clamped to 0.05 inside rAF; no fixed timestep, no accumulator. Race outcome depends on render rate (and raceTimeMs at Game.ts:383 accumulates the same clamped dt — the HUD timer is not sim-linked to a fixed step).
- Game.ts:367 — `timeMs` (AI wobble phase, box bob at Items.ts:275, shield wobble at Kart.ts:380) is wall-clock-derived.
- Kart.ts:311 — `speed *= 0.985` per frame, dt-free (measure: 30 vs 144fps → 10.55 vs 4.56 m/s).
- Kart.ts:236 — `speed *= 0.9` per frame during banana spin, dt-free.
- Kart.ts:249 and Kart.ts:238 — Euler `(1 − c·dt)` decay for coast and air-drag (dt-dependent, differs from closed-form at any dt).
- Kart.ts:223-227 — all timers (spinning/boost/shield/star/pad) tick on that same variable dt.
- Items.ts:198 — `Math.random()` in rollItem (position-blind draws; unseeded).
- Items.ts:225 — `Math.random()` banana rotation (cosmetic, but lives in sim module/state).
- AI.ts:54 — `Math.random() < dt*1.4` — frame-rate-dependent probability AND unseeded randomness in AI decisions.
- Effects.ts:82-110 — particle randomness, but Effects calls are emitted from inside Kart.update/Kart world methods (Kart.ts:155,169-170,180-181,186-187,204-205,292-293,375-379) — presentation is coupled into the sim step; a determinstic replay must stub audio+effects.
- HUD.ts:326 — `Math.random()` roulette animation (presentation-only, verify not to roll actual items — actual roll is Items.ts:299).
- Game.ts:379,432 — setTimeout-driven HUD overlays only (safe), but countdown state machine depends on rAF cadence (Game.ts:374-381).
- Missing entirely: no seeded RNG abstraction, no sim/render clock split, no replay hash/checksum hooks — tests (tests/kart.test.js etc.) only assert single-frame invariants, never trajectories.

TOP-8 GAPS (fun-per-effort order)
1. Drift rework: hop + direction lock + tiered mini-turbos (blue/orange) with spark colors and release-timing reward — fixes GP-1/2/3 in one move.
2. Position-weighted item table + counterplay set (projectile, held defense, banana lifetime/clearing) — fixes GP-4/13.
3. Real AI roster: per-kart lines/aggression/lookahead, banana avoidance, drift usage, honest rubber-band on top speed — fixes GP-5/6.
4. Fixed-timestep sim + seeded RNG (deterministic core) — unblocks ghosts, replays, netplay, and all future tuning; fixes GP-10/14.
5. Kart-kart bump feel (yaw disturbance, bump sounds, drafting/slipstream behind a kart) — the cheapest "racing against people" feeling.
6. Race rules polish: rocket start, wrong-way warning + arrow, respawn invuln, podium ordering fix (GP-7), lap-flash parity per grid slot.
7. Track variety systems: shortcut branches (with risk/reward gaps), jump chains that skip a section, moving hazards (traffic cones, tumbling barrels), tunnel/indoor lighting segment.
8. Modes & meta: Time Trial with per-map ghost, 3-race Grand Prix scoring, coin/star collection variant, split points table — cheap reuse of the existing race loop.

Files produced (scratch only, nothing tracked was modified): scripts/scratch-gp/critic.test.js (11 probes), scripts/scratch-gp/sampler.mjs + sampler_out.json + race_samples.json, scripts/scratch-gp/dbg.test.js, scripts/scratch-gp/dbg2.test.js, scripts/scratch-gp/race_t{0,5,45,85}.png, vitest.node.scratch.mjs (helper config at worktree root, untracked). Existing suite status: 24/24 vitest tests pass, typecheck clean. Dev-server run untouched; no commits, no branch changes.