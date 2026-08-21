import * as THREE from 'three';
import { minimapSamples } from './minimap';
import type { TouchAction } from './Input';

const POS = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
const ITEM_ICON: Record<string, string> = { banana: '🍌', mushroom: '🍄', star: '⭐' };

interface KartDot {
  x?: number;
  z?: number;
  color?: string;
  isPlayer: boolean;
}

interface HudUpdate {
  position: number;
  lap: number;
  timeMs: number;
  item: string | null;
  rouletteT?: number;
  muted?: boolean;
}

interface Result {
  name: string;
  player: boolean;
  timeMs: number | null;
}

// DOM overlay for everything the player reads at a glance. Kept fully separate
// from the WebGL canvas so it stays crisp and accessible.
export class HUD {
  app: HTMLElement;
  el: HTMLDivElement;
  posEl!: HTMLElement;
  timerEl!: HTMLElement;
  lapEl!: HTMLElement;
  itemEl!: HTMLElement;
  map!: HTMLCanvasElement;
  mctx!: CanvasRenderingContext2D;
  countdownEl!: HTMLElement;
  panelEl!: HTMLElement;
  overlayEl!: HTMLElement;
  controls!: HTMLElement;
  muteBtn!: HTMLElement;
  _cycleAccum = 0;
  _cycleIcon = '';
  kartDots: KartDot[] = [];
  playerPos: THREE.Vector3 | undefined;
  muted = false;

  onTouch?: (act: TouchAction, down: boolean) => void;
  onPause?: () => void;
  onMute?: () => void;
  onStart?: () => void;
  onRestart?: () => void;
  onResume?: () => void;
  onQuit?: () => void;

  constructor(app: HTMLElement) {
    this.app = app;
    this.el = document.createElement('div');
    this.el.id = 'hud';
    this.app.appendChild(this.el);
    this.build();
  }

  build() {
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="pos-badge"><span class="pos"></span></div>
        <div class="timer"></div>
        <div class="lap"></div>
        <div class="hud-buttons">
          <button class="hudbtn mute">🔊</button>
          <button class="hudbtn pause">⏸</button>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="item-box"><span class="item"></span></div>
        <canvas class="minimap" width="140" height="140"></canvas>
      </div>
      <div class="controls">
        <div class="btn btn-steer-left">◀</div>
        <div class="btn btn-steer-right">▶</div>
        <div class="btn btn-brake">▼</div>
        <div class="btn btn-gas">▲</div>
        <div class="btn btn-item">ITEM</div>
      </div>
      <div class="countdown"></div>
      <div class="vignette"></div>
      <div class="center-overlay"><div class="panel"></div></div>
      ${this.#css()}
    `;
    this.posEl = this.el.querySelector('.pos') as HTMLElement;
    this.timerEl = this.el.querySelector('.timer') as HTMLElement;
    this.lapEl = this.el.querySelector('.lap') as HTMLElement;
    this.itemEl = this.el.querySelector('.item') as HTMLElement;
    this.map = this.el.querySelector('.minimap') as HTMLCanvasElement;
    this.mctx = this.map.getContext('2d')!;
    this.countdownEl = this.el.querySelector('.countdown') as HTMLElement;
    this.panelEl = this.el.querySelector('.panel') as HTMLElement;
    this.overlayEl = this.el.querySelector('.center-overlay') as HTMLElement;
    this.controls = this.el.querySelector('.controls') as HTMLElement;

    // touch controls
    const wire = (sel: string, act: TouchAction) => {
      const b = this.el.querySelector(sel) as HTMLElement;
      const down = (e: PointerEvent) => { e.preventDefault(); this.onTouch && this.onTouch(act, true); };
      const up = () => this.onTouch && this.onTouch(act, false);
      b.addEventListener('pointerdown', down);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
    };
    wire('.btn-steer-left', 'left');
    wire('.btn-steer-right', 'right');
    wire('.btn-gas', 'boost');
    wire('.btn-brake', 'brake');
    wire('.btn-item', 'item');
    if ('ontouchstart' in window) this.controls.style.display = 'flex';

    // pause / mute buttons
    (this.el.querySelector('.hudbtn.pause') as HTMLElement).onclick = () => this.onPause && this.onPause();
    (this.el.querySelector('.hudbtn.mute') as HTMLElement).onclick = () => this.onMute && this.onMute();
    this.muteBtn = this.el.querySelector('.hudbtn.mute') as HTMLElement;
    this._cycleAccum = 0;
    this._cycleIcon = '';
    this.kartDots = [];
  }

  #css(): string {
    return `<style>
      #hud{position:fixed;inset:0;pointer-events:none;z-index:10;font-family:'Baloo 2',system-ui,sans-serif;user-select:none}
      .hud-top{position:absolute;top:16px;left:18px;right:18px;display:flex;align-items:center;gap:14px;text-shadow:0 2px 6px rgba(0,0,0,.5)}
      .hud-bottom{position:absolute;bottom:16px;left:18px;right:18px;display:flex;align-items:flex-end;justify-content:space-between}
      .pos-badge{background:rgba(20,26,46,.72);color:#fff;border-radius:14px;padding:8px 16px;font-size:30px;font-weight:800;backdrop-filter:blur(4px)}
      .timer{background:rgba(20,26,46,.72);color:#ffe08a;border-radius:12px;padding:8px 18px;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
      .lap{background:rgba(20,26,46,.72);color:#fff;border-radius:12px;padding:8px 14px;font-size:20px;font-weight:700}
      .hud-buttons{margin-left:auto;display:flex;gap:8px}
      .hudbtn{width:46px;height:46px;border-radius:12px;border:0;background:rgba(20,26,46,.72);color:#fff;font-size:22px;cursor:pointer;backdrop-filter:blur(4px)}
      .hudbtn:hover{background:rgba(40,52,88,.85)}
      .hudbtn.muted{opacity:.5}
      .item-box{width:64px;height:64px;border-radius:12px;background:rgba(20,26,46,.75);display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 0 2px #ffd23f;border:3px solid rgba(255,255,255,.25)}
      .minimap{width:140px;height:140px;border-radius:12px;background:rgba(30,70,30,.55);border:3px solid rgba(255,255,255,.4)}
      .controls{position:absolute;right:16px;bottom:90px;display:none;gap:10px;pointer-events:auto;opacity:.85}
      .controls .btn{width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.25);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;border:2px solid rgba(255,255,255,.5);touch-action:none}
      .countdown{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#fff;text-shadow:0 6px 20px rgba(0,0,0,.6)}
      .center-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(8,12,28,.55)}
      .center-overlay.hidden{display:none}
      .panel{background:linear-gradient(180deg,#2b4a8f,#16305f);border-radius:24px;padding:34px 40px;text-align:center;color:#fff;box-shadow:0 20px 60px rgba(0,0,0,.5);pointer-events:auto;max-width:420px}
      .panel h1{margin:0 0 6px;font-size:40px;letter-spacing:1px}
      .panel h2{margin:0 0 18px;font-size:22px;font-weight:600;opacity:.9}
      .panel button{margin-top:16px;font-size:22px;font-weight:800;padding:14px 34px;border:0;border-radius:16px;cursor:pointer;color:#16305f;background:#ffd23f;box-shadow:0 6px 0 #a86a00;transition:transform .08s}
      .panel button:active{transform:translateY(4px);box-shadow:0 2px 0 #a86a00}
      .results{list-style:none;padding:0;margin:8px 0 0;font-size:20px;text-align:left}
      .results li{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.15)}
      .results .you{font-weight:800;color:#ffd23f}
      .hint{margin-top:14px;font-size:16px;opacity:.95;line-height:1.5}
      @media (prefers-reduced-motion: reduce){#hud .countdown{transition:none}.results li{transition:none}}
      .vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,transparent 62%,rgba(10,15,30,.38) 100%)}
    </style>`;
  }

  showMenu() {
    const touch = 'ontouchstart' in window;
    this.panelEl.innerHTML = `
      <h1>🏎️ Kart Kingdom</h1>
      <h2>A joyful 3D kart racer</h2>
      <p>Win races, grab 🍌🍄⭐ and dodge banana peels.</p>
      <button class="start">▶ Start Race</button>
      <p class="hint">${touch ? '◀ ▶ steer · ▲ gas · ▼ brake (hold ▲+▼ to drift) · ITEM' : 'W/↑ gas · A/D steer · Space ITEM · S brake (hold W+S to drift)'}</p>
      <p class="hint">💡 Hold brake while turning fast to charge a mini-turbo boost!</p>
    `;
    this.overlayEl.classList.remove('hidden');
    (this.panelEl.querySelector('.start') as HTMLElement).onclick = () => this.onStart && this.onStart();
  }

  hideOverlay() { this.overlayEl.classList.add('hidden'); }

  setCountdown(text: string) {
    this.countdownEl.textContent = text;
    this.countdownEl.style.opacity = text ? '1' : '0';
  }

  update({ position, lap, timeMs, item, rouletteT = 0, muted = false }: HudUpdate) {
    this.posEl.textContent = POS[position - 1] || `${position}th`;
    this.lapEl.textContent = `Lap ${Math.min(lap, 3)}/3`;
    const s = Math.floor(timeMs / 1000);
    const cs = Math.floor((timeMs % 1000) / 10);
    this.timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    // item box: cycling roulette while revealing, else the held item
    if (rouletteT > 0) {
      this._cycleAccum += 16;
      if (this._cycleAccum > 70) { this._cycleAccum = 0; this._cycleIcon = ['banana', 'mushroom', 'star'][Math.floor(Math.random() * 3)]; }
      this.itemEl.textContent = ITEM_ICON[this._cycleIcon] || '?';
      this.itemEl.style.opacity = '1';
    } else {
      this.itemEl.textContent = item ? ITEM_ICON[item] : '';
      this.itemEl.style.opacity = item ? '1' : '0.25';
    }
    this.muted = muted;
    if (this.muteBtn) this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn && this.muteBtn.classList.toggle('muted', muted);
  }

  drawMinimap() {
    const ctx = this.mctx || this.map.getContext('2d')!;
    this.mctx = ctx;
    const W = this.map.width, H = this.map.height, pad = 8;
    const samples = minimapSamples();
    ctx.clearRect(0, 0, W, H);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const s of samples) { minX = Math.min(minX, s[0]); maxX = Math.max(maxX, s[0]); minZ = Math.min(minZ, s[1]); maxZ = Math.max(maxZ, s[1]); }
    const sx = (x: number) => pad + (x - minX) / (maxX - minX || 1) * (W - 2 * pad);
    const sz = (z: number) => pad + (z - minZ) / (maxZ - minZ || 1) * (H - 2 * pad);
    ctx.strokeStyle = '#cfe0ff';
    ctx.lineWidth = 8; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    samples.forEach(([x, z], i) => { i ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z)); });
    ctx.closePath(); ctx.stroke();
    // AI + player dots
    for (const d of this.kartDots) {
      if (d.x === undefined) continue;
      ctx.fillStyle = d.isPlayer ? '#ffd23f' : d.color || '#fff';
      ctx.beginPath(); ctx.arc(sx(d.x), sz(d.z!), d.isPlayer ? 4.5 : 3, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = d.isPlayer ? 1.5 : 0.8; ctx.stroke();
    }
  }

  setPlayerPos(v: THREE.Vector3) { this.playerPos = v; }
  setKartDots(dots: KartDot[]) { this.kartDots = dots; }

  showPause() {
    this.panelEl.innerHTML = `<h1>⏸ Paused</h1><p>Take a breath — the race is waiting.</p><button class="on">▶ Resume</button><button class="quit">🏠 Quit to Menu</button>`;
    this.overlayEl.classList.remove('hidden');
    (this.panelEl.querySelector('.on') as HTMLElement).onclick = () => this.onResume && this.onResume();
    (this.panelEl.querySelector('.quit') as HTMLElement).onclick = () => this.onQuit && this.onQuit();
  }
  hidePause() { this.overlayEl.classList.add('hidden'); }

  showFinish(results: Result[]) {
    const fmt = (ms: number) => {
      const s = Math.floor(ms / 1000), cs = Math.floor((ms % 1000) / 10);
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    };
    const medals = ['🥇', '🥈', '🥉'];
    const rankColor = ['#ffd23f', '#dfe6ee', '#d08a3c', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#ffffff'];
    let list = '';
    results.forEach((r, i) => {
      const tag = medals[i] || `${i + 1}.`;
      const color = rankColor[i] || '#fff';
      list += `<li class="${r.player ? 'you' : ''}" style="color:${color}">${tag} ${r.name}${r.timeMs != null ? ' — ' + fmt(r.timeMs) : ''}${r.player ? ' (You!)' : ''}</li>`;
    });
    this.panelEl.innerHTML = `<h1>🏁 Race Complete!</h1><h2>${results[0].player ? 'You won the Cup! 🏆' : 'Great race!'}</h2><ul class="results">${list}</ul><button class="on">▶ Race Again</button><button class="menu">🏠 Menu</button>`;
    this.overlayEl.classList.remove('hidden');
    (this.panelEl.querySelector('.on') as HTMLElement).onclick = () => this.onRestart && this.onRestart();
    (this.panelEl.querySelector('.menu') as HTMLElement).onclick = () => this.onQuit && this.onQuit();
  }
}
