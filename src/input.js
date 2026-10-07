// Keyboard + gamepad + touch input, with per-frame edge detection.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'fire', KeyJ: 'fire', KeyF: 'fire', ControlLeft: 'fire',
  KeyX: 'jump', KeyK: 'jump', Space: 'jump',
  Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};
const ACTIONS = ['left', 'right', 'up', 'down', 'fire', 'jump', 'start', 'pause', 'mute'];

export class Input {
  constructor() {
    this.held = {}; this.prev = {}; this.cur = {};
    this.touch = {};
    this.anyKey = false;
    for (const a of ACTIONS) { this.held[a] = false; this.prev[a] = false; this.cur[a] = false; }
    addEventListener('keydown', e => {
      const a = KEYMAP[e.code];
      this.anyKey = true;
      if (a) { this.held[a] = true; e.preventDefault(); }
    });
    addEventListener('keyup', e => { const a = KEYMAP[e.code]; if (a) this.held[a] = false; });
    addEventListener('blur', () => { for (const a of ACTIONS) this.held[a] = false; });
    this.setupTouch();
  }

  setupTouch() {
    const pad = document.getElementById('touch');
    if (!pad) return;
    const isTouch = matchMedia('(pointer: coarse)').matches;
    if (isTouch) pad.classList.add('on');
    pad.querySelectorAll('[data-a]').forEach(btn => {
      const a = btn.dataset.a;
      const on = e => { e.preventDefault(); this.touch[a] = true; btn.classList.add('down'); this.anyKey = true; };
      const off = e => { e.preventDefault(); this.touch[a] = false; btn.classList.remove('down'); };
      btn.addEventListener('pointerdown', on); btn.addEventListener('pointerup', off);
      btn.addEventListener('pointercancel', off); btn.addEventListener('pointerleave', off);
    });
  }

  update() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(g => g && g.connected) : null;
    const g = {};
    if (gp) {
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = i => gp.buttons[i] && gp.buttons[i].pressed;
      g.left = ax < -0.4 || b(14); g.right = ax > 0.4 || b(15);
      g.up = ay < -0.5 || b(12); g.down = ay > 0.5 || b(13);
      g.fire = b(2) || b(1) || b(7); g.jump = b(0) || b(6); g.start = b(9); g.pause = b(8);
      if (Object.values(g).some(Boolean)) this.anyKey = true;
    }
    for (const a of ACTIONS) {
      this.prev[a] = this.cur[a];
      this.cur[a] = !!(this.held[a] || this.touch[a] || g[a]);
    }
  }
  down(a) { return this.cur[a]; }
  pressed(a) { return this.cur[a] && !this.prev[a]; }
  get x() { return (this.cur.right ? 1 : 0) - (this.cur.left ? 1 : 0); }
}
