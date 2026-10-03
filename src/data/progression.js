/**
 * ESCAPE 99 — progression data: upgrades, achievements, daily rewards, challenges.
 * All numbers live here so balance can be tuned without touching game code.
 */

export const UPGRADES = [
  {
    id: 'health',
    icon: '❤️',
    name: 'Heart Vessel',
    desc: 'Start each room with one more heart.',
    max: 2,
    costs: [600, 1800],
    effect: (lv) => 3 + lv, // hearts
  },
  {
    id: 'sword',
    icon: '⚔️',
    name: 'Blade Training',
    desc: 'Stronger slashes. Slimes drop more coins.',
    max: 3,
    costs: [250, 700, 1600],
    effect: (lv) => 1 + lv, // damage per hit
  },
  {
    id: 'dash',
    icon: '💨',
    name: 'Dash',
    desc: 'Unlock a two-tile dash. Great for dodging.',
    max: 1,
    costs: [400],
    effect: (lv) => lv > 0, // dash unlocked
  },
  {
    id: 'magnet',
    icon: '🧲',
    name: 'Treasure Magnet',
    desc: 'Coins float to you from further away.',
    max: 3,
    costs: [200, 450, 900],
    effect: (lv) => 0.15 + lv * 0.55, // pickup radius in tiles
  },
  {
    id: 'luck',
    icon: '🍀',
    name: 'Treasure Luck',
    desc: 'Better bonus rewards from chests and challenges.',
    max: 3,
    costs: [300, 800, 1500],
    effect: (lv) => lv * 0.1, // +10% bonus per level
  },
];

export const upgradeById = (id) => UPGRADES.find((u) => u.id === id);
export function upgradeCost(id, currentLevel) {
  const u = upgradeById(id);
  if (!u || currentLevel >= u.max) return null;
  return u.costs[currentLevel];
}
export function upgradeValue(id, level) {
  const u = upgradeById(id);
  return u ? u.effect(level) : 0;
}

/* ------------------------------- achievements ------------------------------ */
export const ACHIEVEMENTS = [
  { id: 'first_escape', icon: '🚪', title: 'FIRST ESCAPE', desc: 'Complete Room 1.', goal: 1, track: 'escapes' },
  { id: 'treasure_hunter', icon: '🪙', title: 'TREASURE HUNTER', desc: 'Collect 1,000 coins.', goal: 1000, track: 'coinsEarned' },
  { id: 'untouchable', icon: '🛡️', title: 'UNTOUCHABLE', desc: 'Finish a room with no damage.', goal: 1, track: 'noDamageEscapes' },
  { id: 'untouchable_10', icon: '🧿', title: 'IRON NERVES', desc: 'Finish 10 rooms without damage.', goal: 10, track: 'noDamageEscapes' },
  { id: 'slime_slayer', icon: '🟢', title: 'SLIME SLAYER', desc: 'Defeat 100 slimes.', goal: 100, track: 'slimesDefeated' },
  { id: 'speed_runner', icon: '⚡', title: 'SPEED RUNNER', desc: 'Escape a room under 15 seconds.', goal: 1, track: 'fastEscapes' },
  { id: 'master_escapist', icon: '👑', title: 'MASTER ESCAPIST', desc: 'Complete Room 99.', goal: 99, track: 'roomsCleared' },
  { id: 'boss_slayer', icon: '🗿', title: 'GUARDIAN DOWN', desc: 'Defeat the Stone Guardian.', goal: 1, track: 'bossesDefeated' },
  { id: 'stargazer', icon: '⭐', title: 'STARGAZER', desc: 'Earn 20 stars.', goal: 20, track: 'stars' },
  { id: 'endless_10', icon: '♾️', title: 'ENDLESS TEN', desc: 'Escape 10 rooms in one Endless run.', goal: 10, track: 'endlessRooms' },
  { id: 'gem_collector', icon: '💎', title: 'GEM COLLECTOR', desc: 'Collect 25 gems.', goal: 25, track: 'gemsEarned' },
];

export const achievementById = (id) => ACHIEVEMENTS.find((a) => a.id === id);

/* -------------------------------- daily gifts ------------------------------ */
export const DAILY_REWARDS = [
  { day: 1, type: 'coins', amount: 100, icon: '🪙', label: '100 COINS' },
  { day: 2, type: 'coins', amount: 150, icon: '🪙', label: '150 COINS' },
  { day: 3, type: 'gems', amount: 1, icon: '💎', label: '1 GEM' },
  { day: 4, type: 'coins', amount: 250, icon: '🪙', label: '250 COINS' },
  { day: 5, type: 'powerups', amount: 1, icon: '🎁', label: 'POWER-UP BUNDLE', bundle: ['shield', 'speed'] },
  { day: 6, type: 'gems', amount: 5, icon: '💎', label: '5 GEMS' },
  { day: 7, type: 'cosmetic', amount: 1, icon: '👑', label: 'SPECIAL COSMETIC', skin: 'royal' },
];

/* ------------------------------ daily challenges ---------------------------- */
/**
 * Definitions are templates; three are drawn deterministically per day,
 * seeded by the date so every device gets the same rotation.
 * Reward types: coins | gems | chest (chest = coins + chance of a gem)
 */
export const CHALLENGE_TEMPLATES = [
  { id: 'no_damage_3', icon: '🛡️', text: 'Escape 3 rooms without taking damage', type: 'noDamageEscapes', target: 3, reward: { type: 'coins', amount: 100 } },
  { id: 'coins_100', icon: '🪙', text: 'Collect 100 coins', type: 'coinsCollected', target: 100, reward: { type: 'gems', amount: 1 } },
  { id: 'defeat_15', icon: '⚔️', text: 'Defeat 15 enemies', type: 'enemiesDefeated', target: 15, reward: { type: 'coins', amount: 150 } },
  { id: 'speed_25', icon: '⚡', text: 'Complete a room under 25 seconds', type: 'fastEscape25', target: 1, reward: { type: 'chest', amount: 1 } },
  { id: 'stars_5', icon: '⭐', text: 'Earn 5 stars', type: 'starsEarned', target: 5, reward: { type: 'coins', amount: 120 } },
  { id: 'keys_4', icon: '🔑', text: 'Find 4 keys', type: 'keysFound', target: 4, reward: { type: 'coins', amount: 90 } },
  { id: 'gems_2', icon: '💎', text: 'Find 2 hidden gems', type: 'gemsFound', target: 2, reward: { type: 'coins', amount: 130 } },
  { id: 'escape_4', icon: '🚪', text: 'Escape 4 rooms', type: 'roomsEscaped', target: 4, reward: { type: 'coins', amount: 110 } },
  { id: 'perfect_1', icon: '🌟', text: 'Earn a 3-star escape', type: 'perfectEscapes', target: 1, reward: { type: 'chest', amount: 1 } },
  { id: 'traps_5', icon: '☠️', text: 'Survive 5 rooms with traps', type: 'trapRooms', target: 5, reward: { type: 'coins', amount: 100 } },
];

/* --------------------------- rewarded ad placements ------------------------- */
export const AD_REWARDS = {
  bonusCoins: 50, // "Watch → +50 bonus coins" on results
  reviveSecondChance: true, // "Watch → optional second chance"
  doubleCoins: true,
};
