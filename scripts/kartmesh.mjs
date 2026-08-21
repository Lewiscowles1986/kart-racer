import puppeteer from 'puppeteer-core';
const CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const b=await puppeteer.launch({executablePath:CHROME,headless:'new',args:['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader']});
const p=await b.newPage(); await p.setViewport({width:1280,height:720});
await p.goto('http://127.0.0.1:5173/?auto=1',{waitUntil:'load',timeout:30000});
await new Promise(r=>setTimeout(r,12000));
const info=await p.evaluate(()=>{
  const g=window.__game, T=window.THREE;
  const k=g.player;
  const root=k.visual?.root || k.mesh;
  if(!root) return {err:'no root'};
  const meshes=[];
  root.traverse(o=>{if(o.isMesh)meshes.push({name:o.name||o.geometry.type,visible:o.visible,mat:o.material&&o.material.type,worldPos:o.getWorldPosition(new T.Vector3()).toArray().map(v=>Math.round(v)),scale:o.scale.toArray().map(v=>+v.toFixed(2))});});
  const box=new T.Box3().setFromObject(root);
  return {rootVisible:root.visible, rootPos:root.position.toArray().map(v=>Math.round(v)), worldPos:root.getWorldPosition(new T.Vector3()).toArray().map(v=>Math.round(v)), meshCount:meshes.length, meshes:meshes.slice(0,6), bboxMin:box.min.toArray().map(v=>Math.round(v)), bboxMax:box.max.toArray().map(v=>Math.round(v)), kartPos:k.pos.toArray().map(v=>Math.round(v))};
});
console.log(JSON.stringify(info,null,2));
await b.close();
