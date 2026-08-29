# Journal 0004 — M3: multiplayer without servers

**Milestone complete at round 34. Six steps; 95/95 tests; the judge's five-point multiplayer bar is met.**

## What M3 promised (JUDGE.md §6) and what landed

| Step | Commit | Delivery |
|---|---|---|
| 1 | `131d986` | Transport interface + Loopback (hot-seat/tests) + BroadcastChannel (same-origin tabs) |
| 2 | `55ae577` | Lockstep core (J-24/J-25): 2-tick input delay, neutral-fill gate (never stalls), 20Hz stateHash tripwire |
| 3 | `bafd182` | NetController: HELLO/LOBBY/START handshake, kart-slot assignment, tick-loop bridge |
| 4 | `9431bc7` | Game wiring: room codes (`?room=&host=1`), lockstep input gate in `#updateKarts`, `beginNetRace` re-seed, per-tick hash in RACING |
| 5 | `31e8c30` | WebRTC manual-SDP transport (J-27): paste-coded room codes, reliable-ordered channel, ICE capped, LAN-first |
| 6 | `191ed98` | AI backfill (J-29) + rematch: silent slot >5s → local deterministic AI on every peer; host RESTART replays the same seed |

## Verified live (not just in tests)

- **Two tabs, one browser** (`scripts/mp-check.mjs` → `MP-WIRE-OK`): lobby converges
  (guest slot = selfIndex 1), both sims produce **byte-identical kart arrays**
  from the shared seed, race lives on both sides.
- **Two pages over WebRTC** (`scripts/mp-webrtc-check.mjs` → `WEBRTC-OK`):
  manual offer/answer codes ~1.1kB, channel opens both ways, data crosses.
- QA gotchas recorded: Playwright `browser.newPage()` spawns isolated
  contexts — BroadcastChannel needs one context, two pages; and messages sent
  immediately post-handshake need listeners attached pre-handshake.
- Headless rAF throttling stretches countdowns (~5 ticks/s under SwiftShader
  in a background tab) — `maxCatchUp` covers it; timing is throttled, not wrong.

## Design notes (per ADR-0004 amendment)

- **Lockstep-primary**: state snapshots never carry gameplay truth during a
  race; the 20Hz stateHash is only a desync ALARM. Host authority is
  coordinator authority (START/RESTART/DROP), not per-tick state truth.
- **AI backfill needs no snapshots**: a dropped human's slot flips to local
  deterministic AI on every peer — same seed + same consumption = no desync,
  no transfer, race never stalls. Rejoin = any inbound traffic from the
  transport clears the drop flag.
- **Sim purity preserved**: `src/sim/**` still imports no net/DOM/clock;
  wall clocks live only in the net layer; the sim's view is a `dropped` flag.

## Honest residuals

- Room-gate is same-engine only (BroadcastChannel tabs + our WebRTC build);
  full engine-signature handshake lands with M4's wrap-up docs.
- Cross-device e2e over true Wi-Fi is manual-SDP (two copy/pastes) until the
  optional static signalling page is deployed (J-28, deliberately optional).
- Lobby UX is URL-driven (zero-setup trade-off); a named-lobby UI is M4
  polish, not a protocol gap.
- The `?auto` demo-cycle timer reset (seen in round 30's QA) is queued for M4.