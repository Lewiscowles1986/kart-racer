// Stable serialisation + state hashing (determinism contract helpers).
//
// hash() must be identical across property insertion order within one engine
// per simulator.md §4: we canonicalise (sorted keys) then FNV-1a over the
// string. Numbers are printed through JSON with explicit integer handling:
// gameplay floats are quantised at the sim boundary (see quantise) so 1e-15
// drifts never flip a hash.

/** Deterministic JSON: object keys sorted, arrays in order. No undefined. */
export function stableStringify(value: unknown): string {
  return ser(value);
}

function ser(v: unknown): string {
  if (v === null || typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') {
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return '[' + v.map(ser).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v as object).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + ser((v as Record<string, unknown>)[k])).join(',') + '}';
  }
  // functions / symbols / undefined are sim-state errors: surface them loudly
  throw new Error('stableStringify: non-serialisable value: ' + String(v));
}

export function quantise(x: number, step = 1e-4): number {
  return Math.round(x / step) * step;
}

/** FNV-1a 32-bit hash of the stable string form. */
export function stateHash(state: unknown): string {
  const s = stableStringify(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}