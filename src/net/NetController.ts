// NetController (M3 step 3, judge backlog J-26/J-28).
//
// The bridge between Game's deterministic tick loop and the wire. Owns the
// lobby handshake (HELLO → LOBBY → START, docs/multiplayer.md §2/§3), owns
// which karts are HUMAN vs AI, and exposes the two calls the tick loop needs:
//
//   net.preTick(frame)            → InputFrame[] | null  (2-tick delay gate)
//   net.postTick(tick, raceHash)  → hash exchange + desync tripwire
//
// Protocol v1 messages live in docs/multiplayer.md §3; the transport only
// carries JSON-safe payloads. CMD INPUT / STATEHASH are consumed by the
// Lockstep instance on the same transport — this class sees them via the
// shared handler chain and ignores them itself.

import type { Transport, NetMessage } from './transport';
import { Lockstep, type InputFrame } from './lockstep';

export interface LobbyPlayer {
  kartIndex: number;
  name: string;
  isLocal: boolean;
  transportId: string; // '' never: identifies the sending transport
}

const PROTOCOL = 1;
// Same-engine room gate (judge note 1): until J-23/J-26 make the sim portable
// across engines, peers must agree on the engine + protocol version or the
// HELLO is rejected — a different engine cannot share transcendental state.
const ENGINE = 'kk-webgl-120hz';

export function engineSignature(): string {
  return `${ENGINE}/p${PROTOCOL}`;
}

export class NetController {
  transport: Transport;
  lockstep: Lockstep;
  selfIndex: number;
  room: string;
  isHost: boolean;
  hostId = '';
  raceSeed = 0;
  players: LobbyPlayer[] = [];

  onStart?: (seed: number, hostName: string) => void;
  onLobby?: (players: LobbyPlayer[], isHost: boolean) => void;
  onDesync?: (info: { tick: number; local: string; remote: string; from: string }) => void;
  onResync?: (snapshot: { karts: unknown[]; boxes: unknown[]; bananas: unknown[]; timeMs: number; raceTimeMs: number }) => void;

  #lastFrame: InputFrame = { steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false };

  constructor(transport: Transport, selfIndex: number, opts: { asHost?: boolean; localName?: string } = {}) {
    this.transport = transport;
    this.selfIndex = selfIndex;
    this.room = transport.room;
    this.isHost = !!opts.asHost;
    if (this.isHost) {
      this.hostId = transport.id;
      this.players = [{ kartIndex: 0, name: opts.localName || 'You', isLocal: true, transportId: transport.id }];
      this.onLobby?.(this.players, true);
    }
    this.lockstep = new Lockstep({
      transport,
      selfIndex,
      playerCount: 1 + (this.isHost ? 0 : 0), // raised as guests join; refined on LOBBY
      inputDelay: 2,
      onDesync: (info) => this.onDesync?.(info),
    });
    transport.onMessage((msg, from) => this.#onMessage(msg, from));
  }

  // --- host -----------------------------------------------------------------
  acceptGuest(transportId: string, name: string): number {
    const used = new Set(this.players.map((p) => p.kartIndex));
    let kartIndex = 1;
    while (used.has(kartIndex)) kartIndex++;
    this.players.push({ kartIndex, name: name.slice(0, 12), isLocal: false, transportId });
    this.lockstep.playerCount = this.players.length;
    this.transport.send({
      t: 'LOBBY',
      reliable: true,
      payload: { players: this.players.map((p) => ({ ...p, isLocal: p.transportId === transportId ? false : p.isLocal })), host: this.hostId, protocol: PROTOCOL },
    });
    // host's own view: mark the guest not-local already
    this.players[this.players.length - 1].isLocal = false;
    this.onLobby?.(this.players, true);
    return kartIndex;
  }

  startRace(seed: number): void {
    if (!this.isHost) return;
    this.raceSeed = seed;
    this.transport.send({ t: 'START', reliable: true, payload: { seed, protocol: PROTOCOL } });
    this.onStart?.(seed, this.hostName());
  }

  // M3 (J-29): drop detection — a human slot silent >dropAfterMs is "dropped":
  // every peer then simulates that kart with LOCAL AI (deterministic, same
  // seed) so the race never stalls. Rejoin restores the slot to human control.
  dropAfterMs = 5000;
  #lastSeen = new Map<number, number>(); // kartIndex -> performance.now() of last CMD INPUT
  droppedKarts = new Set<number>();
  onDrop?: (kartIndex: number) => void;
  onRestart?: (seed: number) => void;

  // The kart index if kart i is human-controlled in this session, else null.
  // Dropped karts return null: every peer runs its local AI for them (J-29).
  humanKartIndex(kartIndex: number): number | null {
    if (this.droppedKarts.has(kartIndex)) return null;
    if (!this.players.length) return this.isHost ? (kartIndex === 0 ? 0 : null) : null;
    const p = this.players.find((pl) => pl.kartIndex === kartIndex);
    return p ? p.kartIndex : null;
  }

  hostName(): string {
    return this.players.find((p) => p.kartIndex === 0)?.name || 'host';
  }

  // --- guest ----------------------------------------------------------------
  join(name: string): void {
    this.transport.send({ t: 'HELLO', reliable: true, payload: { name, protocol: PROTOCOL, engine: ENGINE } });
  }

  // --- per-tick API (Game.#simUpdate / #updateKarts) -------------------------
  preTick(frame: InputFrame): InputFrame[] | null {
    this.#lastFrame = frame;
    this.#noteSeenIfHuman(frame);
    this.lockstep.submitFrame(frame);
    return this.lockstep.tryAdvance();
  }

  // Liveness + drop sweep: call once per tick with the local wall clock.
  // Drop threshold check is net-layer work (wall clock is its domain; the sim
  // stays pure — the RESULT (a dropped flag) is what the sim sees).
  monitorDrop(now = performance.now()): void {
    for (const p of this.players) {
      if (p.isLocal || this.droppedKarts.has(p.kartIndex)) continue;
      const last = this.#lastSeen.get(p.kartIndex) ?? this.#connectedAt;
      if (now - last > this.dropAfterMs) {
        this.droppedKarts.add(p.kartIndex);
        this.transport.send({ t: 'DROP', reliable: true, payload: { kart: p.kartIndex } });
        this.onDrop?.(p.kartIndex);
      }
    }
  }

  #connectedAt = performance.now();

  #noteSeenIfHuman(_frame: InputFrame): void {
    // liveness is carried by the CMD INPUT stream itself; Lockstep stores
    // remote frames — we piggyback the timestamp in the shared handler below.
  }

  // called by the transport handler chain for EVERY inbound message
  #touch(transportId: string, now = performance.now()): void {
    const p = this.players.find((pl) => pl.transportId === transportId);
    if (p && this.droppedKarts.delete(p.kartIndex)) {
      this.onDrop?.(-1 - p.kartIndex); // negative index = un-drop signal (rejoined)
    }
    if (p) this.#lastSeen.set(p.kartIndex, now);
  }

  sendRestart(seed: number): void {
    this.transport.send({ t: 'RESTART', reliable: true, payload: { seed, protocol: PROTOCOL } });
    this.onRestart?.(seed);
  }

  // Host-only RESYNC (judge note 1): push the full race snapshot so a peer
  // whose stateHash diverged can heal via applyKartSnapshot + sim records.
  sendSnapshot(snapshot: { karts: unknown[]; boxes: unknown[]; bananas: unknown[]; timeMs: number; raceTimeMs: number }, atTick: number): void {
    this.transport.send({ t: 'SNAPSHOT', reliable: true, payload: { s: snapshot, tick: atTick } });
  }

  lastSentFrame(): InputFrame {
    return { ...this.#lastFrame };
  }

  postTick(tick: number, raceHash: string): void {
    this.lockstep.noteHash(tick, raceHash);
    this.lockstep.publishHash(tick, raceHash);
  }

  get tick(): number {
    return this.lockstep.pendingTicks;
  }

  // --- inbound ---------------------------------------------------------------
  #onMessage(msg: NetMessage, from: string): void {
    this.#touch(from); // any inbound traffic = that slot is alive
    if (msg.t === 'CMD INPUT' || msg.t === 'STATEHASH') return; // Lockstep owns these
    if (msg.t === 'RESTART') {
      const p = msg.payload as { seed?: number; protocol?: number };
      if (p.protocol !== PROTOCOL || typeof p.seed !== 'number') return;
      this.onRestart?.(p.seed);
      return;
    }
    if (msg.t === 'DROP') {
      const p = msg.payload as { kart?: number };
      if (typeof p.kart === 'number' && !this.droppedKarts.has(p.kart)) {
        this.droppedKarts.add(p.kart);
        this.onDrop?.(p.kart);
      }
      return;
    }
    if (msg.t === 'SNAPSHOT') {
      // RESYNC flow (judge note 1): the host's authoritative snapshot lands
      // through applyKartSnapshot/sim records on the Game side.
      const p = msg.payload as { s?: { karts: unknown[]; boxes: unknown[]; bananas: unknown[]; timeMs: number; raceTimeMs: number }; tick?: number };
      if (p.s && typeof p.s.timeMs === 'number') this.onResync?.(p.s);
      return;
    }
    if (msg.t === 'HELLO' && this.isHost) {
      const p = msg.payload as { name?: string; protocol?: number; engine?: string };
      if (p.protocol !== PROTOCOL || !p.name) return;
      if (p.engine && p.engine !== ENGINE) return; // wrong engine: reject, never race
      this.acceptGuest(from, p.name);
      return;
    }
    if (msg.t === 'LOBBY') {
      const p = msg.payload as { players?: LobbyPlayer[]; host?: string };
      if (!p.players) return;
      this.players = p.players.map((pl) => ({ ...pl, isLocal: pl.transportId === this.transport.id }));
      this.hostId = p.host || '';
      this.isHost = this.hostId === this.transport.id;
      this.selfIndex = this.players.find((pl) => pl.isLocal)?.kartIndex ?? this.selfIndex;
      this.lockstep.playerCount = Math.max(2, this.players.length);
      this.onLobby?.(this.players, this.isHost);
      return;
    }
    if (msg.t === 'START') {
      const p = msg.payload as { seed?: number; protocol?: number };
      if (p.protocol !== PROTOCOL || typeof p.seed !== 'number') return;
      this.raceSeed = p.seed;
      this.onStart?.(p.seed, this.hostName());
    }
  }
}