import { Grid, GridCell } from '../engine/compiler';
import '../data/blocks';

/** First-tier Mitotic Rock HP. Starter shot = 101 dmg → 3 hits to kill. */
export const ROCK_HP = 250;
export const ROCK_RADIUS = 20;

/**
 * Hard-coded starter circuit (vertical, column 5):
 *   y=2 Ejector (N)
 *   y=3 Flat+ L1   (+100 damage)
 *   y=4 Straight
 *   y=5 Generator (N)
 */
export function buildStarterGrid(): Grid {
  const w = 11;
  const h = 11;
  const cells: GridCell[] = new Array(w * h).fill(null).map((_, i) => ({
    x: i % w, y: Math.floor(i / w), blockId: null, level: 1, rotation: 0, type: 'empty' as const,
  }));
  cells[5 * w + 5] = { x: 5, y: 5, blockId: 'generator', level: 1, rotation: 0, type: 'generator', facing: 'N' };
  cells[4 * w + 5] = { x: 5, y: 4, blockId: 'straight', level: 1, rotation: 0, type: 'empty' };
  cells[3 * w + 5] = { x: 5, y: 3, blockId: 'flat_plus', level: 1, rotation: 0, type: 'empty' };
  cells[2 * w + 5] = { x: 5, y: 2, blockId: 'ejector', level: 1, rotation: 0, type: 'ejector', facing: 'N' };
  return { w, h, cells };
}
