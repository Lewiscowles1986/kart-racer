import { chromium } from 'playwright-core';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
const p = await ctx.newPage();
const events = [];
p.on('console', (m) => { const t = m.text(); if (t.includes('[auto]')) events.push(t); });
await p.goto('http://localhost:5174/?auto=1&debug&seed=42', { waitUntil: 'networkidle' });
for (let i = 0; i < 10; i++) {
  await p.waitForTimeout(2000);
  const s = await p.evaluate(() => {
    const g = window.__kk; if (!g) return 'no handle';
    return `${g.state} rt=${Math.round(g.raceTimeMs)} lap=${g.player?.lap} u=${Math.round(g.player?.prevU ?? -1)} fin=${!!g.player?.finished}`;
  });
  console.log(`t=${(i+1)*2}s ${s}`);
}
await browser.close();
