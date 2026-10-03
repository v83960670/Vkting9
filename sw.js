/**
 * ESCAPE 99 — service worker
 * Offline-first: the game is ~all code, so caching the shell makes it launch
 * instantly and work with no signal. Bump CACHE when shipping new files.
 */
const CACHE = 'escape99-v1.0.0';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './src/app.js',
  './src/core/util.js',
  './src/core/i18n.js',
  './src/core/save.js',
  './src/core/analytics.js',
  './src/core/challenges.js',
  './src/core/ads.js',
  './src/data/strings.js',
  './src/data/levels.js',
  './src/data/themes.js',
  './src/data/progression.js',
  './src/data/cosmetics.js',
  './src/engine/audio.js',
  './src/engine/input.js',
  './src/engine/particles.js',
  './src/engine/camera.js',
  './src/engine/haptics.js',
  './src/game/game.js',
  './src/game/room.js',
  './src/game/player.js',
  './src/game/entities.js',
  './src/game/boss.js',
  './src/game/endless.js',
  './src/game/weekly.js',
  './src/render/renderer.js',
  './src/render/arin.js',
  './src/ui/ui.js',
  './src/ui/hud.js',
  './src/ui/screens.js',
  './src/ui/kit.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS).catch(() => undefined)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          return res;
        })
        .catch(() => caches.match('./index.html'));
    })
  );
});
