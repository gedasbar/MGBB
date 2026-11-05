// Chunk 32b calibration: how fast does a build take a boss down, with the hull held up (god mode)? The boss HP lost over 60 s of
// fight gives an estimated kill time = 60 / fraction lost (it is longer than the real thing if the fight is shorter than that).
//   HULLS=zenith,fan WAVES=10,20 npx vite-node scripts/boss-rate.ts
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { standardBuild } from '../src/debug/hullBuilds';
import { bossAt } from '../src/data/bosses';
import { rng } from '../src/rng';

const HULLS = (process.env.HULLS ?? 'mantis,halberd,shuttle,fan,zenith').split(',');
const WAVES = (process.env.WAVES ?? '10,20,30,40').split(',').map(Number);
const SPAN = Number(process.env.SPAN ?? 60);
console.log(`Estimated seconds to kill (bot, hull held up, ${SPAN} s sample after the boss arrived)`);
console.log(['hull'.padEnd(8), ...WAVES.map(w => `${w} ${bossAt(w)!.def.id}`.padEnd(13))].join(' | '));
for (const id of HULLS) {
  const cells = WAVES.map(wave => {
    rng.reset(1);
    const w = new World({ grid: standardBuild(id)!, seed: 1, startWave: wave });
    w.god = true;
    while (w.boss === null || w.boss.entering) botRun(w, 0.25, []);
    const b = w.boss!;
    const hp0 = b.hp;
    let t = 0;
    while (t < SPAN && w.boss) { botRun(w, 0.25, []); t += 0.25; }
    if (!w.boss) return `${t.toFixed(0)}s (dead)`.padEnd(13);
    const lost = (hp0 - b.hp) / b.maxHp;
    return (lost > 0 ? `${(SPAN / lost).toFixed(0)}s` : 'never').padEnd(13);
  });
  console.log([id.padEnd(8), ...cells].join(' | '));
}
