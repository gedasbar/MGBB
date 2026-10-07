const { spawnSync } = require('child_process');
const code = `
import { compile } from './src/engine/compiler.ts';
import { BLOCKS } from './src/data/blocks.ts';
import { buildShuttleGrid } from './src/game/gridUtils.ts';

const grid = buildShuttleGrid();
grid.cells[5*11+5].blockId = 'splitter_2';

const res = compile(grid);
console.log('Recipes:', res.recipes.length);
console.log('Warnings:', res.warnings);
console.log('Edges:', res.edges.map(e => \`\${e.x},\${e.y} -> \${e.outDir}\`));
`;
const fs = require('fs');
fs.writeFileSync('temp.ts', code);
