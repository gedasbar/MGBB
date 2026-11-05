import { planWave } from '../src/game/waves';
import { World } from '../src/game/world';
import { rng } from '../src/rng';
const fnv = (s: string) => { let h1 = 0x811c9dc5 | 0, h2 = 0x9e3779b9 | 0; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 0x85ebca6b); } return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0'); };
const N = 7;
const plans: unknown[] = [];
for (let w = 1; w <= N; w++) plans.push(planWave(12345, w).map(({ armor, ...p }: any) => p));
console.log('plans', fnv(JSON.stringify(plans)));
const stats: unknown[] = [];
for (let w = 1; w <= N; w++) {
  rng.reset(1);
  const world = new World({ seed: 777, startWave: w });
  world.god = true;
  const p = { x: 270, y: 800, active: false, type: 'mouse' as const, seen: true };
  for (let i = 0; i < 600; i++) world.update(1 / 60, p);
  stats.push({ w, wave: world.wave, tier: world.tier, kills: world.kills, credits: world.creditsExact, e: world.mitosis.enemies.map(e => [e.defId, e.generation, e.hp, e.maxHp, e.armor, e.shield, e.maxShield, e.radius, Math.round(e.x * 100), Math.round(e.y * 100)]) });
}
console.log('stats', fnv(JSON.stringify(stats)));
