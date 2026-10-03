#!/usr/bin/env node
/**
 * ESCAPE 99 — zero-dependency dev server.
 *
 *   node tools/serve.mjs            http://localhost:8080
 *   node tools/serve.mjs --port 5000
 *   node tools/serve.mjs --host 0.0.0.0
 *
 * The game is a static folder of ES modules, so this only needs to hand out
 * files with the right MIME types and never cache anything (so a save/reload
 * always shows the latest code). Handy for testing on a real phone over Wi-Fi.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
};
const PORT = Number(arg('port', process.env.PORT || 8080));
const HOST = arg('host', '0.0.0.0');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (req, res) => {
  const started = Date.now();
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    // never let anyone climb out of the project folder
    const target = normalize(join(ROOT, path));
    if (!target.startsWith(ROOT)) throw new Error('forbidden');
    let file = target;
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    } catch {
      const err = new Error('not found');
      err.code = 'ENOENT';
      throw err;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': body.length,
      'cache-control': 'no-store',
      // needed if you ever embed the game in an iframe / share screen
      'access-control-allow-origin': '*',
    });
    res.end(body);
    if (process.env.LOG !== '0') {
      console.log(`  ${String(res.statusCode)} ${req.method} ${path} ${((Date.now() - started) / 1).toFixed(0)}ms`);
    }
  } catch (err) {
    const code = err.code === 'ENOENT' ? 404 : err.message === 'forbidden' ? 403 : 500;
    res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(code === 404 ? 'not found' : 'error');
    if (process.env.LOG !== '0') console.log(`  ${code} ${req.method} ${req.url}`);
  }
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log(`  ESCAPE 99 is being served from ${ROOT}`);
  console.log(`  ▸ http://localhost:${PORT}`);
  if (HOST === '0.0.0.0') {
    console.log('  ▸ reachable from your phone on the same Wi-Fi (use your computer\'s LAN IP)');
  }
  console.log('');
});
