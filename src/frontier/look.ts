import { PROGRESS_COLOR, TileStyle } from './constants';
import type { SquareKind } from './level';
import type { SquareState } from './state';

/**
 * The look of a Frontier square (chunks 15a-fix / 15b): neutral greys, and one progress colour (lavender) for passed
 * (outline) and cleared (fill). Pure, so the colours are unit-tested; the screen only places sprites.
 */

/** Locked: just above the background (#1c1c1e), the inner mark barely visible. */
export const LOCKED_PLATE = 0x2b2b2e;
export const LOCKED_INNER = 0x232326;
/** Available (and passed): a clearly lighter plate with the dark inner mark. */
export const AVAIL_PLATE = 0x5e5e64;
export const INNER = 0x26262a;

export type InnerShape = 'square' | 'round' | 'dot';

export interface TileLook {
  /** Outline colour drawn around the plate (passed), or null. */
  edge: number | null;
  /** The plate (or the whole tile when flat / far). */
  plate: number;
  /** The inner mark: a square (wall), a round dot (Free Fly), a small dot (Free Fly, flat style), or none. */
  inner: { shape: InnerShape; color: number } | null;
}

/** Tile look of a square that is not a hole. `far` = below FAR_ZOOM, where a square is one flat tile (plus the outline). */
export function tileLook(state: Exclude<SquareState, 'hole'>, kind: SquareKind, style: TileStyle, far: boolean): TileLook {
  const locked = state === 'locked';
  const plate = state === 'cleared' ? PROGRESS_COLOR : locked ? LOCKED_PLATE : AVAIL_PLATE;
  const edge = state === 'passed' ? PROGRESS_COLOR : null;
  let inner: TileLook['inner'] = null;
  if (!far && state !== 'cleared') {
    const color = locked ? LOCKED_INNER : INNER;
    if (style === 'plate') inner = { shape: kind === 'freefly' ? 'round' : 'square', color };
    else if (kind === 'freefly') inner = { shape: 'dot', color };
  }
  return { edge, plate, inner };
}
