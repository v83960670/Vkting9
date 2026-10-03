/**
 * ESCAPE 99 — UI controller
 * Owns the DOM shell, screen switching, overlays (pause/death/results/toasts)
 * and the animated menu canvases. Gameplay never touches the DOM directly.
 */
import { el, formatNumber } from '../core/util.js';
import { btn, modal, starRow, toast, icon } from './kit.js';
import { Hud } from './hud.js';
import {
  menuScreen, worldMapScreen, heroesScreen, upgradesScreen, challengesScreen,
  rewardsScreen, settingsScreen, howToScreen, resultsBody, navBar,
} from './screens.js';
import { SUPPORTED_LANGUAGES } from '../core/i18n.js';
import { ROOM_COUNT } from '../data/levels.js';
import { AD_REWARDS } from '../data/progression.js';
import { ACHIEVEMENTS } from '../data/progression.js';

export class UI {
  constructor(deps) {
    const { game, save, i18n, audio, haptics, analytics, challenges, ads, input } = deps;
    Object.assign(this, deps);
    this.game = game;
    this.save = save;
    this.i18n = i18n;
    this.audio = audio;
    this.challenges = challenges;
    this.ads = ads;
    this.haptics = haptics;
    this.analytics = analytics;
    this.input = input;
    this.screen = null;
    this.screenName = null;
    this.animations = [];
    this.overlayStack = [];
    this.toastQueue = [];
    this.flags = {};
    this.buildShell();
    this.hud = new Hud({
      onPause: () => this.togglePause(),
      onAction: () => this.game.handleAction({ dash: false }),
    });
    this.hud.mount(this.hudLayer);
    this.startAnimationLoop();
    i18n.on('change', () => this.refresh());
  }

  buildShell() {
    this.screenLayer = el('main', { class: 'layer layer--screen', id: 'screens' });
    this.hudLayer = el('div', { class: 'layer layer--hud', id: 'hud-layer' });
    this.overlayLayer = el('div', { class: 'layer layer--overlays', id: 'overlays' });
    this.toastLayer = el('div', { class: 'layer layer--toasts', id: 'toasts' });
    this.fade = el('div', { class: 'fade', id: 'fade' });
    document.body.append(this.fade, this.screenLayer, this.hudLayer, this.overlayLayer, this.toastLayer);
  }

  /* ─────────────────────────────── screens ─────────────────────────────── */
  setScreen(name, builder) {
    this.animations.length = 0;
    this.screenName = name;
    // A visible menu owns the touch surface; while playing the canvas does.
    // (Without this the invisible screen layer swallows every swipe.)
    this.setPlaying(false);
    const node = builder();
    node.classList.add('screen--enter');
    if (this.screen) {
      const old = this.screen;
      old.classList.add('screen--leaving');
      setTimeout(() => old.remove(), 240);
    }
    this.screenLayer.appendChild(node);
    this.screen = node;
    requestAnimationFrame(() => node.classList.remove('screen--enter'));
  }

  /** ctx handed to every screen builder. */
  get screenCtx() {
    const self = this;
    return {
      save: this.save,
      i18n: this.i18n,
      analytics: this.analytics,
      haptics: this.haptics,
      audio: this.audio,
      game: this.game,
      challenges: this.challenges,
      ads: this.ads,
      languages: () => SUPPORTED_LANGUAGES,
      animate: (canvas, fn) => self.animate(canvas, fn),
      refresh: () => this.refresh(),
      achievementProgress: (a) => this.challenges.achievementProgress(a),
      exportAnalytics: () => self.exportAnalytics(),
      actions: {
        play: (room) => self.startRoom(room),
        playEndless: () => self.startEndless(),
        playWeekly: () => self.startWeekly(),
      },
      open: {
        menu: () => self.showMenu(),
        worldMap: () => self.showWorldMap(),
        heroes: () => self.showHeroes(),
        upgrades: () => self.showUpgrades(),
        challenges: () => self.showChallenges(),
        rewards: () => self.showRewards(),
        settings: () => self.showSettings(),
        howTo: () => self.showHowTo(),
      },
      feedback: {
        purchase: (item) => {
          self.audio.play('powerup');
          self.haptics.buzz('chest');
          self.toast(`${item.name || item.id}`, '🎉');
        },
        denied: (msg) => {
          self.audio.play('locked');
          self.haptics.buzz('damage');
          self.toast(msg, '🚫');
        },
        reward: (reward) => {
          self.audio.play('chest');
          self.haptics.buzz('chest');
          self.toast(reward?.label || '+REWARD', reward?.icon || '🎁');
          self.refreshWallet();
        },
      },
    };
  }

  refresh() {
    this.hud.setCoins(this.save.data.wallet.coins);
    const map = {
      home: menuScreen,
      map: worldMapScreen,
      heroes: heroesScreen,
      upgrades: upgradesScreen,
      challenges: challengesScreen,
      rewards: rewardsScreen,
      settings: settingsScreen,
      howto: howToScreen,
    };
    const builder = map[this.screenName];
    if (builder) this.setScreen(this.screenName, () => builder(this.screenCtx));
  }

  showMenu() {
    this.hud.hide();
    this.setScreen('home', () => menuScreen(this.screenCtx));
    this.audio.playMusic('menu', { intensity: 0 });
  }
  showWorldMap() {
    this.setScreen('map', () => worldMapScreen(this.screenCtx));
  }
  showHeroes() {
    this.setScreen('heroes', () => heroesScreen(this.screenCtx));
  }
  showUpgrades() {
    this.setScreen('upgrades', () => upgradesScreen(this.screenCtx));
  }
  showChallenges() {
    this.setScreen('challenges', () => challengesScreen(this.screenCtx));
  }
  showRewards() {
    this.setScreen('rewards', () => rewardsScreen(this.screenCtx));
  }
  showSettings() {
    this.setScreen('settings', () => settingsScreen(this.screenCtx));
  }
  showHowTo() {
    this.setScreen('howto', () => howToScreen(this.screenCtx));
  }

  /* ─────────────────────────── gameplay screens ─────────────────────────── */
  startRoom(room) {
    this.fadeOut(() => {
      this.clearScreen();
      this.hud.show();
      this.game.loadRoom(room, { mode: 'story' });
      this.fadeIn();
    });
  }
  startEndless() {
    this.fadeOut(() => {
      this.clearScreen();
      this.hud.show();
      this.game.roomSeed = (Math.random() * 1e9) | 0;
      this.game.loadRoom(1, { mode: 'endless' });
      this.fadeIn();
    });
  }
  startWeekly() {
    this.fadeOut(() => {
      this.clearScreen();
      this.hud.show();
      this.game.loadRoom(1, { mode: 'weekly' });
      this.fadeIn();
    });
  }

  clearScreen() {
    this.animations.length = 0;
    if (this.screen) this.screen.remove();
    this.screen = null;
    this.screenName = null;
  }

  fadeOut(done, ms = 220) {
    this.fade.classList.add('is-on');
    setTimeout(() => done?.(), ms);
  }
  fadeIn() {
    requestAnimationFrame(() => this.fade.classList.remove('is-on'));
  }

  /** Called by the game when a room finished loading. */
  onRoomLoaded(game) {
    const def = game.room.def;
    this.setPlaying(true);
    this.hud.show();
    this.hud.setHearts(game.player.hearts, game.player.maxHearts);
    this.hud.setCoins(this.save.data.wallet.coins);
    this.hud.setRoom(def.endless ? this.i18n.t('endless_escape') : this.i18n.t('room_n', { n: def.id }));
    this.hud.setTimer(null);
    this.hud.setBossBar(def.isBoss ? 3 : null);
    this.hud.setAction('', false);
    if (game.player.swordUnlocked) this.hud.setAction(this.i18n.t('t_tap_attack'), false);
    this.closeOverlays();
  }

  /** Lets the canvas own the swipes while a room is live. */
  setPlaying(on) {
    const active = document.body.classList.contains('is-playing');
    if (active === !!on) return;
    document.body.classList.toggle('is-playing', !!on);
  }

  /* ───────────────────────────── HUD delegates ──────────────────────────── */
  setHearts(current, max) {
    this.hud.setHearts(current, max);
  }
  setCoins(n) {
    this.hud.setCoins(n);
  }
  setGems() {
    /* gems shown on menus; HUD keeps the top bar clean */
  }
  setTimer(value, opts) {
    this.hud.setTimer(value, opts);
  }
  setAction(label, visible) {
    this.hud.setAction(label, visible);
  }
  showPrompt(text, opts) {
    this.hud.showPrompt(text, opts);
  }
  clearPrompt() {
    this.hud.clearPrompt();
  }
  shakeLocked() {
    this.hud.shakeLocked();
  }
  bigCountdown(v) {
    this.hud.bigCountdown(v);
  }
  flashBanner(key) {
    this.hud.showBanner(this.i18n.t(key));
  }
  refreshWallet() {
    this.hud.setCoins(this.save.data.wallet.coins);
  }
  setFlag(key, value) {
    this.flags[key] = value;
  }

  /* ─────────────────────────────── overlays ────────────────────────────── */
  closeOverlays() {
    while (this.overlayStack.length) this.overlayStack.pop()?.remove();
  }

  togglePause() {
    const game = this.game;
    if (game.state === 'PLAYING') {
      game.setState('PAUSED');
      this.input.setEnabled(false);
      this.showPause();
    } else if (game.state === 'PAUSED') {
      game.setState('PLAYING');
      this.input.setEnabled(true);
      this.closeOverlays();
    }
  }

  showPause() {
    const resume = btn(`▶ ${this.i18n.t('resume')}`, {
      class: 'btn--primary btn--wide',
      onClick: () => this.togglePause(),
    });
    const sheet = modal({
      title: this.i18n.t('pause'),
      subtitle: this.i18n.t('room_n', { n: this.game.roomId }),
      body: [
        el('div', { class: 'pausestats' }, [
          el('span', { class: 'chip', text: `⭐ ${this.save.roomStat(this.game.roomId).stars}/3` }),
          el('span', { class: 'chip' }, [icon('🪙'), el('span', { text: String(this.save.data.wallet.coins) })]),
          el('span', { class: 'chip' }, [icon('💎'), el('span', { text: String(this.save.data.wallet.gems) })]),
        ]),
      ],
      actions: [
        resume,
        btn(`↻ ${this.i18n.t('restart')}`, {
          class: 'btn--ghost btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.game.restartRoom();
            this.input.setEnabled(true);
          },
        }),
        btn(`⚙️ ${this.i18n.t('settings')}`, {
          class: 'btn--ghost btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.game.setState('PAUSED');
            this.showSettings();
          },
        }),
        btn(`🏠 ${this.i18n.t('quit_to_menu')}`, {
          class: 'btn--ghost btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.game.goToMenu();
          },
        }),
      ],
      onClose: () => this.togglePause(),
    });
    this.pushOverlay(sheet.root);
  }

  showDeath(game) {
    const reasonKey = `death_${game.player.deathReason || 'spikes'}`;
    const translated = this.i18n.t(reasonKey);
    const reason = translated === reasonKey ? this.i18n.t('try_again') : translated;
    const canRevive = !game.reviveUsed && !game.escapePhase?.active;
    const body = [
      el('div', { class: 'death__art' }, [el('span', { class: 'death__face', text: game.player.deathReason === 'fire' ? '🔥' : game.player.deathReason === 'slime' ? '🟢' : '💫' })]),
      el('p', { class: 'death__reason', text: reason }),
      el('div', { class: 'death__stats' }, [
        el('span', { class: 'chip' }, [icon('⏱'), el('span', { text: this.hud.timer.textContent || '00:00' })]),
        el('span', { class: 'chip' }, [icon('🪙'), el('span', { text: String(game.runStats?.coins ?? 0) })]),
        el('span', { class: 'chip', text: `🚪 ${this.i18n.t('room')} ${game.roomId}` }),
      ]),
      el('p', { class: 'death__hint', text: this.hintForReason(game) }),
    ];
    const actions = [
      btn(`↻ ${this.i18n.t('try_again')}`, {
        class: 'btn--primary btn--wide',
        onClick: () => {
          this.closeOverlays();
          this.game.restartRoom();
          this.input.setEnabled(true);
        },
      }),
    ];
    if (canRevive) {
      actions.push(
        btn(`▶ ${this.i18n.t('second_chance')}`, {
          class: 'btn--gold btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.ads.watch('revive', () => {
              this.game.revive();
              this.input.setEnabled(true);
              this.toast(this.i18n.t('revive_used'), '💫');
            }, { rewardLabel: this.i18n.t('second_chance') });
            this.input.setEnabled(false);
          },
        })
      );
    }
    actions.push(
      btn(`🏠 ${this.i18n.t('home')}`, {
        class: 'btn--ghost btn--wide',
        onClick: () => {
          this.closeOverlays();
          this.game.goToMenu();
        },
      })
    );
    const sheet = modal({
      title: this.i18n.t('died'),
      subtitle: `${this.i18n.t('room')} ${game.roomId} · ${this.i18n.t('stars_earned')} ${this.save.roomStat(game.roomId).stars}/3`,
      body,
      actions,
      size: 'sm',
      closable: false,
    });
    this.pushOverlay(sheet.root, 'overlay--death');
    this.audio.play('fail');
  }

  hintForReason(game) {
    const r = game.player?.deathReason;
    const hints = {
      spikes: 'Watch the floor: cracks → red glow → spikes. Wait for WAIT… then GO!',
      fire: 'Flames pulse on a beat. Count the rhythm before you cross.',
      firewall: 'Never stop moving once the fire wall starts.',
      lava: 'Lava always kills. Keep climbing.',
      slime: 'Slimes chase you. Keep a gap or use the sword.',
      rock: 'Red circles mark where rocks land. Step out of them.',
      boss: 'Dodge the charge — a wall impact stuns the Guardian for 3 seconds.',
      time: 'Faster route: skip the optional coins this time.',
    };
    return hints[r] || 'Try a different route — the key is always reachable.';
  }

  showResults(game, results) {
    this.hud.hide();
    const endless = results.mode === 'endless';
    const nextRoomExists = game.roomId + 1 <= ROOM_COUNT && !endless;
    const actions = [];
    if (endless) {
      actions.push(
        btn(`↻ ${this.i18n.t('replay')}`, {
          class: 'btn--primary btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.startEndless();
          },
        })
      );
    } else if (nextRoomExists) {
      actions.push(
        btn(`▶ ${this.i18n.t('next_room')}`, {
          class: 'btn--primary btn--wide',
          onClick: () => {
            this.closeOverlays();
            this.fadeOut(() => {
              game.nextRoom();
              this.fadeIn();
            });
          },
        })
      );
    }
    actions.push(
      btn(`▶ ${this.i18n.t('watch_double')}`, {
        class: 'btn--gold btn--wide',
        onClick: (e) => {
          e.currentTarget.disabled = true;
          this.ads.watch('double_coins', () => {
            this.save.addCoins(results.coins);
            this.toast(this.i18n.t('ad_double_done'), '🪙');
            this.refreshWallet();
          }, { rewardLabel: `+${results.coins} ${this.i18n.t('coins')}` });
        },
      }),
      btn(`↻ ${this.i18n.t('replay')}`, {
        class: 'btn--ghost btn--wide',
        onClick: () => {
          this.closeOverlays();
          game.restartRoom();
        },
      }),
      btn(`🏠 ${this.i18n.t('home')}`, {
        class: 'btn--ghost btn--wide',
        onClick: () => {
          this.closeOverlays();
          game.goToMenu();
        },
      })
    );
    const sheet = modal({
      title: this.i18n.t('escaped'),
      subtitle: endless ? this.i18n.t('endless_escape') : `${this.i18n.t('room')} ${game.roomId} · ${game.room.def.name}`,
      body: [resultsBody(this.screenCtx, results)],
      actions,
      size: 'md',
      closable: false,
    });
    this.pushOverlay(sheet.root, 'overlay--results');
    this.audio.play('victory');
    this.haptics.buzz('perfect');
    this.particlesConfetti();
  }

  particlesConfetti() {
    // A DOM confetti burst keeps the reward screen celebratory without canvas cost.
    const layer = this.overlayLayer;
    for (let i = 0; i < 26; i++) {
      const bit = el('i', { class: 'confetti' });
      bit.style.left = `${Math.random() * 100}%`;
      bit.style.background = ['#ff5470', '#ffd45e', '#2fb7a8', '#8ce0ff', '#b06bff'][i % 5];
      bit.style.animationDelay = `${Math.random() * 0.5}s`;
      bit.style.animationDuration = `${1.4 + Math.random() * 1.2}s`;
      layer.appendChild(bit);
      setTimeout(() => bit.remove(), 3200);
    }
  }

  pushOverlay(node, cls = '') {
    if (cls) node.classList.add(cls);
    this.overlayLayer.appendChild(node);
    this.overlayStack.push(node);
    return node;
  }

  toast(text, glyph = '⭐') {
    const t = toast(text, { icon: glyph });
    this.toastLayer.appendChild(t);
    setTimeout(() => {
      t.classList.add('is-leaving');
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  showAchievementToasts(ids) {
    ids.forEach((id, i) => {
      const a = ACHIEVEMENTS.find((x) => x.id === id);
      setTimeout(() => {
        const key = `ach_${id}`;
        const translated = this.i18n.t(key);
        this.toast(translated === key ? a?.title || id : translated, a?.icon || '🏆');
        this.audio.play('star');
      }, i * 420);
    });
  }

  exportAnalytics() {
    const json = this.save.exportAnalytics();
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'escape99-metrics.json' });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      this.toast('PLAY METRICS EXPORTED', '📊');
    } catch {
      console.log(json);
      this.toast('METRICS PRINTED TO CONSOLE', '📊');
    }
  }

  /* ─────────────────────────── animated canvases ───────────────────────── */
  animate(canvas, fn) {
    this.animations.push({ canvas, fn });
  }
  startAnimationLoop() {
    const loop = (now) => {
      requestAnimationFrame(loop);
      const t = now / 1000;
      for (let i = this.animations.length - 1; i >= 0; i--) {
        const a = this.animations[i];
        if (!a.canvas.isConnected) {
          this.animations.splice(i, 1);
          continue;
        }
        const rect = a.canvas.getBoundingClientRect();
        if (rect.bottom < -50 || rect.top > window.innerHeight + 50) continue;
        const c2d = a.canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = a.canvas.width / dpr;
        const h = a.canvas.height / dpr;
        c2d.save();
        c2d.setTransform(dpr, 0, 0, dpr, 0, 0);
        a.fn(c2d, w, h, t);
        c2d.restore();
      }
    };
    requestAnimationFrame(loop);
  }

  /* ─────────────────────────────── boot gate ───────────────────────────── */
  showBootGate(onStart) {
    const sheet = modal({
      title: 'ESCAPE 99',
      subtitle: this.i18n.t('tagline_long'),
      body: [
        el('div', { class: 'boot__art' }, [el('span', { class: 'boot__ico', text: '🗝️' })]),
        el('p', { class: 'sheet__sub', text: 'Sound on for the full experience. Everything can be changed in Settings.' }),
      ],
      actions: [
        btn(`▶ ${this.i18n.t('tap_to_start')}`, {
          class: 'btn--primary btn--wide',
          onClick: () => {
            sheet.root.classList.add('is-leaving');
            setTimeout(() => sheet.root.remove(), 220);
            this.audio.unlock();
            this.audio.play('click');
            onStart?.();
          },
        }),
      ],
      size: 'sm',
      closable: false,
    });
    this.pushOverlay(sheet.root, 'overlay--boot');
  }
}

export default UI;
