import { validateHullLayout } from '../data/hullValidate';
import { CELL_MODE_DEFAULT_H, CELL_MODE_DEFAULT_W, CELL_MODE_MAX } from './constants';

/**
 * Debug cell mode of the Shipyard (chunk 31b, only with ?debug=1): the grid is single cells instead of chunks, so a new hull layout can be drawn by hand,
 * checked with the same `validateHullLayout` every normal hull passes, exported as ROWS text for src/data/hullLayouts.ts, and flown without saving.
 * Pure: no Pixi, no DOM, no ownership, no Cores.
 */
export type Cell = '.' | '_' | 'G' | 'E';
/** One tap moves a cell to the next in this order: outside -> buildable -> generator -> ejector -> outside. */
export const CELL_CYCLE: readonly Cell[] = ['.', '_', 'G', 'E'];

const clampSize = (n: number) => Math.max(1, Math.min(CELL_MODE_MAX, Math.floor(n)));

export class CellEditor {
  w: number;
  h: number;
  /** Row-major, h rows of w cells. */
  cells: Cell[];

  constructor(w = CELL_MODE_DEFAULT_W, h = CELL_MODE_DEFAULT_H) {
    this.w = clampSize(w);
    this.h = clampSize(h);
    this.cells = new Array<Cell>(this.w * this.h).fill('.');
  }

  get(x: number, y: number): Cell { return x >= 0 && y >= 0 && x < this.w && y < this.h ? this.cells[y * this.w + x] : '.'; }

  /** Sets one cell (anything that is not a cell character becomes outside); a point outside the grid is ignored. */
  set(x: number, y: number, ch: string) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.cells[y * this.w + x] = (CELL_CYCLE as readonly string[]).includes(ch) ? (ch as Cell) : '.';
  }

  /** Moves the cell to the next kind in the cycle; returns the new kind (null when the tap is outside the grid). */
  cycle(x: number, y: number): Cell | null {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = y * this.w + x;
    const next = CELL_CYCLE[(CELL_CYCLE.indexOf(this.cells[i]) + 1) % CELL_CYCLE.length];
    this.cells[i] = next;
    return next;
  }

  /** Changes the size (1 to CELL_MODE_MAX each way). Cells keep their place from the top-left; new ones are outside. */
  resize(w: number, h: number) {
    const nw = clampSize(w), nh = clampSize(h);
    const next = new Array<Cell>(nw * nh).fill('.');
    for (let y = 0; y < Math.min(nh, this.h); y++) for (let x = 0; x < Math.min(nw, this.w); x++) next[y * nw + x] = this.cells[y * this.w + x];
    this.w = nw; this.h = nh; this.cells = next;
  }

  clear() { this.cells.fill('.'); }

  /** All rows as drawn, one string each. */
  rawRows(): string[] {
    return Array.from({ length: this.h }, (_, y) => this.cells.slice(y * this.w, (y + 1) * this.w).join(''));
  }

  /** The layout as a hull file wants it: empty rows at the top and empty columns at the sides cut away, the bottom row kept (the generator belongs there). */
  rows(): string[] {
    const raw = this.rawRows();
    let top = 0;
    while (top < raw.length - 1 && !/[^.]/.test(raw[top])) top++;
    let left = this.w, right = -1;
    for (const r of raw) for (let x = 0; x < r.length; x++) if (r[x] !== '.') { left = Math.min(left, x); right = Math.max(right, x); }
    if (right < 0) return raw.slice(top);
    return raw.slice(top).map(r => r.slice(left, right + 1));
  }

  /** Mistakes in plain words, the same checks and sentences as the hull layouts (data/hullValidate.ts); empty = a valid hull. */
  problems(): string[] {
    if (!this.cells.some(c => c !== '.')) return ['Cell mode: the layout is empty; tap cells to draw a hull'];
    return validateHullLayout('Cell mode', this.rows());
  }

  count(ch: Cell): number { return this.cells.filter(c => c === ch).length; }

  /** The layout as a block of text to paste into src/data/hullLayouts.ts (the same shape as the hulls there). */
  exportText(constName = 'MY_HULL'): string {
    const body = this.rows().map(r => `  '${r}',`).join('\n');
    return `// ${constName} - idea: TODO\nconst ${constName}_ROWS = [\n${body}\n];\n`;
  }
}
