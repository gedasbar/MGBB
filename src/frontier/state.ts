import { rollMedals } from '../captains/state';
import { FRONTIER_SEED } from './constants';
import { getWorld, NEIGHBOURS, parseKey, sqKey } from './world';

/** Stored per square: 1 = passed, 2 = cleared. Squares never played are absent (sparse). */
export const SQ_PASSED = 1;
export const SQ_CLEARED = 2;

/** The Frontier part of the save (v7). */
export interface FrontierSave {
  seed: number;
  sq: Record<string, 1 | 2>;
}

export type SquareState = 'hole' | 'locked' | 'available' | 'passed' | 'cleared';

export const defaultFrontier = (): FrontierSave => ({ seed: FRONTIER_SEED, sq: {} });

/** Validates untrusted save data. Bad keys, bad values, holes and the origin (always cleared) are dropped. */
export function sanitizeFrontier(raw: unknown): FrontierSave {
  const out = defaultFrontier();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  if (typeof r.seed === 'number' && Number.isInteger(r.seed)) out.seed = r.seed;
  const world = getWorld(out.seed);
  if (r.sq && typeof r.sq === 'object') {
    for (const [k, v] of Object.entries(r.sq as Record<string, unknown>)) {
      const p = parseKey(k);
      if (!p || (v !== SQ_PASSED && v !== SQ_CLEARED)) continue;
      if ((p.x === 0 && p.y === 0) || world.isHole(p.x, p.y)) continue;
      out.sq[sqKey(p.x, p.y)] = v;
    }
  }
  return out;
}

/** Stored value of a square, the origin counting as cleared. */
function stored(f: FrontierSave, x: number, y: number): number {
  if (x === 0 && y === 0) return SQ_CLEARED;
  return f.sq[sqKey(x, y)] ?? 0;
}

export function squareState(f: FrontierSave, x: number, y: number): SquareState {
  const world = getWorld(f.seed);
  if (world.isHole(x, y)) return 'hole';
  const s = stored(f, x, y);
  if (s === SQ_CLEARED) return 'cleared';
  if (s === SQ_PASSED) return 'passed';
  for (const [dx, dy] of NEIGHBOURS) if (stored(f, x + dx, y + dy) > 0) return 'available';
  return 'locked';
}

/** A square can be played when it is available, passed or cleared (never locked, never a hole). */
export const canPlay = (f: FrontierSave, x: number, y: number) => {
  const s = squareState(f, x, y);
  return s === 'available' || s === 'passed' || s === 'cleared';
};

/** The Medal marker is shown on a medal square until it is cleared (a passed medal square keeps it). */
export const medalShown = (f: FrontierSave, x: number, y: number) => getWorld(f.seed).hasMedal(x, y) && squareState(f, x, y) !== 'cleared';

export interface SquareRunOutcome {
  /** The run was booked (false for a locked square or a hole). */
  ok: boolean;
  newlyPassed: boolean;
  newlyCleared: boolean;
  /** Medals paid (0, 1, or 2 when the captain's doubling fired). */
  medals: number;
  medalDoubled: boolean;
}

/**
 * Books a run's result on the square (credits are booked by the caller, as for every wall run). Pass → passed; clear →
 * cleared and, the first time on a medal square, its Medal. Either opens the N/E/S/W neighbours (squareState derives that).
 */
export function applySquareRun(
  f: FrontierSave, x: number, y: number, run: { cleared: boolean; passed: boolean; medalDouble?: number; rand?: () => number },
): SquareRunOutcome {
  const none: SquareRunOutcome = { ok: false, newlyPassed: false, newlyCleared: false, medals: 0, medalDoubled: false };
  if (!canPlay(f, x, y)) return none;
  const out: SquareRunOutcome = { ...none, ok: true };
  const before = stored(f, x, y);
  const k = sqKey(x, y);
  if (run.cleared) {
    if (before < SQ_CLEARED) {
      f.sq[k] = SQ_CLEARED;
      out.newlyCleared = true;
      out.newlyPassed = before < SQ_PASSED;
      if (getWorld(f.seed).hasMedal(x, y)) {
        const a = rollMedals(1, run.medalDouble ?? 0, run.rand ?? Math.random);
        out.medals = a.medals;
        out.medalDoubled = a.doubled;
      }
    }
  } else if (run.passed && before < SQ_PASSED) {
    f.sq[k] = SQ_PASSED;
    out.newlyPassed = true;
  }
  return out;
}

/** Every available square: they are always next to a passed / cleared square (or the origin), so this is exact. */
export function availableSquares(f: FrontierSave): { x: number; y: number }[] {
  const seen = new Set<string>();
  const out: { x: number; y: number }[] = [];
  const sources = [{ x: 0, y: 0 }, ...Object.keys(f.sq).map(k => parseKey(k)!).filter(Boolean)];
  for (const s of sources) {
    for (const [dx, dy] of NEIGHBOURS) {
      const x = s.x + dx;
      const y = s.y + dy;
      const k = sqKey(x, y);
      if (seen.has(k)) continue;
      seen.add(k);
      if (squareState(f, x, y) === 'available') out.push({ x, y });
    }
  }
  return out;
}

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** The available medal square nearest to `from` (null when none). Ties: the first in key order. */
export function nearestMedalSquare(f: FrontierSave, from: { x: number; y: number }): { x: number; y: number } | null {
  const w = getWorld(f.seed);
  let best: { x: number; y: number } | null = null;
  for (const s of availableSquares(f)) if (w.hasMedal(s.x, s.y) && (!best || dist2(s, from) < dist2(best, from))) best = s;
  return best;
}

/** The available square farthest from the origin (by ring, then by distance): the edge of the explored area. */
export function frontierSquare(f: FrontierSave): { x: number; y: number } | null {
  const o = { x: 0, y: 0 };
  let best: { x: number; y: number } | null = null;
  let bestScore = -1;
  for (const s of availableSquares(f)) {
    const score = Math.max(Math.abs(s.x), Math.abs(s.y)) * 1e6 + dist2(s, o);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return best;
}

/** Counts for the summary line: squares passed (cleared included) and cleared, the origin not counted. */
export function frontierCounts(f: FrontierSave): { passed: number; cleared: number } {
  let passed = 0;
  let cleared = 0;
  for (const v of Object.values(f.sq)) { passed++; if (v === SQ_CLEARED) cleared++; }
  return { passed, cleared };
}
