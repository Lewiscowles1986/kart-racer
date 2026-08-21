// Lightweight minimap shape derived from the track control points (kept small,
// independent of the physics samples so the map is stable and cheap). Takes the
// active track's points so the minimap matches whichever map is being raced.
export function minimapSamples(points: [number, number][]): [number, number][] {
  const n = points.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    out.push(points[i]);
    // interpolate a midpoint for a smoother polyline
    const a = points[i];
    const b = points[(i + 1) % n];
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
}
