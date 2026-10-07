import { Grid, GridCell } from '../engine/compiler';

export function buildShuttleGrid(): Grid {
  const w = 11;
  const h = 11;
  const cells: GridCell[] = new Array(w * h).fill(null).map((_, i) => ({
    x: i % w, y: Math.floor(i / w), blockId: null, level: 1, rotation: 0, type: 'void' as const,
  }));

  // Define a 5x5 center for the basic Shuttle
  for (let y = 3; y <= 7; y++) {
    for (let x = 3; x <= 7; x++) {
      cells[y * w + x].type = 'empty';
    }
  }

  // Hardcode generator and ejectors
  cells[7 * w + 5] = { x: 5, y: 7, blockId: 'generator', level: 1, rotation: 0, type: 'generator', facing: 'N' };

  cells[3 * w + 4] = { x: 4, y: 3, blockId: 'ejector', level: 1, rotation: 0, type: 'ejector', facing: 'N' };
  cells[3 * w + 5] = { x: 5, y: 3, blockId: 'ejector', level: 1, rotation: 0, type: 'ejector', facing: 'N' };
  cells[3 * w + 6] = { x: 6, y: 3, blockId: 'ejector', level: 1, rotation: 0, type: 'ejector', facing: 'N' };

  // Pre-fill a starter circuit
  cells[6 * w + 5].blockId = 'straight';
  cells[5 * w + 5].blockId = 'flat_plus';
  cells[4 * w + 5].blockId = 'straight';

  return { w, h, cells };
}
