// Chunk 32b calibration aid: boss HP against what a build that JUST keeps up with the plain waves deals (difficultyModel.flyNeeds().keepUp = HP a second to chew
// through to keep up with that wave, splits included). Seconds = boss HP / keepUp, before any loss to closed cores, plates or escorts.
import { BOSSES, bossAt, bossMaxHp } from '../src/data/bosses';
import { flyNeeds } from './lib/difficultyModel';
import { tierOfTime } from '../src/econ/economy';
import { WAVE_TIME } from '../src/data/waves';
console.log('wave | boss | boss HP | keepUp HP/s | seconds at exactly keep-up DPS (no losses)');
for (const wave of [10, 20, 30, 40, 50, 60, 70, 80]) {
  const b = bossAt(wave)!;
  const hp = bossMaxHp(b.def.id, wave, tierOfTime((wave - 1) * WAVE_TIME));
  const k = Math.sqrt(flyNeeds(wave - 1).keepUp * flyNeeds(wave + 1).keepUp); // a boss wave has no plan: the geometric mean of its neighbours
  console.log(`${wave} | ${b.def.id}${b.round ? '+' + b.round : ''} | ${hp.toExponential(2)} | ${k.toExponential(2)} | ${(hp / k).toFixed(0)}`);
}
void BOSSES;
