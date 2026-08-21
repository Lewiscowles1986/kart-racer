// Unified input: keyboard + gamepad + touch steering controls.
// Buttons are labelled as child-friendly actions (e.g. the Space bar = "ITEM!").
export class Input {
  constructor() {
    this.steer = 0;      // -1..1
    this.throttle = 0;   // 0..1
    this.brake = false;  // also used to reverse / drift
    this.itemHeld = false;
    this.itemPressed = false; // edge-triggered
    this._itemWasHeld = false;

    this.keys = new Set();
    this.touch = { left: false, right: false, boost: false, brake: false, item: false };
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
  setTouch(action, down) {
    if (action === 'left') this.touch.left = down;
    else if (action === 'right') this.touch.right = down;
    else if (action === 'boost') this.touch.boost = down;
    else if (action === 'brake') this.touch.brake = down;
    else if (action === 'item') { if (down) this._pressItem(); }
  }

  read() {
    const left = this.keys['ArrowLeft'] || this.keys['KeyA'] || this.touch.left;
    const right = this.keys['ArrowRight'] || this.keys['KeyD'] || this.touch.right;
    const up = this.keys['ArrowUp'] || this.keys['KeyW'] || this.touch.boost;
    const down = this.keys['ArrowDown'] || this.keys['KeyS'] || this.touch.brake;

    this.steer = (right ? 1 : 0) - (left ? 1 : 0);
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
