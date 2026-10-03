/**
 * ESCAPE 99 — input
 * One-thumb first: swipe = one step, keep your thumb down = keep moving,
 * optional virtual joystick. Keyboard fallback for desktop / testing.
 */
import { Emitter, clamp } from '../core/util.js';

const DEADZONE = 18; // px before a swipe commits (small = responsive)
const COMMIT_MS = 220;

export class InputManager extends Emitter {
  constructor(canvas, options = {}) {
    super();
    this.canvas = canvas;
    this.options = options;
    this.enabled = false;
    this.pointer = { id: null, active: false, sx: 0, sy: 0, x: 0, y: 0, dir: null, committed: false, t0: 0 };
    this.keys = new Set();
    this.joystick = { active: false, x: 0, y: 0, id: null, cx: 0, cy: 0, r: 62, dir: null };
    this.axisLock = null;
    this._bind();
  }

  setEnabled(on) {
    this.enabled = !!on;
    if (!on) this.reset();
  }

  reset() {
    this.pointer = { id: null, active: false, sx: 0, sy: 0, x: 0, y: 0, dir: null, committed: false, t0: 0 };
    this.joystick.active = false;
    this.joystick.id = null;
    this.joystick.dir = null;
    this.axisLock = null;
    this.keys.clear();
  }

  get controlMode() {
    return this.options.getControlMode?.() || 'swipe';
  }
  get leftHanded() {
    return !!this.options.getLeftHanded?.();
  }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', this._onDown, { passive: false });
    c.addEventListener('pointermove', this._onMove, { passive: false });
    c.addEventListener('pointerup', this._onUp, { passive: false });
    c.addEventListener('pointercancel', this._onUp, { passive: false });
    c.addEventListener('pointerleave', this._onUp, { passive: false });
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      window.addEventListener('blur', () => this.reset());
    }
  }

  _local(e) {
    const r = this.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  _onDown = (e) => {
    if (!this.enabled) return;
    e.preventDefault();
    const p = this._local(e);
    // Joystick zone: bottom third of the screen (side depends on handedness).
    const r = this.canvas.getBoundingClientRect();
    const inZone = p.y > r.height * 0.55;
    if (this.controlMode === 'joystick' && inZone && !this.joystick.active) {
      this.joystick.active = true;
      this.joystick.id = e.pointerId;
      this.joystick.cx = p.x;
      this.joystick.cy = p.y;
      this.joystick.x = p.x;
      this.joystick.y = p.y;
      this.joystick.r = Math.max(52, Math.min(r.width, r.height) * 0.09);
      this.emit('joystick', { start: true, x: p.x, y: p.y, r: this.joystick.r });
      return;
    }
    if (this.pointer.active) return;
    this.pointer = { id: e.pointerId, active: true, sx: p.x, sy: p.y, x: p.x, y: p.y, dir: null, committed: false, t0: performance.now() };
  };

  _dirFromDelta(dx, dy) {
    if (Math.abs(dx) < DEADZONE && Math.abs(dy) < DEADZONE) return null;
    let ax = dx,
      ay = dy;
    // Slight axis bias so a 45° thumb doesn't flicker between two axes.
    if (this.axisLock === 'x' && Math.abs(ay) < Math.abs(dx) * 1.35) ay = 0;
    if (this.axisLock === 'y' && Math.abs(ax) < Math.abs(dy) * 1.35) ax = 0;
    if (Math.abs(ax) > Math.abs(ay)) return ax > 0 ? 'right' : 'left';
    return ay > 0 ? 'down' : 'up';
  }

  _onMove = (e) => {
    if (!this.enabled) return;
    const p = this._local(e);
    if (this.joystick.active && e.pointerId === this.joystick.id) {
      e.preventDefault();
      this.joystick.x = p.x;
      this.joystick.y = p.y;
      const dx = p.x - this.joystick.cx;
      const dy = p.y - this.joystick.cy;
      const dir = Math.hypot(dx, dy) < DEADZONE ? null : this._dirFromDelta(dx, dy);
      if (dir !== this.joystick.dir) {
        this.joystick.dir = dir;
        this.axisLock = dir === 'left' || dir === 'right' ? 'x' : dir ? 'y' : null;
        this.emit('move', { dir, source: 'joystick', hold: true });
      }
      this.emit('joystick', { start: false, x: p.x, y: p.y, r: this.joystick.r, dir });
      return;
    }
    if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
    e.preventDefault();
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    const dx = p.x - this.pointer.sx;
    const dy = p.y - this.pointer.sy;
    const dir = this._dirFromDelta(dx, dy);
    if (dir && dir !== this.pointer.dir) {
      this.pointer.dir = dir;
      this.pointer.committed = true;
      this.axisLock = dir === 'left' || dir === 'right' ? 'x' : 'y';
      this.emit('move', { dir, source: 'swipe', hold: true, fresh: true });
    } else if (!dir && this.pointer.committed) {
      // Thumb returned to the centre — treat as release for the current step.
      this.pointer.dir = null;
      this.axisLock = null;
      this.emit('move', { dir: null, source: 'swipe', hold: false });
    }
  };

  _onUp = (e) => {
    if (!this.enabled) return;
    if (this.joystick.active && e.pointerId === this.joystick.id) {
      this.joystick.active = false;
      this.joystick.id = null;
      this.joystick.dir = null;
      this.emit('move', { dir: null, source: 'joystick', hold: false });
      this.emit('joystick', { start: false, hidden: true });
      return;
    }
    if (!this.pointer.active || e.pointerId !== this.pointer.id) return;
    const wasCommitted = this.pointer.committed;
    const dir = this.pointer.dir;
    const dt = performance.now() - this.pointer.t0;
    this.pointer.active = false;
    this.pointer.id = null;
    this.axisLock = null;
    if (!wasCommitted && dt < COMMIT_MS) {
      // A quick tap is the action button's job — ignore here but keep the tap
      // for "tap anywhere to skip" style prompts the game can consume.
      this.emit('tap', { x: this.pointer.sx, y: this.pointer.sy });
    }
    this.emit('move', { dir: dir, source: 'swipe', hold: false, released: true });
    this.pointer.dir = null;
  };

  _onKeyDown = (e) => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    this.keys.add(k);
    if (!this.enabled) {
      if (k === 'p' || k === 'escape') this.emit('key', { key: k });
      return;
    }
    const map = {
      arrowup: 'up', w: 'up',
      arrowdown: 'down', s: 'down',
      arrowleft: 'left', a: 'left',
      arrowright: 'right', d: 'right',
    };
    if (map[k]) this.emit('move', { dir: map[k], source: 'key', hold: true, fresh: true });
    if (k === ' ') this.emit('action');
    if (k === 'shift') this.emit('action', { dash: true });
    if (k === 'escape' || k === 'p') this.emit('pause');
    if (k === 'r') this.emit('restart');
    this.emit('key', { key: k });
  };

  _onKeyUp = (e) => {
    const k = e.key.toLowerCase();
    this.keys.delete(k);
    const map = { arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' };
    if (map[k]) this.emit('move', { dir: null, source: 'key', hold: false });
  };

  /** Draws the virtual joystick when the setting is on. */
  drawJoystick(ctx) {
    if (this.controlMode !== 'joystick' || !this.joystick.active) return;
    const j = this.joystick;
    const dx = clamp(j.x - j.cx, -j.r, j.r);
    const dy = clamp(j.y - j.cy, -j.r, j.r);
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(j.cx, j.cy, j.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#2fb7a8';
    ctx.beginPath();
    ctx.arc(j.cx + dx, j.cy + dy, j.r * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export default InputManager;
