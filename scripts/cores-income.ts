// Chunk 32d: Cores per hour of normal Free Fly at the depth a run reaches (milestones, boss kills and the 60 s between runs included).
// Run: npx vite-node scripts/cores-income.ts
import { BOSS_CORES_MUL, BOSS_EVERY } from '../src/data/bosses';
import { WAVE_TIME } from '../src/data/waves';
import { coresForWave, waveStartCores } from '../src/shipyard/cores';

const OVERHEAD_S = 60;
/** Boss waves take about this many seconds to kill (boss-rate.ts), the others WAVE_TIME. */
const BOSS_SECONDS = 60;
export function runCores(wave: number): number {
  let n = 0;
  for (let w = 2; w <= wave; w++) n += waveStartCores(w) + (w % BOSS_EVERY === 0 ? coresForWave(w) * BOSS_CORES_MUL : 0);
  return n;
}
export function runSeconds(wave: number): number {
  let s = OVERHEAD_S;
  for (let w = 2; w <= wave; w++) s += w % BOSS_EVERY === 0 ? BOSS_SECONDS : WAVE_TIME;
  return s;
}
console.log('wave | Cores a run | run minutes | Cores an hour | Cores for this wave');
for (const w of [10, 20, 30, 45, 60]) {
  console.log(`${String(w).padStart(4)} | ${String(Math.round(runCores(w))).padStart(11)} | ${(runSeconds(w) / 60).toFixed(0).padStart(11)} | ${String(Math.round((runCores(w) / runSeconds(w)) * 3600)).padStart(13)} | ${coresForWave(w)}`);
}
