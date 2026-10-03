/**
 * ESCAPE 99 — headless test harness
 * Runs the real game modules in Node (no DOM) with a scripted "bot" player so
 * every room can be proven solvable and every mechanic exercised.
 *
 *   node tests/run.mjs
 */
import { SaveManager } from '../src/core/save.js';
import { I18n } from '../src/core/i18n.js';
import { STRINGS } from '../src/data/strings.js';
import { Analytics } from '../src/core/analytics.js';
import { Challenges } from '../src/core/challenges.js';
import { Game } from '../src/game/game.js';
import { StoneGuardian, BOSS_STATE } from '../src/game/boss.js';
import { GRID } from '../src/data/levels.js';
import { DIR_LIST, DIRS } from '../src/core/util.js';

/* ───────────────────────────── tiny test runner ─────────────────────────── */
export const results = { pass: 0, fail: 0, failures: [] };
export function test(name, fn) {
  try {
    fn();
    results.pass++;
    console.log(`  \x1b[32m✓\x1b[0m ${name}`);
  } catch (err) {
    results.fail++;
    results.failures.push({ name, err });
    console.log(`  \x1b[31m✗\x1b[0m ${name}\n      ${err.message}`);
  }
}
export function eq(actual, expected, msg = '') {
  if (actual !== expected) throw new Error(`${msg} expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
export function ok(value, msg = 'expected truthy') {
  if (!value) throw new Error(msg);
}
export function group(name) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

/* ──────────────────────────────── stubs ────────────────────────────────── */
export const stubAudio = {
  play() {},
  playMusic() {},
  stopMusic() {},
  setIntensity() {},
  setMusicVolume() {},
  setSfxVolume() {},
  unlock() {},
  intensity: 0,
};
export const stubHaptics = { buzz() {}, setEnabled() {}, supported: false };
export const stubInput = { setEnabled() {}, drawJoystick() {}, reset() {} };
export const stubRenderer = {
  fit() {},
  startCamera() {},
  begin() {},
  beginWorld() {
    return null;
  },
  endWorld() {},
  overlay() {},
  drawGestureHint() {},
  drawJoystick() {},
  hurt() {},
  flashScreen() {},
  resize() {},
};
export class RecordingUI {
  constructor() {
    this.events = [];
    this.results = null;
    this.deaths = 0;
    this.lastPrompt = null;
  }
  onRoomLoaded() {}
  setHearts() {}
  setCoins() {}
  setGems() {}
  setTimer() {}
  setAction() {}
  showPrompt(text) {
    this.lastPrompt = text;
    this.events.push(['prompt', text]);
  }
  clearPrompt() {}
  showDeath() {
    this.deaths++;
  }
  showResults(game, results) {
    this.results = results;
  }
  showMenu() {}
  refreshWallet() {}
  shakeLocked() {}
  bigCountdown() {}
  flashBanner() {}
  setFlag() {}
  showAchievementToasts() {}
  toast() {}
}

export function makeSave() {
  const save = new SaveManager();
  save.hardReset();
  return save;
}

export function makeGame(overrides = {}) {
  const save = overrides.save || makeSave();
  const i18n = new I18n(STRINGS, 'en');
  const analytics = new Analytics(save);
  const challenges = new Challenges(save, i18n, analytics);
  const ui = new RecordingUI();
  const game = new Game({
    canvas: null,
    save,
    audio: stubAudio,
    haptics: stubHaptics,
    input: stubInput,
    i18n,
    analytics,
    renderer: stubRenderer,
  });
  game.challenges = challenges;
  game.ui = ui;
  Object.assign(game, overrides.game || {});
  return { game, save, i18n, analytics, challenges, ui };
}

/* ────────────────────────── grid helpers + bot ─────────────────────────── */
export function bfsPath(room, from, to, { avoidHazards = false, ignoreGates = false } = {}) {
  const { W, H } = GRID;
  const key = (x, y) => y * W + x;
  const seen = new Set([key(from.x, from.y)]);
  const prev = new Map();
  const queue = [{ x: from.x, y: from.y }];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur.x === to.x && cur.y === to.y) {
      const path = [];
      let node = cur;
      while (node && !(node.x === from.x && node.y === from.y)) {
        path.push(node);
        node = prev.get(key(node.x, node.y));
      }
      return path.reverse();
    }
    for (const d of DIR_LIST) {
      const nx = cur.x + DIRS[d].x;
      const ny = cur.y + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seen.has(key(nx, ny))) continue;
      const gateHere = ignoreGates && room.gates.some((g) => g.x === nx && g.y === ny);
      if (!gateHere && room.isSolid(nx, ny)) continue;
      if (avoidHazards) {
        const spike = room.spikes.find((s) => s.x === nx && s.y === ny);
        const fire = room.fireJets.find((f) => f.x === nx && f.y === ny);
        const lava = room.lava.find((l) => l.x === nx && l.y === ny);
        if (spike || fire || lava) continue;
      }
      seen.add(key(nx, ny));
      prev.set(key(nx, ny), cur);
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}

/**
 * Simple objective-driven bot. Feed it a room + game and it walks the BFS path
 * to each objective, pressing switches and swatting slimes on the way.
 */
export function makeBot(game, { godMode = false, collectAll = true, maxSeconds = 240 } = {}) {
  const room = game.room;
  const player = game.player;
  const originalDamage = player.damage.bind(player);
  if (godMode) player.damage = () => false;
  let damageTaken = 0;
  if (godMode) {
    player.damage = function () {
      damageTaken++;
      return false;
    };
  } else {
    player.damage = function (...args) {
      const before = player.hearts;
      const r = originalDamage(...args);
      if (player.hearts < before) damageTaken++;
      return r;
    };
  }
  const objectives = [];
  const push = (tile) => tile && objectives.push({ x: tile.x, y: tile.y, kind: 'tile' });
  for (const sw of room.switches) push({ x: sw.x, y: sw.y });
  if (room.key) push({ x: room.key.x, y: room.key.y });
  if (collectAll) for (const c of room.coins) push({ x: c.x, y: c.y });
  if (collectAll) for (const g of room.gems) push({ x: g.x, y: g.y });
  if (room.chests.length) push({ x: room.chests[0].x, y: room.chests[0].y });
  if (room.sword) push({ x: room.sword.x, y: room.sword.y });
  for (const p of room.powerups) push({ x: p.x, y: p.y });
  if (room.exit) push({ x: room.exit.x, y: room.exit.y });

  let path = null;
  let pathIndex = 0;
  let elapsed = 0;
  const dt = 1 / 60;

  const invalidate = () => {
    path = null;
    pathIndex = 0;
  };
  const refreshObjective = () => {
    // drop objectives that are already satisfied
    const before = objectives.length;
    while (objectives.length) {
      const o = objectives[0];
      if (o.kind !== 'tile') break;
      const sw = room.switches.find((s) => s.x === o.x && s.y === o.y);
      if (sw) {
        if (sw.pressed) {
          objectives.shift();
          continue;
        }
        break;
      }
      const coin = room.coins.find((c) => c.x === o.x && c.y === o.y);
      if (coin) {
        if (coin.dead) {
          objectives.shift();
          continue;
        }
        if (!collectAll) {
          objectives.shift();
          continue;
        }
        break;
      }
      const gem = room.gems.find((g) => g.x === o.x && g.y === o.y);
      if (gem) {
        if (gem.dead) {
          objectives.shift();
          continue;
        }
        break;
      }
      const chest = room.chests.find((c) => c.x === o.x && c.y === o.y);
      if (chest) {
        if (chest.opened) {
          objectives.shift();
          continue;
        }
        break;
      }
      if (room.sword && room.sword.x === o.x && room.sword.y === o.y) {
        if (room.sword.dead) {
          objectives.shift();
          continue;
        }
        break;
      }
      const pu = room.powerups.find((p) => p.x === o.x && p.y === o.y);
      if (pu) {
        if (pu.dead) {
          objectives.shift();
          continue;
        }
        break;
      }
      if (room.key && room.key.x === o.x && room.key.y === o.y) {
        if (room.key.dead) {
          objectives.shift();
          continue;
        }
        break;
      }
      if (room.exit && room.exit.x === o.x && room.exit.y === o.y) {
        break;
      }
      // stale objective (key moved / boss dropped a new one)
      objectives.shift();
    }
    if (objectives.length !== before) invalidate();
  };

  const step = () => {
    if (game.state === 'LEVEL_COMPLETE') return 'completing';
    if (game.state === 'REWARD') return 'complete';
    if (game.state === 'PLAYER_DEAD') return 'dead';
    refreshObjective();
    // Boss handling: only attack when it is stunned; otherwise keep distance.
    if (game.boss && !game.boss.dead && game.boss.state !== BOSS_STATE.DORMANT) {
      const b = game.boss;
      if (b.state === BOSS_STATE.STUNNED || b.state === BOSS_STATE.HURT) {
        const dx = b.x - player.px;
        const dy = b.y - player.py;
        if (Math.hypot(dx, dy) > 34) {
          // walk toward the boss
          const targetX = Math.round(b.x / 34 - 0.5);
          const targetY = Math.round(b.y / 34 - 0.5);
          const here = { x: Math.round(player.x), y: Math.round(player.y) };
          const p = bfsPath(room, here, { x: targetX, y: targetY });
          if (p?.length) {
            const dir = dirTo(here, p[0]);
            if (dir) game.handleMove({ dir, hold: true, released: true });
          }
        } else {
          const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
          const back = { up: 'down', down: 'up', left: 'right', right: 'left' }[dir];
          player.setFacing(back);
          game.handleAction();
        }
        return 'fighting';
      }
      // dodge: stay in a corner away from the boss
      const safe = [
        { x: 1, y: 1 }, { x: room.W - 2, y: 1 }, { x: 1, y: room.H - 2 }, { x: room.W - 2, y: room.H - 2 },
      ];
      let best = safe[0];
      let bestD = -1;
      for (const s of safe) {
        const d = Math.hypot(s.x * 34 - b.x, s.y * 34 - b.y);
        if (d > bestD) {
          bestD = d;
          best = s;
        }
      }
      if (!player.moving) {
        const here = { x: Math.round(player.x), y: Math.round(player.y) };
        const p = bfsPath(room, here, best);
        if (p?.length) {
          const dir = dirTo(here, p[0]);
          if (dir) game.handleMove({ dir, hold: true, released: true });
        }
      }
      return 'dodging';
    }
    // slime swatting: attack anything adjacent
    for (const e of room.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - player.x, e.y - player.y);
      if (d < 1.35) {
        if (player.swordUnlocked) game.handleAction();
        break;
      }
    }
    const objective = objectives[0];
    if (!objective) return 'done';
    // Only plan while standing still: a mid-step round() would plan from a tile
    // the player is leaving, producing a path whose first node is the origin.
    if (player.moving) return 'walking';
    const cur = { x: Math.round(player.x), y: Math.round(player.y) };
    if (cur.x === objective.x && cur.y === objective.y) {
      objectives.shift();
      invalidate();
      return 'arrived';
    }
    while (path && pathIndex < path.length && path[pathIndex].x === cur.x && path[pathIndex].y === cur.y) {
      pathIndex++;
    }
    if (!path || pathIndex >= path.length) {
      path = bfsPath(room, cur, objective, { avoidHazards: false });
      pathIndex = 0;
      if (!path) {
        objectives.shift();
        invalidate();
        return 'unreachable';
      }
      if (path.length === 0) {
        objectives.shift();
        invalidate();
        return 'arrived';
      }
    }
    const next = path[pathIndex];
    const dir = dirTo(cur, next);
    if (dir) {
      game.handleMove({ dir, hold: true, released: true });
      pathIndex++;
      return 'walking';
    }
    // Something is off with the plan — drop it and re-plan next tick.
    invalidate();
    return 'replan';
  };

  return {
    step,
    get damageTaken() {
      return damageTaken;
    },
    get objectivesLeft() {
      return objectives.length;
    },
    run(frames = 60 * maxSeconds) {
      for (let i = 0; i < frames; i++) {
        const r = step();
        game.update(dt);
        elapsed += dt;
        if (r === 'complete') return { outcome: 'complete', seconds: elapsed };
        if (r === 'dead') return { outcome: 'dead', seconds: elapsed };
        if (game.state === 'REWARD') return { outcome: 'complete', seconds: elapsed };
        if (game.state === 'GAME_OVER') return { outcome: 'dead', seconds: elapsed };
      }
      return { outcome: 'timeout', seconds: elapsed };
    },
  };
}

export function dirTo(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  if (dy === -1) return 'up';
  return null;
}

/** Drives a boss through its whole cycle without a real player. */
export function bossHelper(game) {
  const room = game.room;
  const boss = game.boss;
  return { room, boss, ctx: game._ctx() };
}

export { StoneGuardian, GRID };
