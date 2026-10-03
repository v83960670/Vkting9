/**
 * ESCAPE 99 — save system + player profile
 *
 * Single JSON document in localStorage, versioned and migration-ready.
 * Auto-saves (debounced) after any change. `serialize()`/`deserialize()` are
 * shaped for an eventual cloud save (upload the JSON blob, nothing else).
 */
import { Emitter, storage, clamp } from './util.js';

export const SAVE_KEY = 'escape99.save.v2';
export const SAVE_VERSION = 2;

export const DEFAULT_SETTINGS = {
  music: 0.55,
  sfx: 0.8,
  vibration: true,
  control: 'swipe', // 'swipe' | 'joystick'
  leftHanded: false,
  reducedShake: false,
  highContrast: false,
  perfMode: false, // false = 60fps target, true = 30fps battery saver
  analytics: true,
};

export function defaultSave() {
  return {
    version: SAVE_VERSION,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    profile: { name: 'Explorer', avatar: 'arin' },
    wallet: { coins: 0, gems: 0 },
    progress: {
      currentRoom: 1,
      unlockedRoom: 1,
      /** roomId -> { stars, bestTime, bestCoins, attempts, escapes, deaths, noDamage, challengeDone } */
      rooms: {},
      worldUnlocked: 1,
      bossDefeated: {},
      totalEscapes: 0,
      totalDeaths: 0,
      totalCoinsEarned: 0,
      totalGemsEarned: 0,
      totalSlimesDefeated: 0,
      endlessBest: 0,
      endlessBestRooms: 0,
      weeklyBest: 0,
      perfectEscapes: 0,
      seenTutorial: {},
    },
    upgrades: { health: 0, sword: 0, dash: 0, magnet: 0, luck: 0 },
    unlocks: { sword: false, dash: false, endless: false, weekly: false, worlds: [1] },
    cosmetics: {
      characters: ['arin', 'meera'],
      skins: ['classic'],
      trails: ['dust'],
      equipped: { character: 'arin', skin: 'classic', trail: 'dust' },
    },
    shop: { adFree: false },
    daily: {
      /** cycle index (0..6) -> last claim date string */
      lastClaimDate: null,
      cycleDay: 0,
      streak: 0,
      challenges: {
        date: null,
        list: [], // { id, type, target, progress, done, claimed }
      },
    },
    achievements: {}, // id -> { unlocked: true, at }
    stats: {
      playSeconds: 0,
      sessions: 0,
      adsWatched: 0,
      deathsByReason: {},
      levelResults: {}, // roomId -> { attempts, escapes, deaths, bestTime }
    },
    analytics: { events: [], truncated: 0 },
  };
}

function deepMerge(base, patch) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return patch ?? base;
  const out = { ...base };
  for (const [k, v] of Object.entries(patch || {})) {
    out[k] = k in base ? deepMerge(base[k], v) : v;
  }
  return out;
}

export class SaveManager extends Emitter {
  constructor() {
    super();
    this.data = defaultSave();
    this._dirty = false;
    this._timer = null;
    // A brand-new install owns nothing, so an incoming cloud save always wins.
    // Only a save that actually came out of storage is worth protecting.
    this._fresh = true;
    this.load();
  }

  /* ------------------------------- persistence ------------------------------ */
  load() {
    const raw = storage.get(SAVE_KEY, null);
    if (raw && typeof raw === 'object') {
      this.data = this.migrate(raw);
      this._fresh = false;
    } else {
      this.data = defaultSave();
      this._fresh = true;
    }
    // Keep the stored timestamp: overwriting it here made every fresh install
    // look "newer" than the cloud save it was supposed to restore.
    if (!this.data.updatedAt) this.data.updatedAt = Date.now();
    return this.data;
  }

  migrate(raw) {
    let d = deepMerge(defaultSave(), raw);
    // v1 -> v2: upgrades were stored as flat numbers on the root object.
    if (raw.version === 1) {
      d.upgrades = { ...defaultSave().upgrades, ...(raw.upgrades || {}) };
      d.unlocks = { ...defaultSave().unlocks, ...(raw.unlocks || {}) };
    }
    d.version = SAVE_VERSION;
    return d;
  }

  /** Marks state dirty; persistence is debounced to avoid mobile jank. */
  commit(reason = 'change', immediate = false) {
    this._dirty = true;
    this._fresh = false;
    this.data.updatedAt = Date.now();
    this.emit('change', this.data, reason);
    const flush = () => {
      this._dirty = false;
      storage.set(SAVE_KEY, this.data);
      this.emit('saved', this.data);
    };
    if (immediate) {
      if (this._timer) clearTimeout(this._timer);
      this._timer = null;
      flush();
      return;
    }
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(flush, 450);
  }

  /** Flush on app hide / visibilitychange so no progress is lost. */
  flush() {
    if (this._timer) clearTimeout(this._timer);
    this._timer = null;
    storage.set(SAVE_KEY, this.data);
  }

  hardReset() {
    storage.remove(SAVE_KEY);
    this.data = defaultSave();
    this._fresh = true;
    this.commit('reset', true);
  }

  /* --------------------------- cloud-save ready API -------------------------- */
  serialize() {
    return JSON.stringify({ v: SAVE_VERSION, data: this.data, savedAt: Date.now() });
  }
  deserialize(json, { preferNewest = true } = {}) {
    try {
      const parsed = typeof json === 'string' ? JSON.parse(json) : json;
      const remote = parsed?.data ?? parsed;
      // Never clobber a real local save with an older cloud copy — but do not
      // let a blank install block a restore either.
      if (preferNewest && !this._fresh && remote?.updatedAt && this.data?.updatedAt > remote.updatedAt) return false;
      this.data = this.migrate(remote);
      this.commit('cloud-load', true);
      return true;
    } catch {
      return false;
    }
  }

  /* --------------------------------- wallet --------------------------------- */
  get coins() {
    return this.data.wallet.coins;
  }
  get gems() {
    return this.data.wallet.gems;
  }
  addCoins(n, silent = false) {
    n = Math.max(0, Math.round(n));
    if (!n) return 0;
    this.data.wallet.coins += n;
    this.data.progress.totalCoinsEarned += n;
    if (!silent) this.commit('coins');
    return n;
  }
  spendCoins(n) {
    n = Math.max(0, Math.round(n));
    if (this.data.wallet.coins < n) return false;
    this.data.wallet.coins -= n;
    this.commit('coins');
    return true;
  }
  addGems(n, silent = false) {
    n = Math.max(0, Math.round(n));
    if (!n) return 0;
    this.data.wallet.gems += n;
    this.data.progress.totalGemsEarned += n;
    if (!silent) this.commit('gems');
    return n;
  }
  spendGems(n) {
    n = Math.max(0, Math.round(n));
    if (this.data.wallet.gems < n) return false;
    this.data.wallet.gems -= n;
    this.commit('gems');
    return true;
  }

  /* -------------------------------- progress -------------------------------- */
  roomStat(roomId) {
    const p = this.data.progress.rooms;
    if (!p[roomId]) p[roomId] = { stars: 0, bestTime: 0, bestCoins: 0, attempts: 0, escapes: 0, deaths: 0, noDamage: false, challengeDone: false };
    return p[roomId];
  }
  markLevelStart(roomId) {
    const s = this.roomStat(roomId);
    s.attempts++;
    const st = (this.data.stats.levelResults[roomId] ||= { attempts: 0, escapes: 0, deaths: 0, bestTime: 0 });
    st.attempts++;
    this.commit('level-start');
  }
  recordDeath(roomId, reason) {
    const s = this.roomStat(roomId);
    s.deaths++;
    this.data.progress.totalDeaths++;
    this.data.stats.deathsByReason[reason] = (this.data.stats.deathsByReason[reason] || 0) + 1;
    const st = (this.data.stats.levelResults[roomId] ||= { attempts: 0, escapes: 0, deaths: 0, bestTime: 0 });
    st.deaths++;
    this.commit('death', true);
  }
  /**
   * Stores the result of a room and returns what improved.
   */
  recordEscape(roomId, { stars = 1, time = 0, coins = 0, noDamage = false, challengeDone = false } = {}) {
    const s = this.roomStat(roomId);
    s.escapes++;
    s.challengeDone = s.challengeDone || challengeDone;
    s.noDamage = s.noDamage || noDamage;
    const prevStars = s.stars;
    const improved = {
      stars: Math.max(0, stars - prevStars),
      bestTime: false,
      perfect: stars === 3 && prevStars < 3,
    };
    s.stars = Math.max(s.stars, stars);
    if (!s.bestTime || time < s.bestTime) {
      s.bestTime = time;
      improved.bestTime = true;
    }
    s.bestCoins = Math.max(s.bestCoins, coins);
    const st = (this.data.stats.levelResults[roomId] ||= { attempts: 1, escapes: 0, deaths: 0, bestTime: 0 });
    st.escapes++;
    if (!st.bestTime || time < st.bestTime) st.bestTime = time;
    this.data.progress.totalEscapes++;
    if (stars === 3) this.data.progress.perfectEscapes++;
    this.data.progress.currentRoom = Math.max(this.data.progress.currentRoom, roomId + 1);
    this.data.progress.unlockedRoom = Math.max(this.data.progress.unlockedRoom, roomId + 1);
    this.commit('escape', true);
    return improved;
  }
  totalStars() {
    return Object.values(this.data.progress.rooms).reduce((n, r) => n + (r.stars || 0), 0);
  }
  setUnlock(key, value = true) {
    if (this.data.unlocks[key] === value) return false;
    this.data.unlocks[key] = value;
    this.commit('unlock');
    return true;
  }
  hasUnlock(key) {
    return !!this.data.unlocks[key];
  }

  /* -------------------------------- upgrades -------------------------------- */
  upgradeLevel(id) {
    return this.data.upgrades[id] ?? 0;
  }
  setUpgrade(id, level) {
    this.data.upgrades[id] = level;
    this.commit('upgrade', true);
  }

  /* ------------------------------- cosmetics -------------------------------- */
  ownsCosmetic(kind, id) {
    return (this.data.cosmetics[kind] || []).includes(id);
  }
  grantCosmetic(kind, id) {
    const list = (this.data.cosmetics[kind] ||= []);
    if (list.includes(id)) return false;
    list.push(id);
    this.commit('cosmetic', true);
    return true;
  }
  equipCosmetic(kind, id) {
    if (!this.ownsCosmetic(kind, id)) return false;
    this.data.cosmetics.equipped[kind] = id;
    this.commit('equip', true);
    return true;
  }

  /* ------------------------------ achievements ------------------------------ */
  unlockAchievement(id, at = Date.now()) {
    if (this.data.achievements[id]?.unlocked) return false;
    this.data.achievements[id] = { unlocked: true, at };
    this.commit('achievement', true);
    this.emit('achievement', id);
    return true;
  }
  hasAchievement(id) {
    return !!this.data.achievements[id]?.unlocked;
  }

  /* --------------------------- daily rewards / jobs ------------------------- */
  todayKey(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  isDailyRewardReady() {
    return this.data.daily.lastClaimDate !== this.todayKey();
  }
  claimDailyReward() {
    const today = this.todayKey();
    if (this.data.daily.lastClaimDate === today) return null;
    // Missing a day costs at most the streak counter — never progress.
    const yesterday = this.todayKey(new Date(Date.now() - 86400000));
    if (this.data.daily.lastClaimDate === yesterday) this.data.daily.streak = Math.min(7, this.data.daily.streak + 1);
    else this.data.daily.streak = Math.min(7, (this.data.daily.lastClaimDate ? 0 : 0) + 1);
    this.data.daily.lastClaimDate = today;
    this.data.daily.cycleDay = this.data.daily.streak;
    this.commit('daily', true);
    return this.data.daily.streak;
  }

  /* ---------------------------------- stats --------------------------------- */
  addPlaySeconds(s) {
    this.data.stats.playSeconds += s;
  }
  bumpStat(path, amount = 1) {
    const parts = path.split('.');
    let node = this.data.stats;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] ||= {};
    node[parts[parts.length - 1]] = (node[parts[parts.length - 1]] || 0) + amount;
  }
  /** Keeps analytics as a bounded ring buffer so saves never grow forever. */
  trackEvent(name, payload = {}) {
    if (!this.data.settings.analytics) return;
    const events = this.data.analytics.events;
    events.push({ t: Date.now(), n: name, ...payload });
    if (events.length > 400) {
      events.splice(0, 100);
      this.data.analytics.truncated += 100;
    }
    this._dirty = true;
  }
  exportAnalytics() {
    return JSON.stringify({ exportedAt: Date.now(), version: SAVE_VERSION, events: this.data.analytics.events, stats: this.data.stats }, null, 2);
  }
  clearAnalytics() {
    this.data.analytics.events = [];
    this.commit('analytics', true);
  }
  setSetting(key, value) {
    this.data.settings[key] = value;
    this.commit('settings', true);
    this.emit('settings', key, value);
  }
  get settings() {
    return this.data.settings;
  }
}

export const clampVolume = (v) => clamp(v, 0, 1);
export default SaveManager;
