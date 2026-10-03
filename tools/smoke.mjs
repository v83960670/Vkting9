#!/usr/bin/env node
/**
 * ESCAPE 99 — browser smoke test.
 *
 *   node tools/smoke.mjs                     headless Chromium, screenshots to .artifacts/
 *   node tools/smoke.mjs --keep              leave the browser open (debugging)
 *   CHROME=/path/to/chrome node tools/smoke.mjs
 *
 * The Node unit tests prove the *rules*. This proves the *shell*: that the real
 * bundle boots in a real browser, paints pixels, answers to touch, survives a
 * death, restarts inside the two-second budget and finishes a level end-to-end
 * with a results screen. It also leaves screenshots in .artifacts/ for humans.
 *
 * Needs puppeteer-core + a Chrome/Chromium binary. Both are optional dev
 * dependencies — if they are missing the script explains how to get them and
 * exits 0 (so it never blocks a plain `npm test`).
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.env.SMOKE_PORT || 8123);
const ART = resolve(ROOT, '.artifacts');
const KEEP = process.argv.includes('--keep');
const TOUR = process.argv.includes('--tour');
const JPEG = process.argv.includes('--jpeg');
const OUT = (() => {
  const i = process.argv.indexOf('--out');
  return resolve(ROOT, i === -1 ? '.artifacts' : process.argv[i + 1]);
})();

const CHROME =
  process.env.CHROME ||
  ['/tmp/chromium', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'].find((p) => {
    try {
      return require('node:fs').existsSync(p);
    } catch {
      return false;
    }
  });

function loadPuppeteer() {
  const tries = [process.env.PUPPETEER_CORE, 'puppeteer-core', '/home/user/.arena/testkit/node_modules/puppeteer-core'];
  for (const t of tries) {
    if (!t) continue;
    try {
      return require(t);
    } catch {
      /* try the next one */
    }
  }
  return null;
}

const puppeteer = loadPuppeteer();
if (!puppeteer || !CHROME) {
  console.log('');
  console.log('  smoke test skipped — needs puppeteer-core and a Chrome binary.');
  console.log(`  chrome:    ${CHROME || 'not found (set CHROME=/path/to/chrome)'}`);
  console.log(`  puppeteer: ${puppeteer ? 'ok' : 'not found (npm i -D puppeteer-core, or set PUPPETEER_CORE=…)'}`);
  console.log('');
  process.exit(0);
}

/* ───────────────────────────── tiny check runner ──────────────────────────── */

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (c, s) => (COLOR ? `\x1b[${c}m${s}\x1b[0m` : s);
const state = { pass: 0, fail: 0, failures: [] };
async function check(name, fn) {
  try {
    const r = await fn();
    if (r === false) throw new Error('check returned false');
    state.pass++;
    console.log(`  ${paint(32, '✓')} ${name}`);
  } catch (err) {
    state.fail++;
    state.failures.push({ name, message: err.message });
    console.log(`  ${paint(31, '✗')} ${name}`);
    console.log(`      ${paint(31, err.message)}`);
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────────── the run ──────────────────────────────────── */

mkdirSync(ART, { recursive: true });

const server = spawn(process.execPath, [resolve(ROOT, 'tools/serve.mjs'), '--port', String(PORT), '--host', '127.0.0.1'], {
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, LOG: '0' },
});
const stopServer = () => server.kill('SIGTERM');
process.on('exit', stopServer);
process.on('SIGINT', () => {
  stopServer();
  process.exit(130);
});
await new Promise((r) => setTimeout(r, 350));

const consoleErrors = [];
const pageErrors = [];

let browser;
try {
  browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'shell',
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none'],
  });
} catch (err) {
  console.error(paint(31, `\n  could not launch Chromium (${CHROME}): ${err.message}\n`));
  stopServer();
  process.exit(1);
}

const page = await browser.newPage();
await page.setViewport({ width: 412, height: 892, deviceScaleFactor: JPEG ? 1 : 2, isMobile: true, hasTouch: true });
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text());
});
page.on('pageerror', (err) => pageErrors.push(err.message));

const url = `http://127.0.0.1:${PORT}/`;
console.log('');
console.log(`${paint(1, paint(36, 'ESCAPE 99'))} ${paint(2, '— browser smoke test')}`);
console.log(`  ${paint(2, `chromium: ${CHROME}`)}`);
console.log(`  ${paint(2, `serving:  ${url}`)}`);
console.log('');

/**
 * `--tour` is the art review: it loads every shipped room, waits for the intro
 * hint to clear and writes one screenshot per room. Use it after touching
 * rooms, themes or the renderer.
 */
if (TOUR) {
  console.log(`${paint(1, paint(36, 'ESCAPE 99'))} ${paint(2, '— room tour')}\n`);
  mkdirSync(OUT, { recursive: true });
  const ext = JPEG ? 'jpg' : 'png';
  const shotOpts = JPEG ? { type: 'jpeg', quality: 82 } : {};
  const shot = (name) => page.screenshot({ path: resolve(OUT, `${name}.${ext}`), ...shotOpts });
  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 20000 });
  await page.waitForFunction('!!window.__ESCAPE99__', { timeout: 10000 });
  await page.evaluate(() => {
    window.__ESCAPE99__.save.data.progress.seenTutorial = { done: true };
    window.__ESCAPE99__.ui.closeOverlays();
    window.__ESCAPE99__.ui.showMenu();
    window.__ESCAPE99__.save.commit('tour', true);
  });
  await sleep(400);
  await shot('menu-0');
  console.log(`  ${paint(32, '✓')} menu captured`);
  for (let id = 1; id <= 10; id++) {
    // go through the same entry point the PLAY button uses, so the tour shows
    // exactly what a player sees (fade, cleared screen, HUD reset)
    await page.evaluate((room) => window.__ESCAPE99__.ui.startRoom(room), id);
    await sleep(900);
    await shot(`room-${String(id).padStart(2, '0')}`);
    const info = await page.evaluate(() => {
      const g = window.__ESCAPE99__.game;
      return {
        name: g.room.def.name,
        theme: g.room.theme?.name ?? g.room.theme?.key,
        coins: g.room.coins.length,
        gems: g.room.gems.length,
        enemies: g.room.enemies.length,
        spikes: g.room.spikes.length,
        hazards: g.room.spikes.length + g.room.fireJets.length + g.room.lava.length + g.room.fireWalls.length,
        walls: g.room.movingWalls.length,
        chests: g.room.chests.length,
        gates: g.room.gates.length,
      };
    });
    console.log(
      `  ${paint(32, '✓')} ${String(id).padStart(2)} ${(info.name || '').padEnd(22)} ${paint(2, `${info.theme} · ${info.coins} coins · ${info.gems} gems · ${info.enemies} enemies · ${info.hazards} hazards · ${info.walls} walls · ${info.chests} chests · ${info.gates} gates`)}`,
    );
  }
  // and one results screen, so the reward loop is documented too
  await page.evaluate(async () => {
    const g = window.__ESCAPE99__.game;
    const step = (ms) => new Promise((r) => setTimeout(r, ms));
    const walkTo = async (tile) => {
      for (let i = 0; i < 240; i++) {
        const dx = tile.x - g.player.x;
        const dy = tile.y - g.player.y;
        if (Math.abs(dx) + Math.abs(dy) < 0.2) return;
        const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        g.handleMove({ dir, hold: true, released: true });
        await step(16);
      }
    };
    window.__ESCAPE99__.ui.startRoom(1);
    await step(700);
    await walkTo({ x: g.room.key.x, y: g.room.key.y });
    await step(200);
    await walkTo({ x: g.room.exit.x, y: g.room.exit.y });
    for (let i = 0; i < 200 && g.state !== 'REWARD'; i++) await step(16);
  });
  await sleep(700);
  await shot('results-0');
  console.log(`  ${paint(32, '✓')} results screen captured`);
  console.log('');
  console.log(`  ${paint(2, `screenshots: ${OUT}`)}`);
  console.log('');
  if (!KEEP) await browser.close();
  stopServer();
  process.exit(0);
}

/* 1 ─ boot ------------------------------------------------------------------ */
await page.goto(url, { waitUntil: 'load', timeout: 20000 });
await page.waitForSelector('#game', { timeout: 10000 });
await page.waitForFunction('!!window.__ESCAPE99__', { timeout: 10000 });

await check('the page boots and exposes the test hook', () =>
  page.evaluate(() => !!(window.__ESCAPE99__?.game && window.__ESCAPE99__?.ui)),
);
await check('the canvas is sized to the phone viewport', () =>
  page.evaluate(() => {
    const c = document.querySelector('#game');
    return c.width >= 400 && c.height >= 800;
  }),
);
await check('no errors during boot', () => {
  if (pageErrors.length) throw new Error(pageErrors[0]);
  if (consoleErrors.length) throw new Error(consoleErrors[0]);
});

/* 2 ─ boot gate + menu ------------------------------------------------------ */
const gateText = await page.evaluate(() => document.querySelector('#overlays')?.innerText || '');
await check('the one-tap start gate is shown on a fresh save', () => /ESCAPE 99/.test(gateText) && /START/i.test(gateText));

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#overlays .btn')].find((b) => /start/i.test(b.innerText));
  btn?.click();
});
await sleep(320);
await check('the menu appears after tapping start', () =>
  page.evaluate(() => /(^|\n)\s*(PLAY|Escape)/i.test(document.querySelector('#screens')?.innerText || '')),
);

await page.screenshot({ path: resolve(ART, 'smoke-1-menu.png') });

/* 3 ─ start room 1 ---------------------------------------------------------- */
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#screens .btn')].find((b) => /play/i.test(b.innerText));
  btn?.click();
});
await page.waitForFunction('window.__ESCAPE99__.game.state === "PLAYING"', { timeout: 8000 });
await sleep(700);

await check('room 1 loads and starts playing', () =>
  page.evaluate(() => {
    const g = window.__ESCAPE99__.game;
    return g.roomId === 1 && g.state === 'PLAYING' && !!g.room && !!g.player;
  }),
);
await check('the renderer painted real pixels', async () => {
  const distinct = await page.evaluate(() => {
    const c = document.querySelector('#game');
    const { data } = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    const seen = new Set();
    for (let i = 0; i < data.length; i += 4 * 37) seen.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return seen.size;
  });
  if (distinct < 40) throw new Error(`only ${distinct} distinct colours — the canvas looks blank`);
  return true;
});
await check('the HUD shows the right number of hearts and the room', async () => {
  const hud = await page.evaluate(() => {
    const g = window.__ESCAPE99__.game;
    return {
      lit: document.querySelectorAll('#hud-layer .heart.is-on').length,
      hearts: g.player.hearts,
      text: document.querySelector('#hud-layer')?.innerText || '',
    };
  });
  if (hud.lit !== hud.hearts) throw new Error(`${hud.lit} hearts drawn for ${hud.hearts} hearts`);
  if (!/ROOM/i.test(hud.text)) throw new Error('no room label');
  return true;
});
await check('the HUD has no untranslated keys on screen', async () => {
  const text = await page.evaluate(() => document.querySelector('#hud-layer')?.innerText || '');
  const leaked = text.match(/\bt_[a-z_]+\b/g);
  if (leaked) throw new Error(`raw i18n keys visible: ${leaked.join(', ')}`);
  return true;
});

await check('the whole room is framed on screen', async () => {
  const frame = await page.evaluate(() => {
    const { game, renderer } = window.__ESCAPE99__;
    const cam = game.camera;
    const a = renderer.worldToScreen(0, 0, cam);
    const b = renderer.worldToScreen(game.room.W * 34, game.room.H * 34, cam);
    return { a, b, vw: renderer.width, vh: renderer.height, scale: renderer.scale };
  });
  const { a, b, vw, vh } = frame;
  const margin = 2;
  if (a.x < -margin || a.y < -margin) throw new Error(`room starts off-screen at ${a.x},${a.y}`);
  if (b.x > vw + margin || b.y > vh + margin) {
    throw new Error(`room ends off-screen at ${b.x},${b.y} (canvas ${vw}x${vh})`);
  }
  // and it should be roughly centred, not jammed into a corner
  const cx = (a.x + b.x) / 2;
  if (Math.abs(cx - vw / 2) > vw * 0.08) throw new Error(`room is horizontally off-centre (${cx} vs ${vw / 2})`);
  return true;
});

await page.screenshot({ path: resolve(ART, 'smoke-0-room1.png') });

/* 4 ─ input: keyboard walk + a real swipe ----------------------------------- */
const before = await page.evaluate(() => ({ x: window.__ESCAPE99__.game.player.x, y: window.__ESCAPE99__.game.player.y }));
const swipeGeom = await page.evaluate(() => {
  const r = document.querySelector('#game').getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height * 0.62 };
});
// real touch input through CDP — the same path a phone uses
await page.touchscreen.touchStart(swipeGeom.x, swipeGeom.y);
await page.touchscreen.touchMove(swipeGeom.x, swipeGeom.y - 24);
await page.touchscreen.touchMove(swipeGeom.x, swipeGeom.y - 72);
await page.touchscreen.touchEnd();
await sleep(900);
await check('pickups on the floor are actually visible', async () => {
  const result = await page.evaluate(() => {
    const { game, renderer } = window.__ESCAPE99__;
    const c = document.querySelector('#game');
    const ctx = c.getContext('2d');
    const goldNear = (px, py, r) => {
      const s = renderer.worldToScreen(px, py, game.camera);
      const d = ctx.getImageData(Math.round((s.x - r) * renderer.dpr), Math.round((s.y - r) * renderer.dpr), Math.round(2 * r * renderer.dpr), Math.round(2 * r * renderer.dpr)).data;
      let n = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > 150 && d[i + 1] > 110 && d[i + 2] < 130) n++;
      }
      return n;
    };
    const coin = game.room.coins.find((c2) => !c2.dead);
    return {
      coins: game.room.coins.length,
      goldAtCoin: coin ? goldNear(coin.px, coin.py, 12) : -1,
      goldAtKey: game.room.key ? goldNear(game.room.key.px, game.room.key.py, 14) : -1,
    };
  });
  if (!result.coins) throw new Error('room 1 has no coins to check');
  if (result.goldAtCoin < 12) throw new Error(`only ${result.goldAtCoin} gold pixels at the coin (key reads ${result.goldAtKey})`);
  return true;
});

await check('a swipe moves Arin', () =>
  page.evaluate(
    (b) => {
      const p = window.__ESCAPE99__.game.player;
      return Math.abs(p.x - b.x) + Math.abs(p.y - b.y) > 0.4;
    },
    before,
  ),
);

await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#screens .btn')].find((b) => /^play$/i.test(b.innerText.trim()));
  btn?.click();
});
await sleep(200);

/* 5 ─ every menu screen renders --------------------------------------------- */
const screens = ['showWorldMap', 'showHeroes', 'showUpgrades', 'showChallenges', 'showRewards', 'showSettings', 'showHowTo'];
await check('every menu screen renders without errors', () => {
  const errors = [];
  for (const fn of screens) {
    const r = page.evaluate((f) => {
      try {
        window.__ESCAPE99__.ui[f]();
        const n = document.querySelector('#screens')?.children.length || 0;
        window.__ESCAPE99__.ui.showMenu();
        return n;
      } catch (err) {
        return `ERR ${err.message}`;
      }
    }, fn);
    if (typeof r === 'string' || r === 0) errors.push(`${fn}: ${r}`);
  }
  return errors.length === 0 || (() => { throw new Error(errors.join('; ')); })();
});
await sleep(150);

/* 6 ─ language switch ------------------------------------------------------- */
const hindi = await page.evaluate(async () => {
  const { i18n, ui } = window.__ESCAPE99__;
  i18n.setLanguage('hi');
  ui.showMenu();
  const t = document.querySelector('#screens')?.innerText || '';
  i18n.setLanguage('en');
  ui.showMenu();
  return t;
});
await check('the whole menu can switch to Hindi', () => /[\u0900-\u097F]/.test(hindi));
await sleep(120);

/* 7 ─ a real death, a real restart, inside the 2 second budget -------------- */
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#screens .btn')].find((b) => /play/i.test(b.innerText));
  btn?.click();
});
await page.waitForFunction('window.__ESCAPE99__.game.state === "PLAYING"', { timeout: 8000 });
await sleep(400);
const deathStart = Date.now();
await page.evaluate(() => {
  const g = window.__ESCAPE99__.game;
  g.player.invuln = 0;
  g.player.damage(99, 'spikes', g._ctx());
});
await page.waitForFunction('window.__ESCAPE99__.game.player.dead === true', { timeout: 4000 });
await check('dying stops the run', async () => {
  const g = await page.evaluate(() => ({ dead: window.__ESCAPE99__.game.player.dead, state: window.__ESCAPE99__.game.state }));
  if (!g.dead) throw new Error('player is not dead');
  return true;
});
await page.waitForFunction(
  () => /again|retry|restart/i.test(document.querySelector('#overlays')?.innerText || ''),
  { timeout: 4000 },
);
await check('the death screen offers a one-tap retry', async () => {
  const t = await page.evaluate(() => document.querySelector('#overlays')?.innerText || '');
  if (!/again|retry|restart/i.test(t)) throw new Error('no retry button');
  return true;
});
await page.screenshot({ path: resolve(ART, 'smoke-2-death.png') });

// the two-second promise is about the time *after* the player taps retry
const tapAt = Date.now();
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('#overlays .btn')].find((b) => /again|retry|restart/i.test(b.innerText));
  btn?.click();
});
const back = await page
  .waitForFunction('window.__ESCAPE99__.game.state === "PLAYING"', { timeout: 3000 })
  .then(() => true)
  .catch(() => false);
const restartMs = Date.now() - tapAt;
await check(`retry puts you back in the room and it takes under 2s (${restartMs}ms)`, () => {
  if (!back) throw new Error('never returned to PLAYING');
  return restartMs < 2000;
});
void deathStart;

/* 8 ─ escape a room end-to-end ---------------------------------------------- */
const escaped = await page.evaluate(async () => {
  const g = window.__ESCAPE99__.game;
  const step = (ms) => new Promise((r) => setTimeout(r, ms));
  const walkTo = async (tile) => {
    for (let i = 0; i < 240; i++) {
      const dx = tile.x - g.player.x;
      const dy = tile.y - g.player.y;
      if (Math.abs(dx) + Math.abs(dy) < 0.2) return true;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      g.handleMove({ dir, hold: true, released: true });
      await step(16);
    }
    return false;
  };
  await walkTo({ x: g.room.key.x, y: g.room.key.y });
  await step(120);
  await walkTo({ x: g.room.exit.x, y: g.room.exit.y });
  for (let i = 0; i < 200 && g.state !== 'REWARD'; i++) await step(16);
  return { state: g.state, stars: g.results?.stars ?? null, roomId: g.roomId };
});
await check('a room can be escaped and pays out a result screen', () =>
  escaped.state === 'REWARD' || (() => { throw new Error(`state was ${escaped.state}`); })());
await check('the results screen shows stars', () =>
  page.evaluate(() => {
    const t = document.querySelector('#overlays')?.innerText || '';
    return /ESCAPED|★|★|✩/i.test(t);
  }),
);
await page.screenshot({ path: resolve(ART, 'smoke-3-results.png') });

/* 9 ─ persistence + service worker ----------------------------------------- */
await check('progress is written to localStorage', async () => {
  const raw = await page.evaluate(() => localStorage.getItem('escape99.save.v2'));
  if (!raw) throw new Error('nothing saved');
  const data = JSON.parse(raw);
  if (!data?.progress?.rooms?.[1]) throw new Error('room 1 result missing');
  return true;
});
const swReady = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.ready;
    return !!reg?.active || 'installing';
  } catch (err) {
    return `ERR ${err.message}`;
  }
});
await check(`the offline service worker registers (${swReady})`, () => swReady === true || swReady === 'installing');

/* 10 ─ no runaway errors during the whole session --------------------------- */
await check('no console errors for the whole session', () => {
  if (pageErrors.length) throw new Error(pageErrors[0]);
  if (consoleErrors.length) throw new Error(consoleErrors.join(' | '));
});

/* ─────────────────────────────────── wrap ────────────────────────────────── */

if (!KEEP) await browser.close();
stopServer();

console.log('');
console.log(`  ${state.pass} passed, ${state.fail} failed`);
console.log(`  ${paint(2, `screenshots: ${ART}`)}`);
console.log('');
process.exit(state.fail ? 1 : 0);
