// Chunk 17a bot check: for five hulls across the ladder with their sensible build (src/debug/hullBuilds.ts), the highest
// campaign tier passed in strict order (tier n counts only if 1..n-1 were passed too; a tier is passed when the carve bot or the
// clear-all bot passes or clears it) and the Free Fly wave the bot reaches (3 seeds, 40 minutes cap).
// Run: npx vite-node scripts/hull-botcheck.ts   (writes reports/chunk17a/hull-botcheck.json and .md)
import { mkdirSync, writeFileSync } from 'fs';
import { standardBuild } from '../src/debug/hullBuilds';
import { compile } from '../src/engine/compiler';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { generateLevel } from '../src/wall/generator';
import { simulateWall } from '../src/wall/sim';

const HULLS = (process.env.HULLS ?? 'wisp,kestrel,trident,spire,zenith').split(',');
const SEEDS = [1, 2, 3];
const FF_LIMIT = Number(process.env.FF_LIMIT ?? 2400);
const ok = (s: string) => s === 'passed' || s === 'cleared';
mkdirSync('reports/chunk17a', { recursive: true });
const result: Record<string, any> = {};
for (const id of HULLS) {
  const mk = () => standardBuild(id)!;
  let tier = 0;
  let firstFail = '';
  for (let t = 1; t <= 100; t++) {
    const l = generateLevel(t);
    const carve = simulateWall(l, mk(), 'carve');
    const pass = ok(carve.state) || ok(simulateWall(l, mk(), 'clearAll').state);
    if (!pass) { firstFail = `${t} ${l.name ?? ''} (${carve.state}, ${(carve.destroyed / carve.total * 100).toFixed(0)}% destroyed)`; break; }
    tier = t;
  }
  const runs = SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: mk(), seed }), FF_LIMIT, []); });
  const waves = runs.map(r => r.wave);
  result[id] = { recipes: compile(mk()).recipes.length, estDps: compile(mk()).stats.estDps, highestTierPassed: tier, firstFail, ffWaves: waves, ffDied: runs.map(r => r.died), ffTime: runs.map(r => Math.round(r.time)), ffCredits: runs.map(r => Math.round(r.credits)) };
  console.log(id, JSON.stringify(result[id]));
}
writeFileSync('reports/chunk17a/hull-botcheck.json', JSON.stringify(result, null, 1));
const md = ['| hull | recipes | est. DPS | highest campaign tier passed (in order) | first tier not passed | Free Fly waves (3 seeds) | died / time cap |', '|---|---|---|---|---|---|---|'];
for (const [id, r] of Object.entries<any>(result)) md.push(`| ${id} | ${r.recipes} | ${r.estDps.toPrecision(3)} | ${r.highestTierPassed} | ${r.firstFail || 'none (all 100 passed)'} | ${r.ffWaves.join(', ')} | ${r.ffDied.map((d: boolean) => (d ? 'died' : 'cap')).join('/')} |`);
writeFileSync('reports/chunk17a/hull-botcheck.md', md.join('\n') + '\n');
