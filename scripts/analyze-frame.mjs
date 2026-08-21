// Objective frame analyzer for the visual-QA pass. Decodes a PNG and reports
// metrics that catch blank/black/crash renders, broken materials, and gross
// framing problems that a blind reviewer would flag.
import { PNG } from 'pngjs';
import { readFileSync } from 'fs';

const path = process.argv[2];
if (!path) { console.error('usage: node analyze-frame.js <file.png>'); process.exit(1); }

const png = PNG.sync.read(readFileSync(path));
const { width, height, data } = png;
const n = width * height;
let minL = 255, maxL = 0, sumL = 0, black = 0, white = 0;
let sumSat = 0, sumPixels = 0;
const hist = { R: 0, G: 0, B: 0, Y: 0, Cy: 0, Mg: 0, O: 0, W: 0, K: 0, Grey: 0 };
const byRowVar = [];
let edges = 0;

function classify(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (r + g + b) / 3;
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  if (l < 24) return 'K';
  if (l > 230) return 'W';
  if (sat < 0.12) return 'Grey';
  if (r > 140 && g > 120 && b < 120 && r - b > 40) return 'Y';
  if (r > 140 && g < 130 && b < 140 && r - g > 40) return 'R';
  if (g > 130 && b > 120 && r < 130) return 'Cy';
  if (b > 140 && r < 130 && g < 130) return 'B';
  if (r > 150 && g > 110 && b < 120 && r > b + 50) return 'O';
  return 'Grey';
}

for (let i = 0; i < n; i++) {
  const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
  const l = (r + g + b) / 3;
  sumL += l;
  if (l < minL) minL = l;
  if (l > maxL) maxL = l;
  if (l < 10) black++;
  if (l > 245) white++;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  sumSat += sat;
  if (sat > 0.18) sumPixels++;
  hist[classify(r, g, b)]++;
}

// crude vertical gradient check (blank/top-half = suspicious)
const half = Math.floor(n / 2);
let topL = 0, botL = 0;
for (let i = 0; i < half; i++) topL += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
for (let i = half; i < n; i++) botL += (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 3;
topL /= half; botL /= (n - half);

const report = {
  file: path,
  size: `${width}x${height}`,
  brightness: { mean: +(sumL / n).toFixed(1), min: +minL.toFixed(0), max: +maxL.toFixed(0) },
  blackPct: +((black / n) * 100).toFixed(2),
  whitePct: +((white / n) * 100).toFixed(2),
  meanSat: +(sumSat / n).toFixed(3),
  saturatedPct: +((sumPixels / n) * 100).toFixed(1),
  topHalfL: +topL.toFixed(1),
  bottomHalfL: +botL.toFixed(1),
  palette: {
    red: +((hist.R / n) * 100).toFixed(1),
    green: +((hist.G / n) * 100).toFixed(1),
    blue: +((hist.B / n) * 100).toFixed(1),
    yellow: +((hist.Y / n) * 100).toFixed(1),
    cyan: +((hist.Cy / n) * 100).toFixed(1),
    orange: +((hist.O / n) * 100).toFixed(1),
    white: +((hist.W / n) * 100).toFixed(1),
    black: +((hist.K / n) * 100).toFixed(1),
    grey: +((hist.Grey / n) * 100).toFixed(1),
  },
};

console.log(JSON.stringify(report, null, 2));
