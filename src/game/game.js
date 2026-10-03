/**
 * ESCAPE 99 — game orchestrator
 * Owns the state machine, the level flow, scoring, the boss phases and every
 * piece of feedback ("juice"). The UI layer only renders what this class reports.
 */
import { Room } from './room.js';
import { Player, ANIMS } from './player.js';
import { StoneGuardian } from './boss.js';
import { TILE, KeyItem } from './entities.js';
import { Camera } from '../engine/camera.js';
import { Particles } from '../engine/particles.js';
import { getRoom, ROOMS, ROOM_COUNT } from '../data/levels.js';
import { themeByKey, themeForRoom } from '../data/themes.js';
import { upgradeValue } from '../data/progression.js';
import { resolveLook } from '../data/cosmetics.js';
import { makeRng, clamp, TAU, formatTime, dist } from '../core/util.js';
import { generateEndlessRoom, endlessDifficulty } from './endless.js';
import { weeklyRoomDef } from './weekly.js';

export const STATE = {
  BOOT: 'BOOT',
  MAIN_MENU: 'MAIN_MENU',
  LEVEL_LOADING: 'LEVEL_LOADING',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  PLAYER_DEAD: 'PLAYER_DEAD',
  LEVEL_COMPLETE: 'LEVEL_COMPLETE',
  REWARD: 'REWARD',
  GAME_OVER: 'GAME_OVER',
};

const MODE = { STORY: 'story', ENDLESS: 'endless', WEEKLY: 'weekly' };

export class Game {
  constructor({ canvas, save, audio, haptics, input, i18n, analytics, renderer, ui }) {
    this.canvas = canvas;
    this.save = save;
    this.audio = audio;
    this.haptics = haptics;
    this.input = input;
    this.i18n = i18n;
    this.analytics = analytics;
    this.renderer = renderer;
    this.ui = ui;
    this.particles = new Particles();
    this.camera = new Camera();
    this.state = STATE.MAIN_MENU;
    this.mode = MODE.STORY;
    this.room = null;
    this.roomId = 1;
    this.player = null;
    this.boss = null;
    this.t = 0;
    this.elapsed = 0; // level timer
    this.holdingDir = null;
    this.useCount = 0; // for "fewer than X moves" style challenges later
    this.paused = false;
    this.promptTimer = 0;
    this.currentPrompt = null;
    this.flags = {};
    this.lastDt = 1 / 60;
    this.frameAcc = 0;
    this.fpsCap = 60;
    this.reviveUsed = false;
    this.runStats = null;
    this.escapePhase = null;
    this.teach = {};
    this.intro = 0;
    this.results = null;
    this.deathHandled = false;
    this.roomSeed = 0;
    this.onStateChange = null;
    this.transitioning = false;
    this.bossCheckpoint = null;
    this._endlessIndex = 0;
    this._endlessScore = 0;
    this._endlessCoins = 0;
    this._endlessKills = 0;
  }

  /* ═══════════════════════════════ lifecycle ═══════════════════════════════ */

  setState(next) {
    if (this.state === next) return;
    const prev = this.state;
    this.state = next;
    this.onStateChange?.(next, prev);
  }

  startLoop() {
    if (this._raf) return;
    let last = performance.now();
    const tick = (now) => {
      this._raf = requestAnimationFrame(tick);
      let dt = (now - last) / 1000;
      last = now;
      if (dt > 0.1) dt = 0.1; // never let a stall teleport the player
      this.lastDt = dt;
      // battery saver: 30fps target
      this.frameAcc += dt;
      const step = 1 / this.fpsCap;
      if (this.frameAcc < step) return;
      const useDt = Math.min(this.frameAcc, 0.06);
      this.frameAcc = 0;
      this.update(useDt);
      this.render(useDt);
    };
    this._raf = requestAnimationFrame(tick);
  }
  stopLoop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  /* ═══════════════════════════════ room loading ════════════════════════════ */

  loadRoom(id, { mode = MODE.STORY, fresh = true } = {}) {
    this.mode = mode;
    this.roomId = id;
    this.setState(STATE.LEVEL_LOADING);
    const def = this._defForMode(id, mode);
    if (!def) {
      this.setState(STATE.MAIN_MENU);
      return false;
    }
    const upgrades = this.save.data.upgrades;
    const look = resolveLook(this.save.data.cosmetics.equipped);
    const playable = {
      hearts: upgradeValue('health', upgrades.health) || 3,
      // The sword is discovered in room 6 — it is never handed out for free.
      sword: this.save.hasUnlock('sword'),
      swordDamage: upgradeValue('sword', upgrades.sword) || 1,
      dash: this.save.hasUnlock('dash') || upgradeValue('dash', upgrades.dash),
      magnet: upgradeValue('magnet', upgrades.magnet) || 0.32,
    };
    this.room = new Room(def, { magnetRadius: playable.magnet });
    this.room.buildStaticLayer();
    this.player = new Player(this.room.spawn.x, this.room.spawn.y, {
      maxHearts: playable.hearts,
      swordUnlocked: playable.sword,
      swordDamage: playable.swordDamage,
      dashUnlocked: playable.dash,
      magnetRadius: playable.magnet,
    });
    this.player.look = look;
    this.boss = null;
    this.particles.clear();
    this.renderer.fit(this.room, this.camera);
    this.renderer.startCamera(this.room, this.camera);
    this.elapsed = 0;
    this.useCount = 0;
    this.flags = {};
    this.teach = {};
    this.escapePhase = null;
    this.reviveUsed = false;
    this.deathHandled = false;
    this.intro = 0.9;
    this.results = null;
    this.holdingDir = null;
    this.transitioning = false;

    if (def.boss) {
      this.boss = new StoneGuardian(def.boss, this.room);
      this.boss.onEvent = (name, data) => this._onBossEvent(name, data);
      if (this.bossCheckpoint?.roomId === id) {
        this.boss.hp = this.bossCheckpoint.hp;
        this.boss.cracks = this.boss.maxHp - this.boss.hp;
        if (this.bossCheckpoint.keyDropped) {
          // Re-entering the escape phase after a death: keep it fair and fun.
          this.boss.state = 'dead';
          this.boss.dead = true;
          this._dropBossKey();
          this._startEscapePhase();
        }
      }
    } else {
      this.bossCheckpoint = null;
    }

    // teach triggers
    const teach = def.teach || {};
    if (teach.intro) this.prompt(teach.intro.text, teach.intro.duration ?? 2.4, { sub: teach.intro.sub, big: true });
    if (teach.cycle?.wait) {
      this.teach.cycle = { ...teach.cycle, timer: 0, phase: 'wait' };
    }
    this.audio.playMusic(this._musicFor(def), { intensity: def.isBoss ? 0.4 : 0.1 });
    this.setState(STATE.PLAYING);
    this.save.markLevelStart(id);
    this.analytics.track('level_started', { room: id, mode, attempt: this.save.roomStat(id).attempts });
    if (id === 1 && mode === MODE.STORY) this.analytics.track('tutorial_started', { room: 1 });
    this.ui?.onRoomLoaded?.(this);
    return true;
  }

  _defForMode(id, mode) {
    if (mode === MODE.ENDLESS) {
      this._endlessIndex = id;
      return generateEndlessRoom(id, this.roomSeed || (this.roomSeed = (Math.random() * 1e9) | 0));
    }
    if (mode === MODE.WEEKLY) return weeklyRoomDef();
    return getRoom(id);
  }

  _musicFor(def) {
    if (def.isBoss) return 'boss';
    const theme = themeByKey(def.theme);
    const map = { temple: 'temple', lava: 'cave', fortress: 'cave', jungle: 'temple', frost: 'cave', clockwork: 'temple', desert: 'temple', shadow: 'boss', sky: 'menu', final: 'boss' };
    return map[theme.key] || 'temple';
  }

  restartRoom({ keepBossHp = true } = {}) {
    const id = this.roomId;
    const mode = this.mode;
    if (this.boss && keepBossHp && this.boss.hp < this.boss.maxHp) {
      this.bossCheckpoint = { roomId: id, hp: this.boss.hp, keyDropped: this.escapePhase?.started };
    }
    this.analytics.track('level_restart', { room: id, mode });
    this.loadRoom(id, { mode });
  }

  nextRoom() {
    if (this.mode === MODE.ENDLESS) {
      this._endlessIndex++;
      this.loadRoom(this._endlessIndex, { mode: MODE.ENDLESS });
      return;
    }
    if (this.mode === MODE.WEEKLY) {
      this.loadRoom(1, { mode: MODE.WEEKLY });
      return;
    }
    const next = this.roomId + 1;
    if (!getRoom(next)) {
      this.setState(STATE.MAIN_MENU);
      this.ui?.showMenu?.();
      return;
    }
    this.loadRoom(next, { mode: MODE.STORY });
  }

  goToMenu() {
    this.setState(STATE.MAIN_MENU);
    this.room = null;
    this.player = null;
    this.boss = null;
    this.audio.playMusic('menu', { intensity: 0 });
    this.ui?.showMenu?.();
  }

  /* ═══════════════════════════════ update loop ═════════════════════════════ */

  update(dt) {
    this.t += dt;
    const st = this.state;
    if (st === STATE.MAIN_MENU || st === STATE.BOOT || st === STATE.REWARD || st === STATE.GAME_OVER) {
      this.particles.update(dt);
      return;
    }
    if (st === STATE.PAUSED) return;
    if (!this.room) return;

    const ctx = this._ctx();
    this.particles.update(dt);
    this.camera.update(dt);

    if (st === STATE.PLAYING) {
      this.elapsed += dt;
      if (this.intro > 0) this.intro -= dt;
      // hold-to-move: keep stepping while a direction is held
      if (this.holdingDir && !this.player.moving && !this.player.dead) {
        this._step(this.holdingDir, true);
      }
      this.player.update(dt, ctx);
      this.room.update(dt, ctx);
      this.boss?.update(dt, ctx);
      this._updateExitContact(ctx);
      this._updateTeach(dt);
      this._updateTimer(dt);
      this._updateEscape(dt, ctx);
      this._updateDanger(dt);
      if (this.player.dead && !this.deathHandled) {
        this.deathHandled = true;
        this._onDeath();
      }
    } else if (st === STATE.PLAYER_DEAD) {
      this.player.update(dt, ctx);
      this.room.update(dt, ctx);
      this.boss?.update(dt, ctx);
      if (this.player.deathT <= 0 && this.deathDelay > 0) {
        this.deathDelay -= dt;
        if (this.deathDelay <= 0) this.ui?.showDeath?.(this);
      }
    } else if (st === STATE.LEVEL_COMPLETE) {
      this.player.update(dt, ctx);
      this.room.update(dt, ctx);
      this.completeDelay -= dt;
      if (this.completeDelay <= 0) this._finishLevel();
    }
    // camera follow (gently, only when the room is bigger than the viewport)
    if (this.player) {
      this.camera.follow(this.player.px, this.player.py, dt, { ease: 4.5 });
    }
    this.promptTimer -= dt;
    if (this.promptTimer <= 0 && this.currentPrompt) {
      this.currentPrompt = null;
      this.ui?.clearPrompt?.();
    }
  }

  _ctx() {
    return {
      room: this.room,
      player: this.player,
      boss: this.boss,
      game: this,
      particles: this.particles,
      audio: this.audio,
      haptics: this.haptics,
      input: this.input,
      t: this.t,
      holdingDir: this.holdingDir,
    };
  }

  /* ═══════════════════════════════ input bridge ════════════════════════════ */

  handleMove({ dir, hold, released }) {
    if (this.state !== STATE.PLAYING || !this.player) return;
    if (dir) {
      this.holdingDir = dir;
      if (!this.player.moving) this._step(dir, true);
    }
    if (released || (!dir && !hold)) {
      this.holdingDir = null;
    }
  }

  _step(dir, fromHold) {
    if (!this.player || this.player.dead || this.state !== STATE.PLAYING) return;
    const started = this.player.tryStep(dir, this._ctx());
    if (started) {
      if (!fromHold) this.useCount++;
      this.audio.unlock?.();
    }
  }

  handleAction(opts = {}) {
    if (this.state !== STATE.PLAYING || !this.player) return;
    const ctx = this._ctx();
    if (opts.dash || this.actionMode === 'dash') {
      if (!this.player.dash(ctx)) this.player.attack(ctx);
    } else if (this.player.swordUnlocked) {
      this.player.attack(ctx);
    } else if (this.player.dashUnlocked) {
      this.player.dash(ctx);
    }
  }

  /* ═══════════════════════════════ events from world ════════════════════════ */

  onCoinCollected(value = 1) {
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.coins += value;
    this.save.addCoins(value, true);
    this.ui?.setCoins?.(this.save.data.wallet.coins);
    this.challenges?.track('coinsCollected', value);
    this.analytics.track('coin_collected', { room: this.roomId, value });
  }
  onGemCollected(value = 1) {
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.gems += value;
    this.save.addGems(value, true);
    this.ui?.setGems?.(this.save.data.wallet.gems);
    this.challenges?.track('gemsFound', value);
    this.analytics.track('gem_collected', { room: this.roomId, value });
  }
  onEnemyDefeated(enemy) {
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.kills++;
    this._endlessKills++;
    this.save.bumpStat('enemiesDefeated', 1);
    this.save.bumpStat('slimesDefeated', 1);
    this.challenges?.track('enemiesDefeated', 1);
    const coins = enemy.coins ?? 3;
    this.save.addCoins(coins, true);
    this.runStats.coins += coins;
    for (let i = 0; i < 3; i++) {
      this.particles.spawn({
        x: enemy.px + (Math.random() - 0.5) * 14,
        y: enemy.py,
        vx: (Math.random() - 0.5) * 1.6,
        vy: -2 - Math.random() * 1.6,
        life: 0.6,
        size: 3,
        color: '#ffd45e',
        gravity: 6,
        drag: 1.6,
        glow: true,
      });
    }
    this.ui?.setCoins?.(this.save.data.wallet.coins);
  }
  onKeyCollected() {
    const def = this.room.def;
    this.room.exit?.openUp(this._ctx());
    this.save.bumpStat('keysFound', 1);
    this.challenges?.track('keysFound', 1);
    this.audio.setIntensity?.(Math.min(1, this.audio.intensity + 0.25));
    if (def.teach?.onKey) this.prompt(def.teach.onKey.text, def.teach.onKey.duration ?? 1.6, { big: true });
    // slow-motion beat for the key (0.15s) — cheap, readable drama
    this.slowMo = 0.15;
    if (def.fireWalls?.length) this.room.armFireWalls();
    this.onKeyCollectedHook?.(def);
  }
  onSwordCollected() {
    this.save.setUnlock('sword', true);
    const def = this.room.def;
    if (def.teach?.onSword) this.prompt(def.teach.onSword.text, def.teach.onSword.duration ?? 2.2, { big: true, action: true });
    this.actionMode = 'attack';
    this.ui?.setAction?.(this.i18n.t('t_tap_attack'), true);
  }
  onSwitchPressed(sw, pressed, total) {
    const def = this.room.def;
    this.save.bumpStat('switchesPressed', 1);
    if (def.teach?.onSwitch) this.prompt(def.teach.onSwitch.text, def.teach.onSwitch.duration ?? 1.1);
    this.floatText(sw.px, sw.py - 26, `${pressed}/${total}`, { color: '#7fe3d6', size: 16 });
  }
  onGateOpen() {
    const def = this.room.def;
    if (def.teach?.onGateOpen) this.prompt(def.teach.onGateOpen.text, def.teach.onGateOpen.duration ?? 1.6, { big: true });
    this.shake(0.4);
  }
  onChestOpened(chest) {
    const def = this.room.def;
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.chests++;
    const loot = chest.loot || {};
    const luck = upgradeValue('luck', this.save.data.upgrades.luck) || 0;
    const coins = Math.round((loot.coins ?? 40) * (1 + luck) * (chest.big ? 2 : 1));
    this.save.addCoins(coins, true);
    this.onCoinCollected(0);
    this.ui?.setCoins?.(this.save.data.wallet.coins);
    this.floatText(chest.px, chest.py - 30, `+${coins} 🪙`, { color: '#ffd45e', size: 18, life: 1.2 });
    if (Math.random() < (loot.gemChance ?? 0.3) + luck * 0.5) {
      this.onGemCollected(1);
      this.floatText(chest.px, chest.py - 50, '+1 💎', { color: '#8ce0ff', size: 18, life: 1.3 });
    }
    if (loot.shard) {
      this.save.bumpStat('cosmeticShards', 1);
    }
    this.flags.chestOpened = true;
    if (def.teach?.onChest) this.prompt(def.teach.onChest.text, def.teach.onChest.duration ?? 1.6, { big: true });
  }
  onPowerUpUsed(kind) {
    this.analytics.track('powerup_used', { kind, room: this.roomId });
    this.save.bumpStat('powerupsUsed', 1);
  }
  onPlayerDamaged(reason) {
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.damage++;
    this.renderer.hurt();
    this.flags.damaged = true;
    this.ui?.setHearts?.(this.player.hearts, this.player.maxHearts);
    this.analytics.track('player_damaged', { room: this.roomId, reason });
  }
  onPlayerDeath(reason) {
    this.analytics.track('death_reason', { room: this.roomId, reason });
    this.analytics.track('level_failed', { room: this.roomId, reason, time: Math.round(this.elapsed) });
  }
  onReachExit() {
    if (this.state !== STATE.PLAYING) return;
    this._completeLevel();
  }
  onExitLocked() {
    if (this.room.exit?.open) return;
    this.ui?.shakeLocked?.();
  }
  onWallsMove(wall) {
    const def = this.room.def;
    if (def.teach?.onWallsMove && !this.flags.taughtWalls) {
      this.flags.taughtWalls = true;
      this.prompt(def.teach.onWallsMove.text, def.teach.onWallsMove.duration ?? 1.2);
    }
    void wall;
  }
  onFireWallStart() {
    this.audio.playMusic('chase', { intensity: 0.85 });
    this.audio.setIntensity(0.9);
    this.prompt('t_keep_going', 1.6, { big: true });
  }
  onAttackSwing(hits) {
    if (hits > 0 && this.boss) return;
    // Sword can also open the boss's stun window if the player is close enough
  }
  onBossStunned(boss) {
    const def = this.room.def;
    if (def.teach?.onStun && !this.flags.taughtStun) {
      this.flags.taughtStun = true;
      this.prompt(def.teach.onStun.text, def.teach.onStun.duration ?? 1.5, { big: true });
    }
    void boss;
  }
  _onBossEvent(name, data) {
    if (name === 'wake') this.audio.setIntensity(0.75);
    if (name === 'defeated') {
      this.save.unlockAchievement('boss_slayer');
      this.save.bumpStat('bossesDefeated', 1);
      this.ui?.setBossBar?.(null);
      this._dropBossKey();
      this._startEscapePhase();
    }
    if (name === 'telegraph' && data?.pattern === 'charge') this.audio.play('roar');
  }

  /* ═══════════════════════════════ level flow ══════════════════════════════ */

  _updateExitContact(ctx) {
    // Boss hits land through the shared attack resolver.
    if (this.boss && !this.boss.dead && this.player.attackT > 0 && !this.player.attackHitConsumedForBoss) {
      const d = dist(this.boss.x, this.boss.y, this.player.px, this.player.py);
      if (d < TILE * 1.9 && this.player.attackT < 0.2) {
        this.player.attackHitConsumedForBoss = true;
        this.boss.takeHit(this.player.swordDamage + (this.player.powerups.fireSword > 0 ? 1 : 0), ctx);
        ctx.haptics?.buzz('boss');
        this.ui?.setBossBar?.(this.boss.hp, this.boss.maxHp);
      }
    }
    if (this.player.attackT <= 0) this.player.attackHitConsumedForBoss = false;
  }

  _updateTimer(dt) {
    const def = this.room.def;
    const timer = def.timer || { type: 'none' };
    if (timer.type === 'none') {
      this.ui?.setTimer?.(null);
      return;
    }
    if (timer.type === 'optional') {
      const remain = timer.seconds;
      const over = this.elapsed > remain;
      this.ui?.setTimer?.(this.elapsed, { danger: over, countUp: true, target: remain });
      if (!over && this.elapsed > remain - 5 && !this.flags.warnedTime) {
        this.flags.warnedTime = true;
        this.audio.setIntensity(0.6);
      }
    }
    void dt;
  }

  _updateTeach(dt) {
    const cycle = this.teach.cycle;
    if (cycle) {
      cycle.timer += dt;
      if (cycle.phase === 'wait' && cycle.timer > 2.2) {
        this.prompt(cycle.go, 0.9, { big: true, color: '#8fdc6a' });
        cycle.phase = 'go';
        cycle.timer = 0;
      } else if (cycle.phase === 'go' && cycle.timer > 1.4) {
        cycle.phase = 'wait';
        cycle.timer = 0;
      }
    }
  }

  _updateDanger(dt) {
    let danger = 0;
    for (const fw of this.room.fireWalls) {
      if (fw.active) {
        const d = Math.abs(fw.x - this.player.px) / (TILE * 6);
        danger = Math.max(danger, clamp(1 - d, 0, 1));
      }
    }
    if (this.escapePhase?.active) {
      const lavaY = this.room.lavaRise ? this.room.lavaRise.level * TILE : 0;
      const d = (this.player.py - lavaY) / (TILE * 7);
      danger = Math.max(danger, clamp(1 - d, 0, 1));
    }
    this.danger = clamp(danger, 0, 1);
    if (this.danger > 0.35) this.audio.setIntensity?.(0.55 + this.danger * 0.45);
    void dt;
  }

  _updateEscape(dt, ctx) {
    if (!this.escapePhase?.active || this.escapePhase.done) return;
    this.escapePhase.left -= dt;
    this.ui?.setTimer?.(this.escapePhase.left, { danger: this.escapePhase.left < 8, countDown: true });
    const left = Math.ceil(this.escapePhase.left);
    if (left <= 3 && left !== this.escapePhase.lastBeep && left > 0) {
      this.escapePhase.lastBeep = left;
      this.audio.play('countdown');
      this.haptics.buzz('countdown');
      this.ui?.bigCountdown?.(String(left));
    }
    // raining rocks keep the pressure on
    this.escapePhase.rockT -= dt;
    if (this.escapePhase.rockT <= 0) {
      this.escapePhase.rockT = 0.55 + Math.random() * 0.5;
      const gx = clamp(Math.round(this.player.x) + Math.floor((Math.random() - 0.5) * 6), 1, this.room.W - 2);
      const gy = clamp(Math.round(this.player.y) + Math.floor((Math.random() - 0.5) * 6), 1, this.room.H - 2);
      this.room.spawnRock(gx, gy, { warn: 0.75 });
    }
    if (this.escapePhase.left <= 0) {
      this.escapePhase.done = true;
      this.player.damage(99, 'time', ctx);
    }
  }

  _startEscapePhase() {
    const cfg = this.room.def.boss?.escape || { seconds: 30, lava: true, lavaSpeed: 0.6 };
    this.escapePhase = { active: true, left: cfg.seconds, total: cfg.seconds, rockT: 0.9, done: false, started: true };
    if (cfg.lava && this.room.lavaRise) {
      this.room.lavaRise.active = true;
      this.audio.play('lava');
    }
    this.audio.playMusic('chase', { intensity: 0.9 });
    this.prompt('t_escape_now', 2.2, { big: true });
    this.ui?.flashBanner?.('t_escape_now');
    this.shake(0.7);
  }

  _dropBossKey() {
    if (!this.boss) return;
    const gx = clamp(Math.floor(this.boss.x / TILE), 1, this.room.W - 2);
    const gy = clamp(Math.floor(this.boss.y / TILE), 1, this.room.H - 2);
    // Place the dropped key on a free tile near the boss.
    const spot = this.room.isSolid(gx, gy) ? this.room.nearestFree(gx, gy, 4) || { x: gx, y: gy } : { x: gx, y: gy };
    this.room.key = new KeyItem(spot.x, spot.y);
    this.particles.burst((spot.x + 0.5) * TILE, (spot.y + 0.5) * TILE, 'key', { count: 30, scale: 1.4 });
    this.audio.play('key');
  }

  _completeLevel() {
    if (this.state !== STATE.PLAYING) return;
    this.setState(STATE.LEVEL_COMPLETE);
    this.completeDelay = 1.5;
    this.player.celebrate(this._ctx());
    this.haptics.buzz('perfect');
    this.shake(0.4);
    this.audio.setIntensity(1);
    this.particles.burst(this.player.px, this.player.py - 20, 'confetti', { count: 46, scale: 1.3 });
    this.audio.play('victory');
    this.analytics.track('level_completed', { room: this.roomId, time: Math.round(this.elapsed), mode: this.mode });
  }

  _finishLevel() {
    const def = this.room.def;
    const results = this._computeResults(def);
    this.results = results;
    this.applyResults(results, def);
    this.setState(STATE.REWARD);
    this.ui?.showResults?.(this, results);
  }

  _computeResults(def) {
    const time = this.elapsed;
    const challenge = def.challenge || null;
    let challengeDone = false;
    if (challenge) {
      switch (challenge.type) {
        case 'time':
          challengeDone = time <= challenge.value;
          break;
        case 'noDamage':
          challengeDone = !this.flags.damaged;
          break;
        case 'gem':
          challengeDone = this.room.gemsCollected >= 1;
          break;
        case 'allEnemies':
          challengeDone = this.room.enemies.length > 0 && this.room.enemiesAlive === 0;
          break;
        case 'chest':
          challengeDone = !!this.flags.chestOpened;
          break;
        default:
          challengeDone = true;
      }
    }
    const allCoins = this.room.allCoins;
    const stars = 1 + (allCoins ? 1 : 0) + (challengeDone ? 1 : 0);
    const base = def.reward?.coins ?? 20;
    const bonuses = [];
    let bonusCoins = 0;
    if (!this.flags.damaged) {
      bonusCoins += 10;
      bonuses.push({ key: 'bonus_no_damage', amount: 10 });
    }
    if (def.par?.time && time <= def.par.time) {
      bonusCoins += 15;
      bonuses.push({ key: 'bonus_speed', amount: 15 });
    }
    if (allCoins && this.room.coinTotal > 0) {
      bonusCoins += 10;
      bonuses.push({ key: 'bonus_all_coins', amount: 10 });
    }
    const collected = this.runStats?.coins ?? 0;
    const coins = base + bonusCoins + (def.reward?.gems ? 0 : 0);
    const gems = (def.reward?.gems ?? 0) + this.room.gemsCollected;
    return {
      roomId: def.id,
      name: def.name,
      mode: this.mode,
      time,
      stars,
      allCoins,
      challengeDone,
      challenge,
      coins,
      bonusCoins,
      bonuses,
      gems,
      collected,
      kills: this.runStats?.kills ?? 0,
      damage: this.runStats?.damage ?? 0,
      endless: this.mode === 'endless' ? { score: this._endlessScore, rooms: this._endlessIndex } : null,
    };
  }

  applyResults(results, def) {
    const { coins, gems, stars } = results;
    this.save.addCoins(coins, true);
    if (gems) this.save.addGems(gems, true);
    if (this.mode === MODE.STORY) {
      const improved = this.save.recordEscape(def.id, {
        stars,
        time: results.time,
        coins: results.coins,
        noDamage: !this.flags.damaged,
        challengeDone: results.challengeDone,
      });
      results.improved = improved;
      this.save.bumpStat('starsEarned', stars);
      this.save.bumpStat('coinsCollected', results.collected);
      this.save.bumpStat('gemsFound', this.room.gemsCollected);
      this.save.bumpStat('keysFound', 0);
      this.save.bumpStat('roomsEscaped', 1);
      this.save.bumpStat('roomsCleared', 1);
      if (!this.flags.damaged) this.save.bumpStat('noDamageEscapes', 1);
      if (results.time < 15) this.save.bumpStat('fastEscapes', 1);
      if (results.time < 25) this.save.bumpStat('fastEscapes25', 1);
      if (this.room.spikes.length || this.room.fireJets.length) this.save.bumpStat('trapRooms', 1);
      this.challenges?.track('roomsEscaped', 1);
      this.challenges?.track('starsEarned', stars);
      if (stars === 3) this.challenges?.track('perfectEscapes', 1);
      if (!this.flags.damaged) this.challenges?.track('noDamageEscapes', 1);
      if (results.time < 25) this.challenges?.track('fastEscape25', 1);
      if (this.room.spikes.length || this.room.fireJets.length) this.challenges?.track('trapRooms', 1);
      if (stars === 3) this.save.bumpStat('perfectEscapes', 1);
      // unlocks
      if (def.grants?.sword) this.save.setUnlock('sword', true);
      if (def.id === 1) this.save.unlockAchievement('first_escape');
      if (def.id === 9) this.ui?.setFlag?.('bossUnlocked', true);
      if (def.id >= 20) this.save.setUnlock('endless', true);
      if (def.id >= 10) this.save.setUnlock('weekly', true);
      if (def.reward?.skin) this.save.grantCosmetic('skins', def.reward.skin);
      this.save.bumpStat('bestEndless', 0);
      // world progress
      const world = Math.min(10, Math.ceil(def.id / 10));
      this.save.data.progress.worldUnlocked = Math.max(this.save.data.progress.worldUnlocked, world);
      if (def.id === 10) {
        this.save.data.progress.worldUnlocked = Math.max(2, this.save.data.progress.worldUnlocked);
      }
      this.checkProgressAchievements();
    } else if (this.mode === MODE.ENDLESS) {
      this._endlessScore += 120 + results.collected * 5 + results.kills * 25;
      results.endlessScore = this._endlessScore;
      this.save.data.progress.endlessBest = Math.max(this.save.data.progress.endlessBest, this._endlessScore);
      this.save.data.progress.endlessBestRooms = Math.max(this.save.data.progress.endlessBestRooms, this._endlessIndex);
      this.save.bumpStat('endlessRooms', 1);
      results.best = this.save.data.progress.endlessBest;
      if (this._endlessIndex >= 10) this.save.unlockAchievement('endless_10');
    }
    this.save.commit('results', true);
    this.analytics.track('reward_claimed', { room: def.id, coins, gems, stars });
    this.ui?.refreshWallet?.(this.save);
  }

  checkProgressAchievements() {
    const p = this.save.data.progress;
    const stats = this.save.data.stats;
    const checks = [
      ['first_escape', () => p.rooms?.[1]?.stars > 0],
      ['treasure_hunter', () => p.totalCoinsEarned >= 1000],
      ['untouchable', () => (stats.noDamageEscapes || 0) >= 1],
      ['untouchable_10', () => (stats.noDamageEscapes || 0) >= 10],
      ['slime_slayer', () => (stats.slimesDefeated || 0) >= 100],
      ['speed_runner', () => (stats.fastEscapes || 0) >= 1],
      ['stargazer', () => this.save.totalStars() >= 20],
      ['gem_collector', () => p.totalGemsEarned >= 25],
      ['master_escapist', () => p.unlockedRoom > 99],
    ];
    const unlocked = [];
    for (const [id, fn] of checks) {
      try {
        if (fn() && this.save.unlockAchievement(id)) unlocked.push(id);
      } catch {
        /* ignore */
      }
    }
    if (unlocked.length) this.ui?.showAchievementToasts?.(unlocked);
  }

  /* ═══════════════════════════════ death / revive ══════════════════════════ */

  _onDeath() {
    this.setState(STATE.PLAYER_DEAD);
    this.deathDelay = 0.75;
    this.save.recordDeath(this.roomId, this.player.deathReason || 'unknown');
    this.audio.play('fail');
    this.audio.setIntensity(0.1);
    this.shake(0.6);
  }

  /** Rewarded "optional second chance" — the player chooses, never forced. */
  revive() {
    if (!this.player) return false;
    if (this.player.dead) this.player.revive(this._ctx());
    this.setState(STATE.PLAYING);
    this.deathHandled = false;
    this.reviveUsed = true;
    this.runStats = this.runStats || { coins: 0, gems: 0, kills: 0, damage: 0, chests: 0 };
    this.runStats.damage = this.runStats.damage; // deaths keep their damage record
    this.ui?.setHearts?.(this.player.hearts, this.player.maxHearts);
    this.audio.playMusic(this._musicFor(this.room.def), { intensity: 0.4 });
    this.analytics.track('optional_ad_completed', { placement: 'revive', room: this.roomId });
    return true;
  }

  /* ═══════════════════════════════ helpers ═════════════════════════════════ */

  shake(amount) {
    this.camera.addShake(amount * (this.save.settings.reducedShake ? 0.4 : 1));
  }
  floatText(x, y, str, opts) {
    this.particles.text(x, y, str, opts);
  }
  prompt(key, duration = 1.6, opts = {}) {
    if (!key) return;
    this.currentPrompt = { key, opts };
    this.promptTimer = duration;
    // both lines are keys, so the HUD never has to know about i18n
    const { sub, ...rest } = opts;
    this.ui?.showPrompt?.(this.i18n.t(key), {
      ...rest,
      sub: sub ? this.i18n.t(sub) : undefined,
      duration,
    });
  }
  setShakeScale() {
    this.camera.setShakeScale(this.save.settings.reducedShake ? 0.4 : 1);
  }

  /* ═══════════════════════════════ render ══════════════════════════════════ */

  render(dt) {
    const r = this.renderer;
    const c2d = r.begin(this.camera);
    if (this.room && this.state !== STATE.MAIN_MENU && this.state !== STATE.BOOT) {
      r.beginWorld(this.camera);
      const opts = {
        t: this.t,
        theme: this.room.theme,
        tile: TILE,
        highContrast: this.save.settings.highContrast,
      };
      this.room.drawGround(c2d, opts);
      this.room.drawActors(c2d, opts);
      if (this.player) {
        r.drawPlayer(c2d, this.player, {
          t: this.t,
          look: this.player.look || resolveLook({}),
          escapePhase: !!this.escapePhase?.active,
        });
      }
      if (this.boss) this.boss.draw(c2d, { t: this.t });
      this.particles.draw(c2d);
      this.room.drawOverlay(c2d, opts);
      this.particles.drawTexts(c2d);
      // first-room gesture hint
      if (this.room.def.teach?.intro?.ghost && this.intro > -2 && this.state === STATE.PLAYING && this.elapsed < 6) {
        r.drawGestureHint(c2d, this.player.px, this.player.py + 26, this.t, 'up');
      }
      r.endWorld();
    }
    r.overlay(dt, {
      danger: this.danger || 0,
      t: this.t,
      lowHearts: this.player ? this.player.hearts <= 1 && !this.player.dead : false,
      frozen: this.room?.freezeTime > 0,
      theme: this.room?.theme,
    });
    if (this.state === STATE.PLAYING || this.state === STATE.PAUSED) {
      r.drawJoystick(this.input);
    }
  }
}

export { MODE };
export default Game;
