// Prints the economy table: rock HP, rewards, expected income and how many runs the first purchases take.
// Run: npm run balance-econ
import { compile } from '../src/engine/compiler';
import { buildDartStarterGrid, buildStarterGrid, place } from '../src/game/starter';
import { buildTwinGrid } from '../src/game/gridUtils';
import { HULL_PRICES } from '../src/data/hulls';
import { CONFIG } from '../src/config';
import {
  copyPrice, FAMILY_MULT, GEN_BODIES, GEN_SHARE, HULL_PRICE, parentReward, rockHp, rockReward, tierOfTime, upgradePrice,
} from '../src/econ/economy';

const EFFICIENCY = 0.5; // share of the estimated DPS that actually lands on rocks
const SPAWN_PER_SEC = 0.5; // one rock family every 2 s (World.autoSpawn)
const RUN_SECONDS = 60; // a first run: a bot with the default circuit dies after about 50 s from leaks
const MAX_GEN = CONFIG.MITOSIS.MAX_GENERATION;

/** Total HP of a whole family: each generation has 2^(g-1) bodies of 0.55^(g-1) of the parent's HP. */
const familyHp = (tier: number) => rockHp(tier) * GEN_BODIES.slice(0, MAX_GEN).reduce((s, n, g) => s + n * Math.pow(0.55, g), 0);
const familyReward = (tier: number) => GEN_BODIES.slice(0, MAX_GEN).reduce((s, n, g) => s + n * rockReward(tier, g + 1), 0);
/** Credits per second at a tier for a given DPS: damage-limited, or spawn-limited when the gun is strong. */
const income = (tier: number, dps: number) => Math.min(SPAWN_PER_SEC, (dps * EFFICIENCY) / familyHp(tier)) * familyReward(tier);
const runCredits = (dps: number, seconds = RUN_SECONDS) => {
  let c = 0;
  for (let t = 0; t < seconds; t += 1) c += income(tierOfTime(t), dps);
  return c;
};

// STARTER=shuttle prints the old Shuttle-starter table; the default is the Dart with a Flat+ (its 2nd step: a Twin with two Flat+).
const shuttleStarter = process.env.STARTER === 'shuttle';
const base = shuttleStarter ? buildStarterGrid() : buildDartStarterGrid();
const dpsDefault = compile(base).stats.estDps;
const two = shuttleStarter ? buildStarterGrid() : buildTwinGrid();
if (shuttleStarter) place(two, 9, 4, 'flat_plus'); else { place(two, 1, 2, 'flat_plus'); place(two, 1, 3, 'flat_plus'); }
const dpsTwoFlat = compile(two).stats.estDps;

console.log(`Assumptions: default circuit est. DPS ${dpsDefault.toFixed(0)} (${shuttleStarter ? 'Shuttle: Turn R, Turn L, Flat+' : 'Dart with one Flat+'}), ${Math.round(EFFICIENCY * 100)}% of it lands, `
  + `one rock family spawns every ${1 / SPAWN_PER_SEC} s, a run lasts ${RUN_SECONDS} s with the tier rising every 15 s.`);
console.log(`Family reward = ${FAMILY_MULT}x the parent, split ${GEN_SHARE.map(s => Math.round(s * 100) + '%').join('/')} over generations 1-${MAX_GEN}.\n`);

console.log('Tier | rock HP | family HP | parent reward | per body g1/g2/g3/g4 | family total | credits in 60 s (default circuit)');
for (const t of [1, 5, 10, 20]) {
  const per = [1, 2, 3, 4].map(g => rockReward(t, g).toFixed(3)).join('/');
  console.log(`${String(t).padStart(4)} | ${rockHp(t).toFixed(0).padStart(7)} | ${familyHp(t).toFixed(0).padStart(9)} | ${parentReward(t).toFixed(2).padStart(13)} | ${per.padEnd(20)} | ${familyReward(t).toFixed(2).padStart(12)} | ${(60 * income(t, dpsDefault)).toFixed(1)}`);
}

const perRun = runCredits(dpsDefault);
const perRun2 = runCredits(dpsTwoFlat);
console.log(`\nCredits per ${RUN_SECONDS} s run: default circuit ${perRun.toFixed(0)}, with a ${shuttleStarter ? '2nd Flat+' : 'Twin and two Flat+'} (DPS ${dpsTwoFlat.toFixed(0)}) ${perRun2.toFixed(0)}`);

const p = {
  flat2: copyPrice('flat_plus', 1), splitter: copyPrice('splitter_2', 0), fan: HULL_PRICE.fan, twin: HULL_PRICES.twin, prong: HULL_PRICES.prong, shuttle: HULL_PRICES.shuttle,
  up12: upgradePrice('flat_plus', 1), up23: upgradePrice('flat_plus', 2), up34: upgradePrice('flat_plus', 3),
};
const runs = (price: number) => (price / perRun).toFixed(1);
console.log('\nFirst purchases (price, runs of the default circuit to afford)');
console.log(`  2nd Flat+            ${String(p.flat2).padStart(5)}  ${runs(p.flat2)} runs`);
console.log(`  Splitter 2           ${String(p.splitter).padStart(5)}  ${runs(p.splitter)} runs`);
console.log(`  Twin hull            ${String(p.twin).padStart(5)}  ${runs(p.twin)} runs`);
console.log(`  Prong hull           ${String(p.prong).padStart(5)}  ${runs(p.prong)} runs`);
console.log(`  Fan hull             ${String(p.fan).padStart(5)}  ${runs(p.fan)} runs`);
console.log(`  Shuttle hull         ${String(p.shuttle).padStart(5)}  ${runs(p.shuttle)} runs`);
console.log(`  Flat+ L1->L2         ${String(p.up12).padStart(5)}  ${runs(p.up12)} runs`);
console.log(`  Flat+ L2->L3         ${String(p.up23).padStart(5)}  (cumulative to L3: ${p.up12 + p.up23}, ${runs(p.up12 + p.up23)} runs)`);
console.log(`  Flat+ L3->L4         ${String(p.up34).padStart(5)}  (cumulative to L4: ${p.up12 + p.up23 + p.up34}, ${runs(p.up12 + p.up23 + p.up34)} runs)`);
