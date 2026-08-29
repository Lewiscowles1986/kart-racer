// SimEvent queue (M1 step 4, judge backlog J-4; ADR-0005).
//
// The sim may not own presentation objects: Three.js meshes, canvas audio and
// effects managers are OUT of the simulation boundary. Instead, sim code EMITS
// plain, serialisable events (positions as plain {x,y,z} tuples, colours as
// 0..1 floats); the presentation layer drains the queue once per frame and
// does whatever it likes (spawn particles, play sounds, log, network-sync).
// This is the contract that lets the deterministic core stay THREE-free and
// gives multiplayer an event stream for free (docs/multiplayer.md §EVENT).

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type SfxName =
  | 'slip' | 'hit' | 'boost' | 'jump' | 'land' | 'lap' | 'pickup' | 'star';

export type SimEvent =
  | { t: 'ring'; at: Vec3; rgb: [number, number, number]; max: number }
  | { t: 'spinStars'; at: Vec3; count: number }
  | { t: 'dust'; at: Vec3; rgb?: [number, number, number]; count: number }
  | { t: 'boostTrail'; at: Vec3; dir: Vec3; rgb: [number, number, number]; count: number }
  | { t: 'sfx'; name: SfxName };

export class SimEventQueue {
  private queue: SimEvent[] = [];

  emit(ev: SimEvent): void {
    this.queue.push(ev);
  }

  /** Return all events emitted since the last drain (chronological order). */
  drain(): SimEvent[] {
    if (this.queue.length === 0) return [];
    const out = this.queue;
    this.queue = [];
    return out;
  }

  get length(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue = [];
  }
}