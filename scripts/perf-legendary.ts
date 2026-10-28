// Chunk 20a: update-time and projectile-count measurement of Mirror with splitters and Fork on a big hull (the Fan, 3 ejectors, 9 x 10 cells).
// Flies each circuit in the three bench scenarios of scripts/lib/dmgBench.ts and prints the milliseconds one World.update step takes
// (mean, median, 90th and 99th percentile; headless, software only, so a phone will be slower), the fps that mean allows, and the most
// projectiles alive at once (the pool limit is CONFIG.CAPS.PROJECTILES).
//   npm run perf-legendary            (SECS=n sets the seconds per half-run, default 12)
import { mkdirSync, writeFileSync } from 'fs';
import { bench, Scenario } from './lib/dmgBench';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import type { Grid } from '../src/engine/compiler';
import { compile } from '../src/engine/compiler';
import { CONFIG } from '../src/config';
import { neutralModifiers } from '../src/captains/modifiers';

const SECONDS = process.env.SECS ? Number(process.env.SECS) : 12;
const SCENARIOS: Scenario[] = ['big', 'cluster', 'split'];

/**
 * The Fan: Flat+, then `pre` in order up the middle column, then a Splitter 3 at (5,6) whose left and right outputs run along row 6 and
 * turn up at columns 2 and 8 into the side ejectors; the middle output goes on up column 5. Blocks go in path order.
 */
function fan(pre: string[], after: string[] = []): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  pre.forEach((id, k) => place(g, 5, 8 - k, id));
  place(g, 5, 8 - pre.length, 'splitter_3');
  place(g, 2, 8 - pre.length, 'turn_r');
  place(g, 8, 8 - pre.length, 'turn_l');
  after.forEach((id, k) => place(g, 5, 7 - pre.length - k, id));
  return g;
}

interface Row { name: string; ejectors: number; shotsPerPulse: number; mean: number; p50: number; p90: number; p99: number; maxAlive: number }
const rows: Row[] = [];
function measure(name: string, g: Grid) {
  const steps: number[] = [];
  let maxAlive = 0;
  const est = compile(g).stats.estDps;
  for (const sc of SCENARIOS) {
    const watch = { maxAlive: 0, stepMs: [] as number[] };
    bench(g, sc, { seconds: SECONDS, watch, modifiers: neutralModifiers() }, est);
    steps.push(...watch.stepMs.slice(30));
    maxAlive = Math.max(maxAlive, watch.maxAlive);
  }
  steps.sort((a, b) => a - b);
  const at = (q: number) => steps[Math.min(steps.length - 1, Math.floor(steps.length * q))];
  const c = compile(g);
  rows.push({
    name, ejectors: c.recipes.length, shotsPerPulse: c.stats.projectilesPerPulse,
    mean: steps.reduce((s, v) => s + v, 0) / steps.length, p50: at(0.5), p90: at(0.9), p99: at(0.99), maxAlive,
  });
}

measure('Splitter 3 + Fork on Impact', fan(['fork_impact']));
measure('Mirror + Splitter 3 + Fork on Impact', fan(['mirror', 'fork_impact']));
measure('Mirror + Splitter 3 + Fork x2 + Piercing x3', fan(['mirror', 'fork_impact', 'fork_impact', 'piercing', 'piercing', 'piercing']));
measure('Mirror + Splitter 3 + Fork + AoE Circle + Chain Lightning', fan(['mirror', 'fork_impact', 'aoe_circle', 'chain_lightning']));
measure('Mirror + Splitter 3 + Fork + Zigzag + Last Breath + Lone Shot', fan(['mirror', 'fork_impact', 'zigzag', 'last_breath', 'lone_shot']));

const f = (v: number) => v.toFixed(3);
const lines = [
  `# Chunk 20a: Mirror performance on the Fan hull (headless; ${SECONDS} s per half-run, three bench scenarios)`,
  '',
  `Pool limit: ${CONFIG.CAPS.PROJECTILES} projectiles. A step is one \`World.update\` at 1/60 s; 16.7 ms is the budget of 60 fps.`,
  '',
  '| circuit (Fan hull) | recipes | shots / pulse | mean ms | median | p90 | p99 | fps the mean allows | most alive |',
  '|---|---|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.name} | ${r.ejectors} | ${r.shotsPerPulse.toFixed(1)} | ${f(r.mean)} | ${f(r.p50)} | ${f(r.p90)} | ${f(r.p99)} | ${Math.round(1000 / r.mean)} | ${r.maxAlive} |`),
  '',
];
mkdirSync('reports/chunk20a', { recursive: true });
writeFileSync('reports/chunk20a/perf.md', lines.join('\n'));
console.log(lines.join('\n'));
