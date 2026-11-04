import { Graphics } from 'pixi.js';
import { CATEGORY_COLOR, THEME } from '../ui/theme';
import { CHUNK_BY_ID } from '../data/shipChunks';

/** Chunk 31b: how a chunk's 3x3 pattern is drawn (palette tiles, grid slots and the cell-mode grid). Flat squares, no glow: the hull-picker preview colours. */
export const CHUNK_CELL_COLOR: Record<string, number> = { _: 0x8a8a90, G: THEME.bad, E: CATEGORY_COLOR.damage };
const GAP = 2;

/** Draws one cell character (`_`, `G`, `E`; `.` draws nothing) into a square at (x, y) of `size` px. */
export function drawCell(g: Graphics, ch: string, x: number, y: number, size: number): Graphics {
  const color = CHUNK_CELL_COLOR[ch];
  if (color === undefined) return g;
  return g.rect(x + GAP / 2, y + GAP / 2, size - GAP, size - GAP).fill(color);
}

/** Draws a pattern (rows of cell characters) centred on (cx, cy) inside a square of `side` px. */
export function drawPattern(g: Graphics, rows: readonly string[], cx: number, cy: number, side: number): Graphics {
  const n = Math.max(rows.length, rows[0]?.length ?? 1);
  const size = side / n;
  rows.forEach((row, y) => [...row].forEach((ch, x) => drawCell(g, ch, cx - side / 2 + x * size, cy - side / 2 + y * size, size)));
  return g;
}

/** A palette tile face: the chunk's pattern, a little smaller than the tile. */
export function drawChunkFace(g: Graphics, id: string, size: number) {
  const c = CHUNK_BY_ID[id];
  if (c) drawPattern(g, c.rows, 0, 0, size * 0.82);
}
