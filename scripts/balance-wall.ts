// Prints the campaign pacing table for the carve-a-path rules (chunk 6c).
// Run: npm run balance-wall
import { compile } from '../src/engine/compiler';
import { buildStarterGrid } from '../src/game/starter';
import { BOOST_MAX, CELL, FINISH_MARGIN_CELLS, VIEW_H, WALL_COLS } from '../src/wall/constants';
import { generateLevel } from '../src/wall/generator';
import { rewardPerBlock } from '../src/wall/level';
import { blockCost, simulateWall } from '../src/wall/sim';

const grid = buildStarterGrid();
const starterDps = compile(grid).stats.estDps;
const SHIP_MARGIN = 24;
const SHIP_BOTTOM = VIEW_H - SHIP_MARGIN;

const columnCosts = (l: ReturnType<typeof generateLevel>) => {
  const out: number[] = new Array(WALL_COLS).fill(0);
  l.cells.forEach((c, i) => { if (c) out[i % WALL_COLS] += blockCost(c); });
  return out;
};

console.log(`Starter gun: est. ${starterDps.toFixed(0)} DPS (all shots landing). Effective HP counts shields and doubles armored HP.`);
console.log('Pass = carve the cheapest straight column while the wall crosses at max boost (x' + BOOST_MAX + ' with the ship at the top).');
console.log('Clear = destroy every block before the wall\'s lowest edge reaches a ship parked at the bottom of the screen.\n');
console.log('Tier | name            | rows | base px/s | cross s (max boost) | cheapest col HP | median col HP | pass DPS | ratio | total eff. HP | clear s avail | clear DPS | ratio | bot carve | bot clear-all');

let cumulative = 0;
for (const t of [1, 5, 10, 20, 30, 50, 75, 100]) {
  const l = generateLevel(t);
  const cols = columnCosts(l);
  const sorted = [...cols].sort((a, b) => a - b);
  const cheapest = sorted[0];
  const median = sorted[Math.floor(sorted.length / 2)];
  const total = cols.reduce((s, v) => s + v, 0);
  // Distance the wall must travel until the finish line has passed a ship at the top margin.
  const travel = l.rows * CELL + FINISH_MARGIN_CELLS * CELL + SHIP_MARGIN;
  const crossBoost = travel / (l.approachSpeed * BOOST_MAX);
  const passDps = cheapest / crossBoost;
  const clearTime = (SHIP_BOTTOM - 7) / l.approachSpeed; // until the wall's first row reaches a ship at the bottom
  const clearDps = total / clearTime;
  const carve = simulateWall(l, grid, 'carve');
  const all = simulateWall(l, grid, 'clearAll');
  const f = (r: ReturnType<typeof simulateWall>) => `${r.state} ${r.time.toFixed(0)}s ${Math.floor((r.destroyed / r.total) * 100)}%`;
  console.log(`${String(t).padStart(4)} | ${String(l.name).padEnd(15)} | ${String(l.rows).padStart(4)} | ${l.approachSpeed.toFixed(0).padStart(9)} | ${crossBoost.toFixed(1).padStart(19)} | ${cheapest.toFixed(0).padStart(15)} | ${median.toFixed(0).padStart(13)} | ${passDps.toFixed(0).padStart(8)} | ${(passDps / starterDps).toFixed(2).padStart(5)} | ${total.toFixed(0).padStart(13)} | ${clearTime.toFixed(1).padStart(13)} | ${clearDps.toFixed(0).padStart(9)} | ${(clearDps / starterDps).toFixed(2).padStart(5)} | ${f(carve).padEnd(16)} | ${f(all)}`);
}

// Template sanity: the cheapest column against its neighbours, over every tier.
console.log('\nCheapest column vs the median column, tiers where it is under 25% of the median (a lane that is nearly free):');
const odd: string[] = [];
let worst = 1;
for (let t = 1; t <= 100; t++) {
  const l = generateLevel(t);
  const sorted = [...columnCosts(l)].sort((a, b) => a - b);
  const ratio = sorted[0] / sorted[Math.floor(sorted.length / 2)];
  worst = Math.min(worst, ratio);
  if (ratio < 0.25) odd.push(`${t} ${l.name} ${(ratio * 100).toFixed(0)}%`);
}
console.log(odd.length ? odd.join(', ') : 'none');
console.log(`lowest ratio over all tiers: ${(worst * 100).toFixed(0)}%`);

for (let t = 1; t <= 100; t++) cumulative += generateLevel(t).cells.filter(Boolean).length * rewardPerBlock(t);
console.log(`\nFull-clear credits of all 100 tiers once: ${cumulative.toFixed(0)}`);
