import { Graphics } from 'pixi.js';
import { Segment } from '../engine/compiler';
import { Dir } from '../engine/compilerTypes';
import { arrowHead, COLORS, drawWarn, drawX } from './draw';
import { BASE_CELL as S, EJECTOR_BASE_DIST, EMITTER_TIP_DIST } from './layout';

export const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  N: { x: 0, y: -1 }, E: { x: 1, y: 0 }, S: { x: 0, y: 1 }, W: { x: -1, y: 0 },
};

/** Reasons that get a warning triangle instead of a plain dead-end cross. */
const WARN_REASONS = new Set(['wrong side', 'ejector wrong side', 'lines overlap', 'feedback loop']);

export function isWarnSegment(s: Segment): boolean {
  return s.kind === 'overlap' || s.kind === 'loop-cut' || (s.reason !== undefined && WARN_REASONS.has(s.reason));
}

/** Content-space centre of a cell. */
export function centre(x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * S, y: (y + 0.5) * S };
}

/**
 * Cells where a horizontal live run crosses a vertical live run. Those are always interior cells of both
 * runs (runs end at blocks), so the horizontal line can hop over the vertical one there.
 */
export function computeHops(segments: Segment[]): Set<string> {
  const h = new Set<string>();
  const v = new Set<string>();
  for (const s of segments) {
    if (s.kind !== 'live') continue;
    const horizontal = s.dir === 'E' || s.dir === 'W';
    const step = DIR_VEC[s.dir];
    let x = s.fromCell.x + step.x;
    let y = s.fromCell.y + step.y;
    while (x !== s.toCell.x || y !== s.toCell.y) {
      (horizontal ? h : v).add(`${x},${y}`);
      x += step.x;
      y += step.y;
    }
  }
  const out = new Set<string>();
  for (const k of h) if (v.has(k)) out.add(k);
  return out;
}

/**
 * Content-space endpoints of a segment: live runs go centre to centre, other kinds stop at the cell edge.
 * A run leaving a generator starts at the tip of its emitter notch; a run into an ejector stops at the bullet's base.
 */
export function segmentEnds(s: Segment): { a: { x: number; y: number }; b: { x: number; y: number } } {
  const d = DIR_VEC[s.dir];
  const c = centre(s.fromCell.x, s.fromCell.y);
  const a = s.fromGenerator ? { x: c.x + d.x * EMITTER_TIP_DIST, y: c.y + d.y * EMITTER_TIP_DIST } : c;
  if (s.kind === 'live') {
    const e = centre(s.toCell.x, s.toCell.y);
    return { a, b: s.toEjector ? { x: e.x - d.x * EJECTOR_BASE_DIST, y: e.y - d.y * EJECTOR_BASE_DIST } : e };
  }
  return { a, b: { x: c.x + d.x * S * 0.5, y: c.y + d.y * S * 0.5 } };
}

function strokePath(g: Graphics, pts: [number, number][], hopsAt: number[], y: number, color: number, width: number, alpha: number) {
  // pts: [x1,y],[x2,y] horizontal polyline with optional hops (x positions) drawn as small arcs.
  const [[x1], [x2]] = pts;
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  const r = S * 0.17;
  g.moveTo(lo, y);
  for (const hx of hopsAt.filter(h => h > lo && h < hi).sort((a, b) => a - b)) {
    g.lineTo(hx - r, y);
    g.arc(hx, y, r, Math.PI, 0);
  }
  g.lineTo(hi, y);
  g.stroke({ color, width, alpha, cap: 'round', join: 'round' });
}

/** Static glowing red line for every segment, plus dead-end / warning caps. */
export function drawLines(g: Graphics, segments: Segment[], hops: Set<string>, dim = 1) {
  const layers: [number, number, number][] = [
    [12, 0.16, 0xff2a2a],
    [7, 0.32, 0xff3a3a],
    [3.2, 1, COLORS.red],
  ];
  for (const [width, alpha, color] of layers) {
    for (const s of segments) {
      const { a, b } = segmentEnds(s);
      const al = alpha * dim * (s.kind === 'live' ? 1 : 0.6);
      if (s.dir === 'E' || s.dir === 'W') {
        const hopXs: number[] = [];
        if (s.kind === 'live') {
          for (let cx = Math.min(s.fromCell.x, s.toCell.x) + 1; cx < Math.max(s.fromCell.x, s.toCell.x); cx++) {
            if (hops.has(`${cx},${s.fromCell.y}`)) hopXs.push((cx + 0.5) * S);
          }
        }
        strokePath(g, [[a.x, a.y], [b.x, b.y]], hopXs, a.y, color, width, al);
      } else {
        g.moveTo(a.x, a.y).lineTo(b.x, b.y).stroke({ color, width, alpha: al, cap: 'round' });
      }
    }
  }
}

/** Direction arrows are not drawn on the line itself; the flow animation shows the direction. This draws the caps. */
export function drawCaps(g: Graphics, segments: Segment[]) {
  for (const s of segments) {
    if (s.kind === 'live') continue;
    const { b } = segmentEnds(s);
    if (isWarnSegment(s)) {
      drawWarn(g, b.x, b.y, 20);
    } else {
      g.circle(b.x, b.y, 8).fill({ color: 0x000000, alpha: 0.7 });
      drawX(g, b.x, b.y, 5, COLORS.red, 3);
    }
  }
}

/** Animated dashes travelling along live segments in their direction of travel (they skip the hop gaps). */
export function drawFlow(g: Graphics, segments: Segment[], timeMs: number, hops: Set<string>, dim = 1) {
  const period = 24;
  const dash = 9;
  const off = ((timeMs / 1000) * 48) % period;
  const gapHalf = S * 0.17 + 2;
  for (const s of segments) {
    if (s.kind !== 'live') continue;
    const { a, b } = segmentEnds(s);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const d = DIR_VEC[s.dir];
    // Distances along the segment that are under a hop.
    const gaps: number[] = [];
    if (s.dir === 'E' || s.dir === 'W') {
      for (let cx = Math.min(s.fromCell.x, s.toCell.x) + 1; cx < Math.max(s.fromCell.x, s.toCell.x); cx++) {
        if (hops.has(`${cx},${s.fromCell.y}`)) gaps.push(Math.abs((cx + 0.5) * S - a.x));
      }
    }
    for (let p = off - period; p < len; p += period) {
      let p0 = Math.max(0, p);
      const p1 = Math.min(len, p + dash);
      if (p1 <= p0) continue;
      // Cut the dash around any hop.
      const pieces: [number, number][] = [[p0, p1]];
      for (const gc of gaps) {
        for (let i = pieces.length - 1; i >= 0; i--) {
          const [lo, hi] = pieces[i];
          if (hi <= gc - gapHalf || lo >= gc + gapHalf) continue;
          pieces.splice(i, 1);
          if (lo < gc - gapHalf) pieces.push([lo, gc - gapHalf]);
          if (hi > gc + gapHalf) pieces.push([gc + gapHalf, hi]);
        }
      }
      for (const [lo, hi] of pieces) {
        p0 = lo;
        g.moveTo(a.x + d.x * p0, a.y + d.y * p0).lineTo(a.x + d.x * hi, a.y + d.y * hi);
      }
    }
  }
  g.stroke({ color: 0xffe0e0, width: 2, alpha: 0.9 * dim, cap: 'round' });
}

/** Small direction chevrons used by the legend/help panel. */
export function drawChevron(g: Graphics, x: number, y: number, dir: Dir, size: number, color: number) {
  const ang = Math.atan2(DIR_VEC[dir].y, DIR_VEC[dir].x);
  arrowHead(g, x, y, ang, size, size * 0.6, color);
}
