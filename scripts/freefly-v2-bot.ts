// Chunk 32a: how far the Free Fly bot gets with two builds. Run on origin/main (before) and on this branch (after):
//   npx vite-node scripts/freefly-v2-bot.ts            (this branch)
//   NO_DODGE=1 npx vite-node scripts/freefly-v2-bot.ts (this branch, a bot that ignores enemy bullets)
// Only APIs that exist on both sides are used (bullet hits are read when the world has them).
import { World } from '../src/game/world';
import { botRun, BOT_OPTS } from '../src/debug/freeflyBot';
import { standardBuild } from '../src/debug/hullBuilds';
import { rng } from '../src/rng';

if (process.env.NO_DODGE && BOT_OPTS) BOT_OPTS.dodgeBullets = false;
const SEEDS = [1, 2, 3];
const LIMIT = Number(process.env.LIMIT ?? 1500);
const HULLS = (process.env.HULLS ?? 'twin,shuttle').split(',');
console.log(`Free Fly bot, ${SEEDS.length} seeds, cap ${LIMIT} s, bot ${!BOT_OPTS ? 'predates enemy bullets' : BOT_OPTS.dodgeBullets ? 'dodges enemy bullets' : 'ignores enemy bullets'}`);
console.log('hull    | seed | wave | survived s | credits | kills | bullet hits | cause');
for (const id of HULLS) {
  const waves: number[] = [], times: number[] = [];
  for (const seed of SEEDS) {
    rng.reset(seed);
    const w = new World({ grid: standardBuild(id)!, seed });
    const r = botRun(w, LIMIT, []);
    waves.push(r.wave); times.push(r.time);
    const hits = (w as unknown as { bulletHits?: number }).bulletHits ?? 0;
    console.log(`${id.padEnd(7)} | ${String(seed).padStart(4)} | ${String(r.wave).padStart(4)} | ${r.time.toFixed(0).padStart(10)} | ${String(r.credits).padStart(7)} | ${String(r.kills).padStart(5)} | ${String(hits).padStart(11)} | ${r.died ? 'hull gone' : 'cap'}`);
  }
  console.log(`${id.padEnd(7)} | mean | ${(waves.reduce((a, b) => a + b, 0) / waves.length).toFixed(1).padStart(4)} | ${(times.reduce((a, b) => a + b, 0) / times.length).toFixed(0).padStart(10)}`);
}
