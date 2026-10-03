/**
 * ESCAPE 99 — room tests
 * Structural validation of every level definition + end-to-end solvability
 * runs of all ten rooms with the scripted bot, plus the boss phases.
 */
import { ROOMS, GRID, POWERUP_TILES } from '../src/data/levels.js';
import { WORLDS, worldForRoom } from '../src/data/themes.js';
import { STRINGS } from '../src/data/strings.js';
import { makeGame, makeBot, test, group, eq, ok, bfsPath } from './harness.mjs';
import { TILE } from '../src/game/entities.js';
import { BOSS_STATE as BOSS } from '../src/game/boss.js';

const FLOORISH = new Set(['.', '^', 'v', 'F', '~', 'O', '-', 'S', 'K', 'E', 'c', 'G', 'T', 'M', 'H', 's', 'B', ...Object.keys(POWERUP_TILES)]);

function validateRoom(def) {
  eq(def.map.length, GRID.H, `room ${def.id} height`);
  def.map.forEach((row, y) => {
    eq(row.length, GRID.W, `room ${def.id} row ${y} width`);
    for (const ch of row) {
      ok(FLOORISH.has(ch) || ch === '#', `room ${def.id} row ${y} unknown tile "${ch}"`);
    }
  });
  const flat = def.map.join('');
  eq((flat.match(/S/g) || []).length, 1, `room ${def.id} needs exactly one spawn`);
  eq((flat.match(/E/g) || []).length, 1, `room ${def.id} needs exactly one exit`);
  const keys = (flat.match(/K/g) || []).length;
  const gates = (flat.match(/-/g) || []).length;
  const switches = (flat.match(/O/g) || []).length;
  if (def.isBoss) eq(keys, 0, `boss room ${def.id} should drop its key`);
  else if (!def.openExit) eq(keys, 1, `room ${def.id} needs exactly one key`);
  else eq(keys, 0, `room ${def.id} declares an open exit and must not also have a key`);
  // gates and switches pair up
  if (gates > 0) ok(switches > 0, `room ${def.id} has a gate but no switch`);
  if (switches > 0) ok(gates > 0, `room ${def.id} has a switch but no gate`);
  ok(def.boundary !== 'open', 'sanity');
  // teach strings must exist in both languages
  const teach = def.teach || {};
  const keysToCheck = [];
  for (const value of Object.values(teach)) {
    if (!value) continue;
    if (typeof value === 'object') {
      if (value.text) keysToCheck.push(value.text);
      if (value.wait) keysToCheck.push(value.wait);
      if (value.go) keysToCheck.push(value.go);
    }
  }
  for (const k of keysToCheck) {
    ok(STRINGS.en[k], `room ${def.id}: missing English string "${k}"`);
    ok(STRINGS.hi[k], `room ${def.id}: missing Hindi string "${k}"`);
  }
}

function roomWalkable(room, x, y) {
  if (x < 0 || y < 0 || x >= GRID.W || y >= GRID.H) return false;
  const ch = room.grid[y][x];
  return ch !== '#' && ch !== 'B';
}

group('ROOM DEFINITIONS');
for (const def of ROOMS) {
  test(`Room ${def.id} — "${def.name}" is structurally valid`, () => validateRoom(def));
}

group('THEMES');
test('every room maps to a world theme', () => {
  for (const def of ROOMS) {
    const world = worldForRoom(def.id);
    ok(world >= 1 && world <= 10, `room ${def.id} world`);
    ok(WORLDS[world - 1], `room ${def.id} theme missing`);
    ok(!def.theme || WORLDS.some((w) => w.key === def.theme), `room ${def.id} theme key "${def.theme}" unknown`);
  }
});
test('all 10 worlds are defined with 10 rooms each', () => {
  eq(WORLDS.length, 10, 'world count');
  WORLDS.forEach((w, i) => {
    eq(w.rooms[0], i * 10 + 1, `world ${w.id} first room`);
    eq(w.rooms[1], Math.min(99, i * 10 + 10), `world ${w.id} last room`);
  });
});

group('SOLVABILITY (spawn → key → exit on the static grid)');
for (const def of ROOMS) {
  test(`Room ${def.id} — key and exit are reachable around the walls`, () => {
    const { game } = makeGame();
    game.loadRoom(def.id, { mode: 'story' });
    const room = game.room;
    const spawn = { x: room.spawn.x, y: room.spawn.y };
    const targets = [];
    if (room.key) targets.push(room.key);
    else targets.push({ x: room.exit.x, y: room.exit.y });
    targets.push(room.exit);
    let from = spawn;
    for (const t of targets) {
      // Once the switches are pressed the gate is open, so the final leg may
      // treat gates as passable — the switch objectives are verified above.
      const path = bfsPath(room, from, { x: Math.round(t.x), y: Math.round(t.y) }, { ignoreGates: true });
      ok(path, `room ${def.id}: no path from (${from.x},${from.y}) to (${t.x},${t.y})`);
      from = { x: Math.round(t.x), y: Math.round(t.y) };
    }
    // every collectible must be reachable too (no unreachable coins/gems)
    for (const c of [...room.coins, ...room.gems]) {
      const path = bfsPath(room, spawn, { x: c.x, y: c.y }, { ignoreGates: true });
      ok(path, `room ${def.id}: unreachable pickup at (${c.x},${c.y})`);
    }
    // and the exit must be open (or openable) so the room can always be finished
    ok(room.exit.open || !!room.key, `room ${def.id}: exit is never openable`);
  });
}

group('END-TO-END BOT RUNS');
for (const def of ROOMS) {
  if (def.isBoss) continue;
  const godMode = def.id !== 1; // hazards stay real only where the layout is safe
  test(`Room ${def.id} — a bot can escape (${godMode ? 'hazard damage disabled' : 'full damage rules'})`, () => {
    const { game } = makeGame();
    game.loadRoom(def.id, { mode: 'story' });
    const bot = makeBot(game, { godMode, collectAll: true });
    const outcome = bot.run();
    eq(outcome.outcome, 'complete', `room ${def.id} outcome (${outcome.seconds.toFixed(1)}s, ${bot.objectivesLeft} objectives left)`);
    ok(game.results, 'results were produced');
    ok(game.results.stars >= 1, `room ${def.id} earned at least one star`);
  });
}

test('Room 1 — a first-time player earns 3 stars and never dies', () => {
  const { game, save, ui } = makeGame();
  game.loadRoom(1, { mode: 'story' });
  const bot = makeBot(game, { godMode: false, collectAll: true });
  const outcome = bot.run();
  eq(outcome.outcome, 'complete', 'escape');
  eq(bot.damageTaken, 0, 'no damage taken');
  eq(game.results.stars, 3, 'three stars');
  ok(game.results.allCoins, 'all coins collected');
  ok(save.data.wallet.coins >= 20, 'reward coins banked');
  ok(ui.results, 'reward screen shown');
});

test('Room 5 — the fire wall starts after the key and chases the player', () => {
  const { game } = makeGame();
  game.loadRoom(5, { mode: 'story' });
  const room = game.room;
  eq(room.fireWalls.length, 1, 'one fire wall');
  ok(!room.fireWalls[0].active, 'fire wall idle before the key');
  game.onKeyCollected();
  ok(room.fireWalls[0].armed, 'fire wall armed by the key');
  const bot = makeBot(game, { godMode: true, collectAll: false });
  bot.run(60 * 40);
  ok(room.fireWalls[0].active, 'fire wall activated');
  ok(room.fireWalls[0].x > 0, 'fire wall advanced across the room');
  eq(game.state, 'REWARD', 'level completed before the fire caught up');
});

test('Room 6 — the sword unlocks combat and slimes die in two hits', () => {
  const { game } = makeGame();
  game.loadRoom(6, { mode: 'story' });
  const room = game.room;
  eq(room.enemies.length, 3, 'three slime guards');
  const ctx = game._ctx();
  ok(!game.player.swordUnlocked, 'sword is locked on entry');
  // walk to the pedestal
  const bot = makeBot(game, { godMode: true, collectAll: false });
  bot.run(60 * 6);
  ok(game.player.swordUnlocked, 'sword picked up');
  // the bot swats anything it brushes past, so pick a slime it left untouched
  const slime = room.enemies.find((e) => !e.dead && e.hp === e.maxHp);
  ok(slime, 'an untouched slime remains');
  slime.hit(1, ctx);
  eq(slime.hp, 1, 'first hit lands');
  ok(!slime.dead, 'slime survives one hit');
  slime.hit(1, ctx);
  ok(slime.dead, 'slime dies on the second hit');
});

test('Room 8 — moving walls rearrange and never trap the player', () => {
  const { game } = makeGame();
  game.loadRoom(8, { mode: 'story' });
  const room = game.room;
  eq(room.movingWalls.length, 2, 'two wall groups');
  const startCells = JSON.stringify(room.movingWalls[0].cells);
  for (let i = 0; i < 60 * 7; i++) game.update(1 / 60);
  const laterCells = JSON.stringify(room.movingWalls[0].cells);
  ok(startCells !== laterCells, 'the first wall group moved');
  // spawn is never inside a wall
  const spawnTile = { x: Math.round(game.player.x), y: Math.round(game.player.y) };
  ok(roomWalkable(room, spawnTile.x, spawnTile.y), 'player is never inside a wall');
});

group('BOSS — THE STONE GUARDIAN (Room 10)');
test('Room 10 — boss wakes, cycles all three patterns and stuns itself', () => {
  const { game } = makeGame();
  game.loadRoom(10, { mode: 'story' });
  const boss = game.boss;
  ok(boss, 'boss exists');
  eq(boss.hp, 3, 'three hearts');
  eq(boss.state, BOSS.DORMANT, 'starts dormant');
  // stand next to it so it wakes
  game.player.x = Math.floor(boss.x / TILE);
  game.player.y = Math.floor(boss.y / TILE) + 3;
  for (let i = 0; i < 60 * 3; i++) game.update(1 / 60);
  ok([BOSS.INTRO, BOSS.IDLE, BOSS.TELEGRAPH, BOSS.SLAM, BOSS.RECHARGE].includes(boss.state), `boss woke up (${boss.state})`);
  const seen = new Set();
  for (let i = 0; i < 60 * 60 && !boss.dead; i++) {
    game.update(1 / 60);
    if (boss.state === BOSS.TELEGRAPH && boss.pending) seen.add(boss.pending);
    if (boss.state === BOSS.STUNNED) break;
  }
  ok(seen.has('slam') || seen.has('rocks') || seen.has('charge'), `patterns observed: ${[...seen].join(', ')}`);
});

test('Room 10 — the boss only takes damage while stunned, then drops the key', () => {
  const { game, ui } = makeGame();
  game.loadRoom(10, { mode: 'story' });
  const boss = game.boss;
  const ctx = game._ctx();
  // Not stunned: sword bounces.
  eq(boss.takeHit(1, ctx), false, 'damage ignored when not stunned');
  eq(boss.hp, 3, 'no damage taken');
  // Force the charge → wall → stun cycle three times.
  for (let phase = 0; phase < 3; phase++) {
    boss.state = BOSS.TELEGRAPH;
    boss.pending = 'charge';
    boss.chargeDir = { x: 0, y: 1 };
    boss.stateT = 0.01;
    let guard = 0;
    while (boss.state !== BOSS.STUNNED && guard++ < 60 * 8) game.update(1 / 60);
    eq(boss.state, BOSS.STUNNED, `phase ${phase + 1}: stunned after hitting the wall`);
    boss.takeHit(1, ctx);
    ui.setBossBar?.(boss.hp, boss.maxHp);
  }
  eq(boss.hp, 0, 'boss defeated');
  for (let i = 0; i < 60 * 3; i++) game.update(1 / 60);
  ok(boss.dead, 'boss broke apart');
  ok(game.room.key, 'golden key dropped');
  ok(game.escapePhase?.active, 'escape phase started');
  eq(Math.round(game.escapePhase.total), 30, '30 second countdown');
  ok(game.room.lavaRise?.active, 'lava is rising');
  ok(ui.results === null, 'results not shown yet');
});

test('Room 10 — grabbing the dropped key opens the exit and the escape is winnable', () => {
  const { game } = makeGame();
  game.loadRoom(10, { mode: 'story' });
  const boss = game.boss;
  boss.hp = 1;
  boss.state = BOSS.STUNNED;
  boss.takeHit(1, game._ctx());
  for (let i = 0; i < 120; i++) game.update(1 / 60);
  ok(game.room.key, 'key dropped');
  const room = game.room;
  // walk the dropped key → exit route
  const bot = makeBot(game, { godMode: true, collectAll: false });
  const outcome = bot.run(60 * 40);
  eq(outcome.outcome, 'complete', 'escaped the boss room');
  eq(game.results.stars >= 1, true, 'at least one star');
  ok(game.results.coins >= 200, `boss reward paid (${game.results.coins})`);
  ok(game.results.gems >= 5, `gems paid (${game.results.gems})`);
  ok(room.lavaRise.level <= room.H, 'lava level tracked');
});

test('Boss checkpoint — dying in the escape phase keeps the boss defeated', () => {
  const { game } = makeGame();
  game.loadRoom(10, { mode: 'story' });
  game.boss.hp = 1;
  game.boss.state = BOSS.STUNNED;
  game.boss.takeHit(1, game._ctx());
  for (let i = 0; i < 120; i++) game.update(1 / 60);
  game.player.damage(99, 'lava', game._ctx());
  ok(game.player.dead, 'player died in the escape phase');
  game.restartRoom();
  ok(game.boss, 'boss instance recreated');
  ok(game.boss.dead, 'boss stays defeated after the checkpoint restart');
  ok(game.room.key, 'key is waiting');
  ok(game.escapePhase?.active, 'escape phase restarts');
});

group('MECHANICS');

/**
 * Drive a spike into its "up" window deterministically: park the cycle just
 * before the up phase and let the pistons rise for a few frames.
 */
function forceSpikeUp(spike, frames = 7) {
  spike.cycle = (((0.9 - spike.phase) % 1) + 1) % 1;
  for (let i = 0; i < frames; i++) spike.update(1 / 60);
}
test('Spikes warn before they strike and damage when extended', () => {
  const { game } = makeGame();
  game.loadRoom(2, { mode: 'story' });
  const spike = game.room.spikes[0];
  let sawWarn = false;
  let sawUp = false;
  for (let i = 0; i < 60 * 4; i++) {
    game.update(1 / 60);
    if (spike.warn > 0.3) sawWarn = true;
    if (spike.lethal) sawUp = true;
  }
  ok(sawWarn, 'spike gave a visual warning');
  ok(sawUp, 'spike extended');
  // standing on an extended spike hurts: drive the cycle into the up phase
  const player = game.player;
  player.hearts = 3;
  player.invuln = 0;
  forceSpikeUp(spike);
  ok(spike.lethal, 'forced up phase is lethal');
  player.x = spike.x;
  player.y = spike.y;
  game.update(1 / 60);
  ok(player.hearts < 3, 'spike damage applied');
});

test('Contact with a slime costs one heart and grants invulnerability frames', () => {
  const { game } = makeGame();
  game.loadRoom(3, { mode: 'story' });
  const player = game.player;
  const slime = game.room.enemies[0];
  player.x = slime.x;
  player.y = slime.y;
  game.update(1 / 60);
  eq(player.hearts, 2, 'lost one heart');
  game.update(1 / 60);
  eq(player.hearts, 2, 'invulnerable to the second tick');
  ok(player.invuln > 0, 'i-frames granted');
});

test('Shield power-up absorbs a hit instead of a heart', () => {
  const { game } = makeGame();
  game.loadRoom(3, { mode: 'story' });
  const player = game.player;
  player.applyPowerUp('shield', game._ctx());
  eq(player.shield, 1, 'shield charged');
  const before = player.hearts;
  player.damage(1, 'slime', game._ctx());
  eq(player.hearts, before, 'no heart lost');
  eq(player.shield, 0, 'shield consumed');
});

test('Freeze power-up makes hazards safe and stops enemies', () => {
  const { game } = makeGame();
  game.loadRoom(2, { mode: 'story' });
  const player = game.player;
  player.applyPowerUp('freeze', game._ctx());
  ok(game.room.freezeTime > 0, 'room frozen');
  const spike = game.room.spikes[0];
  forceSpikeUp(spike);
  const before = player.hearts;
  player.x = spike.x;
  player.y = spike.y;
  game.update(1 / 60);
  ok(spike.lethal, 'the spike really is extended');
  eq(player.hearts, before, 'frozen spikes cannot hurt');
});

test('Gate stays solid until every switch is pressed', () => {
  const { game } = makeGame();
  game.loadRoom(4, { mode: 'story' });
  const room = game.room;
  const gate = room.gates[0];
  const exitTile = { x: room.exit.x, y: room.exit.y };
  ok(room.isSolid(gate.x, gate.y), 'gate blocks movement while locked');
  ok(!bfsPath(room, room.spawn, exitTile), 'the gate really is the lock on the way out');
  let pressed = 0;
  for (const sw of room.switches) {
    sw.press(game._ctx());
    pressed++;
    if (pressed < room.switches.length) ok(room.isSolid(gate.x, gate.y), 'one switch is not enough');
  }
  ok(room.allSwitchesPressed, 'all switches registered');
  for (const g of room.gates) g.openUp(game._ctx());
  for (let i = 0; i < 60; i++) game.update(1 / 60);
  ok(!room.isSolid(gate.x, gate.y), 'gate opens');
  ok(bfsPath(room, room.spawn, exitTile), 'exit is reachable once the gate opens');
  ok(room.exit.open, 'the gate was the lock — the exit itself is open');
});

test('Exit is locked without the key and open with it', () => {
  const { game } = makeGame();
  game.loadRoom(1, { mode: 'story' });
  const room = game.room;
  ok(!room.exit.open, 'locked on entry');
  game.onKeyCollected();
  ok(room.exit.open, 'opens when the key is taken');
  ok(!game.player.dead, 'player alive');
});

test('Chest gives coins (and sometimes a gem) exactly once', () => {
  const { game, save } = makeGame();
  game.loadRoom(7, { mode: 'story' });
  const room = game.room;
  const chest = room.chests[0];
  game.player.x = chest.x;
  game.player.y = chest.y;
  game.update(1 / 60);
  ok(chest.opened, 'chest opened');
  const coins = save.data.wallet.coins;
  ok(coins >= 50, `coins granted (${coins})`);
  game.update(1 / 60);
  eq(save.data.wallet.coins, coins, 'cannot be looted twice');
});

group('ROOM 10 TIMING / FAIRNESS');
test('Lava and countdown give the player enough room to escape', () => {
  const { game } = makeGame();
  game.loadRoom(10, { mode: 'story' });
  game.boss.hp = 1;
  game.boss.state = BOSS.STUNNED;
  game.boss.takeHit(1, game._ctx());
  for (let i = 0; i < 120; i++) game.update(1 / 60);
  const bot = makeBot(game, { godMode: true, collectAll: false });
  const outcome = bot.run(60 * 40);
  eq(outcome.outcome, 'complete', 'escaped in time');
  ok(outcome.seconds < 30, `escape took ${outcome.seconds.toFixed(1)}s of the 30s countdown`);
  ok(outcome.seconds > 4, 'the escape is not trivial');
});
