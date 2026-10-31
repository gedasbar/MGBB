/** Rates real screens run at; the measured rate is snapped to one of them when it is within SNAP_TOLERANCE of it. */
export const COMMON_RATES: readonly number[] = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
const SNAP_TOLERANCE = 0.04;
/** Frame gaps kept for the estimate (about 2 seconds at 60 Hz). */
const KEEP = 128;
/** The estimate reads this share of the sorted gaps from the short end: slow frames (load, hitches) do not drag the display rate down. */
const QUANTILE = 0.25;

/** The display refresh rate in Hz from frame gaps in ms: a low quantile of the gaps, snapped to a common rate. 0 when there are too few. */
export function estimateRefreshHz(gapsMs: readonly number[]): number {
  const g = gapsMs.filter(v => v > 1 && v < 100).sort((a, b) => a - b);
  if (g.length < 8) return 0;
  const gap = g[Math.floor((g.length - 1) * QUANTILE)];
  const hz = 1000 / gap;
  let best = hz;
  for (const r of COMMON_RATES) if (Math.abs(hz - r) / r <= SNAP_TOLERANCE) { best = r; break; }
  return Math.round(best);
}

/** Collects frame gaps (no allocation after the first KEEP frames) and reports the display rate. */
export class RefreshEstimator {
  private gaps: number[] = [];
  private n = 0;
  add(ms: number) {
    if (this.gaps.length < KEEP) this.gaps.push(ms);
    else this.gaps[this.n % KEEP] = ms;
    this.n++;
  }
  get hz(): number { return estimateRefreshHz(this.gaps); }
}
