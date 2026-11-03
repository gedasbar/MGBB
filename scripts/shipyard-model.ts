// Chunk 31a: the Cores income model and the prices of three reference ships. Pure arithmetic, runs in a second.
// Run: npx vite-node scripts/shipyard-model.ts
import { CHUNKS } from '../src/data/shipChunks';
import { coresOfRun } from '../src/shipyard/cores';
import { chunkPrice } from '../src/shipyard/design';
import { WAVE_TIME } from '../src/data/waves';

/** Cores of a run that reaches `wave`, and per hour of play when each run also costs OVERHEAD_S seconds (menus, building, the summary). */
const OVERHEAD_S = 60;
console.log('INCOME (a run reaching wave W lasts about (W-1) x 40 s; +60 s between runs)');
console.log('wave | run length | Cores a run | Cores an hour');
for (const w of [8, 10, 15, 20, 25, 30, 40, 50]) {
  const secs = (w - 1) * WAVE_TIME + OVERHEAD_S;
  const run = coresOfRun(w);
  console.log(`${String(w).padStart(4)} | ${String(Math.round(secs / 60)).padStart(6)} min | ${String(run).padStart(11)} | ${String(Math.round((run / secs) * 3600)).padStart(13)}`);
}

/** Price of buying the listed copies one after the other (each copy at the price its position says). */
function cost(list: Record<string, number>): number {
  let total = 0;
  for (const [id, n] of Object.entries(list)) for (let k = 0; k < n; k++) total += chunkPrice(id, k);
  return total;
}

const ships: Record<string, Record<string, number>> = {
  'starter (3 chunks)': { generator: 1, corridor: 1, front_gun: 1 },
  'sensible full ship (9 chunks, 2 traits)': { generator: 1, twin_gun: 1, front_gun: 1, cross: 3, corridor: 2, overdrive: 1, core_magnet: 1 },
  'maxed (16 chunks, guns, 3 Overdrive)': { generator: 1, front_gun: 2, twin_gun: 2, full: 8, overdrive: 3 },
  'every chunk x3 (the whole shop)': Object.fromEntries(CHUNKS.map(c => [c.id, 3])),
};
const perHour = [['a casual hour (runs to wave 12)', Math.round((coresOfRun(12) / ((11 * WAVE_TIME + OVERHEAD_S))) * 3600)], ['a good hour (runs to wave 25)', Math.round((coresOfRun(25) / ((24 * WAVE_TIME + OVERHEAD_S))) * 3600)]] as const;
console.log('\nPRICES (Cores) and hours of Free Fly');
for (const [name, list] of Object.entries(ships)) {
  const c = cost(list);
  console.log(`${name}: ${c} Cores = ${perHour.map(([l, r]) => `${(c / r).toFixed(1)} h at ${l.split(' (')[0]} (${r}/h)`).join(', ')}`);
}
