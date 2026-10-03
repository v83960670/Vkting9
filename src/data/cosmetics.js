/**
 * ESCAPE 99 — cosmetic catalogue.
 * Characters are 100% cosmetic: they differ in silhouette, palette, accessory
 * and trail — never in power. Everything is drawn procedurally by arin.js, so
 * the whole catalogue costs zero download bytes.
 */

/** Shared palette keys used by the character renderer. */
export const CHARACTERS = [
  {
    id: 'arin',
    name: 'ARIN',
    title: 'Explorer',
    price: 0,
    currency: 'coins',
    rarity: 'common',
    body: 'round',
    accessory: 'scarf',
    palette: { skin: '#f0b889', skinShade: '#d09468', hair: '#4a2c17', shirt: '#1f9c96', shirtDark: '#12726e', pants: '#3b3f52', boots: '#6b4a2c', scarf: '#e8542f', scarfDark: '#b93b1c', buckle: '#f6c445' },
    blurb: 'Brave, curious, slightly mischievous.',
    unlockHint: 'Starter hero',
  },
  {
    id: 'meera',
    name: 'MEERA',
    title: 'Adventurer',
    price: 0,
    currency: 'coins',
    rarity: 'common',
    body: 'round',
    accessory: 'braid',
    palette: { skin: '#d99a6c', skinShade: '#b87b52', hair: '#1d1410', shirt: '#e0567a', shirtDark: '#b23c5c', pants: '#2f3547', boots: '#5c3f26', scarf: '#f0c04a', scarfDark: '#c99b23', buckle: '#f6c445' },
    blurb: 'Maps every room before she moves.',
    unlockHint: 'Starter hero',
  },
  {
    id: 'kabir',
    name: 'KABIR',
    title: 'Rogue',
    price: 900,
    currency: 'coins',
    rarity: 'rare',
    body: 'slim',
    accessory: 'hood',
    palette: { skin: '#c98a5d', skinShade: '#a56b44', hair: '#12100f', shirt: '#3d4b8f', shirtDark: '#2a3568', pants: '#22263a', boots: '#2b2b33', scarf: '#8ce0ff', scarfDark: '#4bb2d6', buckle: '#cfd6e6' },
    blurb: 'Never seen. Never caught.',
    unlockHint: '900 coins',
  },
  {
    id: 'tara',
    name: 'TARA',
    title: 'Mage',
    price: 1100,
    currency: 'coins',
    rarity: 'rare',
    body: 'round',
    accessory: 'hat',
    palette: { skin: '#f2c39b', skinShade: '#d29b74', hair: '#7a3f1e', shirt: '#7a52d1', shirtDark: '#53369c', pants: '#3a2b63', boots: '#4a3a2a', scarf: '#c9a6ff', scarfDark: '#8f6fd6', buckle: '#ffd45e' },
    blurb: 'Reads runes. Talks to doors.',
    unlockHint: '1100 coins',
  },
  {
    id: 'bolt',
    name: 'BOLT',
    title: 'Robot',
    price: 12,
    currency: 'gems',
    rarity: 'epic',
    body: 'boxy',
    accessory: 'antenna',
    palette: { skin: '#cfd8e3', skinShade: '#9aa6b5', hair: '#8f9cad', shirt: '#4a6fa5', shirtDark: '#33507c', pants: '#2f3a4c', boots: '#39424f', scarf: '#6ff0d0', scarfDark: '#2fb79a', buckle: '#ffe066' },
    blurb: 'Beeps in ancient languages.',
    unlockHint: '12 gems',
  },
  {
    id: 'momo',
    name: 'MOMO',
    title: 'Tiny Monster',
    price: 8,
    currency: 'gems',
    rarity: 'epic',
    body: 'blob',
    accessory: 'horns',
    palette: { skin: '#8fdc6a', skinShade: '#63b243', hair: '#3f7a2a', shirt: '#f2a03d', shirtDark: '#c97a1f', pants: '#5a4a34', boots: '#4a3a26', scarf: '#ffe066', scarfDark: '#d6b13a', buckle: '#fff2b0' },
    blurb: 'Technically a slime. Loyal, though.',
    unlockHint: '8 gems',
  },
  {
    id: 'shadow',
    name: 'SHADOW ARIN',
    title: 'Rare Cosmetic',
    price: 25,
    currency: 'gems',
    rarity: 'legendary',
    body: 'round',
    accessory: 'shadowScarf',
    palette: { skin: '#6b6f8a', skinShade: '#4a4d64', hair: '#15121c', shirt: '#2b2540', shirtDark: '#1a1630', pants: '#171426', boots: '#231d33', scarf: '#b06bff', scarfDark: '#6f36c9', buckle: '#d0c2ff' },
    glow: '#b06bff',
    blurb: 'Escaped rooms 1–10. Again. Quietly.',
    unlockHint: '25 gems',
  },
];

export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, currency: 'coins', rarity: 'common', tint: null, unlockHint: 'Starter look' },
  { id: 'wizard', name: 'Wizard', price: 700, currency: 'coins', rarity: 'rare', tint: { shirt: '#5f43b2', shirtDark: '#412f85', scarf: '#b79bff', scarfDark: '#7d5fd6' }, hat: 'wizard', unlockHint: '700 coins' },
  { id: 'ninja', name: 'Ninja', price: 900, currency: 'coins', rarity: 'rare', tint: { shirt: '#33384a', shirtDark: '#22263a', scarf: '#e04b4b', scarfDark: '#a52f2f' }, mask: true, unlockHint: '900 coins' },
  { id: 'robot', name: 'Robot', price: 1100, currency: 'coins', rarity: 'epic', tint: { skin: '#c6d0dc', skinShade: '#98a4b3', shirt: '#5b7fb5', hair: '#93a1b2' }, antenna: true, unlockHint: '1100 coins' },
  { id: 'pirate', name: 'Pirate', price: 1300, currency: 'coins', rarity: 'epic', tint: { shirt: '#8b3f3f', shirtDark: '#63292a', scarf: '#e6c34a' }, hat: 'pirate', unlockHint: '1300 coins' },
  { id: 'royal', name: 'Royal Explorer', price: 0, currency: 'gems', rarity: 'legendary', event: 'daily-7', tint: { shirt: '#8b5cf6', shirtDark: '#6534d6', scarf: '#ffd45e', scarfDark: '#d6a327' }, crown: true, crown2: true, unlockHint: 'Day 7 daily reward' },
  { id: 'ice', name: 'Ice Warrior', price: 10, currency: 'gems', rarity: 'epic', tint: { shirt: '#8fd8f0', shirtDark: '#4ea6c9', scarf: '#dff6ff', skin: '#e3f3ff' }, frost: true, unlockHint: '10 gems' },
  { id: 'flame', name: 'Flame Warrior', price: 10, currency: 'gems', rarity: 'epic', tint: { shirt: '#e8562f', shirtDark: '#b2351a', scarf: '#ffb03d' }, ember: true, unlockHint: '10 gems' },
  { id: 'cosmic', name: 'Cosmic Explorer', price: 22, currency: 'gems', rarity: 'legendary', tint: { shirt: '#3b2b6b', shirtDark: '#241a4a', scarf: '#8ce0ff' }, starfield: true, unlockHint: '22 gems' },
];

export const TRAILS = [
  { id: 'dust', name: 'Dust', price: 0, currency: 'coins', colors: ['#d9cbb0', '#b8a68a'], unlockHint: 'Starter trail' },
  { id: 'sparkle', name: 'Stardust', price: 400, currency: 'coins', colors: ['#ffe066', '#ffd45e'], sparkle: true, unlockHint: '400 coins' },
  { id: 'leaf', name: 'Leaf', price: 500, currency: 'coins', colors: ['#8fdc6a', '#5aa83c'], unlockHint: '500 coins' },
  { id: 'flame', name: 'Embers', price: 8, currency: 'gems', colors: ['#ff9f43', '#e8562f'], glow: true, unlockHint: '8 gems' },
  { id: 'cosmic', name: 'Cosmic', price: 15, currency: 'gems', colors: ['#8ce0ff', '#b06bff'], glow: true, sparkle: true, unlockHint: '15 gems' },
];

export const cosmeticById = (kind, id) =>
  ({ characters: CHARACTERS, skins: SKINS, trails: TRAILS })[kind]?.find((c) => c.id === id);

/** Merges a character's palette with the equipped skin's tint/overrides. */
export function resolveLook({ characterId = 'arin', skinId = 'classic', trailId = 'dust' }) {
  const char = cosmeticById('characters', characterId) || CHARACTERS[0];
  const skin = cosmeticById('skins', skinId) || SKINS[0];
  const trail = cosmeticById('trails', trailId) || TRAILS[0];
  const palette = { ...char.palette, ...(skin.tint || {}) };
  return {
    id: char.id,
    name: char.name,
    body: char.body,
    accessory: char.accessory,
    palette,
    glow: char.glow || null,
    skin: {
      hat: skin.hat || null,
      mask: !!skin.mask,
      antenna: !!skin.antenna,
      crown: !!skin.crown,
      frost: !!skin.frost,
      ember: !!skin.ember,
      starfield: !!skin.starfield,
    },
    trail,
  };
}
