// Chunk 17a, step 4: measures what each hull's sensible build (src/debug/hullBuilds.ts) earns per run and writes
// reports/chunk17a/hull-income.json; scripts/hull-pricing-fit.ts turns that into the price table.
// Run: npx vite-node scripts/hull-pricing.ts   (PART=ff|wall|frontier, HULLS=wisp,kestrel to limit; several minutes)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { HULL_ORDER } from '../src/data/hulls';
import { standardBuild } from '../src/debug/hullBuilds';
import { compile } from '../src/engine/compiler';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { generateLevel } from '../src/wall/generator';
import { simulateWall } from '../src/wall/sim';
import { frontierLevel, squareKind, squareLevel } from '../src/frontier/level';
import { FRONTIER_SEED } from '../src/frontier/constants';

const OUT = 'reports/chunk17a/hull-income.json';
mkdirSync('reports/chunk17a', { recursive: true });
const data: Record<string, any> = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const only = process.env.HULLS ? process.env.HULLS.split(',') : [...HULL_ORDER];
const part = process.env.PART ?? 'all';
const SEEDS = [1, 2, 3];
const TIERS = [1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 75, 90, 100];
const RINGS = (process.env.RINGS ?? "0,5,10,25,50,100,150,200,250,300,350,400,450,500,600,700,800,1000,1600").split(",").map(Number);
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

/** Wall squares of a ring, along the three axes (never Free Fly squares). */
function frontierSquares(r: number) {
  const out = [];
  for (const [x, y] of [[r, 0], [0, -r], [-r, 0], [0, r], [r, 7], [7, -r]]) {
    if (r === 0 && out.length) break;
    if (squareKind(x, y, FRONTIER_SEED) === 'wall') out.push(frontierLevel(squareLevel(x, y, FRONTIER_SEED)));
    if (out.length === 3) break;
  }
  return out;
}

for (const id of only) {
  const mk = () => standardBuild(id)!;
  const rec = (data[id] ??= {});
  rec.estDps = compile(mk()).stats.estDps;
  if (part === 'all' || part === 'ff') {
    const runs = SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: mk(), seed }), 600, []); });
    rec.ff = { credits: mean(runs.map(r => r.credits)), wave: mean(runs.map(r => r.wave)), time: mean(runs.map(r => r.time)), maxWave: Math.max(...runs.map(r => r.wave)) };
    console.log(id, 'FF', JSON.stringify(rec.ff));
  }
  if (part === 'all' || part === 'wall') {
    const rows: any[] = [];
    let fails = 0;
    for (const t of TIERS) {
      const l = generateLevel(t);
      const carve = simulateWall(l, mk(), 'carve');
      const all = simulateWall(l, mk(), 'clearAll');
      const ok = (s: string) => s === 'passed' || s === 'cleared';
      rows.push({ tier: t, carve: carve.state, carveCredits: carve.credits, clearAll: all.state, clearAllCredits: all.credits, clearAllPct: all.destroyed / all.total });
      console.log(id, 'tier', t, carve.state, carve.credits.toFixed(0), all.state, all.credits.toFixed(0));
      fails = ok(carve.state) || ok(all.state) ? 0 : fails + 1;
      if (fails >= 2) break;
    }
    rec.wall = rows;
  }
  if (part === 'all' || part === 'frontier') {
    const rows: any[] = [];
    let fails = 0;
    for (const r of RINGS) {
      const sq = frontierSquares(r);
      const res = sq.map(l => simulateWall(l, mk(), 'clearAll'));
      const carve = sq.map(l => simulateWall(l, mk(), 'carve'));
      const ok = (s: string) => s === 'passed' || s === 'cleared';
      const win = res.some(x => ok(x.state)) || carve.some(x => ok(x.state));
      rows.push({ ring: r, tier: mean(sq.map(l => l.tier)), clearAllCredits: mean(res.map(x => x.credits)), carveCredits: mean(carve.map(x => x.credits)), passed: win });
      console.log(id, 'ring', r, win ? 'ok' : 'fail', mean(res.map(x => x.credits)).toFixed(0));
      fails = win ? 0 : fails + 1;
      if (fails >= 2) break;
    }
    rec.frontier = rows;
  }
  writeFileSync(OUT, JSON.stringify(data, null, 1));
}
