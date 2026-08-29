import { describe, it, expect } from 'vitest';
import { stableStringify, stateHash, quantise } from '../src/sim/protocol';

describe('stable serialisation & hashing', () => {
  it('is key-order independent', () => {
    const a = { b: 1, a: [1, { z: 2, y: 3 }] };
    const b = { a: [1, { y: 3, z: 2 }], b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(stateHash(a)).toBe(stateHash(b));
  });

  it('detects value changes', () => {
    expect(stateHash({ x: 1.0 })).not.toBe(stateHash({ x: 1.1 }));
    expect(stateHash({ karts: [{}] })).not.toBe(stateHash({ karts: [{}, {}] }));
  });

  it('hash is stable across calls and engines-safe chars', () => {
    const h1 = stateHash({ v: 1, tick: 42, karts: [{ pos: { x: 1.5, y: 0, z: -2 } }] });
    const h2 = stateHash({ v: 1, tick: 42, karts: [{ pos: { x: 1.5, y: 0, z: -2 } }] });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{8}$/);
  });

  it('rejects non-serialisable state loudly', () => {
    expect(() => stableStringify({ bad: () => 1 })).toThrow();
    expect(() => stableStringify({ weird: undefined })).toThrow();
  });

  it('quantise removes float dust before hashing', () => {
    const a = { x: 0.1 + 0.2 };
    const b = { x: 0.30000000000000004 };
    expect(stateHash({ x: quantise(a.x) })).toBe(stateHash({ x: quantise(b.x) }));
  });
});