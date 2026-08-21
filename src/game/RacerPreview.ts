import * as THREE from 'three';
import { createKartMesh, type KartMeshOptions } from './KartVisual';

// A small self-contained WebGL viewport that renders the selected racer's kart,
// spinning gently on the menu. Independent of the main game renderer so it can be
// shown/hidden as the menu opens and closes.
export class RacerPreview {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private root: THREE.Group | null = null;
  private raf = 0;
  private running = false;
  private elapsed = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    const w = canvas.clientWidth || canvas.width;
    const h = canvas.clientHeight || canvas.height;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
    this.camera.position.set(0, 1.0, 2.2);
    this.camera.lookAt(0, 0.42, 0);

    const key = new THREE.DirectionalLight(0xfff2dc, 2.0);
    key.position.set(4, 6, 5);
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fb6ff, 0.5);
    fill.position.set(-4, 2, -3);
    this.scene.add(fill);
    // a kart-coloured rim light from behind lifts the kart off the backdrop
    this.rim = new THREE.PointLight(0xffffff, 2.2, 20);
    this.rim.position.set(0, 2, -3.4);
    this.scene.add(this.rim);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3a5a, 0.6));

    // soft floor disc so the kart reads as sitting on a turntable, not floating
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(2.4, 40),
      new THREE.MeshStandardMaterial({ color: 0x1c2a4a, roughness: 0.9, metalness: 0, transparent: true, opacity: 0.55 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    this.scene.add(floor);
  }

  private rim: THREE.PointLight | null = null;

  setCharacter(opts: KartMeshOptions) {
    this.clear();
    const kart = createKartMesh(opts);
    this.root = kart.root;
    this.scene.add(this.root);
    if (this.rim) this.rim.color.set(opts.bodyColor ?? 0xff3b30);
    this.start();
  }

  private start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.elapsed += 0.016;
      if (this.root) {
        this.root.rotation.y += 0.016 * 1.1;
        this.root.position.y = Math.sin(this.elapsed * 2.2) * 0.06;
      }
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  private clear() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => x?.dispose());
        }
      });
      this.root = null;
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.clear();
    this.renderer.dispose();
  }
}
