/**
 * Uniform grid of ids. With `wrapW` set the x axis is a cylinder of that width: the cell size is stretched so a whole
 * number of columns fills it, columns are taken modulo that count, and a query near the seam also looks at the other side.
 */
export class SpatialHash {
  cellSize: number;
  cols: number;
  rows: number;
  cells: Map<number, number[]>;
  private wrap: boolean;
  /** Reused by wrapped queries to drop a column that two ends of the range both map to. */
  private seen = new Set<number>();

  constructor(width: number, height: number, cellSize: number, wrapW = 0) {
    this.wrap = wrapW > 0;
    this.cols = this.wrap ? Math.max(1, Math.floor(wrapW / cellSize)) : Math.ceil(width / cellSize);
    this.cellSize = this.wrap ? wrapW / this.cols : cellSize;
    this.rows = Math.ceil(height / this.cellSize);
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  private col(x: number): number {
    const c = Math.floor(x / this.cellSize);
    if (!this.wrap) return c;
    return ((c % this.cols) + this.cols) % this.cols;
  }

  hash(x: number, y: number): number {
    return this.col(x) + Math.floor(y / this.cellSize) * this.cols;
  }

  insert(id: number, x: number, y: number) {
    const h = this.hash(x, y);
    let cell = this.cells.get(h);
    if (!cell) {
      cell = [];
      this.cells.set(h, cell);
    }
    cell.push(id);
  }

  query(x: number, y: number, radius: number): number[] {
    const minCol = Math.floor((x - radius) / this.cellSize);
    const maxCol = Math.floor((x + radius) / this.cellSize);
    const minRow = Math.floor((y - radius) / this.cellSize);
    const maxRow = Math.floor((y + radius) / this.cellSize);

    const result: number[] = [];
    const seen = this.seen;
    if (this.wrap) seen.clear();
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        let cc = c;
        if (this.wrap) {
          cc = ((c % this.cols) + this.cols) % this.cols;
          const key = cc + r * this.cols;
          if (seen.has(key)) continue;
          seen.add(key);
        }
        const cell = this.cells.get(cc + r * this.cols);
        if (cell) {
          result.push(...cell);
        }
      }
    }
    return result;
  }
}
