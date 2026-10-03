/**
 * ESCAPE 99 — ROOMS 1..10 (World 1: Forgotten Temple)
 *
 * ── TILE LEGEND ─────────────────────────────────────────────────────────────
 *  .  floor                 #  wall                B  stone block (cover)
 *  S  Arin spawn            K  golden key          E  exit door
 *  c  coin                  G  gem                 T  treasure chest
 *  ^  spike trap (phase 0)  v  spike trap (phase .5)
 *  F  fire jet (cycles)     ~  lava (always lethal)
 *  O  floor switch          -  gate (opens when every switch is pressed)
 *  s  slime guard           M  sword pickup        H  secret door (looks like wall)
 *  D  door-lock plate (invisible trigger floor)
 *  1  shield      2  magnet    3  speed boots   4  freeze
 *  5  ghost       6  double $  7  fire sword
 * ────────────────────────────────────────────────────────────────────────────
 * Every room is data-driven: new rooms are a map + a list of components.
 */

const W = 12; // grid width  (portrait 9:16 friendly)
const H = 20; // grid height

/** Reusable defaults so a one-line room is still readable by the systems. */
const base = {
  theme: 'temple',
  timer: { type: 'none' }, // none | optional | countdown
  spikePeriod: 1.5,
  palettes: null,
};

export const ROOMS = [
  /* ══════════════════════════ ROOM 1 — THE FIRST KEY ══════════════════════ */
  {
    ...base,
    id: 1,
    name: 'THE FIRST KEY',
    purpose: 'Teach movement.',
    difficulty: 1,
    par: { time: 20, coins: 5 },
    challenge: { id: 'no_damage', type: 'noDamage', text: 'Finish without taking damage', short: 'NO DAMAGE' },
    teach: {
      intro: { text: 't_swipe', sub: 't_swipe_sub', duration: 3.4, ghost: true },
      onKey: { text: 't_key_found', duration: 1.4 },
      onExitOpen: { text: 't_exit_open', duration: 1.6 },
    },
    reward: { coins: 20 },
    map: [
      '############',
      '#..........#',
      '#....c.....#',
      '#....K.....#',
      '#..c...c...#',
      '#..........#',
      '##........##',
      '##...c....##',
      '#....S.....#',
      '#..........#',
      '##........##',
      '#.....c....#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#....E.....#',
      '#..........#',
      '#..........#',
      '#..........#',
      '############',
    ],
  },

  /* ═════════════════════════ ROOM 2 — WATCH YOUR STEP ═════════════════════ */
  {
    ...base,
    id: 2,
    name: 'WATCH YOUR STEP',
    purpose: 'Introduce spike traps that pulse on a timer.',
    difficulty: 1,
    par: { time: 30, coins: 6 },
    spikePeriod: 1.5,
    challenge: { id: 'time_30', type: 'time', value: 30, text: 'Escape in under 30s', short: '< 30s' },
    teach: {
      intro: { text: 't_watch_step', duration: 2.2 },
      cycle: { wait: 't_wait', go: 't_go' }, // WAIT… → GO! loops with the spikes near spawn
    },
    reward: { coins: 25 },
    map: [
      '############',
      '#E....c..K.#',
      '#..........#',
      '#^^^^^^.^^.#',
      '#....c.....#',
      '#..........#',
      '#..c....c..#',
      '#^^^.^^^^^^#',
      '#..........#',
      '#....c.....#',
      '#..........#',
      '#..c....c..#',
      '#^^^^^^^vv.#',
      '#..........#',
      '#....c.....#',
      '#..........#',
      '#..........#',
      '#.....c....#',
      '#....S.....#',
      '############',
    ],
  },

  /* ═══════════════════════════ ROOM 3 — THE MOVING GUARD ══════════════════ */
  {
    ...base,
    id: 3,
    name: 'THE MOVING GUARD',
    purpose: 'First enemy. Risk vs reward with the hidden gem.',
    difficulty: 1,
    par: { time: 30, coins: 7 },
    challenge: { id: 'gem', type: 'gem', text: 'Find the hidden gem', short: 'HIDDEN GEM' },
    teach: {
      intro: { text: 't_avoid_slime', duration: 2.2 },
      onGem: { text: 't_gem_found', duration: 1.4 },
    },
    reward: { coins: 30 },
    enemies: [{ x: 5, y: 7, type: 'slime', axis: 'x', range: 8, speed: 1.7 }],
    map: [
      '############',
      '#.....c....#',
      '#....K.....#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#G...s.....#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#S.......E.#',
      '############',
    ],
  },

  /* ═════════════════════════════ ROOM 4 — TWO SWITCHES ════════════════════ */
  {
    ...base,
    id: 4,
    name: 'TWO SWITCHES',
    purpose: 'Introduce switches, gates and the optional star timer.',
    openExit: true, // the gate is the lock here, not a key
    difficulty: 2,
    par: { time: 40, coins: 6 },
    timer: { type: 'optional', seconds: 35 },
    spikePeriod: 1.6,
    challenge: { id: 'time_35', type: 'time', value: 35, text: 'Escape in under 35s', short: '< 35s' },
    teach: {
      intro: { text: 't_press_button', duration: 2.4 },
      onSwitch: { text: 't_switch', duration: 1.1 },
      onGateOpen: { text: 't_gate_open', duration: 1.6 },
    },
    reward: { coins: 35 },
    map: [
      '############',
      '#....E.....#',
      '#####-######',
      '#..........#',
      '#..c....c..#',
      '#.^^^..^^^.#',
      '#..........#',
      '#O.........#',
      '#..........#',
      '#..c....c..#',
      '#.^^^^^^^^.#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#.^^^^^^^^.#',
      '#..........#',
      '#.........O#',
      '#..........#',
      '#....S.....#',
      '############',
    ],
  },

  /* ═══════════════════════════ ROOM 5 — RUN FROM FIRE ═════════════════════ */
  {
    ...base,
    id: 5,
    name: 'RUN FROM FIRE',
    purpose: 'First adrenaline room: a fire wall hunts you after the key.',
    difficulty: 2,
    par: { time: 32, coins: 9 },
    timer: { type: 'optional', seconds: 45 },
    challenge: { id: 'no_damage', type: 'noDamage', text: 'Outrun the fire without taking damage', short: 'NO DAMAGE' },
    teach: {
      onKey: { text: 't_fire_wall', duration: 1.8 },
      cycle: { wait: 't_keep_going', go: 't_keep_going', every: 4 },
    },
    reward: { coins: 40 },
    fireWalls: [{ dir: 'right', speed: 2.35, startAt: 'onKey', delay: 0.9, from: 'left' }],
    map: [
      '############',
      '#.S........#',
      '#..........#',
      '#....##....#',
      '#..........#',
      '#K.........#',
      '#..........#',
      '#..c..c..c.#',
      '#....##....#',
      '#..........#',
      '#..c..c..c.#',
      '#..........#',
      '#...#..#...#',
      '#..........#',
      '#..c..c..c.#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#.........E#',
      '############',
    ],
  },

  /* ═════════════════════════════ ROOM 6 — SWORD ROOM ══════════════════════ */
  {
    ...base,
    id: 6,
    name: 'SWORD ROOM',
    purpose: 'Discover the basic sword. Simple, satisfying combat.',
    difficulty: 2,
    par: { time: 35, coins: 4 },
    timer: { type: 'optional', seconds: 50 },
    challenge: { id: 'all_enemies', type: 'allEnemies', text: 'Defeat all three slimes', short: 'DEFEAT ALL' },
    teach: {
      intro: { text: 't_sword_room', duration: 2.4 },
      onSword: { text: 't_tap_attack', duration: 2.2 },
    },
    reward: { coins: 45 },
    grants: { sword: true },
    enemies: [
      { x: 3, y: 3, type: 'slime', axis: 'x', range: 3, speed: 1.9 },
      { x: 8, y: 3, type: 'slime', axis: 'x', range: 2, speed: 2.1 },
      { x: 5, y: 6, type: 'slime', axis: 'x', range: 5, speed: 1.8 },
    ],
    map: [
      '############',
      '#K........E#',
      '#..........#',
      '#..s....s..#',
      '#..........#',
      '#..........#',
      '#.....s....#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#....M.....#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#....S.....#',
      '############',
    ],
  },

  /* ══════════════════════════ ROOM 7 — TREASURE OR ESCAPE? ════════════════ */
  {
    ...base,
    id: 7,
    name: 'TREASURE OR ESCAPE?',
    purpose: 'A real choice: leave safely, or risk the chest.',
    openExit: true, // the exit is deliberately free: the risk is the treasure
    difficulty: 3,
    par: { time: 40, coins: 5 },
    timer: { type: 'optional', seconds: 55 },
    challenge: { id: 'chest', type: 'chest', text: 'Open the treasure chest', short: 'TREASURE' },
    teach: {
      onZone: { zone: { x: 3, y: 11, w: 6, h: 2 }, text: 't_treasure', duration: 2.0 },
      onChest: { text: 't_chest', duration: 1.6 },
    },
    reward: { coins: 50 },
    map: [
      '############',
      '#..c....c..#',
      '#..........#',
      '#....E.....#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#....S.....#',
      '#..........#',
      '#..........#',
      '#####..#####',
      '#.3........#',
      '#.^^^..^^^.#',
      '#..........#',
      '#.^^^..^^^.#',
      '#..........#',
      '#.FF....FF.#',
      '#....T.....#',
      '############',
    ],
  },

  /* ═══════════════════════════ ROOM 8 — THE MAZE MOVES ════════════════════ */
  {
    ...base,
    id: 8,
    name: 'THE MAZE MOVES',
    purpose: 'Move with the room. Walls rearrange on a 5 second beat.',
    difficulty: 3,
    par: { time: 45, coins: 4 },
    timer: { type: 'optional', seconds: 60 },
    challenge: { id: 'gem', type: 'gem', text: 'Find the secret chamber gem', short: 'HIDDEN GEM' },
    teach: {
      intro: { text: 't_walls_move', duration: 2.4 },
      onWallsMove: { text: 't_walls_move', duration: 1.0 },
    },
    reward: { coins: 55 },
    movingWalls: [
      {
        id: 'pillarWest',
        period: 5,
        warn: 1.1,
        slide: 0.75,
        positions: [
          [[3, 6], [3, 7], [3, 8], [3, 9]],
          [[5, 6], [5, 7], [5, 8], [5, 9]],
        ],
      },
      {
        id: 'wallSouth',
        period: 5,
        warn: 1.1,
        slide: 0.75,
        phase: 0.5,
        positions: [
          [[2, 13], [3, 13], [4, 13], [5, 13]],
          [[2, 15], [3, 15], [4, 15], [5, 15]],
        ],
      },
    ],
    map: [
      '############',
      '#GG#.......#',
      '#..#....c..#',
      '##H#.......#',
      '#.........K#',
      '#..........#',
      '#..........#',
      '#c......c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#S........E#',
      '############',
    ],
  },

  /* ═══════════════════════ ROOM 9 — EVERYTHING TOGETHER ═══════════════════ */
  {
    ...base,
    id: 9,
    name: 'EVERYTHING TOGETHER',
    purpose: 'No new mechanics. Prove what you have learned.',
    difficulty: 4,
    par: { time: 60, coins: 6 },
    timer: { type: 'optional', seconds: 75 },
    spikePeriod: 1.6,
    challenge: { id: 'chest', type: 'chest', text: 'Open the treasure chest', short: 'TREASURE' },
    teach: {
      intro: { text: 't_press_button', duration: 2.2 },
      onKey: { text: 't_fire_wall', duration: 1.8 },
      onGateOpen: { text: 't_gate_open', duration: 1.4 },
    },
    reward: { coins: 70, bigChest: true },
    enemies: [
      { x: 3, y: 11, type: 'slime', axis: 'x', range: 3, speed: 2.0 },
      { x: 8, y: 11, type: 'slime', axis: 'x', range: 2, speed: 2.2 },
    ],
    fireWalls: [{ dir: 'left', speed: 2.2, startAt: 'onKey', delay: 1.1, from: 'right' }],
    map: [
      '############',
      '#....E.....#',
      '#####-######',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#O.........#',
      '#..........#',
      '#.^^^..^^^.#',
      '#..........#',
      '#..........#',
      '#..s....s..#',
      '#..........#',
      '#.........K#',
      '#..........#',
      '#.^^^..^^^.#',
      '#.........1#',
      '#........T.#',
      '#....S.....#',
      '############',
    ],
  },

  /* ═════════════════════════════ ROOM 10 — FIRST BOSS ═════════════════════ */
  {
    ...base,
    id: 10,
    name: 'THE STONE GUARDIAN',
    purpose: 'Boss: dodge three patterns, punish the stun, then run.',
    difficulty: 5,
    isBoss: true,
    par: { time: 95, coins: 4 },
    timer: { type: 'none' }, // the countdown starts with the escape phase
    challenge: { id: 'no_damage', type: 'noDamage', text: 'Beat the Guardian without damage', short: 'NO DAMAGE' },
    teach: {
      intro: { text: 't_boss_incoming', duration: 2.6 },
      onStun: { text: 't_boss_stunned', duration: 1.4 },
      onEscapePhase: { text: 't_escape_now', duration: 2.2 },
    },
    reward: { coins: 200, gems: 5, bossChest: true, skin: 'shadow' },
    boss: {
      type: 'stone_guardian',
      hp: 3,
      spawn: { x: 5, y: 4 },
      stunTime: 3.0,
      escape: { seconds: 30, lava: true, lavaSpeed: 0.62 },
      patterns: ['slam', 'rocks', 'charge'],
      rocks: { count: 6, warn: 1.0 },
      charge: { warn: 0.9, speed: 9.5 },
      slam: { warn: 1.0, radius: 2.1, count: 2 },
    },
    map: [
      '############',
      '#....E.....#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..B....B..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#..c....c..#',
      '#..........#',
      '#..........#',
      '#..........#',
      '#....S.....#',
      '#..........#',
      '#..........#',
      '############',
    ],
  },
];

/* --------------------------------- helpers -------------------------------- */
export const ROOM_COUNT = 99;
export const getRoom = (id) => ROOMS.find((r) => r.id === id) || null;
export const isPlayable = (id) => !!getRoom(id);
export const firstPlayable = 1;
export const lastPlayable = ROOMS.length;
export const GRID = { W, H };

/** Power-up tile digit -> kind. */
export const POWERUP_TILES = {
  1: 'shield',
  2: 'magnet',
  3: 'speed',
  4: 'freeze',
  5: 'ghost',
  6: 'double',
  7: 'fireSword',
};

export const TILE = {
  FLOOR: '.',
  WALL: '#',
  BLOCK: 'B',
  SPAWN: 'S',
  KEY: 'K',
  EXIT: 'E',
  COIN: 'c',
  GEM: 'G',
  CHEST: 'T',
  SPIKE: '^',
  SPIKE_ALT: 'v',
  FIRE: 'F',
  LAVA: '~',
  SWITCH: 'O',
  GATE: '-',
  SLIME: 's',
  SWORD: 'M',
  SECRET: 'H',
};

export default ROOMS;
