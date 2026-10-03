/**
 * ESCAPE 99 — audio
 * Everything is synthesised at runtime with the WebAudio API: zero audio
 * download, instant load, and music that can raise its intensity when the
 * fire wall starts or the boss wakes up.
 */

const SQ = (n) => 440 * 2 ** ((n - 69) / 12); // midi -> hz

const TRACKS = {
  menu: {
    bpm: 82, root: 57, wave: 'triangle', pad: [0, 3, 7, 10], drums: null, density: 0.5,
    bass: [0, null, null, null, null, null, null, null, -5, null, null, null, null, null, null, null],
    arp: [0, null, null, null, 7, null, null, null, 3, null, null, null, 10, null, null, null],
  },
  temple: {
    bpm: 92, root: 45, wave: 'triangle', pad: [0, 3, 7, 10], drums: 'soft', density: 0.6,
    bass: [0, null, null, null, 0, null, null, null, -2, null, null, null, -5, null, null, null],
    arp: [0, null, 3, null, 5, null, 7, null, 3, null, 5, null, 7, null, 10, null],
  },
  cave: {
    bpm: 104, root: 40, wave: 'sawtooth', pad: [0, 5, 7, 12], drums: 'soft', density: 0.7,
    bass: [0, null, 0, null, null, null, 3, null, -5, null, null, null, 0, null, null, null],
    arp: [0, 7, null, 10, 0, 7, null, 12, 3, 10, null, 15, 7, null, 12, null],
  },
  chase: {
    bpm: 146, root: 40, wave: 'square', pad: [0, 5, 7], drums: 'hard', density: 1.0, urgent: true,
    bass: [0, 0, 12, 0, 0, 0, 12, 0, 3, 3, 15, 3, 3, 3, 15, 3],
    arp: [0, 7, 12, 7, 0, 7, 12, 15, 3, 10, 15, 10, 3, 10, 15, 19],
  },
  boss: {
    bpm: 128, root: 38, wave: 'sawtooth', pad: [0, 3, 7], drums: 'hard', density: 0.9,
    bass: [0, null, 0, null, -5, null, -5, null, -2, null, -2, null, 3, null, 3, null],
    arp: [0, 12, 3, 12, 7, 12, 3, 12, 0, 12, 5, 12, 10, 12, 7, 12],
  },
  endless: {
    bpm: 122, root: 43, wave: 'triangle', pad: [0, 5, 7, 10], drums: 'hard', density: 0.85,
    bass: [0, null, null, 7, 0, null, null, 5, -5, null, null, 3, -2, null, null, 0],
    arp: [0, 5, 7, 12, 0, 5, 7, 12, 3, 7, 10, 15, 3, 7, 10, 12],
  },
  victory: { bpm: 1, silent: true },
};

export class AudioEngine {
  constructor(settings = {}) {
    this.ctx = null;
    this.ready = false;
    this.musicVolume = settings.music ?? 0.55;
    this.sfxVolume = settings.sfx ?? 0.8;
    this.muted = false;
    this.track = null;
    this.intensity = 0;
    this._step = 0;
    this._nextTime = 0;
    this._timer = null;
    this._nodes = {};
    this._noiseBuffer = null;
    this._lastPlayed = new Map();
  }

  /** Must be called from a user gesture (first tap) on mobile. */
  unlock() {
    if (this.ready) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      this.ctx = new Ctx({ latencyHint: 'interactive' });
    } catch {
      return;
    }
    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(ctx.destination);
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = this.musicVolume;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 3200;
    this.musicGain.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = this.sfxVolume;
    this.sfxGain.connect(this.master);
    // Shared noise buffer for percussive / fire sounds.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;
    this.ready = true;
  }

  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.ready) this.musicGain.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05);
  }
  setSfxVolume(v) {
    this.sfxVolume = v;
    if (this.ready) this.sfxGain.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.03);
  }
  setMuted(m) {
    this.muted = m;
    if (!this.ready) return;
    this.musicGain.gain.setTargetAtTime(m ? 0 : this.musicVolume, this.ctx.currentTime, 0.05);
    this.sfxGain.gain.setTargetAtTime(m ? 0 : this.sfxVolume, this.ctx.currentTime, 0.03);
  }

  /* --------------------------------- voices -------------------------------- */
  _tone({ freq = 440, to = null, dur = 0.16, type = 'sine', gain = 0.3, attack = 0.005, delay = 0, dest = null, detune = 0, q = 1 } = {}) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + dur);
    if (detune) osc.detune.value = detune;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(t);
    osc.stop(t + dur + 0.03);
  }

  _noise({ dur = 0.2, gain = 0.25, from = 1200, to = 300, q = 1, type = 'bandpass', delay = 0, dest = null } = {}) {
    if (!this.ready || this.muted) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.playbackRate.value = 1;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(from, t);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, to), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest || this.sfxGain);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Short arpeggio helper used for the magical / reward sounds. */
  _arp(notes, { step = 0.055, dur = 0.18, type = 'triangle', gain = 0.22, delay = 0 } = {}) {
    notes.forEach((n, i) => this._tone({ freq: SQ(n), dur, type, gain, delay: delay + i * step }));
  }

  /* ---------------------------------- sfx ---------------------------------- */
  play(name, opts = {}) {
    if (!this.ready || this.muted) return;
    // Light rate-limiting: no machine-gun coin stacks.
    const now = performance.now();
    const gate = { coin: 40, hurt: 220, spike: 160, step: 90 }[name] || 0;
    if (gate && now - (this._lastPlayed.get(name) || 0) < gate) return;
    this._lastPlayed.set(name, now);

    switch (name) {
      case 'coin':
        this._tone({ freq: 1180 + (opts.pitch || 0) * 60, to: 1760, dur: 0.11, type: 'sine', gain: 0.2 });
        this._tone({ freq: 2360, dur: 0.06, type: 'sine', gain: 0.06, delay: 0.01 });
        break;
      case 'gem':
        this._tone({ freq: 1560, dur: 0.5, type: 'sine', gain: 0.2 });
        this._tone({ freq: 2340, dur: 0.45, type: 'sine', gain: 0.12, delay: 0.03 });
        this._noise({ dur: 0.35, gain: 0.06, from: 5200, to: 7000, q: 3 });
        break;
      case 'key':
        this._tone({ freq: 880, to: 1320, dur: 0.22, type: 'triangle', gain: 0.26 });
        this._tone({ freq: 1760, dur: 0.3, type: 'sine', gain: 0.14, delay: 0.05 });
        this._arp([88, 92, 95, 100], { step: 0.045, dur: 0.3, gain: 0.1, delay: 0.06 });
        break;
      case 'door':
        this._noise({ dur: 0.75, gain: 0.22, from: 420, to: 90, q: 1.2, type: 'lowpass' });
        this._tone({ freq: 90, to: 52, dur: 0.8, type: 'sawtooth', gain: 0.14 });
        break;
      case 'gate':
        this._noise({ dur: 0.5, gain: 0.2, from: 900, to: 200, q: 2 });
        this._tone({ freq: 240, to: 120, dur: 0.45, type: 'square', gain: 0.1 });
        break;
      case 'button':
        this._tone({ freq: 520, to: 300, dur: 0.07, type: 'square', gain: 0.14 });
        this._noise({ dur: 0.07, gain: 0.1, from: 2600, to: 900, q: 2 });
        break;
      case 'switchOn':
        this._tone({ freq: 660, dur: 0.12, type: 'square', gain: 0.15 });
        this._tone({ freq: 990, dur: 0.2, type: 'sine', gain: 0.12, delay: 0.06 });
        break;
      case 'sword':
        this._noise({ dur: 0.16, gain: 0.2, from: 900, to: 5200, q: 1.4 });
        this._tone({ freq: 320, to: 900, dur: 0.1, type: 'triangle', gain: 0.08 });
        break;
      case 'hit':
        this._noise({ dur: 0.1, gain: 0.2, from: 2000, to: 400, q: 1 });
        this._tone({ freq: 180, to: 90, dur: 0.12, type: 'square', gain: 0.12 });
        break;
      case 'pop':
        this._tone({ freq: 420, to: 140, dur: 0.16, type: 'sine', gain: 0.22 });
        this._noise({ dur: 0.14, gain: 0.12, from: 1600, to: 500, q: 1 });
        break;
      case 'enemyDie':
        this._tone({ freq: 700, to: 180, dur: 0.28, type: 'triangle', gain: 0.2 });
        this._noise({ dur: 0.24, gain: 0.12, from: 2400, to: 600 });
        break;
      case 'hurt':
        this._tone({ freq: 300, to: 120, dur: 0.3, type: 'sawtooth', gain: 0.2 });
        this._noise({ dur: 0.22, gain: 0.14, from: 700, to: 200, q: 1 });
        break;
      case 'death':
        this._arp([76, 72, 69, 64, 60], { step: 0.09, dur: 0.5, type: 'triangle', gain: 0.2 });
        this._noise({ dur: 0.5, gain: 0.12, from: 900, to: 120, q: 1 });
        break;
      case 'jump':
        this._tone({ freq: 380, to: 700, dur: 0.12, type: 'triangle', gain: 0.12 });
        break;
      case 'dash':
        this._noise({ dur: 0.28, gain: 0.18, from: 600, to: 3200, q: 1 });
        this._tone({ freq: 240, to: 620, dur: 0.22, type: 'triangle', gain: 0.1 });
        break;
      case 'spike':
        this._noise({ dur: 0.14, gain: 0.2, from: 3000, to: 1200, q: 4 });
        this._tone({ freq: 900, to: 400, dur: 0.12, type: 'square', gain: 0.08 });
        break;
      case 'spikeWarn':
        this._tone({ freq: 1200, dur: 0.05, type: 'square', gain: 0.05 });
        break;
      case 'chest':
        this._arp([64, 68, 71, 76, 80], { step: 0.06, dur: 0.45, type: 'triangle', gain: 0.16 });
        this._noise({ dur: 0.5, gain: 0.08, from: 3000, to: 6000, q: 2 });
        break;
      case 'star':
        this._tone({ freq: 1600, dur: 0.26, type: 'sine', gain: 0.14 });
        this._arp([88, 93, 98], { step: 0.06, dur: 0.4, type: 'sine', gain: 0.09 });
        break;
      case 'victory':
        this._arp([69, 72, 76, 81, 88], { step: 0.12, dur: 0.7, type: 'triangle', gain: 0.2 });
        this._arp([64, 69, 76], { step: 0.12, dur: 0.9, type: 'sine', gain: 0.12, delay: 0.02 });
        break;
      case 'fail':
        this._arp([64, 62, 59, 55], { step: 0.1, dur: 0.5, type: 'sawtooth', gain: 0.12 });
        break;
      case 'rock':
        this._noise({ dur: 0.4, gain: 0.24, from: 500, to: 80, q: 1, type: 'lowpass' });
        this._tone({ freq: 120, to: 40, dur: 0.45, type: 'square', gain: 0.14 });
        break;
      case 'rockWarn':
        this._tone({ freq: 200, dur: 0.14, type: 'sine', gain: 0.07 });
        break;
      case 'roar':
        this._tone({ freq: 140, to: 70, dur: 0.9, type: 'sawtooth', gain: 0.26 });
        this._tone({ freq: 90, to: 48, dur: 1.0, type: 'square', gain: 0.18, delay: 0.04 });
        this._noise({ dur: 0.9, gain: 0.16, from: 900, to: 120, q: 1 });
        break;
      case 'bossHit':
        this._tone({ freq: 220, to: 90, dur: 0.5, type: 'sawtooth', gain: 0.24 });
        this._noise({ dur: 0.4, gain: 0.2, from: 1600, to: 200, q: 1 });
        break;
      case 'bossBreak':
        this._noise({ dur: 1.2, gain: 0.3, from: 2200, to: 80, q: 1, type: 'lowpass' });
        this._arp([52, 48, 43, 36], { step: 0.12, dur: 0.8, type: 'sawtooth', gain: 0.16 });
        break;
      case 'stun':
        this._tone({ freq: 300, to: 900, dur: 0.3, type: 'square', gain: 0.14 });
        this._arp([84, 88, 91, 96], { step: 0.05, dur: 0.3, type: 'sine', gain: 0.08 });
        break;
      case 'lava':
        this._noise({ dur: 1.6, gain: 0.2, from: 300, to: 120, q: 0.8, type: 'lowpass' });
        this._tone({ freq: 70, to: 46, dur: 1.6, type: 'sawtooth', gain: 0.1 });
        break;
      case 'fire':
        this._noise({ dur: 1.0, gain: 0.22, from: 1400, to: 500, q: 0.6 });
        break;
      case 'whoosh':
        this._noise({ dur: 0.5, gain: 0.16, from: 400, to: 2200, q: 0.9 });
        break;
      case 'powerup':
        this._arp([67, 71, 74, 79, 83, 86], { step: 0.05, dur: 0.5, type: 'square', gain: 0.12 });
        break;
      case 'shield':
        this._tone({ freq: 520, to: 980, dur: 0.3, type: 'sine', gain: 0.16 });
        this._noise({ dur: 0.3, gain: 0.08, from: 3000, to: 6000, q: 3 });
        break;
      case 'click':
        this._tone({ freq: 700, to: 900, dur: 0.05, type: 'square', gain: 0.1 });
        break;
      case 'back':
        this._tone({ freq: 500, to: 340, dur: 0.09, type: 'square', gain: 0.1 });
        break;
      case 'locked':
        this._tone({ freq: 220, to: 180, dur: 0.16, type: 'square', gain: 0.12 });
        this._noise({ dur: 0.12, gain: 0.1, from: 800, to: 300, q: 2 });
        break;
      case 'countdown':
        this._tone({ freq: 880, dur: 0.18, type: 'sine', gain: 0.18 });
        break;
      case 'countdownGo':
        this._tone({ freq: 1320, dur: 0.5, type: 'sine', gain: 0.22 });
        this._arp([88, 93, 100], { step: 0.08, dur: 0.6, type: 'triangle', gain: 0.12 });
        break;
      default:
        break;
    }
  }

  /* --------------------------------- music --------------------------------- */
  playMusic(name, { fade = 0.8, intensity = 0 } = {}) {
    if (!this.ready) return;
    if (this.track && this.track.name === name) return;
    this.stopMusic(fade * 0.5);
    const def = TRACKS[name];
    if (!def || def.silent) return;
    this.track = { name, def, step: 0, intensity };
    this._nextTime = this.ctx.currentTime + 0.08;
    this._startScheduler();
  }

  setIntensity(v) {
    if (!this.track) return;
    this.intensity = Math.max(0, Math.min(1, v));
    if (this.ready) {
      const cut = 900 + this.intensity * 6200;
      this.musicFilter.frequency.setTargetAtTime(cut, this.ctx.currentTime, 0.4);
    }
  }

  stopMusic(fade = 0.6) {
    if (!this.ready) return;
    this._stopScheduler();
    if (this.track) {
      this.musicGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, fade * 0.4);
      const restore = () => this.musicGain.gain.setValueAtTime(this.muted ? 0 : this.musicVolume, this.ctx.currentTime);
      setTimeout(restore, fade * 600 + 60);
    }
    this.track = null;
  }

  _startScheduler() {
    if (this._timer) return;
    this.musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this.musicGain.gain.setValueAtTime(Math.max(0.0001, this.musicVolume * 0.9), this.ctx.currentTime);
    this._timer = setInterval(() => this._schedule(), 30);
  }
  _stopScheduler() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  _schedule() {
    if (!this.track || !this.ready) return;
    const { def } = this.track;
    const spb = 60 / def.bpm / 4; // 16th note
    while (this._nextTime < this.ctx.currentTime + 0.16) {
      this._playStep(this.track.step % 16, def, this._nextTime, spb);
      this.track.step++;
      this._nextTime += spb;
    }
    if (this.track.step > 16 * 400) this.track.step = 0;
  }

  _playStep(step, def, time, spb) {
    const ctx = this.ctx;
    const dest = this.musicGain;
    const i = this.intensity;
    const late = time - ctx.currentTime;
    const rel = (n) => SQ(def.root + n);

    // bass
    const b = def.bass[step];
    if (b !== null && b !== undefined) {
      this._toneAt(rel(b - 12), { dur: spb * 3.2, type: 'triangle', gain: 0.26, at: time, dest });
    }
    // arp / lead layer
    const a = def.arp[step];
    if (a !== null && a !== undefined) {
      const gain = 0.075 + i * 0.05;
      this._toneAt(rel(a + 12), { dur: spb * 1.6, type: def.wave === 'square' ? 'square' : 'triangle', gain, at: time, dest });
    }
    // shimmer layer that appears as danger rises
    if (i > 0.45 && step % 4 === 2) {
      this._toneAt(rel(24 + (step % 3) * 5), { dur: spb * 1.2, type: 'sine', gain: 0.03 + i * 0.03, at: time, dest });
    }
    // pad on bar starts
    if (step === 0) {
      for (const n of def.pad) {
        this._toneAt(rel(n), { dur: spb * 14, type: 'sine', gain: 0.05, attack: 0.35, at: time, dest });
      }
    }
    // drums
    if (def.drums) {
      const hard = def.drums === 'hard';
      if (step === 0 || step === 8 || (hard && i > 0.6 && step === 11)) this._kick(time, dest, hard ? 0.5 : 0.34);
      if (hard && (step === 4 || step === 12)) this._snare(time, dest, 0.22);
      if (hard && step % 2 === 0 && (i > 0.3 || step % 4 === 0)) this._hat(time, dest, 0.07);
    }
    // countdown-style tick when intensity maxes out
    if (def.urgent && i > 0.85 && step % 4 === 0) this._toneAt(rel(31), { dur: 0.05, type: 'square', gain: 0.05, at: time, dest });
    void late;
  }

  _toneAt(freq, { dur = 0.2, type = 'sine', gain = 0.1, attack = 0.008, at = 0, dest = null } = {}) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(gain, at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(g);
    g.connect(dest || this.sfxGain);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }
  _kick(at, dest, gain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160, at);
    osc.frequency.exponentialRampToValueAtTime(46, at + 0.12);
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.19);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + 0.22);
  }
  _snare(at, dest, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(at, Math.random());
    src.stop(at + 0.16);
  }
  _hat(at, dest, gain) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    const filt = ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(at, Math.random());
    src.stop(at + 0.07);
  }
}

export default AudioEngine;
