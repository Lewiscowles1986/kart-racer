import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage();
await p.goto('http://127.0.0.1:5173/?auto=1',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,8000));
const r=await p.evaluate(()=>{
  const g=window.__game;
  return g.karts.map(k=>{
    const d=k.visual.driver;
    let meshes=0, geoms=[];
    d.traverse(o=>{if(o.isMesh){meshes++;geoms.push(o.geometry.type.replace('Geometry',''));}});
    return {name:k.name, driverMeshes:meshes, geoms:geoms.join(',')};
  });
});
console.log(JSON.stringify(r,null,1));
await b.close();
