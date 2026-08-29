import { describe, it, expect, vi } from 'vitest';
import { PREF_DEFAULTS, loadPrefs, savePrefs, motionReduced } from '../src/prefs';

function fakeStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), clear: () => map.clear(), _map: map };
}

describe('prefs (M2 step 7, UX-1)', () => {
  it('defaults with no storage / no key', () => {
    expect(loadPrefs(null)).toEqual(PREF_DEFAULTS);
    const s = fakeStorage();
    expect(loadPrefs(s)).toEqual(PREF_DEFAULTS);
  });

  it('round-trips through savePrefs/loadPrefs', () => {
    const s = fakeStorage();
    savePrefs({ ...PREF_DEFAULTS, volume: 0.8, muted: true, reducedMotion: 'on', camera: 2 }, s);
    const p = loadPrefs(s);
    expect(p.volume).toBe(0.8);
    expect(p.muted).toBe(true);
    expect(p.reducedMotion).toBe('on');
    expect(p.camera).toBe(2);
    expect(p.autoItem).toBe(false); // untouched key keeps default
  });

  it('bails to defaults on corrupt JSON (never throws)', () => {
    const s = fakeStorage();
    s.setItem('kk.prefs.v1', '{{{not json');
    expect(loadPrefs(s)).toEqual(PREF_DEFAULTS);
  });

  it('sanitises bad field values (volume > 1, unknown enum, wrong types)', () => {
    const s = fakeStorage();
    s.setItem('kk.prefs.v1', JSON.stringify({ volume: 7, reducedMotion: 'sometimes', camera: 'chase', muted: 'yes' }));
    const p = loadPrefs(s);
    expect(p.volume).toBe(PREF_DEFAULTS.volume);
    expect(p.reducedMotion).toBe('auto');
    expect(p.camera).toBe(PREF_DEFAULTS.camera);
    expect(p.muted).toBe(PREF_DEFAULTS.muted);
  });

  it('motionReduced honours explicit override over OS setting', () => {
    expect(motionReduced({ ...PREF_DEFAULTS, reducedMotion: 'on' }, false)).toBe(true);
    expect(motionReduced({ ...PREF_DEFAULTS, reducedMotion: 'off' }, true)).toBe(false);
    expect(motionReduced({ ...PREF_DEFAULTS, reducedMotion: 'auto' }, false)).toBe(false);
    expect(motionReduced({ ...PREF_DEFAULTS, reducedMotion: 'auto' }, true)).toBe(true);
  });
});