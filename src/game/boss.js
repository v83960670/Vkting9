/**
 * ESCAPE 99 — THE STONE GUARDIAN (Room 10 boss)
 * Three patterns on a loop: Ground Slam → Rock Fall → Charge.
 * Dodging the charge into a wall leaves it STUNNED for ~3s — that is your window.
 */
import { TILE } from './entities.js';
import { clamp, dist, lerp, TAU, makeRng } from '../core/util.js';

const STATE = {
  DORMANT: 'dormant',
  INTRO: 'intro',
  IDLE: 'idle',
  TELEGRAPH: 'telegraph',
  SLAM: 'slam',
  RECHARGE: 'recharge',
  CHARGE: 'charge',
  STUNNED: 'stunned',
  HURT: 'hurt',
  DYING: 'dying',
  DEAD: 'dead',
};

export const BOSS_STATE = STATE;

export class StoneGuardian {
  constructor(cfg = {}, room) {
    this.cfg = cfg;
    this.room = room;
    this.maxHp = cfg.hp ?? 3;
    this.hp = this.maxHp;
    this.size = 2; // tiles
    this.x = ((cfg.spawn?.x ?? 5) + 1) * TILE; // pixel centre
    this.y = ((cfg.spawn?.y ?? 4) + 1) * TILE;
    this.px = this.x;
    this.py = this.y;
    this.state = STATE.DORMANT;
    this.t = 0;
    this.stateT = 0;
    this.patternIndex = 0;
    this.patterns = cfg.patterns || ['slam', 'rocks', 'charge'];
    this.stunTime = cfg.stunTime ?? 3;
    this.targets = [];
    this.chargeDir = { x: 0, y: 1 };
    this.chargeHits = 0;
    this.eyeGlow = 0;
    this.slamRaise = 0;
    this.hitFlash = 0;
    this.cracks = 0;
    this.breathe = 0;
    this.rockTimer = 0;
    this.dead = false;
    this.rng = makeRng(4242);
    this.armSwing = 0;
    this.parts = [];
    this.onEvent = null; // set by the game
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      this.parts.push({ a, r: 30 + this.rng() * 22, s: 6 + this.rng() * 10, spin: (this.rng() - 0.5) * 6, off: 0 });
    }
  }

  /** The 2x2 tiles the boss occupies (used as soft collision). */
  get cells() {
    const cx = Math.floor(this.x / TILE);
    const cy = Math.floor(this.y / TILE);
    return [
      { x: cx, y: cy },
      { x: cx + 1, y: cy },
      { x: cx, y: cy + 1 },
      { x: cx + 1, y: cy + 1 },
    ];
  }

  get blocking() {
    return [STATE.DORMANT, STATE.INTRO, STATE.IDLE, STATE.TELEGRAPH, STATE.STUNNED, STATE.HURT, STATE.DYING, STATE.DEAD].includes(this.state);
  }

  emit(name, data) {
    this.onEvent?.(name, data);
  }

  wake(ctx) {
    if (this.state !== STATE.DORMANT) return;
    this.state = STATE.INTRO;
    this.stateT = 1.6;
    ctx?.audio?.play('roar');
    ctx?.haptics?.buzz('boss');
    ctx?.game?.shake(0.6);
    ctx?.particles?.burst(this.x, this.y, 'rock', { count: 22, scale: 1.4 });
    this.emit('wake');
  }

  update(dt, ctx) {
    this.t += dt;
    this.breathe += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.eyeGlow > 0) this.eyeGlow -= dt;
    const player = ctx.player;

    switch (this.state) {
      case STATE.DORMANT: {
        // Rumble awake when the player gets close.
        if (player && dist(this.x, this.y, player.px, player.py) < TILE * 7) this.wake(ctx);
        break;
      }
      case STATE.INTRO: {
        this.stateT -= dt;
        if (this.stateT <= 0) this._nextPattern(ctx);
        break;
      }
      case STATE.IDLE: {
        this.stateT -= dt;
        // drift slowly toward the exit side to block the door
        const targetY = ((this.cfg.spawn?.y ?? 4) + 1) * TILE;
        this.y = lerp(this.y, targetY, 1 - Math.exp(-2 * dt));
        const dx = player ? player.px - this.x : 0;
        this.x = lerp(this.x, clamp(this.x + Math.sign(dx) * 6, TILE * 2, (this.room.W - 2) * TILE), 1 - Math.exp(-1.6 * dt));
        if (this.stateT <= 0) this._nextPattern(ctx);
        break;
      }
      case STATE.TELEGRAPH: {
        this.stateT -= dt;
        if (this.pending === 'slam') this.slamRaise = Math.min(1, this.slamRaise + dt * 3.4);
        if (this.stateT <= 0) {
          if (this.pending === 'slam') this._doSlam(ctx);
          else if (this.pending === 'charge') this._startCharge(ctx);
        }
        break;
      }
      case STATE.RECHARGE: {
        this.stateT -= dt;
        if (this.stateT <= 0) this._nextPattern(ctx);
        break;
      }
      case STATE.SLAM: {
        this.stateT -= dt;
        this.slamRaise = Math.max(0, this.slamRaise - dt * 6);
        if (this.stateT <= 0) {
          this.state = STATE.RECHARGE;
          this.stateT = 0.55;
        }
        break;
      }
      case STATE.CHARGE: {
        const speed = (this.cfg.charge?.speed ?? 9.5) * TILE;
        const nx = this.x + this.chargeDir.x * speed * dt;
        const ny = this.y + this.chargeDir.y * speed * dt;
        const hitWall = this._blockedAt(nx, ny);
        // contact damage with knockback
        if (player && !player.dead && dist(nx, ny, player.px, player.py) < TILE * 1.35) {
          if (player.damage(1, 'boss', ctx)) {
            player.invuln = Math.max(player.invuln, 1.4);
            this.chargeHits++;
            ctx.particles?.burst(player.px, player.py, 'impact', { count: 18, scale: 1.3 });
            ctx.game?.shake(0.5);
          }
        }
        if (hitWall) {
          this.state = STATE.STUNNED;
          this.stateT = this.stunTime;
          ctx.audio?.play('bossHit');
          ctx.haptics?.buzz('boss');
          ctx.game?.shake(0.85);
          ctx.game?.onBossStunned?.(this);
          ctx.particles?.burst(this.x + this.chargeDir.x * 30, this.y + this.chargeDir.y * 30, 'rock', { count: 26, scale: 1.5 });
          ctx.particles?.burst(this.x, this.y, 'stun', { count: 18, scale: 1.2 });
        } else {
          this.x = nx;
          this.y = ny;
          if (Math.random() < dt * 30) {
            ctx.particles?.burst(this.x - this.chargeDir.x * 26, this.y - this.chargeDir.y * 26, 'dust', { count: 3, scale: 1.2 });
          }
        }
        break;
      }
      case STATE.STUNNED: {
        this.stateT -= dt;
        if (Math.random() < dt * 6) {
          ctx.particles?.spawn({
            x: this.x + (Math.random() - 0.5) * 50,
            y: this.y - 40,
            vx: (Math.random() - 0.5) * 0.8,
            vy: -0.4,
            life: 0.7,
            size: 3,
            color: '#ffe066',
            gravity: -0.2,
            drag: 1,
            shape: 'star',
            spin: 4,
            glow: true,
          });
        }
        if (this.stateT <= 0) {
          this.state = STATE.RECHARGE;
          this.stateT = 0.6;
          ctx.audio?.play('roar');
          ctx.particles?.burst(this.x, this.y, 'rock', { count: 14, scale: 1.2 });
        }
        break;
      }
      case STATE.HURT: {
        this.stateT -= dt;
        if (this.stateT <= 0) this.state = STATE.STUNNED;
        break;
      }
      case STATE.DYING: {
        this.stateT -= dt;
        if (Math.random() < dt * 34) {
          ctx.particles?.burst(this.x + (Math.random() - 0.5) * 62, this.y + (Math.random() - 0.5) * 62, 'rock', { count: 3, scale: 1.1 });
        }
        if (this.stateT <= 0) {
          this.state = STATE.DEAD;
          this.dead = true;
          ctx.audio?.play('bossBreak');
          ctx.game?.shake(1);
          ctx.particles?.burst(this.x, this.y, 'rock', { count: 40, scale: 2 });
          ctx.particles?.burst(this.x, this.y, 'magic', { count: 26, scale: 1.6 });
          this.emit('defeated');
        }
        break;
      }
      default:
        break;
    }

    // rock-fall pattern rains independently of the main state machine
    if (this.rockTimer > 0) {
      this.rockTimer -= dt;
      if (this.rockTimer <= 0) this._rockTick(ctx);
    }
  }

  _nextPattern(ctx) {
    const pattern = this.patterns[this.patternIndex % this.patterns.length];
    this.patternIndex++;
    if (pattern === 'slam') this._telegraph('slam', this.cfg.slam?.warn ?? 1.0, ctx);
    else if (pattern === 'charge') this._telegraph('charge', this.cfg.charge?.warn ?? 0.9, ctx);
    else this._startRocks(ctx);
  }

  _telegraph(pattern, time, ctx) {
    this.state = STATE.TELEGRAPH;
    this.stateT = time;
    this.pending = pattern;
    this.targets = [];
    if (pattern === 'slam') {
      const player = ctx.player;
      const count = this.cfg.slam?.count ?? 2;
      const r = this.cfg.slam?.radius ?? 2.1;
      for (let i = 0; i < count; i++) {
        const jitter = i === 0 ? 0 : TILE * (this.rng() < 0.5 ? -2.2 : 2.2);
        this.targets.push({
          x: clamp((player?.px ?? this.x) + jitter, TILE, (this.room.W - 1) * TILE),
          y: clamp((player?.py ?? this.y) + (i === 0 ? 0 : TILE * (this.rng() - 0.5) * 3), TILE, (this.room.H - 1) * TILE),
        });
      }
      ctx.audio?.play('rockWarn');
      this.emit('telegraph', { pattern, r });
    } else {
      const player = ctx.player;
      const dx = (player?.px ?? this.x) - this.x;
      const dy = (player?.py ?? this.y) - this.y;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      this.chargeDir = ax > ay ? { x: Math.sign(dx) || 1, y: 0 } : { x: 0, y: Math.sign(dy) || 1 };
      this.eyeGlow = 1.4;
      ctx.audio?.play('roar');
      this.emit('telegraph', { pattern: 'charge', dir: this.chargeDir });
    }
  }

  _doSlam(ctx) {
    this.state = STATE.SLAM;
    this.stateT = 0.42;
    const r = (this.cfg.slam?.radius ?? 2.1) * TILE;
    ctx.audio?.play('bossHit');
    ctx.haptics?.buzz('boss');
    ctx.game?.shake(0.95);
    for (const target of this.targets) {
      ctx.particles?.burst(target.x, target.y, 'rock', { count: 18, scale: 1.5 });
      ctx.particles?.burst(target.x, target.y, 'dust', { count: 14, scale: 1.7 });
    }
    const player = ctx.player;
    if (player && !player.dead) {
      for (const target of this.targets) {
        if (dist(target.x, target.y, player.px, player.py) < r) {
          player.damage(1, 'boss', ctx);
          break;
        }
      }
    }
    this.emit('slam', { targets: this.targets, radius: r });
  }

  _startCharge(ctx) {
    this.state = STATE.CHARGE;
    this.chargeHits = 0;
    ctx.audio?.play('whoosh');
    ctx.game?.shake(0.35);
  }

  _startRocks(ctx) {
    this.state = STATE.RECHARGE;
    this.stateT = 1.6;
    this.rocksLeft = this.cfg.rocks?.count ?? 6;
    this.rockTimer = 0.28;
    ctx.audio?.play('rockWarn');
    this.emit('rocks', { count: this.rocksLeft });
  }

  _rockTick(ctx) {
    if (this.rocksLeft <= 0) return;
    this.rocksLeft--;
    const player = ctx.player;
    const px = player?.px ?? this.x;
    const py = player?.py ?? this.y;
    const gx = clamp(Math.round(px / TILE - 0.5 + (this.rng() - 0.5) * 4.5), 1, this.room.W - 2);
    const gy = clamp(Math.round(py / TILE - 0.5 + (this.rng() - 0.5) * 4.5), 1, this.room.H - 2);
    this.room.spawnRock(gx, gy, { warn: this.cfg.rocks?.warn ?? 1.0 });
    this.rockTimer = 0.22 + this.rng() * 0.16;
  }

  _blockedAt(nx, ny) {
    const cx = nx - TILE;
    const cy = ny - TILE;
    const corners = [
      [cx, cy],
      [cx + TILE * 2, cy],
      [cx, cy + TILE * 2],
      [cx + TILE * 2, cy + TILE * 2],
    ];
    for (const [px, py] of corners) {
      if (this.room.isSolid(Math.floor(px / TILE), Math.floor(py / TILE))) return true;
    }
    return false;
  }

  /** Sword hits only land while it is stunned. */
  takeHit(damage, ctx) {
    if (this.state === STATE.STUNNED) {
      this.hp -= damage;
      this.hitFlash = 0.35;
      this.cracks = this.maxHp - this.hp;
      ctx?.audio?.play('bossHit');
      ctx?.haptics?.buzz('boss');
      ctx?.game?.shake(0.55);
      ctx?.particles?.burst(this.x, this.y, 'rock', { count: 16, scale: 1.3 });
      ctx?.game?.floatText(this.x, this.y - 56, `-${damage}`, { color: '#ffd45e', size: 22 });
      if (this.hp <= 0) {
        this.state = STATE.DYING;
        this.stateT = 1.5;
        this.emit('breaking');
      } else {
        this.state = STATE.HURT;
        this.stateT = 0.4;
      }
      return true;
    }
    // Clang — teaches the player to wait for the stun window.
    ctx?.audio?.play('locked');
    ctx?.particles?.burst(this.x, this.y, 'impact', { count: 8, scale: 0.9 });
    ctx?.game?.floatText(this.x, this.y - 56, 'CLANG!', { color: '#c9c9d4', size: 16 });
    return false;
  }

  /* ─────────────────────────────── rendering ─────────────────────────────── */
  draw(c2d, { t }) {
    if (this.state === STATE.DEAD) return;
    const x = this.x;
    const y = this.y;
    const breathe = Math.sin(this.breathe * 1.6) * 2;
    const dying = this.state === STATE.DYING ? clamp(this.stateT / 1.5, 0, 1) : 1;
    c2d.save();
    c2d.translate(x, y + breathe);
    if (this.state === STATE.DYING) {
      c2d.globalAlpha = 0.35 + dying * 0.65;
      c2d.rotate((1 - dying) * 0.22);
      c2d.scale(1 + (1 - dying) * 0.12, 0.7 + dying * 0.3);
    }
    // shadow
    c2d.globalAlpha = 0.3 * dying;
    c2d.fillStyle = '#000';
    c2d.beginPath();
    c2d.ellipse(0, 34, 34, 12, 0, 0, TAU);
    c2d.fill();
    c2d.globalAlpha = dying;

    const stone = this.hitFlash > 0 ? '#ffd9a8' : '#7a6a52';
    const stoneDark = this.hitFlash > 0 ? '#e0a878' : '#4e4234';

    // legs / base
    c2d.fillStyle = stoneDark;
    c2d.beginPath();
    c2d.roundRect(-30, 6, 26, 28, 6);
    c2d.roundRect(4, 6, 26, 28, 6);
    c2d.fill();
    c2d.fillStyle = stone;
    c2d.beginPath();
    c2d.roundRect(-28, 4, 22, 22, 5);
    c2d.roundRect(6, 4, 22, 22, 5);
    c2d.fill();

    // arms (raise for the slam telegraph)
    const raise = this.slamRaise;
    const armY = -6 - raise * 26;
    c2d.fillStyle = stoneDark;
    c2d.beginPath();
    c2d.roundRect(-44, armY, 20, 40 + raise * 6, 7);
    c2d.roundRect(24, armY, 20, 40 + raise * 6, 7);
    c2d.fill();
    c2d.fillStyle = stone;
    c2d.beginPath();
    c2d.roundRect(-42, armY + 1, 16, 34, 6);
    c2d.roundRect(26, armY + 1, 16, 34, 6);
    c2d.fill();
    // fists
    c2d.fillStyle = '#6a5a44';
    c2d.beginPath();
    c2d.arc(-34, armY + 38 + raise * 4, 12, 0, TAU);
    c2d.arc(34, armY + 38 + raise * 4, 12, 0, TAU);
    c2d.fill();

    // torso
    const g = c2d.createLinearGradient(0, -46, 0, 30);
    g.addColorStop(0, '#8d7c60');
    g.addColorStop(0.5, stone);
    g.addColorStop(1, stoneDark);
    c2d.fillStyle = g;
    c2d.beginPath();
    c2d.moveTo(-30, -34);
    c2d.lineTo(-26, 14);
    c2d.lineTo(26, 14);
    c2d.lineTo(30, -34);
    c2d.quadraticCurveTo(0, -46, -30, -34);
    c2d.closePath();
    c2d.fill();
    // carved runes
    c2d.strokeStyle = this.eyeGlow > 0 ? 'rgba(255,150,60,0.9)' : 'rgba(255,120,40,0.45)';
    c2d.lineWidth = 2.4;
    c2d.beginPath();
    c2d.moveTo(-12, -18);
    c2d.lineTo(0, -6);
    c2d.lineTo(12, -18);
    c2d.moveTo(0, -6);
    c2d.lineTo(0, 8);
    c2d.stroke();
    // cracks grow as the boss takes damage
    if (this.cracks > 0) {
      c2d.strokeStyle = 'rgba(20,12,4,0.7)';
      c2d.lineWidth = 2;
      for (let i = 0; i < this.cracks * 2; i++) {
        const sx = -22 + (i * 37) % 44;
        const sy = -30 + (i * 19) % 42;
        c2d.beginPath();
        c2d.moveTo(sx, sy);
        c2d.lineTo(sx + 7, sy + 9);
        c2d.lineTo(sx + 2, sy + 18);
        c2d.stroke();
      }
    }
    // head
    c2d.fillStyle = stone;
    c2d.beginPath();
    c2d.roundRect(-24, -56, 48, 30, 9);
    c2d.fill();
    c2d.fillStyle = stoneDark;
    c2d.beginPath();
    c2d.roundRect(-24, -34, 48, 6, 3);
    c2d.fill();
    // brow
    c2d.fillStyle = '#3a3126';
    c2d.beginPath();
    c2d.roundRect(-22, -52, 44, 7, 3);
    c2d.fill();
    // eyes
    const stunned = this.state === STATE.STUNNED;
    const angry = this.state === STATE.CHARGE || this.state === STATE.TELEGRAPH;
    const glow = stunned ? 0.25 : angry ? 1 : 0.75 + Math.sin(t * 3) * 0.12;
    for (const ex of [-11, 11]) {
      c2d.globalAlpha = dying * glow;
      const eg = c2d.createRadialGradient(ex, -42, 1, ex, -42, 12);
      eg.addColorStop(0, '#fff3c0');
      eg.addColorStop(0.4, '#ff9f43');
      eg.addColorStop(1, 'rgba(255,90,20,0)');
      c2d.fillStyle = eg;
      c2d.beginPath();
      c2d.arc(ex, -42, 12, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = dying;
      c2d.fillStyle = stunned ? '#6b5a44' : '#ff7a33';
      c2d.beginPath();
      c2d.arc(ex, -42, 4.4, 0, TAU);
      c2d.fill();
    }
    c2d.globalAlpha = dying;
    if (stunned) {
      // dizzy stars
      for (let i = 0; i < 3; i++) {
        const a = t * 3 + (i / 3) * TAU;
        const sx = Math.cos(a) * 26;
        const sy = -66 + Math.sin(a) * 8;
        c2d.fillStyle = '#ffe066';
        c2d.beginPath();
        for (let k = 0; k < 10; k++) {
          const rr = k % 2 === 0 ? 6 : 2.6;
          const aa = (k / 10) * TAU - Math.PI / 2;
          const px = sx + Math.cos(aa) * rr;
          const py = sy + Math.sin(aa) * rr;
          if (k === 0) c2d.moveTo(px, py);
          else c2d.lineTo(px, py);
        }
        c2d.closePath();
        c2d.fill();
      }
    }
    c2d.restore();

    // ground danger markers for the slam
    if (this.state === STATE.TELEGRAPH && this.pending === 'slam') {
      const k = 1 - clamp(this.stateT / (this.cfg.slam?.warn ?? 1), 0, 1);
      const r = (this.cfg.slam?.radius ?? 2.1) * TILE;
      for (const target of this.targets) {
        c2d.save();
        c2d.globalAlpha = 0.3 + k * 0.45;
        c2d.fillStyle = '#ff3b30';
        c2d.beginPath();
        c2d.arc(target.x, target.y, r * (0.35 + k * 0.65), 0, TAU);
        c2d.fill();
        c2d.globalAlpha = 0.9;
        c2d.strokeStyle = '#ffe066';
        c2d.lineWidth = 2.6;
        c2d.beginPath();
        c2d.arc(target.x, target.y, r, 0, TAU);
        c2d.stroke();
        c2d.globalAlpha = 0.55 + k * 0.45;
        c2d.fillStyle = '#ff3b30';
        c2d.beginPath();
        c2d.arc(target.x, target.y, r * k, 0, TAU);
        c2d.fill();
        c2d.restore();
      }
    }
    // charge arrow
    if (this.state === STATE.TELEGRAPH && this.pending === 'charge') {
      const k = 1 - clamp(this.stateT / (this.cfg.charge?.warn ?? 0.9), 0, 1);
      c2d.save();
      c2d.globalAlpha = 0.35 + k * 0.5;
      c2d.strokeStyle = '#ff6b5e';
      c2d.lineWidth = 10;
      c2d.lineCap = 'round';
      c2d.setLineDash([16, 12]);
      c2d.beginPath();
      c2d.moveTo(this.x + this.chargeDir.x * 44, this.y + this.chargeDir.y * 44);
      c2d.lineTo(this.x + this.chargeDir.x * 200, this.y + this.chargeDir.y * 200);
      c2d.stroke();
      c2d.setLineDash([]);
      c2d.globalAlpha = 0.6 + k * 0.4;
      c2d.fillStyle = '#ffe066';
      const ax = this.x + this.chargeDir.x * 190;
      const ay = this.y + this.chargeDir.y * 190;
      const ang = Math.atan2(this.chargeDir.y, this.chargeDir.x);
      c2d.translate(ax, ay);
      c2d.rotate(ang);
      c2d.beginPath();
      c2d.moveTo(16, 0);
      c2d.lineTo(-8, 13);
      c2d.lineTo(-8, -13);
      c2d.closePath();
      c2d.fill();
      c2d.restore();
    }
    // health pips
    c2d.save();
    c2d.translate(this.x, this.y - 78);
    const pipW = 16;
    for (let i = 0; i < this.maxHp; i++) {
      const x0 = (i - (this.maxHp - 1) / 2) * (pipW + 4);
      c2d.fillStyle = 'rgba(0,0,0,0.45)';
      c2d.beginPath();
      c2d.roundRect(x0 - pipW / 2, -5, pipW, 10, 4);
      c2d.fill();
      c2d.fillStyle = i < this.hp ? '#ff6b5e' : 'rgba(255,255,255,0.2)';
      c2d.beginPath();
      c2d.roundRect(x0 - pipW / 2 + 1.5, -3.5, pipW - 3, 7, 3);
      c2d.fill();
    }
    c2d.restore();
  }
}

export default StoneGuardian;
