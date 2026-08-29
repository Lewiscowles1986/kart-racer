// Instance-level track catalog (M1 step 2, judge backlog J-2).
//
// Custom editor levels must never mutate the exported TRACKS constant — a
// runtime-writable config breaks the "config is constants" contract and would
// leak between game instances (AR-7). This helper builds a NEW catalog:
// TRACKS stays frozen; Game owns `trackCatalog` and reads that everywhere.

import type { TrackDef } from '../config';

export interface CustomLevelRaw {
  name?: string;
  points?: [number, number][];
  trees?: [number, number, number][];
  objects?: { type: string; frac: number; lateral: number }[];
}

/**
 * Return a NEW catalog with the custom level upserted (replaced if a 'custom'
 * entry exists, appended otherwise), or `null` if the level is unusable
 * (missing/empty points are tolerated by falling back to the catalog's first
 * track, matching v1 behaviour; a non-object or null level invalidates).
 */
export function upsertCustomLevel(
  catalog: readonly TrackDef[],
  raw: CustomLevelRaw | null,
): TrackDef[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const objs: any[] = Array.isArray(raw.objects) ? raw.objects : [];
  const points = Array.isArray(raw.points) && raw.points.length
    ? raw.points
    : catalog[0].points;
  const def: TrackDef = {
    id: 'custom',
    name: raw.name || 'Custom',
    desc: 'A custom track built in the editor.',
    points,
    color: ['#4fd1c5', '#818cf8'],
    trees: raw.trees || [],
    itemBoxes: objs.filter((o) => o.type === 'box').map((o) => ({ frac: o.frac, lateral: o.lateral })),
    boostPads: objs.filter((o) => o.type === 'pad').map((o) => ({ frac: o.frac, lateral: o.lateral })),
    jumps: objs.filter((o) => o.type === 'jump').map((o) => ({ frac: o.frac, lateral: o.lateral })),
  };
  const idx = catalog.findIndex((t) => t.id === 'custom');
  const next = catalog.slice();
  if (idx >= 0) next[idx] = def; else next.push(def);
  return next;
}