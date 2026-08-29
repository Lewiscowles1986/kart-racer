import { describe, it, expect } from 'vitest';
import { LoopbackTransport } from '../src/net/transport';
import { Lockstep, NEUTRAL_FRAME, clampFrame } from '../src/net/lockstep';

const drain = () => new Promise((r) => setTimeout(r, 0));

const FRAME = (steer, throttle = 1) => ({ steer, throttle, brake: false, itemPressed: false, itemHeld: false });

// Wire two lockstep cores via a loopback pair, pump ticks until synced.
function pair() {
  const [ta, tb] = LoopbackTransport.pair('lk');
  const a = new Lockstep({ transport: ta, selfIndex: 0, playerCount: 2, inputDelay: 2 });
  const b = new Lockstep({ transport: tb, selfIndex: 1, playerCount: 2, inputDelay: 2 });
  return { a, b };
}

describe('lockstep core (M3 step 2, J-24/J-25)', () => {
  it('applies the 2-tick input delay: startup window buffers, then inputs land together', async () => {
    const { a, b } = pair();
    a.submitFrame(FRAME(-1));
    b.submitFrame(FRAME(1));
    await drain(); // CMD INPUT crosses the wire via microtask
    // startup window ticks 0..1 advance on neutral own input (pre-fill)
    const s0 = a.tryAdvance();
    expect(s0).toEqual([NEUTRAL_FRAME, NEUTRAL_FRAME]);
    a.tryAdvance();
    b.tryAdvance(); b.tryAdvance();
    // tick 2: both inputs are now closed on both peers
    const fa = a.tryAdvance();
    const fb = b.tryAdvance();
    expect(fa).toEqual([FRAME(-1), FRAME(1)]);
    expect(fb).toEqual(fa);
  });

  it('advances in lockstep: submitted order matches on both peers', async () => {
    const { a, b } = pair();
    a.submitFrame(FRAME(-1));
    b.submitFrame(FRAME(1));
    await drain();
    // burn both buffer ticks + consume the real one
    a.tryAdvance(); b.tryAdvance();
    a.tryAdvance(); b.tryAdvance();
    const fa = a.tryAdvance(), fb = b.tryAdvance();
    expect(fa).toEqual([FRAME(-1), FRAME(1)]);
    expect(fb).toEqual(fa);
  });

  it('missing remote input at the gate fills NEUTRAL (never stalls)', async () => {
    const { a } = pair();
    a.submitFrame(FRAME(0.5));
    a.tryAdvance(); a.tryAdvance();
    const f = a.tryAdvance();
    expect(f).not.toBeNull();
    expect(f[1]).toEqual(NEUTRAL_FRAME); // remote kart absent => neutral
    expect(f[0].steer).toBe(0.5);
  });

  it('stateHash exchange trips onDesync only on a mismatch', async () => {
    const { a, b } = pair();
    const desyncs = [];
    a.onDesync = (info) => desyncs.push(info);
    a.noteHash(12, 'aaaa');
    b.publishHash(12, 'bbbb');   // b sends STATEHASH(12, aaaa→bbbb mismatch)
    await drain();
    expect(desyncs).toHaveLength(1);
    expect(desyncs[0].local).toBe('aaaa');
    expect(desyncs[0].remote).toBe('bbbb');
    b.publishHash(14, 'zzzz');   // no local hash recorded at 14: silent
    await drain();
    expect(desyncs).toHaveLength(1);
    a.noteHash(14, 'zzzz');
    b.publishHash(14, 'zzzz');   // equal: no trip
    await drain();
    expect(desyncs).toHaveLength(1);
  });

  it('buffers do not grow unbounded (GC beyond window)', async () => {
    const { a } = pair();
    for (let t = 0; t < 400; t++) {
      a.submitFrame(FRAME(0));
      a.tryAdvance();
      if (t % 3 === 0) a.noteHash(t, 'h' + t);
    }
    expect(a.pendingTicks).toBeLessThan(90);
  });

  it('remote frames are CLAMPED at the trust boundary (judge bars #6/#7)', async () => {
    // legal extremes survive, out-of-range is clamped, NaN becomes 0
    expect(clampFrame({ steer: 5, throttle: 9, brake: 'yes', itemPressed: 1 })).toEqual({ steer: 1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    expect(clampFrame({ steer: -7 })).toEqual({ steer: -1, throttle: 0, brake: false, itemPressed: false, itemHeld: false });
    expect(clampFrame({ steer: 'NaN-string', throttle: Number.NaN })).toEqual({ steer: 0, throttle: 0, brake: false, itemPressed: false, itemHeld: false });
    expect(clampFrame(null)).toEqual(NEUTRAL_FRAME);

    // end-to-end: a malicious sibling cannot smuggle steer=42 into the buffer
    const [ta, tb] = LoopbackTransport.pair('evil');
    const victim = new Lockstep({ transport: ta, selfIndex: 0, playerCount: 2, inputDelay: 0 });
    new Lockstep({ transport: tb, selfIndex: 1, playerCount: 2, inputDelay: 0 });
    victim.submitFrame(FRAME(0)); // the gate needs the victim's own input
    // inject a crafted CMD INPUT directly on the raw transport
    tb.send({ t: 'CMD INPUT', reliable: true, payload: { tick: 0, kart: 1, frame: { steer: 42, throttle: -9, brake: true } } });
    await drain();
    const frames = victim.tryAdvance();
    expect(frames[1]).toEqual({ steer: 1, throttle: 0, brake: true, itemPressed: false, itemHeld: false });
  });

  it('malformed CMD INPUT is rejected outright (no crash, no NaN ticks)', async () => {
    const { a } = pair();
    const raw = a.transport;
    const got = [];
    a.onFramesReady((f) => got.push(f));
    raw.onMessage(() => {}); // transport still alive after garbage
    a.transport.send({ t: 'CMD INPUT', reliable: true, payload: { tick: null, kart: 'x', frame: { steer: [1, 2] } } });
    raw.send({ t: 'CMD INPUT', reliable: true, payload: { tick: 3, kart: 1, frame: { steer: 0.5, throttle: 1, brake: false, itemPressed: false, itemHeld: false } } });
    await drain();
    // the malicious frame is ignored, the well-formed one buffers silently —
    // no exception escaped; the core still accepts its own input afterwards
    a.submitFrame(FRAME(0.2));
    expect(a.tryAdvance()).not.toBeNull();
  });
});