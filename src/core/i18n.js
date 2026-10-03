/**
 * ESCAPE 99 — i18n
 * All gameplay text lives in src/data/strings.js so new languages are drop-in.
 */
import { Emitter, storage } from './util.js';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी' },
  // Architecture already supports these — add a strings file and it appears here.
  { code: 'bn', label: 'বাংলা', placeholder: true },
  { code: 'ta', label: 'தமிழ்', placeholder: true },
  { code: 'te', label: 'తెలుగు', placeholder: true },
  { code: 'mr', label: 'मराठी', placeholder: true },
  { code: 'gu', label: 'ગુજરાતી', placeholder: true },
  { code: 'kn', label: 'ಕನ್ನಡ', placeholder: true },
  { code: 'ml', label: 'മലയാളം', placeholder: true },
  { code: 'pa', label: 'ਪੰਜਾਬੀ', placeholder: true },
];

export class I18n extends Emitter {
  constructor(tables, fallback = 'en') {
    super();
    this.tables = tables;
    this.fallback = fallback;
    this.lang = storage.get('escape99.lang', fallback);
    if (!tables[this.lang]) this.lang = fallback;
  }
  setLanguage(code) {
    if (!this.tables[code] || code === this.lang) return;
    this.lang = code;
    storage.set('escape99.lang', code);
    this.emit('change', code);
  }
  /** Translate with optional {placeholders}. Falls back to English, then the key. */
  t(key, vars) {
    const table = this.tables[this.lang] || {};
    let str = table[key];
    if (str === undefined) str = (this.tables[this.fallback] || {})[key];
    if (str === undefined) str = key;
    if (vars) for (const [k, v] of Object.entries(vars)) str = str.replaceAll(`{${k}}`, v);
    return str;
  }
}
