// Chunk 28b: does the 3x Crosswind still leave a way through? READ-ONLY for game code.
//   npx vite-node scripts/crosswind-check.ts
// For every Crosswind tier (its real acceleration and side): a ship holds still 400 px below a wall of tier-115 blocks that never moves and fires a plain gun straight up
// the column above it. Prints the damage that reaches that column in 3 s, as a share of the no-wind damage, for no counter and for each counter. (The carve / clear-all
// bots of effect-types-bots.ts fly point-blank at the wall, where the wind hardly matters; this is the long-range case the wind is for.)
import { lateSlot, lateTypeTiers } from '../src/data/lateTiers';
import { generateLevel } from '../src/wall/generator';
import { COUNTERS, laneDamage } from './lib/crosswind';

const tiers = lateTypeTiers().filter(t => lateSlot(t)!.type === 'crosswind');
const base = laneDamage([], 0);
console.log(`no wind, plain gun: ${base.toFixed(0)} damage in the lane`);
for (const t of tiers) {
  const accel = generateLevel(t).effects!.crosswind!.accel;
  const row = COUNTERS.map(([n, ids]) => `${n} ${(laneDamage(ids, accel) / base * 100).toFixed(0)}%`);
  console.log(`tier ${t} (accel ${accel}): ${row.join(' | ')}`);
}
