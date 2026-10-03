/**
 * ESCAPE 99 — room components (reusable level design system)
 * Every prop/hazard/enemy in a room is one of these. Levels are pure data.
 */
import { TAU, clamp, dist, lerp, ease, rng, makeRng } from '../core/util.js';
import { drawStarPath } from '../engine/particles.js';

export const TILE = 34; // world pixels per tile (rooms are 12 x 20 tiles)

/* ═══════════════════════════════ PICKUPS ═══════════════════════════════════ */
class Pickup {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.dead = false;
    this.radius = opts.radius ?? 0.5;
    this.bob = Math.random() * TAU;
    this.spawnT = 0.35;
    this.magnet = opts.magnet !== false;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  baseUpdate(dt) {
    this.bob += dt * 3;
    // Floor at exactly zero: the pop-in ramp is derived from this timer, so a
    // negative leftover would leave pickups permanently invisible.
    this.spawnT = Math.max(0, this.spawnT - dt);
  }
  /** 0 → just appeared, 1 → fully popped in. */
  get spawnK() {
    return clamp(1 - this.spawnT / 0.35, 0, 1);
  }
  touches(player) {
    return dist(player.px, player.py, this.px, this.py) < TILE * (this.radius + 0.42);
  }
}

export class Coin extends Pickup {
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.value = opts.value ?? 1;
    this.vy = 0;
    this.vx = 0;
    this.offsetY = 0;
    this.attract = 0;
    this.phase = Math.random() * TAU;
  }
  update(dt, ctx) {
    this.baseUpdate(dt);
    const { player, room } = ctx;
    const mag = room.magnetRadius;
    const d = dist(player.px, player.py, this.px, this.py + this.offsetY);
    if (this.magnet && d < TILE * mag) {
      this.attract = Math.min(1, this.attract + dt * 4);
      const a = Math.atan2(player.py - (this.py + this.offsetY), player.px - this.px);
      const pull = (1.2 + 7 * (1 - d / (TILE * mag))) * this.attract;
      this.x += (Math.cos(a) * pull * dt) / 1;
      this.y += (Math.sin(a) * pull * dt) / 1;
    }
    this.offsetY = Math.sin(this.bob + this.phase) * 2.4;
  }
  draw(c2d, { theme, t }) {
    const k = this.spawnK;
    const scale = 0.2 + 0.8 * ease.outBack(k);
    const y = this.py + this.offsetY;
    c2d.save();
    c2d.translate(this.px, y);
    c2d.scale(scale, scale);
    const tilt = Math.sin(this.bob * 0.7 + this.phase) * 0.22;
    c2d.rotate(Math.sin(this.bob * 0.5) * 0.05);
    c2d.globalAlpha = k;
    // glow
    c2d.globalAlpha *= 0.55;
    c2d.fillStyle = 'rgba(255,214,80,0.35)';
    c2d.beginPath();
    c2d.arc(0, 0, 12 + Math.sin(t * 4 + this.phase) * 1.6, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = k;
    // coin body
    const rx = Math.abs(Math.cos(tilt)) * 9 + 1.6;
    const grad = c2d.createLinearGradient(-rx, -9, rx, 9);
    grad.addColorStop(0, '#fff3c0');
    grad.addColorStop(0.45, '#ffd45e');
    grad.addColorStop(1, '#d99a12');
    c2d.fillStyle = grad;
    c2d.beginPath();
    c2d.ellipse(0, 0, rx, 9.5, 0, 0, TAU);
    c2d.fill();
    c2d.strokeStyle = '#a9760d';
    c2d.lineWidth = 1.6;
    c2d.stroke();
    if (rx > 4.2) {
      c2d.fillStyle = '#fff8dd';
      c2d.globalAlpha *= 0.85;
      c2d.beginPath();
      c2d.ellipse(-rx * 0.25, -2, rx * 0.24, 3.4, -0.3, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = k;
      // a stamped star, not a currency sign — the coin reads the same in every
      // language and on every platform font
      c2d.fillStyle = '#b9820f';
      drawStarPath(c2d, 4.1, 1.7, 5);
      c2d.fill();
    }
    c2d.restore();
  }
}

export class Gem extends Pickup {
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.phase = Math.random() * TAU;
    this.radius = 0.46;
  }
  update(dt) {
    this.baseUpdate(dt);
  }
  draw(c2d, { t }) {
    const s = this.spawnK;
    const y = this.py + Math.sin(this.bob * 0.8 + this.phase) * 3;
    c2d.save();
    c2d.translate(this.px, y);
    c2d.scale(ease.outBack(s), ease.outBack(s));
    c2d.globalAlpha = 0.5;
    c2d.fillStyle = 'rgba(140,224,255,0.4)';
    c2d.beginPath();
    c2d.arc(0, 0, 14 + Math.sin(t * 3 + this.phase) * 2, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    const g = c2d.createLinearGradient(0, -12, 0, 12);
    g.addColorStop(0, '#e9fbff');
    g.addColorStop(0.5, '#8ce0ff');
    g.addColorStop(1, '#3aa0d6');
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.moveTo(0, -13);
    c2d.lineTo(9, -3);
    c2d.lineTo(0, 13);
    c2d.lineTo(-9, -3);
    c2d.closePath();
    c2d.fill();
    c2d.strokeStyle = 'rgba(255,255,255,0.75)';
    c2d.lineWidth = 1.3;
    c2d.stroke();
    c2d.fillStyle = 'rgba(255,255,255,0.65)';
    c2d.beginPath();
    c2d.moveTo(0, -11);
    c2d.lineTo(5, -3);
    c2d.lineTo(0, 2);
    c2d.closePath();
    c2d.fill();
    c2d.restore();
  }
}

export class KeyItem extends Pickup {
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.radius = 0.55;
    this.phase = Math.random() * TAU;
  }
  draw(c2d, { t }) {
    const y = this.py + Math.sin(this.bob * 0.7 + this.phase) * 4;
    const glow = 0.45 + Math.sin(t * 3.4) * 0.16;
    c2d.save();
    c2d.translate(this.px, y);
    c2d.globalAlpha = glow;
    c2d.fillStyle = 'rgba(255,214,80,0.55)';
    c2d.beginPath();
    c2d.arc(0, 0, 20 + Math.sin(t * 3) * 3, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    c2d.rotate(Math.sin(this.bob * 0.5) * 0.18);
    const g = c2d.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, '#fff8dd');
    g.addColorStop(0.5, '#ffd45e');
    g.addColorStop(1, '#c98a12');
    c2d.fillStyle = g;
    c2d.strokeStyle = '#8d5f08';
    c2d.lineWidth = 1.6;
    c2d.beginPath();
    c2d.arc(0, -7, 6, 0, TAU);
    c2d.fill();
    c2d.stroke();
    c2d.beginPath();
    c2d.arc(0, -7, 2.6, 0, TAU);
    c2d.fillStyle = 'rgba(0,0,0,0.25)';
    c2d.fill();
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.rect(-2, -2, 4, 16);
    c2d.fill();
    c2d.stroke();
    c2d.beginPath();
    c2d.rect(2, 8, 6, 3.4);
    c2d.fill();
    c2d.stroke();
    c2d.beginPath();
    c2d.rect(2, 12.4, 4.6, 3.2);
    c2d.fill();
    c2d.stroke();
    c2d.restore();
  }
}

export class SwordPickup extends Pickup {
  constructor(x, y, opts = {}) {
    super(x, y, opts);
    this.radius = 0.6;
    this.magnet = false;
  }
  draw(c2d, { t }) {
    const y = this.py + Math.sin(this.bob * 0.6) * 3;
    c2d.save();
    c2d.translate(this.px, y);
    c2d.globalAlpha = 0.35 + Math.sin(t * 4) * 0.12;
    c2d.fillStyle = 'rgba(140,224,255,0.5)';
    c2d.beginPath();
    c2d.arc(0, 0, 22, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    // pedestal
    c2d.fillStyle = '#8a6f4d';
    c2d.beginPath();
    c2d.ellipse(0, 16, 15, 6, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = '#6d5638';
    c2d.fillRect(-13, 14, 26, 5);
    c2d.save();
    c2d.rotate(-0.5 + Math.sin(t * 2) * 0.03);
    // blade
    const g = c2d.createLinearGradient(-4, -22, 4, 6);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#d7e3ef');
    g.addColorStop(1, '#93a6b8');
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.moveTo(-3.4, 4);
    c2d.lineTo(3.4, 4);
    c2d.lineTo(2.2, -20);
    c2d.lineTo(0, -26);
    c2d.lineTo(-2.2, -20);
    c2d.closePath();
    c2d.fill();
    // guard + grip
    c2d.fillStyle = '#ffd45e';
    c2d.fillRect(-8, 3, 16, 3.6);
    c2d.fillStyle = '#6b4a2c';
    c2d.fillRect(-2.4, 6, 4.8, 10);
    c2d.fillStyle = '#ffd45e';
    c2d.beginPath();
    c2d.arc(0, 17, 3, 0, TAU);
    c2d.fill();
    c2d.restore();
    c2d.restore();
  }
}

export const POWERUP_META = {
  shield: { color: '#8ce0ff', icon: 'shield', label: 'SHIELD', dur: 0 },
  magnet: { color: '#ff8fa3', icon: 'magnet', label: 'MAGNET', dur: 9 },
  speed: { color: '#8fdc6a', icon: 'boots', label: 'SPEED', dur: 8 },
  freeze: { color: '#c9f2ff', icon: 'snow', label: 'FREEZE', dur: 5 },
  ghost: { color: '#e0c9ff', icon: 'ghost', label: 'GHOST', dur: 6 },
  double: { color: '#ffd45e', icon: 'double', label: 'x2 COINS', dur: 14 },
  fireSword: { color: '#ff7a33', icon: 'flame', label: 'FIRE SWORD', dur: 12 },
};

export class PowerUp extends Pickup {
  constructor(x, y, kind, opts = {}) {
    super(x, y, opts);
    this.kind = kind;
    this.meta = POWERUP_META[kind] || POWERUP_META.shield;
    this.radius = 0.6;
    this.magnet = false;
  }
  draw(c2d, { t }) {
    const y = this.py + Math.sin(this.bob * 0.9) * 3;
    c2d.save();
    c2d.translate(this.px, y);
    const pop = 1 + Math.sin(t * 3) * 0.06;
    c2d.scale(pop, pop);
    c2d.globalAlpha = 0.4;
    c2d.fillStyle = this.meta.color;
    c2d.beginPath();
    c2d.arc(0, 0, 19, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    c2d.fillStyle = 'rgba(20,16,24,0.72)';
    c2d.beginPath();
    c2d.arc(0, 0, 14, 0, TAU);
    c2d.fill();
    c2d.strokeStyle = this.meta.color;
    c2d.lineWidth = 2.4;
    c2d.stroke();
    drawPowerIcon(c2d, this.kind, 0, 0, 9, this.meta.color);
    c2d.restore();
  }
}

/** Vector power-up glyphs — readable at 20px on a phone. */
export function drawPowerIcon(c2d, kind, x, y, r, color = '#fff') {
  c2d.save();
  c2d.translate(x, y);
  c2d.fillStyle = color;
  c2d.strokeStyle = color;
  c2d.lineWidth = Math.max(1.4, r * 0.26);
  c2d.lineJoin = 'round';
  switch (kind) {
    case 'shield':
      c2d.beginPath();
      c2d.moveTo(0, -r);
      c2d.lineTo(r * 0.85, -r * 0.45);
      c2d.lineTo(r * 0.85, r * 0.2);
      c2d.quadraticCurveTo(r * 0.8, r, 0, r);
      c2d.quadraticCurveTo(-r * 0.8, r, -r * 0.85, r * 0.2);
      c2d.lineTo(-r * 0.85, -r * 0.45);
      c2d.closePath();
      c2d.fill();
      break;
    case 'magnet':
      c2d.beginPath();
      c2d.arc(0, r * 0.15, r * 0.72, Math.PI, 0);
      c2d.lineTo(r * 0.42, r * 0.75);
      c2d.lineTo(r * 0.15, r * 0.75);
      c2d.lineTo(r * 0.15, r * 0.15);
      c2d.lineTo(-r * 0.15, r * 0.15);
      c2d.lineTo(-r * 0.15, r * 0.75);
      c2d.lineTo(-r * 0.42, r * 0.75);
      c2d.lineTo(-r * 0.72, r * 0.15);
      c2d.closePath();
      c2d.fill();
      break;
    case 'boots':
      c2d.beginPath();
      c2d.moveTo(-r * 0.5, -r * 0.9);
      c2d.lineTo(-r * 0.05, -r * 0.9);
      c2d.lineTo(-r * 0.05, r * 0.25);
      c2d.lineTo(r * 0.8, r * 0.25);
      c2d.lineTo(r * 0.8, r * 0.85);
      c2d.lineTo(-r * 0.5, r * 0.85);
      c2d.closePath();
      c2d.fill();
      break;
    case 'snow':
      for (let i = 0; i < 3; i++) {
        c2d.save();
        c2d.rotate((i * Math.PI) / 3);
        c2d.beginPath();
        c2d.moveTo(-r * 0.9, 0);
        c2d.lineTo(r * 0.9, 0);
        c2d.stroke();
        c2d.restore();
      }
      break;
    case 'ghost':
      c2d.beginPath();
      c2d.arc(0, -r * 0.15, r * 0.75, Math.PI, 0);
      c2d.lineTo(r * 0.75, r * 0.75);
      for (let i = 0; i < 3; i++) {
        c2d.quadraticCurveTo(r * (0.5 - i * 0.5), r * 0.4, r * (0.25 - i * 0.5), r * 0.75);
      }
      c2d.closePath();
      c2d.fill();
      c2d.fillStyle = 'rgba(20,16,24,0.8)';
      c2d.beginPath();
      c2d.arc(-r * 0.28, -r * 0.2, r * 0.13, 0, TAU);
      c2d.arc(r * 0.28, -r * 0.2, r * 0.13, 0, TAU);
      c2d.fill();
      break;
    case 'double':
      c2d.font = `bold ${Math.round(r * 1.5)}px system-ui`;
      c2d.textAlign = 'center';
      c2d.textBaseline = 'middle';
      c2d.fillText('x2', 0, r * 0.06);
      break;
    case 'flame':
      c2d.beginPath();
      c2d.moveTo(0, -r);
      c2d.quadraticCurveTo(r * 0.85, -r * 0.1, r * 0.5, r * 0.45);
      c2d.quadraticCurveTo(r * 0.2, r, 0, r * 0.9);
      c2d.quadraticCurveTo(-r * 0.2, r, -r * 0.5, r * 0.45);
      c2d.quadraticCurveTo(-r * 0.85, -r * 0.1, 0, -r);
      c2d.fill();
      c2d.fillStyle = 'rgba(255,255,255,0.75)';
      c2d.beginPath();
      c2d.moveTo(0, -r * 0.15);
      c2d.quadraticCurveTo(r * 0.35, r * 0.35, 0, r * 0.6);
      c2d.quadraticCurveTo(-r * 0.35, r * 0.35, 0, -r * 0.15);
      c2d.fill();
      break;
    case 'sword':
      c2d.beginPath();
      c2d.moveTo(-r * 0.8, r * 0.8);
      c2d.lineTo(r * 0.5, -r * 0.5);
      c2d.lineTo(r * 0.85, -r * 0.85);
      c2d.lineTo(r * 0.2, -r * 0.6);
      c2d.lineTo(-r * 0.55, r * 0.35);
      c2d.closePath();
      c2d.fill();
      c2d.fillRect(-r * 0.95, r * 0.5, r * 0.7, r * 0.35);
      break;
    default:
      c2d.beginPath();
      c2d.arc(0, 0, r * 0.8, 0, TAU);
      c2d.fill();
  }
  c2d.restore();
}

/* ══════════════════════════════ INTERACTIVE ════════════════════════════════ */
export class ExitDoor {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.open = !!opts.open;
    this.anim = this.open ? 1 : 0;
    this.glowT = 0;
    this.enterT = 0;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  openUp(ctx) {
    if (this.open) return false;
    this.open = true;
    this.glowT = 2.4;
    ctx?.audio?.play('door');
    ctx?.haptics?.buzz('exit');
    ctx?.particles?.burst(this.px, this.py, 'impact', { count: 18, scale: 1.2 });
    ctx?.particles?.burst(this.px, this.py, 'dust', { count: 12, scale: 1.4 });
    return true;
  }
  update(dt) {
    const target = this.open ? 1 : 0;
    this.anim = clamp(lerp(this.anim, target, 1 - Math.exp(-7 * dt)), 0, 1);
    if (this.glowT > 0) this.glowT -= dt;
  }
  draw(c2d, { t, theme }) {
    const px = this.px;
    const py = this.py;
    const open = this.anim;
    c2d.save();
    c2d.translate(px, py);
    // frame
    c2d.fillStyle = '#3a2c1c';
    c2d.fillRect(-16, -18, 32, 36);
    c2d.fillStyle = '#5d4729';
    c2d.fillRect(-14, -16, 28, 32);
    if (open < 0.98) {
      const g = c2d.createLinearGradient(0, -16, 0, 16);
      if (this.open) {
        g.addColorStop(0, '#2fb7a8');
        g.addColorStop(1, '#0e6b62');
      } else {
        g.addColorStop(0, '#c4433a');
        g.addColorStop(1, '#8d1f1a');
      }
      c2d.fillStyle = g;
      c2d.fillRect(-12, -14, 24, 28);
      // stone slab lifting up as it opens
      c2d.save();
      c2d.translate(0, -open * 34);
      c2d.fillStyle = this.open ? '#6c8f78' : '#7d4038';
      c2d.fillRect(-12, -14, 24, 28);
      c2d.fillStyle = 'rgba(0,0,0,0.18)';
      for (let i = 0; i < 4; i++) c2d.fillRect(-12, -12 + i * 7, 24, 2);
      c2d.restore();
      // lock / keyhole
      if (!this.open) {
        c2d.fillStyle = '#2a1c10';
        c2d.beginPath();
        c2d.arc(0, -1, 4.6, 0, TAU);
        c2d.fill();
        c2d.fillRect(-1.8, 1, 3.6, 7);
        if (t % 1 < 0.5) {
          c2d.globalAlpha = 0.7;
          c2d.strokeStyle = '#ff6b5e';
          c2d.lineWidth = 1.6;
          c2d.beginPath();
          c2d.arc(0, -1, 8.5, 0, TAU);
          c2d.stroke();
          c2d.globalAlpha = 1;
        }
      }
    }
    if (open > 0.1) {
      // warm doorway light spilling out
      c2d.globalAlpha = open * (0.5 + Math.sin(t * 4) * 0.12);
      const g2 = c2d.createRadialGradient(0, 0, 2, 0, 0, 34);
      g2.addColorStop(0, 'rgba(255,240,180,0.75)');
      g2.addColorStop(1, 'rgba(255,200,80,0)');
      c2d.fillStyle = g2;
      c2d.beginPath();
      c2d.arc(0, 0, 34, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    // golden frame highlight when open
    c2d.strokeStyle = this.open ? '#ffd45e' : '#7a5a2c';
    c2d.lineWidth = 2.4;
    c2d.strokeRect(-16, -18, 32, 36);
    if (theme?.accent) {
      c2d.globalAlpha = 0.25 * (0.6 + Math.sin(t * 2.2) * 0.4) * (this.open ? 1 : 0.4);
      c2d.fillStyle = theme.accent;
      c2d.beginPath();
      c2d.arc(0, 0, 26, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    c2d.restore();
  }
}

export class Chest {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.opened = false;
    this.anim = 0;
    this.radius = 0.62;
    this.loot = opts.loot || { coins: 50, gemChance: 0.35, shard: true };
    this.big = !!opts.big;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  touches(player) {
    return dist(player.px, player.py, this.px, this.py) < TILE * 0.85;
  }
  update(dt) {
    this.anim = clamp(lerp(this.anim, this.opened ? 1 : 0, 1 - Math.exp(-8 * dt)), 0, 1);
  }
  draw(c2d, { t }) {
    const s = this.big ? 1.18 : 1;
    c2d.save();
    c2d.translate(this.px, this.py + 6);
    c2d.scale(s, s);
    c2d.globalAlpha = 0.42 + Math.sin(t * 3) * 0.1;
    c2d.fillStyle = this.opened ? 'rgba(255,214,80,0.25)' : 'rgba(255,170,60,0.5)';
    c2d.beginPath();
    c2d.arc(0, -2, 24, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    // base
    const g = c2d.createLinearGradient(0, -10, 0, 14);
    g.addColorStop(0, '#a4713a');
    g.addColorStop(1, '#6b4520');
    c2d.fillStyle = g;
    c2d.fillRect(-16, -6, 32, 20);
    c2d.strokeStyle = '#4b2f14';
    c2d.lineWidth = 1.6;
    c2d.strokeRect(-16, -6, 32, 20);
    // bands
    c2d.fillStyle = '#e0b34a';
    c2d.fillRect(-3, -6, 6, 20);
    c2d.fillStyle = '#c8942f';
    c2d.fillRect(-16, 6, 32, 3);
    // lid (rotates open)
    c2d.save();
    c2d.translate(0, -6);
    c2d.rotate(-this.anim * 1.15);
    const lg = c2d.createLinearGradient(0, -14, 0, 2);
    lg.addColorStop(0, '#c98a44');
    lg.addColorStop(1, '#8d5c28');
    c2d.fillStyle = lg;
    c2d.beginPath();
    c2d.moveTo(-16, 0);
    c2d.lineTo(-16, -6);
    c2d.quadraticCurveTo(0, -18, 16, -6);
    c2d.lineTo(16, 0);
    c2d.closePath();
    c2d.fill();
    c2d.strokeStyle = '#4b2f14';
    c2d.lineWidth = 1.6;
    c2d.stroke();
    c2d.fillStyle = '#e0b34a';
    c2d.fillRect(-3, -12, 6, 12);
    c2d.restore();
    // lock
    c2d.fillStyle = '#ffd45e';
    c2d.beginPath();
    c2d.arc(0, 0, 4, 0, TAU);
    c2d.fill();
    c2d.fillStyle = '#5a3a12';
    c2d.fillRect(-1.2, -0.5, 2.4, 3);
    if (!this.opened) {
      c2d.globalAlpha = 0.5 + Math.sin(t * 5) * 0.25;
      c2d.strokeStyle = '#fff3c0';
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.arc(0, 0, 15, 0, TAU);
      c2d.stroke();
      c2d.globalAlpha = 1;
    }
    c2d.restore();
  }
}

export class Switch {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.pressed = false;
    this.anim = 0;
    this.index = opts.index ?? 0;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  press(ctx) {
    if (this.pressed) return false;
    this.pressed = true;
    ctx?.audio?.play('switchOn');
    ctx?.haptics?.buzz('button');
    ctx?.particles?.burst(this.px, this.py, 'impact', { count: 12 });
    ctx?.particles?.text(this.px, this.py - 18, '✓', { color: '#8fdc6a', size: 22 });
    return true;
  }
  update(dt) {
    this.anim = clamp(lerp(this.anim, this.pressed ? 1 : 0, 1 - Math.exp(-9 * dt)), 0, 1);
  }
  draw(c2d, { t }) {
    c2d.save();
    c2d.translate(this.px, this.py);
    const on = this.anim;
    // plate
    c2d.fillStyle = '#3a2c1c';
    c2d.beginPath();
    c2d.ellipse(0, 3, 15, 12, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = on > 0.5 ? '#2fb7a8' : '#8d5f4a';
    c2d.beginPath();
    c2d.ellipse(0, 0, 13, 10, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = on > 0.5 ? '#7fe3d6' : '#c46b53';
    c2d.beginPath();
    c2d.ellipse(0, -on * 2.4, 10, 7.5, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = 'rgba(0,0,0,0.28)';
    c2d.beginPath();
    c2d.ellipse(0, -on * 2.4, 5.6, 4, 0, 0, TAU);
    c2d.fill();
    if (!this.pressed) {
      c2d.globalAlpha = 0.45 + Math.sin(t * 4) * 0.2;
      c2d.strokeStyle = '#ffe066';
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.arc(0, 0, 16, 0, TAU);
      c2d.stroke();
      c2d.globalAlpha = 1;
    } else {
      c2d.globalAlpha = 0.35;
      c2d.fillStyle = '#7fe3d6';
      c2d.beginPath();
      c2d.arc(0, 0, 17 + Math.sin(t * 3) * 2, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    c2d.restore();
  }
}

export class Gate {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.open = false;
    this.anim = 0;
    this.warned = false;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  openUp(ctx) {
    if (this.open) return false;
    this.open = true;
    ctx?.audio?.play('gate');
    ctx?.haptics?.buzz('exit');
    ctx?.particles?.burst(this.px, this.py, 'dust', { count: 12, scale: 1.2 });
    ctx?.game?.shake(0.3);
    return true;
  }
  update(dt) {
    this.anim = clamp(lerp(this.anim, this.open ? 1 : 0, 1 - Math.exp(-6 * dt)), 0, 1);
  }
  get solid() {
    return this.anim < 0.92;
  }
  draw(c2d, { t }) {
    c2d.save();
    c2d.translate(this.px, this.py);
    c2d.fillStyle = '#33261a';
    c2d.fillRect(-16, -17, 32, 34);
    if (this.anim < 0.98) {
      // portcullis bars slide up into the ceiling
      c2d.save();
      c2d.translate(0, -this.anim * 32);
      c2d.fillStyle = '#7d5e35';
      c2d.fillRect(-15, -16, 30, 32);
      c2d.fillStyle = '#4e381c';
      for (let i = -2; i <= 2; i++) c2d.fillRect(i * 6 - 1.6, -16, 3.2, 32);
      c2d.fillRect(-15, -4, 30, 3);
      c2d.fillRect(-15, 8, 30, 3);
      c2d.fillStyle = 'rgba(255,255,255,0.12)';
      c2d.fillRect(-15, -16, 30, 4);
      c2d.restore();
    }
    if (!this.open) {
      c2d.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
      c2d.strokeStyle = '#ff6b5e';
      c2d.lineWidth = 2;
      c2d.strokeRect(-16, -17, 32, 34);
      c2d.globalAlpha = 1;
    }
    c2d.strokeStyle = '#2a1c10';
    c2d.lineWidth = 2.4;
    c2d.strokeRect(-16, -17, 32, 34);
    c2d.restore();
  }
}

/* ════════════════════════════════ HAZARDS ══════════════════════════════════ */
export class SpikeTrap {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.phase = opts.phase ?? 0;
    this.period = opts.period ?? 1.5;
    this.cycle = 0;
    this.extended = 0; // 0..1 visual
    this.warn = 0;
    this.index = opts.index ?? 0;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  update(dt) {
    this.cycle = (this.cycle + dt / this.period) % 1;
    const p = (this.cycle + this.phase) % 1;
    // 0.0-0.55 safe, 0.55-0.78 warn, 0.78-1.0 up
    const up = p > 0.78;
    const warn = p > 0.55 && p <= 0.78;
    const targetUp = up ? 1 : 0;
    this.warn = warn ? Math.min(1, this.warn + dt * 5) : Math.max(0, this.warn - dt * 6);
    const k = up ? 18 : 22;
    this.extended = clamp(lerp(this.extended, targetUp, 1 - Math.exp(-k * dt)), 0, 1);
  }
  get lethal() {
    return this.extended > 0.45;
  }
  draw(c2d, { t, theme, highContrast }) {
    const px = this.px;
    const py = this.py;
    c2d.save();
    c2d.translate(px, py);
    // plate
    c2d.fillStyle = 'rgba(0,0,0,0.22)';
    c2d.fillRect(-TILE / 2 + 1, -TILE / 2 + 1, TILE - 2, TILE - 2);
    c2d.fillStyle = theme?.floorLine || '#a98a63';
    c2d.fillRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6);
    // warning glow + cracks
    const w = Math.max(this.warn, this.extended > 0.1 ? 0.7 : 0);
    if (w > 0.02) {
      c2d.globalAlpha = 0.25 + w * 0.5;
      c2d.fillStyle = highContrast ? '#ff2d2d' : '#ff6b5e';
      c2d.fillRect(-TILE / 2 + 3, -TILE / 2 + 3, TILE - 6, TILE - 6);
      c2d.globalAlpha = 1;
      c2d.strokeStyle = highContrast ? '#ff2d2d' : 'rgba(180,40,30,0.9)';
      c2d.lineWidth = 1.4;
      c2d.beginPath();
      c2d.moveTo(-TILE / 2 + 5, 0);
      c2d.lineTo(-4, -3);
      c2d.lineTo(2, 4);
      c2d.lineTo(TILE / 2 - 5, -2);
      c2d.stroke();
    }
    // spikes (draw behind/above based on extension)
    const e = this.extended;
    const count = 3;
    for (let i = 0; i < count; i++) {
      for (let j = 0; j < count; j++) {
        const sx = -TILE / 2 + 6 + (i * (TILE - 12)) / (count - 1);
        const sy = -TILE / 2 + 6 + (j * (TILE - 12)) / (count - 1);
        const h = 5 + e * 9;
        const g = c2d.createLinearGradient(sx, sy - h, sx, sy + 3);
        g.addColorStop(0, '#ffffff');
        g.addColorStop(0.5, '#d7e3ef');
        g.addColorStop(1, '#8c9aa8');
        c2d.fillStyle = g;
        c2d.beginPath();
        c2d.moveTo(sx, sy - h);
        c2d.lineTo(sx + 3.6, sy + 3);
        c2d.lineTo(sx - 3.6, sy + 3);
        c2d.closePath();
        c2d.fill();
        c2d.strokeStyle = 'rgba(60,70,80,0.6)';
        c2d.lineWidth = 0.8;
        c2d.stroke();
      }
    }
    if (this.warn > 0.1) {
      c2d.globalAlpha = this.warn * 0.85;
      c2d.strokeStyle = '#ffd45e';
      c2d.lineWidth = 2;
      c2d.strokeRect(-TILE / 2 + 2, -TILE / 2 + 2, TILE - 4, TILE - 4);
      c2d.globalAlpha = 1;
    }
    void t;
    c2d.restore();
  }
}

export class FireJet {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.phase = opts.phase ?? 0;
    this.period = opts.period ?? 2.6;
    this.onTime = opts.onTime ?? 1.1;
    this.warnTime = opts.warnTime ?? 0.5;
    this.cycle = 0;
    this.state = 'off';
    this.heat = 0;
    this.idx = Math.random() * 100;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  update(dt) {
    this.cycle = (this.cycle + dt) % this.period;
    const p = (this.cycle / this.period + this.phase) % 1;
    const onFrac = this.onTime / this.period;
    const warnFrac = this.warnTime / this.period;
    this.state = p < warnFrac ? 'warn' : p < warnFrac + onFrac ? 'on' : 'off';
    const target = this.state === 'on' ? 1 : 0;
    this.heat = clamp(lerp(this.heat, target, 1 - Math.exp(-(this.state === 'on' ? 14 : 8) * dt)), 0, 1.15);
  }
  get lethal() {
    return this.state === 'on' && this.heat > 0.4;
  }
  draw(c2d, { t, frozen }) {
    const px = this.px;
    const py = this.py;
    c2d.save();
    c2d.translate(px, py);
    // vent
    c2d.fillStyle = '#2b2320';
    c2d.beginPath();
    c2d.ellipse(0, 0, 14, 12, 0, 0, TAU);
    c2d.fill();
    c2d.fillStyle = '#4a3a32';
    c2d.beginPath();
    c2d.ellipse(0, 0, 10, 8.4, 0, 0, TAU);
    c2d.fill();
    const heat = this.heat;
    if (this.state === 'warn') {
      const w = 0.5 + Math.sin(t * 22) * 0.35;
      c2d.globalAlpha = w;
      c2d.fillStyle = frozen ? '#8ce0ff' : '#ff9f43';
      c2d.beginPath();
      c2d.arc(0, 0, 9 + w * 4, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    if (heat > 0.05) {
      const height = 30 * heat;
      const wob = Math.sin(t * 18 + this.idx) * 2.4;
      const g = c2d.createLinearGradient(0, 0, 0, -height);
      if (frozen) {
        g.addColorStop(0, 'rgba(200,240,255,0.95)');
        g.addColorStop(1, 'rgba(140,224,255,0)');
      } else {
        g.addColorStop(0, 'rgba(255,240,180,0.98)');
        g.addColorStop(0.4, 'rgba(255,150,40,0.9)');
        g.addColorStop(1, 'rgba(220,60,20,0)');
      }
      c2d.fillStyle = g;
      c2d.beginPath();
      c2d.moveTo(-10, 0);
      c2d.quadraticCurveTo(-13 + wob, -height * 0.6, wob, -height);
      c2d.quadraticCurveTo(13 + wob, -height * 0.6, 10, 0);
      c2d.closePath();
      c2d.fill();
      c2d.globalAlpha = 0.55;
      c2d.fillStyle = frozen ? '#ffffff' : 'rgba(255,255,220,0.9)';
      c2d.beginPath();
      c2d.ellipse(wob * 0.4, -height * 0.35, 4.4, 9 * heat, 0, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    c2d.restore();
  }
}

export class LavaPool {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.idx = Math.random() * 10;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  update() {}
  get lethal() {
    return true;
  }
  draw(c2d, { t, frozen }) {
    c2d.save();
    c2d.translate(this.px, this.py);
    const g = c2d.createLinearGradient(0, -TILE / 2, 0, TILE / 2);
    if (frozen) {
      g.addColorStop(0, '#dff6ff');
      g.addColorStop(1, '#8ce0ff');
    } else {
      g.addColorStop(0, '#ffb03d');
      g.addColorStop(0.5, '#ff5a1f');
      g.addColorStop(1, '#b5270c');
    }
    c2d.fillStyle = g;
    c2d.fillRect(-TILE / 2, -TILE / 2, TILE, TILE);
    c2d.globalAlpha = 0.35;
    c2d.fillStyle = frozen ? '#ffffff' : '#ffe066';
    const wob = Math.sin(t * 3 + this.idx) * 4;
    c2d.beginPath();
    c2d.ellipse(wob * 0.5, -2, 10, 5, 0, 0, TAU);
    c2d.ellipse(-wob, 5, 6, 3.4, 0, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    c2d.restore();
  }
}

export class MovingWall {
  constructor(def, opts = {}) {
    this.id = def.id;
    this.period = def.period ?? 5;
    this.warnTime = def.warn ?? 1.1;
    this.slideTime = def.slide ?? 0.75;
    this.positions = def.positions.map((cells) => cells.map(([x, y]) => ({ x, y })));
    this.index = 0;
    this.t = (def.phase ?? 0) * this.period;
    this.mode = 'idle';
    this.progress = 0;
    this.warnGlow = 0;
    this.fromCells = this.positions[0];
    this.currentCells = this.positions[0];
    void opts;
  }
  /** Cells this wall occupies right now (rounded — blocking is grid based). */
  get cells() {
    return this.mode === 'sliding' ? this.blendedCells : this.positions[this.index];
  }
  get blendedCells() {
    const next = this.positions[(this.index + 1) % this.positions.length];
    const out = [];
    for (let i = 0; i < this.fromCells.length; i++) {
      const a = this.fromCells[i];
      const b = next[i] || next[0];
      out.push({ x: Math.round(lerp(a.x, b.x, this.progress)), y: Math.round(lerp(a.y, b.y, this.progress)), ax: a.x, ay: a.y, bx: b.x, by: b.y });
    }
    return out;
  }
  update(dt, ctx) {
    this.t += dt;
    const p = this.t % this.period;
    const warnStart = this.period - this.warnTime - this.slideTime;
    if (p < warnStart) {
      if (this.mode !== 'idle') {
        this.mode = 'idle';
        this.warnGlow = 0;
      }
    } else if (p < warnStart + this.warnTime) {
      if (this.mode !== 'warn') {
        this.mode = 'warn';
        ctx?.audio?.play('button', {});
      }
      this.warnGlow = Math.min(1, this.warnGlow + dt * 4);
    } else {
      if (this.mode !== 'sliding') {
        this.mode = 'sliding';
        this.progress = 0;
        this.fromCells = this.positions[this.index];
        this.index = (this.index + 1) % this.positions.length;
        ctx?.game?.onWallsMove?.(this);
        ctx?.audio?.play('gate', {});
        ctx?.game?.shake(0.18);
      }
      this.warnGlow = 1;
      this.progress = clamp((p - warnStart - this.warnTime) / this.slideTime, 0, 1);
      if (this.progress >= 1 && this.mode === 'sliding' && p > warnStart + this.warnTime + this.slideTime) {
        this.mode = 'idle';
      }
    }
  }
  draw(c2d, { t, theme, tile }) {
    const cells = this.cells;
    const warn = this.mode === 'warn' ? 0.5 + Math.sin(t * 18) * 0.3 : 0;
    for (const c of cells) {
      const cx = (c.ax !== undefined ? lerp(c.ax, c.bx, this.progress) : c.x) * tile;
      const cy = (c.ay !== undefined ? lerp(c.ay, c.by, this.progress) : c.y) * tile;
      c2d.save();
      c2d.translate(cx, cy);
      // body
      const g = c2d.createLinearGradient(0, 0, 0, tile);
      g.addColorStop(0, theme?.wallTop || '#a3814f');
      g.addColorStop(1, theme?.wall || '#84663f');
      c2d.fillStyle = g;
      c2d.fillRect(1, 1, tile - 2, tile - 2);
      c2d.strokeStyle = theme?.wallEdge || '#5d4729';
      c2d.lineWidth = 2;
      c2d.strokeRect(1, 1, tile - 2, tile - 2);
      // rivets
      c2d.fillStyle = 'rgba(255,255,255,0.16)';
      c2d.fillRect(4, 4, tile - 8, 3);
      c2d.fillStyle = 'rgba(0,0,0,0.18)';
      c2d.beginPath();
      c2d.arc(tile / 2, tile / 2, 2.6, 0, TAU);
      c2d.fill();
      if (warn > 0) {
        c2d.globalAlpha = warn;
        c2d.fillStyle = '#ff6b5e';
        c2d.fillRect(1, 1, tile - 2, tile - 2);
        c2d.globalAlpha = 1;
        // direction arrows
        c2d.globalAlpha = 0.85;
        c2d.fillStyle = '#ffe066';
        const next = this.positions[(this.index + 1) % this.positions.length][0];
        const cur = this.positions[this.index][0];
        const ax = next.x - cur.x;
        const ay = next.y - cur.y;
        const d = Math.hypot(ax, ay) || 1;
        const ux = ax / d;
        const uy = ay / d;
        c2d.save();
        c2d.translate(tile / 2 + ux * 8, tile / 2 + uy * 8);
        c2d.rotate(Math.atan2(uy, ux));
        c2d.beginPath();
        c2d.moveTo(5, 0);
        c2d.lineTo(-2, 4.5);
        c2d.lineTo(-2, -4.5);
        c2d.closePath();
        c2d.fill();
        c2d.restore();
        c2d.globalAlpha = 1;
      }
      c2d.restore();
    }
  }
}

export class FireWall {
  constructor(def, opts = {}) {
    this.def = def;
    this.dir = def.dir === 'left' ? -1 : 1;
    this.speed = (def.speed ?? 2.2) * TILE;
    this.active = false;
    this.delay = def.delay ?? 1;
    this.delayLeft = this.delay;
    this.from = def.from || 'left';
    this.x = this.from === 'left' ? -1.2 * TILE : (opts.cols + 1.2) * TILE;
    this.rows = opts.rows;
    this.cols = opts.cols;
    this.h = opts.rows * TILE;
    this.intensity = 0;
    this.rumbleT = 0;
    this.jitter = 0;
    this.startedT = 0;
  }
  get px() {
    return this.x;
  }
  update(dt, ctx) {
    if (!this.active) {
      if (this.armed) {
        this.delayLeft -= dt;
        if (this.delayLeft <= 0) {
          this.active = true;
          ctx?.audio?.play('fire');
          ctx?.game?.shake(0.5);
          ctx?.game?.onFireWallStart?.();
        }
      }
      return;
    }
    this.startedT += dt;
    this.x += this.dir * this.speed * dt;
    this.jitter = Math.sin(this.startedT * 22) * 3;
    this.intensity = Math.min(1, this.intensity + dt * 2);
    // embers along the front
    if (Math.random() < dt * 30) {
      const yy = Math.random() * this.h;
      ctx?.particles?.spawn({
        x: this.x + (Math.random() - 0.5) * 20,
        y: yy,
        vx: -this.dir * (1 + Math.random() * 3),
        vy: -1 - Math.random() * 2,
        life: 0.4 + Math.random() * 0.5,
        size: 2 + Math.random() * 3,
        color: ['#ffb03d', '#ff7a33', '#ffe066'][Math.floor(Math.random() * 3)],
        gravity: -0.4,
        drag: 1.2,
        glow: true,
      });
    }
    this.rumbleT += dt;
    if (this.rumbleT > 0.45) {
      this.rumbleT = 0;
      ctx?.audio?.play('fire');
    }
  }
  covers(px, py) {
    if (!this.active) return false;
    const front = this.x;
    if (this.dir > 0) return px < front && py >= 0 && py <= this.h;
    return px > front && py >= 0 && py <= this.h;
  }
  draw(c2d, { t }) {
    if (!this.active && !this.armed) return;
    const w = 34;
    const x = this.x + this.jitter + (this.dir > 0 ? -w : 0);
    c2d.save();
    // mass of flame
    const g = c2d.createLinearGradient(x, 0, x + w, 0);
    if (this.dir > 0) {
      g.addColorStop(0, 'rgba(180,30,10,0.85)');
      g.addColorStop(0.55, 'rgba(255,110,20,0.9)');
      g.addColorStop(1, 'rgba(255,240,180,0.98)');
    } else {
      g.addColorStop(0, 'rgba(255,240,180,0.98)');
      g.addColorStop(0.45, 'rgba(255,110,20,0.9)');
      g.addColorStop(1, 'rgba(180,30,10,0.85)');
    }
    c2d.fillStyle = g;
    c2d.fillRect(x, -20, w, this.h + 40);
    // licking tongues
    c2d.globalAlpha = 0.85;
    c2d.fillStyle = 'rgba(255,220,120,0.8)';
    for (let i = 0; i < this.rows; i++) {
      const yy = i * TILE + TILE / 2;
      const wob = Math.sin(t * 9 + i * 1.7) * 6;
      c2d.beginPath();
      c2d.ellipse(x + (this.dir > 0 ? w - 6 : 6) + wob * 0.4, yy, 8 + wob, TILE * 0.42, 0, 0, TAU);
      c2d.fill();
    }
    c2d.globalAlpha = 1;
    if (!this.active) {
      // pre-warning ember line
      c2d.globalAlpha = 0.4 + Math.sin(t * 12) * 0.2;
      c2d.fillStyle = '#ff6b5e';
      c2d.fillRect(x + (this.dir > 0 ? 0 : -8), 0, 8, this.h);
      c2d.globalAlpha = 1;
    }
    c2d.restore();
  }
}

export class Slime {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.hx = x;
    this.hy = y;
    this.type = opts.type || 'slime';
    this.axis = opts.axis || 'x';
    this.range = opts.range ?? 3;
    this.speed = (opts.speed ?? 1.7) * TILE;
    this.dir = opts.dir ?? (Math.random() < 0.5 ? -1 : 1);
    this.hp = opts.hp ?? 2;
    this.maxHp = this.hp;
    this.dead = false;
    this.squash = 0;
    this.hitFlash = 0;
    this.frozen = 0;
    this.alert = 0;
    this.hop = Math.random() * TAU;
    this.deathT = 0;
    this.home = { x, y };
    this.coins = opts.coins ?? 3;
    this.variant = opts.variant || 'green';
    this.rng = makeRng(Math.floor(x * 977 + y * 131 + 7));
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  hit(damage, ctx, dirVec) {
    if (this.dead) return false;
    this.hp -= damage;
    this.hitFlash = 0.3;
    this.squash = 1;
    ctx?.audio?.play('hit');
    ctx?.game?.shake(0.12);
    ctx?.particles?.burst(this.px, this.py, 'splash', { count: 10 });
    if (dirVec) {
      this.knock = { x: dirVec.x * 0.35, y: dirVec.y * 0.35, t: 0.16 };
    }
    if (this.hp <= 0) this.die(ctx);
    return true;
  }
  die(ctx) {
    this.dead = true;
    this.deathT = 0.5;
    ctx?.audio?.play('enemyDie');
    ctx?.haptics?.buzz('coin');
    ctx?.particles?.burst(this.px, this.py, 'splash', { count: 22, scale: 1.2 });
    ctx?.particles?.burst(this.px, this.py, 'coin', { count: 6 });
    ctx?.game?.onEnemyDefeated?.(this);
  }
  update(dt, ctx) {
    const { room, player } = ctx;
    if (this.dead) {
      this.deathT -= dt;
      return;
    }
    if (this.hitFlash > 0) this.hitFlash -= dt;
    this.squash = Math.max(0, this.squash - dt * 4);
    this.hop += dt * (4 + this.speed / TILE);
    if (this.knock) {
      this.knock.t -= dt;
      if (this.knock.t > 0) {
        const nx = this.x + this.knock.x * dt * 2;
        const ny = this.y + this.knock.y * dt * 2;
        if (!room.blockedFor(this, nx, ny)) {
          this.x = nx;
          this.y = ny;
        }
      } else this.knock = null;
    }
    if (player.freezeTime > 0 || room.freezeTime > 0) {
      this.frozen = 0.2;
      return;
    }
    this.frozen = Math.max(0, this.frozen - dt);
    const d = dist(this.px, this.py, player.px, player.py);
    const chaseRange = TILE * 4.4;
    if (d < chaseRange && !player.dead) {
      this.alert = Math.min(1, this.alert + dt * 2);
      const dx = player.px - this.px;
      const dy = player.py - this.py;
      const len = Math.hypot(dx, dy) || 1;
      const sp = this.speed * 0.72;
      const nx = this.x + (dx / len) * (sp / TILE) * dt;
      const ny = this.y + (dy / len) * (sp / TILE) * dt;
      if (!room.blockedFor(this, nx, this.y)) this.x = nx;
      if (!room.blockedFor(this, this.x, ny)) this.y = ny;
      this.dir = dx < 0 ? -1 : 1;
    } else {
      this.alert = Math.max(0, this.alert - dt);
      const sp = this.speed;
      const nd = this.axis === 'x' ? this.x + (this.dir * sp * dt) / TILE : this.y + (this.dir * sp * dt) / TILE;
      const probe = this.axis === 'x' ? { x: nd + (this.dir > 0 ? 0.35 : -0.35), y: this.y } : { x: this.x, y: nd + (this.dir > 0 ? 0.35 : -0.35) };
      const outOfRange = Math.abs((this.axis === 'x' ? nd : nd) - (this.axis === 'x' ? this.hx : this.hy)) > this.range;
      if (room.blockedFor(this, probe.x, probe.y) || outOfRange) {
        this.dir *= -1;
        this.squash = 0.5;
      } else if (this.axis === 'x') this.x = nd;
      else this.y = nd;
    }
  }
  get solid() {
    return false;
  }
  get hitbox() {
    return { x: this.x + 0.18, y: this.y + 0.2, w: 0.64, h: 0.6 };
  }
  draw(c2d, { t, frozenActive }) {
    const px = this.px;
    const py = this.py;
    const hop = Math.abs(Math.sin(this.hop)) * 3;
    const sq = this.squash;
    const sx = 1 + sq * 0.35;
    const sy = 1 - sq * 0.3;
    c2d.save();
    c2d.translate(px, py + 6 - hop);
    // shadow
    c2d.globalAlpha = 0.25;
    c2d.fillStyle = '#000';
    c2d.beginPath();
    c2d.ellipse(0, 12 + hop, 14, 5, 0, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    c2d.scale(sx, sy);
    const isFrozen = frozenActive || this.frozen > 0;
    const bodyCol = isFrozen ? '#9fd8ef' : this.variant === 'ice' ? '#9fd8ef' : this.variant === 'fire' ? '#ff8a4a' : '#7fdc6a';
    const darkCol = isFrozen ? '#6fb6d6' : this.variant === 'ice' ? '#6fb6d6' : this.variant === 'fire' ? '#d9532a' : '#4faa3c';
    const g = c2d.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, bodyCol);
    g.addColorStop(1, darkCol);
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.moveTo(-15, 8);
    c2d.quadraticCurveTo(-17, -14, 0, -15);
    c2d.quadraticCurveTo(17, -14, 15, 8);
    c2d.quadraticCurveTo(9, 15, 0, 13);
    c2d.quadraticCurveTo(-9, 15, -15, 8);
    c2d.closePath();
    c2d.fill();
    // highlight
    c2d.globalAlpha = 0.35;
    c2d.fillStyle = '#ffffff';
    c2d.beginPath();
    c2d.ellipse(-5, -8, 4.6, 3, -0.4, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    // eyes
    const look = this.alert > 0.3 ? (this.dir > 0 ? 1.6 : -1.6) : 0;
    const eyeCol = this.alert > 0.5 ? '#ff3b30' : '#20301c';
    c2d.fillStyle = '#ffffff';
    c2d.beginPath();
    c2d.ellipse(-5.4, -3, 4.4, isFrozen ? 2.6 : 4.6, 0, 0, TAU);
    c2d.ellipse(5.4, -3, 4.4, isFrozen ? 2.6 : 4.6, 0, 0, TAU);
    c2d.fill();
    if (!isFrozen) {
      c2d.fillStyle = eyeCol;
      c2d.beginPath();
      c2d.arc(-5.4 + look, -2.4, 2.2, 0, TAU);
      c2d.arc(5.4 + look, -2.4, 2.2, 0, TAU);
      c2d.fill();
    }
    // mouth
    c2d.strokeStyle = 'rgba(20,40,18,0.7)';
    c2d.lineWidth = 1.6;
    c2d.beginPath();
    if (this.alert > 0.5) {
      c2d.arc(0, 4, 4, 0, Math.PI);
    } else {
      c2d.moveTo(-3, 4);
      c2d.quadraticCurveTo(0, 7, 3, 4);
    }
    c2d.stroke();
    // crown blob / horns for interest
    c2d.globalAlpha = 0.5;
    c2d.fillStyle = bodyCol;
    c2d.beginPath();
    c2d.arc(0, -13, 3.4, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = 1;
    if (this.hitFlash > 0) {
      c2d.globalAlpha = Math.min(1, this.hitFlash * 3);
      c2d.fillStyle = '#ffffff';
      c2d.beginPath();
      c2d.moveTo(-15, 8);
      c2d.quadraticCurveTo(-17, -14, 0, -15);
      c2d.quadraticCurveTo(17, -14, 15, 8);
      c2d.quadraticCurveTo(9, 15, 0, 13);
      c2d.quadraticCurveTo(-9, 15, -15, 8);
      c2d.closePath();
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    if (isFrozen) {
      c2d.globalAlpha = 0.55;
      c2d.fillStyle = '#dff6ff';
      c2d.beginPath();
      c2d.arc(0, 0, 18, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    // hp pips
    if (this.hp < this.maxHp) {
      for (let i = 0; i < this.maxHp; i++) {
        c2d.fillStyle = i < this.hp ? '#ff6b5e' : 'rgba(255,255,255,0.25)';
        c2d.beginPath();
        c2d.arc(-6 + i * 6, -22, 2.4, 0, TAU);
        c2d.fill();
      }
    }
    void t;
    c2d.restore();
  }
}

export class Boulder {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.seed = Math.random() * 10;
  }
}

export class FallingRock {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.warn = opts.warn ?? 1.0;
    this.state = 'warn';
    this.t = 0;
    this.impactT = 0;
    this.rotation = Math.random() * TAU;
    this.size = opts.size ?? 15;
    this.dead = false;
    this.lethalNow = false;
  }
  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  update(dt, ctx) {
    this.t += dt;
    if (this.state === 'warn') {
      if (this.t >= this.warn) {
        this.state = 'fall';
        this.t = 0;
        this.lethalNow = true;
        ctx?.audio?.play('rock');
        ctx?.game?.shake(0.22);
        ctx?.particles?.burst(this.px, this.py, 'rock', { count: 12, scale: 1 });
      }
    } else if (this.state === 'fall') {
      if (this.t > 0.14) {
        this.state = 'ground';
        this.t = 0;
        this.lethalNow = false;
        ctx?.particles?.burst(this.px, this.py, 'rock', { count: 14, scale: 1.3 });
        ctx?.particles?.burst(this.px, this.py, 'dust', { count: 10, scale: 1.4 });
        ctx?.game?.shake(0.3);
      }
    } else {
      this.impactT += dt;
      if (this.t > 0.45) this.dead = true;
    }
  }
  draw(c2d, { t }) {
    const px = this.px;
    const py = this.py;
    c2d.save();
    c2d.translate(px, py);
    if (this.state === 'warn') {
      const k = clamp(this.t / this.warn, 0, 1);
      c2d.globalAlpha = 0.35 + k * 0.45;
      c2d.fillStyle = '#ff3b30';
      c2d.beginPath();
      c2d.ellipse(0, 4, 15 * (0.5 + k * 0.5), 7 * (0.5 + k * 0.5), 0, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 0.9;
      c2d.strokeStyle = '#ffe066';
      c2d.lineWidth = 2;
      c2d.beginPath();
      c2d.arc(0, 4, 15 * k, 0, TAU);
      c2d.stroke();
    } else if (this.state === 'fall') {
      const k = this.t / 0.14;
      c2d.globalAlpha = 0.9;
      c2d.fillStyle = '#5d4729';
      c2d.beginPath();
      c2d.ellipse(0, 6, 12, 6, 0, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
      drawRock(c2d, 0, -140 + k * 140, this.size, this.rotation + k * 2);
    } else {
      const k = clamp(this.t / 0.45, 0, 1);
      c2d.globalAlpha = 0.9 - k * 0.5;
      c2d.translate(0, k * 6);
      c2d.scale(1 + k * 0.25, Math.max(0.35, 1 - k * 0.5));
      drawRock(c2d, 0, 0, this.size, this.rotation);
      c2d.globalAlpha = 1;
    }
    void t;
    c2d.restore();
  }
}

export function drawRock(c2d, x, y, r, rot = 0) {
  c2d.save();
  c2d.translate(x, y);
  c2d.rotate(rot);
  const g = c2d.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#9a7f52');
  g.addColorStop(0.5, '#6f5735');
  g.addColorStop(1, '#4a3822');
  c2d.fillStyle = g;
  c2d.beginPath();
  const pts = 9;
  for (let i = 0; i < pts; i++) {
    const a = (i / pts) * TAU;
    const rr = r * (0.82 + ((i * 37) % 10) / 40);
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) c2d.moveTo(px, py);
    else c2d.lineTo(px, py);
  }
  c2d.closePath();
  c2d.fill();
  c2d.strokeStyle = 'rgba(40,28,16,0.75)';
  c2d.lineWidth = 1.6;
  c2d.stroke();
  c2d.globalAlpha = 0.28;
  c2d.fillStyle = '#ffffff';
  c2d.beginPath();
  c2d.ellipse(-r * 0.28, -r * 0.3, r * 0.34, r * 0.22, -0.4, 0, TAU);
  c2d.fill();
  c2d.globalAlpha = 1;
  c2d.restore();
}

export function drawHeart(c2d, x, y, s, filled = true) {
  c2d.save();
  c2d.translate(x, y);
  c2d.beginPath();
  c2d.moveTo(0, s * 0.75);
  c2d.bezierCurveTo(-s * 1.25, -s * 0.15, -s * 0.6, -s * 1.05, 0, -s * 0.35);
  c2d.bezierCurveTo(s * 0.6, -s * 1.05, s * 1.25, -s * 0.15, 0, s * 0.75);
  c2d.closePath();
  if (filled) {
    const g = c2d.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, '#ff8296');
    g.addColorStop(1, '#e0243f');
    c2d.fillStyle = g;
  } else {
    c2d.fillStyle = 'rgba(0,0,0,0.35)';
  }
  c2d.fill();
  c2d.strokeStyle = filled ? 'rgba(120,10,25,0.75)' : 'rgba(255,255,255,0.35)';
  c2d.lineWidth = Math.max(1, s * 0.16);
  c2d.stroke();
  c2d.restore();
}

export function drawStarIcon(c2d, x, y, r, filled = true, color = '#ffd45e') {
  c2d.save();
  c2d.translate(x, y);
  drawStarPath(c2d, r, r * 0.46, 5);
  if (filled) {
    const g = c2d.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#fff3c0');
    g.addColorStop(1, color);
    c2d.fillStyle = g;
  } else {
    c2d.fillStyle = 'rgba(0,0,0,0.3)';
  }
  c2d.fill();
  c2d.strokeStyle = filled ? 'rgba(150,100,10,0.8)' : 'rgba(255,255,255,0.3)';
  c2d.lineWidth = Math.max(1, r * 0.18);
  c2d.stroke();
  c2d.restore();
}

export { ease, clamp, lerp, dist, rng };
