# 🏎️ Kart Kingdom

A joyful, child-safe 3D kart racer built with **Three.js** — tuned to feel like the
best of the genre (Mario Kart / Crash Team Racing) without looking or sounding like
any of them. Cartoony-but-glossy PBR visuals, synthesized audio, and snappy arcade
physics. No external art, models, or audio assets — everything is generated
procedurally so it loads fast and looks cohesive.

## Play

```bash
npm install          # (uses a local npm cache to avoid permission issues)
npm run dev          # then open http://localhost:5173
```

**Controls (keyboard):**
- **W / ↑** — accelerate
- **A / D or ← / →** — steer
- **Space** — use item
- **S / ↓** — brake; hold **W + S** at speed to **drift** (builds a mini-turbo)
- **P / Esc** — pause · **M** — mute · **Q** — quit to menu
- On touch devices, on-screen buttons appear (with a brake button for drifting).

## What's in it

- **3-lap races** vs 7 friendly rubber-banded AI racers across a 3D track with
  rolling hills, kerbs, fences, trees and a start arch.
- **Items** from glowing boxes (with a roulette reveal): 🍌 **banana** (dropped,
  makes a kart spin), 🍄 **mushroom** (speed boost), ⭐ **invincible star** (shield +
  boost). No tradmarkable names or art.
- **Arcade kart physics**: grip-heavy steering, kart-style drift with a charged
  mini-turbo, off-road slowdown on grass, banana spin-outs, kart-to-kart bumps.
- **Polish**: PBR/clearcoat materials with environment reflections, soft shadows,
  ACES tone mapping, hemisphere + key-sun + rim lighting, particles (boost flames,
  drift dust, spin stars, pickup rings), procedural textures, animated character
  drivers, synthesized engine/item/music audio, minimap with racer dots, item
  roulette, HUD, countdown, pause/mute, finish results.
- **Accessibility & safety**: no flashing/strobing, clear large controls, no mature
  content, `prefers-reduced-motion`-friendly, mute toggle.

## Architecture

```
src/
  main.js            bootstrap + window.THREE for tooling
  config.js          every tuning constant in one place
  game/
    Game.js          renderer, scene, state machine, collisions, ranking, camera
    Kart.js          arcade physics (steer/accel/drift/boost/spin)
    KartVisual.js    procedural kart + driver mesh
    AI.js            rubber-banded racing AI
    Items.js         item boxes, roulette, banana/mushroom/star
    Effects.js       pooled GPU particles + rings
    HUD.js           DOM overlay (position/lap/timer/minimap/menus)
    Input.js         keyboard + touch
    Audio.js         fully synthesized WebAudio
    minimap.js       minimap polyline
  track/track.js     Catmull-Rom loop, terrain, ribbon road, props
  util/tex.js        procedural canvas textures
scripts/
  qa.mjs            headless QA (puppeteer-core + installed Chrome)
  scene.mjs         live scene introspection
  analyze-frame.mjs / probe.mjs / column.mjs   pixel-metric visual checks
  shot.sh / menu.mjs  headless screenshot helpers
```

## QA methodology

Because the runtime model has no image input, visual verification is done through a
headless-Chrome pipeline that **actually runs the game** (auto-race via `?auto=1`)
and checks objective frame metrics (brightness/saturation/palette/road-vs-grass
composition) plus a live scene-graph raycast. Four independent harsh-critic
sub-agents audited gameplay feel, visuals, polish/UX/audio, and bugs; their P0/P1
findings were integrated. This caught and fixed real issues, including:
- a steering-inversion bug that sent karts off the road (boost made steering flip),
- a road that was invisible because ribbon triangle winding flipped on half the loop,
- a missing shadow system and flat Lambert materials → PBR + shadows added,
- a particle-system crash (`Effects._setZero`), a dust-call crash on drift, and
  banana self-hits,
- missing respawn, item reset, pause/mute/quit, item roulette and minimap dots.
