import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const host = await ctx.newPage();
const guest = await ctx.newPage();
await host.goto('http://localhost:5174/?room=mp-verify&host=1&debug&seed=42', { waitUntil: 'networkidle' });
await guest.goto('http://localhost:5174/?room=mp-verify&name=Guest&debug&seed=42', { waitUntil: 'networkidle' });
await host.waitForTimeout(15000); // join -> auto-start -> countdown -> racing
const read = async (p) => p.evaluate(() => {
  const g = window.__kk;
  if (!g) return { err: 'no handle' };
  return { state: g.state, countdown: g.countdown, raceTimeMs: g.raceTimeMs, selfIndex: g.net?.selfIndex ?? null, players: g.net?.players?.length ?? 0,
           me: g.player?.prevU ?? -1, meIsFinished: !!g.player?.finished, laps: g.player?.lap ?? -1,
           karts: (g.karts || []).map(k => Math.round(k.prevU)), hashTick: g.netTick,
           itemStreamSeed: g.rng?.stream ? 'live' : 'none' };
});
const h = await read(host), g = await read(guest);
console.log('HOST:', JSON.stringify(h));
console.log('GUEST:', JSON.stringify(g));
const ok = h.players === 2 && g.players === 2 && (h.state === 'RACING' || h.state === 'FINISHED' || h.state === 'COUNTDOWN')
  && (h.laps >= 1 || g.laps >= 1); // race is live on both sides
console.log(ok ? 'MP-WIRE-OK' : 'MP-WIRE-FAIL');
await browser.close();
