import { Game } from './game/Game';
import * as THREE from 'three';
(window as any).THREE = THREE; // exposed for headless QA tooling

const boot = document.getElementById('boot');
const app = document.getElementById('app')!;

const game = new Game(app);
game.start();

// Animate the boot progress bar, then fade the overlay once the first frame
// has rendered. The bar is cosmetic (the game boots fast) but sells the moment.
const fill = document.getElementById('boot-fill') as HTMLElement | null;
const text = document.getElementById('boot-text') as HTMLElement | null;
const steps = ['Loading…', 'Shifting gears…', 'Warming up tyres…', 'Ready!'];
let p = 0;
const t0 = performance.now();
const tick = () => {
  p = Math.min(1, (performance.now() - t0) / 1400);
  if (fill) fill.style.width = `${Math.round(p * 100)}%`;
  if (text) text.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
  if (p < 1) requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

setTimeout(() => { if (boot) boot.classList.add('hidden'); }, 500);

(window as any).__game = game; // handy for debugging / tooling
