// What a boss pays next to a normal wave (docs/freefly-bosses.md section 4).
import { bossAt, BOSS_CORES_MUL, BOSS_CREDIT_MUL } from '../src/data/bosses';
import { rockReward, tierOfTime } from '../src/econ/economy';
import { freeFlyRewardTier, WAVE_TIME, waveBudget } from '../src/data/waves';
import { coresForWave, waveStartCores } from '../src/shipyard/cores';
console.log('wave | boss | tier | boss credits | boss Cores | wave credits (all rocks as parents) | wave-start Cores');
for (const wave of [10, 20, 30, 40, 50, 80]) {
  const tier = tierOfTime((wave - 1) * WAVE_TIME);
  const parent = rockReward(freeFlyRewardTier(tier), 1);
  console.log(`${wave} | ${bossAt(wave)!.def.id} | ${tier} | ${(parent * BOSS_CREDIT_MUL).toFixed(0)} | ${coresForWave(wave) * BOSS_CORES_MUL} | ${((waveBudget(wave) / 4) * parent).toFixed(0)} | ${waveStartCores(wave)}`);
}
