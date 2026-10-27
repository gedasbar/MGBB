// Chunk 18b: how far the career-matched builds of the difficulty audit get on the Frontier. For each ring of a ladder, the bots
// try up to three wall squares on the axes (carve bot or clear-all bot passes; clear-all bot clears); a ring is passed / cleared
// when more than half of them are won. Run: POS="tier 100" npx vite-node scripts/frontier-reach.ts   (RINGS=100,200,...; BUYERS=casual,builder)
import { simulateWall } from '../src/wall/sim';
import { computeRunModifiers } from '../src/captains/modifiers';
import { bestOwned, budgetAt, frontierWalls, gridOfEntry, heroLevelFor, medalsAt } from './lib/difficultyModel';

const e = Number((process.env.POS ?? 'tier 100').split(' ')[1]);
const RINGS = (process.env.RINGS ?? '50,100,150,200,250,300,400,500,600,700,800,1000').split(',').map(Number);
const hero = heroLevelFor(medalsAt(e));
const ok = (s: string) => s === 'passed' || s === 'cleared';
for (const fam of (process.env.BUYERS ?? 'casual,builder').split(',') as ('casual' | 'builder')[]) {
  const entry = bestOwned(budgetAt(e), hero, fam === 'casual' ? 'std' : 'any')!;
  const mods = computeRunModifiers(hero, []);
  const sim = (l: Parameters<typeof simulateWall>[0], bot: 'carve' | 'clearAll') => simulateWall(l, gridOfEntry(entry)!, bot, { modifiers: mods });
  let line = `${fam} ${entry.hull} ${entry.fam} hero ${hero}:`;
  let passed = 0, cleared = 0;
  for (const r of RINGS) {
    const ws = frontierWalls(r);
    const p = ws.filter(l => ok(sim(l, 'carve').state) || ok(sim(l, 'clearAll').state)).length;
    const c = ws.filter(l => sim(l, 'clearAll').state === 'cleared').length;
    if (p * 2 > ws.length) passed = r;
    if (c * 2 > ws.length) cleared = r;
    line += ` ${r}:${p}/${c}of${ws.length}`;
  }
  console.log(line);
  console.log(`  => ${fam}: highest ring passed ${passed}, cleared ${cleared}`);
}
