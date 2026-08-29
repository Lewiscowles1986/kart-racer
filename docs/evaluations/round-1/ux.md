# Kart Kingdom v2-webgl — Harsh UX / Content / Audio / A11y Audit

**Evidence base:** read HUD.ts, Game.ts, Audio.ts, Input.ts, Items.ts, RacerPreview.ts, Kart.ts, config.ts, index.html, README.md, vqa.mjs; 7 screenshots inspected (`scripts/shots/menu.png`, `race-start`, `race-mid1–3`, `scripts/scratch-ux/scratch-pause.png`, `scratch-touch-race.png` at 844×390); live persistence probe; `npm run test` = 24/24 green. No tracked files touched (scratch captures live in `scripts/scratch-ux/`).

## VERDICT

This is a competent tech demo wearing a "product" costume — a pretty 45-second toy with zero memory, zero modes, and zero other humans. The README's accessibility/safety and polish claims are contradicted by the code: no setting persists except an editor level, drift (the core skill) is invisible, and all 8 racers are mechanically identical colour swaps. A veteran exhausts everything in one sitting; a 6-year-old on a tablet gets unlabeled buttons stacked over the minimap and no path to the one mechanic that makes kart racers fun.

## FINDINGS

**{UX-1, P0, Zero persistence of anything}**
Only `localStorage` key in the game is `customLevel` (Game.ts:332). Live probe: after pressing **M**, `localStorage` = `{}` — mute doesn't survive a reload despite README claiming a "mute toggle" (README:37). No camera-mode memory (`cameraMode=0` every boot, Game.ts:66), no best times, no racer/track preference, no options. **Rec:** tiny `Prefs` utility (S) — one utility fixes ~5 complaints.

**{UX-2, P0, Multiplayer = literally zero}**
Grep for `BroadcastChannel|WebSocket|RTC|peer` across src/: **0 hits**. No room codes, no name entry (player is hardcoded "You", Game.ts:29), no lobby, no spectate, no chat. **Rec:** see backlog.

**{UX-3, P1, Content depth: skin-deep racers, 3 items, 0 modes}**
`DRIVER_STYLES` (Game.ts:28–37) is colours + silhouette only; `Kart` has no stat fields. Items: exactly banana/mushroom/star (Items.ts:196–217) with **flat weights regardless of position** (config.ts:95) — no rubber-band odds. No time trial, GP, survival, teams, daily. 3 loops + editor. **Rec (item priority):** position-weighted odds (table edit) → banana-shell forward throw → green snap projectile → triple mushroom → lightning.

**{UX-4, P1, Menu clips content at 720p}**
Screenshot `menu.png`: "Canyon Loop" half-cut, "Coastal Dash" invisible in a hidden inner scroll (`.menu-main` overflow, HUD.ts:164) with no affordance; Start button overlaps the clipped row.

**{UX-5, P1, Touch UX: one cramped row, no onboarding, no haptics}**
`scratch-touch-race.png` (844×390): all 5 buttons (◀▶▼▲ITEM) in one bottom-right row over the minimap, **ITEM clipped by screen edge**; both steering and gas on the right thumb. `navigator.vibrate`: 0 occurrences in src. Drift = undocumented gas+brake combo (Kart.ts:253); only hint is the tiny menu chip (HUD.ts:254).

**{UX-6, P1, Drift charge is invisible}**
`driftT` (Kart.ts:70) fires #miniTurbo at 750ms (Kart.ts:258) with no HUD meter and no staged sparks — just identical white dust (Kart.ts:377). Screenshots race-mid2/3 also show particles as flat white squares that read as a render bug, not flames.

**{UX-7, P1, Audio: fragile, flat, unscheduled}**
One engine, player-only (Game.ts:400), gain capped 0.095 under 4×0.12 music tones — nearly inaudible. Music via `setInterval` (Audio.ts:135): jitter, no lookahead, one I–V–vi–IV loop, no intensity layers, no tempo lift. No PannerNode/doppler; camera-cycle reuses `pickup()` as UI sound (Game.ts:108); engine keeps humming in MENU after a race. **Rec:** layered music intensity by position, lookahead scheduling, panned second engine for nearest AI, real UI sounds, ducking under hit/star stingers.

**{UX-8, P1, "prefers-reduced-motion" and "child-safe" claims are theatre}**
`reduceMotion` is used exactly once (FOV boost, Game.ts:557); the HUD media query (HUD.ts:203) disables two transitions that don't exist. No colourblind consideration: raw-hue minimap dots (red vs green karts, HUD.ts:355), emoji-only item semantics, no captions, no input remapping, no gamepad despite Input.ts:1's comment claiming one.

**{UX-9, P2, Pause locked during countdown; Q quits instantly; C hidden}**
`togglePause` early-returns outside RACING/FINISHED (Game.ts:112) — live P-press during countdown did nothing. Q = instant quit mid-race. Camera modes exist and a "Cam: Chase" chip renders, but no UI ever says "press C"; README omits it.

**{UX-10, P2, Results end flat}**
No best time, no splits, nothing stored; `#finishGuarantee` fabricates 0.6s-apart times for stragglers (Game.ts:497) — fake clocks on the results screen.

**{UX-11, P2, Juice gaps everywhere; only FOV kick exists}** — see gap list.

**{UX-12, P3, Flow strengths worth keeping}** ~3s time-to-fun, track prebuild kills the start hitch (Game.ts:212), quit/quit-dialog loop works (verified via diag: Q → MENU), start-line camera snap good. But editor.html has zero links from the game itself.

## MULTIPLAYER BACKLOG (ranked by value-per-effort)

1. **Local 2P one keyboard** (2nd input slot + split render) — S — no transport
2. **2 tabs, one machine mirror race** (host authoritative + input send) — S — BroadcastChannel
3. **Time-trial ghosts + share-ghost-by-URL** — S-M — none/URL
4. **Emote/quick-chat wheel** (fixed child-safe set) — S — any datachannel payload
5. **Room-code friend races** (lobby = name/racer/Ready reusing menu) — M — WebRTC DataChannels; manual copy/paste SDP first, tiny relay later
6. **Bot backfill + host migration** on disconnect — M — same as 5
7. **Results share card** — S — none
8. **Spectate + follow leader after finish** — S-M
9. **Daily seeded "Daily Dash" + local leaderboard** — S-M — none (seed math)
10. **2-v-2 teams with shared item odds** — M — none

## JUICE GAPS

| Moment | Missing | Hook |
|---|---|---|
| Countdown 3-2-1-GO | no pop/scale/light anim | `HUD.setCountdown` (307) + `.countdown` CSS |
| Item box grab | no box bounce | `HUD.update` item branch (324) |
| Roulette lock-in | zero flair | `Items.ts:299` when `rouletteT` hits 0 |
| Banana drop | no throw sound/telegraph | `Items.use` banana (205) |
| Boost pad | fully silent | `Kart.applyPad` (194) |
| Drift charge | invisible meter/stages | `Kart.update` drift (253) + hud meter |
| Mini-turbo | no camera punch/shake | `Game.#updateCamera` (537) |
| Getting hit | no screen flash, no haptic | `hitBanana/hitPlow` (165–182) + `navigator.vibrate` |
| Position change | silent every frame | `#updateHud` rank diff (505) |
| Final lap | music unaware | `#finalLapCallout` (425) → `startMusic(intensity)` |
| Lap complete | no split popup | `Kart.ts:320` lap cross |
| Near-miss/overtake | no whoosh | `#collide` proximity (452) |
| Off-road | no rumble/dust/wobble | `onRoad` in `Kart.update` (220) |
| Win/lose | uniform jingle, fake times | `#doFinish` (480) |

**Bottom line:** ship persistence + menu fit + touch ergonomics + drift readability before any new item; ghosts + BroadcastChannel co-op are the cheapest credible steps toward "feels like a real game."