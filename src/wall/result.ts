/** What a wall level looks like to the end-of-level check. */
export interface WallProgress {
  /** Live blocks left. */
  alive: number;
  /** Screen y of the ship's hit point. */
  shipY: number;
  /** Screen y of the (invisible) pass line: the ship is past the wall once it is above it. */
  finishY: number;
}

/**
 * Chunk 16a: the one rule for "is the level won": every block destroyed is CLEARED (and beats a pass that happens in the same
 * step), the ship above the pass line is PASSED, otherwise null (still playing). A crash is decided elsewhere (it needs the
 * blocks the ship touches, and it comes after CLEARED but before PASSED).
 */
export function wallResult(p: WallProgress): 'cleared' | 'passed' | null {
  if (p.alive <= 0) return 'cleared';
  if (p.shipY < p.finishY) return 'passed';
  return null;
}
