// Transport layer (M3 step 1, judge backlog J-23; ADR-0004).
//
// A Transport moves protocol messages between two racers without knowing
// anything about karts or races. Three implementations share one interface:
// - LoopbackTransport: an in-process pair (hot-seat 2P, tests, fixtures).
// - BroadcastChannelTransport: same-origin tabs — zero-setup play.
// - WebRtcTransport: cross-device, in src/net/webrtc.ts (M3 step 4).
//
// The reliable/unreliable channel split from the multiplayer handbook is
// encoded as `reliable: boolean` on each message; Loopback/BroadcastChannel
// are inherently reliable, so unreliable messages are simply never dropped
// by them (WebRTC uses a second unordered channel).

export interface NetMessage {
  t: string;              // message type — catalogue in docs/multiplayer.md §3
  reliable: boolean;      // routing hint for transports with two lanes
  payload: unknown;       // JSON-safe data
}

export interface TransportOptions {
  id: string;             // 'host' | 'guest-<n>' | 'loop-a' ...
  room: string;           // room code / channel name
}

export interface Transport {
  readonly kind: 'loopback' | 'broadcast' | 'webrtc';
  readonly id: string;
  readonly room: string;
  send(msg: NetMessage): void;
  onMessage(handler: (msg: NetMessage, from: string) => void): void;
  close(): void;
  closed: boolean;
}

// --- Loopback: two ends wired directly in memory ---------------------------

export class LoopbackTransport implements Transport {
  readonly kind = 'loopback' as const;
  closed = false;
  #peer: LoopbackTransport | null = null;
  #handlers: ((msg: NetMessage, from: string) => void)[] = [];

  constructor(readonly id: string, readonly room: string) {}

  static pair(room: string): [LoopbackTransport, LoopbackTransport] {
    const a = new LoopbackTransport('loop-a', room);
    const b = new LoopbackTransport('loop-b', room);
    a.#peer = b;
    b.#peer = a;
    return [a, b];
  }

  send(msg: NetMessage): void {
    if (this.closed) return;
    const peer = this.#peer;
    if (peer) {
      for (const h of peer.#handlers) queueMicrotask(() => h({ ...msg }, this.id));
    }
  }

  onMessage(handler: (msg: NetMessage, from: string) => void): void {
    this.#handlers.push(handler);
  }

  close(): void {
    this.closed = true;
    this.#handlers = [];
  }
}

// --- BroadcastChannel: same-origin tabs (and Node's worker_threads channel
// for tests) ----------------------------------------------------------------

export class BroadcastTransport implements Transport {
  readonly kind = 'broadcast' as const;
  closed = false;
  #ch: BroadcastChannel | null;
  #handlers: ((msg: NetMessage, from: string) => void)[] = [];

  constructor(readonly id: string, readonly room: string) {
    const name = `kk-room-${room}`;
    this.#ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(name) : null;
    if (this.#ch) {
      this.#ch.onmessage = (ev) => {
        const data = ev.data as { from: string; msg: NetMessage } | null;
        if (!data || data.from === this.id || this.closed) return; // no self-echo
        for (const h of this.#handlers) h({ ...data.msg }, data.from);
      };
    }
  }

  get available(): boolean {
    return this.#ch !== null;
  }

  send(msg: NetMessage): void {
    if (this.closed || !this.#ch) return;
    this.#ch.postMessage({ from: this.id, msg: { ...msg } });
  }

  onMessage(handler: (msg: NetMessage, from: string) => void): void {
    this.#handlers.push(handler);
  }

  close(): void {
    this.closed = true;
    this.#handlers = [];
    this.#ch?.close();
    this.#ch = null;
  }
}