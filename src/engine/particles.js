/**
 * ESCAPE 99 — particles + floating text
 * One pooled system for every effect (dust, sparks, confetti, smoke, shards).
 * Reused arrays = no GC churn on budget phones.
 */
import { TAU, rng, clamp } from '../core/util.js';

const MAX = 900;

const PRESETS = {
  dust: { count: 4, life: [0.25, 0.5], speed: [0.2, 0.9], size: [2, 4.5], colors: ['#d9cbb0', '#bfae90', '#efe3c9'], gravity: -0.35, drag: 3, shape: 'circle', fade: 1 },
  run: { count: 2, life: [0.2, 0.42], speed: [0.1, 0.6], size: [1.6, 3.4], colors: ['#e6dcc4', '#cbbfa4'], gravity: -0.2, drag: 4, shape: 'circle' },
  impact: { count: 12, life: [0.2, 0.5], speed: [1.4, 4], size: [2, 4], colors: ['#fff3c4', '#ffd45e', '#ffffff'], gravity: 4, drag: 2.4, shape: 'circle', glow: true },
  coin: { count: 7, life: [0.3, 0.6], speed: [1, 3], size: [2, 3.6], colors: ['#ffe066', '#ffc21f', '#fff6cf'], gravity: 5, drag: 1.6, shape: 'circle', glow: true },
  gem: { count: 22, life: [0.4, 0.9], speed: [1.4, 4.4], size: [2, 5], colors: ['#8ce0ff', '#dff6ff', '#b06bff', '#ffffff'], gravity: 1.2, drag: 1.2, shape: 'diamond', glow: true },
  key: { count: 24, life: [0.5, 1.1], speed: [1.2, 4.2], size: [2, 5], colors: ['#ffe066', '#fff6cf', '#ffb03d'], gravity: -0.4, drag: 1.4, shape: 'spark', glow: true },
  magic: { count: 18, life: [0.4, 0.9], speed: [0.6, 2.6], size: [2, 5], colors: ['#b06bff', '#e0c9ff', '#8ce0ff'], gravity: -0.6, drag: 1.6, shape: 'spark', glow: true },
  fire: { count: 10, life: [0.3, 0.8], speed: [0.6, 2.6], size: [3, 7], colors: ['#ff7a33', '#ffb03d', '#ffe066', '#e8562f'], gravity: -1.6, drag: 1.2, shape: 'circle', glow: true },
  smoke: { count: 6, life: [0.5, 1.2], speed: [0.3, 1.2], size: [5, 11], colors: ['#8a8a90', '#6b6b72', '#b0b0b6'], gravity: -0.5, drag: 1.1, shape: 'circle', fade: 1 },
  spikey: { count: 14, life: [0.25, 0.6], speed: [1.6, 4.6], size: [2, 4.6], colors: ['#e8eef7', '#9aa6b5', '#ffffff'], gravity: 6, drag: 2, shape: 'shard', glow: true },
  rock: { count: 16, life: [0.4, 1], speed: [1, 4], size: [3, 7], colors: ['#84663f', '#a3814f', '#5d4729'], gravity: 9, drag: 1.4, shape: 'shard' },
  confetti: {
    count: 40, life: [0.9, 1.9], speed: [2, 6.5], size: [3, 6],
    colors: ['#ff5470', '#ffd45e', '#2fb7a8', '#8ce0ff', '#b06bff', '#8fdc6a'],
    gravity: 3.4, drag: 0.9, shape: 'confetti', spin: 9,
  },
  splash: { count: 12, life: [0.3, 0.7], speed: [1.2, 3.6], size: [2, 5], colors: ['#7fdc6a', '#a8f08a', '#ffffff'], gravity: 4, drag: 2, shape: 'circle', glow: true },
  stun: { count: 14, life: [0.5, 1], speed: [1, 3], size: [3, 6], colors: ['#ffe066', '#ffffff', '#ffb03d'], gravity: -0.8, drag: 1.4, shape: 'star', spin: 6, glow: true },
  heal: { count: 14, life: [0.5, 1], speed: [0.6, 2], size: [3, 6], colors: ['#ff8fa3', '#ffd0d8', '#ffffff'], gravity: -1.4, drag: 1.4, shape: 'circle', glow: true },
  revive: { count: 26, life: [0.6, 1.3], speed: [1.4, 4], size: [3, 7], colors: ['#8ce0ff', '#ffffff', '#ffd45e'], gravity: -1.6, drag: 1.2, shape: 'spark', glow: true },
  dashTrail: { count: 6, life: [0.18, 0.4], speed: [0.4, 1.6], size: [3, 7], colors: ['#8ce0ff', '#ffffff'], gravity: 0, drag: 2.6, shape: 'circle', glow: true },
};

export class Particles {
  constructor(max = MAX) {
    this.max = max;
    this.pool = new Array(max);
    this.active = 0;
    for (let i = 0; i < max; i++) {
      this.pool[i] = { live: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, life: 0, maxLife: 1, size: 1, color: '#fff', gravity: 0, drag: 0, shape: 'circle', glow: false, spin: 0, rot: 0, fade: 1, alpha: 1 };
    }
    this.texts = [];
  }

  clear() {
    for (const p of this.pool) p.live = false;
    this.active = 0;
    this.texts.length = 0;
  }

  _get() {
    for (let i = 0; i < this.max; i++) {
      const p = this.pool[(this.active + i) % this.max];
      if (!p.live) {
        this.active = (this.active + i + 1) % this.max;
        return p;
      }
    }
    return this.pool[0]; // recycle oldest when saturated
  }

  spawn(opts) {
    const p = this._get();
    p.live = true;
    p.x = opts.x;
    p.y = opts.y;
    p.px = opts.x;
    p.py = opts.y;
    p.vx = opts.vx || 0;
    p.vy = opts.vy || 0;
    p.maxLife = opts.life ?? 0.5;
    p.life = p.maxLife;
    p.size = opts.size ?? 3;
    p.color = opts.color || '#fff';
    p.gravity = opts.gravity ?? 0;
    p.drag = opts.drag ?? 0;
    p.shape = opts.shape || 'circle';
    p.glow = !!opts.glow;
    p.spin = opts.spin ?? 0;
    p.rot = rng() * TAU;
    p.fade = opts.fade ?? 0;
    p.alpha = 1;
    return p;
  }

  /** Burst using a named preset. `scale` scales count + speed + size. */
  burst(x, y, preset = 'dust', opts = {}) {
    const def = PRESETS[preset] || PRESETS.dust;
    const scale = opts.scale ?? 1;
    const count = Math.max(1, Math.round((opts.count ?? def.count) * scale));
    const dirBias = opts.dir ?? null; // {x,y,spread}
    for (let i = 0; i < count; i++) {
      let ang = rng() * TAU;
      let spd = (def.speed[0] + rng() * (def.speed[1] - def.speed[0])) * (opts.speedScale ?? 1);
      if (dirBias) {
        const base = Math.atan2(dirBias.y, dirBias.x);
        const spread = dirBias.spread ?? 0.6;
        ang = base + (rng() - 0.5) * spread * 2;
        spd *= opts.dirSpeedScale ?? 1;
      }
      const color = opts.colors ? rng.pick(opts.colors) : rng.pick(def.colors);
      this.spawn({
        x: x + (rng() - 0.5) * (opts.spread ?? 6),
        y: y + (rng() - 0.5) * (opts.spread ?? 6),
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - (def.lift ?? 0),
        life: def.life[0] + rng() * (def.life[1] - def.life[0]),
        size: (def.size[0] + rng() * (def.size[1] - def.size[0])) * (opts.sizeScale ?? 1),
        color,
        gravity: def.gravity,
        drag: def.drag,
        shape: def.shape,
        glow: def.glow,
        spin: def.spin || 0,
        fade: def.fade || 0,
      });
    }
  }

  /** Small puff under Arin's feet. */
  step(x, y) {
    this.burst(x, y + 6, 'run', { count: 2, spread: 4 });
  }

  text(x, y, str, opts = {}) {
    this.texts.push({
      x, y,
      str,
      life: opts.life ?? 0.9,
      maxLife: opts.life ?? 0.9,
      vy: opts.vy ?? -34,
      color: opts.color || '#fff6cf',
      size: opts.size ?? 16,
      weight: opts.weight ?? 800,
      stroke: opts.stroke ?? 'rgba(0,0,0,0.55)',
    });
    if (this.texts.length > 40) this.texts.shift();
  }

  update(dt) {
    const pool = this.pool;
    for (let i = 0; i < this.max; i++) {
      const p = pool[i];
      if (!p.live) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.live = false;
        continue;
      }
      const drag = p.drag ? Math.max(0, 1 - p.drag * dt) : 1;
      p.vx *= drag;
      p.vy = p.vy * drag + p.gravity * 60 * dt;
      p.px = p.x;
      p.py = p.y;
      p.x += p.vx * 60 * dt;
      p.y += p.vy * 60 * dt;
      if (p.spin) p.rot += p.spin * dt;
      const k = p.life / p.maxLife;
      p.alpha = clamp(p.fade ? k * 1.1 : Math.min(1, k * 2.2), 0, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.94;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
  }

  draw(ctx) {
    const pool = this.pool;
    ctx.save();
    let glowPass = false;
    for (let i = 0; i < this.max; i++) {
      const p = pool[i];
      if (!p.live) continue;
      if (p.glow) {
        glowPass = true;
        continue;
      }
      this._drawOne(ctx, p);
    }
    if (glowPass) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.max; i++) {
        const p = pool[i];
        if (p.live && p.glow) this._drawOne(ctx, p);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  _drawOne(ctx, p) {
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    switch (p.shape) {
      case 'spark': {
        const len = p.size * 1.8;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(Math.atan2(p.vy, p.vx));
        ctx.fillRect(-len * 0.5, -p.size * 0.22, len, p.size * 0.44);
        ctx.restore();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.6, p.size * 0.7);
        ctx.lineTo(-p.size * 0.6, p.size * 0.7);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'diamond': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.moveTo(0, -p.size);
        ctx.lineTo(p.size * 0.72, 0);
        ctx.lineTo(0, p.size);
        ctx.lineTo(-p.size * 0.72, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'star': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        drawStarPath(ctx, p.size, p.size * 0.45, 5);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'confetti': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.size * 0.5, -p.size * 0.3, p.size, p.size * 0.6);
        ctx.restore();
        break;
      }
      default: {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx) {
    if (!this.texts.length) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      const pop = t.life > t.maxLife - 0.12 ? 1 + (t.maxLife - t.life) * 2.2 : 1;
      ctx.globalAlpha = a;
      ctx.font = `${t.weight} ${Math.round(t.size * pop)}px "Baloo 2", system-ui, sans-serif`;
      ctx.lineWidth = 3.4;
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
    }
    ctx.restore();
  }

  get liveCount() {
    let n = 0;
    for (const p of this.pool) if (p.live) n++;
    return n;
  }
}

export function drawStarPath(ctx, outer, inner, points = 5) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export default Particles;
