/**
 * ESCAPE 99 — core utilities
 * Tiny, dependency-free helpers shared by logic + rendering.
 * NOTE: this file must stay DOM-free so it can run in Node (tests, bots).
 */

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const sign = (v) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
export const manhattan = (x1, y1, x2, y2) => Math.abs(x2 - x1) + Math.abs(y2 - y1);
export const approach = (v, target, delta) =>
  v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
export const mod = (n, m) => ((n % m) + m) % m;

/* ---------------------------------- easing --------------------------------- */
export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t ** 3,
  outQuart: (t) => 1 - (1 - t) ** 4,
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const p = 0.38;
    return 2 ** (-9 * t) * Math.sin(((t - p / 4) * TAU) / p) + 1;
  },
  outBounce: (t) => {
    const n = 7.5625,
      d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  // smooth 0->1->0 pulse
  pulse: (t) => Math.sin(clamp(t, 0, 1) * Math.PI),
};

/* ---------------------------------- random --------------------------------- */
/** Deterministic, fast, seedable PRNG (mulberry32). */
export function makeRng(seed = Date.now()) {
  let a = seed >>> 0;
  const rnd = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rnd.int = (min, max) => Math.floor(rnd() * (max - min + 1)) + min;
  rnd.range = (min, max) => rnd() * (max - min) + min;
  rnd.pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  rnd.chance = (p) => rnd() < p;
  rnd.shuffle = (arr) => {
    const a2 = arr.slice();
    for (let i = a2.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a2[i], a2[j]] = [a2[j], a2[i]];
    }
    return a2;
  };
  rnd.weighted = (items, weightOf = (i) => i.weight ?? 1) => {
    let total = 0;
    for (const it of items) total += weightOf(it);
    let roll = rnd() * total;
    for (const it of items) {
      roll -= weightOf(it);
      if (roll <= 0) return it;
    }
    return items[items.length - 1];
  };
  rnd.seed = () => a >>> 0;
  return rnd;
}

export const rng = makeRng(1337);

/* -------------------------------- formatting ------------------------------- */
export function formatTime(seconds) {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
}
export function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + 'M';
  if (n >= 10_000) return (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'K';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
export function formatScore(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/* ------------------------------ tiny event bus ----------------------------- */
export class Emitter {
  constructor() {
    this._map = new Map();
  }
  on(name, fn) {
    if (!this._map.has(name)) this._map.set(name, new Set());
    this._map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) {
    this._map.get(name)?.delete(fn);
  }
  emit(name, ...args) {
    const set = this._map.get(name);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(...args);
      } catch (err) {
        console.error(`[emitter:${name}]`, err);
      }
    }
  }
}

/* ------------------------------- grid helpers ------------------------------ */
export const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};
export const DIR_LIST = ['up', 'right', 'down', 'left'];

export function dirFromVector(x, y) {
  if (Math.abs(x) > Math.abs(y)) return x > 0 ? 'right' : 'left';
  if (y !== 0) return y > 0 ? 'down' : 'up';
  return null;
}
export function oppositeDir(dir) {
  return { up: 'down', down: 'up', left: 'right', right: 'left' }[dir];
}

/**
 * Breadth-first search over a walkable grid. Used by the level validator,
 * the endless-mode generator and the optional "hint arrow" accessibility aid.
 * @param {number} w @param {number} h
 * @param {(x:number,y:number)=>boolean} walkable
 * @returns {(sx:number,sy:number,tx:number,ty:number)=>({x:number,y:number}[]|null)}
 */
export function makePathfinder(w, h, walkable) {
  return function findPath(sx, sy, tx, ty) {
    if (sx === tx && sy === ty) return [];
    const seen = new Uint8Array(w * h);
    const prev = new Int32Array(w * h).fill(-1);
    const queue = [sy * w + sx];
    seen[sy * w + sx] = 1;
    let head = 0;
    while (head < queue.length) {
      const cur = queue[head++];
      const cx = cur % w,
        cy = (cur / w) | 0;
      for (const d of DIR_LIST) {
        const { x: dx, y: dy } = DIRS[d];
        const nx = cx + dx,
          ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const idx = ny * w + nx;
        if (seen[idx]) continue;
        if (!walkable(nx, ny) && !(nx === tx && ny === ty)) continue;
        seen[idx] = 1;
        prev[idx] = cur;
        if (nx === tx && ny === ty) {
          const path = [];
          let node = idx;
          while (node !== -1 && node !== sy * w + sx) {
            path.push({ x: node % w, y: (node / w) | 0 });
            node = prev[node];
          }
          return path.reverse();
        }
        queue.push(idx);
      }
    }
    return null;
  };
}

/* ------------------------------ DOM friendly ------------------------------- */
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) if (c) node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return node;
}

/** Screenshot/eyeball friendly storage wrapper (Safari private mode safety). */
export const storage = {
  get(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  },
};
