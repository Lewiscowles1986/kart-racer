import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const host = await ctx.newPage();
const guest = await ctx.newPage();
await host.goto('http://localhost:5174/?room=mp-tl&host=1&debug&seed=42', { waitUntil: 'networkidle' });
await guest.goto('http://localhost:5174/?room=mp-tl&name=G&debug&seed=42', { waitUntil: 'networkidle' });
for (let i = 0; i < 12; i++) {
  await host.waitForTimeout(2000);
  const s = await host.evaluate(() => {
    const g = window.__kk; if (!g) return 'no handle';
    return `${g.state} cd=${g.countdown} rt=${Math.round(g.raceTimeMs)} me=${Math.round(g.player?.prevU ?? -1)} lap=${g.player?.lap} u0=${Math.round(g.karts[0].prevU)} u2=${Math.round(g.karts[2].prevU)} startCalls=${g.net?._starts ?? '-'}`;
  });
  console.log(`t=${(i+1)*2}s HOST ${s}`);
}
await browser.close();
