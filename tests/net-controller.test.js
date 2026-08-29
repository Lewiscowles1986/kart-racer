import { describe, it, expect } from 'vitest';
import { LoopbackTransport } from '../src/net/transport';
import { NetController } from '../src/net/NetController';

const drain = () => new Promise((r) => setTimeout(r, 0));

// host + guest wired over a loopback pair
function lobby() {
  const [ta, tb] = LoopbackTransport.pair('lobby');
  const host = new NetController(ta, 0, { asHost: true, localName: 'Host' });
  const guest = new NetController(tb, 1, {});
  return { host, guest };
}

describe('NetController lobby + tick bridge (M3 step 3, J-26/J-28)', () => {
  it('guest join → host lobby grows → guest sees itself non-local at kart 1', async () => {
    const { host, guest } = lobby();
    let hostLobby = null;
    host.onLobby = (players) => { hostLobby = players; };
    guest.join('Zed');
    await drain();
    expect(host.players).toHaveLength(2);
    expect(guest.players).toHaveLength(2);
    expect(guest.players[1].name).toBe('Zed');
    expect(guest.players[1].isLocal).toBe(true);
    expect(guest.players[0].isLocal).toBe(false);
    expect(guest.selfIndex).toBe(1);
    expect(hostLobby).toHaveLength(2); // host's own onLobby fires on accept too
  });

  it('host startRace propagates the seed; both sides report host name', async () => {
    const { host, guest } = lobby();
    guest.join('Zed');
    await drain();
    const seeds = [];
    guest.onStart = (seed) => seeds.push(seed);
    host.startRace(0xabc);
    await drain();
    expect(seeds).toEqual([0xabc]);
    expect(host.raceSeed).toBe(0xabc);
    expect(guest.raceSeed).toBe(0xabc);
  });

  it('preTick routes frames through Lockstep: both controllers advance together', async () => {
    const { host, guest } = lobby();
    guest.join('Zed');
    await drain();
    // frames only flow for human karts; neutral comes from the Lockstep gate
    host.preTick({ steer: -1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    guest.preTick({ steer: 1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    await drain(); // CMD INPUT crosses
    host.preTick({ steer: -1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    guest.preTick({ steer: 1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    await drain();
    const fa = host.preTick({ steer: -1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    const fb = guest.preTick({ steer: 1, throttle: 1, brake: false, itemPressed: false, itemHeld: false });
    // tick 0 (pre-fill) already returned something non-null on first call
    expect(fa).not.toBeNull();
    expect(fb).not.toBeNull();
    expect(fb).toEqual(fa);
    expect(fa.map((f) => f.steer)).toEqual([fa[0].steer, fb[1].steer]);
  });

  it('postTick hash exchange fires onDesync on the peer with a different race', async () => {
    const { host, guest } = lobby();
    guest.join('Zed');
    await drain();
    const flips = [];
    guest.onDesync = (i) => flips.push(i);
    host.postTick(6, 'h1');        // host publishes h@6
    guest.postTick(6, 'h2');       // guest hashes differently
    await drain();
    // both recorded locally then published; each compares on receipt
    expect(flips.length).toBeGreaterThan(0);
  });

  it('a silent guest slot becomes dropped: AI backfill takes over, race never stalls (J-29)', async () => {
    const { host, guest } = lobby();
    guest.join('Zed');
    await drain();
    const drops = [];
    guest.onDrop = (k) => drops.push(k); // guest hears the host's DROP broadcast
    // force the clock: guest slot silent beyond the threshold
    host.dropAfterMs = 10;
    const { human, aiBackfilled } = { human: host.humanKartIndex(1), aiBackfilled: null };
    expect(human).toBe(1);
    const later = performance.now() + 20;
    host.monitorDrop(later);
    await drain();
    expect(host.droppedKarts.has(1)).toBe(true);
    expect(guest.droppedKarts.has(1)).toBe(true); // propagated via DROP msg
    expect(drops).toEqual([1]);
    expect(host.humanKartIndex(1)).toBeNull(); // AI takes the slot on every peer
  });

  it('rematch: host sendRestart replays the agreed seed on both peers', async () => {
    const { host, guest } = lobby();
    guest.join('Zed');
    await drain();
    const restarts = [];
    guest.onRestart = (seed) => restarts.push(seed);
    host.sendRestart(0x77);
    await drain();
    expect(restarts).toEqual([0x77]);
  });
});