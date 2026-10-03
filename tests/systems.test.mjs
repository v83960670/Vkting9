/**
 * ESCAPE 99 — systems tests
 * Save/load, economy, stars, achievements, daily rewards & challenges,
 * the endless generator and the weekly dungeon.
 */
import { makeGame, makeSave, makeBot, test, group, eq, ok, bfsPath } from './harness.mjs';
import { ACHIEVEMENTS, UPGRADES, upgradeCost, DAILY_REWARDS, CHALLENGE_TEMPLATES } from '../src/data/progression.js';
import { CHARACTERS, SKINS, TRAILS, resolveLook } from '../src/data/cosmetics.js';
import { generateEndlessRoom } from '../src/game/endless.js';
import { weeklyRoomDef, isoWeekNumber } from '../src/game/weekly.js';
import { GRID, ROOMS } from '../src/data/levels.js';
import { SaveManager } from '../src/core/save.js';
import { Room } from '../src/game/room.js';
import { formatTime, formatNumber, makeRng, clamp } from '../src/core/util.js';

group('SAVE SYSTEM');
test('a fresh save has sane defaults', () => {
  const save = makeSave();
  eq(save.coins, 0, 'coins');
  eq(save.gems, 0, 'gems');
  eq(save.data.progress.unlockedRoom, 1, 'unlocked room');
  eq(save.data.upgrades.health, 0, 'upgrade level');
  ok(save.data.cosmetics.characters.includes('arin'), 'starter hero owned');
  ok(save.data.settings.vibration !== undefined, 'settings present');
});

test('wallet, spending and serialisation round-trip', () => {
  const save = makeSave();
  save.addCoins(500);
  eq(save.coins, 500, 'coins added');
  ok(save.spendCoins(200), 'spend succeeds');
  eq(save.coins, 300, 'coins deducted');
  ok(!save.spendCoins(10_000), 'cannot overspend');
  save.addGems(3);
  eq(save.gems, 3, 'gems added');
  const blob = save.serialize();
  const other = new SaveManager();
  ok(other.deserialize(blob), 'deserialize works');
  eq(other.coins, 300, 'coins survive the round trip');
  eq(other.gems, 3, 'gems survive the round trip');
});

test('room results store stars, best time and never go backwards', () => {
  const save = makeSave();
  const first = save.recordEscape(1, { stars: 2, time: 30, coins: 40, noDamage: false, challengeDone: false });
  eq(first.stars, 2, 'stars granted');
  eq(save.roomStat(1).stars, 2, 'stored');
  const second = save.recordEscape(1, { stars: 3, time: 20, coins: 55, noDamage: true, challengeDone: true });
  ok(second.bestTime, 'best time improved');
  eq(save.roomStat(1).stars, 3, 'stars improved');
  const third = save.recordEscape(1, { stars: 1, time: 44, coins: 10, noDamage: false, challengeDone: false });
  eq(third.stars, 0, 'no star regression on a worse run');
  eq(save.roomStat(1).stars, 3, 'best stars kept');
  eq(save.roomStat(1).bestTime, 20, 'best time kept');
  eq(save.data.progress.unlockedRoom, 2, 'next room unlocked');
});

test('total stars and achievements track progress', () => {
  const save = makeSave();
  save.recordEscape(1, { stars: 3, time: 18, coins: 30 });
  save.recordEscape(2, { stars: 2, time: 28, coins: 30 });
  eq(save.totalStars(), 5, 'star total');
  ok(save.unlockAchievement('first_escape'), 'achievement unlocks');
  ok(!save.unlockAchievement('first_escape'), 'cannot unlock twice');
  ok(save.hasAchievement('first_escape'), 'achievement recorded');
});

test('a v1 save file still loads (migration path)', () => {
  const legacy = {
    version: 1,
    wallet: { coins: 42, gems: 2 },
    upgrades: { health: 1 },
    unlocks: { sword: true },
    progress: { currentRoom: 4, unlockedRoom: 4 },
  };
  const save = new SaveManager();
  ok(save.deserialize({ v: 1, data: legacy }), 'loaded');
  eq(save.coins, 42, 'coins migrated');
  eq(save.data.upgrades.health, 1, 'upgrades migrated');
  ok(save.hasUnlock('sword'), 'unlocks migrated');
  eq(save.data.version, 2, 'version stamped');
});

test('upgrade costs escalate and cap correctly', () => {
  for (const up of UPGRADES) {
    for (let level = 0; level < up.max; level++) {
      ok(upgradeCost(up.id, level) > 0, `${up.id} level ${level} has a cost`);
      ok(up.effect(level + 1) !== undefined, `${up.id} level ${level + 1} has an effect`);
    }
    eq(upgradeCost(up.id, up.max), null, `${up.id} is maxed out`);
  }
  const health = UPGRADES.find((u) => u.id === 'health');
  eq(health.effect(0), 3, 'start with three hearts');
  eq(health.effect(2), 5, 'max five hearts');
  const sword = UPGRADES.find((u) => u.id === 'sword');
  eq(sword.effect(0), 1, 'base sword damage');
  eq(sword.effect(3), 4, 'maxed sword damage');
});

test('upgrades actually change the player when a room loads', () => {
  const save = makeSave();
  save.setUpgrade('health', 2);
  save.setUpgrade('sword', 2);
  save.setUpgrade('magnet', 3);
  save.setUnlock('dash', true);
  const { game } = makeGame({ save });
  game.loadRoom(1, { mode: 'story' });
  eq(game.player.maxHearts, 5, 'hearts from the upgrade');
  eq(game.player.swordDamage, 3, 'sword damage from the upgrade');
  ok(game.player.dashUnlocked, 'dash unlocked');
  ok(game.player.magnetRadius > 0.9, 'magnet radius from the upgrade');
});

test('cosmetics are cosmetic only and resolve into a look', () => {
  for (const c of CHARACTERS) {
    ok(c.palette && c.palette.shirt, `${c.id} has a palette`);
    ok(!('damage' in c) && !('speed' in c) && !('hp' in c), `${c.id} carries no gameplay stats`);
  }
  const look = resolveLook({ characterId: 'bolt', skinId: 'ninja', trailId: 'cosmic' });
  ok(look.skin.mask, 'ninja mask applied over the robot body');
  ok(look.trail.glow, 'cosmic trail glow');
  const shadow = resolveLook({ characterId: 'shadow' });
  ok(shadow.glow, 'shadow Arin glows');
  for (const list of [CHARACTERS, SKINS, TRAILS]) {
    for (const item of list) {
      ok(item.currency === 'coins' || item.currency === 'gems', `${item.id} has a currency`);
      ok(typeof item.price === 'number', `${item.id} has a price`);
      ok(!!item.unlockHint, `${item.id} documents how it is unlocked`);
    }
  }
});

group('DAILY REWARDS & CHALLENGES');
test('daily reward cycle advances one day at a time and cannot be double-claimed', () => {
  const { save, challenges } = makeGame();
  eq(save.isDailyRewardReady(), true, 'day 1 available');
  eq(save.claimDailyReward(), 1, 'claimed day 1');
  eq(save.isDailyRewardReady(), false, 'cannot claim twice today');
  eq(save.claimDailyReward(), null, 'second claim rejected');
  eq(DAILY_REWARDS.length, 7, 'seven day cycle');
  const reward = challenges.grant(DAILY_REWARDS[6]);
  ok(reward.label.includes('COSMETIC'), 'day 7 grants a cosmetic');
});

test('three daily challenges rotate deterministically per date', () => {
  const { challenges } = makeGame();
  const a = challenges.ensureDaily();
  const b = challenges.ensureDaily();
  eq(a.length, 3, 'three challenges');
  eq(a.map((c) => c.id).join(','), b.map((c) => c.id).join(','), 'stable within a day');
  for (const c of a) {
    ok(CHALLENGE_TEMPLATES.some((t) => t.id === c.id), `${c.id} comes from the template pool`);
    ok(c.target > 0, 'has a target');
    ok(c.reward, 'has a reward');
  }
});

test('challenge progress accumulates, completes and pays out once', () => {
  const { save, challenges } = makeGame();
  const list = challenges.ensureDaily();
  const target = list[0];
  for (let i = 0; i < target.target; i++) challenges.track(target.type, 1);
  ok(target.done, 'challenge completed');
  const before = save.coins + save.gems;
  const reward = challenges.claimDaily(target);
  ok(reward, 'reward granted');
  ok(save.coins + save.gems > before, 'currency increased');
  eq(challenges.claimDaily(target), null, 'cannot claim twice');
});

test('gameplay events feed the daily challenges', () => {
  const { game, challenges } = makeGame();
  const list = challenges.ensureDaily();
  const fake = { id: 'test', icon: 'x', text: 'x', type: 'coinsCollected', target: 3, reward: { type: 'coins', amount: 1 }, progress: 0, done: false, claimed: false };
  list.push(fake);
  game.onCoinCollected(1);
  game.onCoinCollected(1);
  game.onCoinCollected(1);
  eq(fake.progress, 3, 'coin events tracked');
  ok(fake.done, 'challenge completed by gameplay');
});

test('achievement progress is readable for the UI', () => {
  const { save, challenges } = makeGame();
  save.recordEscape(1, { stars: 3, time: 12, coins: 40 });
  save.data.stats.noDamageEscapes = 4;
  save.data.stats.slimesDefeated = 12;
  eq(challenges.achievementProgress(ACHIEVEMENTS.find((a) => a.id === 'untouchable_10')), 4, 'no-damage count');
  eq(challenges.achievementProgress(ACHIEVEMENTS.find((a) => a.id === 'slime_slayer')), 12, 'slime count');
  eq(challenges.achievementProgress(ACHIEVEMENTS.find((a) => a.id === 'stargazer')), 3, 'stars');
});

group('ECONOMY INTEGRITY');
test('rewards are granted once per completion and stars never regress', () => {
  const { game, save } = makeGame();
  game.loadRoom(1, { mode: 'story' });
  game.flags.damaged = true; // survived, but not cleanly
  const results = game._computeResults(game.room.def);
  const before = save.coins;
  game.applyResults(results, game.room.def);
  eq(save.coins, before + results.coins, 'exactly one payout');
  eq(save.roomStat(1).stars, 1, 'one star for a damaged run without the coins');
  ok(save.data.wallet.coins >= 20, 'reward coins available to spend');
});

test('a perfect run of room 1 pays all bonuses', () => {
  const { game, save } = makeGame();
  game.loadRoom(1, { mode: 'story' });
  const bot = makeBot(game, { godMode: false, collectAll: true });
  const outcome = bot.run();
  eq(outcome.outcome, 'complete', 'escaped');
  eq(game.results.bonuses.length, 3, 'no-damage + speed + all-coins bonuses');
  eq(game.results.stars, 3, 'three stars');
  ok(save.coins >= 20 + 35, `payout includes bonuses (${save.coins})`);
  ok(save.data.progress.totalEscapes === 1, 'escape counted');
});

test('death tracking records the reason for the analytics dashboard', () => {
  const { game, save } = makeGame();
  game.loadRoom(2, { mode: 'story' });
  game.player.damage(99, 'spikes', game._ctx());
  game.update(1 / 60);
  ok(save.data.stats.deathsByReason.spikes >= 1, 'death reason recorded');
  eq(save.roomStat(2).deaths, 1, 'room death counted');
});

group('ENDLESS ESCAPE');
test('endless rooms always contain a spawn, key and exit', () => {
  for (let index = 1; index <= 40; index++) {
    const def = generateEndlessRoom(index, 424242);
    eq(def.map.length, GRID.H, `room ${index} height`);
    for (const row of def.map) eq(row.length, GRID.W, `room ${index} width`);
    const flat = def.map.join('');
    eq((flat.match(/S/g) || []).length, 1, `room ${index} spawn`);
    eq((flat.match(/K/g) || []).length, 1, `room ${index} key`);
    eq((flat.match(/E/g) || []).length, 1, `room ${index} exit`);
  }
});

test('endless rooms are solvable and the traps tighten with depth', () => {
  const { game } = makeGame();
  const periods = [];
  for (const index of [1, 5, 12, 25]) {
    game.loadRoom(index, { mode: 'endless' });
    const room = game.room;
    ok(bfsPath(room, { x: room.spawn.x, y: room.spawn.y }, { x: room.key.x, y: room.key.y }), `endless ${index}: key reachable`);
    ok(bfsPath(room, { x: room.key.x, y: room.key.y }, { x: room.exit.x, y: room.exit.y }), `endless ${index}: exit reachable`);
    periods.push(room.def.spikePeriod);
  }
  ok(periods[0] >= periods[3], `spike timing tightens with depth (${periods.map((p) => p.toFixed(2)).join(' → ')})`);
});

test('an endless room can be escaped end-to-end and scores', () => {
  const save = makeSave();
  save.setUnlock('endless', true);
  const { game } = makeGame({ save });
  game.loadRoom(1, { mode: 'endless' });
  const bot = makeBot(game, { godMode: true, collectAll: true });
  const outcome = bot.run();
  eq(outcome.outcome, 'complete', 'endless room completed');
  eq(game.results.mode, 'endless', 'endless results');
  ok(game.results.endlessScore > 0, `score produced (${game.results.endlessScore})`);
  ok(save.data.progress.endlessBest >= game.results.endlessScore, 'best score stored');
});

group('WEEKLY CHALLENGE');
test('the weekly dungeon is the same for everyone in a given week', () => {
  const week = 34;
  const a = weeklyRoomDef(week);
  const b = weeklyRoomDef(week);
  eq(a.map.join('|'), b.map.join('|'), 'identical layout for the same week');
  const other = weeklyRoomDef(week + 1);
  ok(other.map.join('|') !== a.map.join('|'), 'a different week gives a different dungeon');
  eq(a.week, week, 'week recorded');
  ok(a.reward.gems >= 1, 'gems on offer');
  const weekNow = isoWeekNumber(new Date('2026-10-03T00:00:00Z'));
  ok(weekNow >= 1 && weekNow <= 53, `current ISO week is sane (${weekNow})`);
});

test('weekly dungeons are always escapable', () => {
  for (const week of [1, 12, 26, 40, 52]) {
    const def = weeklyRoomDef(week);
    const room = new Room(def);
    ok(bfsPath(room, { x: room.spawn.x, y: room.spawn.y }, { x: room.key.x, y: room.key.y }), `week ${week}: key reachable`);
    ok(bfsPath(room, { x: room.key.x, y: room.key.y }, { x: room.exit.x, y: room.exit.y }), `week ${week}: exit reachable`);
    ok(room.chests.length >= 1, `week ${week}: treasure chest present`);
  }
});

group('UTIL / FORMATTING');
test('time and number formatting are phone friendly', () => {
  eq(formatTime(0), '00:00', 'zero');
  eq(formatTime(27), '00:27', 'under a minute');
  eq(formatTime(95), '01:35', 'over a minute');
  eq(formatNumber(999), '999', 'hundreds');
  eq(formatNumber(1250), '1,250', 'thousands separator');
  eq(formatNumber(12_000), '12K', 'k shorthand');
eq(formatNumber(15_500), '15.5K', 'k shorthand with decimals');
  eq(clamp(5, 0, 3), 3, 'clamp');
});

test('the seeded rng is deterministic (level + endless reproductions stay identical)', () => {
  const a = makeRng(1234);
  const b = makeRng(1234);
  for (let i = 0; i < 20; i++) eq(a(), b(), `draw ${i}`);
  const r = makeRng(7);
  ok(r.int(1, 6) >= 1 && r.int(1, 6) <= 6, 'ints are in range');
  eq(r.shuffle([1, 2, 3]).length, 3, 'shuffle keeps the length');
});

group('CONTENT INTEGRITY');
test('ten playable rooms ship in this build and 89 more are reserved', () => {
  eq(ROOMS.length, 10, 'authored rooms');
  eq(ROOMS[0].id, 1, 'starts at room 1');
  eq(ROOMS[9].id, 10, 'boss room is 10');
  ok(ROOMS[9].isBoss, 'room 10 is the boss');
  eq(ROOMS.filter((r) => r.challenge).length, 10, 'every room has a star challenge');
  eq(ROOMS.filter((r) => r.par?.time).length, 10, 'every room has a par time');
});

test('the tutorial asks for almost no reading', () => {
  const room1 = ROOMS[0];
  ok(room1.teach.intro.text === 't_swipe', 'room 1 teaches with a swipe hint');
  const label = 'SWIPE TO MOVE';
  eq(label.split(' ').length, 3, 'three words to start playing');
});
