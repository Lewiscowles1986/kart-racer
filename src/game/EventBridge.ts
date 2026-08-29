// Presentation translator for SimEvents (M1 step 4, ADR-0005).
// The deterministic core emits plain records; this bridge is the ONLY place
// that turns them into THREE.Vector3/Color particles and Audio calls.

import * as THREE from 'three';
import type { SimEventQueue, SimEvent } from '../sim/events';
import type { Effects } from './Effects';
import type { Audio } from './Audio';

export class EventBridge {
  constructor(private effects: Effects, private audio: Audio) {}

  pump(queue: SimEventQueue): void {
    const events = queue.drain();
    for (const ev of events) this.apply(ev);
  }

  private apply(ev: SimEvent): void {
    switch (ev.t) {
      case 'ring':
        this.effects.ring(v(ev.at), c(ev.rgb), ev.max);
        break;
      case 'spinStars':
        this.effects.spinStars(v(ev.at), ev.count);
        break;
      case 'dust':
        this.effects.dust(v(ev.at), ev.rgb ? c(ev.rgb) : undefined, ev.count);
        break;
      case 'boostTrail':
        this.effects.boost(v(ev.at), dir(ev.dir), c(ev.rgb), ev.count);
        break;
      case 'sfx':
        this.audio[ev.name]();
        break;
    }
  }
}

function v(at: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(at.x, at.y, at.z);
}
function c(rgb: [number, number, number]): THREE.Color {
  return new THREE.Color(rgb[0], rgb[1], rgb[2]);
}
function dir(d: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(d.x, d.y, d.z);
}