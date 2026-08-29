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

  // Each human's kart index is fixed by the lobby; AI karts fill the rest.
  humanKartCount(): number {
    return this.players.length;
  }

  // The kart index if kart i is human-controlled in this session, else null.
  humanKartIndex(kartIndex: number): number | null {
    if (!this.players.length) return this.isHost ? (kartIndex === 0 ? 0 : null) : null;
    const p = this.players.find((pl) => pl.kartIndex === kartIndex);
    return p ? p.kartIndex : null;
  }

  hostName(): string {
    return this.players.find((p) => p.kartIndex === 0)?.name || 'host';
  }

  // --- guest ----------------------------------------------------------------
  join(name: string): void {
    this.transport.send({ t: 'HELLO', reliable: true, payload: { name, protocol: PROTOCOL } });
  }

  // --- per-tick API (Game.#simUpdate / #updateKarts) -------------------------
  preTick(frame: InputFrame): InputFrame[] | null {
    this.#lastFrame = frame;
    this.lockstep.submitFrame(frame);
    return this.lockstep.tryAdvance();
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
    if (msg.t === 'CMD INPUT' || msg.t === 'STATEHASH') return; // Lockstep owns these
    if (msg.t === 'HELLO' && this.isHost) {
      const p = msg.payload as { name?: string; protocol?: number };
      if (p.protocol !== PROTOCOL || !p.name) return;
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