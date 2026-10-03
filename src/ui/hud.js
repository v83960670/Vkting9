/**
 * ESCAPE 99 — in-game HUD
 * Deliberately sparse: hearts, room, optional timer, coins, one action button.
 * Nothing overlaps the play area (the room is letterboxed between the bars).
 */
import { el } from '../core/util.js';
import { btn, icon } from './kit.js';
import { formatTime } from '../core/util.js';

export class Hud {
  constructor({ onPause, onAction }) {
    this.onPause = onPause;
    this.onAction = onAction;
    this.root = el('div', { class: 'hud', id: 'hud' });

    this.hearts = el('div', { class: 'hud__hearts' });
    this.roomLabel = el('div', { class: 'hud__room', text: 'ROOM 1' });
    this.timer = el('div', { class: 'hud__timer is-hidden', text: '' });
    this.coins = el('div', { class: 'hud__coins' }, [icon('🪙'), el('span', { class: 'hud__coins-val', text: '0' })]);
    this.pauseBtn = btn('⏸', { class: 'hud__pause', onClick: () => this.onPause?.() });
    this.actionBtn = btn('⚔️<span class="btn__sub">ATTACK</span>', { class: 'hud__action is-hidden', onClick: () => this.onAction?.() });
    this.prompt = el('div', { class: 'prompt is-hidden' });
    this.promptText = el('div', { class: 'prompt__text' });
    this.promptSub = el('div', { class: 'prompt__sub' });
    this.prompt.append(this.promptText, this.promptSub);
    this.banner = el('div', { class: 'banner is-hidden' });
    this.bigCount = el('div', { class: 'countdown is-hidden' });
    this.bossBar = el('div', { class: 'bossbar is-hidden' }, [
      el('div', { class: 'bossbar__name', text: 'THE STONE GUARDIAN' }),
      el('div', { class: 'bossbar__track' }, [el('i', { class: 'bossbar__fill' })]),
    ]);
    this.bossFill = this.bossBar.querySelector('.bossbar__fill');

    this.top = el('div', { class: 'hud__top' }, [
      el('div', { class: 'hud__left' }, [this.hearts]),
      el('div', { class: 'hud__center' }, [this.roomLabel, this.timer]),
      el('div', { class: 'hud__right' }, [this.coins, this.pauseBtn]),
    ]);
    this.bottom = el('div', { class: 'hud__bottom' }, [this.actionBtn]);
    this.root.append(this.top, this.prompt, this.banner, this.bossBar, this.bigCount, this.bottom);
  }

  mount(parent) {
    parent.appendChild(this.root);
  }

  setHearts(current, max) {
    this.hearts.innerHTML = '';
    const total = Math.max(max, current);
    for (let i = 0; i < total; i++) {
      this.hearts.appendChild(el('i', { class: `heart ${i < current ? 'is-on' : ''}` }));
    }
  }
  setCoins(n) {
    this.root.querySelector('.hud__coins-val').textContent = String(n);
  }
  setRoom(text) {
    this.roomLabel.textContent = text;
  }
  setTimer(seconds, { danger = false, countUp = false, countDown = false, target = 0 } = {}) {
    if (seconds === null || seconds === undefined) {
      this.timer.classList.add('is-hidden');
      return;
    }
    this.timer.classList.remove('is-hidden');
    this.timer.textContent = '';
    this.timer.append(icon(countDown ? '⏳' : '⏱'), el('span', { text: formatTime(seconds) }));
    this.timer.classList.toggle('is-danger', danger);
    if (countUp && target) this.timer.classList.toggle('is-target', seconds <= target);
    void countDown;
  }
  setAction(label, visible) {
    if (!visible) {
      this.actionBtn.classList.add('is-hidden');
      return;
    }
    this.actionBtn.classList.remove('is-hidden');
    this.actionBtn.innerHTML = `<span class="btn__ico">⚔️</span><span class="btn__sub">${label}</span>`;
  }
  showPrompt(text, { sub, big = false, color, duration = 2, action = false } = {}) {
    this.promptText.textContent = text;
    this.promptSub.textContent = sub || '';
    this.prompt.className = `prompt ${big ? 'prompt--big' : ''} ${color ? 'prompt--goal' : ''} ${action ? 'prompt--action' : ''}`;
    if (color) this.prompt.style.setProperty('--prompt-color', color);
    this.prompt.style.animation = 'none';
    void this.prompt.offsetWidth;
    this.prompt.style.animation = `promptIn ${Math.min(0.5, duration / 2)}s ease-out`;
    this.prompt.style.setProperty('--prompt-life', `${duration}s`);
  }
  clearPrompt() {
    this.prompt.classList.add('is-hidden');
    this.prompt.className = 'prompt is-hidden';
  }
  showBanner(text) {
    this.banner.textContent = text;
    this.banner.classList.remove('is-hidden');
    this.banner.style.animation = 'none';
    void this.banner.offsetWidth;
    this.banner.style.animation = 'bannerIn 2.2s ease-out forwards';
    setTimeout(() => this.banner.classList.add('is-hidden'), 2200);
  }
  bigCountdown(value) {
    this.bigCount.textContent = value;
    this.bigCount.classList.remove('is-hidden');
    this.bigCount.style.animation = 'none';
    void this.bigCount.offsetWidth;
    this.bigCount.style.animation = 'countPop 0.9s ease-out forwards';
    setTimeout(() => this.bigCount.classList.add('is-hidden'), 900);
  }
  setBossBar(value, max = 3) {
    if (value === null || value === undefined) {
      this.bossBar.classList.add('is-hidden');
      return;
    }
    this.bossBar.classList.remove('is-hidden');
    this.bossFill.style.width = `${Math.max(0, (value / max) * 100)}%`;
  }
  shakeLocked() {
    const t = this.timer;
    t.classList.add('is-locked');
    setTimeout(() => t.classList.remove('is-locked'), 400);
  }
  show() {
    this.root.classList.remove('is-hidden');
  }
  hide() {
    this.root.classList.add('is-hidden');
  }
}
