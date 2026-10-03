/**
 * ESCAPE 99 — daily challenges & reward granting
 * Same three challenges for everyone on a given date (seeded by the date),
 * progress tracked locally, claims always explicit.
 */
import { makeRng } from './util.js';
import { CHALLENGE_TEMPLATES, DAILY_REWARDS, ACHIEVEMENTS } from '../data/progression.js';

export class Challenges {
  constructor(save, i18n, analytics) {
    this.save = save;
    this.i18n = i18n;
    this.analytics = analytics;
  }

  dateKey(d = new Date()) {
    return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  }

  /** Deterministic rotation: three templates per day. */
  ensureDaily() {
    const today = this.dateKey();
    const store = this.save.data.daily.challenges;
    if (store.date === today && store.list?.length) return store.list;
    const seed = Number(today.replace(/-/g, '')) % 2147483647;
    const rng = makeRng(seed);
    const picks = rng.shuffle(CHALLENGE_TEMPLATES).slice(0, 3);
    store.date = today;
    store.list = picks.map((t) => ({
      id: t.id,
      icon: t.icon,
      text: t.text,
      type: t.type,
      target: t.target,
      reward: t.reward,
      progress: 0,
      done: false,
      claimed: false,
    }));
    this.save.commit('daily-roll');
    return store.list;
  }

  /** Called by gameplay whenever something countable happens. */
  track(type, amount = 1) {
    const list = this.ensureDaily();
    let changed = false;
    for (const ch of list) {
      if (ch.claimed) continue;
      if (ch.type !== type) continue;
      ch.progress = Math.min(ch.target, ch.progress + amount);
      if (ch.progress >= ch.target && !ch.done) {
        ch.done = true;
        changed = true;
      }
    }
    if (changed) this.save.commit('daily-progress');
    return changed;
  }

  claimDaily(ch) {
    if (!ch.done || ch.claimed) return null;
    ch.claimed = true;
    const reward = this.grant(ch.reward);
    this.save.commit('daily-claim', true);
    this.analytics?.track('reward_claimed', { source: 'daily_challenge', id: ch.id });
    return reward;
  }

  /** Grants a reward descriptor; returns a human-readable summary. */
  grant(reward) {
    if (!reward) return null;
    const { type, amount = 1 } = reward;
    let summary = reward;
    if (type === 'coins') {
      this.save.addCoins(amount, true);
      summary = { type, amount, icon: '🪙', label: `+${amount} COINS` };
    } else if (type === 'gems') {
      this.save.addGems(amount, true);
      summary = { type, amount, icon: '💎', label: `+${amount} GEMS` };
    } else if (type === 'chest') {
      const coins = 120;
      this.save.addCoins(coins, true);
      let gems = 0;
      if (Math.random() < 0.5) {
        gems = 1;
        this.save.addGems(1, true);
      }
      summary = { type, amount: coins, gems, icon: '🎁', label: `CHEST · +${coins} 🪙${gems ? ' +1 💎' : ''}` };
    } else if (type === 'powerups') {
      summary = { type, amount, icon: '🎁', label: 'POWER-UP BUNDLE', bundle: reward.bundle };
    } else if (type === 'cosmetic') {
      const id = reward.skin || DAILY_REWARDS[6].skin;
      this.save.grantCosmetic('skins', id);
      summary = { type, amount, icon: '👑', label: 'SPECIAL COSMETIC UNLOCKED' };
    }
    this.save.commit('grant', true);
    return summary;
  }

  achievementProgress(a) {
    const p = this.save.data.progress;
    const stats = this.save.data.stats;
    switch (a.track) {
      case 'escapes':
        return p.totalEscapes || 0;
      case 'coinsEarned':
        return p.totalCoinsEarned || 0;
      case 'gemsEarned':
        return p.totalGemsEarned || 0;
      case 'noDamageEscapes':
        return stats.noDamageEscapes || 0;
      case 'slimesDefeated':
        return stats.slimesDefeated || 0;
      case 'fastEscapes':
        return stats.fastEscapes || 0;
      case 'roomsCleared':
        return p.unlockedRoom > 99 ? 99 : Math.max(0, (p.unlockedRoom || 1) - 1);
      case 'bossesDefeated':
        return stats.bossesDefeated || 0;
      case 'stars':
        return this.save.totalStars();
      case 'endlessRooms':
        return p.endlessBestRooms || 0;
      default:
        return 0;
    }
  }

  /** Cheap, honest "what should I do next" line for the menu. */
  nextGoal() {
    const list = this.ensureDaily();
    const open = list.find((c) => !c.claimed);
    if (open) return `${open.icon} ${open.text}`;
    const ach = ACHIEVEMENTS.find((a) => !this.save.hasAchievement(a.id));
    if (ach) return `${ach.icon} ${ach.desc}`;
    return '⭐ Chase a perfect 3-star escape';
  }
}

export default Challenges;
