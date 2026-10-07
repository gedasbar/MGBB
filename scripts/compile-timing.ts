// Prints the average compile time on the busiest test board. Run: npx vite-node scripts/compile-timing.ts
import { compile } from '../src/engine/compiler';
import { parseLayout } from '../src/game/gridUtils';
import { place } from '../src/game/starter';

const g = parseLayout(new Array(11).fill('_'.repeat(11)));
g.cells[10 * 11 + 5].type = 'generator';
g.cells[10 * 11 + 5].facing = 'N';
for (let col = 0; col < 11; col++) { g.cells[col].type = 'ejector'; g.cells[col].facing = 'N'; }
// Worst case: every buildable cell holds a splitter, so the signal fans out through the whole board.
for (let row = 2; row <= 10; row++) for (let col = 1; col <= 11; col++) place(g, col, row, (col + row) % 2 === 0 ? 'splitter_3' : 'splitter_2');
for (let i = 0; i < 50; i++) compile(g);
const runs = 1000;
const t0 = performance.now();
let segs = 0;
for (let i = 0; i < runs; i++) segs = compile(g).segments.length;
const avg = (performance.now() - t0) / runs;
console.log(`11x11 fully built board: ${segs} segments, average compile ${avg.toFixed(3)} ms over ${runs} runs (limit 5 ms)`);
