// Meridian Run — keyboard and mouse input.
// One job: listen once, and hand the game a clean per-frame picture of what the pilot is doing.

import { KEYS } from './config.js';

export function createInput(canvas) {
  const input = {
    keys: new Set(),
    mouseX: 0,
    mouseY: 0,
    mouseClicked: false,
    clickX: 0,
    clickY: 0,
    // Edge-triggered presses the game consumes once (pause, restart, mute, confirm).
    pressed: new Set(),

    attach() {
      window.addEventListener('keydown', (event) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
          event.preventDefault();
        }
        if (!event.repeat) this.pressed.add(event.code);
        this.keys.add(event.code);
      });
      window.addEventListener('keyup', (event) => {
        this.keys.delete(event.code);
      });
      window.addEventListener('blur', () => {
        this.keys.clear();
      });
      canvas.addEventListener('mousemove', (event) => {
        const rect = canvas.getBoundingClientRect();
        this.mouseX = event.clientX - rect.left;
        this.mouseY = event.clientY - rect.top;
      });
      canvas.addEventListener('mousedown', (event) => {
        const rect = canvas.getBoundingClientRect();
        this.clickX = event.clientX - rect.left;
        this.clickY = event.clientY - rect.top;
        this.mouseClicked = true;
        this.mouseX = this.clickX;
        this.mouseY = this.clickY;
      });
    },

    down(...codes) {
      return codes.some((code) => this.keys.has(code));
    },

    wasPressed(...codes) {
      return codes.some((code) => this.pressed.has(code));
    },

    // Flight axes, -1..1, from the keys held this frame.
    flightAxes() {
      const pitch = (this.down(...KEYS.pitchUp) ? 1 : 0) - (this.down(...KEYS.pitchDown) ? 1 : 0);
      const bank = (this.down(...KEYS.bankRight) ? 1 : 0) - (this.down(...KEYS.bankLeft) ? 1 : 0);
      const throttle = (this.down(...KEYS.throttleUp) ? 1 : 0) - (this.down(...KEYS.throttleDown) ? 1 : 0);
      return { pitch, bank, throttle };
    },

    consumeClick() {
      const clicked = this.mouseClicked;
      this.mouseClicked = false;
      return clicked;
    },

    endFrame() {
      this.pressed.clear();
    },
  };
  input.attach();
  return input;
}
