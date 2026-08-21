// Robust headless QA runner using the installed Chrome (no download).
// Usage: node scripts/qa.mjs [virtualSeconds] [outPng]
// Loads the auto-race, waits, then reports the runtime diagnostic + console
// errors and (optionally) saves a screenshot.
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = 'http://127.0.0.1:5173/?auto=1';
const seconds = parseInt(process.argv[2] || '12', 10);
const outPng = process.argv[3] || null;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--window-size=1280,720'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));

try {
  await page.goto(URL, { waitUntil: 'load', timeout: 30000 });
} catch (e) { errors.push('GOTO: ' + e.message); }
await new Promise((r) => setTimeout(r, seconds * 1000));

let diag = null;
try { diag = await page.evaluate(() => document.getElementById('diag')?.textContent || null); } catch {}
if (outPng) await page.screenshot({ path: outPng });

console.log('DIAG=' + diag);
console.log('ERRORS=' + JSON.stringify(errors.slice(0, 8)));
await browser.close();
