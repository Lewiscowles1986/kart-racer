# ADR-0004: Multiplayer transport & netcode — system boundaries with few/no servers

- **Status:** Accepted
- **Date:** 2025-08-26 (session)

## Context

Requirement: a modern fun multiplayer experience using **few to no server
systems**, with defined boundaries where we *do* rely on one. The game is a
static-site deployable (GitHub Pages today). Constraint implies WebRTC-style
peer-to-peer data channels plus local-machine transports, not a game server
fleet.

## Decision

A layered transport + host-authoritative netcode, with the deterministic sim
(ADR-0003) as the shared core. Every boundary is an explicit, swappable
interface (`net/Transport`), so "no server" and "one tiny static relay" are
configurations, not forks of the code.

### System boundary map

```mermaid
flowchart TB
    subgraph P1["Peer A (browser)"]
        UI1[Session UI: lobby, name, racer] --- G1[Game loop]
        SIM1[Sim (deterministic)] --- NET1[NetController]
        TR1[Transport impl]
    end
    subgraph P2["Peer B (browser)"]
        TR2[Transport impl] --- SIM2[Sim: guest mirror / inputs]
    end
    TR1 <-->|"RTCDataChannel(s)\nP2P, DTLS"| TR2
    TR1 -.->|"manual SDP copy/paste\n(zero server) OR tiny\nstatic WS relay page"| SIG(("Signalling boundary\n(optional, static)"))
    TR1 -.-> STUN(("STUN boundary\n(public free)"))
    TR1 -.-> TURN(("TURN boundary\n(optional, only for hard NATs)"))
    BC(("BroadcastChannel\nsame-origin tabs/frames")) --- TR1
```

### Transports (implement one interface)

| Transport                    | Scope | Server? | Notes |
| ---------------------------- | ----- | ------- | ----- |
| `LoopbackTransport`          | tests, hot-seat, "2 on one keyboard" | none | in-process |
| `BroadcastChannelTransport`  | same browser, many tabs/windows | none | same-origin only; dev-mate racing, demos |
| `WebRtcTransport` (datachannels) | LAN/Internet P2P | none for data | reliable+ordered & unreliable-unordered channels |
| signalling: `Manual` (paste offer/answer) | first contact | none | friend sends a code block |
| signalling: `RelaySignalling` | first contact | tiny stateless static worker/page, no DB | room codes |

### Netcode choice

> **Amendment (round-1 judge, binding):** *In-race authority is deterministic
> lockstep with 2–3-tick input delay — every peer runs the same sim and
> exchanges delayed, clamped `InputFrame`s with per-tick `stateHash` exchange
> (rooms are gated to same-engine peers until AR-9's transcendental math is
> replaced by polynomial evaluation; divergence triggers an alert and a
> snapshot+command-tail resync) — while the host is only a session coordinator
> (seed, roster, start tick), and host-authoritative snapshots remain solely
> for late-join, migration, resync, and mixed-engine fallback, never as the
> primary race authority.*

**Host-authoritative input replay** built on the deterministic sim (see the
original rationale below; the amendment above supersedes the primary/fallback
ordering — deterministic lockstep is the primary in-race protocol; the
mechanics described here now serve snapshot resync, late join and migration):

1. Host runs the authoritative sim tick loop with `TICK_MS` fixed steps.
2. Guests send their `InputFrame` commands to the host (batched per input
   period) on a reliable-ordered channel; host injects them into the command
   queue at the agreed tick (input-delay window tuned to RTT).
3. Host broadcasts compact snapshots (position deltas + events, ~20 Hz) on an
   unreliable channel; guests interpolate/extrapolate local presentation.
4. Item roulette resolution, lap/position/ranking: host-computed, delivered as
   authoritative events (never recomputed on guests) — floats in the item/AI
   RNG make lockstep across browser engines fragile (see ADR-0003), snapshots
   don't care.
5. Race join mid-session: guest receives full snapshot + command log tail.
   Host quit → deterministic "host migration" by electing the next peer and
   transferring snapshot + RNG state; failed migration → AI backfill.

**Anti-cheat posture (documented, deliberate):** friends-racing trust model.
The host is the arbiter; guests cannot affect other peers' karts directly.
No server-side validation, no matchmaking queue — a room code plus manual or
code-based signalling is the whole identity system. Names are cosmetic.

### Boundaries we consciously do NOT build

- accounts/auth, persistent matchmaking, global leaderboards, chat relay,
  stats service. Each is one pluggable boundary later behind the `net/`
  interfaces above, without touching sim or presentation code.

## Consequences

- The sim's snapshot + command formats are the wire protocol; keep them
  versioned (add fields only, bump a `protocolVersion`).
- Same-page determinism tests double as netcode tests: replay a recorded
  command trace through two "peers" connected by `LoopbackTransport` and assert
  both converge to the host's state hash.
- The single server-ish artefact allowed by this ADR is an *optional, static*
  signalling page/worker; the game is fully playable (same tab, tabs, LAN
  via manual SDP) with zero it.