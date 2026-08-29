// Race-level simulation machines (M1 step 8, judge backlog J-8).
//
// Extracted verbatim from Game.ts (v1) with two judge-mandated fixes:
//   GP-7 — fabricated podium times were assigned in ARRAY order, so a kart
//          ahead on track could show a WORSE time than one behind. Stragglers
//          are now ranked by race score before any podium time is fabricated.
//   GP-9 — respawned karts had no grace period and could re-stick instantly.
//          `ghostT` gives 2s of post-respawn collision immunity (both kart
//          pushes and plows) while remaining fully driveable.
//
// Purity: no three, no DOM, no wall clock (see tests/sim-track.test.js gate).

export const GHOST_MS = 2000; // judge: 2s post-respawn ghost (GP-9)

export interface RaceKart {
  index: number;
  name: string;
  isPlayer: boolean;
  pos: { x: number; z: number };
  speed: number;
  radius: number;
  lap: number;
  dist: number;
  prevU: number;
  trackHint: number;
  finished: boolean;
  finishTime: number | null;
  respawnT: number;
  ghostT: number; // >0 while in post-respawn collision grace (GP-9)
  shieldT: number;
  respawn(): void;
  hitPlow?(dir: { x: number; z: number }): void;
}

// Race score (v1 formula, mirrors the HUD rank sort): finished karts always
// outrank unfinished ones; otherwise lap-major, then along-track distance.
export function scoreOf(k: RaceKart, kartCount: number): number {
  if (k.finished) return (kartCount + 1) * 1e9 + (1e9 - k.finishTime!);
  return k.lap * 1e9 + k.dist;
}

export function collideKarts(ks: RaceKart[]): void {
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      const a = ks[i], b = ks[j];
      // GP-9: ghosted karts pass through (no push, no plow) while graced
      if (a.ghostT > 0 || b.ghostT > 0) continue;
      const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (a.radius + b.radius) * 0.85;
      if (d < min && d > 0.001) {
        const push = (min - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        a.pos.x -= nx * push; a.pos.z -= nz * push;
        b.pos.x += nx * push; b.pos.z += nz * push;
        const rel = (a.speed - b.speed) * 0.3;
        a.speed -= rel; b.speed += rel;
        // star plow: a shielded kart knocks the other one over
        if (a.shieldT > 0 && !b.shieldT) b.hitPlow?.({ x: nx, z: nz });
        else if (b.shieldT > 0 && !a.shieldT) a.hitPlow?.({ x: -nx, z: -nz });
      }
    }
  }
}

// v1 respawn policy (off-road timer), now granting the GP-9 ghost.
export function respawnCheck(
  ks: RaceKart[],
  trackLike: {
    halfWidth: number;
    worldToTrack(pos: { x: number; z: number }, hint?: number): { index: number; lat: number };
  },
  dt: number,
  limitMs: number,
  offroadExtra: number,
): void {
  const limit = limitMs / 1000;
  const offroad = trackLike.halfWidth + offroadExtra;
  for (const k of ks) {
    if (k.finished) continue;
    const t = trackLike.worldToTrack(k.pos, k.trackHint);
    k.trackHint = t.index;
    if (Math.abs(t.lat) > offroad) k.respawnT += dt;
    else k.respawnT = 0;
    if (k.respawnT > limit) k.respawn();
  }
}

// GP-7 FIX. When the player finishes, stragglers are wrapped up after a grace
// window; their podium times MUST follow race order (best score gets the
// earliest fabricated time), not array order.
export function fabricatePodium(ks: RaceKart[], kartCount: number, baseMs: number, gapSec = 0.6): void {
  const stragglers = ks.filter((k) => !k.finished)
    .sort((x, y) => scoreOf(y, kartCount) - scoreOf(x, kartCount)); // best score first
  stragglers.forEach((k, i) => {
    k.finished = true;
    k.finishTime = baseMs + (i + 1) * gapSec;
    k.speed = 0;
  });
}