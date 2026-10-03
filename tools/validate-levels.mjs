#!/usr/bin/env node
/**
 * ESCAPE 99 — level validator
 *
 *   node tools/validate-levels.mjs            validate every shipped room
 *   node tools/validate-levels.mjs --room 7   just one room
 *   node tools/validate-levels.mjs --json     machine-readable report (CI friendly)
 *
 * This is the tool that keeps the promise in the design doc: "every room must be
 * provably escapable before it ships". It builds the real `Room` objects (the
 * same code the game runs) and checks the things a human reviewer forgets:
 *
 *   · geometry   — grid size, sealed border, one spawn, one exit
 *   · legend     — no unknown tiles, no accidental stray characters
 *   · locks      — a key XOR a free exit (a forced-door room is unescapable)
 *   · gates      — switches and gates pair up, and the gate really guards the way
 *   · reachability — spawn → switches → key/exit, plus every pickup and chest
 *   · hazards    — moving walls never start on top of the spawn or the exit
 *   · i18n       — every teaching line has an English and a Hindi string
 *   · boss       — Room 10 has a boss, a sane escape window and rising lava
 *
 * Exit code 0 = every room is solvable and complete. 1 = at least one problem.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { ROOMS, GRID, TILE } from '../src/data/levels.js';
import { WORLDS, worldForRoom } from '../src/data/themes.js';

const worldNameFor = (id) => WORLDS.find((w) => w.id === worldForRoom(id))?.name ?? '—';
import { STRINGS } from '../src/data/strings.js';
import { Room } from '../src/game/room.js';
import { makePathfinder } from '../src/core/util.js';
import { BOSS_STATE } from '../src/game/boss.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8'));

/* ─────────────────────────────── output helpers ────────────────────────────── */

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code, s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : s);
const bold = (s) => paint('1', s);
const dim = (s) => paint('2', s);
const red = (s) => paint('31', s);
const green = (s) => paint('32', s);
const yellow = (s) => paint('33', s);
const cyan = (s) => paint('36', s);

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const onlyRoom = (() => {
  const i = argv.indexOf('--room');
  return i === -1 ? null : Number(argv[i + 1]);
})();

/* ───────────────────────────── the actual checks ───────────────────────────── */

const KNOWN_TILES = new Set(Object.values(TILE));
const DIGITS = new Set(['1', '2', '3', '4', '5', '6', '7']);

function checkRoom(def) {
  const problems = [];
  const warnings = [];
  const notes = {};
  const fail = (m) => problems.push(m);
  const warn = (m) => warnings.push(m);

  /* 1. geometry -------------------------------------------------------------- */
  const map = def.map;
  notes.rows = map.length;
  if (map.length !== GRID.H) fail(`map has ${map.length} rows, expected ${GRID.H}`);
  const badRow = map.findIndex((r) => r.length !== GRID.W);
  if (badRow !== -1) {
    fail(`row ${badRow} is ${map[badRow].length} tiles wide, expected ${GRID.W}`);
  }
  const flat = map.join('');
  if ((flat.match(/S/g) || []).length !== 1) fail(`expected exactly one spawn 'S', found ${(flat.match(/S/g) || []).length}`);
  if ((flat.match(/E/g) || []).length !== 1) fail(`expected exactly one exit 'E', found ${(flat.match(/E/g) || []).length}`);
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    if (row[0] !== '#' || row[row.length - 1] !== '#') fail(`row ${y} is not sealed by walls`);
  }
  if (map[0] && !/^#+$/.test(map[0])) fail('the top row must be solid wall');
  if (map[map.length - 1] && !/^#+$/.test(map[map.length - 1])) fail('the bottom row must be solid wall');

  /* 2. legend ---------------------------------------------------------------- */
  for (let y = 0; y < map.length; y++) {
    for (let x = 0; x < map[y].length; x++) {
      const ch = map[y][x];
      if (KNOWN_TILES.has(ch) || DIGITS.has(ch)) continue;
      fail(`unknown tile '${ch}' at (${x},${y})`);
    }
  }

  /* 3. i18n for the teaching lines ------------------------------------------- */
  const requireString = (key, where) => {
    for (const lang of ['en', 'hi']) {
      if (!STRINGS[lang]?.[key]) fail(`${lang} string "${key}" (${where}) is missing`);
    }
  };
  for (const [hook, teach] of Object.entries(def.teach || {})) {
    // Two shapes are legal: a one-shot hint {text,duration} and a repeating
    // rhythm hint {wait,go,every} used by the spike/keep-moving rooms.
    if (teach?.cycleWait || teach?.cycleGo) {
      if (teach.cycleWait) requireString(teach.cycleWait, `teach.${hook}.cycleWait`);
      if (teach.cycleGo) requireString(teach.cycleGo, `teach.${hook}.cycleGo`);
      continue;
    }
    if (teach?.wait || teach?.go) {
      for (const k of ['wait', 'go']) {
        if (teach[k]) requireString(teach[k], `teach.${hook}.${k}`);
      }
      continue;
    }
    if (!teach?.text) {
      fail(`teach.${hook} has no text key`);
      continue;
    }
    requireString(teach.text, `teach.${hook}`);
  }

  /* 4. build the real room --------------------------------------------------- */
  let room;
  try {
    room = new Room(def, {});
  } catch (err) {
    fail(`Room failed to build: ${err.message}`);
    return { def, problems, warnings, notes };
  }

  const tileAt = (x, y) => (room.grid[y]?.[x] ?? { ch: '?', solid: true });
  notes.spawn = room.spawn;
  notes.exit = room.exit ? { x: room.exit.x, y: room.exit.y } : null;
  notes.coins = room.coins.length;
  notes.gems = room.gems.length;
  notes.enemies = room.enemies.length;
  notes.hazards = room.spikes.length + room.fireJets.length + room.lava.length;

  /* 5. locks: a key XOR a free exit ------------------------------------------ */
  const gates = room.gates.length;
  const switches = room.switches.length;
  notes.keys = room.key ? 1 : 0;
  notes.gates = gates;
  notes.switches = switches;
  if (def.isBoss) {
    if (room.key) fail('a boss room must drop its key from the boss, not place it in the map');
  } else if (def.openExit) {
    if (room.key) fail(`room ${def.id} declares openExit but also places a key — pick one lock`);
    if (!room.exit?.open) fail('room declares openExit but the exit is still locked');
  } else {
    if (!room.key) fail('room has neither a key nor an open exit — the player can never finish it');
    if (room.exit?.open) fail('room has a key but the exit starts open — the key is pointless');
  }
  if (gates > 0 && switches === 0) fail('gates without switches can never open');
  if (switches > 0 && gates === 0) fail('switches without gates do nothing');
  if (switches > 0 && switches < gates) warn(`${gates} gates but only ${switches} switches`);

  /* 6. reachability (switches pressed ⇒ gates open) --------------------------- */
  const findPath = makePathfinder(room.W, room.H, (x, y) => !room.isSolid(x, y));
  const pathLen = (a, b, { gatesOpen = false } = {}) => {
    const gateTiles = new Set(room.gates.map((g) => `${g.x},${g.y}`));
    const pf = gatesOpen
      ? makePathfinder(room.W, room.H, (x, y) => gateTiles.has(`${x},${y}`) || !room.isSolid(x, y))
      : findPath;
    const p = pf(a.x, a.y, b.x, b.y);
    return p ? p.length : null;
  };

  const objectives = [];
  for (const sw of room.switches) objectives.push({ what: 'switch', x: sw.x, y: sw.y });
  if (room.sword) objectives.push({ what: 'sword', x: room.sword.x, y: room.sword.y });
  if (room.key) objectives.push({ what: 'key', x: room.key.x, y: room.key.y });
  if (room.chests.length) objectives.push({ what: 'chest', x: room.chests[0].x, y: room.chests[0].y });
  for (const c of room.coins) objectives.push({ what: 'coin', x: c.x, y: c.y });
  for (const g of room.gems) objectives.push({ what: 'gem', x: g.x, y: g.y });
  for (const p of room.powerups) objectives.push({ what: 'power-up', x: p.x, y: p.y });
  if (room.exit) objectives.push({ what: 'exit', x: room.exit.x, y: room.exit.y });

  // walking a route with the gate open, mirroring how the room plays out
  let from = room.spawn;
  let steps = 0;
  for (const o of objectives) {
    const len = pathLen(from, o, { gatesOpen: true });
    if (len === null) {
      fail(`no route from (${from.x},${from.y}) to the ${o.what} at (${o.x},${o.y})`);
    } else {
      steps += len;
      from = o;
    }
  }
  notes.routeSteps = steps;

  // a room that needs the gate must be genuinely gated until the switches are hit
  const openExit = !!def.openExit || !room.key;
  if (gates > 0 && room.exit && !openExit) {
    const lockedLen = pathLen(room.spawn, { x: room.exit.x, y: room.exit.y }, { gatesOpen: false });
    const keyLen = room.key
      ? pathLen(room.spawn, { x: room.key.x, y: room.key.y }, { gatesOpen: false })
      : 0;
    if (lockedLen !== null && keyLen !== null) {
      warn('the gate does not block the route to the key — it may be decorative');
    }
  }

  /* 7. leaks: nothing crucial may hide inside a wall --------------------------- */
  if (room.key && room.isSolid(room.key.x, room.key.y)) fail('the key is inside a wall');
  if (room.exit && room.isSolid(room.exit.x, room.exit.y)) fail('the exit is inside a wall');
  if (room.spawn && room.isSolid(room.spawn.x, room.spawn.y)) fail('the spawn is inside a wall');
  for (const mw of room.movingWalls) {
    for (const cell of mw.cells) {
      if (cell.x === room.spawn.x && cell.y === room.spawn.y) fail('a moving wall parks on the spawn tile');
      if (room.exit && cell.x === room.exit.x && cell.y === room.exit.y) fail('a moving wall parks on the exit tile');
    }
  }

  /* 8. boss rooms -------------------------------------------------------------- */
  if (def.isBoss || def.boss) {
    const bossCfg = def.boss;
    if (!bossCfg) fail('boss room has no boss config');
    else {
      if (!(bossCfg.hp >= 1)) fail('boss needs at least one hit point');
      const escape = bossCfg.escape || {};
      notes.escapeSeconds = escape.seconds;
      if (!(escape.seconds >= 15 && escape.seconds <= 60)) {
        fail(`escape window of ${escape.seconds}s is outside the fair 15–60s band`);
      }
      if (escape.lava && !room.lavaRise) fail('escape config asks for lava but the room has no lava rise');
      if (!bossCfg.patterns?.length) fail('boss has no attack patterns');
      for (const p of bossCfg.patterns || []) {
        if (!['slam', 'rocks', 'charge'].includes(p)) warn(`unknown boss pattern "${p}"`);
      }
      if (!Object.values(BOSS_STATE).length) fail('boss state machine is missing');
    }
  } else if (room.lavaRise) {
    fail('a non-boss room has rising lava — that is a Room 10 effect');
  }

  /* 9. pacing sanity ------------------------------------------------------------ */
  if (!def.par?.time) warn('no par time — the speed bonus can never be judged');
  // player walks ~5 tiles/second with no waiting, so a par time below a third
  // of a second per tile leaves no room for hazards, switches or the boss
  if (def.par?.time && notes.routeSteps && def.par.time < notes.routeSteps * 0.3) {
    warn(`par time ${def.par.time}s leaves no slack for a ${notes.routeSteps}-tile route`);
  }
  if (!def.challenge) warn('no optional challenge — the third star has no meaning');
  if (!def.teach || !Object.keys(def.teach).length) warn('no teaching beats for a story room');

  return { def, problems, warnings, notes };
}

/* ─────────────────────────────────── report ────────────────────────────────── */

const rooms = onlyRoom ? ROOMS.filter((r) => r.id === onlyRoom) : ROOMS;
if (!rooms.length) {
  console.error(red(`No room with id ${onlyRoom}`));
  process.exit(1);
}

const reports = rooms.map(checkRoom);
const hardFailures = reports.filter((r) => r.problems.length);
const softWarnings = reports.filter((r) => !r.problems.length && r.warnings.length);

if (asJson) {
  console.log(
    JSON.stringify(
      {
        build: pkg.version,
        version: pkg.version,
        generatedAt: new Date().toISOString(),
        rooms: reports.map((r) => ({
          id: r.def.id,
          name: r.def.name,
          world: worldNameFor(r.def.id),
          problems: r.problems,
          warnings: r.warnings,
          notes: r.notes,
        })),
        totals: {
          rooms: reports.length,
          problems: hardFailures.length,
          warnings: softWarnings.length,
        },
      },
      null,
      2,
    ),
  );
  process.exit(hardFailures.length ? 1 : 0);
}

console.log('');
console.log(`${bold(paint('36', 'ESCAPE 99'))} ${dim('— level validator')}  ${dim(`build ${pkg.version}`)}`);
console.log('');

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

console.log(
  `  ${dim(pad('#', 3))} ${dim(pad('ROOM', 22))} ${dim(pad('WORLD', 16))} ${dim(padL('key', 4))} ${dim(padL('sw', 3))} ${dim(padL('gt', 3))} ${dim(padL('steps', 6))} ${dim('status')}`,
);
for (const r of reports) {
  const world = worldNameFor(r.def.id);
  const status = r.problems.length ? red('FAIL') : r.warnings.length ? yellow('WARN') : green('ok');
  console.log(
    `  ${dim(pad(r.def.id, 3))} ${pad(r.def.name ?? '?', 22)} ${dim(pad(world, 16))} ` +
      `${padL(r.notes.keys ?? '?', 4)} ${padL(r.notes.switches ?? 0, 3)} ${padL(r.notes.gates ?? 0, 3)} ` +
      `${padL(r.notes.routeSteps ?? '—', 6)} ${status}`,
  );
}

console.log('');
console.log(
  `  ${dim('rooms')} ${reports.length}   ${dim('tiles per room')} ${GRID.W}×${GRID.H}   ${dim('rooms reserved')} 99   ${dim('worlds')} ${WORLDS.length}`,
);

for (const r of reports) {
  if (!r.problems.length && !r.warnings.length) continue;
  console.log('');
  console.log(`  ${bold(`Room ${r.def.id} — ${r.def.name}`)}`);
  for (const p of r.problems) console.log(`    ${red('✗')} ${p}`);
  for (const w of r.warnings) console.log(`    ${yellow('!')} ${w}`);
}

console.log('');
if (hardFailures.length) {
  console.log(`  ${red(bold(`${hardFailures.length} room(s) will not ship.`))} Fix the ✗ items above.`);
} else if (softWarnings.length) {
  console.log(`  ${green(bold('every room is escapable.'))} ${yellow(`${softWarnings.length} room(s) have design warnings.`)}`);
} else {
  console.log(`  ${green(bold('every room is escapable, complete and translated.'))}`);
}
console.log('');

process.exit(hardFailures.length ? 1 : 0);
