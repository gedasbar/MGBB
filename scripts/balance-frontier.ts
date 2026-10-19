// Chunk 15b: how the Free Fly balance bot does on Frontier Free Fly squares (encounters). No tuning, a report only.
// For a few effective tiers and four representative builds it flies 3 encounters (neutral species weights and rates,
// 3 plan seeds, no spike) and prints the time survived, the outcome, kills and credits. Run: npm run balance-frontier
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { buildDartStarterGrid, place } from '../src/game/starter';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { Grid } from '../src/engine/compiler';
import { rng } from '../src/rng';
import { EncounterParams, encounterOutcome, encounterTier, planEncounter, waveEquivalent } from '../src/frontier/encounter';
import { FREEFLY_SQUARE_SECONDS, MAP_BASE_TIER, MAP_TIER_PER_RING } from '../src/frontier/constants';

const twin = (): Grid => { const g = HULL_BUILDERS.twin(); place(g, 1, 2, 'percent_mult', 3); place(g, 1, 3, 'flat_plus', 3); return g; };
const prong = (): Grid => { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'splitter_3', 3); place(g, 2, 2, 'flat_plus', 3); place(g, 3, 2, 'turn_l'); return g; };
const fan = (): Grid => {
  const g = HULL_BUILDERS.fan();
  place(g, 5, 9, 'flat_plus', 3); place(g, 5, 8, 'splitter_3', 3); place(g, 2, 8, 'turn_r'); place(g, 8, 8, 'turn_l');
  return g;
};
const BUILDS: [string, () => Grid][] = [
  ['Dart: Flat+ L1 (starter)', buildDartStarterGrid],
  ['Twin: Percent x L3, Flat+ L3', twin],
  ['Prong: Splitter 3 L3, Flat+ L3, Turn L', prong],
  ['Fan: Flat+ L3, Splitter 3 L3, Turn R / L', fan],
];
const TIERS = [25, 35, 45, 60, 85];
const SEEDS = [11, 22, 33];

const params = (tier: number, seed: number): EncounterParams => {
  const wave = waveEquivalent(tier);
  return { wave, tier: encounterTier(wave), hpMul: 1, weights: {}, trickleMul: 1, startMul: 1, duration: FREEFLY_SQUARE_SECONDS, seed };
};

console.log(`Frontier Free Fly squares, ${FREEFLY_SQUARE_SECONDS} s encounters, FreeFlyBot, ${SEEDS.length} plan seeds per cell (neutral weights / rates, no spike).`);
console.log(`Effective tier -> wave equivalent: ${TIERS.map(t => `${t} -> ${waveEquivalent(t)} (ring ~${Math.max(0, Math.round((t - MAP_BASE_TIER) / MAP_TIER_PER_RING))})`).join(', ')}\n`);
console.log('build'.padEnd(44) + TIERS.map(t => `tier ${t}`.padEnd(26)).join(''));
for (const [name, mk] of BUILDS) {
  let line = name.padEnd(44);
  for (const t of TIERS) {
    const res = SEEDS.map(seed => {
      rng.reset(seed);
      const p = params(t, seed);
      const w = new World({ grid: mk(), seed, encounter: { plan: planEncounter(p), wave: p.wave, tier: p.tier, hpMul: p.hpMul, duration: p.duration } });
      const r = botRun(w, p.duration + 1, []);
      return { time: r.time, outcome: encounterOutcome(r.time, p.duration, w.survived), kills: r.kills };
    });
    const avgT = res.reduce((s, r) => s + r.time, 0) / res.length;
    const tag = res.map(r => r.outcome[0].toUpperCase()).join('');
    line += `${avgT.toFixed(0).padStart(3)} s ${tag} k${Math.round(res.reduce((s, r) => s + r.kills, 0) / res.length)}`.padEnd(26);
  }
  console.log(line);
}
console.log('\nCell: mean seconds survived, outcome per seed (C cleared, P passed, F failed), mean kills.');
