import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage();
await p.goto('http://127.0.0.1:5173/?auto=1',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,10000));
const r=await p.evaluate(()=>{
  const g=window.__game, T=window.THREE;
  const w=g.player.visual.wheels[0];
  const tire=w.children[0];
  const axis=new T.Vector3(0,1,0).applyQuaternion(tire.getWorldQuaternion(new T.Quaternion()));
  return {wheelAxis:axis.toArray().map(v=>+v.toFixed(2)), kartYaw:+g.player.yaw.toFixed(2)};
});
console.log(JSON.stringify(r));
await b.close();
