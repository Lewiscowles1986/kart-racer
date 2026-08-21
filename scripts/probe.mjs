import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: W, height: H, data } = png;
const cols = 8, rows = 6;
let out = '';
for (let ry = 0; ry < rows; ry++) {
  for (let rx = 0; rx < cols; rx++) {
    let r = 0, g = 0, b = 0, c = 0;
    for (let y = ry * (H / rows); y < (ry + 1) * (H / rows); y += 2) {
      for (let x = rx * (W / cols); x < (rx + 1) * (W / cols); x += 2) {
        const i = (Math.floor(y) * W + Math.floor(x)) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; c++;
      }
    }
    r = Math.round(r / c); g = Math.round(g / c); b = Math.round(b / c);
    out += `(${r},${g},${b}) `.padEnd(18);
  }
  out += '\n';
}
console.log(out);
