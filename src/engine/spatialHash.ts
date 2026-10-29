/**
 * A uniform grid of cells holding entity ids, rebuilt every frame. Chunk 21b: flat typed arrays (a head per cell and a linked list of
 * entries), so `clear` and `insert` allocate nothing once the entry arrays have grown, and `queryInto` fills a list the caller owns.
 * A position outside the grid is put in the nearest border cell and a query range is clamped the same way, so a query never misses an
 * entity that is within its radius (it may return some that are not: callers still measure the distance).
 */
export class SpatialHash {
  cellSize: number;
  cols: number;
  rows: number;
  private head: Int32Array;
  private tail: Int32Array;
  private next: Int32Array;
  private ids: Int32Array;
  private n = 0;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.head = new Int32Array(this.cols * this.rows).fill(-1);
    this.tail = new Int32Array(this.cols * this.rows);
    this.next = new Int32Array(256);
    this.ids = new Int32Array(256);
  }

  clear() {
    if (this.n > 0) this.head.fill(-1);
    this.n = 0;
  }

  /** Number of entities inserted since the last clear. */
  get size(): number { return this.n; }

  private col(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.cols ? this.cols - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor(y / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  insert(id: number, x: number, y: number) {
    if (this.n === this.ids.length) {
      const grow = (a: Int32Array) => { const b = new Int32Array(a.length * 2); b.set(a); return b; };
      this.ids = grow(this.ids);
      this.next = grow(this.next);
    }
    const cell = this.col(x) + this.row(y) * this.cols;
    const k = this.n++;
    this.ids[k] = id;
    this.next[k] = -1;
    // Appended at the cell's tail: entities come back in insertion order, as they did when a cell was an array.
    if (this.head[cell] < 0) this.head[cell] = k; else this.next[this.tail[cell]] = k;
    this.tail[cell] = k;
  }

  /** Fills `out` (cleared first) with the ids of every entity in the cells the circle (x, y, radius) reaches. Returns `out`. */
  queryInto(x: number, y: number, radius: number, out: number[]): number[] {
    out.length = 0;
    const c0 = this.col(x - radius), c1 = this.col(x + radius);
    const r0 = this.row(y - radius), r1 = this.row(y + radius);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        for (let k = this.head[c + r * this.cols]; k >= 0; k = this.next[k]) out.push(this.ids[k]);
      }
    }
    return out;
  }

  /** The same as `queryInto` with a new list each call (tests and one-off callers; hot loops use `queryInto`). */
  query(x: number, y: number, radius: number): number[] {
    return this.queryInto(x, y, radius, []);
  }
}
