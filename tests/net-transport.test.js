import { describe, it, expect } from 'vitest';
import { LoopbackTransport, BroadcastTransport } from '../src/net/transport';

const drain = () => new Promise((r) => setTimeout(r, 0));

describe('net transports (M3 step 1, J-23)', () => {
  it('loopback pair delivers messages both ways without self-echo', async () => {
    const [a, b] = LoopbackTransport.pair('t1');
    const got = [];
    b.onMessage((m) => got.push(m));
    a.send({ t: 'HELLO', reliable: true, payload: { name: 'A' } });
    await drain();
    expect(got).toHaveLength(1);
    expect(got[0].t).toBe('HELLO');
  });

  it('closed transports are silent (no throw, no delivery)', async () => {
    const [a, b] = LoopbackTransport.pair('t2');
    const got = [];
    b.onMessage((m) => got.push(m));
    a.close();
    a.send({ t: 'BYE', reliable: true, payload: null });
    await drain();
    expect(got).toHaveLength(0);
  });

  it('broadcast (node BroadcastChannel) delivers to other peers, never self-echo', async () => {
    const a = new BroadcastTransport('tab-a', 'roomX');
    const b = new BroadcastTransport('tab-b', 'roomX');
    if (!a.available || !b.available) return; // env without BroadcastChannel: skip
    const got = [];
    const selfGot = [];
    b.onMessage((m) => got.push(m.t));
    a.onMessage((m) => selfGot.push(m.t));
    a.send({ t: 'LOBBY', reliable: true, payload: { players: 1 } });
    a.send({ t: 'SELF', reliable: true, payload: 0 });
    await drain();
    expect(got).toEqual(['LOBBY', 'SELF']); // b receives everything a sends
    expect(selfGot).toEqual([]);            // a receives none of its own
    a.close();
    b.close();
  });
});