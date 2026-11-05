import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { standardBuild } from '../src/debug/hullBuilds';
import { rng } from '../src/rng';
const [id, wave] = [process.argv[2] ?? 'hornet', Number(process.argv[3] ?? 10)];
rng.reset(1);
const w = new World({ grid: standardBuild(id)!, seed: 1, startWave: wave });
let last = 0;
while (!w.gameOver && w.time - (wave - 1) * 40 < 240) {
  botRun(w, 1, []);
  const t = w.time - (wave - 1) * 40;
  if (Math.floor(t / 10) > last) { last = Math.floor(t / 10); console.log(`t ${t.toFixed(0)} hull ${w.hull.toFixed(0)} bossHp ${w.boss ? (w.boss.hp / w.boss.maxHp * 100).toFixed(1) + '%' : 'dead'} bulletHits ${w.bulletHits} rocks ${w.mitosis.enemies.filter(e => !e.bossRole).length} leaks ${w.leaks} dmg/s? best ${w.projSys.runStats.totalDamage.toExponential(2)}`); }
  if (!w.boss) break;
}
console.log('end', w.gameOver ? 'hull gone' : 'ok', 'maxHp', w.boss?.maxHp);
