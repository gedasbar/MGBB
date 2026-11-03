import { CAROUSEL } from './constants';

/** Chunk 29b: the carousel's maths, pure. `pos` is the position in card steps (0 = first card centred, 1 = second ...); it is a float while dragging or easing. */

/** Position while a finger has moved `dx` px since the press (`startPos` = position at the press). Dragging left (dx < 0) moves toward the next card. Past either end the drag is resisted. */
export function dragPos(startPos: number, dx: number, n: number, spacing: number = CAROUSEL.spacing): number {
  const raw = startPos - dx / spacing;
  if (raw < 0) return raw * CAROUSEL.rubber;
  if (raw > n - 1) return n - 1 + (raw - (n - 1)) * CAROUSEL.rubber;
  return raw;
}

/** The card a release snaps to: where the carousel would be after a short flick (finger speed `vx` px/s, positive = to the right), nearest card, at most one card away from the nearest card of `pos`. */
export function snapIndex(pos: number, vx: number, n: number, spacing: number = CAROUSEL.spacing): number {
  const base = Math.round(pos);
  const projected = pos - (vx * CAROUSEL.flickSeconds) / spacing;
  const idx = Math.max(base - 1, Math.min(base + 1, Math.round(projected)));
  return Math.max(0, Math.min(n - 1, idx));
}

/** The card after a step of `dir` (-1 left, +1 right), never off either end (arrows and keys). */
export function stepIndex(index: number, dir: -1 | 1, n: number): number {
  return Math.max(0, Math.min(n - 1, index + dir));
}

/** Moves `pos` toward `target` for `dt` seconds (exponential ease); lands exactly on it once close. */
export function easePos(pos: number, target: number, dt: number): number {
  const k = 1 - Math.exp(-CAROUSEL.ease * dt);
  const next = pos + (target - pos) * k;
  return Math.abs(target - next) < CAROUSEL.arrive ? target : next;
}

/** Where and how big a card is drawn when it is `d` steps from the centre (d = index - pos): x offset from the centre, scale and alpha. The look eases to the neighbour look at |d| = 1. */
export function cardLook(d: number, spacing: number = CAROUSEL.spacing): { dx: number; scale: number; alpha: number } {
  const t = Math.min(1, Math.abs(d));
  return {
    dx: d * spacing,
    scale: 1 - (1 - CAROUSEL.sideScale) * t,
    alpha: 1 - (1 - CAROUSEL.sideAlpha) * t,
  };
}

/** Finger speed from recent samples (time in seconds, x in px): the movement over the last `window` seconds before the final sample, px/s. 0 with fewer than two samples. */
export function releaseVelocity(samples: readonly { t: number; x: number }[], window: number = CAROUSEL.velocityWindow): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0 && last.t - samples[i].t <= window; i--) first = samples[i];
  const dt = last.t - first.t;
  return dt > 0 ? (last.x - first.x) / dt : 0;
}

/** The card index whose centre is under game x (given the position and the screen centre), or -1. Only the centre card and its neighbours are tappable by their own box. */
export function cardAt(x: number, pos: number, n: number, cx: number, cardW: number, spacing: number = CAROUSEL.spacing): number {
  let best = -1;
  let bestScale = -1;
  for (let i = 0; i < n; i++) {
    const l = cardLook(i - pos, spacing);
    const half = (cardW * l.scale) / 2;
    if (x >= cx + l.dx - half && x <= cx + l.dx + half && l.scale > bestScale) { best = i; bestScale = l.scale; }
  }
  return best;
}
