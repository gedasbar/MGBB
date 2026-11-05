// Chunk 31a: the Cores income model and the prices of three reference ships. Pure arithmetic, runs in a second.
// Run: npx vite-node scripts/shipyard-model.ts
import { CHUNKS } from '../src/data/shipChunks';
import { coresForWave, coresOfRun, waveStartCores } from '../src/shipyard/cores';
import { BOSS_CORES_MUL, BOSS_EVERY } from '../src/data/bosses';
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
  'starter (a Front Gun and 6 plain chunks)': { front_gun: 1, corridor: 2, corner: 2, tjunction: 1, cross: 1 },
  'full 16-slot ship (2 Front, 2 Twin, 12 plain, no traits)': { front_gun: 2, twin_gun: 2, corridor: 3, corner: 2, tjunction: 2, cross: 3, ring: 2 },
  'full 16-slot ship with traits (2 Twin, 1 Front, 9 plain, 4 traits)': { front_gun: 1, twin_gun: 2, corridor: 3, tjunction: 2, cross: 2, ring: 2, overdrive: 2, core_magnet: 1, extra_life: 1 },
  'full 16-slot ship with the Free Fly traits (5 traits, 32c)': { front_gun: 1, twin_gun: 2, corridor: 3, tjunction: 2, cross: 2, ring: 2, overdrive: 1, faster_waves: 1, wave_skipper: 1, repair_bay: 1, boss_bounty: 1 },
  'every chunk x3 (the whole shop)': Object.fromEntries(CHUNKS.map(c => [c.id, 3])),
};
// Chunk 32d: the hour includes the boss kills (boss waves take BOSS_SECONDS) like scripts/cores-income.ts.
const BOSS_SECONDS = 60;
const bossRun = (wave: number) => { let n = 0, s = OVERHEAD_S; for (let w = 2; w <= wave; w++) { n += waveStartCores(w) + (w % BOSS_EVERY === 0 ? coresForWave(w) * BOSS_CORES_MUL : 0); s += w % BOSS_EVERY === 0 ? BOSS_SECONDS : WAVE_TIME; } return (n / s) * 3600; };
const perHour = [['a casual hour (runs to wave 12)', Math.round(bossRun(12))], ['a good hour (runs to wave 25)', Math.round(bossRun(25))]] as const;
console.log('\nPRICES (Cores) and hours of Free Fly');
for (const [name, list] of Object.entries(ships)) {
  const c = cost(list);
  console.log(`${name}: ${c} Cores = ${perHour.map(([l, r]) => `${(c / r).toFixed(1)} h at ${l.split(' (')[0]} (${r}/h)`).join(', ')}`);
}

// Free Fly RUNS needed (not hours): the price divided by the Cores one run pays, rounded up.
console.log('\nRUNS of Free Fly (price / Cores a run pays, rounded up)');
for (const [name, list] of Object.entries(ships)) {
  const c = cost(list);
  console.log(`${name}: ${[12, 25].map(w => `${Math.ceil(c / coresOfRun(w))} runs to wave ${w} (${coresOfRun(w)} each)`).join(', ')}`);
}

// ---------------------------------------------------------------- chunk 32c: the five Free Fly trait chunks
// Each trait changes the Cores a Free Fly hour pays (before the player's own skill: waves reached is the same input as above).
// Model: a run reaching wave W costs (W-1) x waveTime + OVERHEAD_S; boss waves (10, 20 ...) pay coresForWave x BOSS_CORES_MUL on top of the wave start.

function runCores(wave: number, o: { pay?: number; skip?: number; bossPay?: number } = {}): number {
  const pay = o.pay ?? 1, skip = o.skip ?? 0, bossPay = o.bossPay ?? 1;
  let n = 0;
  for (let w = 2; w <= wave; w++) {
    const isBoss = w % BOSS_EVERY === 0;
    const kept = isBoss ? 1 : 1 - skip; // a skipped wave pays nothing (expected value); a boss wave is never skipped
    n += waveStartCores(w) * pay * kept + (isBoss ? coresForWave(w) * BOSS_CORES_MUL * bossPay : 0);
  }
  return n;
}
/** Seconds of a run to wave W: `time` x WAVE_TIME per wave that is not skipped (a skipped wave takes no time), boss waves take their kill time (about 60 s). */
function runSeconds(wave: number, o: { time?: number; skip?: number } = {}): number {
  const time = o.time ?? 1, skip = o.skip ?? 0;
  let s = OVERHEAD_S;
  for (let w = 2; w <= wave; w++) s += (w % BOSS_EVERY === 0 ? 1 : 1 - skip) * WAVE_TIME * time;
  return s;
}
console.log('\nFREE FLY TRAIT CHUNKS (one copy each; Cores an hour for a run to wave 25, "plain" = no trait)');
const W = 25;
const plainH = (runCores(W) / runSeconds(W)) * 3600;
const traits: [string, { pay?: number; skip?: number; bossPay?: number }, { time?: number; skip?: number }, string][] = [
  ['Faster Waves (waves x0.8 time, enemies +10% HP)', {}, { time: 0.8 }, 'harder: needs about 10% more damage'],
  ['Longer Waves (waves x1.3 time, -10% Cores a wave)', { pay: 0.9 }, { time: 1.3 }, 'more credits per wave, fewer Cores an hour'],
  ['Wave Skipper (10% of normal waves skipped)', { skip: 0.1 }, { skip: 0.1 }, 'a deeper wave faster; skipped waves pay nothing'],
  ['Repair Bay (heals 2%/s, -15% damage)', {}, {}, 'no direct Cores change: survival for damage'],
  ['Boss Bounty (bosses +50% Cores, +25% HP)', { bossPay: 1.5 }, {}, 'bosses take 25% longer to kill (not in this model)'],
];
console.log(`plain: ${Math.round(plainH)} Cores an hour`);
for (const [name, pay, time, note] of traits) {
  const h = (runCores(W, pay) / runSeconds(W, time)) * 3600;
  console.log(`${name.padEnd(52)} ${String(Math.round(h)).padStart(6)} an hour (${h >= plainH ? '+' : ''}${(((h / plainH) - 1) * 100).toFixed(1)}%) - ${note}`);
}
console.log('\nPRICES of the five (first / second / third copy) and hours of a good Free Fly hour to afford one copy');
const goodH = bossRun(25);
for (const id of ['faster_waves', 'longer_waves', 'wave_skipper', 'repair_bay', 'boss_bounty']) {
  console.log(`${id.padEnd(14)} ${[0, 1, 2].map(k => chunkPrice(id, k)).join(' / ')} Cores; first copy = ${(chunkPrice(id, 0) / goodH).toFixed(2)} h`);
}
// A maxed ship: the whole shop x3 above already includes these five now (CHUNKS is read directly), so its hours are the "maxed ship" figure.
console.log(`\nWHOLE SHOP x3 (18 chunks): ${cost(Object.fromEntries(CHUNKS.map(c => [c.id, 3])))} Cores = ${(cost(Object.fromEntries(CHUNKS.map(c => [c.id, 3]))) / goodH).toFixed(1)} h at a good hour (${Math.round(goodH)}/h)`);
