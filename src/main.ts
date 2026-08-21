import { Game } from './game/Game';
import * as THREE from 'three';
(window as any).THREE = THREE; // exposed for headless QA tooling

const boot = document.getElementById('boot');
const app = document.getElementById('app')!;

const game = new Game(app);
game.start();

// Animate the boot progress bar (cosmetic — the game boots fast), then fade the
// overlay once the bar reaches 100% so the label never contradicts the fill.
const fill = document.getElementById('boot-fill') as HTMLElement | null;
const text = document.getElementById('boot-text') as HTMLElement | null;
const pct = document.getElementById('boot-pct') as HTMLElement | null;
const phases = ['Loading…', 'Shifting gears…', 'Warming up tyres…'];
let p = 0;
const t0 = performance.now();
const tick = () => {
  p = Math.min(1, (performance.now() - t0) / 1000);
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  if (pct) pct.textContent = `${Math.round(p * 100)}%`;
  if (p < 1) {
    if (text) text.textContent = phases[Math.min(phases.length - 1, Math.floor(p * phases.length))];
    requestAnimationFrame(tick);
  } else {
    if (text) text.textContent = 'Ready!';
    setTimeout(() => { if (boot) boot.classList.add('hidden'); }, 260);
  }
};
requestAnimationFrame(tick);

(window as any).__game = game; // handy for debugging / tooling
