/**
 * ESCAPE 99 — Arin
 * Grid-stepped movement with continuous interpolation (instant response,
 * smooth stopping), 15 animation states, dash, sword and power-ups.
 */
import { TILE, POWERUP_META } from './entities.js';
import { clamp, dist, ease, TAU } from '../core/util.js';

export const ANIMS = {
  IDLE: 'idle',
  RUN: 'run',
  STOP: 'stop',
  JUMP: 'jump',
  DASH: 'dash',
  ATTACK: 'attack',
  PICKUP_KEY: 'pickupKey',
  PICKUP_TREASURE: 'pickupTreasure',
  HURT: 'hurt',
  DEATH: 'death',
  VICTORY: 'victory',
  SCARED: 'scared',
  CELEBRATE: 'celebrate',
  PUSH: 'push',
  OPEN_CHEST: 'openChest',
};

const BASE_SPEED = 4.55; // tiles / second
const DASH_SPEED = 13.5;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 0.75;
const ATTACK_TIME = 0.3;
const ATTACK_COOLDOWN = 0.3;
const HURT_TIME = 0.42;

export class Player {
  constructor(x, y, opts = {}) {
    this.x = x;
    this.y = y;
    this.tx = x;
    this.ty = y;
    this.moving = false;
    this.moveT = 0;
    this.moveDur = 1 / BASE_SPEED;
    this.dir = 'down';
    this.facing = { x: 0, y: 1 };
    this.maxHearts = opts.maxHearts ?? 3;
    this.hearts = this.maxHearts;
    this.speed = BASE_SPEED;
    this.dashUnlocked = !!opts.dashUnlocked;
    this.swordUnlocked = !!opts.swordUnlocked;
    this.swordDamage = opts.swordDamage ?? 1;
    this.magnetRadius = opts.magnetRadius ?? 0.3;
    this.invuln = 0;
    this.hurtT = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.attackT = 0;
    this.attackCd = 0;
    this.attackHitDone = false;
    this.anim = ANIMS.IDLE;
    this.animT = 0;
    this.animDur = 0.6;
    this.blink = Math.random() * 3;
    this.stepPhase = 0;
    this.lastStep = -1;
    this.powerups = { shield: 0, magnet: 0, speed: 0, freeze: 0, ghost: 0, double: 0, fireSword: 0 };
    this.shield = 0; // hits absorbed
    this.dead = false;
    this.deathT = 0;
    this.deathReason = null;
    this.victoryT = 0;
    this.scarf = [];
    for (let i = 0; i < 5; i++) this.scarf.push({ x: x * TILE + TILE / 2, y: y * TILE + TILE / 2, vx: 0, vy: 0 });
    this.trailT = 0;
    this.moves = 0;
  }

  get px() {
    return (this.x + 0.5) * TILE;
  }
  get py() {
    return (this.y + 0.5) * TILE;
  }
  get heartCount() {
    return Math.max(0, Math.ceil(this.hearts));
  }
  get ghosting() {
    return this.powerups.ghost > 0;
  }
  get effectiveSpeed() {
    return this.speed * (this.powerups.speed > 0 ? 1.32 : 1);
  }
  get invulnerable() {
    return this.invuln > 0 || this.dashT > 0;
  }

  /* --------------------------------- actions -------------------------------- */
  setFacing(dir) {
    this.dir = dir;
    const map = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
    const [x, y] = map[dir] || [0, 1];
    this.facing = { x, y };
  }

  playOneShot(name, dur, ctx, { cancelMove = false } = {}) {
    this.anim = name;
    this.animT = 0;
    this.animDur = dur;
    if (cancelMove) {
      this.moving = false;
      this.tx = Math.round(this.x);
      this.ty = Math.round(this.y);
    }
    void ctx;
  }

  tryStep(dir, ctx) {
    if (this.dead || this.victoryT > 0) return false;
    this.setFacing(dir);
    if (this.moving) return false;
    if (this.hurtT > 0 && this.anim === ANIMS.HURT) return false;
    const { x: dx, y: dy } = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[dir];
    const nx = Math.round(this.x) + dx;
    const ny = Math.round(this.y) + dy;
    if (ctx.room.isSolid(nx, ny)) {
      // Gentle bump instead of a dead stop — movement must never feel stuck.
      this.bump = 0.14;
      ctx.audio?.play('click');
      return false;
    }
    this._fromX = this.x;
    this._fromY = this.y;
    this.tx = nx;
    this.ty = ny;
    this.moving = true;
    this.moveT = 0;
    this.moves++;
    return true;
  }

  attack(ctx) {
    if (this.dead || this.attackCd > 0 || this.dashT > 0) return false;
    this.attackT = ATTACK_TIME;
    this.attackCd = ATTACK_COOLDOWN;
    this.attackHitDone = false;
    ctx.audio?.play('sword');
    ctx.particles?.burst(this.px + this.facing.x * 16, this.py + this.facing.y * 16, 'impact', {
      count: 6,
      scale: 0.7,
      dir: { x: this.facing.x, y: this.facing.y, spread: 1.1 },
    });
    return true;
  }

  dash(ctx) {
    if (this.dead || !this.dashUnlocked || this.dashCd > 0) return false;
    // Dash two tiles in the facing direction if the path is clear.
    let steps = 0;
    let cx = Math.round(this.x);
    let cy = Math.round(this.y);
    for (let i = 0; i < 2; i++) {
      const nx = cx + this.facing.x;
      const ny = cy + this.facing.y;
      if (ctx.room.isSolid(nx, ny)) break;
      cx = nx;
      cy = ny;
      steps++;
    }
    if (steps === 0) return false;
    this._fromX = this.x;
    this._fromY = this.y;
    this.tx = cx;
    this.ty = cy;
    this.moving = true;
    this.dashT = DASH_TIME;
    this.dashCd = DASH_COOLDOWN;
    this.moveT = 0;
    this.moveDur = DASH_TIME * 0.86;
    this.playOneShot(ANIMS.DASH, DASH_TIME, ctx);
    ctx.audio?.play('dash');
    ctx.haptics?.buzz('ui');
    ctx.particles?.burst(this.px, this.py, 'dashTrail', { count: 10, scale: 1.1 });
    return true;
  }

  /* --------------------------------- damage --------------------------------- */
  damage(amount, reason, ctx) {
    if (this.dead || this.invulnerable) return false;
    if (this.powerups.ghost > 0 && reason !== 'lava' && reason !== 'firewall') return false;
    if (this.shield > 0) {
      this.shield--;
      this.invuln = 1.0;
      ctx.audio?.play('shield');
      ctx.haptics?.buzz('damage');
      ctx.particles?.burst(this.px, this.py, 'magic', { count: 18, scale: 1.2 });
      ctx.game?.floatText(this.px, this.py - 22, 'SHIELD!', { color: '#8ce0ff', size: 15 });
      return false;
    }
    this.hearts -= amount;
    this.invuln = 1.35;
    this.hurtT = HURT_TIME;
    this.playOneShot(ANIMS.HURT, HURT_TIME, ctx);
    ctx.audio?.play('hurt');
    ctx.haptics?.buzz('damage');
    ctx.game?.shake(0.42);
    ctx.particles?.burst(this.px, this.py, 'impact', { count: 14, scale: 1.1 });
    ctx.game?.floatText(this.px, this.py - 24, '-1', { color: '#ff6b5e', size: 18 });
    ctx.game?.onPlayerDamaged?.(reason);
    if (this.hearts <= 0) {
      this.die(reason, ctx);
    }
    return true;
  }

  die(reason, ctx) {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 1.15;
    this.deathReason = reason;
    this.hearts = 0;
    this.moving = false;
    this.playOneShot(ANIMS.DEATH, 1.15, ctx, { cancelMove: true });
    ctx.audio?.play('death');
    ctx.haptics?.buzz('death');
    ctx.game?.shake(0.5);
    ctx.particles?.burst(this.px, this.py, 'smoke', { count: 10, scale: 1.3 });
    ctx.game?.onPlayerDeath?.(reason);
  }

  revive(ctx) {
    this.dead = false;
    this.hearts = Math.max(1, Math.ceil(this.maxHearts / 2));
    this.deathT = 0;
    this.invuln = 1.6;
    this.anim = ANIMS.IDLE;
    ctx?.particles?.burst(this.px, this.py, 'revive', { count: 30, scale: 1.4 });
    ctx?.audio?.play('victory');
    ctx?.haptics?.buzz('exit');
  }

  /* --------------------------------- updates -------------------------------- */
  update(dt, ctx) {
    if (this.invuln > 0) this.invuln -= dt;
    if (this.dashCd > 0) this.dashCd -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.hurtT > 0) this.hurtT -= dt;
    if (this.bump > 0) this.bump -= dt;
    if (this.dashT > 0) this.dashT -= dt;
    for (const k of Object.keys(this.powerups)) {
      if (this.powerups[k] > 0) {
        this.powerups[k] -= dt;
        if (this.powerups[k] <= 0) {
          this.powerups[k] = 0;
          ctx.game?.floatText(this.px, this.py - 26, `${POWERUP_META[k]?.label || k} OVER`, { color: '#c9c9d4', size: 12, life: 0.8 });
        }
      }
    }
    // movement
    const speed = this.dashT > 0 ? DASH_SPEED : this.effectiveSpeed;
    if (this.moving) {
      this.moveT += dt * speed;
      const k = clamp(this.moveT, 0, 1);
      const s = this.moveT >= 1 ? 1 : ease.linear(k);
      this.x = this._fromX + (this.tx - this._fromX) * s;
      this.y = this._fromY + (this.ty - this._fromY) * s;
      if (this.moveT >= 1) {
        this.moving = false;
        this.x = this.tx;
        this.y = this.ty;
        const tile = Math.round(this.x) * 1000 + Math.round(this.y);
        if (tile !== this.lastStep) {
          this.lastStep = tile;
          ctx.particles?.burst(this.px, this.py + 10, 'run', { count: 3, spread: 5 });
        }
      }
    }

    // animation state
    this.animT += dt;
    const busy = this.animT < this.animDur && ![ANIMS.RUN, ANIMS.IDLE].includes(this.anim);
    if (!busy) {
      if (this.dead) this.anim = ANIMS.DEATH;
      else if (this.victoryT > 0) this.anim = ANIMS.VICTORY;
      else if (this.moving || ctx.holdingDir) this.anim = this.dashT > 0 ? ANIMS.DASH : ANIMS.RUN;
      else this.anim = ANIMS.IDLE;
      if (this.anim !== ANIMS.RUN) this.animT = Math.min(this.animT, 0.6);
    }
    if (this.anim === ANIMS.RUN) this.stepPhase += dt * speed * 2.6;
    if (this.anim === ANIMS.IDLE) this.blink += dt;

    // scarf follows with a spring
    const targetX = this.px - this.facing.x * 7;
    const targetY = this.py - 12 - this.facing.y * 4;
    let prevX = targetX;
    let prevY = targetY;
    for (let i = 0; i < this.scarf.length; i++) {
      const s = this.scarf[i];
      const stiff = 0.42 - i * 0.03;
      s.vx += (prevX - s.x) * stiff * 60 * dt;
      s.vy += (prevY - s.y) * stiff * 60 * dt;
      s.vx *= 0.82;
      s.vy *= 0.82;
      s.x += s.vx * dt * 8;
      s.y += s.vy * dt * 8;
      s.x += (this.px - s.x) * 0.06 * (1 - i * 0.1);
      s.y += (this.py + 2 - s.y) * 0.05;
      prevX = s.x;
      prevY = s.y;
    }

    // attack hit detection (single window in the middle of the swing)
    if (this.attackT > 0) {
      this.attackT -= dt;
      const progress = 1 - this.attackT / ATTACK_TIME;
      if (!this.attackHitDone && progress > 0.34) {
        this.attackHitDone = true;
        this._resolveAttack(ctx);
      }
    }

    // dash trail
    if (this.dashT > 0) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.02;
        ctx.particles?.burst(this.px, this.py, 'dashTrail', { count: 3, spread: 4 });
      }
    }
    if (this.dead) this.deathT -= dt;
  }

  /** Sword arc: resolves hits once, mid-swing. */
  _resolveAttack(ctx) {
    const face = this.facing;
    const cx = this.px + face.x * TILE * 0.85;
    const cy = this.py + face.y * TILE * 0.85;
    const reach = TILE * 1.15;
    let hits = 0;
    for (const e of ctx.room.enemies) {
      if (e.dead) continue;
      if (dist(e.px, e.py, cx, cy) < reach) {
        const dmg = this.swordDamage + (this.powerups.fireSword > 0 ? 1 : 0);
        e.hit(dmg, ctx, face);
        hits++;
        if (this.powerups.fireSword > 0) {
          ctx.particles?.burst(e.px, e.py, 'fire', { count: 12, scale: 1.1 });
        }
      }
    }
    // Rocks can be smashed for a small reward.
    for (const rock of ctx.room.rocks || []) {
      if (!rock.dead && rock.state !== 'ground' && dist(rock.px, rock.py, cx, cy) < reach) {
        rock.dead = true;
        ctx.particles?.burst(rock.px, rock.py, 'rock', { count: 10 });
      }
    }
    if (hits > 0) ctx.haptics?.buzz('ui');
    // Sword also cuts vines/hidden doors? (reserved for later worlds)
    ctx.game?.onAttackSwing?.(hits);
  }

  /* -------------------------------- power-ups -------------------------------- */
  applyPowerUp(kind, ctx) {
    const meta = POWERUP_META[kind];
    if (!meta) return;
    if (kind === 'shield') this.shield = Math.min(3, this.shield + 1);
    else this.powerups[kind] = Math.max(this.powerups[kind], meta.dur);
    ctx.audio?.play('powerup');
    ctx.haptics?.buzz('gem');
    ctx.particles?.burst(this.px, this.py, kind === 'freeze' ? 'gem' : 'magic', { count: 24, scale: 1.3 });
    ctx.game?.floatText(this.px, this.py - 30, meta.label, { color: meta.color, size: 15 });
    if (kind === 'freeze') ctx.room.freezeAll(meta.dur, ctx);
    ctx.game?.onPowerUpUsed?.(kind);
  }

  /** Victory pose: jump, one hand raised, scarf flying. */
  celebrate(ctx) {
    this.victoryT = 1.6;
    this.playOneShot(ANIMS.VICTORY, 1.6, ctx, { cancelMove: true });
    ctx?.particles?.burst(this.px, this.py, 'confetti', { count: 36, scale: 1.2 });
    ctx?.audio?.play('victory');
  }
}

export { TILE };
export const PLAYER_CONST = { BASE_SPEED, DASH_SPEED, DASH_TIME, ATTACK_TIME };
export default Player;
