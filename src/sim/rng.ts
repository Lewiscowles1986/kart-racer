// Deterministic RNG (SFC32) with independent named streams.
//
// Why: Math.random in the sim (item roulette, AI jitter) makes every race
// unreproducible and multiplayer replay impossible. This module provides the
// ONLY random source inside the deterministic sim (docs/simulator.md §1.2).
//
// Streams: each named stream is seeded from the root seed + name hash, so
// adding a new consumer never perturbs existing sequences. Presentation/FX
// must NOT use this — pure eye-candy may keep Math.random (docs/adr/0003).

export type RngStream = () => number; // [0, 1)

export class Rng {
  private streams = new Map<string, RngStream>();
  private root: RngStream;
  readonly seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.root = sfc32(this.#derive(seed >>> 0, 'root'));
    // seed every stream lazily; 'root' reserved for shared decisions
    this.stream('items');
    this.stream('ai');
  }

  // Root stream: use for truly race-global randomness only (e.g. weather roll).
  next(): number {
    return this.root();
  }

  // Independent, reproducible stream per subsystem name.
  stream(name: string): RngStream {
    const key = name.toLowerCase();
    let s = this.streams.get(key);
    if (!s) {
      s = sfc32(this.#derive(this.seed, key));
      this.streams.set(key, s);
    }
    return s;
  }

  #derive(seed: number, name: string): [number, number, number, number] {
    // FNV-1a over name mixed into the seed → 4 u32 state words.
    let h = (seed ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < name.length; i++) {
      h ^= name.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    // SplitMix32 to decorrelate words.
    const w = (x: number) => {
      x >>>= 0;
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = (Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0) >>> 0;
      z = (Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0) >>> 0;
      return (z ^ (z >>> 15)) >>> 0;
    };
    return [w(h), w(h + 1), w(h + 2), w(h + 3)];
  }
}

// SFC32: tiny, fast, excellent statistical quality for games (u32 internal,
// f64 outputs in [0,1)). Fully specified: identical in any JS engine.
export function sfc32(state: [number, number, number, number]): RngStream {
  let [a, b, c, d] = state.map((x) => x >>> 0);
  return function () {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    let t = (a + b | 0) + d | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    // u32 triple → [0,1) without bias concerns for gameplay use
    return ((t >>> 0) / 4294967296 + (t >>> 0) % 1e6 / 1e12) % 1;
  };
}