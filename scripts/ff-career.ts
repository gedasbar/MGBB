// Chunk 18b: the Free Fly bot on the career-matched builds of the difficulty audit (casual and builder buyer with the hero level
// of the position), for the game as it is. Run before and after a Free Fly change and compare.
// Run: OUT=reports/chunk18b/ff-today.json npx vite-node scripts/ff-career.ts     (POS=tier 30,tier 100 limits; SEEDS=1,2; FF_LIMIT=2400)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { computeRunModifiers } from '../src/captains/modifiers';
import { bestOwned, budgetAt, gridOfEntry, heroLevelFor, medalsAt } from './lib/difficultyModel';

const POSITIONS = (process.env.POS ?? 'tier 20,tier 30,tier 50,tier 75,tier 100').split(',');
const SEEDS = (process.env.SEEDS ?? '1,2').split(',').map(Number);
const LIMIT = Number(process.env.FF_LIMIT ?? 2400);
const OUT = process.env.OUT ?? 'reports/chunk18b/ff.json';

const out: Record<string, unknown>[] = [];
for (const pos of POSITIONS) {
  const e = Number(pos.split(' ')[1]);
  const hero = heroLevelFor(medalsAt(e));
  const budget = budgetAt(e);
  for (const fam of ['casual', 'builder'] as const) {
    const entry = bestOwned(budget, hero, fam === 'casual' ? 'std' : 'any');
    if (!entry) continue;
    const waves: number[] = [];
    for (const seed of SEEDS) {
      rng.reset(seed);
      const g = gridOfEntry(entry)!;
      waves.push(botRun(new World({ grid: g, seed, modifiers: computeRunModifiers(hero, []) }), LIMIT, []).wave);
    }
    const row = { position: pos, buyer: fam, hero, hull: entry.hull, copies: entry.copies, level: entry.level, fam: entry.fam, est: entry.est, waves };
    console.log(JSON.stringify(row));
    out.push(row);
  }
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
