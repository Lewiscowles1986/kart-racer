import * as THREE from 'three';
import { minimapSamples } from './minimap';
import { TRACK_POINTS } from '../config';
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
  standings?: { name: string; isPlayer: boolean }[]; // live P1..P8 (M2 J-19)
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
  _ranksKey = '';
  _cycleIcon = '';
  kartDots: KartDot[] = [];
  playerPos: THREE.Vector3 | undefined;
  trackPoints: [number, number][] = [];
  muted = false;

  onTouch?: (act: TouchAction, down: boolean) => void;
  onPause?: () => void;
  onMute?: () => void;
  onStart?: () => void;
  onRestart?: () => void;
  onResume?: () => void;
  onQuit?: () => void;
  onSelectCharacter?: (i: number) => void;
  onSelectMap?: (i: number) => void;

  // menu data (set by Game before showing the menu)
  characters: { name: string; color: string; style: string; glyph: string }[] = [];
  maps: { id: string; name: string; desc: string; color: [string, string]; points: [number, number][] }[] = [];
  selectedCharacter = 0;
  selectedMap = 0;

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
        <div class="ranks"></div>
        <div class="cam-chip">Cam: <span class="cam-name">Chase</span></div>
        <div class="hud-buttons">
          <button class="hudbtn mute" aria-label="Toggle sound" aria-pressed="false">🔊</button>
          <button class="hudbtn pause" aria-label="Pause or resume">⏸</button>
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
      <div class="countdown" role="status" aria-live="polite"></div>
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
      .cam-chip{margin-left:auto;font-size:13px;font-weight:700;padding:5px 11px;border-radius:999px;background:rgba(15,23,42,.45);border:1px solid rgba(255,255,255,.18);color:#ffe9b0;letter-spacing:.5px}
      .hud-bottom{position:absolute;bottom:16px;left:18px;right:18px;display:flex;align-items:flex-end;justify-content:space-between}
      .pos-badge{background:rgba(20,26,46,.72);color:#fff;border-radius:14px;padding:8px 16px;font-size:30px;font-weight:800;backdrop-filter:blur(4px)}
      .timer{background:rgba(20,26,46,.72);color:#ffe08a;border-radius:12px;padding:8px 18px;font-size:26px;font-weight:700;font-variant-numeric:tabular-nums}
      .lap{background:rgba(20,26,46,.72);color:#fff;border-radius:12px;padding:8px 14px;font-size:20px;font-weight:700}
      .hud-buttons{margin-left:auto;display:flex;gap:8px}
      .ranks{display:flex;flex-direction:column;gap:2px;margin-left:auto;padding:6px 10px;border-radius:12px;background:rgba(20,26,46,.55);font-size:12px;font-weight:700;min-width:86px}
      .ranks .row{display:flex;justify-content:space-between;gap:8px;color:#cbd5e1;line-height:1.35}
      .ranks .row.me{color:#ffe08a;text-shadow:0 0 6px rgba(255,200,60,.35)}
      .ranks .row .pp{font-variant-numeric:tabular-nums;}
      .hudbtn{width:46px;height:46px;border-radius:12px;border:0;background:rgba(20,26,46,.72);color:#fff;font-size:22px;cursor:pointer;backdrop-filter:blur(4px)}
      .hudbtn:hover{background:rgba(40,52,88,.85)}
      .hudbtn.muted{opacity:.5}
      .item-box{width:64px;height:64px;border-radius:12px;background:rgba(20,26,46,.75);display:flex;align-items:center;justify-content:center;font-size:36px;box-shadow:0 0 0 2px #ffd23f;border:3px solid rgba(255,255,255,.25)}
      .minimap{width:140px;height:140px;border-radius:12px;background:rgba(30,70,30,.55);border:3px solid rgba(255,255,255,.4)}
      .controls{position:absolute;right:16px;bottom:90px;display:none;gap:10px;pointer-events:auto;opacity:.85}
      .controls .btn{width:58px;height:58px;border-radius:50%;background:rgba(255,255,255,.25);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:800;border:2px solid rgba(255,255,255,.5);touch-action:none}
      .countdown{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;font-weight:900;color:#fff;text-shadow:0 6px 20px rgba(0,0,0,.6)}
      .center-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 38%,rgba(255,190,120,.20),transparent 58%),radial-gradient(ellipse at 50% 50%,rgba(10,16,34,.58),rgba(6,10,22,.66))}
      .center-overlay.hidden{display:none}
      .panel{display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(46,74,148,.72),rgba(18,32,66,.82));border-radius:22px;padding:20px 26px 18px;text-align:center;color:#fff;box-shadow:0 24px 70px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.18);pointer-events:auto;max-width:600px;max-height:94vh;overflow:hidden;backdrop-filter:blur(16px) saturate(1.2);border:1px solid rgba(255,255,255,.16)}
      .menu{display:flex;flex-direction:column;flex:1;min-height:0}
      .menu-main{overflow-y:auto;flex:1 1 auto;min-height:0;padding-right:4px;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.3) transparent}
      .menu-footer{flex:0 0 auto;margin-top:14px}
      .menu-brand{display:flex;align-items:center;justify-content:center;gap:10px}
      .brand-badge{width:46px;height:46px;border-radius:14px;background:radial-gradient(circle at 30% 25%,#ffe9a8,#ffd23f 55%,#e09f1f);display:flex;align-items:center;justify-content:center;font-size:26px;box-shadow:0 6px 16px rgba(0,0,0,.35),inset 0 -4px 0 rgba(0,0,0,.15)}
      .menu-title{margin:0;font-size:34px;letter-spacing:1px;text-shadow:0 3px 0 rgba(0,0,0,.3)}
      .menu-sub{margin:6px 0 10px;font-size:15px;font-weight:600;opacity:.9}
      .menu-section{margin:8px 0 4px}
      .menu-section h3{margin:0 0 8px;font-size:15px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#ffd23f}
      .racer-grid,.track-grid{display:grid;gap:8px;justify-content:center}
      .racer-grid{grid-template-columns:repeat(4,minmax(58px,70px))}
      .track-grid{display:flex;flex-direction:column;gap:8px;width:150px}
      .pick-row{display:flex;align-items:center;justify-content:center;gap:20px}
      .racer,.track{display:flex;flex-direction:column;align-items:center;gap:4px;padding:8px 4px;border-radius:13px;border:1px solid rgba(255,255,255,.26);background:linear-gradient(180deg,rgba(255,255,255,.20),rgba(255,255,255,.07));color:#fff;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -2px 4px rgba(0,0,0,.12);transition:transform .08s,border-color .12s,background .12s,box-shadow .12s}
      .racer:hover,.track:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.5);background:rgba(255,255,255,.13)}
      .racer.sel,.track.sel{border-color:#ffd23f;background:rgba(255,210,63,.14);box-shadow:0 0 0 2px #ffd23f,0 4px 14px rgba(255,210,63,.25)}
      .racer-token{width:42px;height:42px;border-radius:50%;background:var(--c);display:flex;align-items:center;justify-content:center;box-shadow:inset 0 -4px 8px rgba(0,0,0,.28),inset 0 3px 6px rgba(255,255,255,.28),0 3px 8px rgba(0,0,0,.35)}
      .racer-glyph{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.94);display:flex;align-items:center;justify-content:center;font-size:25px;line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.35)}
      .racer-name{font-size:12px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.5)}
      .racer-preview{width:118px;height:118px;display:block;background:radial-gradient(circle at 50% 38%,rgba(70,100,170,.45),rgba(16,24,46,.9) 78%);border-radius:14px;border:1px solid rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),inset 0 14px 28px rgba(90,130,220,.14),0 6px 18px rgba(0,0,0,.4);flex:0 0 auto}
      .track-thumb{width:100%;height:34px;border-radius:9px;background:linear-gradient(135deg,var(--c1),var(--c2));box-shadow:inset 0 0 0 2px rgba(255,255,255,.22),0 2px 6px rgba(0,0,0,.3)}
      .track-name{font-size:12px;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.5)}
      .track-preview{width:150px;min-height:150px;display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;background:radial-gradient(circle at 50% 30%,rgba(60,90,160,.32),rgba(8,14,30,.55));border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:10px 8px;flex:0 0 auto}
      .tp-canvas{width:118px;height:118px;border-radius:12px;flex:0 0 auto;background:radial-gradient(circle at 50% 38%,rgba(60,90,160,.55),rgba(14,22,44,.9) 80%);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08),0 4px 14px rgba(0,0,0,.3)}
      .tp-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;justify-content:center}
      .tp-name{margin:0;font-size:15px;font-weight:800;color:#ffd23f}
      .tp-desc{margin:0;font-size:11px;font-weight:600;line-height:1.3;color:#dfe6ee;opacity:.92}
      .empty{opacity:.6;font-size:14px}
      .panel .start{margin-top:12px;width:100%;font-size:21px;font-weight:800;padding:11px 40px;border:0;border-radius:15px;cursor:pointer;color:#16305f;background:linear-gradient(180deg,#ffe08a,#ffd23f 60%,#f4b400);box-shadow:0 6px 0 #b87700,0 10px 20px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.6);transition:transform .08s,box-shadow .08s}
      .panel .start:hover{filter:brightness(1.05)}
      .panel .start:active{transform:translateY(5px);box-shadow:0 2px 0 #b87700,0 6px 14px rgba(0,0,0,.3)}
      .controls-chip{margin:10px auto 0;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap;justify-content:center;font-size:11px;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:7px 12px;color:#dfe6ee}
      .controls-chip .ctl{display:flex;flex-direction:column;align-items:center;gap:3px}
      .controls-chip .ctl kbd{background:#2a3550;border-radius:6px;padding:3px 8px;min-width:24px;text-align:center;font-size:11px;font-weight:800;color:#fff;box-shadow:0 2px 0 rgba(0,0,0,.4);border:1px solid rgba(255,255,255,.12);font-family:inherit}
      .controls-chip .ctl em{font-style:normal;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;opacity:.72;color:#c7d2e0}
      .tip{margin:8px auto 0;max-width:440px;font-size:12px;font-weight:600;color:#ffe08a;background:rgba(255,210,63,.12);border:1px solid rgba(255,210,63,.22);border-radius:10px;padding:6px 12px;line-height:1.4}
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
    const racers = this.characters.length
      ? this.characters.map((c, i) => `
          <button class="racer ${i === this.selectedCharacter ? 'sel' : ''}" data-i="${i}" style="--c:${c.color}">
            <span class="racer-token"><span class="racer-glyph">${c.glyph}</span></span>
            <span class="racer-name">${c.name}</span>
          </button>`).join('')
      : '<p class="empty">No racers</p>';
    const tracks = this.maps.length
      ? this.maps.map((m, i) => `
          <button class="track ${i === this.selectedMap ? 'sel' : ''}" data-i="${i}" style="--c1:${m.color[0]};--c2:${m.color[1]}">
            <span class="track-thumb"></span><span class="track-name">${m.name}</span>
          </button>`).join('')
      : '<p class="empty">No tracks</p>';
    this.panelEl.innerHTML = `
      <div class="menu">
        <div class="menu-main">
          <div class="menu-brand">
            <span class="brand-badge">🏎️</span>
            <h1 class="menu-title">Kart Kingdom</h1>
          </div>
          <p class="menu-sub">Pick your racer, pick your track, and go!</p>
          <div class="menu-section">
            <h3>🚩 Choose your racer</h3>
            <div class="pick-row">
              <div class="racer-grid">${racers}</div>
              <canvas class="racer-preview" width="140" height="140"></canvas>
            </div>
          </div>
          <div class="menu-section">
            <h3>🏁 Choose your track</h3>
            <div class="pick-row">
              <div class="track-grid">${tracks}</div>
              <div class="track-preview">
                <canvas class="tp-canvas" width="150" height="150"></canvas>
                <div class="tp-info">
                  <h4 class="tp-name"></h4>
                  <p class="tp-desc"></p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="menu-footer">
          <button class="start">▶︎ Start Race</button>
          <div class="controls-chip">${touch
            ? `<span class="ctl"><kbd>▲</kbd><em>gas</em></span><span class="ctl"><kbd>◀</kbd><kbd>▶</kbd><em>steer</em></span><span class="ctl"><kbd>ITEM</kbd><em>item</em></span><span class="ctl"><kbd>▼</kbd><em>brake</em></span>`
            : `<span class="ctl"><kbd>W</kbd><em>gas</em></span><span class="ctl"><kbd>A</kbd><kbd>D</kbd><em>steer</em></span><span class="ctl"><kbd>Space</kbd><em>item</em></span><span class="ctl"><kbd>S</kbd><em>brake</em></span>`}</div>
          <p class="tip">💡 Hold brake while turning fast to charge a mini-turbo boost!</p>
        </div>
      </div>
    `;
    this.overlayEl.classList.remove('hidden');
    this.drawTrackPreview();
    (this.panelEl.querySelector('.start') as HTMLElement).onclick = () => this.onStart && this.onStart();
    this.panelEl.querySelectorAll('.racer').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number((b as HTMLElement).dataset.i);
        this.selectedCharacter = i;
        this.panelEl.querySelectorAll('.racer').forEach((x) => x.classList.toggle('sel', x === b));
        this.onSelectCharacter && this.onSelectCharacter(i);
      });
    });
    this.panelEl.querySelectorAll('.track').forEach((b) => {
      b.addEventListener('click', () => {
        const i = Number((b as HTMLElement).dataset.i);
        this.selectedMap = i;
        this.panelEl.querySelectorAll('.track').forEach((x) => x.classList.toggle('sel', x === b));
        this.drawTrackPreview();
        this.onSelectMap && this.onSelectMap(i);
      });
    });
  }

  hideOverlay() { this.overlayEl.classList.add('hidden'); }

  setMenuData(characters: { name: string; color: string; style: string; glyph: string }[], maps: { id: string; name: string; desc: string; color: [string, string]; points: [number, number][] }[]) {
    this.characters = characters;
    this.maps = maps;
  }

  getRacerPreviewCanvas(): HTMLCanvasElement | null {
    return this.panelEl.querySelector('.racer-preview') as HTMLCanvasElement | null;
  }

  // Race HUD (position/timer/minimap/touch controls) is only relevant while a
  // race is live. Keeping it hidden in MENU decouples the menu from the race UI.
  showRaceHud() {
    (this.el.querySelector('.hud-top') as HTMLElement).style.display = 'flex';
    (this.el.querySelector('.hud-bottom') as HTMLElement).style.display = 'flex';
    if ('ontouchstart' in window) this.controls.style.display = 'flex';
  }
  hideRaceHud() {
    (this.el.querySelector('.hud-top') as HTMLElement).style.display = 'none';
    (this.el.querySelector('.hud-bottom') as HTMLElement).style.display = 'none';
    this.controls.style.display = 'none';
  }

  setCountdown(text: string) {
    this.countdownEl.textContent = text;
    this.countdownEl.style.opacity = text ? '1' : '0';
  }

  showCameraMode(name: string) {
    const n = this.el.querySelector('.cam-name');
    if (n) n.textContent = name;
  }

  update({ position, lap, timeMs, item, rouletteT = 0, muted = false, standings }: HudUpdate) {
    this.posEl.textContent = POS[position - 1] || `${position}th`;
    this.lapEl.textContent = `Lap ${Math.min(lap, 3)}/3`;
    const s = Math.floor(timeMs / 1000);
    const cs = Math.floor((timeMs % 1000) / 10);
    this.timerEl.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
    // M2 (J-19): live rank ladder, rebuilt only when the order changes
    if (standings) {
      const key = standings.map((r) => r.name).join('|');
      if (key !== this._ranksKey) {
        this._ranksKey = key;
        const ranksEl = this.el.querySelector('.ranks') as HTMLElement;
        if (ranksEl) {
          ranksEl.innerHTML = standings
            .map((st, i) => `<div class="row${st.isPlayer ? ' me' : ''}"><span class="pp">${i + 1}.</span><span>${st.name}</span></div>`)
            .join('');
        }
      }
    }
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
    if (this.muteBtn) {
      this.muteBtn.textContent = muted ? '🔇' : '🔊';
      this.muteBtn.setAttribute('aria-pressed', String(muted)); // a11y (J-40)
    }
    this.muteBtn && this.muteBtn.classList.toggle('muted', muted);
  }

  drawMinimap() {
    const ctx = this.mctx || this.map.getContext('2d')!;
    this.mctx = ctx;
    const W = this.map.width, H = this.map.height, pad = 8;
    const samples = minimapSamples(this.trackPoints.length ? this.trackPoints : TRACK_POINTS);
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
    // AI + player dots (M2-close: bigger + outlined so 8 racers stay readable)
    for (const d of this.kartDots) {
      if (d.x === undefined) continue;
      ctx.fillStyle = d.isPlayer ? '#ffd23f' : d.color || '#fff';
      const r = d.isPlayer ? 5.5 : 4;
      ctx.beginPath(); ctx.arc(sx(d.x), sz(d.z!), r, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(10,14,24,0.9)'; ctx.lineWidth = 1.2; ctx.stroke();
    }
  }

  setPlayerPos(v: THREE.Vector3) { this.playerPos = v; }
  setKartDots(dots: KartDot[]) { this.kartDots = dots; }
  setTrackPoints(points: [number, number][]) { this.trackPoints = points; }

  // Draws the currently-selected track's loop + name/description on the menu so
  // picking a map gives immediate visual feedback that the track has changed.
  drawTrackPreview() {
    const m = this.maps[this.selectedMap];
    if (!m) return;
    const nameEl = this.panelEl.querySelector('.tp-name') as HTMLElement | null;
    const descEl = this.panelEl.querySelector('.tp-desc') as HTMLElement | null;
    if (nameEl) nameEl.textContent = m.name;
    if (descEl) descEl.textContent = m.desc;
    const cv = this.panelEl.querySelector('.tp-canvas') as HTMLCanvasElement | null;
    if (!cv) return;
    const ctx = cv.getContext('2d')!;
    const W = cv.width, H = cv.height, pad = 16;
    ctx.clearRect(0, 0, W, H);
    // rounded backing disc
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, (W - 2 * pad) / 2, 0, 7);
    ctx.fillStyle = 'rgba(10,16,30,.55)';
    ctx.fill();
    const pts = m.points;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const sx = (x: number) => pad + (x - minX) / (maxX - minX || 1) * (W - 2 * pad);
    const sz = (z: number) => pad + (z - minZ) / (maxZ - minZ || 1) * (H - 2 * pad);
    // shadowed loop
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 11; ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath();
    pts.forEach(([x, z], i) => { i ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z)); });
    ctx.closePath(); ctx.stroke();
    ctx.lineWidth = 5; ctx.strokeStyle = m.color[0];
    ctx.beginPath();
    pts.forEach(([x, z], i) => { i ? ctx.lineTo(sx(x), sz(z)) : ctx.moveTo(sx(x), sz(z)); });
    ctx.closePath(); ctx.stroke();
    // start marker
    const [sx0, sz0] = [sx(pts[0][0]), sz(pts[0][1])];
    ctx.beginPath(); ctx.arc(sx0, sz0, 5, 0, 7); ctx.fillStyle = m.color[1]; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  }

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
