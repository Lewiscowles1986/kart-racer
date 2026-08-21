import * as THREE from 'three';

// Procedural, polished low-poly kart + cute driver. Built from primitive meshes
// with friendly toy-like materials (glossy phong). Each kart exposes refs so
// the game can animate wheels, steering, boost flames and the invincibility shield.
export function createKartMesh(opts = {}) {
  const {
    bodyColor = 0xff3b30,
    accent = 0xffd23f,
    helmet = 0xffffff,
    skin = 0xffcf9f,
    driverColor = 0x3b82f6,
  } = opts;

  const root = new THREE.Group();
  root.name = 'kart';

  const bodyMat = new THREE.MeshPhysicalMaterial({ color: bodyColor, roughness: 0.22, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.12 });
  const darkMat = new THREE.MeshPhysicalMaterial({ color: 0x20232a, roughness: 0.5, metalness: 0.3, clearcoat: 0.3 });
  const accentMat = new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.3, metalness: 0.0, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const wheelMat = new THREE.MeshPhysicalMaterial({ color: 0x1c1e24, roughness: 0.95, metalness: 0.0 });
  const hubMat = new THREE.MeshPhysicalMaterial({ color: 0xccd0d6, roughness: 0.25, metalness: 0.7, clearcoat: 0.6 });
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: helmet, roughness: 0.18, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.1 });
  const skinMat = new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.5, metalness: 0.0 });
  const driverMat = new THREE.MeshPhysicalMaterial({ color: driverColor, roughness: 0.5, metalness: 0.0 });

  // --- chassis ---
  const chassis = new THREE.Group();

  const main = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 3.0), bodyMat);
  main.position.y = 0.35;
  // rounded nose
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), bodyMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 0.32, 1.8);
  // cowl over the driver
  const cowl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 1.0), bodyMat);
  cowl.position.set(0, 0.78, -0.5);
  // cockpit seat
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.9), darkMat);
  seat.position.set(0, 0.95, -0.7);
  // spoiler wing
  const wing = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.14, 0.5), accentMat);
  wing.position.set(0, 0.95, -1.7);
  const wingP1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.14), darkMat);
  const wingP2 = wingP1.clone();
  wingP1.position.set(-0.7, 0.6, -1.7); wingP2.position.set(0.7, 0.6, -1.7);
  // engine pod
  const engine = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.4, 0.6), darkMat);
  engine.position.set(0, 0.5, -2.1);

  chassis.add(main, nose, cowl, seat, wing, wingP1, wingP2, engine);

  // exhaust pipes (boost flame anchors)
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.4, 8), darkMat);
  pipe.rotation.x = Math.PI / 2;
  const pipeL = pipe.clone(); pipeL.position.set(-0.5, 0.45, -2.85);
  const pipeR = pipe.clone(); pipeR.position.set(0.5, 0.45, -2.85);
  chassis.add(pipeL, pipeR);

  // --- wheels (refs for steering/rolling) ---
  const wheels = [];
  const wheelPos = [
    [-0.78, 0.4, 1.35], [0.78, 0.4, 1.35],
    [-0.8, 0.4, -1.35], [0.8, 0.4, -1.35],
  ];
  for (const [wx, wy, wz] of wheelPos) {
    const g = new THREE.Group();
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 14), wheelMat);
    tire.rotation.z = Math.PI / 2; // axle along X (left-right) so it rolls forward
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 8), hubMat);
    hub.rotation.z = Math.PI / 2;
    g.add(tire, hub);
    g.position.set(wx, wy, wz);
    wheels.push(g);
  }
  wheels[0].userData.front = true;
  wheels[1].userData.front = true;

  // --- driver character ---
  const driver = new THREE.Group();
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.6, 10), driverMat);
  torso.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skinMat);
  head.position.y = 1.95;
  const helmetS = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, 6.28, 0, Math.PI / 2), helmetMat);
  helmetS.position.y = 2.0;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.22), new THREE.MeshPhysicalMaterial({ color: 0x0a1a2a, roughness: 0.05, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 }));
  visor.position.set(0, 2.02, 0.24);
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), driverMat);
  armL.position.set(-0.3, 1.3, 0.2); armL.rotation.z = 0.6;
  const armR = armL.clone(); armR.position.x = 0.3; armR.rotation.z = -0.6;
  driver.add(torso, head, helmetS, visor, armL, armR);
  driver.position.y = -0.1;

  root.add(chassis, ...wheels, driver);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });

  // --- invincibility shield (hidden until active) ---
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(1.6, 24, 18),
    new THREE.MeshBasicMaterial({ color: 0xffcc00, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  shield.position.y = 0.9;
  shield.visible = false;
  root.add(shield);

  // ---- public API ----
  return {
    root,
    wheels,
    shield,
    driver,
    pipes: [pipeL, pipeR],
    setShield(on, t) {
      shield.visible = on;
      shield.material.opacity = on ? 0.35 + 0.15 * Math.sin(t * 8) : 0;
    },
  };
}
