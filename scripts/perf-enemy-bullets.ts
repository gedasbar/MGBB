// Chunk 32a: what the enemy bullets cost at the pool cap. Node timing of the simulation (the browser's draw cost is measured
// by e2e/freefly-enemies.e2e.cjs). Run: npx vite-node scripts/perf-enemy-bullets.ts
import { World } from '../src/game/world';
import { EnemyBullets } from '../src/engine/enemyBullets';
import { ENEMY_BULLET_CAP, ENEMY_BULLET_SPEED } from '../src/data/enemyBullets';
import { standardBuild } from '../src/debug/hullBuilds';
import { Mulberry32 } from '../src/rng';

const idle = { x: 0, y: 0, active: false, type: 'mouse' as const, seen: false };
const R = new Mulberry32(7);
/** Keeps the pool at its cap: new bullets cross the screen sideways (they never reach the ship), so the pool stays full for the whole run. */
function topUp(b: EnemyBullets) {
  while (b.count < b.max) {
    const left = R.next() < 0.5;
    b.spawn(left ? -10 : 550, 100 + R.next() * 500, left ? ENEMY_BULLET_SPEED : -ENEMY_BULLET_SPEED, 0);
  }
}
const ms = (f: () => void, n: number) => { const t = process.hrtime.bigint(); for (let i = 0; i < n; i++) f(); return Number(process.hrtime.bigint() - t) / 1e6 / n; };

// 1) the pool alone: update (move + leave test) and the hit test, at the cap
const pool = new EnemyBullets();
for (let i = 0; i < ENEMY_BULLET_CAP; i++) pool.spawn(10 + R.next() * 520, 100 + R.next() * 500, 0, 0);
console.log(`pool of ${ENEMY_BULLET_CAP}: update ${ms(() => pool.update(1 / 600), 20000).toFixed(4)} ms, firstHit ${ms(() => pool.firstHit(270, 800, 300, 800, 8), 20000).toFixed(4)} ms (per frame)`);

// 2) a whole world frame with a big build, with and without the bullets
for (const id of ['halberd', 'zenith']) {
  const run = (full: boolean) => {
    const w = new World({ grid: standardBuild(id)!, seed: 3, startWave: 12 });
    w.god = true; // the ship cannot die; bullets move sideways, so none touches it anyway
    for (let i = 0; i < 600; i++) { if (full) topUp(w.enemyBullets); w.update(1 / 60, idle); } // warm up 10 s
    return ms(() => { if (full) topUp(w.enemyBullets); w.update(1 / 60, idle); }, 1200);
  };
  const a = run(false), b = run(true);
  console.log(`${id.padEnd(8)} world frame at wave 12: ${a.toFixed(3)} ms without bullets, ${b.toFixed(3)} ms with ${ENEMY_BULLET_CAP} bullets (+${(b - a).toFixed(3)} ms)`);
}
