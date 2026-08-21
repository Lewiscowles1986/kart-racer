import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: w, height: h, data } = png;
function rgb(x0, y0, x1, y1) {
  let r = 0, g = 0, b = 0, n = 0, satSum = 0, sd = 0;
  const Ls = [];
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * w + x) * 4; const R = data[i], G = data[i + 1], B = data[i + 2];
    r += R; g += G; b += B; n++;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
    const L = 0.2126 * R + 0.7152 * G + 0.0722 * B; Ls.push(L);
  }
  const avgL = Ls.reduce((a, b) => a + b, 0) / n;
  const v = Ls.reduce((a, b) => a + (b - avgL) * (b - avgL), 0) / n;
  return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)}) sat=${(satSum / n).toFixed(2)} lumVar=${Math.round(Math.sqrt(v))}`;
}
console.log('top sky        ', rgb(0, 0, w, 90));
console.log('upper mid      ', rgb(0, 90, w, 200));
console.log('horizon line   ', rgb(0, 260, w, 300));
console.log('center (road?) ', rgb(w * 0.25, 300, w * 0.75, 380));
console.log('lower road     ', rgb(w * 0.2, 420, w * 0.8, 520));
console.log('bottom ground  ', rgb(w * 0.15, 560, w * 0.85, 700));
// global saturation histogram
let bins = [0, 0, 0, 0, 0];
for (let i = 0; i < data.length; i += 4) {
  const R = data[i], G = data[i + 1], B = data[i + 2];
  const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
  const s = mx === 0 ? 0 : (mx - mn) / mx;
  bins[Math.min(4, (s * 5) | 0)]++;
}
const tot = w * h;
console.log('sat hist (0-0.2,0.2-0.4,...,0.8-1.0):', bins.map(b => ((b / tot) * 100).toFixed(1) + '%').join(' '));
// count edge-like detail: local luma differences
let edgeSum = 0, edgeN = 0;
for (let y = 2; y < h - 2; y += 4) for (let x = 2; x < w - 2; x += 4) {
  const i = (y * w + x) * 4;
  const L0 = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  const Lr = 0.2126 * data[(y * w + x + 4) * 4] + 0.7152 * data[(y * w + x + 4) * 4 + 1] + 0.0722 * data[(y * w + x + 4) * 4 + 2];
  const Ld = 0.2126 * data[((y + 4) * w + x) * 4] + 0.7152 * data[((y + 4) * w + x) * 4 + 1] + 0.0722 * data[((y + 4) * w + x) * 4 + 2];
  edgeSum += Math.abs(L0 - Lr) + Math.abs(L0 - Ld); edgeN += 2;
}
console.log('avg local luma diff (detail)', (edgeSum / edgeN).toFixed(2));
