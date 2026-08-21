import * as THREE from 'three';
import { KART_SCALE } from '../config';

interface DriverMaterials {
  driverMat: THREE.Material;
  skinMat: THREE.Material;
  helmetMat: THREE.Material;
  accentMat: THREE.Material;
  darkMat: THREE.Material;
}

// Build a distinct, readable driver silhouette per style so the racers don't
// all look alike. Each style changes body/head proportions and adds a signature
// accessory (helmet, cap, horns, bow, antenna, propeller, mustache).
function buildDriver(style: string, m: DriverMaterials): THREE.Group {
  const { driverMat, skinMat, helmetMat, accentMat, darkMat } = m;
  const s = style || 'racer';
  const g = new THREE.Group();

  // torso
  let torso: THREE.Mesh;
  if (s === 'big') torso = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.52, 0.72, 10), driverMat);
  else if (s === 'tall') torso = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.9, 10), driverMat);
  else if (s === 'round') torso = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), driverMat);
  else if (s === 'robot') torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.62, 0.5), driverMat);
  else torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 0.6, 10), driverMat);
  torso.position.y = 1.35;
  g.add(torso);

  // head
  let head: THREE.Mesh;
  if (s === 'robot') head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), skinMat);
  else if (s === 'big' || s === 'round') head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 14, 12), skinMat);
  else head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 12), skinMat);
  head.position.y = 1.95;
  g.add(head);

  // headgear / face
  if (s === 'robot') {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.1), new THREE.MeshStandardMaterial({ color: 0x00ffcc, emissive: 0x00ffcc, emissiveIntensity: 1.2 }));
    eye.position.set(0, 2.0, 0.26);
    const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 6), darkMat);
    ant.position.set(0, 2.4, 0);
    const antBall = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), accentMat);
    antBall.position.set(0, 2.62, 0);
    g.add(eye, ant, antBall);
  } else if (s === 'monster') {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 8), accentMat);
    const hornL = horn.clone(); hornL.position.set(-0.2, 2.3, 0); hornL.rotation.z = 0.4;
    const hornR = horn.clone(); hornR.position.set(0.2, 2.3, 0); hornR.rotation.z = -0.4;
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skinMat);
    const earL = ear.clone(); earL.position.set(-0.4, 2.0, 0);
    const earR = ear.clone(); earR.position.set(0.4, 2.0, 0);
    g.add(hornL, hornR, earL, earR);
  } else if (s === 'round') {
    const bow = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.1), accentMat);
    const bowL = bow.clone(); bowL.position.set(-0.18, 2.35, 0); bowL.rotation.z = 0.5;
    const bowR = bow.clone(); bowR.position.set(0.18, 2.35, 0); bowR.rotation.z = -0.5;
    g.add(bowL, bowR);
  } else if (s === 'big') {
    const must = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.08), darkMat);
    must.position.set(0, 1.9, 0.3);
    g.add(must);
  } else if (s === 'tall') {
    const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8, 0, 6.28, 0, Math.PI / 2), accentMat);
    beanie.position.y = 2.0;
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.08), accentMat);
    prop.position.y = 2.3;
    g.add(beanie, prop);
  } else if (s === 'cap') {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10, 0, 6.28, 0, Math.PI / 2), accentMat);
    cap.position.y = 2.0;
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.3), accentMat);
    brim.position.set(0, 2.0, 0.3);
    g.add(cap, brim);
  } else { // racer: helmet + visor
    const helmetS = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, 6.28, 0, Math.PI / 2), helmetMat);
    helmetS.position.y = 2.0;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.22), new THREE.MeshPhysicalMaterial({ color: 0x0a1a2a, roughness: 0.05, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.05 }));
    visor.position.set(0, 2.02, 0.24);
    g.add(helmetS, visor);
  }

  // arms
  const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), driverMat);
  armL.position.set(-0.3, 1.3, 0.2); armL.rotation.z = 0.6;
  const armR = armL.clone(); armR.position.x = 0.3; armR.rotation.z = -0.6;
  g.add(armL, armR);

  g.position.y = -0.1;
  return g;
}

export interface KartVisual {
  root: THREE.Group;
  wheels: THREE.Group[];
  shield: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
  driver: THREE.Group;
  pipes: THREE.Mesh[];
  setShield: (on: boolean, t: number) => void;
}

export interface KartMeshOptions {
  bodyColor?: number;
  accent?: number;
  helmet?: number;
  skin?: number;
  driverColor?: number;
  driverStyle?: string;
}

// Procedural, polished low-poly kart + cute driver. Built from primitive meshes
// with friendly toy-like materials (glossy phong). Each kart exposes refs so
// the game can animate wheels, steering, boost flames and the invincibility shield.
export function createKartMesh(opts: KartMeshOptions = {}): KartVisual {
  const {
    bodyColor = 0xff3b30,
    accent = 0xffd23f,
    helmet = 0xffffff,
    skin = 0xffcf9f,
    driverColor = 0x3b82f6,
    driverStyle = 'racer',
  } = opts;

  const root = new THREE.Group();
  root.name = 'kart';
  root.scale.setScalar(KART_SCALE);

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
  const wheels: THREE.Group[] = [];
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

  // --- driver character (distinct silhouette + accessory per style) ---
  const driver = buildDriver(driverStyle, { driverMat, skinMat, helmetMat, accentMat, darkMat });

  root.add(chassis, ...wheels, driver);
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });

  // --- invincibility shield (hidden until active) ---
  const shield: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> = new THREE.Mesh(
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
