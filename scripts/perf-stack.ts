// Chunk 16c-2: how heavy can a stacked build get? Engine time per update (no rendering) in Free Fly at a late wave, plain build against
// stacked shape-block builds, and how full the projectile pool gets. Run: npx vite-node scripts/perf-stack.ts
// The browser frame rate with the same builds is measured by e2e/block-economy.e2e.cjs (rendering included).
import { performance } from 'node:perf_hooks';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { World } from '../src/game/world';
import { CONFIG } from '../src/config';
import { rng } from '../src/rng';
import type { Grid } from '../src/engine/compiler';

const DT = 1 / 60;
const FRAMES = 1800; // 30 s of play
const WAVE = 25;

/** A line up the Fan's middle column (rows 9 down to 2): the block ids in path order. */
function fanLine(ids: string[]): Grid {
  const g = HULL_BUILDERS.fan();
  ids.forEach((id, k) => place(g, 5, 9 - k, id));
  return g;
}

/** The Fan's long snake (51 straight cells, see economy-audit.ts) with `id` on every straight cell: the most copies one line can hold. */
function fanSnakeOf(id: string): Grid {
  const g = HULL_BUILDERS.fan();
  const path: { x: number; y: number; turn: number }[] = [{ x: 4, y: 8, turn: -1 }];
  for (let x = 3; x >= 1; x--) path.push({ x, y: 8, turn: 0 });
  path.push({ x: 0, y: 8, turn: 1 });
  let east = true;
  for (let y = 7; y >= 2; y--) {
    const start = east ? 0 : 8, end = east ? 8 : 0;
    path.push({ x: start, y, turn: east ? 1 : -1 });
    for (let x = start + (east ? 1 : -1); x !== end; x += east ? 1 : -1) path.push({ x, y, turn: 0 });
    path.push({ x: end, y, turn: east ? -1 : 1 });
    east = !east;
  }
  path.push({ x: 0, y: 1, turn: 1 });
  for (let x = 1; x <= 6; x++) path.push({ x, y: 1, turn: 0 });
  path.push({ x: 7, y: 1, turn: -1 });
  for (const p of path) place(g, p.x + 1, p.y + 1, p.turn === 0 ? id : p.turn < 0 ? 'turn_l' : 'turn_r');
  return g;
}

const BUILDS: [string, string[] | Grid][] = [
  ['plain: Flat+, Percent x', ['flat_plus', 'percent_mult']],
  ['Piercing x6', ['flat_plus', 'percent_mult', ...Array(6).fill('piercing')]],
  ['Fork x6', ['flat_plus', 'percent_mult', ...Array(6).fill('fork_impact')]],
  ['AoE Circle x6', ['flat_plus', 'percent_mult', ...Array(6).fill('aoe_circle')]],
  ['Chain x6', ['flat_plus', 'percent_mult', ...Array(6).fill('chain_lightning')]],
  ['Bouncing x6', ['flat_plus', 'percent_mult', ...Array(6).fill('bouncing')]],
  ['heavy mix: Fork x3, Piercing x2, AoE x1, Bouncing x2 (8 cells)', ['fork_impact', 'fork_impact', 'fork_impact', 'piercing', 'piercing', 'aoe_circle', 'bouncing', 'bouncing']],
  ['worst case in a straight line: Fork x7 after a Flat+', ['flat_plus', ...Array(7).fill('fork_impact')]],
  ['absurd: Fork x51 on the Fan snake', fanSnakeOf('fork_impact')],
  ['absurd: Piercing x51 on the Fan snake', fanSnakeOf('piercing')],
  ['absurd: Chain Lightning x51 on the Fan snake', fanSnakeOf('chain_lightning')],
  ['absurd: AoE Circle x51 on the Fan snake', fanSnakeOf('aoe_circle')],
];

function run(build: string[] | Grid) {
  rng.reset(1);
  const w = new World({ grid: Array.isArray(build) ? fanLine(build) : build, seed: 1, startWave: WAVE });
  w.god = true;
  w.hull = 1e12;
  const p = { x: CONFIG.VIEW.W / 2, y: 800, active: true, type: 'mouse' as const, seen: true };
  const times: number[] = [];
  let peak = 0;
  let hits = 0;
  w.projSys.onHit = () => { hits++; };
  for (let i = 0; i < FRAMES; i++) {
    p.x = CONFIG.VIEW.W / 2 + Math.sin(i / 60) * 200;
    const t0 = performance.now();
    w.update(DT, p);
    times.push(performance.now() - t0);
    w.hits.length = 0; w.splits.length = 0; w.killEvents.length = 0; w.waveEvents.length = 0;
    if (w.pool.count > peak) peak = w.pool.count;
  }
  times.sort((a, b) => a - b);
  const mean = times.reduce((a, b) => a + b, 0) / times.length;
  return { mean, p99: times[Math.floor(times.length * 0.99)], max: times[times.length - 1], peak, bodies: w.mitosis.enemies.length, hits };
}

console.log(`Free Fly wave ${WAVE}, ${FRAMES} frames (${FRAMES / 60} s), ship sweeping, pool limit ${CONFIG.CAPS.PROJECTILES} projectiles. Engine update only (no rendering), ms per frame; budget at 60 fps = 16.7 ms.\n`);
console.log('| build | mean ms | p99 ms | max ms | peak projectiles | bodies at the end | hits |');
console.log('|---|---|---|---|---|---|---|');
for (const [name, build] of BUILDS) {
  run(build); // warm up the JIT, then measure
  const r = run(build);
  console.log(`| ${name} | ${r.mean.toFixed(2)} | ${r.p99.toFixed(2)} | ${r.max.toFixed(2)} | ${r.peak} | ${r.bodies} | ${r.hits} |`);
}
