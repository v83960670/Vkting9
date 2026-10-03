/**
 * ESCAPE 99 — canvas renderer
 * World-space layers (floor → hazards → actors → effects) plus screen-space
 * juice (vignette, danger edges, hurt flash, tutorial finger).
 */
import { TILE } from '../game/entities.js';
import { drawArin } from './arin.js';
import { clamp, TAU, lerp } from '../core/util.js';

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.c2d = canvas.getContext('2d', { alpha: false });
    this.polyfill();
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.flash = 0;
    this.flashColor = '255,80,80';
    this.hurtFlash = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 120));
  }

  polyfill() {
    const proto = CanvasRenderingContext2D.prototype;
    if (!proto.roundRect) {
      proto.roundRect = function (x, y, w, h, r) {
        const rr = typeof r === 'number' ? r : (r?.[0] ?? 0);
        this.moveTo(x + rr, y);
        this.lineTo(x + w - rr, y);
        this.quadraticCurveTo(x + w, y, x + w, y + rr);
        this.lineTo(x + w, y + h - rr);
        this.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
        this.lineTo(x + rr, y + h);
        this.quadraticCurveTo(x, y + h, x, y + h - rr);
        this.lineTo(x, y + rr);
        this.quadraticCurveTo(x, y, x + rr, y);
        return this;
      };
    }
    if (!proto.ellipse) {
      proto.ellipse = function (x, y, rx, ry, rot, a0, a1) {
        this.save();
        this.translate(x, y);
        this.rotate(rot || 0);
        this.scale(rx, ry);
        this.arc(0, 0, 1, a0, a1);
        this.restore();
        return this;
      };
    }
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width || window.innerWidth;
    const h = rect.height || window.innerHeight;
    // Cap DPR: 60fps on budget phones matters more than 3x sharpness.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.width = w;
    this.height = h;
  }

  /** Computes the world→screen transform so the whole room is visible. */
  fit(room, camera) {
    const roomW = room.W * TILE;
    const roomH = room.H * TILE;
    // Reserve a little room for the HUD bars.
    const padTop = Math.min(96, this.height * 0.09);
    const padBottom = Math.min(120, this.height * 0.12);
    const availH = Math.max(120, this.height - padTop - padBottom);
    let scale = Math.min(this.width / roomW, availH / roomH);
    if (scale <= 0 || !isFinite(scale)) scale = 1;
    this.scale = scale;
    this.viewport = { padTop, padBottom, availH };
    // The play area is always centred in what is left of the screen; the camera
    // only pans when a room is physically bigger than that area.
    this.offsetX = this.width / 2;
    this.offsetY = padTop + availH / 2;
    camera?.resize(this.width / scale, availH / scale, room.bounds);
  }

  /** World pixels → CSS pixels on the canvas. Handy for debugging and tests. */
  worldToScreen(x, y, camera) {
    return {
      x: this.offsetX + this.scale * (x - (-(camera?.x ?? 0))),
      y: this.offsetY + this.scale * (y - (-(camera?.y ?? 0))),
    };
  }

  startCamera(room, camera) {
    if (!camera) return;
    this.fit(room, camera);
    const roomW = room.W * TILE;
    const roomH = room.H * TILE;
    camera.snapTo(roomW / 2, roomH / 2);
  }

  begin(camera) {
    const c2d = this.c2d;
    c2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c2d.imageSmoothingEnabled = true;
    c2d.clearRect(0, 0, this.width, this.height);
    c2d.fillStyle = '#0b0806';
    c2d.fillRect(0, 0, this.width, this.height);
    return c2d;
  }

  beginWorld(camera) {
    const c2d = this.c2d;
    // The camera stores the *negated* centre of the view in world pixels, so
    // the world transform is:  screen = centre + scale * (world + camera)
    const cx = camera?.x ?? 0;
    const cy = camera?.y ?? 0;
    const shakeX = (camera?.ox ?? 0) / this.scale;
    const shakeY = (camera?.oy ?? 0) / this.scale;
    c2d.save();
    c2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c2d.translate(this.offsetX, this.offsetY);
    c2d.scale(this.scale, this.scale);
    c2d.translate(cx + shakeX, cy + shakeY);
    return c2d;
  }
  endWorld() {
    this.c2d.restore();
  }

  /** Screen-space atmosphere: vignette, danger pulse, damage flash. */
  overlay(dt, { danger = 0, t = 0, lowHearts = false, frozen = false, theme = null } = {}) {
    const c2d = this.c2d;
    const w = this.width;
    const h = this.height;
    c2d.save();
    c2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    // frame / letterbox
    if (theme) {
      c2d.fillStyle = 'rgba(0,0,0,0.55)';
      const roomH = this.roomH || 0;
      void roomH;
    }

    // vignette
    const g = c2d.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.45)');
    c2d.fillStyle = g;
    c2d.fillRect(0, 0, w, h);

    if (danger > 0.01) {
      const pulse = 0.28 + Math.sin(t * 6) * 0.12;
      const dg = c2d.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.28, w / 2, h / 2, Math.max(w, h) * 0.66);
      dg.addColorStop(0, 'rgba(255,40,20,0)');
      dg.addColorStop(1, `rgba(255,40,20,${clamp(danger * pulse, 0, 0.6)})`);
      c2d.fillStyle = dg;
      c2d.fillRect(0, 0, w, h);
    }
    if (lowHearts) {
      const pulse = 0.16 + Math.sin(t * 5) * 0.08;
      c2d.fillStyle = `rgba(200,20,40,${pulse})`;
      c2d.fillRect(0, 0, w, h);
    }
    if (this.hurtFlash > 0) {
      c2d.fillStyle = `rgba(255,60,60,${this.hurtFlash * 0.4})`;
      c2d.fillRect(0, 0, w, h);
      this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3);
    }
    if (frozen) {
      c2d.fillStyle = 'rgba(140,224,255,0.10)';
      c2d.fillRect(0, 0, w, h);
    }
    if (this.flash > 0) {
      c2d.fillStyle = `rgba(${this.flashColor},${this.flash})`;
      c2d.fillRect(0, 0, w, h);
      this.flash = Math.max(0, this.flash - dt * 2.6);
    }
    c2d.restore();
  }

  /** Animated "swipe here" finger for the first room. */
  /**
   * Draws Arin at his current interpolated position, plus the shield bubble.
   * The orchestrator decides *when*; the render layer decides *how*.
   */
  drawPlayer(c2d, player, { t = 0, look = null, escapePhase = false } = {}) {
    if (!player) return;
    drawArin(c2d, {
      x: player.px,
      y: player.py + 8,
      look: look || player.look,
      anim: player.anim,
      animT: player.animT,
      t,
      legPhase: player.stepPhase,
      speedNorm: player.moving ? 1 : 0,
      dir: player.dir,
      deathReason: player.deathReason,
      blinkT: player.blink,
      invuln: player.invuln,
      alpha: 1,
      danger: escapePhase,
    });
    if (player.shield > 0) {
      c2d.save();
      c2d.globalAlpha = 0.4 + Math.sin(t * 5) * 0.1;
      c2d.strokeStyle = '#8ce0ff';
      c2d.lineWidth = 2.4;
      c2d.beginPath();
      c2d.arc(player.px, player.py, 22, 0, TAU);
      c2d.stroke();
      c2d.globalAlpha = 0.14;
      c2d.fillStyle = '#8ce0ff';
      c2d.fill();
      c2d.restore();
    }
  }

  drawGestureHint(c2d, x, y, t, dir = 'up') {
    const k = (t * 0.6) % 1;
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
    const travel = 30;
    const px = x + d[0] * k * travel;
    const py = y + d[1] * k * travel;
    c2d.save();
    c2d.globalAlpha = clamp(Math.sin(k * Math.PI) * 1.2, 0, 1);
    c2d.translate(px, py);
    // finger
    c2d.fillStyle = 'rgba(255,255,255,0.9)';
    c2d.beginPath();
    c2d.ellipse(0, 0, 9, 12, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = 'rgba(255,255,255,0.55)';
    c2d.beginPath();
    c2d.ellipse(0, -14, 6, 10, 0, 0, TAU);
    c2d.fill();
    // arrow trail
    c2d.strokeStyle = 'rgba(255,220,120,0.85)';
    c2d.lineWidth = 3;
    c2d.lineCap = 'round';
    c2d.beginPath();
    c2d.moveTo(-d[0] * 10, -d[1] * 10);
    c2d.lineTo(-d[0] * 34, -d[1] * 34);
    c2d.stroke();
    c2d.restore();
    void lerp;
  }

  drawJoystick(input) {
    const c2d = this.c2d;
    c2d.save();
    c2d.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    input.drawJoystick(c2d);
    c2d.restore();
  }

  flashScreen(alpha = 0.5, color = '255,255,255') {
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = color;
  }
  hurt() {
    this.hurtFlash = 1;
  }
}

export default Renderer;
