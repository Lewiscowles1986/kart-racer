// Player preferences (M2 step 7, judge backlog J-21 / UX-1).
//
// A tiny, dependency-free settings layer: localStorage-backed, corruption
// tolerant (bail to defaults), injected storage for tests. The sim never
// reads this — presentation/UX only (system boundary: sim is pure;
// prefs are device-local and never synced).

export type ReducedMotionSetting = 'auto' | 'on' | 'off';

export interface PrefShape {
  volume: number;              // 0..1 master volume
  muted: boolean;              // full mute toggle
  reducedMotion: ReducedMotionSetting;
  camera: number;              // index into CAMERA_MODES
  autoItem: boolean;           // M4: auto-use item when rolled (defaults off)
}

export const PREF_DEFAULTS: PrefShape = {
  volume: 0.55,
  muted: false,
  reducedMotion: 'auto',
  camera: 0,
  autoItem: false,
};

const KEY = 'kk.prefs.v1';

export function loadPrefs(storage: Storage | null): PrefShape {
  if (!storage) return { ...PREF_DEFAULTS };
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return { ...PREF_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PrefShape>;
    return {
      volume: clamp01(parsed.volume, PREF_DEFAULTS.volume),
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : PREF_DEFAULTS.muted,
      reducedMotion: parsed.reducedMotion === 'on' || parsed.reducedMotion === 'off' || parsed.reducedMotion === 'auto'
        ? parsed.reducedMotion
        : PREF_DEFAULTS.reducedMotion,
      camera: typeof parsed.camera === 'number' && parsed.camera >= 0 ? Math.floor(parsed.camera) : PREF_DEFAULTS.camera,
      autoItem: typeof parsed.autoItem === 'boolean' ? parsed.autoItem : PREF_DEFAULTS.autoItem,
    };
  } catch {
    return { ...PREF_DEFAULTS }; // corrupt/absent config: defaults, never crash
  }
}

export function savePrefs(p: PrefShape, storage: Storage | null): void {
  if (!storage) return;
  try {
    storage.setItem(KEY, JSON.stringify(p));
  } catch {
    // storage full/blocked: prefs live for the session only
  }
}

function clamp01(v: unknown, fallback: number): number {
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
}

// true when motion should be reduced: explicit 'on', or 'auto' + OS preference
export function motionReduced(p: PrefShape, osPrefersReduced: boolean): boolean {
  if (p.reducedMotion === 'on') return true;
  if (p.reducedMotion === 'off') return false;
  return osPrefersReduced;
}