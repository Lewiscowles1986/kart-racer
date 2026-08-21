// Unified input: keyboard + gamepad + touch steering controls.
// Buttons are labelled as child-friendly actions (e.g. the Space bar = "ITEM!").

export interface InputFrame {
  steer: number;      // -1..1
  throttle: number;   // 0..1
  brake: boolean;
  itemPressed: boolean;
  itemHeld: boolean;
}

export type TouchAction = 'left' | 'right' | 'boost' | 'brake' | 'item';

export class Input {
  steer = 0;      // -1..1
  throttle = 0;   // 0..1
  brake = false;  // also used to reverse / drift
  itemHeld = false;
  itemPressed = false; // edge-triggered

  keys: Record<string, boolean> = {};
  touch: Record<TouchAction, boolean> = { left: false, right: false, boost: false, brake: false, item: false };

  constructor() {
    this.bind();
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys[e.code] = true;
      if (e.code === 'Space' || e.code === 'Enter') this._pressItem();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; });
  }

  _pressItem() { this.itemHeld = true; this.itemPressed = true; }

  // Call once per frame BEFORE reading input.
  resetFrame() { this.itemPressed = false; this.itemHeld = this.keys['Space'] || this.keys['Enter'] || this.touch.item; }

  // Touch controls are wired to on-screen buttons by HUD.
  setTouch(action: TouchAction, down: boolean) {
    if (action === 'left') this.touch.left = down;
    else if (action === 'right') this.touch.right = down;
    else if (action === 'boost') this.touch.boost = down;
    else if (action === 'brake') this.touch.brake = down;
    else if (action === 'item') { if (down) this._pressItem(); }
  }

  read(): InputFrame {
    const left = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left;
    const right = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
    const up = this.keys['ArrowUp'] || this.keys['KeyW'] || this.touch.boost;
    const down = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touch.brake;

    // NOTE: the kart physics uses `yaw += steer`, and screen-right is -X, so
    // pressing Right must yield steer = -1 (turns toward -X = right on screen).
    this.steer = (left ? 1 : 0) - (right ? 1 : 0);
    this.throttle = up ? 1 : 0;
    this.brake = down;
    return {
      steer: this.steer,
      throttle: this.throttle,
      brake: this.brake,
      itemPressed: this.itemPressed,
      itemHeld: this.itemHeld,
    };
  }
}
