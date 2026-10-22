// Chunk 16c-1: economy audit. READ-ONLY for game code: measures and prices things, changes no number.
// Chunk 16c-2: the proposals of 16c-1 are in the game now (src/data/blockEconomy.ts); this script reads the shipped values, so
// sections B, C and D can be rerun after any change. B shows copies 1..6 and checks the stacking shape blocks.
// Run with OUT=docs/economy-audit-tables-16c2.md to keep the 16c-1 tables (docs/economy-audit-tables.md) as the 'before'.
// Run: npm run economy-audit      (PART=a,b,c,d,e,f picks parts; QUICK=1 shortens the bots; OUT=<file> redirects the tables)
// Writes docs/economy-audit-tables.md (every generated table); docs/economy-audit.md is the written audit that quotes it.
//
// A) every block: class, levels, prices, proposed upgrade yes/no (owner's rule), power of the single level it would keep.
// B) marginal DPS of the 1st..5th copy of a block in one line, on the real engine (scripts/lib/dmgBench.ts), 3 scenarios.
// C) damage ceilings: Percent x ladder, chance blocks, hull slot limits (searched + verified with the compiler), content needs.
// D) price and pacing: today's formulas, three candidate curve families, runs of play from the Free Fly bot and the walls.
// E) Medal supply and a geometric hero-level cost.
// F) numeric safety facts (which wave's HP would meet a 1e12 clamp).
import { writeFileSync } from 'node:fs';
import { compile, Grid } from '../src/engine/compiler';
import { evalDamage } from '../src/engine/compilerTypes';
import { BLOCKS, percentMul, pickerBlocks } from '../src/data/blocks';
import { describeBlock } from '../src/engine/compilerTypes';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { buildDartStarterGrid, place } from '../src/game/starter';
import { HULL_ORDER, HULL_PRICES, fireRateMul } from '../src/data/hulls';
import { CONFIG } from '../src/config';
import { BASE_PRICE, copyPrice, DEFAULT_OWNED, rockHp, upgradePrice, wholeRockHp } from '../src/econ/economy';
import { BLOCK_ECONOMY, FIXED_LEVEL as GAME_FIXED, UPGRADABLE } from '../src/data/blockEconomy';
import {
  LEGACY_COPY_GROWTH as COPY_GROWTH, LEGACY_UPGRADE_GROWTH as UPGRADE_GROWTH, LEGACY_UPGRADE_MUL as UPGRADE_MUL, LEGACY_BASE_PRICE,
} from '../src/econ/legacyPrices';
import { bench, benchAll, Scenario } from './lib/dmgBench';
import { generateLevel } from '../src/wall/generator';
import { rewardPerBlock, blockHp } from '../src/wall/level';
import { blockCost } from '../src/wall/sim';
import { BOOST_MAX, CELL, PASS_MARGIN_CELLS, VIEW_H, WALL_COLS } from '../src/wall/constants';
import { FLY_MEDAL_MILESTONES, HERO_LEVEL_BASE_DAMAGE, CAPTAINS, TIER_COSTS } from '../src/captains/data';

/** The hero level costs before 16c-2 (capped at level 10). */
const HERO_LEVEL_COSTS = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const HERO_MAX_LEVEL = 10;
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { SPECIES } from '../src/data/species';
import { encounterTier } from '../src/frontier/encounter';
import { waveHpMul } from '../src/data/waves';
import { frontierLevel, squareLevel } from '../src/frontier/level';
import { getWorld, ring } from '../src/frontier/world';
import { FRONTIER_SEED } from '../src/frontier/constants';
import { flatPlusAdd } from '../src/engine/effects';

const PARTS = new Set((process.env.PART ?? 'a,b,c,d,e,f').split(','));
const QUICK = process.env.QUICK === '1';
const OUT = process.env.OUT ?? 'docs/economy-audit-tables.md';
const lines: string[] = [];
const log = (s = '') => { lines.push(s); console.log(s); };
const f1 = (n: number) => (!isFinite(n) ? String(n) : Math.abs(n) >= 1e6 ? n.toExponential(2) : Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
const f2 = (n: number) => n.toFixed(2);
const sci = (n: number) => (n >= 1e6 ? n.toExponential(2) : n >= 100 ? n.toFixed(0) : n.toFixed(2));
const name = (id: string) => BLOCKS[id]?.name ?? id;
const mid = (max: number) => Math.ceil(max / 2);
const lvl = (id: string, l: number) => Math.min(l, BLOCKS[id].maxLevel);

// ============================================================================================ A. classification
type Cls = 'fixed' | 'flat damage' | 'multiplier' | 'chance-multiplier' | 'pulse modifier' | 'shape' | 'pathing' | 'effect' | 'setup' | 'passive' | 'unused';
type Up = 'yes' | 'no' | '?';
interface Info { cls: Cls; up: Up; rec?: 'yes' | 'no'; why: string }
const I = (cls: Cls, up: Up, why: string, rec?: 'yes' | 'no'): Info => ({ cls, up, why, rec });
const INFO: Record<string, Info> = {
  generator: I('fixed', 'no', 'hull cell, not placeable'), ejector: I('fixed', 'no', 'hull cell, not placeable'),
  straight: I('unused', 'no', 'hidden, removed'), crossover: I('unused', 'no', 'hidden, no effect'), diode: I('unused', 'no', 'hidden, no effect'),
  merger: I('unused', 'no', 'hidden'), portal_pair: I('unused', 'no', 'hidden'), reflector: I('unused', 'no', 'hidden'), armored_plating: I('unused', 'no', 'hidden passive'),
  turn_l: I('pathing', 'no', 'owner: all turn blocks'), turn_r: I('pathing', 'no', 'owner: all turn blocks'),
  splitter_2: I('pathing', 'no', 'owner: all splitters'), splitter_3: I('pathing', 'no', 'owner: all splitters'),
  alternator: I('pathing', '?', 'a router, but each emitted packet is x2 (x2.4 at L5) so it also multiplies DPS by 2; owner named turns and splitters only', 'no'),
  random_router: I('pathing', '?', 'a router (splitter family) whose L-scaling is the chance to take both outputs', 'no'),
  delay_line: I('pathing', '?', 'timing only, no damage; level = 0.1 s a level. Reads as an effect', 'no'),
  flat_plus: I('flat damage', 'yes', 'owner: additive damage booster'), percent_mult: I('multiplier', 'yes', 'owner: ladder x1.5 (L1) to x3 (max)'),
  lucky_strike: I('chance-multiplier', 'yes', 'owner: cheap damage booster'), jackpot: I('chance-multiplier', 'yes', 'owner: cheap damage booster'),
  gamblers_gate: I('chance-multiplier', 'yes', 'owner: cheap damage booster'),
  overclock: I('pulse modifier', '?', 'stateful damage booster (streak); not named by the owner', 'no'),
  capacitor: I('pulse modifier', '?', 'DPS-neutral at L1 (3 packets in, 1 out); L-scaling is +10% a level', 'no'),
  berserker_coil: I('setup', 'no', 'hidden'), executioner: I('setup', '?', 'conditional multiplier (x3 below 25% HP); a trigger effect?', 'no'),
  tithe: I('unused', 'no', 'hidden penalty'),
  fission_catalyst: I('effect', 'no', 'owner: Mitosis category'), cauterize: I('effect', 'no', 'owner: Mitosis category'), cleaver: I('effect', 'no', 'owner: Mitosis category'),
  culling_bolt: I('effect', 'no', 'owner: Mitosis category'), residue_seed: I('effect', 'no', 'owner: Residue Seed'), overkill_spill: I('effect', 'no', 'owner: Overkill Spill'),
  piercing: I('shape', 'no', 'owner: Piercing'), bouncing: I('shape', 'no', 'owner: Bouncing'), aoe_circle: I('shape', 'no', 'owner: AoE'), aoe_rect: I('shape', 'no', 'owner: AoE'),
  shield_breaker: I('setup', '?', 'numeric counter to shields (x1.5..x2.5); not an effect block', 'yes'),
  armor_piercer: I('setup', '?', 'numeric counter to armor (x2..x4); not an effect block', 'yes'),
  pure_converter: I('setup', '?', 'converts 15% a level of damage to armor-ignoring pure damage', 'yes'),
  boomerang: I('shape', '?', 'shape family (like Piercing/Bouncing/AoE) but not named', 'no'), orbit: I('shape', '?', 'shape family, not named', 'no'),
  mine: I('shape', '?', 'shape family, not named', 'no'), curving_right: I('shape', '?', 'shape family, not named', 'no'), random_curve: I('shape', '?', 'shape family, not named', 'no'),
  homing: I('shape', '?', 'shape family; owner named it only for its price', 'no'), fork_impact: I('shape', '?', 'shape family; owner named it only for its price', 'no'),
  magnetized: I('unused', 'no', 'hidden'),
  chain_lightning: I('effect', 'no', 'owner: Chain Lightning-type effects'), gravity_well: I('effect', 'no', 'effect (pull)'),
  ignite: I('effect', 'no', 'owner: Ignite'), frostbite: I('effect', 'no', 'owner: Frostbite'), corrosion: I('effect', 'no', 'owner: Corrosion'),
  static_charge: I('effect', 'no', 'trigger effect'), magnetize_target: I('unused', 'no', 'hidden'), vampiric: I('unused', 'no', 'hidden'),
};
for (const id of ['shield_emitter', 'magnet_core', 'thruster', 'targeting_lens', 'capacitor_bank', 'lucky_charm', 'sensor_array']) INFO[id] = I('passive', 'no', 'hidden passive');

/** Reference circuit of a block for benches: a Twin line, routing blocks on a Fan (as scripts/balance-damage.ts). */
const ROUTING = new Set(['turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'alternator', 'random_router']);
const twinRef = (id: string | null, flat: boolean, l = 1): Grid => {
  const g = HULL_BUILDERS.twin();
  if (flat) place(g, 1, 3, 'flat_plus');
  if (id) place(g, 1, 2, id, lvl(id, l));
  return g;
};
const fanRef = (id: string, flat: boolean, l = 1): Grid => {
  const g = HULL_BUILDERS.fan();
  if (flat) place(g, 5, 9, 'flat_plus');
  place(g, 5, 8, id, lvl(id, l));
  place(g, 2, 8, 'turn_r'); place(g, 8, 8, 'turn_l');
  return g;
};
const refOf = (id: string, l = 1) => (ROUTING.has(id) ? fanRef(id, true, l) : twinRef(id, true, l));
const SC = ['big', 'cluster', 'split'] as const;
type Sc = (typeof SC)[number];

/** The level a block without upgrades runs at: the shipped table (src/data/blockEconomy.ts). */
const FIXED_LEVEL: Record<string, number> = {};
for (const b of pickerBlocks()) if (!UPGRADABLE.has(b.id)) FIXED_LEVEL[b.id] = GAME_FIXED[b.id] ?? 1;

/** Shipped ownership cap (Infinity = none), base price and growth per block. */
const SPEC: Record<string, [number, number, number]> = {};
for (const [id, e] of Object.entries(BLOCK_ECONOMY)) SPEC[id] = [e.cap ?? Infinity, e.base, e.growth];
const proposedUp = (id: string) => UPGRADABLE.has(id);

function partA() {
  log('## A. Block classification\n');
  log('All 62 registered blocks. "Today" = what the code does now. Price columns are for shown blocks only (base price, copy growth x1.18 per copy owned, L1->L2 upgrade = base x 2.0). `Up?` = the proposed upgrade flag after the owner\'s rule; `?` = ambiguous, the recommendation is in brackets. Level text is the in-game description at L1 and at the top level.\n');
  log('| block | cat | class | max L | base price | L1->L2 price | L1 text | top-level text | Up? | why |');
  log('|---|---|---|---|---|---|---|---|---|---|');
  for (const b of Object.values(BLOCKS)) {
    const inf = INFO[b.id];
    const price = b.shown ? BASE_PRICE[b.id] : undefined;
    const t1 = describeBlock(b, 1).replace(/\|/g, '/');
    const tm = b.maxLevel > 1 ? describeBlock(b, b.maxLevel).replace(/\|/g, '/') : '(single level)';
    const up = inf.up === '?' ? `? (${inf.rec})` : inf.up;
    log(`| ${b.name}${b.shown ? '' : ' (hidden)'} | ${b.category} | ${inf.cls} | ${b.maxLevel} | ${price ?? '-'} | ${price && b.maxLevel > 1 ? upgradePrice(b.id, 1) : '-'} | ${t1} | ${tm} | ${up} | ${inf.why} |`);
  }

  // The levels as shipped.
  log('\n### A2. Blocks without upgrades: the fixed level they run at (as shipped in 16c-2)\n');
  log('| block | fixed level | rule text at that level |');
  log('|---|---|---|');
  for (const b of pickerBlocks()) if (!UPGRADABLE.has(b.id)) log(`| ${b.name} | L${FIXED_LEVEL[b.id]} | ${describeBlock(b, 1).replace(/\|/g, '/')} |`);
  log('');
  log('\n### A3. Compact summary (every shown block)\n');
  log('Stack cap = the shipped ownership cap (Infinity = none: the shape blocks that stack). Level kept = the single level of a block without upgrades (A2). Prices are the shipped ones.\n');
  log('| block | cat | class | max L today | base price | L1->L2 today | proposed upgrades | level kept | stack cap |');
  log('|---|---|---|---|---|---|---|---|---|');
  for (const b of pickerBlocks()) {
    const inf = INFO[b.id];
    const up = proposedUp(b.id);
    log(`| ${b.name} | ${b.category} | ${inf.cls} | ${b.maxLevel} | ${BASE_PRICE[b.id]} | ${b.maxLevel > 1 ? upgradePrice(b.id, 1) : '-'} | ${inf.up === '?' ? '? (' + inf.rec + ')' : inf.up} | ${up ? '1..' + b.maxLevel : 'L' + (FIXED_LEVEL[b.id] ?? 1)} | ${(SPEC[b.id] ?? [1])[0]} |`);
  }
}

// ============================================================================================ B. marginal copy value
interface MarginRow { id: string; l: number; base: Record<Sc, number>; dps: Record<Sc, number[]>; cap: number }
const MARGINS: MarginRow[] = [];
const MIN_GAIN = 0.05;

/** One lane on the Fan (column 5, rows 9..2, ejector at the top): [Flat+] then k copies of the block. */
function lineGrid(id: string, k: number, level: number): Grid {
  const g = HULL_BUILDERS.fan();
  let row = 9;
  if (id !== 'flat_plus') place(g, 5, row--, 'flat_plus');
  for (let i = 0; i < k; i++) place(g, 5, row--, id, level);
  return g;
}

/** The scenario a stacking shape block is meant for (its DPS must not fall with more copies there). */
const INTENDED: Record<string, Sc> = {
  piercing: 'cluster', bouncing: 'cluster', aoe_circle: 'spread', aoe_rect: 'spread', chain_lightning: 'cluster', homing: 'big', fork_impact: 'cluster',
  boomerang: 'cluster', orbit: 'big', mine: 'big',
};
const COPIES = 6;
/** A stacking block's DPS may dip by this much between two copies (bench noise) but never more. */
const STACK_TOLERANCE = 0.05;
/** The long bench used for the stacking check (the standard one is 16 s). */
const STACK_SECONDS = 48;
const HP_MULS = [3, 3.5, 4, 4.5];

function partB() {
  log('\n## B. Marginal value of the 1st..' + COPIES + 'th copy\n');
  log('Circuit: one lane on the Fan (generator, then Flat+, then k copies of the block in a straight line, ejector; Flat+ itself has no Flat+ in front). Fan fires 4 pulses/s. Targets are sized to the circuit\'s own estimate (scripts/lib/dmgBench.ts), so the number is HP removed per second on the real engine, not a formula. Each cell = DPS with k copies / DPS with k-1 copies (copy 1 is against the bare Flat+ circuit). `cap` = the last copy whose best-scenario gain is at least ' + MIN_GAIN * 100 + '% (cap 1: nothing from the 2nd copy). Upgradable blocks are tested at L1 and at their top level; a block without upgrades runs at its fixed level.\n');
  log('| block | L | scenario | DPS with 0 copies | ' + Array.from({ length: COPIES }, (_, k) => `copy ${k + 1}`).join(' | ') + ' | cap |');
  log('|---|---|---|---|' + '---|'.repeat(COPIES) + '---|');
  const ids = pickerBlocks().filter(b => !ROUTING.has(b.id)).map(b => b.id);
  const checks: string[] = [];
  for (const id of ids) {
    const b = BLOCKS[id];
    const levels = new Set<number>([1]);
    if (UPGRADABLE.has(id)) levels.add(b.maxLevel);
    for (const l of [...levels]) {
      const res = Array.from({ length: COPIES + 1 }, (_, k) => benchAll(lineGrid(id, k, l)));
      const dps = { big: res.map(r => r.big), cluster: res.map(r => r.cluster), split: res.map(r => r.split) };
      // Best-scenario marginal gain of copy k.
      const gain = (k: number) => Math.max(...SC.map(s => dps[s][k] / Math.max(1e-9, dps[s][k - 1]) - 1));
      let cap = 1;
      for (let k = 2; k <= COPIES; k++) { if (gain(k) >= MIN_GAIN) cap = k; else break; }
      if (gain(1) < MIN_GAIN) cap = 0;
      MARGINS.push({ id, l, base: { big: dps.big[0], cluster: dps.cluster[0], split: dps.split[0] }, dps, cap });
      SC.forEach((s, si) => {
        log(`| ${si === 0 ? b.name : ''} | ${si === 0 ? l : ''} | ${s}${INTENDED[id] === s ? ' *' : ''} | ${f1(dps[s][0])} | ${Array.from({ length: COPIES }, (_, k) => 'x' + f2(dps[s][k + 1] / Math.max(1e-9, dps[s][k]))).join(' | ')} | ${si === 0 ? (cap === 0 ? 'none' : cap >= COPIES ? COPIES + '+' : cap) : ''} |`);
      });
      const sc = INTENDED[id];
      if (sc && l === 1) {
        // The check runs on a longer bench in the block's own scenario.
        // Bodies die after a whole number of hits (small numbers), so a x0.95 can cost a whole hit at one HP and nothing at another: average over target HPs.
        const v = Array.from({ length: COPIES + 1 }, (_, k) => { const g = lineGrid(id, k, l); return HP_MULS.reduce((a, m) => a + bench(g, sc as Scenario, { seconds: STACK_SECONDS, hpMul: m }), 0) / HP_MULS.length; });
        let worst = 0;
        for (let k = 2; k <= COPIES; k++) if (v[k - 1] > 1e-6) worst = Math.min(worst, v[k] / v[k - 1] - 1);
        const first = v[3] - v[0], second = v[6] - v[3];
        checks.push(`| ${b.name} | ${sc} | ${v.map(x => f1(x)).join(' / ')} | ${worst < -STACK_TOLERANCE ? 'FAIL: falls (' + f2(worst * 100) + '%)' : 'ok (worst step ' + f2(worst * 100) + '%)'} | ${second <= Math.max(first, 0) + STACK_TOLERANCE * Math.max(1e-6, v[0]) ? 'ok (copies 4-6 add ' + f1(second) + ', copies 1-3 add ' + f1(first) + ')' : 'FAIL: does not flatten (' + f1(second) + ' vs ' + f1(first) + ')'} |`);
      }
    }
  }
  log('\n`*` = the scenario the stacking block is meant for (checked on a ' + STACK_SECONDS + ' s bench; AoE uses the extra "spread" scenario: 30 small bodies in a dense row about 360 px wide, aimed at its middle). Stacking shape blocks, copies 0 to ' + COPIES + ' (HP/s):\n');
  log('| block | scenario | DPS with 0..' + COPIES + ' copies | never falls | flattens |');
  log('|---|---|---|---|---|');
  checks.forEach(c => log(c));

  // Routing: copies are lanes, and lanes are limited by ejectors.
  log('\n### B2. Routing blocks: lanes reaching an ejector\n');
  log('Splitters and routers add LANES (one projectile per lane per pulse), and a lane only counts if it ends in an ejector, so the useful copies are limited by the hull\'s ejectors (Dart 1, Twin 1, Prong 2, Fan 3, Shuttle 1). Compiled circuits below (Flat+ in front, turns placed by hand); "lanes" = recipes the compiler finds, est DPS from the compiler, engine mixed = mean of the three engine scenarios.\n');
  log('| circuit | lanes | est DPS | engine mixed HP/s | engine x vs one lane |');
  log('|---|---|---|---|---|');
  const prongS3 = () => { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'splitter_3'); place(g, 3, 2, 'turn_l'); return g; };
  const prongS2 = () => { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'splitter_2'); place(g, 3, 2, 'turn_l'); return g; };
  const prongTurn = () => { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'turn_r'); place(g, 3, 2, 'turn_l'); return g; };
  const fanOne = () => { const g = HULL_BUILDERS.fan(); place(g, 5, 9, 'flat_plus'); return g; };
  const fanS3 = () => fanRef('splitter_3', true);
  const fanS3S3 = () => { const g = fanRef('splitter_3', true); place(g, 5, 6, 'splitter_3'); place(g, 3, 6, 'turn_r'); place(g, 7, 6, 'turn_l'); return g; };
  const fanS2 = () => fanRef('splitter_2', true);
  const fanS2S2 = () => {
    const g = HULL_BUILDERS.fan();
    place(g, 5, 9, 'flat_plus'); place(g, 5, 8, 'splitter_2');
    place(g, 8, 8, 'turn_l');
    place(g, 4, 8, 'turn_r'); place(g, 4, 7, 'splitter_2');
    place(g, 5, 7, 'turn_l'); place(g, 2, 7, 'turn_r');
    return g;
  };
  const fanAlt = () => fanRef('alternator', true);
  const fanRnd = () => fanRef('random_router', true);
  const circuits: [string, () => Grid][] = [
    ['Prong: Turn R + Turn L (one lane)', prongTurn], ['Prong: Splitter 2 + Turn L', prongS2], ['Prong: Splitter 3 + Turn L', prongS3],
    ['Fan: Flat+ only (one lane)', fanOne], ['Fan: Splitter 2 (+2 turns)', fanS2], ['Fan: Splitter 2 + 2nd Splitter 2 (hand-routed)', fanS2S2],
    ['Fan: Splitter 3 (+2 turns)', fanS3], ['Fan: Splitter 3 + 2nd Splitter 3 on the middle lane', fanS3S3],
    ['Fan: Alternator (+2 turns)', fanAlt], ['Fan: Random Router L1 (+2 turns)', fanRnd],
  ];
  let oneLane = 0;
  for (const [n, mk] of circuits) {
    const g = mk();
    const c = compile(g);
    const b = benchAll(g);
    if (n.startsWith('Fan: Flat+ only')) oneLane = b.mixed;
    log(`| ${n} | ${c.recipes.length} | ${f1(c.stats.estDps)} | ${f1(b.mixed)} | ${n.startsWith('Prong') || !oneLane ? '' : 'x' + f2(b.mixed / oneLane)} |`);
  }
  log('\nTurns cost no DPS; the number you need is set by the routing (see the turn counts of the long lines in C3).');
}

// ============================================================================================ C. ceilings
/** Percent x per-copy ladder: x1.5 at L1 to x3 at L10, linear in log space (each level multiplies the per-copy factor by 2^(1/9)). */
const PCT_L1 = 1.5, PCT_MAX = 3, PCT_LEVELS = 10;
const pctLadder = percentMul; // the shipped ladder (src/data/blocks.ts)
const PCT_CAP = 10;
/** Proposed chance-booster values (average multiplier per copy at L1 / L3) and caps. Engine mechanics unchanged except Gambler's chance. */
const CHANCE = [
  { id: 'lucky_strike', avg: [1.33, 1.43], cap: 6, note: 'engine as today: 33%->43% x2' },
  { id: 'jackpot', avg: [1.36, 1.54], cap: 6, note: 'engine as today: 4%->6% x10' },
  { id: 'gamblers_gate', avg: [1.2, 1.5], cap: 4, note: 'PROPOSED chance 40%->50% (today 50%->60% = avg x1.5..x1.8, as strong as Percent x at L1-L3)' },
];

interface LineResult { straight: number; turns: [number, number]; path: { x: number; y: number; turn: number }[] }
/** Longest self-avoiding line from the generator to an ejector, counted in straight cells (the cells that can hold a multiplier). Randomised DFS with a node budget. */
function longestLine(g: Grid, budget: number): LineResult {
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < g.w && y < g.h ? g.cells[y * g.w + x] : undefined);
  const gen = g.cells.find(c => c.type === 'generator')!;
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // N E S W
  const seen = new Set<number>();
  let best: LineResult = { straight: -1, turns: [0, 0], path: [] };
  const cur: { x: number; y: number; turn: number }[] = [];
  let nodes = 0;
  let seed = 12345;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const dfs = (x: number, y: number, d: number, straight: number) => {
    if (nodes++ > budget) return;
    const c = at(x, y);
    if (!c) return;
    if (c.type === 'ejector') {
      if (d === 0 && straight > best.straight) {
        let l = 0, r = 0;
        cur.forEach(p => { if (p.turn < 0) l++; else if (p.turn > 0) r++; });
        best = { straight, turns: [l, r], path: cur.map(p => ({ ...p })) };
      }
      return;
    }
    if (c.type !== 'empty' || seen.has(y * g.w + x)) return;
    seen.add(y * g.w + x);
    const opts = [0, 0, 1, -1].map((t, i) => ({ t: i < 2 ? 0 : t, k: rnd() })); // straight listed twice: favoured
    opts.sort((a, b) => a.k - b.k);
    const tried = new Set<number>();
    for (const o of opts) {
      if (tried.has(o.t)) continue;
      tried.add(o.t);
      const nd = (d + o.t + 4) % 4;
      cur.push({ x, y, turn: o.t });
      dfs(x + DX[nd], y + DY[nd], nd, straight + (o.t === 0 ? 1 : 0));
      cur.pop();
    }
    seen.delete(y * g.w + x);
  };
  const restarts = 12;
  for (let r = 0; r < restarts; r++) { nodes = 0; dfs(gen.x, gen.y - 1, 0, 0); }
  return best;
}

/**
 * The Fan's boustrophedon (0-indexed cells): from the generator column it turns left, walks the bottom free row west, then snakes
 * up row by row (2 turns at each row end) and leaves the top free row through the middle ejector's neighbour at x = 7.
 */
function fanSnake(): LineResult {
  const path: { x: number; y: number; turn: number }[] = [{ x: 4, y: 8, turn: -1 }];
  for (let x = 3; x >= 1; x--) path.push({ x, y: 8, turn: 0 });
  path.push({ x: 0, y: 8, turn: 1 });
  let east = true;
  for (let y = 7; y >= 2; y--) {
    const start = east ? 0 : 8, end = east ? 8 : 0;
    path.push({ x: start, y, turn: east ? 1 : -1 });
    for (let x = start + (east ? 1 : -1); x !== end; x += east ? 1 : -1) path.push({ x, y, turn: 0 });
    path.push({ x: end, y, turn: east ? -1 : 1 });
    east = !east;
  }
  path.push({ x: 0, y: 1, turn: 1 });
  for (let x = 1; x <= 6; x++) path.push({ x, y: 1, turn: 0 });
  path.push({ x: 7, y: 1, turn: -1 });
  return { straight: path.filter(p => p.turn === 0).length, turns: [path.filter(p => p.turn < 0).length, path.filter(p => p.turn > 0).length], path };
}

/** Fill a found line with Percent x on straight cells and turns on turn cells, compile it, and return the compiled multiplier count and damage. */
function verifyLine(hull: string, lr: LineResult): { mults: number; damage: number; recipes: number } {
  const g = HULL_BUILDERS[hull]();
  for (const p of lr.path) place(g, p.x + 1, p.y + 1, p.turn === 0 ? 'percent_mult' : p.turn < 0 ? 'turn_l' : 'turn_r');
  const c = compile(g);
  const rec = c.recipes[0];
  return { mults: rec ? rec.packet.ops.filter(o => o.t === 'mul').length : 0, damage: rec ? evalDamage(rec.packet) : 0, recipes: c.recipes.length };
}

interface HullFacts { hull: string; cells: number; ejectors: number; rate: number; line: number; turnL: number; turnR: number; lanes: number }
const HULLS: HullFacts[] = [];

const WALL_TIERS = [1, 25, 50, 100];
function wallStats(level: ReturnType<typeof generateLevel>) {
  const costs = level.cells.filter((c): c is NonNullable<typeof c> => !!c).map(blockCost);
  const cols: number[] = new Array(WALL_COLS).fill(0);
  level.cells.forEach((c, i) => { if (c) cols[i % WALL_COLS] += blockCost(c); });
  const total = costs.reduce((a, b) => a + b, 0);
  const sorted = [...costs].sort((a, b) => a - b);
  const clearTime = (VIEW_H - 24 - 7) / level.approachSpeed;
  const cross = (level.rows * CELL + PASS_MARGIN_CELLS * CELL + 24) / (level.approachSpeed * BOOST_MAX);
  return { max: sorted[sorted.length - 1], med: sorted[Math.floor(sorted.length / 2)], total, clearDps: total / clearTime, passDps: Math.min(...cols) / cross, blocks: costs.length };
}

function partC() {
  log('\n## C. Damage ceilings\n');
  log('### C1. Percent x per-copy ladder (assumed)\n');
  log(`Owner: x${PCT_L1} at L1 to x${PCT_MAX} at the top level, ownership cap ${PCT_CAP}. Assumed ladder: **linear in log space** (the per-copy factor is multiplied by ${f2(Math.pow(PCT_MAX / PCT_L1, 1 / (PCT_LEVELS - 1)))} each level, i.e. 1.5 x 2^((L-1)/9)), top level = L10 (today's maxLevel). Today's code: x(1+0.5 L), i.e. x1.5 at L1 and x6 at L10.\n`);
  log('| level | per copy (proposed) | 10 copies all at this level | per copy (today) | 10 copies (today) |');
  log('|---|---|---|---|---|');
  for (let l = 1; l <= PCT_LEVELS; l++) log(`| L${l} | x${f2(pctLadder(l))} | x${sci(Math.pow(pctLadder(l), PCT_CAP))} | x${f2(1 + 0.5 * l)} | x${sci(Math.pow(1 + 0.5 * l, PCT_CAP))} |`);
  const all1 = Math.pow(pctLadder(1), PCT_CAP), midv = Math.pow(pctLadder(5), PCT_CAP), maxv = Math.pow(pctLadder(10), PCT_CAP);
  log(`\nWith ${PCT_CAP} copies: all L1 = **x${sci(all1)}**, all L5 (mid) = **x${sci(midv)}**, all L10 = **x${sci(maxv)}**. (Today's L10 ladder: x${sci(Math.pow(6, 10))}.) Per-level step at 10 copies: x${f2(Math.pow(Math.pow(PCT_MAX / PCT_L1, 1 / 9), PCT_CAP))}, so an upgrade of the block (all copies at once) is worth about x2 per level once 10 copies are owned.`);

  log('\n### C2. Chance boosters: proposed values and caps, and the stacked ceiling\n');
  log('Average multiplier per copy (expected value; the engine rolls each shot). They multiply with Percent x. Lucky Strike and Jackpot keep today\'s numbers (already weaker than Percent x per copy: x1.33..1.43 and x1.36..1.54 against x1.5..x3). Gambler\'s Gate today is x1.5..x1.8 (as strong as Percent x at L1 and it also loses half the shots), so a weaker chance is proposed.\n');
  log('| block | avg x per copy L1 | avg x per copy L3 | proposed cap | all copies L1 | all copies L3 | note |');
  log('|---|---|---|---|---|---|---|');
  let c1 = 1, c3 = 1;
  for (const c of CHANCE) {
    const a = Math.pow(c.avg[0], c.cap), b = Math.pow(c.avg[1], c.cap);
    c1 *= a; c3 *= b;
    log(`| ${name(c.id)} | x${f2(c.avg[0])} | x${f2(c.avg[1])} | ${c.cap} | x${sci(a)} | x${sci(b)} | ${c.note} |`);
  }
  log(`| all three at their caps | | | ${CHANCE.reduce((s, c) => s + c.cap, 0)} copies | x${sci(c1)} | x${sci(c3)} | |`);

  // Hull slot limits.
  log('\n### C3. Hull limits: how many multipliers physically fit in one line\n');
  log(`A multiplier needs a straight cell on the signal's path (a turn block takes its own cell). Lines may cross but not overlap, so the longest self-avoiding path from the generator to an ejector is searched (randomised depth-first search, ${QUICK ? '3e5' : '2e6 (Shuttle 6e6)'} nodes x 12 restarts, plus a hand-built snake for the Fan; a LOWER bound for the two big hulls) and then **built with Percent x on the straight cells and Turn blocks on the turn cells and compiled**, to prove the compiler accepts it and counts that many multipliers.\n`);
  log('| hull | buildable cells | ejectors | pulses/s | straight cells in the longest line found | turns (L/R) | compiled multipliers | compiled recipes | lanes after the multipliers |');
  log('|---|---|---|---|---|---|---|---|---|');
  const lanesAfter: Record<string, number> = { dart: 1, twin: 1, prong: 1, fan: 3, shuttle: 1 };
  for (const hull of HULL_ORDER) {
    const g = HULL_BUILDERS[hull]();
    let lr = longestLine(g, QUICK ? 3e5 : hull === 'shuttle' ? 6e6 : 2e6);
    if (hull === 'fan') { const sn = fanSnake(); if (sn.straight > lr.straight) lr = sn; }
    const v = verifyLine(hull, lr);
    const facts: HullFacts = {
      hull, cells: g.cells.filter(c => c.type === 'empty').length, ejectors: g.cells.filter(c => c.type === 'ejector').length,
      rate: CONFIG.PULSE.BASE_RATE * fireRateMul(hull), line: lr.straight, turnL: lr.turns[0], turnR: lr.turns[1], lanes: lanesAfter[hull],
    };
    HULLS.push(facts);
    log(`| ${hull} | ${facts.cells} | ${facts.ejectors} | ${facts.rate} | ${lr.straight} | ${lr.turns[0]} / ${lr.turns[1]} | ${v.mults} | ${v.recipes} | ${facts.lanes} |`);
  }
  log('\nLanes after the multipliers: a Splitter 3 placed LAST in the line (after the multipliers) shares their damage between the lanes; Fan has 3 ejectors, Prong 2 but its only free cells are the splitter cell and one straight cell, so there the choice is one multiplier on one lane or a Splitter 3 and none before it (counted as 1 lane here). Shuttle has one ejector.');

  // Ceilings per hull.
  log('\n### C4. Ceiling per hull: cap-based next to the real (slot-limited) one\n');
  log('Damage per shot = base x Percent x chain x chance chain. Base damage 2 = generator 1 + one Flat+ L1 (the starter build, hero level 0). DPS = shot x lanes x pulses/s. Percent x copies used: cap-based = 10 on every hull; real = min(10, straight cells in the longest line). Chance boosters: proposed caps in C2, real = what is left of the line after the Percent x slots (they also need straight cells), taken at all-L3 values.\n');
  log('| hull | Percent x slots (real) | shot, 10 copies all L1 | real shot all L1 | real shot all L10 | cap-based shot all L10 | cap-based shot all L10 + all chance blocks (L3) | real DPS all L10 + chance blocks that fit | cap-based DPS (same) |');
  log('|---|---|---|---|---|---|---|---|---|');
  const BASE = 2;
  for (const h of HULLS) {
    const slots = Math.min(PCT_CAP, h.line);
    const rest = Math.max(0, h.line - slots);
    // Fill remaining straight cells with the chance boosters, best average first (Jackpot, then Lucky, then Gambler), up to their caps.
    let chanceReal = 1, left = rest;
    for (const c of [...CHANCE].sort((a, b) => b.avg[1] - a.avg[1])) { const n = Math.min(c.cap, left); chanceReal *= Math.pow(c.avg[1], n); left -= n; }
    const real1 = BASE * Math.pow(pctLadder(1), slots), realMax = BASE * Math.pow(pctLadder(10), slots);
    const capMax = BASE * Math.pow(pctLadder(10), PCT_CAP);
    const capAll = capMax * c3;
    log(`| ${h.hull} | ${slots} | ${sci(BASE * Math.pow(pctLadder(1), PCT_CAP))} | ${sci(real1)} | ${sci(realMax)} | ${sci(capMax)} | ${sci(capAll)} | ${sci(realMax * chanceReal * h.lanes * h.rate)} | ${sci(capAll * h.lanes * h.rate)} |`);
  }
  log('\nFlat+ is additive and goes first: each copy at L10 adds +10 to the base, so 10 Flat+ L10 and hero level 10 make the base 1 + 5 + 100 = 106 (x53 on the starter\'s 2) and multiply every number above by 53.');

  // Content needs.
  log('\n### C5. What the content needs\n');
  log('Wall: effective HP of the toughest block (shield + HP x armor factor, `blockCost`), median block, whole-wall HP and the DPS needed to clear it before it reaches a ship at the bottom (the balance-damage "clear DPS"). Tier HP stops growing at tier 38 (rows, armor and shields grow).\n');
  log('| campaign tier | blocks | toughest block | median block | whole wall | clear DPS needed | pass DPS needed |');
  log('|---|---|---|---|---|---|---|');
  for (const t of WALL_TIERS) {
    const w = wallStats(generateLevel(t));
    log(`| ${t} | ${w.blocks} | ${f1(w.max)} | ${f1(w.med)} | ${f1(w.total)} | ${f1(w.clearDps)} | ${f1(w.passDps)} |`);
  }
  log('\nFrontier: five squares per ring (first five squares found at that ring, deterministic seed), walls only. Effective tier = 25 + 0.3 x ring (+/-2).\n');
  log('| ring | eff. tier | block HP (square 1) | toughest block (median of 5 squares) | whole wall (median) | clear DPS needed (median) |');
  log('|---|---|---|---|---|---|');
  const world = getWorld(FRONTIER_SEED);
  for (const r of [10, 25, 50, 100]) {
    const stats: ReturnType<typeof wallStats>[] = [];
    const tiers: number[] = [];
    let hp0 = 0;
    for (let k = 1; stats.length < 5 && k < 400; k++) {
      const x = r, y = -r + k;
      if (ring(x, y) !== r || world.isHole(x, y)) continue;
      const p = squareLevel(x, y, FRONTIER_SEED);
      if (p.kind !== 'wall') continue;
      if (!stats.length) hp0 = p.hp;
      stats.push(wallStats(frontierLevel(p)));
      tiers.push(p.tier);
    }
    const med = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
    log(`| ${r} | ${med(tiers)} | ${hp0} | ${f1(med(stats.map(s => s.max)))} | ${f1(med(stats.map(s => s.total)))} | ${f1(med(stats.map(s => s.clearDps)))} |`);
  }
  log('\nFree Fly: HP of a basic Rock parent (x1 of its species multiplier; Mother x3) = rockHp(tier of that wave) x 1.25^(wave-1); tier = 1 + floor((wave-1) x 40 / 15). A whole splitting family is x3.6 of the parent.\n');
  log('| wave | tier | Rock parent HP | Mother HP | family of a Rock (all bodies) | shots to kill a Rock at 2 / 115 / 5e4 per shot |');
  log('|---|---|---|---|---|---|');
  for (const w of [5, 10, 20, 30, 40, 50]) {
    const tier = encounterTier(w);
    const hp = wholeRockHp(rockHp(tier) * waveHpMul(w));
    const shots = (d: number) => Math.ceil(hp / d);
    log(`| ${w} | ${tier} | ${sci(hp)} | ${sci(hp * SPECIES.mother.hpMul)} | ${sci(hp * 3.6)} | ${[2, 115, 5e4].map(shots).map(sci).join(' / ')} |`);
  }

  // Headroom: ceiling shot against what the content needs to be one-shot.
  log('\n### C6. Headroom: ceiling damage per shot over the HP of a thing in the content\n');
  log('Ceiling shot (Fan or Shuttle, base 2, 10 Percent x copies): all L1 = x' + sci(all1) + ' x 2; all L5; all L10; all L10 + the chance boosters at their proposed caps (all L3). Headroom = shot / HP of one block or Rock parent: above 1 the thing dies to one shot. This is the "how far over the content" number.\n');
  const shots: [string, number][] = [['all L1', 2 * all1], ['all L5', 2 * midv], ['all L10', 2 * maxv], ['all L10 + chance (cap-based)', 2 * maxv * c3]];
  log('| content item | HP | ' + shots.map(s => `headroom ${s[0]} (${sci(s[1])})`).join(' | ') + ' |');
  log('|---|---|' + shots.map(() => '---').join('|') + '|');
  const items: [string, number][] = [];
  for (const t of [1, 25, 50, 100]) items.push([`Campaign tier ${t}, toughest block`, wallStats(generateLevel(t)).max]);
  for (const r of [10, 25, 50, 100]) {
    let best = 0;
    for (let k = 1; k < 400; k++) { const x = r, y = -r + k; if (ring(x, y) !== r || world.isHole(x, y)) continue; const p = squareLevel(x, y, FRONTIER_SEED); if (p.kind === 'wall') { best = wallStats(frontierLevel(p)).max; break; } }
    items.push([`Frontier ring ${r}, toughest block (1 square)`, best]);
  }
  for (const w of [10, 20, 30, 50]) items.push([`Free Fly wave ${w}, Rock parent`, wholeRockHp(rockHp(encounterTier(w)) * waveHpMul(w))]);
  for (const [n, hp] of items) log(`| ${n} | ${sci(hp)} | ${shots.map(s => 'x' + sci(s[1] / hp)).join(' | ')} |`);
}

// ============================================================================================ D. price and pacing
interface Income { name: string; credits: number; seconds: number }
const INCOME: Income[] = [];

function incomeRuns() {
  const SEEDS = QUICK ? [1, 2] : [1, 2, 3];
  const guns: [string, () => Grid][] = [
    ['Dart + Flat+ (fresh save)', buildDartStarterGrid],
    ['Twin + Flat+', () => { const g = HULL_BUILDERS.twin(); place(g, 1, 2, 'flat_plus'); return g; }],
    ['Twin + 2 Flat+', () => { const g = HULL_BUILDERS.twin(); place(g, 1, 2, 'flat_plus'); place(g, 1, 3, 'flat_plus'); return g; }],
    ['Prong: Splitter 3, Flat+, Turn L', () => { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'splitter_3'); place(g, 2, 2, 'flat_plus'); place(g, 3, 2, 'turn_l'); return g; }],
  ];
  for (const [n, mk] of guns) {
    const runs = SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: mk(), seed }), 600, []); });
    INCOME.push({ name: n, credits: runs.reduce((s, r) => s + r.credits, 0) / runs.length, seconds: runs.reduce((s, r) => s + r.time, 0) / runs.length });
  }
}

/** Cost of owning n copies at k = 0..n-1 already owned: base x g^k. */
const copies = (base: number, g: number, n: number, from = 0) => { let s = 0; for (let k = from; k < n; k++) s += Math.round(base * Math.pow(g, k)); return s; };
/** Cost of the upgrade ladder L1 -> max: base x mul x u^(l-1) summed. */
const ladder = (base: number, mul: number, u: number, max: number) => { let s = 0; for (let l = 1; l < max; l++) s += Math.round(base * mul * Math.pow(u, l - 1)); return s; };

interface Family { id: string; label: string; growth: number; cheapGrowth: number; cheap: number; normal: number; exp: number; up: number }
const FAMILIES: Family[] = [
  { id: 'A', label: 'Gentle (today\'s 1.18)', growth: 1.18, cheapGrowth: 1.18, cheap: 40, normal: 120, exp: 400, up: 2.2 },
  { id: 'B', label: 'Steady (1.30)', growth: 1.30, cheapGrowth: 1.15, cheap: 30, normal: 100, exp: 500, up: 2.2 },
  { id: 'C', label: 'Steep (1.45)', growth: 1.45, cheapGrowth: 1.20, cheap: 20, normal: 80, exp: 600, up: 2.2 },
];

function wallCredits(t: number, share = 0.5) { return generateLevel(t).cells.filter(Boolean).length * rewardPerBlock(t) * share; }

function partD() {
  log('\n## D. Price and pacing\n');
  log('### D1. Income per run (bots and walls)\n');
  log('Free Fly: the existing bot (`src/debug/freeflyBot.ts`) on four reference guns, mean of ' + (QUICK ? 2 : 3) + ' seeds, cap 600 s (same method as `npm run balance-econ`). Walls: credits of destroying half of a campaign wall once (the balance-damage assumption of one run), `blocks x 0.4 x 1.05^(tier-1) x 0.5`.\n');
  log('| source | credits per run | run length |');
  log('|---|---|---|');
  incomeRuns();
  for (const i of INCOME) log(`| Free Fly ${i.name} | ${f1(i.credits)} | ${Math.round(i.seconds)} s |`);
  for (const t of [5, 10, 25, 50, 100]) log(`| Campaign tier ${t}, half the wall | ${f1(wallCredits(t))} | one run |`);

  const dart = INCOME[0].credits, prong = INCOME[3].credits;
  const refs: [string, number][] = [['Dart run', dart], ['Prong run', prong], ['tier-10 wall run', wallCredits(10)], ['tier-25 wall run', wallCredits(25)], ['tier-50 wall run', wallCredits(50)]];

  log('\n### D2. Before (16c-1 formulas) and after (shipped)\n');
  const pm = 'percent_mult';
  const own10Old = copies(LEGACY_BASE_PRICE[pm], COPY_GROWTH, 10);
  const ladOld = ladder(LEGACY_BASE_PRICE[pm], UPGRADE_MUL, UPGRADE_GROWTH, 10);
  let own10 = 0;
  for (let k = 0; k < 10; k++) own10 += copyPrice(pm, k);
  let lad = 0;
  for (let l = 1; l < 10; l++) lad += upgradePrice(pm, l);
  log(`Before: copy = base x ${COPY_GROWTH}^owned, Percent x base ${LEGACY_BASE_PRICE[pm]}. After: Percent x base ${BASE_PRICE[pm]} x ${BLOCK_ECONOMY[pm].growth}^owned. Upgrade = base x ${UPGRADE_MUL} x ${UPGRADE_GROWTH}^(L-1) in both; the level is per block, shared by every copy.\n`);
  log('| item | credits | ' + refs.map(r => 'runs: ' + r[0]).join(' | ') + ' |');
  log('|---|---|' + refs.map(() => '---').join('|') + '|');
  const row = (n: string, c: number) => log(`| ${n} | ${Math.round(c)} | ${refs.map(r => f1(c / r[1])).join(' | ')} |`);
  row('BEFORE 10 Percent x at L1', own10Old);
  row('BEFORE upgrade ladder L1 -> L10', ladOld);
  row('AFTER 10 Percent x at L1', own10);
  row('AFTER upgrade ladder L1 -> L10', lad);
  row('AFTER 10 Percent x at L10 (copies + ladder)', own10 + lad);
  log(`\nAfter: the ladder alone is ${f1(lad / dart)} Dart runs; the 10 copies are ${f1(own10 / dart)}.`);

  log('\n### D3. Three candidate price families\n');
  log('Copy price = base x growth^owned, per block; bases by block band: cheap (turns, Splitter 2), normal (Percent x, Flat+, chance boosters scaled), expensive (Splitter 3, AoE, Homing, Chain Lightning, Fork, Residue Seed, Overkill Spill: 1 copy). Upgrade ladder = normal base x 2 x u^(L-1), L1->L10. Percent x sets the yardstick; "full cheap set" = 4 Turn L + 4 Turn R + 2 Splitter 2 (cheap base all, growth per block type). Runs of play are in Dart runs (what the player earns first) and in Prong runs (the mid game).\n');
  log('| family | growth normal / cheap blocks | bases cheap / normal / expensive | upgrade growth u |');
  log('|---|---|---|---|');
  for (const f of FAMILIES) log(`| ${f.id} ${f.label} | ${f.growth} / ${f.cheapGrowth} | ${f.cheap} / ${f.normal} / ${f.exp} | ${f.up} |`);
  log('');
  log('| family | first Percent x | 5 Percent x | 10 Percent x | full cheap set | expensive block (1 copy) | ladder L1->L10 | 10 Percent x at L10 | ... in Dart runs | ... in Prong runs |');
  log('|---|---|---|---|---|---|---|---|---|---|');
  const famRows: { f: Family; all: number }[] = [];
  for (const f of FAMILIES) {
    const cheapSet = copies(f.cheap, f.cheapGrowth, 4) * 2 + copies(f.cheap * 4, f.cheapGrowth, 2); // turns L and R; Splitter 2 priced at 4x cheap base
    const all = copies(f.normal, f.growth, 10) + ladder(f.normal, 2, f.up, 10);
    famRows.push({ f, all });
    log(`| ${f.id} | ${f.normal} (${f1(f.normal / dart)} Dart runs) | ${copies(f.normal, f.growth, 5)} (${f1(copies(f.normal, f.growth, 5) / dart)} runs) | ${copies(f.normal, f.growth, 10)} (${f1(copies(f.normal, f.growth, 10) / dart)} runs; ${f1(copies(f.normal, f.growth, 10) / prong)} Prong) | ${cheapSet} (${f1(cheapSet / dart)} runs) | ${f.exp} (${f1(f.exp / dart)} runs) | ${ladder(f.normal, 2, f.up, 10)} | ${all} | ${f1(all / dart)} | ${f1(all / prong)} |`);
  }
  log('\nPrice of the Nth copy of Percent x (credits):\n');
  log('| copy | A 1.18 | B 1.30 | C 1.45 |');
  log('|---|---|---|---|');
  for (const n of [1, 2, 3, 5, 7, 10]) log(`| ${n} | ${FAMILIES.map(f => Math.round(f.normal * Math.pow(f.growth, n - 1))).join(' | ')} |`);

  // D4: the recommended family (B) applied block by block.
  const B = FAMILIES[1];
  log('\n### D4. Family B, block by block (as shipped)\n');
  log('From src/data/blockEconomy.ts. Cap-1 blocks cost 2 x their old base; stacking shape blocks have no cap (cost shown for the first 10 copies); Dart runs at ' + f1(dart) + ' credits per Dart run.\n');
  log('| block | upgrades | level kept | cap | base | growth | cost of 1st copy | cost of all copies (or first 10) | ... in Dart runs | upgrade ladder to top |');
  log('|---|---|---|---|---|---|---|---|---|---|');
  for (const b of pickerBlocks()) {
    const up = UPGRADABLE.has(b.id);
    const [cap, base, g] = SPEC[b.id];
    const n = Number.isFinite(cap) ? cap : 10;
    const total = copies(base, g, n);
    const lvKept = up ? b.maxLevel : FIXED_LEVEL[b.id] ?? 1;
    const lad = up ? ladder(base, 2, 2.2, b.maxLevel) : 0;
    log(`| ${b.name} | ${up ? 'yes' : 'no'} | ${up ? 'L1..L' + b.maxLevel : 'L' + lvKept} | ${Number.isFinite(cap) ? cap : 'none'} | ${base} | ${g === 1 ? '-' : g} | ${base} | ${total} | ${f1(total / dart)} | ${up ? lad : '-'} |`);
  }
  return famRows;
}

// ============================================================================================ E. hero levels and Medals
function medalsThroughRing(R: number) {
  const w = getWorld(FRONTIER_SEED);
  let open = 0, medal = 0, expected = 0;
  for (let x = -R; x <= R; x++) for (let y = -R; y <= R; y++) {
    if (ring(x, y) > R || w.isHole(x, y)) continue;
    open++;
    if (w.hasMedal(x, y)) medal++;
  }
  expected = medal;
  return { open, medal, expected };
}

const HERO_BASE = 1, HERO_RATIO = 1.2;
const heroCost = (n: number) => Math.max(1, Math.round(HERO_BASE * Math.pow(HERO_RATIO, n - 1)));

function partE() {
  log('\n## E. Hero level cost\n');
  const fly = FLY_MEDAL_MILESTONES.reduce((s, m) => s + m.medals, 0);
  log('### E1. Medal supply\n');
  log(`Campaign: 1 Medal per tier's first full clear (tiers 1-100: 100 Medals, only if every wall is CLEARED, passing pays none). Free Fly milestones (waves ${FLY_MEDAL_MILESTONES.map(m => m.wave).join('/')}): ${FLY_MEDAL_MILESTONES.map(m => m.medals).join('+')} = **${fly}** Medals once per save. Frontier: a Medal marker on a seeded share of squares (chance ${CONFIG ? '8% at the origin falling to 2% far out, x2.5 in dead-end pockets' : ''}), paid on the first CLEAR of that square (the Free Fly squares count as squares too). Counts below are exact for the shipped seed ${FRONTIER_SEED}:\n`);
  log('| Frontier through ring | open squares | squares with a Medal | Medals if every one is cleared | Medals per 100 open squares |');
  log('|---|---|---|---|---|');
  const fr: Record<number, number> = {};
  for (const R of [10, 25, 50, 100]) {
    const m = medalsThroughRing(R);
    fr[R] = m.medal;
    log(`| ${R} | ${m.open} | ${m.medal} | ${m.medal} | ${f1((m.medal / m.open) * 100)} |`);
  }
  log('\nTotal Medals available (every campaign tier cleared + every Free Fly milestone + the Frontier through the ring):\n');
  log('| point of progress | campaign | Free Fly | Frontier | total |');
  log('|---|---|---|---|---|');
  const pts: [string, number, number, number][] = [
    ['campaign tier 10 cleared', 10, 5, 0], ['campaign tier 25 cleared (Frontier opens)', 25, 9, 0], ['tier 25 + Frontier ring 10', 25, 11, fr[10]],
    ['tier 50 + Frontier ring 25', 50, 14, fr[25]], ['tier 100 + Frontier ring 25', 100, 20, fr[25]], ['tier 100 + Frontier ring 50', 100, 23, fr[50]],
    ['tier 100 + Frontier ring 100', 100, 23, fr[100]],
  ];
  const supply: [string, number][] = [];
  for (const [n, c, f, r] of pts) { log(`| ${n} | ${c} | ${f} | ${r} | ${c + f + r} |`); supply.push([n, c + f + r]); }
  log('\n(Free Fly column: milestones reached by that point, an assumption: waves 5 / 10 / 15 / 20 / 30 / 40 / 50 = 1 / 3 / 5 / 8 / 12 / 17 / 23 cumulative.)');
  const sinks = CAPTAINS.reduce((s, c) => s + c.unlockCost, 0);
  const optionsOne = CAPTAINS.length * TIER_COSTS.reduce((a, b) => a + b, 0);
  log(`\nOther Medal sinks: captains ${CAPTAINS.map(c => c.unlockCost).join(' + ')} = ${sinks}; options ${TIER_COSTS.join('/')} per option, one option per tier for each of the ${CAPTAINS.length} captains = ${optionsOne} (both options of every tier = ${optionsOne * 2}). So the hero shares the supply with up to ${sinks + optionsOne} Medals of captain spending.`);

  log('\n### E2. Proposed geometric cost per level\n');
  log(`Today: level costs ${HERO_LEVEL_COSTS.join(', ')} (cumulative ${HERO_LEVEL_COSTS.reduce((a, b) => a + b, 0)} for level ${HERO_MAX_LEVEL}), capped at level ${HERO_MAX_LEVEL}, +${HERO_LEVEL_BASE_DAMAGE} base damage a level. Proposal: no cap, cost of level n = round(${HERO_BASE} x ${HERO_RATIO}^(n-1)), at least 1.\n`);
  log('| level | cost | cumulative | today\'s cumulative | base damage (+0.5 a level) | multiplier build | Flat+ L1 build (base +1) |');
  log('|---|---|---|---|---|---|---|');
  let cum = 0, today = 0;
  const cumAt: Record<number, number> = {};
  for (let n = 1; n <= 25; n++) {
    cum += heroCost(n);
    today += n <= HERO_LEVEL_COSTS.length ? HERO_LEVEL_COSTS[n - 1] : NaN;
    cumAt[n] = cum;
    const base = 1 + HERO_LEVEL_BASE_DAMAGE * n;
    if (n <= 25) log(`| ${n} | ${heroCost(n)} | ${cum} | ${isNaN(today) ? '(no level)' : today} | ${f1(base)} | x${f1(base)} | x${f2((base + 1) / 2)} |`);
  }
  log('\nHero level read against the supply (all Medals spent on the hero, nothing on captains; subtract captain spending for the realistic case):\n');
  log('| point of progress | Medals | hero level reachable (proposed) | hero level reachable (today, cap 10) |');
  log('|---|---|---|---|');
  for (const [n, s] of supply) {
    let lv = 0, spent = 0;
    while (spent + heroCost(lv + 1) <= s) spent += heroCost(++lv);
    let lt = 0, st = 0;
    while (lt < HERO_LEVEL_COSTS.length && st + HERO_LEVEL_COSTS[lt] <= s) st += HERO_LEVEL_COSTS[lt++];
    log(`| ${n} | ${s} | ${lv} | ${lt} |`);
  }
  log(`\nCost of a few more ratios (cumulative Medals for level 10 / 15 / 20 / 25): ${[1.15, 1.2, 1.25, 1.3].map(r => { const c = (n: number) => { let s = 0; for (let k = 1; k <= n; k++) s += Math.max(1, Math.round(Math.pow(r, k - 1))); return s; }; return `ratio ${r}: ${c(10)} / ${c(15)} / ${c(20)} / ${c(25)}`; }).join('; ')}.`);
}

// ============================================================================================ F. safety numbers
function partF() {
  log('\n## F. Numeric safety (computed facts)\n');
  const MAXHIT = 1e12;
  log(`Projectile damage is stored in a Float32Array (\`src/engine/pools.ts\`): it overflows to Infinity above ${Math.fround(3.4e38).toExponential(2)} and keeps 24 bits of precision (7 digits). Facts for a clamp of ${MAXHIT.toExponential(0)}:\n`);
  log('| wave | tier | basic Rock parent HP | Mother HP | HP above 1e12? |');
  log('|---|---|---|---|---|');
  let first = 0;
  for (const w of [40, 50, 60, 70, 75, 80, 100]) {
    const hp = rockHp(encounterTier(w)) * waveHpMul(w);
    log(`| ${w} | ${encounterTier(w)} | ${sci(hp)} | ${sci(hp * SPECIES.mother.hpMul)} | ${hp * SPECIES.mother.hpMul > MAXHIT ? 'yes (Mother)' : 'no'} |`);
  }
  for (let w = 1; w < 400 && !first; w++) if (rockHp(encounterTier(w)) * waveHpMul(w) * SPECIES.mother.hpMul > MAXHIT) first = w;
  log(`\nFirst wave whose Mother HP exceeds 1e12: **wave ${first}**. First wave whose basic Rock exceeds it: ${(() => { for (let w = 1; w < 400; w++) if (rockHp(encounterTier(w)) * waveHpMul(w) > MAXHIT) return w; return 'none'; })()}. Wall HP at the cap (tier 38+) stays in the hundreds. Credits / reward growth 1.05^tier is far below 1e12 within any reachable tier.`);
  log(`\nNaN path: \`Infinity x 0\` and \`Infinity - Infinity\` are NaN, and \`if (d <= 0 ...) return 0\` in the Gun is false for NaN, so a NaN packet would fire. Demonstration: ${(() => { const d = Infinity * 0; return `Infinity*0 = ${d}, (NaN <= 0) = ${d <= 0}`; })()}.`);
}

// ============================================================================================ run
log('# Economy audit tables (generated by scripts/economy-audit.ts)\n');
log('Read-only measurements; no game number is changed. See docs/economy-audit.md for the audit text, proposals and open questions.');
if (PARTS.has('a')) partA();
if (PARTS.has('b')) { if (!Object.keys(FIXED_LEVEL).length) { /* part A not run: bench B at L1 only */ } partB(); }
if (PARTS.has('c')) partC();
if (PARTS.has('d')) partD();
if (PARTS.has('e')) partE();
if (PARTS.has('f')) partF();
writeFileSync(OUT, lines.join('\n') + '\n');
void flatPlusAdd; void blockHp; void HULL_PRICES; void DEFAULT_OWNED;
