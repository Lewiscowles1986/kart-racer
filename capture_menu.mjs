import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = process.env.SHOT_URL || 'http://127.0.0.1:5173/';
const OUT = process.env.OUT || 'menu_full.png';
const FULL = process.env.FULL === '1';

const b = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--hide-scrollbars', '--window-size=1280,720'],
});

try {
  const p = await b.newPage();
  await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await p.goto(URL, { waitUntil: 'load', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 6500));
  const m = await p.evaluate(() => {
    const scr = document.scrollingElement || document.documentElement;
    const startBtn = [...document.querySelectorAll('button, [role=button]')].find((e) => /start/i.test(e.textContent || ''));
    const btn = startBtn ? startBtn.getBoundingClientRect() : null;
    return {
      scrollH: scr.scrollHeight,
      clientH: scr.clientHeight,
      bodyH: document.body.scrollHeight,
      appH: document.getElementById('app')?.getBoundingClientRect().height,
      startBtnRect: btn ? { top: Math.round(btn.top), bottom: Math.round(btn.bottom), visible: btn.top < scr.clientHeight && btn.bottom <= scr.clientHeight } : null,
    };
  });
  console.log('LAYOUT', JSON.stringify(m));
  await p.screenshot({ path: OUT, fullPage: FULL, type: 'png' });
  console.log('WROTE', OUT);
} catch (e) {
  console.log('ERR', e.message);
} finally {
  await b.close();
}
