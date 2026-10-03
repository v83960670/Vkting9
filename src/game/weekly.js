/**
 * ESCAPE 99 — WEEKLY CHALLENGE
 * One dungeon per ISO week. The layout is derived from the week number, so
 * every player sees the same rooms — a fair score to compare on leaderboards.
 * (Online leaderboards need a backend; this build keeps a local best + badge.)
 */
import { makeRng, DIR_LIST, DIRS } from '../core/util.js';
import { GRID } from '../data/levels.js';

const { W, H } = GRID;

export function isoWeekNumber(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

export function weeklySeed(week = isoWeekNumber()) {
  return (week * 2654435761) >>> 0;
}

export function weeklyRoomDef(week = isoWeekNumber()) {
  const rng = makeRng(weeklySeed(week));
  const grid = [];
  for (let y = 0; y < H; y++) {
    const row = [];
    for (let x = 0; x < W; x++) row.push(y === 0 || x === 0 || y === H - 1 || x === W - 1 ? '#' : '.');
    grid.push(row);
  }
  // Rooms get carved as a set of themed arenas chained vertically.
  const arenas = 4;
  for (let a = 0; a < arenas; a++) {
    const y0 = 1 + Math.round((a * (H - 2)) / arenas);
    const y1 = Math.min(H - 2, y0 + Math.round((H - 2) / arenas) - 1);
    const style = rng.int(0, 2);
    for (let y = y0; y <= y1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (style === 0 && x % 4 === 0) grid[y][x] = '#';
        else if (style === 1 && y === y0 + 1 && x > 2 && x < W - 3) grid[y][x] = '#';
      }
    }
    // a doorway so arenas always connect
    grid[y1][6] = '.';
  }
  const open = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (grid[y][x] === '.') open.push({ x, y });
  const spawn = { x: 6, y: H - 3 };
  grid[spawn.y][spawn.x] = 'S';
  // key in the top arena, exit in a side alcove
  grid[2][2] = 'K';
  grid[1][W - 2] = 'E';
  // hazards scale with arena index
  for (const tile of open) {
    if (Math.abs(tile.y - spawn.y) + Math.abs(tile.x - spawn.x) < 4) continue;
    if (grid[tile.y][tile.x] !== '.') continue;
    const depth = 1 - tile.y / H;
    const roll = rng();
    if (roll < 0.08 + depth * 0.1) grid[tile.y][tile.x] = rng.chance(0.5) ? '^' : 'v';
    else if (roll < 0.1 + depth * 0.12) grid[tile.y][tile.x] = 'F';
    else if (roll < 0.3) grid[tile.y][tile.x] = 'c';
    else if (roll < 0.34) grid[tile.y][tile.x] = 's';
  }
  grid[H - 2][W - 2] = 'T';
  grid[Math.floor(H / 2)][1] = 'G';
  grid[Math.floor(H / 2) + 1][W - 2] = '1';
  const map = grid.map((row) => row.join(''));
  const enemies = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (map[y][x] === 's') {
        enemies.push({ x, y, type: 'slime', axis: rng.chance(0.5) ? 'x' : 'y', range: rng.int(2, 4), speed: 2 + rng() });
      }
    }
  }
  return {
    id: 2000 + week,
    name: 'WEEKLY DUNGEON',
    theme: ['temple', 'lava', 'fortress', 'jungle', 'frost'][week % 5],
    map,
    enemies,
    spikePeriod: 1.2,
    timer: { type: 'optional', seconds: 90 },
    par: { time: 75, coins: 0 },
    challenge: { id: 'time_w', type: 'time', value: 75, text: 'Clear the weekly under 75s', short: '< 75s' },
    reward: { coins: 150, gems: 1 },
    weekly: true,
    week,
  };
}

export function weeklySummary(week = isoWeekNumber()) {
  return {
    week,
    seed: weeklySeed(week),
    name: `WEEK ${week}`,
    modifiers: [
      { icon: '⚡', label: 'FAST TRAPS' },
      { icon: '💎', label: 'BONUS GEM' },
      { icon: '🏆', label: 'BADGE + COINS' },
    ],
  };
}

void DIR_LIST;
void DIRS;
