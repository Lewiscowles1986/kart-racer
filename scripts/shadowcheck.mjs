import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage();
await p.goto('http://127.0.0.1:5173/?auto=1',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,12000));
const r=await p.evaluate(()=>{
  const g=window.__game;
  let cast=0,recv=0,std=0,phy=0;
  g.scene.traverse(o=>{if(o.isMesh){if(o.castShadow)cast++;if(o.receiveShadow)recv++;const t=o.material&&o.material.type;if(t==='MeshStandardMaterial')std++;if(t==='MeshPhysicalMaterial')phy++;}});
  return {castShadowMeshes:cast,receiveShadowMeshes:recv,standard:std,physical:phy,env:!!g.scene.environment,shadowPasses:g.renderer.info.shadows??null,hasSun:!!g.sun};
});
console.log(JSON.stringify(r,null,2));
await b.close();
