import { Game } from './game/Game';
import * as THREE from 'three';
(window as any).THREE = THREE; // exposed for headless QA tooling

const boot = document.getElementById('boot');
const app = document.getElementById('app')!;

const game = new Game(app);
game.start();

// fade the boot overlay once the first frame has rendered
setTimeout(() => { if (boot) boot.classList.add('hidden'); }, 400);

(window as any).__game = game; // handy for debugging / tooling
