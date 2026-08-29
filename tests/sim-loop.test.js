import { describe, it, expect } from 'vitest';
import { createTicker, TICK_MS } from '../src/sim/loop';

describe('fixed-timestep ticker (M1 step 3, J-3)', () => {
  it('TICK_MS is the 120Hz sim clock', () => {
    expect(TICK_MS).toBeCloseTo(1000 / 120, 12);
  });

  it('advances exactly floor(delta/tick) fixed steps when uncapped', () => {
    let n = 0;
    const t = createTicker({ tickMs: 1000 / 120, maxCatchUp: 1e9, onTick: () => n++ });
    t.tick(1000); // one wall second
    expect(n).toBe(120);
    expect(t.ticks).toBe(120);
  });

  it('is feed-order invariant: 10s in one call == 600 x 16.7ms in 120Hz steps (determinism)', () => {
    let a = 0, b = 0; let sumDtA = 0, sumDtB = 0;
    const uncapped = { maxCatchUp: 1e9 };
    const ta = createTicker({ ...uncapped, onTick: (dt) => { a++; sumDtA += dt; } });
    const tb = createTicker({ ...uncapped, onTick: (dt) => { b++; sumDtB += dt; } });
    ta.tick(10_000);
    for (let i = 0; i < 600; i++) tb.tick(1000 / 60);
    // both produce 1200 ticks of virtual time; dt per tick identical
    expect(a).toBe(1200);
    expect(b).toBe(1200);
    expect(Math.abs(sumDtA - sumDtB)).toBeLessThan(1e-9);
    expect(Math.abs(sumDtA - 1200 * TICK_MS)).toBeLessThan(1e-9);
  });

  it('mixed wall feeds still land on the same total (144fps style)', () => {
    let ticks = 0;
    const t = createTicker({ maxCatchUp: 1e9, onTick: () => ticks++ });
    // 1 second delivered as 144 irregular frames summing to 1000ms
    const deltas = Array.from({ length: 144 }, (_, i) => (i % 2 ? 7.5 : 6.5));
    const drift = 1000 - deltas.reduce((s, d) => s + d, 0);
    deltas[0] += drift; // make the sum exact
    for (const d of deltas) t.tick(d);
    expect(ticks).toBe(120);
  });

  it('caps catch-up at maxCatchUp and counts dropped wall time', () => {
    let n = 0;
    const t = createTicker({ maxCatchUp: 5, onTick: () => n++ });
    t.tick(10_000);
    expect(n).toBe(5);
    expect(t.dropped).toBeGreaterThan(0);
    // after the stall, the accumulator is not left with a giant backlog
    expect(t.accumulatingMs).toBeLessThan(10_000);
  });

  it('pausing consumes wall deltas but runs zero ticks (no catch-up burst on resume)', () => {
    let n = 0;
    const t = createTicker({ onTick: () => n++ });
    t.paused = true;
    for (let i = 0; i < 30; i++) t.tick(1000 / 60); // half a second of frames
    expect(n).toBe(0);
    t.paused = false;
    t.tick(1000 / 60); // the first resumed frame behaves like a normal frame
    expect(n).toBe(2); // 16.7ms -> exactly 2 ticks at 120Hz
    expect(t.accumulatingMs).toBeLessThan(TICK_MS); // no debt accumulated
  });

  it('calls onTick with exactly tickMs (the sim contract: fixed dt every step)', () => {
    const seen = [];
    const t = createTicker({ maxCatchUp: 1e9, onTick: (dt) => seen.push(dt) });
    t.tick(1000);
    expect(seen.every((dt) => dt === TICK_MS)).toBe(true);
    expect(seen.length).toBe(120);
  });

  it('ignores non-finite/non-positive deltas', () => {
    let n = 0;
    const t = createTicker({ onTick: () => n++ });
    t.tick(0); t.tick(-5); t.tick(NaN);
    expect(n).toBe(0);
  });

  it('reset clears ticks, dropped and accumulation (race restart parity)', () => {
    let n = 0;
    const t = createTicker({ maxCatchUp: 1e9, onTick: () => n++ });
    t.tick(1000);
    t.reset();
    expect(t.ticks).toBe(0);
    expect(t.dropped).toBe(0);
    expect(t.accumulatingMs).toBe(0);
    t.tick(1000);
    expect(t.ticks).toBe(120);
  });
});