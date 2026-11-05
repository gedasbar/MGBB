// Chunk 32b: which Free Fly boss rounds the balance bot's builds beat (docs/freefly-bosses.md section 6).
//   npx vite-node scripts/boss-bot.ts                       (default builds and boss waves)
//   HULLS=twin,hornet WAVES=10,20 SEEDS=1,2 LIMIT=240 npx vite-node scripts/boss-bot.ts
// Each run starts the world at the boss wave with the hull full (so it asks "can this build kill THIS boss", not "can it get here"),
// the bot dodges and aims at the boss's weak point, and the run ends when the boss dies, the hull is gone or LIMIT seconds pass.
// A cell is "kill time s" (E = it had enraged by then), "lost" (hull gone, with the boss HP left) or "limit".
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { standardBuild } from '../src/debug/hullBuilds';
import { bossAt } from '../src/data/bosses';
import { rng } from '../src/rng';

const HULLS = (process.env.HULLS ?? 'twin,hornet,mantis,halberd,corvette,shuttle,fan,zenith').split(',');
const WAVES = (process.env.WAVES ?? '10,20,30,40,50,60,70,80').split(',').map(Number);
const SEEDS = (process.env.SEEDS ?? '1').split(',').map(Number);
const LIMIT = Number(process.env.LIMIT ?? 240);

function fight(id: string, wave: number, seed: number): string {
  rng.reset(seed);
  const grid = standardBuild(id);
  if (!grid) return 'n/a';
  const w = new World({ grid, seed, startWave: wave });
  let guard = 0;
  // run in slices so we can stop the moment the boss dies
  while (!w.gameOver && guard++ < LIMIT * 4) {
    botRun(w, 0.25, []);
    if (w.bossesDefeated.length > 0) break;
    if (w.time - (wave - 1) * 40 > LIMIT) break;
  }
  const t = w.time - (wave - 1) * 40;
  if (w.bossesDefeated.length > 0) return `${t.toFixed(0)}s${t > 90 ? 'E' : ''}`;
  const left = w.boss ? Math.round((w.boss.hp / w.boss.maxHp) * 100) : 0;
  return w.gameOver ? `lost ${left}%` : `limit ${left}%`;
}

console.log(`Boss bot: seeds ${SEEDS.join(',')}, limit ${LIMIT} s. Cell = seconds to kill (E = after the enrage at 90 s) or how it ended with the boss's HP left.`);
console.log(['hull'.padEnd(8), ...WAVES.map(w => `${w} ${bossAt(w)!.def.id}${bossAt(w)!.round ? `+${bossAt(w)!.round}` : ''}`.padEnd(13))].join(' | '));
for (const id of HULLS) {
  const row = WAVES.map(w => SEEDS.map(s => fight(id, w, s)).join('/').padEnd(13));
  console.log([id.padEnd(8), ...row].join(' | '));
}
