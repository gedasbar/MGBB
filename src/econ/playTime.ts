/** Chunk 24a: total time played, counted only while the page is visible. */

/** The tracker writes the save at most this often (seconds of play), and when the page is hidden or closed. */
export const PLAYTIME_FLUSH_SECONDS = 15;

/**
 * Called once a frame with the seconds that frame lasted (already capped by the main loop, so a tab that slept does not add the nap).
 * `add` puts the seconds on the total; `flush` saves it.
 */
export class PlayTimeTracker {
  private sinceFlush = 0;

  constructor(private add: (seconds: number) => void, private flush: () => void) {}

  tick(frameSeconds: number, pageVisible: boolean) {
    if (!pageVisible) { this.save(); return; }
    if (!(frameSeconds > 0)) return;
    this.add(frameSeconds);
    this.sinceFlush += frameSeconds;
    if (this.sinceFlush >= PLAYTIME_FLUSH_SECONDS) this.save();
  }

  /** The page was hidden or is closing: save what has been counted. */
  save() {
    if (this.sinceFlush <= 0) return;
    this.sinceFlush = 0;
    this.flush();
  }
}

/** "12h 34m" (hours and whole minutes). */
export function fmtPlayTime(seconds: number): string {
  const total = Math.max(0, Math.floor(isFinite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return `${h}h ${m}m`;
}
