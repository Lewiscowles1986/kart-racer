// Post-processing stack (M2 step 5, judge backlog J-17).
//
// Subtle, motion-safe, GPU-budget-friendly:
// - UnrealBloomPass at a high threshold so ONLY bright emissive moments glow
//   (boost pads/flames, star shield, item sparks) — the scene keeps its flat
//   cartoon look otherwise;
// - a static vignette that reads as "camera lens", never animates;
// - everything OFF when the user prefers reduced motion (AR-6, UX-5) or on
//   low-DPR hardware where the composer would halve the frame budget.

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0.35 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      // quadratic falloff from centre; 1.0 keeps the frame edge honest
      float v = smoothstep(0.85, 0.32, d);
      gl_FragColor = vec4(c.rgb * mix(1.0 - strength, 1.0, smoothstep(0.15, 0.55, 1.0 - d * 1.6)), c.a);
    }
  `,
};

export interface PostOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  enabled: boolean; // user prefers reduced motion => false
}

export class PostStack {
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  vignette: ShaderPass | null = null;

  constructor({ renderer, scene, camera, enabled }: PostOptions) {
    if (!enabled) return;
    try {
      const composer = new EffectComposer(renderer);
      composer.addPass(new RenderPass(scene, camera));
      // LDR renderer: threshold 1.0 means ONLY pixels already clipped to white
      // (additive boost/star FX) bloom — lit surfaces like clouds/kerbs must
      // NOT glow (first try at 0.92 white-out the whole sky on SwiftShader).
      const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.25, 1.0);
      composer.addPass(bloom);
      const vignette = new ShaderPass(VignetteShader);
      vignette.uniforms.strength.value = 0.32;
      composer.addPass(vignette);
      this.composer = composer;
      this.bloom = bloom;
      this.vignette = vignette;
    } catch {
      // SwiftShader/old GL or WebGL2-less: render plain — never crash the game
      this.composer = null;
    }
  }

  resize(w: number, h: number): void {
    this.composer?.setSize(w, h);
  }

  render(dt: number): void {
    if (this.composer) this.composer.render(dt);
    // (the fallback path is handled by the caller: plain renderer.render)
  }

  dispose(): void {
    this.composer?.dispose();
    this.composer = null;
  }
}