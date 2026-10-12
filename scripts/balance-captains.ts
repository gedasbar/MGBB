// Captain balance (chunk 13a): the starter captain with nothing bought against a fully built tree of each captain (hero level 10 and
// one option in every tier). Prints the campaign carve ratio and the bots' results, and flags any build whose total power is
// about 2x the baseline or more. Run: npm run balance-captains
import { compile } from '../src/engine/compiler';
import { buildDartStarterGrid, place } from '../src/game/starter';
import { buildTwinGrid } from '../src/game/gridUtils';
import { World } from '../src/game/world';
import { botRun, BotRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { generateLevel } from '../src/wall/generator';
import { BOOST_MAX, CELL, PASS_MARGIN_CELLS, WALL_COLS } from '../src/wall/constants';
import { simulateWall, blockCost } from '../src/wall/sim';
import { CAPTAINS, HERO_MAX_LEVEL } from '../src/captains/data';
import { computeRunModifiers, RunModifiers } from '../src/captains/modifiers';
import type { Grid } from '../src/engine/compiler';

/** A build is flagged when any of its ratios to the baseline reaches this. */
const FLAG = 2;
/**
 * A ratio only counts as a flag when the baseline it divides is big enough to mean something: whole credits below this, or a
 * destroyed share (%) below that, are small-number noise (1 credit -> 2 credits is x2.00). Those are listed as notes instead.
 */
const MIN_BASE_CREDITS = 5;
const MIN_BASE_PCT = 15;
const SEEDS = [1, 2, 3];
const FLY_LIMIT = 900;
const CARVE_TIERS = [1, 5, 10, 20];
const CLEAR_TIERS = [5, 10, 20];

const twin = (): Grid => { const g = buildTwinGrid(); place(g, 1, 2, 'flat_plus'); return g; };
const GUNS: [string, () => Grid][] = [['Dart + Flat+', buildDartStarterGrid], ['Twin + Flat+', twin]];
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);

interface Build { label: string; ids: string[]; mods: RunModifiers }
const mk = (label: string, level: number, ids: string[]): Build => ({ label, ids, mods: computeRunModifiers(level, ids) });

// ---- the builds: nothing bought, and for each captain the 16 ways to fill 4 tiers, narrowed to 4 interesting ones
const builds: Build[] = [mk('starter, nothing bought', 0, [])];
for (const c of CAPTAINS) {
  const combos: string[][] = [];
  for (let m = 0; m < 16; m++) combos.push(c.tiers.map((pair, t) => pair[(m >> t) & 1].id));
  const dps = (b: RunModifiers) => (1 + b.baseDamage / 101) * b.damageMul * b.fireRateMul * (1 + (b.vsArmor + b.vsShield) / 4);
  const wallDps = (b: RunModifiers) => dps(b) * b.wallDamageMul;
  const credit = (b: RunModifiers) => b.creditMul * (1 + b.wallCreditMul - 1) * (1 + b.passCredits);
  const pick = (score: (b: RunModifiers) => number) => combos.reduce((best, ids) => (score(computeRunModifiers(HERO_MAX_LEVEL, ids)) > score(computeRunModifiers(HERO_MAX_LEVEL, best)) ? ids : best));
  const picks: [string, string[]][] = [
    ['all first options', c.tiers.map(p => p[0].id)],
    ['all second options', c.tiers.map(p => p[1].id)],
    ['best damage', pick(dps)],
    ['best wall damage', pick(wallDps)],
    ['best credits', pick(credit)],
  ];
  const seen = new Set<string>();
  for (const [what, ids] of picks) {
    const key = ids.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    builds.push(mk(`${c.name}: ${what}`, HERO_MAX_LEVEL, ids));
  }
}

// ---- results
interface Row {
  build: Build;
  dps: number[];
  fly: { wave: number; credits: number; kills: number; time: number }[];
  carve: { pct: number; credits: number }[];
  clear: number[];
  carveRatio: number[];
}

const columnCosts = (l: ReturnType<typeof generateLevel>) => {
  const out: number[] = new Array(WALL_COLS).fill(0);
  l.cells.forEach((c, i) => { if (c) out[i % WALL_COLS] += blockCost(c); });
  return out;
};

const rows: Row[] = builds.map((build) => {
  const grids = GUNS.map(([, g]) => g);
  // Damage per second against a plain target: the estimate counts the hero level through compile and the fire rate by hand.
  const dps = grids.map(g => compile(g(), { baseDamage: build.mods.baseDamage }).stats.estDps * build.mods.damageMul * build.mods.fireRateMul);
  const fly = grids.map((g) => {
    const runs: BotRun[] = SEEDS.map((seed) => { rng.reset(seed); return botRun(new World({ grid: g(), seed, modifiers: build.mods }), FLY_LIMIT, []); });
    return { wave: mean(runs.map(r => r.wave)), credits: mean(runs.map(r => r.credits)), kills: mean(runs.map(r => r.kills)), time: mean(runs.map(r => r.time)) };
  });
  const dartDps = dps[0] * build.mods.wallDamageMul;
  const carve = CARVE_TIERS.map((t) => {
    rng.reset(1);
    const r = simulateWall(generateLevel(t), buildDartStarterGrid(), 'carve', { modifiers: build.mods });
    return { pct: (r.destroyed / r.total) * 100, credits: r.credits };
  });
  const clear = CLEAR_TIERS.map((t) => {
    rng.reset(1);
    const r = simulateWall(generateLevel(t), buildDartStarterGrid(), 'clearAll', { modifiers: build.mods });
    return (r.destroyed / r.total) * 100;
  });
  // The balance-wall "pass DPS / starter DPS" ratio with this build's damage: the share of the pass cost the gun covers.
  const carveRatio = CARVE_TIERS.map((t) => {
    const l = generateLevel(t);
    const cheapest = [...columnCosts(l)].sort((a, b) => a - b)[0];
    const travel = l.rows * CELL + PASS_MARGIN_CELLS * CELL + 24;
    // The boost zone only decides where the boost starts; the top speed (and so this crossing time) is the same.
    const cross = travel / (l.approachSpeed * BOOST_MAX);
    return dartDps / (cheapest / cross); // gun / need: above 1 means the lane can be carved
  });
  return { build, dps, fly, carve, clear, carveRatio };
});

const base = rows[0];
const f1 = (v: number, d = 1) => v.toFixed(d);
console.log(`Captain balance. Guns: ${GUNS.map(g => g[0]).join(', ')}. Free Fly bot: ${SEEDS.length} seeds, until dead (cap ${FLY_LIMIT} s). Wall bots on the fresh Dart + Flat+.`);
console.log(`Tiers carved: ${CARVE_TIERS.join('/')}; cleared: ${CLEAR_TIERS.join('/')}. FLAG = any ratio to the baseline >= ${FLAG}.\n`);
console.log('build'.padEnd(44) + ' | est DPS ratio (Dart/Twin) | Free Fly Dart: wave credits kills | Free Fly Twin: wave credits kills | carve % t1/5/10/20 | carve credits t1/5/10/20 | clear-all % t5/10/20 | carve ratio t1/5/10/20 | flags');
const flagged: string[] = [];
const notes: string[] = [];
for (const r of rows) {
  const ratios: [string, number][] = [
    ['dps', r.dps[0] / base.dps[0]],
    ['flyCredits', r.fly[0].credits / base.fly[0].credits],
    ['flyCreditsTwin', r.fly[1].credits / base.fly[1].credits],
    ['flyKills', r.fly[0].kills / base.fly[0].kills],
    ['flyKillsTwin', r.fly[1].kills / base.fly[1].kills],
    ...r.carve.map((c, i) => [`carveCredits t${CARVE_TIERS[i]}`, base.carve[i].credits >= MIN_BASE_CREDITS ? c.credits / base.carve[i].credits : 0] as [string, number]),
    ...r.clear.map((c, i) => [`clearAll t${CLEAR_TIERS[i]}`, base.clear[i] >= MIN_BASE_PCT ? c / base.clear[i] : 0] as [string, number]),
  ];
  const hot = ratios.filter(([, v]) => v >= FLAG).map(([k, v]) => `${k} x${v.toFixed(2)}`);
  if (r !== base && hot.length) flagged.push(`${r.build.label}: ${hot.join(', ')}`);
  // Small-number ratios (see MIN_BASE_*): shown as notes, not flags.
  const small = [
    ...r.carve.map((c, i) => [`carveCredits t${CARVE_TIERS[i]}`, base.carve[i].credits < MIN_BASE_CREDITS ? c.credits / Math.max(1e-9, base.carve[i].credits) : 0] as [string, number]),
    ...r.clear.map((c, i) => [`clearAll t${CLEAR_TIERS[i]}`, base.clear[i] < MIN_BASE_PCT ? c / Math.max(1e-9, base.clear[i]) : 0] as [string, number]),
  ].filter(([, v]) => v >= FLAG).map(([k, v]) => `${k} x${v.toFixed(2)}`);
  if (r !== base && small.length) notes.push(`${r.build.label}: ${small.join(', ')}`);
  const fly = (x: Row['fly'][0]) => `${f1(x.wave)} ${f1(x.credits, 0)} ${f1(x.kills, 0)}`;
  console.log(
    `${r.build.label.padEnd(44)} | ${f1(r.dps[0] / base.dps[0], 2)} / ${f1(r.dps[1] / base.dps[1], 2)}`.padEnd(75) +
    ` | ${fly(r.fly[0]).padEnd(22)} | ${fly(r.fly[1]).padEnd(22)} | ${r.carve.map(c => f1(c.pct, 0)).join('/').padEnd(16)} | ${r.carve.map(c => f1(c.credits, 0)).join('/').padEnd(18)} | ${r.clear.map(c => f1(c, 0)).join('/').padEnd(12)} | ${r.carveRatio.map(c => f1(c, 2)).join('/')} | ${hot.length ? 'FLAG ' + hot.join(' ') : '-'}`,
  );
}
console.log('\nBuilds (ids):');
for (const b of builds.slice(1)) console.log(`  ${b.label}: ${b.ids.join(', ')}`);
console.log(`\nFlagged (>= ${FLAG}x the baseline): ${flagged.length ? '\n  ' + flagged.join('\n  ') : 'none'}`);
console.log(`\nSmall-number ratios (baseline under ${MIN_BASE_CREDITS} credits or ${MIN_BASE_PCT}% destroyed; shown, not flags): ${notes.length ? "\n  " + notes.join("\n  ") : "none"}`);
