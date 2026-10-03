/**
 * ESCAPE 99 — camera
 * Mostly static (the whole room is usually visible) with gentle tracking for
 * tall rooms and trauma-based shake that is never uncomfortable.
 */
import { clamp, lerp, rng } from '../core/util.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.w = 0;
    this.h = 0;
    this.bounds = { x: 0, y: 0, w: 0, h: 0 };
    this.trauma = 0;
    this.shakeScale = 1;
    this.ox = 0;
    this.oy = 0;
    this._t = rng() * 100;
  }

  resize(w, h, bounds) {
    this.w = w;
    this.h = h;
    if (bounds) this.bounds = bounds;
  }

  addShake(amount) {
    this.trauma = clamp(this.trauma + amount * this.shakeScale, 0, 1);
  }

  setShakeScale(s) {
    this.shakeScale = s;
  }

  snapTo(x, y) {
    const { bounds } = this;
    this.x = bounds.w <= this.w ? -this.w / 2 : clamp(-x, -bounds.w + this.w / 2, -this.w / 2);
    this.y = bounds.h <= this.h ? -this.h / 2 : clamp(-y, -bounds.h + this.h / 2, -this.h / 2);
    this.ox = 0;
    this.oy = 0;
  }

  /** targetX/Y are world pixel coordinates of the thing to keep in view. */
  follow(targetX, targetY, dt, opts = {}) {
    const { bounds } = this;
    const ease = opts.ease ?? 6;
    const devX = opts.deadZoneX ?? 0;
    const devY = opts.deadZoneY ?? 0;
    let desiredX, desiredY;
    if (bounds.w <= this.w) desiredX = -this.w / 2;
    else {
      const cx = clamp(targetX, this.w / 2, bounds.w - this.w / 2);
      desiredX = -cx;
      void devX;
    }
    if (bounds.h <= this.h) desiredY = -this.h / 2;
    else {
      const cy = clamp(targetY, this.h / 2 - devY, bounds.h - this.h / 2 + devY);
      desiredY = -cy;
    }
    const k = 1 - Math.exp(-ease * dt);
    this.x = lerp(this.x, desiredX, k);
    this.y = lerp(this.y, desiredY, k);
  }

  update(dt) {
    this._t += dt;
    if (this.trauma > 0) {
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
      const amount = this.trauma * this.trauma;
      const amp = amount * 15 * this.shakeScale;
      const t = this._t * 34;
      this.ox = (Math.sin(t * 1.7) + Math.sin(t * 3.1) * 0.5) * amp * 0.6;
      this.oy = (Math.cos(t * 2.1) + Math.sin(t * 2.7) * 0.5) * amp * 0.6;
    } else {
      this.ox = 0;
      this.oy = 0;
    }
  }

  apply(ctx) {
    ctx.translate(Math.round(this.x + this.ox), Math.round(this.y + this.oy));
  }

  worldToScreen(x, y) {
    return { x: x + this.x + this.ox, y: y + this.y + this.oy };
  }
}

export default Camera;
