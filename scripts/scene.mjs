import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox','--disable-gpu','--enable-unsafe-swiftshader','--use-angle=swiftshader'] });
const page = await browser.newPage();
await page.goto('http://127.0.0.1:5173/?auto=1', { waitUntil: 'load', timeout: 30000 });
await new Promise((r) => setTimeout(r, 12000));
const info = await page.evaluate(() => {
  const g = window.__game;
  if (!g) return { err: 'no game' };
  const meshes = [];
  g.scene.traverse((o) => { if (o.isMesh) meshes.push({ name: o.name || o.geometry.type, mat: o.material && o.material.type, visible: o.visible, pos: o.position.toArray().map((v)=>Math.round(v)) }); });
  const road = meshes.filter((m) => m.mat && m.mat.includes('Standard') && m.pos[1] < 1).slice(0, 5);
  const raycaster = new (window.THREE ? window.THREE.Raycaster : null)();
  let centerHit = null;
  if (raycaster) {
    const ndc = new (window.THREE.Vector3)(0, -0.2, 0.5); // lower-center of screen
    raycaster.setFromCamera(ndc, g.camera);
    const hits = raycaster.intersectObjects(g.scene.children, true);
    if (hits.length) centerHit = { mat: hits[0].object.material && hits[0].object.material.type, name: hits[0].object.name || hits[0].object.geometry.type };
  }
  return {
    meshCount: meshes.length,
    materialTypes: [...new Set(meshes.map((m) => m.mat))],
    lowStandard: road,
    playerLat: Math.round(g.track.worldToTrack(g.player.pos, g.player.trackHint).lat),
    playerOnRoad: g.player.onRoad,
    centerHit,
    rendererInfo: { calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles },
  };
});
console.log(JSON.stringify(info, null, 2));
await browser.close();
