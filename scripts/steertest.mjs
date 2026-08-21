import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage();
await p.goto('http://127.0.0.1:5173/',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>window.__game.startRace());
await new Promise(r=>setTimeout(r,4500)); // countdown done, kart moving
const yaw0=await p.evaluate(()=>window.__game.player.yaw);
const pos0=await p.evaluate(()=>window.__game.player.pos.toArray());
await p.keyboard.down('ArrowRight');
await new Promise(r=>setTimeout(r,900));
await p.keyboard.up('ArrowRight');
const yaw1=await p.evaluate(()=>window.__game.player.yaw);
const pos1=await p.evaluate(()=>window.__game.player.pos.toArray());
console.log('RIGHT: yaw0='+yaw0.toFixed(3)+' yaw1='+yaw1.toFixed(3)+' dYaw='+(yaw1-yaw0).toFixed(3));
console.log('pos0='+pos0.map(v=>v.toFixed(1))+' pos1='+pos1.map(v=>v.toFixed(1)));
await b.close();
