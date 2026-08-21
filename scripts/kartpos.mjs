import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
await p.goto('http://127.0.0.1:5173/?auto=1',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,12000));
const info=await p.evaluate(()=>{
  const g=window.__game, T=window.THREE;
  const k=g.player;
  const v=new T.Vector3(k.pos.x,k.pos.y+0.6,k.pos.z).project(g.camera);
  const sx=(v.x*0.5+0.5)*1280, sy=(-v.y*0.5+0.5)*720;
  const camPos=g.camera.position.clone();
  const dist=camPos.distanceTo(k.pos);
  return {kartScreen:[Math.round(sx),Math.round(sy)], inView:v.z<1&&v.z>-1&&sx>0&&sx<1280&&sy>0&&sy<720, camPos:camPos.toArray().map(x=>Math.round(x)), kartPos:k.pos.toArray().map(x=>Math.round(x)), dist:Math.round(dist), camFov:g.camera.fov, state:g.state};
});
console.log(JSON.stringify(info,null,2));
await p.screenshot({path:'shots/kartcheck.png'});
await b.close();
