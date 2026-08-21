import { PNG } from 'pngjs';
import { readFileSync } from 'fs';
const png=PNG.sync.read(readFileSync(process.argv[2]));
const {width:W,height:H,data}=png;
const x=parseInt(process.argv[3]), y=parseInt(process.argv[4]);
const i=(y*W+x)*4;
console.log(`pixel(${x},${y}) = (${data[i]},${data[i+1]},${data[i+2]})`);
// scan a 40x40 box around it
let min=255,max=0;
for(let dy=-20;dy<=20;dy++)for(let dx=-20;dx<=20;dx++){
  const j=((y+dy)*W+(x+dx))*4;
  const l=(data[j]+data[j+1]+data[j+2])/3;
  if(l<min)min=l; if(l>max)max=l;
}
console.log(`box 40x40 luma range: ${min.toFixed(0)}..${max.toFixed(0)}`);
