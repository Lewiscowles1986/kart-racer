// Critic scratch: 90s auto-race diag sampling (no repo changes outside scratch)
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:5173/?auto=1';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'load', timeout: 30000 });

const snap = () => page.evaluate(() => {
  const d = document.getElementById('diag');
  return d ? JSON.parse(d.textContent) : null;
});

const frames = [];
// 90s: sample every ~5s, screenshots at t=5/45/85
await page.screenshot({ path: 'scripts/scratch-gp/race_t0.png' });
for (let t = 0; t <= 90; t += 5) {
  const d = await snap();
  frames.push({ t, ...d });
  if (t === 5) await page.screenshot({ path: 'scripts/scratch-gp/race_t5.png' });
  if (t === 45) await page.screenshot({ path: 'scripts/scratch-gp/race_t45.png' });
  if (t === 85) await page.screenshot({ path: 'scripts/scratch-gp/race_t85.png' });
  await new Promise((r) => setTimeout(r, 5000));
}
fs.writeFileSync('scripts/scratch-gp/race_samples.json', JSON.stringify(frames, null, 1));

// unwrap kart u values to cumulative progress
const L = frames.length ? Math.max(...frames[frames.length - 1].karts) + 1 : null;
const prog = frames.map((f) => (f.karts || []).map((v) => v));
const unwrapped = [];
let cur = null;
for (const f of frames) {
  if (!cur) { cur = f.karts.slice(); unwrapped.push(cur); continue; }
  cur = cur.map((p, i) => {
    const u = f.karts[i];
    let du = u - (p % 10000);
    // unwrap using previous raw value: diag stores wrapped u; detect wrap
    let prevRaw = f.karts[i];
    void prevRaw;
    return p;
  });
  unwrapped.push(cur);
}
// simpler: recompute from raw samples with continuity on last known raw
const raws = frames.map((f) => f.karts);
const cum = raws[0].map((v) => v);
const out = raws.map((r, ri) => {
  if (ri === 0) return cum.slice();
  const line = r.map((u, i) => {
    let prev = cum[i];
    let du = u - prev;
    if (du < -180) du += 720; // wrap handling refined below using L from track
    if (du > 180) du -= 720;
    cum[i] = u;
    return du;
  });
  return line;
});
// report per-interval deltas and min/max spread per snapshot (positions as-is)
console.log(JSON.stringify({ frames: frames.map((f) => ({ t: f.t, state: f.state, lap: f.lap, u: f.u, speed: f.speed, karts: f.karts })), errors: errors.slice(0, 5) }, null, 1));
await browser.close();