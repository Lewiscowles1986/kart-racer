import { TRACK_POINTS } from '../config';

// Lightweight minimap shape derived from the track control points (kept small,
// independent of the physics samples so the map is stable and cheap).
export function minimapSamples(): [number, number][] {
  const n = TRACK_POINTS.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    out.push(TRACK_POINTS[i]);
    // interpolate a midpoint for a smoother polyline
    const a = TRACK_POINTS[i];
    const b = TRACK_POINTS[(i + 1) % n];
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
}
