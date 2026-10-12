// Prints the economy table: rock HP, rewards, a Free Fly bot run per gun (credits, waves) and how many runs the first purchases take.
// Run: npm run balance-econ
import { compile } from '../src/engine/compiler';
import { buildDartStarterGrid, place } from '../src/game/starter';
import { buildProngGrid, buildTwinGrid } from '../src/game/gridUtils';
import { World } from '../src/game/world';
import { botRun, BotRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { freeFlyRewardTier, FREEFLY_REWARD_TIER_SCALE } from '../src/data/waves';
import type { Grid } from '../src/engine/compiler';
import { HULL_PRICES } from '../src/data/hulls';
import { CONFIG } from '../src/config';
import {
  copyPrice, FAMILY_MULT, GEN_BODIES, GEN_SHARE, HULL_PRICE, parentReward, rockHp, rockReward, upgradePrice,
} from '../src/econ/economy';

const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const MAX_GEN = CONFIG.MITOSIS.MAX_GENERATION;
/** Total HP of a whole Rock family: each generation has 2^(g-1) bodies of 0.55^(g-1) of the parent's HP. */
const familyHp = (tier: number) => rockHp(tier) * GEN_BODIES.slice(0, MAX_GEN).reduce((s, n, g) => s + n * Math.pow(0.55, g), 0);
const familyReward = (tier: number) => GEN_BODIES.slice(0, MAX_GEN).reduce((s, n, g) => s + n * rockReward(tier, g + 1), 0);

console.log(`Rock family reward = ${FAMILY_MULT}x the parent, split ${GEN_SHARE.map(s => Math.round(s * 100) + '%').join('/')} over generations 1-${MAX_GEN}.`);
console.log(`Free Fly pays a kill at reward tier 1 + (tier - 1) x ${FREEFLY_REWARD_TIER_SCALE} (HP uses the plain tier); other species x their reward multiplier.\n`);
console.log('Tier | rock HP | family HP | parent reward | per body g1/g2/g3/g4 | family total | Free Fly family total');
for (const t of [1, 5, 10, 20]) {
  const per = [1, 2, 3, 4].map(g => rockReward(t, g).toFixed(3)).join('/');
  console.log(`${String(t).padStart(4)} | ${rockHp(t).toFixed(0).padStart(7)} | ${familyHp(t).toFixed(0).padStart(9)} | ${parentReward(t).toFixed(2).padStart(13)} | ${per.padEnd(20)} | ${familyReward(t).toFixed(2).padStart(12)} | ${familyReward(freeFlyRewardTier(t)).toFixed(2).padStart(21)}`);
}

// ------------------------------------------------------------------ chunk 10a: Free Fly waves, flown by the bot
// A deterministic bot (src/debug/freeflyBot.ts: dodges what would touch the ship, otherwise lines up under the body closest
// to leaking) flies each gun on SEEDS seeds until the hull is gone (cap 10 min). Targets (docs/freefly-design.md): a 3-minute
// bare-Dart run pays ~55-65; the Twin (70) after 1-2 runs; the Prong (350) after 6-8 runs.
const SEEDS = [1, 2, 3, 4, 5];
const LIMIT = 600;
const CHECK = [60, 180, 300];
const twinOne = () => { const g = buildTwinGrid(); place(g, 1, 2, 'flat_plus'); return g; };
const twinTwo = () => { const g = buildTwinGrid(); place(g, 1, 2, 'flat_plus'); place(g, 1, 3, 'flat_plus'); return g; };
const prong = () => { const g = buildProngGrid(); place(g, 1, 2, 'splitter_3'); place(g, 2, 2, 'flat_plus'); place(g, 3, 2, 'turn_l'); return g; };
const GUNS: [string, () => Grid][] = [
  ['Dart + Flat+ (fresh save)', buildDartStarterGrid],
  ['Twin + Flat+', twinOne],
  ['Twin + 2 Flat+', twinTwo],
  ['Prong: Splitter 3, Flat+, Turn L', prong],
];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const fmtAt = (runs: BotRun[], t: number, k: 'wave' | 'credits') => {
  const v = runs.map(r => r.at[t]?.[k]).filter((x): x is number => x !== undefined);
  return v.length < runs.length ? (v.length ? `${mean(v).toFixed(k === 'wave' ? 1 : 0)}*` : 'dead') : mean(v).toFixed(k === 'wave' ? 1 : 0);
};
console.log(`\nFree Fly bot, ${SEEDS.length} seeds each (mean; * = some runs had already ended, mean of the rest)`);
console.log('gun                              | est DPS | survived | wave @1/3/5 min   | credits @1/3/5 min | credits/run | credits/min');
export const FREEFLY_TABLE: { gun: string; time: number; wave: number; credits: number; perMin: number }[] = [];
for (const [name, make] of GUNS) {
  // rng.combat (chance blocks) is shared global state: reset it per run so every row is reproducible on its own.
  const runs = SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: make(), seed }), LIMIT, CHECK); });
  const time = mean(runs.map(r => r.time)), credits = mean(runs.map(r => r.credits)), wave = mean(runs.map(r => r.wave));
  FREEFLY_TABLE.push({ gun: name, time, wave, credits, perMin: credits / (time / 60) });
  console.log(`${name.padEnd(32)} | ${compile(make()).stats.estDps.toFixed(0).padStart(7)} | ${fmtTime(time).padStart(8)} | ${CHECK.map(t => fmtAt(runs, t, 'wave')).join(' / ').padEnd(17)} | ${CHECK.map(t => fmtAt(runs, t, 'credits')).join(' / ').padEnd(18)} | ${credits.toFixed(0).padStart(11)} | ${(credits / (time / 60)).toFixed(1).padStart(11)}`);
}
// The natural path: Dart runs until the Twin, then Twin + Flat+ runs (buying the 2nd Flat+ as soon as it is affordable) until the Prong.
{
  const dart = FREEFLY_TABLE[0], t1 = FREEFLY_TABLE[1], t2 = FREEFLY_TABLE[2];
  let bank = 0, runs = 0, minutes = 0, twinAt = 0, flat = false;
  while (bank < HULL_PRICES.twin) { bank += dart.credits; runs++; minutes += dart.time / 60; }
  bank -= HULL_PRICES.twin; twinAt = runs;
  while (bank < HULL_PRICES.prong) {
    const g = flat ? t2 : t1;
    bank += g.credits; runs++; minutes += g.time / 60;
    if (!flat && bank - copyPrice('flat_plus', 1) >= 0 && bank < HULL_PRICES.prong) { bank -= copyPrice('flat_plus', 1); flat = true; }
  }
  console.log(`\nPath: Twin after ${twinAt} Dart run(s); Prong after ${runs} runs in all (${minutes.toFixed(0)} min of play${flat ? ', a 2nd Flat+ bought on the way' : ''}).`);
  console.log(`Targets: 3-min Dart run ~55-65 (bot: ${dart.credits.toFixed(0)} in ${fmtTime(dart.time)}), Twin after 1-2 runs, Prong after 6-8 runs.`);
}

const perRun = FREEFLY_TABLE[0].credits;
const p = {
  flat2: copyPrice('flat_plus', 1), splitter: copyPrice('splitter_2', 0), fan: HULL_PRICE.fan, twin: HULL_PRICES.twin, prong: HULL_PRICES.prong, shuttle: HULL_PRICES.shuttle,
  up12: upgradePrice('flat_plus', 1), up23: upgradePrice('flat_plus', 2), up34: upgradePrice('flat_plus', 3),
};
const runs = (price: number) => (price / perRun).toFixed(1);
console.log('\nPrices in bot Dart runs (Free Fly)');
console.log(`  2nd Flat+            ${String(p.flat2).padStart(5)}  ${runs(p.flat2)} runs`);
console.log(`  Splitter 2           ${String(p.splitter).padStart(5)}  ${runs(p.splitter)} runs`);
console.log(`  Twin hull            ${String(p.twin).padStart(5)}  ${runs(p.twin)} runs`);
console.log(`  Prong hull           ${String(p.prong).padStart(5)}  ${runs(p.prong)} runs`);
console.log(`  Fan hull             ${String(p.fan).padStart(5)}  ${runs(p.fan)} runs`);
console.log(`  Shuttle hull         ${String(p.shuttle).padStart(5)}  ${runs(p.shuttle)} runs`);
console.log(`  Flat+ L1->L2         ${String(p.up12).padStart(5)}  ${runs(p.up12)} runs`);
console.log(`  Flat+ L2->L3         ${String(p.up23).padStart(5)}  (cumulative to L3: ${p.up12 + p.up23}, ${runs(p.up12 + p.up23)} runs)`);

// ------------------------------------------------------------------ chunk 9a: estimated DPS of every shown block
// Standard test circuit on a Twin: Flat+ L1 in the cell next to the generator and the block under test in the cell next
// to the ejector, against the same circuit with a second Flat+ L1 there. Routing blocks cannot sit in a straight Twin;
// they are tested on a Fan (Splitter 2 + two Turns + a Flat+ on each branch) against that circuit.
// Note: est. DPS is damage per shot x shots per second. It is blind to what a block does to the TARGET (AoE, chain,
// ignite, ...), so those read x1.00 here by construction.
import { pickerBlocks, BLOCKS } from '../src/data/blocks';
import { buildFanGrid } from '../src/game/gridUtils';

const twinWith = (id: string, level = 1) => {
  const g = buildTwinGrid();
  place(g, 1, 3, 'flat_plus');
  place(g, 1, 2, id, level);
  return g;
};
const fanWith = (center: string) => {
  const g = buildFanGrid();
  place(g, 5, 9, center);
  place(g, 2, 9, 'turn_r');
  place(g, 8, 9, 'turn_l');
  place(g, 2, 5, 'flat_plus');
  place(g, 8, 5, 'flat_plus');
  return g;
};
const ROUTING = new Set(['turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'alternator', 'random_router']);
const twinBase = compile(twinWith('flat_plus')).stats.estDps;
const fanBase = compile(fanWith('splitter_2')).stats.estDps;
export const BLOCK_RATIOS: { id: string; ratio: number; dps: number; where: string }[] = [];
for (const b of pickerBlocks()) {
  if (b.id === 'turn_l' || b.id === 'turn_r') { BLOCK_RATIOS.push({ id: b.id, ratio: 1, dps: twinBase, where: 'routing' }); continue; }
  if (ROUTING.has(b.id)) {
    const dps = compile(fanWith(b.id)).stats.estDps;
    BLOCK_RATIOS.push({ id: b.id, ratio: dps / fanBase, dps, where: 'Fan' });
  } else {
    const dps = compile(twinWith(b.id)).stats.estDps;
    BLOCK_RATIOS.push({ id: b.id, ratio: dps / twinBase, dps, where: 'Twin' });
  }
}
console.log(`\nBlock test circuit: Twin Flat+ L1 + block, est. DPS ${twinBase.toFixed(0)} with a second Flat+ (Fan: ${fanBase.toFixed(0)} with a Splitter 2)`);
console.log('block             | cat      | on    | est. DPS | x baseline | flag');
for (const r of BLOCK_RATIOS) {
  const flag = r.ratio > 3 ? 'ABOVE 3x' : r.ratio < 0.3 ? 'BELOW 0.3x' : '';
  console.log(`${BLOCKS[r.id].name.padEnd(17)} | ${BLOCKS[r.id].category.padEnd(8)} | ${r.where.padEnd(5)} | ${r.dps.toFixed(0).padStart(8)} | ${r.ratio.toFixed(2).padStart(10)} | ${flag}`);
}
