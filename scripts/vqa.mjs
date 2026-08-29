// Visual QA: capture screenshots of the game at several moments.
// Usage: node scripts/vqa.mjs [mode]   mode: menu | race | full
//   menu = 1 shot of menu, race = 4 shots during auto-race, full = race + menu.
// Base URL overridable: KART_URL=http://127.0.0.1:5174 (default: this worktree's
// managed dev server; NOTE 5173 may be a stray server for another checkout).
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = process.env.KART_URL || 'http://127.0.0.1:5174';
const mode = process.argv[2] || 'full';
const outDir = new URL('./shots/', import.meta.url).pathname;

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

const diag = async () => page.evaluate(() => document.getElementById('diag')?.textContent || null);

if (mode === 'menu' || mode === 'full') {
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: outDir + 'menu.png' });
  console.log('menu diag:', await diag());
}

if (mode === 'race' || mode === 'full') {
  await page.goto(BASE + '/?auto=1', { waitUntil: 'load' });
  const marks = [[4, 'race-start'], [10, 'race-mid1'], [20, 'race-mid2'], [30, 'race-mid3']];
  let prev = 0;
  for (const [t, name] of marks) {
    await page.waitForTimeout((t - prev) * 1000);
    prev = t;
    await page.screenshot({ path: outDir + name + '.png' });
    console.log(name, 'diag:', await diag());
  }
}

console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)));
await browser.close();