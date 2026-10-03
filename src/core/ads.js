/**
 * ESCAPE 99 — rewarded-video service (placeholder)
 *
 * The gameplay never requires an ad. Every placement is opt-in, always shows
 * what the player receives before the video starts, and grants the reward only
 * after the "ad" completes.
 *
 * Integration point for shipping builds:
 *   • Android/iOS (Capacitor / Cordova / native shell): call the platform
 *     rewarded-video plugin inside `playAd()` and resolve on completion.
 *   • Web: swap `playAd()` for the AdSense/H5 rewarded SDK of your choice.
 * Nothing else in the codebase needs to change.
 */
import { el } from './util.js';
import { btn } from '../ui/kit.js';

export class AdService {
  constructor({ analytics, i18n, audio }) {
    this.analytics = analytics;
    this.i18n = i18n;
    this.audio = audio;
    this.layer = null;
    this.adFree = false;
    this.placement = null;
  }

  setAdFree(on) {
    this.adFree = !!on;
  }

  /**
   * @param {string} placement  analytics id, e.g. 'bonus_coins' | 'double_coins' | 'revive'
   * @param {() => void} onReward called only after the ad completes
   * @param {{rewardLabel?: string, duration?: number}} opts
   */
  watch(placement, onReward, opts = {}) {
    if (this.adFree) {
      onReward?.();
      return;
    }
    this.analytics?.track('optional_ad_started', { placement });
    this.showAdModal(placement, opts, () => {
      this.analytics?.track('optional_ad_completed', { placement });
      onReward?.();
    });
  }

  showAdModal(placement, opts, done) {
    const duration = opts.duration ?? 5;
    let remaining = duration;
    const countEl = el('strong', { class: 'ad__count', text: String(remaining) });
    const progress = el('i', { class: 'ad__barfill' });
    const header = el('h2', { class: 'sheet__title', text: 'REWARDED AD' });
    const note = el('p', { class: 'sheet__sub', text: 'Placeholder ad. Wire your rewarded-video SDK into AdService.playAd().' });
    const rewardLine = el('p', { class: 'ad__reward', text: opts.rewardLabel || this.i18n?.t('watch_for_coins', { n: 50 }) || 'REWARD' });
    const skip = btn('CLOSE', { class: 'btn--ghost btn--small', onClick: () => close(false) });
    const card = el('div', { class: 'sheet sheet--sm ad' }, [
      header,
      note,
      el('div', { class: 'ad__screen' }, [el('span', { class: 'ad__logo', text: 'ESCAPE 99' }), countEl]),
      el('div', { class: 'ad__bar' }, [progress]),
      rewardLine,
      el('footer', { class: 'sheet__actions' }, [skip]),
    ]);
    const scrim = el('div', { class: 'sheet__scrim' }, [card]);
    const layer = document.getElementById('overlays');
    layer.appendChild(scrim);
    this.layer = scrim;

    let timer = null;
    const close = (completed) => {
      if (timer) clearInterval(timer);
      scrim.classList.add('is-leaving');
      setTimeout(() => scrim.remove(), 200);
      this.layer = null;
      if (completed) {
        this.audio?.play('star');
        done();
      }
    };
    timer = setInterval(() => {
      remaining -= 1;
      countEl.textContent = String(Math.max(0, remaining));
      progress.style.width = `${((duration - remaining) / duration) * 100}%`;
      if (remaining <= 0) {
        clearInterval(timer);
        timer = null;
        card.classList.add('is-complete');
        header.textContent = 'THANK YOU!';
        countEl.textContent = '✓';
        setTimeout(() => close(true), 450);
      }
    }, 1000);
  }
}

export default AdService;
