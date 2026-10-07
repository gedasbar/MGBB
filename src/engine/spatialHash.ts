export class SpatialHash {
  cellSize: number;
  cols: number;
  rows: number;
  cells: Map<number, number[]>;

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Map();
  }

  clear() {
    this.cells.clear();
  }

  hash(x: number, y: number): number {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return col + row * this.cols;
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
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        const h = c + r * this.cols;
        const cell = this.cells.get(h);
        if (cell) {
          result.push(...cell);
        }
      }
    }
    return result;
  }
}
