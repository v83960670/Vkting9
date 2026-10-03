/**
 * ESCAPE 99 — world themes.
 * Each world = one palette + one hazard flavour + one music track.
 * World 1 is fully playable in this build; the rest ship as their rooms are
 * authored (world 2+ palettes are already wired into Endless Escape).
 */

export const WORLDS = [
  {
    id: 1,
    key: 'temple',
    name: 'FORGOTTEN TEMPLE',
    rooms: [1, 10],
    icon: '🏛️',
    blurb: 'Dust, torchlight and traps that still work.',
    music: 'temple',
    palette: {
      bg: '#1b1410',
      floor: '#cbae83',
      floorAlt: '#c2a478',
      floorLine: '#a98a63',
      wall: '#84663f',
      wallTop: '#a3814f',
      wallEdge: '#5d4729',
      accent: '#2fb7a8',
      accentSoft: '#7fe3d6',
      glow: '#ffca62',
      fog: 'rgba(28,18,10,0.55)',
    },
  },
  {
    id: 2,
    key: 'lava',
    name: 'LAVA CAVES',
    rooms: [11, 20],
    icon: '🌋',
    blurb: 'The floor remembers being fire.',
    music: 'lava',
    palette: { bg: '#180c0a', floor: '#6b4038', floorAlt: '#5d3730', floorLine: '#4a2b26', wall: '#3d2320', wallTop: '#572f28', wallEdge: '#271614', accent: '#ff7a33', accentSoft: '#ffc07a', glow: '#ff5a1f', fog: 'rgba(24,8,4,0.6)' },
  },
  {
    id: 3,
    key: 'fortress',
    name: 'HAUNTED FORTRESS',
    rooms: [21, 30],
    icon: '🏰',
    blurb: 'Cold stone. Colder guests.',
    music: 'fortress',
    palette: { bg: '#101425', floor: '#5c6480', floorAlt: '#525a75', floorLine: '#434a63', wall: '#333a55', wallTop: '#454d6d', wallEdge: '#21263c', accent: '#8ce0ff', accentSoft: '#c9f2ff', glow: '#a6b8ff', fog: 'rgba(8,10,24,0.6)' },
  },
  {
    id: 4,
    key: 'jungle',
    name: 'JUNGLE RUINS',
    rooms: [31, 40],
    icon: '🌿',
    blurb: 'Vines are the least of it.',
    music: 'jungle',
    palette: { bg: '#0d1a12', floor: '#7f9a5c', floorAlt: '#748f54', floorLine: '#5f7745', wall: '#425c34', wallTop: '#57713f', wallEdge: '#2c3f24', accent: '#ffd45e', accentSoft: '#ffeaa8', glow: '#b6f06a', fog: 'rgba(8,22,12,0.5)' },
  },
  {
    id: 5,
    key: 'frost',
    name: 'FROZEN VAULT',
    rooms: [41, 50],
    icon: '❄️',
    blurb: 'Everything here is waiting to shatter.',
    music: 'frost',
    palette: { bg: '#0b1622', floor: '#a9c8dc', floorAlt: '#9cbdd4', floorLine: '#84a6be', wall: '#5a7a96', wallTop: '#7395b1', wallEdge: '#3f5a72', accent: '#8ce0ff', accentSoft: '#e6f9ff', glow: '#c9f2ff', fog: 'rgba(10,26,38,0.45)' },
  },
  {
    id: 6,
    key: 'clockwork',
    name: 'CLOCKWORK FACTORY',
    rooms: [51, 60],
    icon: '⚙️',
    blurb: 'Every gear is a countdown.',
    music: 'clockwork',
    palette: { bg: '#171310', floor: '#94795a', floorAlt: '#87704f', floorLine: '#6d5a40', wall: '#5a4732', wallTop: '#755d42', wallEdge: '#3a2d20', accent: '#ffb03d', accentSoft: '#ffe1a8', glow: '#ffd45e', fog: 'rgba(26,18,10,0.5)' },
  },
  {
    id: 7,
    key: 'desert',
    name: 'DESERT TOMB',
    rooms: [61, 70],
    icon: '🏜️',
    blurb: 'Sand gets everywhere. So do the traps.',
    music: 'desert',
    palette: { bg: '#241a10', floor: '#e0c48f', floorAlt: '#d6b982', floorLine: '#c0a26c', wall: '#a98650', wallTop: '#c9a466', wallEdge: '#7b5f36', accent: '#3fa9d6', accentSoft: '#9ee0ff', glow: '#ffd45e', fog: 'rgba(38,24,10,0.45)' },
  },
  {
    id: 8,
    key: 'shadow',
    name: 'SHADOW CASTLE',
    rooms: [71, 80],
    icon: '🌑',
    blurb: 'The dark here takes notes.',
    music: 'shadow',
    palette: { bg: '#0d0a15', floor: '#3f3552', floorAlt: '#382e49', floorLine: '#2f2739', wall: '#241d33', wallTop: '#332a45', wallEdge: '#161122', accent: '#b06bff', accentSoft: '#e0c9ff', glow: '#b06bff', fog: 'rgba(6,4,12,0.62)' },
  },
  {
    id: 9,
    key: 'sky',
    name: 'SKY TEMPLE',
    rooms: [81, 90],
    icon: '☁️',
    blurb: 'One wrong step and it is a long way down.',
    music: 'sky',
    palette: { bg: '#122036', floor: '#cfe3f5', floorAlt: '#c2d9ef', floorLine: '#a4bdda', wall: '#7d9cc0', wallTop: '#9db9d8', wallEdge: '#5b7797', accent: '#ffd45e', accentSoft: '#fff0b8', glow: '#fff2b0', fog: 'rgba(18,32,54,0.35)' },
  },
  {
    id: 10,
    key: 'final',
    name: 'THE 99TH DUNGEON',
    rooms: [91, 99],
    icon: '💀',
    blurb: 'Ninety-eight rooms were the tutorial.',
    music: 'final',
    palette: { bg: '#0a0b10', floor: '#4a4f61', floorAlt: '#424757', floorLine: '#343949', wall: '#23263a', wallTop: '#323751', wallEdge: '#141727', accent: '#ff5470', accentSoft: '#ffb3c1', glow: '#ff5470', fog: 'rgba(4,5,10,0.65)' },
  },
];

export const WORLD_SIZE = 10;
export const worldForRoom = (room) => Math.min(10, Math.ceil(Math.max(1, room) / WORLD_SIZE));
export const themeForRoom = (room) => WORLDS[worldForRoom(room) - 1];
export const themeByKey = (key) => WORLDS.find((w) => w.key === key) || WORLDS[0];
export default WORLDS;
