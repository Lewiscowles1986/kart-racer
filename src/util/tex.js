import * as THREE from 'three';

// Procedural canvas textures so the game looks crisp and cohesive with zero
// external art assets. Each function returns a CanvasTexture with repeat set.
// We use a seeded RNG so the look is deterministic.

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function canvasTexture(c, repeatX = 1, repeatY = 1, colorSpace = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  if (colorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

// Soft, cartoony asphalt with subtle noise, painted edge lines and occasional
// scuffs / oil stains — reads well at speed.
export function asphaltTexture(seed = 7, size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#5a5e66';
  g.fillRect(0, 0, size, size);

  // grain
  const grain = g.createImageData(size, size);
  for (let i = 0; i < grain.data.length; i += 4) {
    const n = (rnd() - 0.5) * 26;
    grain.data[i] = 0x5a + n;
    grain.data[i + 1] = 0x5e + n;
    grain.data[i + 2] = 0x66 + n;
    grain.data[i + 3] = 255;
  }
  g.putImageData(grain, 0, 0);

  // subtle darker aggregate splotches
  for (let i = 0; i < 90; i++) {
    g.fillStyle = `rgba(30,34,40,${0.04 + rnd() * 0.05})`;
    const x = rnd() * size, y = rnd() * size, r = 6 + rnd() * 40;
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  // lighter scuffs
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(120,124,132,${0.05 + rnd() * 0.06})`;
    g.lineWidth = 1 + rnd() * 2;
    g.beginPath();
    g.moveTo(rnd() * size, rnd() * size);
    g.lineTo(rnd() * size, rnd() * size);
    g.stroke();
  }
  // edge dashes (painted curbside line) at left/right edges
  g.fillStyle = '#d7d7d7';
  for (let y = 0; y < size; y += 40) {
    g.fillRect(0, y, 14, 22);
    g.fillRect(size - 14, y, 14, 22);
  }
  // center dashed divider
  g.fillStyle = '#d9d3c8';
  for (let y = 0; y < size; y += 64) {
    g.fillRect(size / 2 - 2.5, y, 5, 34);
  }
  return canvasTexture(c, 1, 1);
}

export function grassTexture(seed = 11, size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#67b64a';
  g.fillRect(0, 0, size, size);
  const base = g.createImageData(size, size);
  for (let i = 0; i < base.data.length; i += 4) {
    const n = (rnd() - 0.5) * 30;
    base.data[i] = 0x67 + n;
    base.data[i + 1] = 0xb6 + n;
    base.data[i + 2] = 0x4a + n * 0.6;
    base.data[i + 3] = 255;
  }
  g.putImageData(base, 0, 0);
  // blade streaks
  for (let i = 0; i < 2600; i++) {
    g.strokeStyle = rnd() > 0.5 ? 'rgba(40,120,30,0.18)' : 'rgba(150,230,120,0.20)';
    g.lineWidth = 1;
    g.beginPath();
    const x = rnd() * size, y = rnd() * size;
    g.moveTo(x, y);
    g.lineTo(x + (rnd() - 0.5) * 3, y + 5 + rnd() * 6);
    g.stroke();
  }
  // flower dots for cheer
  for (let i = 0; i < 60; i++) {
    const x = rnd() * size, y = rnd() * size, r = 1.5 + rnd() * 2;
    g.fillStyle = ['#fff','#ffe066','#ff9ff3','#7ee8fa'][i % 4];
    g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return canvasTexture(c, 6, 6);
}

export function dirtTexture(seed = 21, size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#a87a4b';
  g.fillRect(0, 0, size, size);
  const d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * 36;
    d.data[i] = 0xa8 + n; d.data[i + 1] = 0x7a + n; d.data[i + 2] = 0x4b + n;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  for (let i = 0; i < 200; i++) {
    g.fillStyle = `rgba(70,45,20,${0.06 + rnd() * 0.06})`;
    g.beginPath(); g.arc(rnd() * size, rnd() * size, 3 + rnd() * 14, 0, 7); g.fill();
  }
  return canvasTexture(c, 4, 4);
}

// Red-and-white checker kerb.
export function curbTexture(size = 64) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const sq = size / 4;
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 === 0 ? '#e63946' : '#f6f4f0';
      g.fillRect(x * sq, y * sq, sq, sq);
    }
  }
  return canvasTexture(c, 8, 1);
}

export function sandTexture(seed = 33, size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#e3cf9a';
  g.fillRect(0, 0, size, size);
  const d = g.createImageData(size, size);
  for (let i = 0; i < d.data.length; i += 4) {
    const n = (rnd() - 0.5) * 22;
    d.data[i] = 0xe3 + n; d.data[i + 1] = 0xcf + n; d.data[i + 2] = 0x9a + n;
    d.data[i + 3] = 255;
  }
  g.putImageData(d, 0, 0);
  return canvasTexture(c, 5, 5);
}

export function skyboxTexture(seed = 5, size = 512) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#2f6fd6');
  grad.addColorStop(0.55, '#6fb1e8');
  grad.addColorStop(0.78, '#cfe6f7');
  grad.addColorStop(1, '#eef6ff');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  // soft cartoon clouds
  for (let i = 0; i < 14; i++) {
    const cx = rnd() * size, cy = rnd() * size * 0.62 + size * 0.06;
    const r = 22 + rnd() * 42;
    const a = 0.35 + rnd() * 0.35;
    for (let p = 0; p < 6; p++) {
      g.fillStyle = `rgba(255,255,255,${a})`;
      g.beginPath();
      g.arc(cx + (rnd() - 0.5) * r * 1.6, cy + (rnd() - 0.5) * r * 0.5, r * (0.5 + rnd() * 0.6), 0, 7);
      g.fill();
    }
  }
  return canvasTexture(c, 1, 1);
}

// Item box texture — a glowing question-style box (original, non-trademarked).
export function itemBoxTexture(seed = 9, size = 256) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#d99000';
  g.fillRect(0, 0, size, size);
  // bolt rivets
  for (let x = 0; x < 4; x++) for (let y = 0; y < 4; y++) {
    g.fillStyle = '#a86a00';
    g.beginPath(); g.arc(24 + x * 69, 24 + y * 69, 7, 0, 7); g.fill();
  }
  // big "?"-ish star (original symbol, non-trademarked)
  g.fillStyle = '#ffe8a0';
  g.beginPath();
  const cx = size / 2, cy = size / 2, R = 66, r = 28;
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const px = cx + Math.cos(a) * rad, py = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath(); g.fill();
  g.strokeStyle = '#b8860b'; g.lineWidth = 8; g.stroke();
  return canvasTexture(c, 1, 1);
}

// Simple painted wood for fence/barrier/arch props.
export function woodTexture(seed = 4, size = 128) {
  const c = makeCanvas(size);
  const g = c.getContext('2d');
  const rnd = mulberry32(seed);
  g.fillStyle = '#8a5a33';
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    g.strokeStyle = `rgba(60,35,15,${0.06 + rnd() * 0.1})`;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(rnd() * size, 0); g.lineTo(rnd() * size, size); g.stroke();
  }
  return canvasTexture(c, 2, 1);
}
