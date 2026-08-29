// Scratch UX captures (evaluation-only): pause overlay, touch/mobile layout,
// quit-to-menu flow, and localStorage persistence probe after toggling mute.
import { chromium } from 'playwright-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE = 'http://127.0.0.1:5173';
const out = new URL('./', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: CHROME, headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'],
});

const errors = [];
// --- desktop: pause overlay + mute persistence probe ---
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE + '/?auto=1', { waitUntil: 'load' });
  await page.waitForTimeout(6000); // get into a live race
  await page.keyboard.press('KeyP'); await page.waitForTimeout(400);
  await page.screenshot({ path: out + 'scratch-pause.png' });
  await page.keyboard.press('KeyP'); await page.waitForTimeout(300);
  await page.keyboard.press('KeyM'); await page.waitForTimeout(300); // mute via keyboard
  const ls = await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  console.log('localStorage after M-press:', ls);
  await page.keyboard.press('KeyQ'); await page.waitForTimeout(600); // quit-to-menu flow
  await page.screenshot({ path: out + 'scratch-after-quit.png' });
  console.log('state after Q:', await page.evaluate(() => document.getElementById('diag')?.textContent || null));
  await page.close();
}
// --- mobile/touch race ---
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push('TOUCH PAGEERROR: ' + e.message));
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: out + 'scratch-touch-menu.png' });
  await page.tap('.start'); await page.waitForTimeout(7000);
  await page.screenshot({ path: out + 'scratch-touch-race.png' });
  console.log('touch-race diag:', await page.evaluate(() => document.getElementById('diag')?.textContent || null));
  await ctx.close();
}
console.log('ERRORS:', JSON.stringify(errors.slice(0, 10)));
await browser.close();