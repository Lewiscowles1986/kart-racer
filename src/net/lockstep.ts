// Lockstep core (M3 step 2, judge backlog J-24/J-25; ADR-0004 amendment).
//
// Every peer runs the identical 120Hz sim and advances one tick only when the
// input frames for that tick are KNOWN — locally queued with a fixed input
// delay, remote ones arriving on the wire with the same delay applied. No
// input by close-of-tick ⇒ neutral frame (never a stall). A 20Hz stateHash
// exchange is the desync tripwire: a mismatch fires onDesync, and the RESYNC
// flow (snapshot + command tail via snapshotRace/applyKartSnapshot) heals it.
//
// The host in this design is an authoritative COORDINATOR only (START/RESYNC/
// MIGRATE votes); per-tick state truth is the hash agreement of all peers.

import type { Transport, NetMessage } from './transport';

export interface InputFrame {
  steer: number;
  throttle: number;
  brake: boolean;
  itemPressed: boolean;
  itemHeld: boolean;
}

export const NEUTRAL_FRAME: InputFrame = { steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false };

export interface LockstepOptions {
  transport: Transport;
  selfIndex: number;      // this peer's kart index
  playerCount: number;    // human players (AI frames are fabricated locally)
  inputDelay?: number;    // ticks between send and apply (2 default, 3 on lag)
  hashEvery?: number;     // exchange stateHash every N ticks (6 ≈ 20Hz at 120Hz)
  onDesync?: (info: { tick: number; local: string; remote: string; from: string }) => void;
}

interface Stored { frame: InputFrame; from: string }

export class Lockstep {
  transport: Transport;
  selfIndex: number;
  playerCount: number;
  inputDelay: number;
  hashEvery: number;
  onDesync?: LockstepOptions['onDesync'];

  // buffers[tick][playerIndex] = frame
  #buffer = new Map<number, Map<number, Stored>>();
  #seq = 0;
  #nextOutTick = 0; // next tick this peer will simulate
  #handlers: ((frames: InputFrame[], tick: number) => void)[] = [];

  constructor(opts: LockstepOptions) {
    this.transport = opts.transport;
    this.selfIndex = opts.selfIndex;
    this.playerCount = Math.max(1, opts.playerCount);
    this.inputDelay = opts.inputDelay ?? 2;
    this.hashEvery = opts.hashEvery ?? 6;
    this.onDesync = opts.onDesync;
    opts.transport.onMessage((msg, from) => this.#onMessage(msg, from));
  }

  // Local input for a future tick: buffers locally with the delay, announces.
  submitFrame(frame: InputFrame): void {
    const tick = this.#nextOutTick + this.inputDelay;
    this.#store(tick, this.selfIndex, frame, 'self');
    this.transport.send({
      t: 'CMD INPUT',
      reliable: true,
      payload: { tick, seq: this.#seq++, kart: this.selfIndex, frame },
    });
  }

  // Called per sim tick: returns the frames to apply, or null if not closed.
  // The first `inputDelay` ticks advance on neutral own input (the delay
  // window is pre-fill); after that, own input must be queued. Missing remote
  // input at the gate = neutral (stall-proof by design).
  tryAdvance(): InputFrame[] | null {
    const tick = this.#nextOutTick;
    const slot = this.#buffer.get(tick);
    if (tick >= this.inputDelay && (!slot || !slot.has(this.selfIndex))) return null;
    const frames: InputFrame[] = [];
    for (let i = 0; i < this.playerCount; i++) frames.push(slot?.get(i)?.frame ?? { ...NEUTRAL_FRAME });
    this.#nextOutTick++;
    for (const h of this.#handlers) h(frames, tick);
    if (this.#buffer.size > 90) this.#gc();
    return frames;
  }

  // Publish this tick's race hash for cross-checking (call after simming).
  publishHash(tick: number, hash: string): void {
    if (tick % this.hashEvery !== 0) return;
    this.transport.send({ t: 'STATEHASH', reliable: true, payload: { tick, hash } });
  }

  onFramesReady(handler: (frames: InputFrame[], tick: number) => void): void {
    this.#handlers.push(handler);
  }

  get pendingTicks(): number {
    return this.#buffer.size;
  }

  #store(tick: number, kart: number, frame: InputFrame, from: string): void {
    let slot = this.#buffer.get(tick);
    if (!slot) slot = new Map();
    slot.set(kart, { frame: { ...frame }, from });
    this.#buffer.set(tick, slot);
  }

  #onMessage(msg: NetMessage, from: string): void {
    if (msg.t === 'CMD INPUT') {
      const p = msg.payload as { tick: number; kart: number; frame: InputFrame };
      if (typeof p.tick !== 'number' || typeof p.kart !== 'number') return;
      if (p.kart === this.selfIndex) return; // echoed self — ignore
      this.#store(p.tick, p.kart, p.frame, from);
    } else if (msg.t === 'STATEHASH') {
      // desync tripwire: compare against OUR recorded hash for the same tick
      const p = msg.payload as { tick: number; hash: string };
      const mine = this.#hashes.get(p.tick);
      if (mine !== undefined) this.#compare(p.tick, mine, p.hash, from);
    }
  }

  #hashes = new Map<number, string>();

  // record own hash after simming (compared when a remote STATEHASH arrives)
  noteHash(tick: number, hash: string): void {
    this.#hashes.set(tick, hash);
    if (this.#hashes.size > 120) {
      for (const t of this.#hashes.keys()) {
        if (t < tick - 90) this.#hashes.delete(t);
      }
    }
  }

  #compare(tick: number, local: string, remote: string, from: string): void {
    if (local === remote) return;
    this.onDesync?.({ tick, local, remote, from });
  }

  #gc(): void {
    for (const t of this.#buffer.keys()) {
      if (t < this.#nextOutTick - 60) this.#buffer.delete(t);
    }
  }
}