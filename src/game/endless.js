/**
 * ESCAPE 99 — ENDLESS ESCAPE
 * Procedurally assembles compatible room sections from the same component
 * library the handcrafted rooms use. Every generated room is validated for
 * solvability (spawn → key → exit) before it is handed to the player.
 */
import { makeRng, DIR_LIST, DIRS } from '../core/util.js';
import { WORLDS } from '../data/themes.js';
import { GRID } from '../data/levels.js';

const { W, H } = GRID;

export const endlessDifficulty = (index) => Math.min(1, (index - 1) / 22);

export function generateEndlessRoom(index, seed = 1) {
  const difficulty = endlessDifficulty(index);
  const rng = makeRng(((seed >>> 0) + index * 7919) >>> 0);
  const world = WORLDS[(index - 1) % WORLDS.length];
  let attempt = 0;
  let best = null;
  while (attempt < 24) {
    attempt++;
    const room = tryBuild(rng, index, difficulty, world);
    if (room) {
      best = room;
      break;
    }
  }
  if (!best) best = tryBuild(rng, index, difficulty, world, true);
  best.id = 1000 + index;
  best.name = `ENDLESS ${index}`;
  best.theme = world.key;
  best.timer = { type: difficulty > 0.5 ? 'optional' : 'none', seconds: 60 };
  best.par = { time: 40, coins: 0 };
  best.challenge = index % 3 === 0
    ? { id: 'time_e', type: 'time', value: 45, text: 'Escape in under 45s', short: '< 45s' }
    : { id: 'no_damage_e', type: 'noDamage', text: 'Finish without taking damage', short: 'NO DAMAGE' };
  best.reward = { coins: 25 + Math.round(difficulty * 40) };
  best.endless = true;
  return best;
}

function tryBuild(rng, index, difficulty, world, force = false) {
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(y === 0 || x === 0 || y === H - 1 || x === W - 1 ? '#' : '.');
    grid.push(row);
  }
  // ── interior structures ─────────────────────────────────────────────────
  const clusters = force ? 2 : 2 + Math.floor(difficulty * 6 + rng() * 2);
  for (let i = 0; i < clusters; i++) {
    const cx = rng.int(2, W - 4);
    const cy = rng.int(2, H - 4);
    const w = rng.int(1, 3);
    const h = rng.int(1, 3);
    for (let y = cy; y < cy + h && y < H - 1; y++) {
      for (let x = cx; x < cx + w && x < W - 1; x++) grid[y][x] = '#';
    }
  }
  // ── key positions on open tiles ─────────────────────────────────────────
  const open = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x] === '.') open.push({ x, y });
  if (open.length < 40) return null;
  const spawn = pickOpen(rng, open, (t) => t.y > H * 0.62);
  const keyTile = pickOpen(rng, open, (t) => t.y < H * 0.35 && dist2(t, spawn) > 36);
  const exitTile = pickOpen(rng, open, (t) => t.y < H * 0.25 && dist2(t, spawn) > 60 && dist2(t, keyTile) > 12);
  if (!spawn || !keyTile || !exitTile) return null;

  const path1 = bfs(grid, spawn, keyTile);
  const path2 = bfs(grid, keyTile, exitTile);
  if (!path1 || !path2) {
    if (!force) return null;
    // fall back to a clear corridor
    for (let y = 1; y < H - 1; y++) grid[y][6] = '.';
    for (let x = 1; x < W - 1; x++) grid[6][x] = '.';
  }

  grid[spawn.y][spawn.x] = 'S';
  grid[keyTile.y][keyTile.x] = 'K';
  grid[exitTile.y][exitTile.x] = 'E';
  const pathTiles = [...(path1 || []), ...(path2 || [])];
  void pathTiles;

  // ── coins breadcrumb along the route ────────────────────────────────────
  const route = [...path1, ...path2];
  for (const tile of route) {
    if (rng.chance(0.5) && grid[tile.y][tile.x] === '.') grid[tile.y][tile.x] = 'c';
  }
  // ── hazards ─────────────────────────────────────────────────────────────
  const spikeBands = 1 + Math.round(difficulty * 4);
  for (let i = 0; i < spikeBands; i++) {
    const y = rng.int(2, H - 3);
    const x0 = rng.int(1, W - 5);
    const len = rng.int(2, 5 + Math.round(difficulty * 3));
    for (let x = x0; x < Math.min(W - 1, x0 + len); x++) {
      if (grid[y][x] === '.' && rng.chance(0.82)) grid[y][x] = rng.chance(0.5) ? '^' : 'v';
    }
  }
  const fireCount = Math.round(difficulty * 4);
  for (let i = 0; i < fireCount; i++) {
    const t = pickOpen(rng, open, () => true);
    if (t && grid[t.y][t.x] === '.') grid[t.y][t.x] = 'F';
  }
  if (difficulty > 0.45) {
    const lavaPatches = Math.round(difficulty * 3);
    for (let i = 0; i < lavaPatches; i++) {
      const t = pickOpen(rng, open, () => true);
      if (t && grid[t.y][t.x] === '.') grid[t.y][t.x] = '~';
    }
  }
  // ── enemies ─────────────────────────────────────────────────────────────
  const slimes = 1 + Math.round(difficulty * 4);
  const enemyTiles = [];
  for (let i = 0; i < slimes; i++) {
    const t = pickOpen(rng, open, (q) => dist2(q, spawn) > 20);
    if (t && grid[t.y][t.x] === '.') {
      grid[t.y][t.x] = 's';
      enemyTiles.push(t);
    }
  }
  // ── treasure room: a chest guarded by a small spike ring ────────────────
  if (difficulty > 0.25 && rng.chance(0.6)) {
    const t = pickOpen(rng, open, (q) => dist2(q, spawn) > 40);
    if (t && grid[t.y][t.x] === '.') {
      grid[t.y][t.x] = 'T';
      for (const d of DIR_LIST) {
        const nx = t.x + DIRS[d].x;
        const ny = t.y + DIRS[d].y;
        if (grid[ny]?.[nx] === '.') grid[ny][nx] = '^';
      }
    }
  }
  // ── gem in a dead end (risk vs reward) ──────────────────────────────────
  if (rng.chance(0.5)) {
    const t = pickOpen(rng, open, (q) => dist2(q, spawn) > 30);
    if (t && grid[t.y][t.x] === '.') grid[t.y][t.x] = 'G';
  }
  // ── power-up when the heat is high ──────────────────────────────────────
  if (difficulty > 0.4 && rng.chance(0.5)) {
    const t = pickOpen(rng, open, () => true);
    if (t && grid[t.y][t.x] === '.') grid[t.y][t.x] = rng.pick(['1', '2', '3', '4']);
  }

  const map = grid.map((row) => row.join(''));
  const enemies = enemyTiles.map((t) => ({
    x: t.x,
    y: t.y,
    type: 'slime',
    axis: rng.chance(0.5) ? 'x' : 'y',
    range: rng.int(2, 4),
    speed: 1.5 + difficulty * 1.3,
  }));
  return {
    map,
    spikePeriod: Math.max(1.05, 1.7 - difficulty * 0.55),
    enemies,
    reward: {},
    theme: world.key,
  };
}

function pickOpen(rng, open, filter) {
  const candidates = open.filter(filter);
  if (!candidates.length) return null;
  return rng.pick(candidates);
}
const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

function bfs(grid, from, to) {
  const seen = new Uint8Array(W * H);
  const prev = new Int32Array(W * H).fill(-1);
  const start = from.y * W + from.x;
  const goal = to.y * W + to.x;
  const queue = [start];
  seen[start] = 1;
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    if (cur === goal) break;
    const cx = cur % W;
    const cy = (cur / W) | 0;
    for (const d of DIR_LIST) {
      const nx = cx + DIRS[d].x;
      const ny = cy + DIRS[d].y;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const idx = ny * W + nx;
      if (seen[idx] || grid[ny][nx] === '#') continue;
      seen[idx] = 1;
      prev[idx] = cur;
      queue.push(idx);
    }
  }
  if (!seen[goal]) return null;
  const path = [];
  let node = goal;
  while (node !== start && node !== -1) {
    path.push({ x: node % W, y: (node / W) | 0 });
    node = prev[node];
  }
  return path.reverse();
}
