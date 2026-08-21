// Capture the game's console output in a headless Chrome run and surface JS
// errors. Kills Chrome after a bounded real-time window.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const URL = process.argv[2] || 'http://127.0.0.1:5173/?auto=1';
const WINDOW_MS = Number(process.argv[3] || '9000');
const prof = mkdtempSync(join(tmpdir(), 'qa-profile-'));
const logfile = join(tmpdir(), 'qalog-' + Date.now() + '.log');

const args = [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--enable-unsafe-swiftshader',
  '--use-angle=swiftshader', `--user-data-dir=${prof}`, '--window-size=1280,720',
  '--enable-logging=stderr', '--v=0', URL,
];
const child = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'pipe'] });
child.stderr.on('data', (d) => writeFileSync(logfile, d, { flag: 'a' }));

setTimeout(() => { try { child.kill('SIGKILL'); } catch {} }, WINDOW_MS);
await new Promise((r) => child.on('exit', r));
rmSync(prof, { recursive: true, force: true });

import { readFileSync } from 'node:fs';
const out = readFileSync(logfile, 'utf8');
const lines = out.split('\n').filter((l) =>
  /CONSOLE.*(TypeError|ReferenceError|Uncaught|Unhandled|is not a function|is not defined|Cannot read|is undefined|NaN)/i.test(l)
);
console.log(lines.slice(0, 40).join('\n') || 'NO JS ERROR LINES FOUND');
rmSync(logfile, { force: true });
