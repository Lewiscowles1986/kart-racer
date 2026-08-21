import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
const png = PNG.sync.read(readFileSync(process.argv[2]));
const { width: w, height: h, data } = png;
// 6 rows x 8 cols grid, average color per cell
for (let ry = 0; ry < 6; ry++) {
  let line = '';
  for (let rx = 0; rx < 8; rx++) {
    const x0 = (rx * w) / 8, x1 = ((rx + 1) * w) / 8;
    const y0 = (ry * h) / 6, y1 = ((ry + 1) * h) / 6;
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
      const i = (y * w + x) * 4; r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    line += ` ${String(Math.round(r / n)).padStart(3)}/${String(Math.round(g / n)).padStart(3)}/${String(Math.round(b / n)).padStart(3)}`;
  }
  console.log('y' + ry + ':' + line);
}
