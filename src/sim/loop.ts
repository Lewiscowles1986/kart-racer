// Fixed-timestep accumulator (M1 step 3, judge backlog J-3; ADR-0003).
//
// The simulation advances ONLY here, in fixed TICK_MS steps, never in
// variable render dt. The presentation layer owns the rAF loop and feeds
// wall deltas to tick(); the sim's world sees exact `tickMs` seconds every
// step. This is what makes races reproducible across 30/60/144fps machines
// (the v1 game integrated the clamped wall delta directly — GP-10/AR-2).
//
// Purity rules (tests/sim-track.test.js 'sim purity contract'): no wall
// clocks (only injected deltas), no Math.random, no DOM. Pause semantics
// (AR-11 fix): a paused ticker consumes the wall delta but runs ZERO ticks
// and accumulates nothing — so nothing can "catch up in a burst" on resume.

export const TICK_MS = 1000 / 120; // 120Hz sim clock (ADR-0003)

export interface TickerOptions {
  tickMs?: number;
  maxCatchUp?: number; // max ticks per tick() call; excess wall time is dropped
  onTick: (dtMs: number) => void;
}

export interface Ticker {
  tick(wallDeltaMs: number): void;
  readonly ticks: number;
  readonly dropped: number;
  readonly accumulatingMs: number;
  paused: boolean;
  reset(): void;
}

export function createTicker(opts: TickerOptions): Ticker {
  const tickMs = opts.tickMs ?? TICK_MS;
  const maxCatchUp = Math.max(1, opts.maxCatchUp ?? 5);
  let ticks = 0;
  let dropped = 0;
  let acc = 0;
  let paused = false;

  return {
    get ticks() { return ticks; },
    get dropped() { return dropped; },
    get accumulatingMs() { return acc; },
    set paused(p: boolean) { paused = p; },
    get paused() { return paused; },
    reset() { ticks = 0; dropped = 0; acc = 0; },
    tick(wallDeltaMs: number) {
      if (!Number.isFinite(wallDeltaMs) || wallDeltaMs <= 0) return;
      if (paused) { acc = 0; return; } // consume the frame; never simulate
      acc += wallDeltaMs;
      // epsilon guards the binary representation of tickMs (1000/120 rounds
      // UP in float64, so 1000ms is 119.999… ticks): boundary feeds like a
      // whole second must still land on the exact tick count.
      let steps = Math.floor(acc / tickMs + 1e-9);
      if (steps > maxCatchUp) { dropped += steps - maxCatchUp; steps = maxCatchUp; }
      if (steps >= 1) acc -= steps * tickMs; else acc = Math.min(acc, tickMs);
      // run after acc update so state is consistent even if a tick throws
      for (let i = 0; i < steps; i++) {
        opts.onTick(tickMs);
        ticks++;
      }
    },
  };
}