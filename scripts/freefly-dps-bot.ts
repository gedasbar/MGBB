// Chunk 32d: how deep does the Free Fly bot get with a build of a given estimated DPS? The Zenith standard build is scaled (damage multiplier) to each target.
//   TARGETS=1e6,4e6,1.6e7 SEEDS=1,2 LIMIT=3600 HULL=zenith npx vite-node scripts/freefly-dps-bot.ts
import { compile } from '../src/engine/compiler';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { standardBuild } from '../src/debug/hullBuilds';
import { neutralModifiers } from '../src/captains/modifiers';
import { rng } from '../src/rng';
import { fmtBig } from '../src/ui/format';

const TARGETS = (process.env.TARGETS ?? '1e6,4e6,1.6e7').split(',').map(Number);
const SEEDS = (process.env.SEEDS ?? '1,2').split(',').map(Number);
const LIMIT = Number(process.env.LIMIT ?? 3600);
const HULL = process.env.HULL ?? 'zenith';
const base = compile(standardBuild(HULL)!, {}).stats.estDps;
console.log(`${HULL} standard build: est DPS ${fmtBig(base)}; each row scales its damage to the target. Cap ${LIMIT} s.`);
console.log('target DPS | seed | wave reached | seconds | died');
for (const target of TARGETS) {
  const mods = neutralModifiers();
  mods.damageMul = target / base;
  const waves: number[] = [];
  for (const seed of SEEDS) {
    rng.reset(seed);
    const w = new World({ grid: standardBuild(HULL)!, seed, modifiers: mods });
    // TRACE=1: at each wave from 20 on, print the state when it starts (hull, rocks that leaked so far, bodies alive: a build that struggles has bodies piling up and the hull falling).
    let seen = 0;
    let r = botRun(w, 0, []);
    for (let t = 0; t < LIMIT && !w.gameOver; t += 1) {
      r = botRun(w, 1, []);
      if (process.env.TRACE && w.wave !== seen && w.wave >= 20) { seen = w.wave; console.log(`  wave ${w.wave} at ${w.time.toFixed(0)} s: hull ${w.hull}/${w.maxHull}, leaks ${w.leaks}, alive ${w.mitosis.enemies.length}`); }
    }
    waves.push(r.wave);
    console.log(`${fmtBig(target).padStart(10)} | ${String(seed).padStart(4)} | ${String(r.wave).padStart(12)} | ${r.time.toFixed(0).padStart(7)} | ${r.died ? 'yes' : 'cap'}`);
  }
  console.log(`${fmtBig(target).padStart(10)} | mean | ${(waves.reduce((a, b) => a + b, 0) / waves.length).toFixed(1).padStart(12)}`);
}
