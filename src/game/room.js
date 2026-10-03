/**
 * ESCAPE 99 — Room
 * Parses a level definition into live components, runs every hazard, and
 * renders the room in layers (static floor is pre-rendered once per room).
 */
import {
  TILE, Coin, Gem, KeyItem, SwordPickup, PowerUp, ExitDoor, Chest, Switch, Gate,
  SpikeTrap, FireJet, LavaPool, MovingWall, FireWall, Slime, FallingRock, Boulder,
  POWERUP_META, drawRock,
} from './entities.js';
import { POWERUP_TILES, GRID } from '../data/levels.js';
import { themeByKey } from '../data/themes.js';
import { clamp, dist, TAU, rng, makeRng } from '../core/util.js';

export class Room {
  constructor(def, opts = {}) {
    this.def = def;
    this.W = GRID.W;
    this.H = GRID.H;
    this.theme = themeByKey(def.theme);
    this.rng = makeRng((def.id || 1) * 7919);
    this.time = 0;
    this.freezeTime = 0;
    this.magnetRadius = opts.magnetRadius ?? 0.32;
    this.frozenFx = 0;

    this.grid = [];
    this.coins = [];
    this.gems = [];
    this.spikes = [];
    this.fireJets = [];
    this.lava = [];
    this.switches = [];
    this.gates = [];
    this.chests = [];
    this.powerups = [];
    this.enemies = [];
    this.movingWalls = [];
    this.fireWalls = [];
    this.rocks = [];
    this.boulders = [];
    this.secretDoors = [];
    this.torches = [];
    this.key = null;
    this.exit = null;
    this.sword = null;
    this.spawn = { x: 1, y: 1 };
    this.coinTotal = 0;
    this.gemTotal = 0;
    this.lavaRise = null;
    this.painted = null;

    this._parse();
    this._build();
  }

  /* ─────────────────────────────── parsing ─────────────────────────────── */
  _parse() {
    const map = this.def.map;
    for (let y = 0; y < this.H; y++) {
      const row = (map[y] || '').padEnd(this.W, '#');
      this.grid.push(row.split(''));
    }
  }

  _build() {
    let switchIndex = 0;
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const ch = this.grid[y][x];
        switch (ch) {
          case 'S':
            this.spawn = { x, y };
            break;
          case 'K':
            this.key = new KeyItem(x, y);
            break;
          case 'E':
            this.exit = new ExitDoor(x, y, { open: false });
            break;
          case 'c':
            this.coins.push(new Coin(x, y));
            this.coinTotal++;
            break;
          case 'G':
            this.gems.push(new Gem(x, y));
            this.gemTotal++;
            break;
          case 'T':
            this.chests.push(new Chest(x, y, { loot: this.def.chestLoot || { coins: 50, gemChance: 0.35, shard: true }, big: !!this.def.reward?.bigChest }));
            break;
          case 'M':
            this.sword = new SwordPickup(x, y);
            break;
          case '^':
            this.spikes.push(new SpikeTrap(x, y, { phase: 0, period: this.def.spikePeriod ?? 1.5, index: this.spikes.length }));
            break;
          case 'v':
            this.spikes.push(new SpikeTrap(x, y, { phase: 0.5, period: this.def.spikePeriod ?? 1.5, index: this.spikes.length }));
            break;
          case 'F':
            this.fireJets.push(new FireJet(x, y, { phase: this.fireJets.length % 2 === 0 ? 0 : 0.45 }));
            break;
          case '~':
            this.lava.push(new LavaPool(x, y));
            break;
          case 'O':
            this.switches.push(new Switch(x, y, { index: switchIndex++ }));
            break;
          case '-':
            this.gates.push(new Gate(x, y, {}));
            break;
          case 'H':
            this.secretDoors.push({ x, y, found: false });
            break;
          case 'B':
            this.boulders.push(new Boulder(x, y));
            break;
          case 's':
            this.enemies.push(new Slime(x, y, { axis: 'x', range: 3 }));
            break;
          default:
            if (POWERUP_TILES[ch]) this.powerups.push(new PowerUp(x, y, POWERUP_TILES[ch]));
            break;
        }
      }
    }
    // Design rule: a room is only "key locked" when it actually contains a key.
    // Rooms like TREASURE OR ESCAPE and TWO SWITCHES use a gate or pure risk as
    // the obstacle, so their exit starts open (and would otherwise be unfinishable).
    if (this.exit && (!this.key || this.def.openExit)) this.exit.open = true;
    // Switches/gates from the definition get a second pass so rooms can also
    // place components programmatically (used by Endless Escape).
    this._applyDefComponents();
    // Torches: wall tiles that touch floor get a sconce for warmth + guidance.
    for (let y = 1; y < this.H - 1; y++) {
      for (let x = 1; x < this.W - 1; x++) {
        if (this.grid[y][x] !== '#') continue;
        const touchesFloor =
          this.grid[y][x - 1] === '.' || this.grid[y][x + 1] === '.' || this.grid[y + 1][x] === '.' || this.grid[y - 1][x] === '.';
        if (touchesFloor && this.rng.chance(0.1)) this.torches.push({ x, y, phase: this.rng() * 10 });
      }
    }
  }

  _applyDefComponents() {
    const def = this.def;
    if (def.enemies) {
      this.enemies = [];
      for (const e of def.enemies) this.enemies.push(new Slime(e.x, e.y, e));
    }
    if (def.movingWalls) {
      this.movingWalls = def.movingWalls.map((mw) => new MovingWall(mw, { cols: this.W, rows: this.H }));
    }
    if (def.fireWalls) {
      this.fireWalls = def.fireWalls.map((fw) => new FireWall(fw, { cols: this.W, rows: this.H }));
    }
    // Lava either comes from a dedicated block or from the boss escape config,
    // which is the single source of truth for the Room 10 finale.
    const escapeCfg = def.boss?.escape;
    if (def.lavaRise || escapeCfg?.lava) {
      const cfg = def.lavaRise || {};
      this.lavaRise = {
        y: this.H,
        speed: cfg.speed ?? escapeCfg?.lavaSpeed ?? 0.6,
        active: false,
        level: this.H,
      };
    }
  }

  /* ─────────────────────────────── queries ─────────────────────────────── */
  isSolid(gx, gy) {
    if (gx < 0 || gy < 0 || gx >= this.W || gy >= this.H) return true;
    const c = this.grid[gy][gx];
    if (c === '#' || c === 'B') return true;
    for (const g of this.gates) if (g.x === gx && g.y === gy && g.solid) return true;
    for (const mw of this.movingWalls) {
      for (const cell of mw.cells) if (cell.x === gx && cell.y === gy) return true;
    }
    return false;
  }

  /** Movement blocking that also lets an entity out of a wall it is inside. */
  blockedFor(entity, x, y) {
    const gx = Math.floor(x + 0.5);
    const gy = Math.floor(y + 0.5);
    const curX = Math.floor(entity.x + 0.5);
    const curY = Math.floor(entity.y + 0.5);
    if (gx === curX && gy === curY) return false;
    return this.isSolid(gx, gy);
  }

  isSecret(gx, gy) {
    return this.secretDoors.some((s) => s.x === gx && s.y === gy);
  }

  /** Nearest walkable tile to (gx,gy) — used for safe push-out of moving walls. */
  nearestFree(gx, gy, tries = 6) {
    for (let r = 1; r <= tries; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = gx + dx;
          const ny = gy + dy;
          if (!this.isSolid(nx, ny)) return { x: nx, y: ny };
        }
      }
    }
    return null;
  }

  get coinsCollected() {
    return this.coinTotal - this.coins.filter((c) => !c.dead).length;
  }
  get gemsCollected() {
    return this.gemTotal - this.gems.filter((g) => !g.dead).length;
  }
  get allCoins() {
    return this.coins.every((c) => c.dead);
  }
  get allSwitchesPressed() {
    return this.switches.length > 0 && this.switches.every((s) => s.pressed);
  }
  get enemiesAlive() {
    return this.enemies.filter((e) => !e.dead).length;
  }

  freezeAll(duration, ctx) {
    this.freezeTime = Math.max(this.freezeTime, duration);
    this.frozenFx = 1;
    ctx?.particles?.burst(this.W * TILE * 0.5, this.H * TILE * 0.5, 'gem', { count: 40, scale: 2.2, spread: 260 });
    ctx?.audio?.play('shield');
    ctx?.game?.floatText((this.W * TILE) / 2, (this.H * TILE) / 2, '❄ FREEZE ❄', { color: '#c9f2ff', size: 22, life: 1.1 });
  }

  /* ──────────────────────────────── update ─────────────────────────────── */
  update(dt, ctx) {
    this.time += dt;
    const { player } = ctx;
    const frozen = this.freezeTime > 0;
    if (frozen) {
      this.freezeTime -= dt;
      this.frozenFx = Math.max(0, this.frozenFx - dt * 0.6);
    }

    this.magnetRadius = player?.magnetRadius ?? this.magnetRadius;

    // moving walls
    for (const mw of this.movingWalls) {
      mw.update(frozen ? 0 : dt, ctx);
    }
    if (player && !player.dead) {
      for (const mw of this.movingWalls) {
        for (const cell of mw.cells) {
          if (Math.round(player.x) === cell.x && Math.round(player.y) === cell.y) {
            const free = this.nearestFree(Math.round(player.x), Math.round(player.y), 4);
            if (free) {
              player.x = free.x;
              player.y = free.y;
              player.tx = free.x;
              player.ty = free.y;
              player.moving = false;
              player.invuln = Math.max(player.invuln, 0.35);
              ctx.particles?.burst(player.px, player.py, 'dust', { count: 8, scale: 1.2 });
              ctx.game?.shake(0.16);
            }
          }
        }
      }
    }

    // hazards
    for (const s of this.spikes) s.update(frozen ? 0 : dt);
    for (const f of this.fireJets) f.update(frozen ? 0 : dt);
    for (const g of this.gates) g.update(dt);
    for (const c of this.chests) c.update(dt);
    for (const sw of this.switches) sw.update(dt);
    if (this.exit) this.exit.update(dt);
    for (const c of this.coins) c.update(dt, ctx);
    for (const g of this.gems) g.update(dt);

    // fire walls
    for (const fw of this.fireWalls) fw.update(dt, ctx);

    // rising lava (boss escape phase)
    if (this.lavaRise?.active) {
      this.lavaRise.level = Math.max(0, this.lavaRise.level - this.lavaRise.speed * dt);
      if (Math.random() < dt * 26) {
        const px = Math.random() * this.W * TILE;
        ctx.particles?.spawn({
          x: px,
          y: this.lavaRise.level * TILE,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -1.6 - Math.random() * 2.4,
          life: 0.5 + Math.random() * 0.6,
          size: 2 + Math.random() * 4,
          color: ['#ffb03d', '#ff5a1f', '#ffe066'][Math.floor(Math.random() * 3)],
          gravity: -0.8,
          drag: 1,
          glow: true,
        });
      }
    }

    // rocks
    for (const r of this.rocks) r.update(dt, ctx);
    this.rocks = this.rocks.filter((r) => !r.dead);

    // enemies
    for (const e of this.enemies) e.update(dt, ctx);
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deathT <= 0));

    if (!player || player.dead || player.victoryT > 0) return;

    // secret doors reveal themselves when stepped on
    for (const s of this.secretDoors) {
      if (!s.found && Math.round(player.x) === s.x && Math.round(player.y) === s.y) {
        s.found = true;
        ctx.audio?.play('chest');
        ctx.particles?.burst((s.x + 0.5) * TILE, (s.y + 0.5) * TILE, 'dust', { count: 16, scale: 1.4 });
        ctx.game?.floatText((s.x + 0.5) * TILE, (s.y + 0.4) * TILE, 'SECRET!', { color: '#e0c9ff', size: 15 });
      }
    }

    this._collect(player, ctx);
    this._hazards(player, ctx);
    this._enemyContact(player, ctx);
    this._switches(player, ctx);
    this._exitCheck(player, ctx);
  }

  _collect(player, ctx) {
    for (const c of this.coins) {
      if (c.dead) continue;
      if (c.touches(player)) {
        c.dead = true;
        const mult = player.powerups.double > 0 ? 2 : 1;
        ctx.game?.onCoinCollected?.(c.value * mult);
        ctx.audio?.play('coin', { pitch: Math.min(6, this.coinsCollected % 7) });
        ctx.particles?.burst(c.px, c.py, 'coin', { count: 6 });
        ctx.particles?.burst(c.px, c.py, 'impact', { count: 4, scale: 0.6 });
      }
    }
    for (const g of this.gems) {
      if (g.dead) continue;
      if (g.touches(player)) {
        g.dead = true;
        ctx.game?.onGemCollected?.(1);
        ctx.audio?.play('gem');
        ctx.haptics?.buzz('gem');
        ctx.particles?.burst(g.px, g.py, 'gem', { count: 22, scale: 1.2 });
        ctx.particles?.text(g.px, g.py - 20, '+1 💎', { color: '#8ce0ff', size: 17 });
      }
    }
    if (this.key && !this.key.dead && this.key.touches(player)) {
      this.key.dead = true;
      ctx.game?.onKeyCollected?.();
      ctx.audio?.play('key');
      ctx.haptics?.buzz('key');
      ctx.particles?.burst(this.key.px, this.key.py, 'key', { count: 26, scale: 1.2 });
      ctx.particles?.text(this.key.px, this.key.py - 22, 'KEY!', { color: '#ffd45e', size: 18 });
    }
    if (this.sword && !this.sword.dead && this.sword.touches(player)) {
      this.sword.dead = true;
      player.swordUnlocked = true;
      ctx.game?.onSwordCollected?.();
      ctx.audio?.play('powerup');
      ctx.haptics?.buzz('chest');
      ctx.particles?.burst(this.sword.px, this.sword.py, 'impact', { count: 24, scale: 1.3 });
    }
    for (const p of this.powerups) {
      if (p.dead) continue;
      if (p.touches(player)) {
        p.dead = true;
        player.applyPowerUp(p.kind, ctx);
        ctx.particles?.burst(p.px, p.py, 'impact', { count: 10, scale: 0.9 });
      }
    }
    for (const ch of this.chests) {
      if (ch.opened) continue;
      if (ch.touches(player)) {
        ch.opened = true;
        ctx.game?.onChestOpened?.(ch);
        ctx.audio?.play('chest');
        ctx.haptics?.buzz('chest');
        ctx.game?.shake(0.26);
        ctx.particles?.burst(ch.px, ch.py, 'coin', { count: 20, scale: 1.3 });
        ctx.particles?.burst(ch.px, ch.py, 'magic', { count: 14, scale: 1.1 });
      }
    }
  }

  _hazards(player, ctx) {
    const px = player.px;
    const py = player.py;
    const gx = Math.round(player.x);
    const gy = Math.round(player.y);
    const frozen = this.freezeTime > 0;

    if (!frozen) {
      for (const s of this.spikes) {
        if (s.x === gx && s.y === gy && s.lethal) {
          player.damage(1, 'spikes', ctx);
          break;
        }
      }
      for (const f of this.fireJets) {
        if (f.x === gx && f.y === gy && f.lethal) {
          player.damage(1, 'fire', ctx);
          break;
        }
      }
    }
    for (const l of this.lava) {
      if (l.x === gx && l.y === gy) {
        player.damage(1, 'lava', ctx);
        break;
      }
    }
    // rising lava pool
    if (this.lavaRise?.active) {
      const y = this.lavaRise.level * TILE;
      if (py > y) player.damage(1, 'lava', ctx);
    }
    for (const fw of this.fireWalls) {
      if (fw.covers(px, py)) {
        player.damage(1, 'firewall', ctx);
        break;
      }
    }
    for (const r of this.rocks) {
      if (r.lethalNow && dist(r.px, r.py, px, py) < TILE * 0.78) {
        player.damage(1, 'rock', ctx);
        break;
      }
    }
  }

  _enemyContact(player, ctx) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (dist(e.px, e.py, player.px, player.py) < TILE * 0.78) {
        player.damage(1, 'slime', ctx);
        break;
      }
    }
  }

  _switches(player, ctx) {
    const gx = Math.round(player.x);
    const gy = Math.round(player.y);
    for (const s of this.switches) {
      if ((s.x === gx && s.y === gy) || dist(s.px, s.py, player.px, player.py) < TILE * 0.7) {
        if (s.press(ctx)) {
          ctx.game?.onSwitchPressed?.(s, this.switches.filter((x) => x.pressed).length, this.switches.length);
          if (this.allSwitchesPressed) {
            for (const g of this.gates) g.openUp(ctx);
            ctx.game?.onGateOpen?.();
          }
        }
      }
    }
  }

  _exitCheck(player, ctx) {
    if (!this.exit) return;
    if (dist(this.exit.px, this.exit.py, player.px, player.py) < TILE * 0.72) {
      if (this.exit.open) {
        ctx.game?.onReachExit?.();
      } else if (!this.exit_lockedCooldown || this.time - this.exit_lockedCooldown > 1.2) {
        this.exit_lockedCooldown = this.time;
        ctx.audio?.play('locked');
        ctx.game?.onExitLocked?.();
        ctx.particles?.burst(this.exit.px, this.exit.py, 'impact', { count: 6, scale: 0.8 });
      }
    }
  }

  spawnRock(x, y, opts = {}) {
    const rock = new FallingRock(x, y, opts);
    this.rocks.push(rock);
    return rock;
  }

  armFireWalls() {
    for (const fw of this.fireWalls) {
      if (!fw.armed) {
        fw.armed = true;
        fw.delayLeft = fw.delay;
      }
    }
  }
  disarmFireWalls() {
    for (const fw of this.fireWalls) {
      fw.armed = false;
      fw.active = false;
      fw.intensity = 0;
    }
  }

  /* ──────────────────────────────── render ─────────────────────────────── */
  buildStaticLayer() {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = this.W * TILE;
    canvas.height = this.H * TILE;
    const c2d = canvas.getContext('2d');
    const p = this.theme.palette;
    const rngl = makeRng((this.def.id || 1) * 31337);
    for (let y = 0; y < this.H; y++) {
      for (let x = 0; x < this.W; x++) {
        const ch = this.grid[y][x];
        const cx = x * TILE;
        const cy = y * TILE;
        if (ch === '#' || ch === 'B' || ch === 'H') {
          // Wall block: keep it chunky and readable.
          c2d.fillStyle = p.wallEdge;
          c2d.fillRect(cx, cy, TILE, TILE);
          const g = c2d.createLinearGradient(cx, cy, cx, cy + TILE);
          g.addColorStop(0, p.wallTop);
          g.addColorStop(1, p.wall);
          c2d.fillStyle = g;
          c2d.fillRect(cx + 1, cy + 1, TILE - 2, TILE - 2);
          const openBelow = y + 1 < this.H && ['.', '^', 'v', 'F', 'O', '-', 'S', 'K', 'c', 'G', 'T', 'M', 'H', 's', '~'].includes(this.grid[y + 1][x]);
          if (openBelow) {
            c2d.fillStyle = 'rgba(0,0,0,0.22)';
            c2d.fillRect(cx, cy + TILE - 5, TILE, 5);
            c2d.fillStyle = 'rgba(255,255,255,0.10)';
            c2d.fillRect(cx, cy + TILE - 7, TILE, 2);
          }
          // brick lines
          c2d.strokeStyle = 'rgba(0,0,0,0.16)';
          c2d.lineWidth = 1;
          c2d.beginPath();
          c2d.moveTo(cx, cy + TILE * 0.55);
          c2d.lineTo(cx + TILE, cy + TILE * 0.55);
          c2d.moveTo(cx + TILE * 0.5, cy);
          c2d.lineTo(cx + TILE * 0.5, cy + TILE * 0.55);
          c2d.moveTo(cx + TILE * 0.25, cy + TILE * 0.55);
          c2d.lineTo(cx + TILE * 0.25, cy + TILE);
          c2d.moveTo(cx + TILE * 0.75, cy + TILE * 0.55);
          c2d.lineTo(cx + TILE * 0.75, cy + TILE);
          c2d.stroke();
          if (ch === 'H') {
            // Secret door: a hairline seam gives observant players the hint.
            c2d.strokeStyle = 'rgba(230,210,255,0.22)';
            c2d.lineWidth = 1.2;
            c2d.strokeRect(cx + 3.5, cy + 3.5, TILE - 7, TILE - 7);
          }
          // decorative moss / crack
          if (rngl.chance(0.22)) {
            c2d.fillStyle = 'rgba(0,0,0,0.14)';
            c2d.beginPath();
            c2d.arc(cx + 8 + rngl() * 16, cy + 8 + rngl() * 16, 2.4 + rngl() * 3, 0, TAU);
            c2d.fill();
          }
        } else {
          // Floor
          const alt = (x + y) % 2 === 0;
          c2d.fillStyle = alt ? p.floor : p.floorAlt;
          c2d.fillRect(cx, cy, TILE, TILE);
          c2d.strokeStyle = 'rgba(0,0,0,0.10)';
          c2d.lineWidth = 1;
          c2d.strokeRect(cx + 0.5, cy + 0.5, TILE - 1, TILE - 1);
          // subtle pebbles / tiles
          if (rngl.chance(0.3)) {
            c2d.fillStyle = 'rgba(0,0,0,0.05)';
            c2d.beginPath();
            c2d.arc(cx + rngl() * TILE, cy + rngl() * TILE, 1 + rngl() * 2.2, 0, TAU);
            c2d.fill();
          }
          if (rngl.chance(0.12)) {
            c2d.strokeStyle = 'rgba(0,0,0,0.10)';
            c2d.beginPath();
            c2d.moveTo(cx + 6, cy + TILE - 8);
            c2d.lineTo(cx + TILE * 0.5, cy + TILE * 0.45);
            c2d.lineTo(cx + TILE - 6, cy + TILE - 10);
            c2d.stroke();
          }
        }
      }
    }
    // theme flavour on floor tiles
    this._paintDecor(c2d, rngl);
    this.painted = canvas;
    return canvas;
  }

  _paintDecor(c2d, rngl) {
    const key = this.theme.key;
    const p = this.theme.palette;
    for (let y = 1; y < this.H - 1; y++) {
      for (let x = 1; x < this.W - 1; x++) {
        if (this.grid[y][x] !== '.') continue;
        const cx = x * TILE + TILE / 2;
        const cy = y * TILE + TILE / 2;
        if (key === 'lava' && rngl.chance(0.1)) {
          c2d.globalAlpha = 0.5;
          c2d.fillStyle = p.glow;
          c2d.beginPath();
          c2d.ellipse(cx, cy, TILE * 0.36, 3, rngl() * TAU, 0, TAU);
          c2d.fill();
          c2d.globalAlpha = 1;
        } else if (key === 'jungle' && rngl.chance(0.12)) {
          c2d.globalAlpha = 0.5;
          c2d.strokeStyle = '#4f7a33';
          c2d.lineWidth = 2.4;
          c2d.beginPath();
          c2d.moveTo(cx - 10, cy - 6);
          c2d.quadraticCurveTo(cx, cy + 4, cx + 9, cy - 5);
          c2d.stroke();
          c2d.globalAlpha = 1;
        } else if (key === 'frost' && rngl.chance(0.12)) {
          c2d.globalAlpha = 0.35;
          c2d.strokeStyle = '#ffffff';
          c2d.lineWidth = 1.4;
          c2d.beginPath();
          c2d.moveTo(cx - 8, cy);
          c2d.lineTo(cx + 8, cy);
          c2d.moveTo(cx, cy - 8);
          c2d.lineTo(cx, cy + 8);
          c2d.stroke();
          c2d.globalAlpha = 1;
        } else if (key === 'desert' && rngl.chance(0.1)) {
          c2d.globalAlpha = 0.18;
          c2d.fillStyle = '#a98650';
          c2d.beginPath();
          c2d.arc(cx, cy + 4, 12, Math.PI, TAU);
          c2d.fill();
          c2d.globalAlpha = 1;
        } else if (key === 'shadow' && rngl.chance(0.08)) {
          c2d.globalAlpha = 0.3;
          c2d.fillStyle = '#12081f';
          c2d.beginPath();
          c2d.ellipse(cx, cy, 13, 8, 0, 0, TAU);
          c2d.fill();
          c2d.globalAlpha = 1;
        } else if (key === 'final' && rngl.chance(0.07)) {
          c2d.globalAlpha = 0.45;
          c2d.fillStyle = '#8c93a8';
          c2d.fillRect(cx - 7, cy - 2, 14, 3);
          c2d.fillRect(cx - 3, cy - 6, 3, 12);
          c2d.globalAlpha = 1;
        }
      }
    }
  }

  /** Everything that renders below the actors. */
  drawGround(c2d, opts) {
    const { t } = opts;
    if (!this.painted) this.buildStaticLayer();
    if (this.painted) c2d.drawImage(this.painted, 0, 0);
    // torch / accent flicker
    for (const torch of this.torches) {
      const cx = torch.x * TILE + TILE / 2;
      const cy = torch.y * TILE + TILE / 2;
      const flick = 0.6 + Math.sin(t * 9 + torch.phase) * 0.2 + Math.sin(t * 21 + torch.phase) * 0.1;
      c2d.globalAlpha = 0.28 * flick;
      const g = c2d.createRadialGradient(cx, cy, 2, cx, cy, 62);
      g.addColorStop(0, this.theme.palette.glow);
      g.addColorStop(1, 'rgba(255,180,60,0)');
      c2d.fillStyle = g;
      c2d.beginPath();
      c2d.arc(cx, cy, 62, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    // hazards on the floor plane
    for (const s of this.spikes) s.draw(c2d, { ...opts, frozen: this.freezeTime > 0 });
    for (const f of this.fireJets) f.draw(c2d, { ...opts, frozen: this.freezeTime > 0 });
    for (const l of this.lava) l.draw(c2d, { ...opts, frozen: this.freezeTime > 0 });
    for (const s of this.switches) s.draw(c2d, opts);
    // secret door sparkle so it is discoverable but subtle
    for (const sd of this.secretDoors) {
      if (sd.found) continue;
      const a = 0.12 + Math.sin(t * 2 + sd.x) * 0.08;
      c2d.globalAlpha = a;
      c2d.fillStyle = '#e0c9ff';
      const cx = sd.x * TILE + TILE / 2 + Math.sin(t * 0.7 + sd.y) * 3;
      const cy = sd.y * TILE + TILE / 2 + Math.cos(t * 0.9 + sd.x) * 3;
      c2d.beginPath();
      c2d.arc(cx, cy, 2.4, 0, TAU);
      c2d.fill();
      c2d.globalAlpha = 1;
    }
    // boulders (static cover)
    for (const b of this.boulders) drawRock(c2d, b.x * TILE + TILE / 2, b.y * TILE + TILE / 2, 15, b.seed);
  }

  /** Actors, sorted by y so they overlap correctly. */
  drawActors(c2d, opts) {
    const list = [];
    for (const c of this.coins) if (!c.dead) list.push({ y: c.py, draw: () => c.draw(c2d, opts) });
    for (const g of this.gems) if (!g.dead) list.push({ y: g.py, draw: () => g.draw(c2d, opts) });
    for (const p of this.powerups) if (!p.dead) list.push({ y: p.py, draw: () => p.draw(c2d, opts) });
    if (this.key && !this.key.dead) list.push({ y: this.key.py, draw: () => this.key.draw(c2d, opts) });
    if (this.sword && !this.sword.dead) list.push({ y: this.sword.py, draw: () => this.sword.draw(c2d, opts) });
    for (const ch of this.chests) list.push({ y: ch.py, draw: () => ch.draw(c2d, opts) });
    for (const g of this.gates) list.push({ y: g.py, draw: () => g.draw(c2d, opts) });
    for (const mw of this.movingWalls) list.push({ y: (mw.cells[0]?.y ?? 0) * TILE + TILE, draw: () => mw.draw(c2d, { ...opts, tile: TILE }) });
    if (this.exit) list.push({ y: this.exit.py + 6, draw: () => this.exit.draw(c2d, opts) });
    for (const e of this.enemies) list.push({ y: e.py, draw: () => e.draw(c2d, { ...opts, frozenActive: this.freezeTime > 0 }) });
    list.sort((a, b) => a.y - b.y);
    for (const item of list) item.draw();
  }

  /** Fire walls, rocks and rising lava render above everything. */
  drawOverlay(c2d, opts) {
    for (const r of this.rocks) r.draw(c2d, opts);
    if (this.lavaRise?.active && this.lavaRise.level < this.H) {
      const y = this.lavaRise.level * TILE;
      const g = c2d.createLinearGradient(0, y - 10, 0, y + 40);
      g.addColorStop(0, '#ffe066');
      g.addColorStop(0.25, '#ff7a33');
      g.addColorStop(1, '#b5270c');
      c2d.fillStyle = g;
      c2d.fillRect(0, y, this.W * TILE, this.H * TILE - y);
      c2d.globalAlpha = 0.5;
      c2d.fillStyle = '#fff3c0';
      for (let i = 0; i < this.W; i++) {
        const wob = Math.sin(this.time * 4 + i * 0.9) * 5;
        c2d.beginPath();
        c2d.ellipse(i * TILE + TILE / 2, y + 4 + wob * 0.3, 12, 5 + wob * 0.4, 0, 0, TAU);
        c2d.fill();
      }
      c2d.globalAlpha = 1;
    }
    for (const fw of this.fireWalls) fw.draw(c2d, opts);
    if (this.freezeTime > 0) {
      c2d.globalAlpha = clamp(this.freezeTime * 0.12, 0, 0.16);
      c2d.fillStyle = '#8ce0ff';
      c2d.fillRect(0, 0, this.W * TILE, this.H * TILE);
      c2d.globalAlpha = 1;
    }
  }

  get bounds() {
    return { x: 0, y: 0, w: this.W * TILE, h: this.H * TILE };
  }
}

export { TILE, POWERUP_META, rng };
export default Room;
