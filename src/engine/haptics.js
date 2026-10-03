/**
 * ESCAPE 99 — haptics
 * Wraps navigator.vibrate with named patterns and honours the setting.
 */
export const PATTERNS = {
  coin: 8,
  gem: [12, 40, 18],
  key: [16, 40, 26],
  damage: [26, 50, 26],
  exit: [14, 30, 14, 30, 30],
  perfect: [10, 26, 10, 26, 10, 26, 40],
  death: [40, 60, 60],
  ui: 6,
  button: 12,
  chest: [10, 30, 16],
  boss: [30, 40, 60],
  countdown: 20,
};

export class Haptics {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
  }
  setEnabled(on) {
    this.enabled = on && this.supported;
    if (!this.enabled && this.supported) {
      try {
        navigator.vibrate(0);
      } catch {
        /* ignore */
      }
    }
  }
  buzz(name) {
    if (!this.enabled || !this.supported) return;
    const pattern = PATTERNS[name] ?? 10;
    try {
      navigator.vibrate(pattern);
    } catch {
      /* ignore */
    }
  }
}

export default Haptics;
