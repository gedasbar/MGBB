import { Container, Sprite, Texture } from 'pixi.js';
import type { ProjectilePool } from '../engine/pools';
import { PHASE_BOOM_BACK, PHASE_BOOM_OUT, PHASE_MINE_TRAVEL, PHASE_NORMAL } from '../engine/projectiles';
import type { TrailMode } from './settings';

/**
 * Chunk 28b: the fading trail behind a shot. A trail is a few flat segments (no glow, no texture) laid straight behind the shot along its heading, each shorter in alpha and
 * narrower than the one before it, in the shot's own colour or in the colours of a trail style. It is drawn from the shot's velocity, so it costs no history and no per-shot state.
 *
 * Cost control (the 21b performance work stays intact):
 *  - ONE shared pool of TRAIL_SEGMENT_CAP segment sprites for the whole screen. A shot takes `segments` of them; when they run out the remaining shots simply have no trail
 *    (the first shots of the pool, in slot order, win), so the cost is bounded however many shots are alive.
 *  - Only a shot on screen in normal flight (or the outward / return leg of a Boomerang, or a travelling Mine) gets a trail; Orbit and a waiting Mine do not.
 *  - The trail pass is timed. When its smoothed cost stays above TRAIL_BUDGET_MS for TRAIL_BUDGET_FRAMES frames in a row the trails turn themselves off for the rest of the run
 *    (`autoOff`), so a slow phone never pays for a cosmetic.
 */
export const TRAIL_SEGMENT_CAP = 1200;
/** Segments per shot, and the seconds of flight the whole trail covers, by length setting. */
export const TRAIL_SEGMENTS: Record<'short' | 'long', number> = { short: 3, long: 5 };
export const TRAIL_SECONDS: Record<'short' | 'long', number> = { short: 0.05, long: 0.11 };
/** A trail is never shorter or longer than this (px): a slow shot still shows one, a fast one does not draw a line across the screen. */
export const TRAIL_MIN_PX = 8;
export const TRAIL_MAX_PX = 110;
/** Alpha of the segment next to the shot and of the last one (linear between). */
export const TRAIL_ALPHA_NEAR = 0.6;
export const TRAIL_ALPHA_FAR = 0.12;
/** Width of the segment next to the shot and of the last one, as a share of the shot's own width. */
export const TRAIL_WIDTH_NEAR = 0.85;
export const TRAIL_WIDTH_FAR = 0.3;
/** Narrowest a segment is drawn (px). */
export const TRAIL_MIN_WIDTH = 2;
/** The automatic fallback: a smoothed trail pass above this many ms, this many frames running, turns the trails off. */
export const TRAIL_BUDGET_MS = 3;
export const TRAIL_BUDGET_FRAMES = 30;
export const TRAIL_BUDGET_SMOOTH = 0.15;

const eligible = (phase: number) => phase === PHASE_NORMAL || phase === PHASE_BOOM_OUT || phase === PHASE_BOOM_BACK || phase === PHASE_MINE_TRAVEL;

/** How many segments (and how long in px) a shot's trail has for a length setting and a speed in px/s. Pure, for tests. */
export function trailShape(mode: TrailMode, speed: number): { segments: number; length: number } {
  if (mode === 'off') return { segments: 0, length: 0 };
  return { segments: TRAIL_SEGMENTS[mode], length: Math.max(TRAIL_MIN_PX, Math.min(TRAIL_MAX_PX, speed * TRAIL_SECONDS[mode])) };
}

/** Colour of segment k of a style (null = the shot's own colour). */
export const trailColor = (colors: readonly number[] | null, k: number, shotColor: number): number => (colors ? colors[Math.min(k, colors.length - 1)] : shotColor);

export class ShotTrails {
  private readonly segs: Sprite[] = [];
  private shown = 0;
  /** Segment sprites in use at the last sync (tests and the stats overlay). */
  used = 0;
  /** Smoothed cost of the trail pass in ms, and true once the budget turned the trails off for this run. */
  ms = 0;
  autoOff = false;
  private over = 0;

  constructor(layer: Container, private cap = TRAIL_SEGMENT_CAP) {
    for (let i = 0; i < cap; i++) {
      const s = new Sprite(Texture.WHITE);
      s.anchor.set(0.5);
      s.visible = false;
      layer.addChild(s);
      this.segs.push(s);
    }
  }

  private hideFrom(n: number) {
    for (let i = n; i < this.shown; i++) this.segs[i].visible = false;
    this.shown = n;
  }

  /**
   * Lays the trails of every eligible shot. `tint` and `width` are the shot sprites' own colour and width by slot (so a trail matches the look); `visible` says which slots the
   * sprite pass drew (on screen). `now` is a clock in ms (performance.now) used only for the budget.
   */
  sync(pool: ProjectilePool, mode: TrailMode, colors: readonly number[] | null, tint: (i: number) => number, width: (i: number) => number, visible: (i: number) => boolean, mapX: (x: number) => number, now: () => number = () => performance.now()) {
    if (mode === 'off' || this.autoOff) { this.hideFrom(0); this.used = 0; return; }
    const t0 = now();
    let n = 0;
    for (let i = 0; i < pool.max && n < this.cap; i++) {
      if (!pool.active[i] || !eligible(pool.phase[i]) || !visible(i)) continue;
      const vx = pool.vx[i], vy = pool.vy[i];
      const speed = Math.hypot(vx, vy);
      if (speed < 1) continue;
      const { segments, length } = trailShape(mode, speed);
      if (n + segments > this.cap) break;
      const dx = vx / speed, dy = vy / speed;
      const rot = Math.atan2(vy, vx) + Math.PI / 2;
      const step = length / segments;
      const sx = mapX(pool.x[i]), sy = pool.y[i];
      const w0 = width(i), c = tint(i);
      for (let k = 0; k < segments; k++) {
        const f = segments > 1 ? k / (segments - 1) : 0;
        const s = this.segs[n++];
        const dist = (k + 0.5) * step + 2;
        s.position.set(sx - dx * dist, sy - dy * dist);
        s.rotation = rot;
        s.width = Math.max(TRAIL_MIN_WIDTH, w0 * (TRAIL_WIDTH_NEAR + (TRAIL_WIDTH_FAR - TRAIL_WIDTH_NEAR) * f));
        s.height = step;
        s.alpha = TRAIL_ALPHA_NEAR + (TRAIL_ALPHA_FAR - TRAIL_ALPHA_NEAR) * f;
        s.tint = trailColor(colors, k, c);
        s.visible = true;
      }
    }
    this.hideFrom(n);
    this.used = n;
    this.ms += ((now() - t0) - this.ms) * TRAIL_BUDGET_SMOOTH;
    this.over = this.ms > TRAIL_BUDGET_MS ? this.over + 1 : 0;
    if (this.over >= TRAIL_BUDGET_FRAMES) { this.autoOff = true; this.hideFrom(0); this.used = 0; }
  }
}
