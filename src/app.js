/**
 * ESCAPE 99 — bootstrap
 * Wires every system together, applies settings, starts the loop.
 */
import { SaveManager } from './core/save.js';
import { I18n } from './core/i18n.js';
import { STRINGS } from './data/strings.js';
import { AudioEngine } from './engine/audio.js';
import { Haptics } from './engine/haptics.js';
import { InputManager } from './engine/input.js';
import { Renderer } from './render/renderer.js';
import { Analytics } from './core/analytics.js';
import { Challenges } from './core/challenges.js';
import { AdService } from './core/ads.js';
import { Game } from './game/game.js';
import { UI } from './ui/ui.js';

const canvas = document.getElementById('game');

const save = new SaveManager();
const i18n = new I18n(STRINGS, 'en');
const audio = new AudioEngine(save.data.settings);
const haptics = new Haptics(save.data.settings.vibration);
const input = new InputManager(canvas, {
  getControlMode: () => save.data.settings.control,
  getLeftHanded: () => save.data.settings.leftHanded,
});
const renderer = new Renderer(canvas);
const analytics = new Analytics(save);
const challenges = new Challenges(save, i18n, analytics);
const ads = new AdService({ analytics, i18n, audio });

const game = new Game({ canvas, save, audio, haptics, input, i18n, analytics, renderer });
game.challenges = challenges;
game.fpsCap = save.data.settings.perfMode ? 30 : 60;

const ui = new UI({ game, save, i18n, audio, haptics, analytics, challenges, ads, input });
game.ui = ui;
game.setState('MAIN_MENU');
game.setShakeScale();

/* ───────────────────────────── input plumbing ───────────────────────────── */
input.on('move', (e) => game.handleMove(e));
input.on('action', (e) => game.handleAction(e));
input.on('pause', () => {
  if (game.state === 'PLAYING' || game.state === 'PAUSED') ui.togglePause();
});
input.on('restart', () => {
  if (game.state === 'PLAYING' || game.state === 'PLAYER_DEAD') {
    ui.closeOverlays();
    game.restartRoom();
  }
});
input.on('tap', () => {
  // Tapping anywhere on the death overlay retries (fast restart, one thumb).
  if (game.state === 'PLAYER_DEAD') ui.showDeath(game);
});

/* ─────────────────────────── settings → systems ─────────────────────────── */
function applySettings() {
  const s = save.data.settings;
  audio.setMusicVolume(s.music);
  audio.setSfxVolume(s.sfx);
  haptics.setEnabled(s.vibration);
  game.fpsCap = s.perfMode ? 30 : 60;
  game.setShakeScale();
  ads.setAdFree(!!save.data.shop.adFree);
  analytics.setEnabled(s.analytics);
}
applySettings();
save.on('settings', applySettings);
save.on('change', (data, reason) => {
  if (reason === 'settings') applySettings();
});

/* ────────────────────────── session / lifecycle ─────────────────────────── */
save.data.stats.sessions = (save.data.stats.sessions || 0) + 1;
save.commit('session-start', true);
analytics.sessionStartEvent();

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    save.flush();
    if (game.state === 'PLAYING') ui.togglePause();
  } else if (hiddenAt && Date.now() - hiddenAt > 1000) {
    save.flush();
  }
});
window.addEventListener('pagehide', () => {
  analytics.sessionEndEvent();
  save.flush();
});
window.addEventListener('beforeunload', () => {
  analytics.sessionEndEvent();
  save.flush();
});

/* ──────────────────────────────── start ─────────────────────────────────── */
const boot = () => {
  ui.showMenu();
  game.startLoop();
  input.setEnabled(true);
  if (!save.data.progress.seenTutorial?.done) {
    ui.showBootGate(() => {
      save.data.progress.seenTutorial = { done: true, at: Date.now() };
      save.commit('tutorial-gate', true);
      analytics.track('tutorial_completed', { source: 'boot_gate' });
    });
  }
  // Health check used by the test harness (and handy in the console).
  window.__ESCAPE99__ = { game, ui, save, i18n, audio, analytics, challenges, ads, input, renderer };
  console.log('%cESCAPE 99','background:#e8542f;color:#fff;padding:2px 6px;border-radius:4px','99 rooms. one way out. ready.');
};

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(boot, 60);
} else {
  window.addEventListener('DOMContentLoaded', boot);
}

/* ────────────── scroll to the docs page: park the game layer ─────────────── */
let pageMode = false;
window.addEventListener('scroll', () => {
  const next = window.scrollY > window.innerHeight * 0.45;
  if (next === pageMode) return;
  pageMode = next;
  document.body.classList.toggle('page-mode', next);
  if (next && game.state === 'PLAYING') ui.togglePause();
}, { passive: true });

/* ──────────────────────────── service worker (PWA) ──────────────────────── */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* offline caching is a bonus, never a blocker */
    });
  });
}

/* ───────────────────────────── error safety net ─────────────────────────── */
window.addEventListener('error', (e) => {
  console.error('[ESCAPE99]', e.error || e.message);
  const box = document.getElementById('crash');
  if (box && !box.dataset.shown) {
    box.dataset.shown = '1';
    box.hidden = false;
    box.querySelector('pre').textContent = String((e.error && e.error.stack) || e.message || 'Unknown error');
  }
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[ESCAPE99] unhandled', e.reason);
});
