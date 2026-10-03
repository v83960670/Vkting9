/**
 * ESCAPE 99 — privacy-conscious analytics
 * Events stay on the device (local ring buffer) and can be exported by the
 * player from Settings. A production build would batch these to a first-party
 * endpoint; no personal data, no device identifiers, no third-party SDKs.
 */
export class Analytics {
  constructor(saveManager) {
    this.save = saveManager;
    this.sessionStart = Date.now();
    this.enabled = true;
  }
  setEnabled(on) {
    this.enabled = on;
  }
  track(name, props = {}) {
    if (!this.enabled) return;
    try {
      this.save.trackEvent(name, props);
    } catch {
      /* never let telemetry break gameplay */
    }
  }
  sessionStartEvent() {
    this.sessionStart = Date.now();
    this.track('session_start', {});
  }
  sessionEndEvent() {
    const seconds = Math.round((Date.now() - this.sessionStart) / 1000);
    this.track('session_duration', { seconds });
    this.save.addPlaySeconds(seconds);
    this.save.commit('session', true);
  }
  /** Dev-facing summary of the metrics the design doc cares about. */
  summary() {
    const events = this.save.data.analytics.events;
    const levels = this.save.data.stats.levelResults || {};
    const attempts = Object.values(levels).reduce((n, l) => n + (l.attempts || 0), 0);
    const escapes = Object.values(levels).reduce((n, l) => n + (l.escapes || 0), 0);
    const deaths = Object.values(levels).reduce((n, l) => n + (l.deaths || 0), 0);
    const stops = {};
    for (const [room, l] of Object.entries(levels)) {
      if (l.deaths > 2 && !l.escapes) stops[room] = l.deaths;
    }
    return {
      sessions: this.save.data.stats.sessions,
      events: events.length,
      attempts,
      escapes,
      deaths,
      completionRate: attempts ? +(escapes / attempts).toFixed(3) : 0,
      tutorialCompleted: !!this.save.data.progress.seenTutorial?.done,
      deathReasons: this.save.data.stats.deathsByReason,
      roughRooms: stops,
      playSeconds: this.save.data.stats.playSeconds,
    };
  }
}

export default Analytics;
