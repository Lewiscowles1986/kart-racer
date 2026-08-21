import { describe, it, expect, beforeEach } from 'vitest';
import { Input } from '../src/game/Input';

// Input.bind() attaches to window; provide a stub in the Node test env.
beforeEach(() => {
  globalThis.window = { addEventListener: () => {} };
});

describe('Input steering mapping (regression: right must turn right)', () => {
  it('pressing Right yields steer = -1 (turns toward -X = screen right)', () => {
    const input = new Input();
    input.keys['ArrowRight'] = true;
    const r = input.read();
    expect(r.steer).toBe(-1);
  });

  it('pressing Left yields steer = +1', () => {
    const input = new Input();
    input.keys['ArrowLeft'] = true;
    const r = input.read();
    expect(r.steer).toBe(1);
  });

  it('pressing both cancels to 0', () => {
    const input = new Input();
    input.keys['ArrowLeft'] = true;
    input.keys['ArrowRight'] = true;
    expect(input.read().steer).toBe(0);
  });

  it('W / ArrowUp map to throttle', () => {
    const input = new Input();
    input.keys['KeyW'] = true;
    expect(input.read().throttle).toBe(1);
  });

  it('S / ArrowDown map to brake', () => {
    const input = new Input();
    input.keys['KeyS'] = true;
    expect(input.read().brake).toBe(true);
  });
});
