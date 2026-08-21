// Fully synthesized WebAudio: engine hum, item jingles, pickups, countdown,
// and a light, cheerful background loop. No audio assets needed.
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.musicTimer = null;
    this._bar = 0;
    this._musicOn = false;
  }

  // Must be called from a user gesture (start button).
  init() {
    if (this.enabled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    this.enabled = true;
    this._startEngine();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  _tone(freq, dur, type = 'sine', vol = 0.3, glideTo = null, when = 0) {
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  }

  _startEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 60;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 90; // a partial for a fuller engine hum
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = 500;
    this.engineOsc.connect(filter);
    const filter2 = this.ctx.createBiquadFilter();
    filter2.type = 'lowpass'; filter2.frequency.value = 300;
    this.engineOsc2.connect(filter2);
    filter.connect(this.engineGain); filter2.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start(); this.engineOsc2.start();
  }

  // Called each frame with current speed ratio (0..~2) and whether boosting.
  engine(speedRatio, boost = false) {
    if (!this.enabled) return;
    const base = 55 + speedRatio * 240 + (boost ? 60 : 0);
    this.engineOsc.frequency.linearRampToValueAtTime(base, this.ctx.currentTime + 0.08);
    this.engineOsc2.frequency.linearRampToValueAtTime(base * 1.5, this.ctx.currentTime + 0.08);
    this.engineGain.gain.linearRampToValueAtTime(0.05 + speedRatio * 0.045, this.ctx.currentTime + 0.1);
  }

  pickup() { this._tone(660, 0.09, 'triangle', 0.25, 990); this._tone(990, 0.16, 'triangle', 0.2, 1320, 0.07); }
  boost() { this._tone(200, 0.5, 'sawtooth', 0.2, 900); this._tone(400, 0.4, 'square', 0.12, 1600, 0.05); }
  bananaHit() { this._tone(140, 0.35, 'square', 0.28, 60); this._tone(90, 0.3, 'square', 0.18, 50, 0.05); }
  slip() { this._tone(700, 0.4, 'sine', 0.18, 240); }
  hit() { this._tone(180, 0.25, 'square', 0.3, 80); }
  star() {
    for (let i = 0; i < 8; i++) this._tone(520 + i * 160, 0.16, 'triangle', 0.22, null, i * 0.12);
  }
  count(n) {
    if (n === 'GO') { this._tone(880, 0.6, 'triangle', 0.32); this._tone(1320, 0.5, 'triangle', 0.18, null, 0.05); return; }
    const f = { 3: 392, 2: 523.3, 1: 659.3 }[n] || 520;
    this._tone(f, 0.2, 'triangle', 0.3);
  }
  finalLap() { this._tone(880, 0.5, 'triangle', 0.28); this._tone(1108, 0.5, 'triangle', 0.22, null, 0.12); }
  lap() { this._tone(660, 0.12, 'triangle', 0.2); this._tone(990, 0.22, 'triangle', 0.2, null, 0.1); }
  finish() { for (let i = 0; i < 6; i++) this._tone(523 + i * 165, 0.22, 'triangle', 0.24, null, i * 0.16); }

  // Cheerful little chiptune loop (I-V-vi-IV in C, arpeggiated).
  startMusic() {
    if (!this.enabled || this.musicTimer) return;
    const chords = [[261.6, 329.6, 392, 523.3], [196, 246.9, 293.7, 392], [220, 261.6, 329.6, 440], [174.6, 220, 261.6, 349.2]];
    const beat = 0.28;
    const schedule = () => {
      const ch = chords[this._bar % chords.length];
      const t0 = this.ctx.currentTime + 0.05;
      for (let i = 0; i < 4; i++) this._tone(ch[i], beat * 0.95, 'triangle', 0.12, null, i * beat);
      this._bar++;
    };
    schedule();
    this.musicTimer = setInterval(schedule, beat * 4 * 1000);
  }
  stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; }
}
