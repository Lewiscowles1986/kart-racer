import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: W, height: H, data } = png;
const col = parseInt(process.argv[3] || (W / 2), 10);
let out = '';
for (let y = 0; y < H; y += 12) {
  const i = (y * W + col) * 4;
  out += `y=${String(y).padStart(3)} (${data[i]},${data[i+1]},${data[i+2]})\n`;
}
console.log(out);
