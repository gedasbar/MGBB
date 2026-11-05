// Chunk 32e: does a Frontier Free Fly square stay in line with a Frontier wall square at the same ring? The career-matched build of the
// difficulty audit (budget at career tier E) flies, per ring, the wall squares (carve / clear-all bots, as frontier-reach) and 3 encounters of
// the Free Fly balance bot. OLD=1 flies the encounters with the wave table before chunk 32d (x1.19 / 1.08 / 1.06 after wave 20).
// Run: POS="tier 100" RINGS=100,200,300 npx vite-node scripts/frontier-vs-wall.ts
import { simulateWall } from '../src/wall/sim';
import { computeRunModifiers } from '../src/captains/modifiers';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { WAVE_SLOW_GROWTH } from '../src/data/waves';
import { EncounterParams, encounterOutcome, encounterTier, planEncounter, waveEquivalent } from '../src/frontier/encounter';
import { FREEFLY_SQUARE_SECONDS, MAP_BASE_TIER, MAP_TIER_PER_RING } from '../src/frontier/constants';
import { bestOwned, budgetAt, frontierWalls, gridOfEntry, heroLevelFor, medalsAt } from './lib/difficultyModel';

if (process.env.OLD) (WAVE_SLOW_GROWTH as unknown as [number, number][]).splice(0, 3, [30, 1.19], [40, 1.08], [50, 1.06]);
const e = Number((process.env.POS ?? 'tier 100').split(' ')[1]);
const RINGS = (process.env.RINGS ?? '100,150,200,250,300,400').split(',').map(Number);
const hero = heroLevelFor(medalsAt(e));
const entry = bestOwned(budgetAt(e), hero, 'any')!;
const mods = computeRunModifiers(hero, []);
const ok = (s: string) => s === 'passed' || s === 'cleared';
console.log(`${process.env.OLD ? 'OLD table' : 'NEW table'}, career tier ${e}, ${entry.hull} ${entry.fam}, hero ${hero}`);
for (const r of RINGS) {
  const ws = frontierWalls(r);
  const grid = () => gridOfEntry(entry)!;
  const wallPass = ws.filter(l => { const g = grid(); return ok(simulateWall(l, g, 'carve', { modifiers: mods }).state) || ok(simulateWall(l, grid(), 'clearAll', { modifiers: mods }).state); }).length;
  const tier = MAP_BASE_TIER + r * MAP_TIER_PER_RING, wave = waveEquivalent(tier);
  const res = [11, 22, 33].map(seed => {
    rng.reset(seed);
    const p: EncounterParams = { wave, tier: encounterTier(wave), hpMul: 1, weights: {}, trickleMul: 1, startMul: 1, duration: FREEFLY_SQUARE_SECONDS, seed };
    const w = new World({ grid: grid(), seed, modifiers: mods, encounter: { plan: planEncounter(p), wave: p.wave, tier: p.tier, hpMul: p.hpMul, duration: p.duration } });
    const run = botRun(w, p.duration + 1, []);
    return encounterOutcome(run.time, p.duration, w.survived)[0].toUpperCase();
  });
  console.log(`ring ${String(r).padStart(4)} (tier ${tier.toFixed(0)}, wave eq ${wave}): walls passed ${wallPass}/${ws.length}   free fly ${res.join('')} (C cleared, P passed, F failed)`);
}
