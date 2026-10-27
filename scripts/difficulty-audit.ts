// Chunk 18a: difficulty audit. READ-ONLY for game code: measures and prints, changes no number. Written up in docs/difficulty-audit.md.
// Run: npm run difficulty-audit        (PART=a,b,c,d,e picks parts, default a,b,c,d,e)
//   PART=c is the slow one (bots fly the walls, the Frontier and Free Fly); its results are cached per build in
//   reports/difficulty-audit/<hull>-<kind>.json, so a rerun only flies builds without a cache. FORCE=1 flies them again,
//   HULLS=wisp,kestrel limits the hulls (parallel shells can each take a few hulls), FF_LIMIT=<seconds> shortens Free Fly.
// The tables are also written to docs/difficulty-audit-tables.md (OUT=<file> redirects).
//
// A) progress model: what a sensible buyer owns at campaign tiers, Frontier rings and Free Fly waves.
// B) needed vs owned: DPS to pass / clear, toughest block, owned DPS, ratios (trivial > 5x, impossible < 0.5x).
// C) how far each hull's build gets (bots, real engine).
// D) levers other than HP.
// E) proposed curves and the same ratio tables with them.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { standardBuild } from '../src/debug/hullBuilds';
import { buildDartStarterGrid } from '../src/game/starter';
import { compile, Grid } from '../src/engine/compiler';
import { HULL_ORDER, HULLS } from '../src/data/hulls';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { generateLevel, isSpike, MAX_TIER, buildWall, armorFraction, shieldFraction, blocksForRows, SPIKE_HP_MUL, WallSpec } from '../src/wall/generator';
import { simulateWall } from '../src/wall/sim';
import { approachSpeedFor, BOOST_MAX, WALL_COLS } from '../src/wall/constants';
import { blockHp, LevelDef, rowsForTier, wholeHp } from '../src/wall/level';
import { computeRunModifiers, RunModifiers } from '../src/captains/modifiers';
import { MAP_BASE_TIER } from '../src/frontier/constants';
import { fmtBig } from '../src/ui/format';
import {
  bestOnHull, bestOwned, budgetAt, buildCatalogue, campaignNeeds, flyNeeds, frontierWalls, GRINDER_MUL, gridOfEntry, heroLevelFor, medalsAt, PRICE_POINT_FACTOR,
  ratioText, ringNeeds, tierOfRing, tierOfWave, wallNeeds, WASTEFUL_MUL, Entry, WallNeeds, Point,
} from './lib/difficultyModel';
import { currentRingHp, proposalParts, proposedBlockHp, proposedRingHp } from './lib/difficultyProposal';

const PARTS = new Set((process.env.PART ?? 'a,b,c,d,e').split(','));
const OUT = process.env.OUT ?? 'docs/difficulty-audit-tables.md';
const CACHE = 'reports/difficulty-audit';
const FF_LIMIT = Number(process.env.FF_LIMIT ?? 2400);
const FF_SEEDS = [1, 2];
const TIERS = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
const RINGS = [10, 25, 50, 100, 200, 400];
const WAVES = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

const lines: string[] = [];
const out = (s = '') => { lines.push(s); console.log(s); };
const table = (head: string[], rows: (string | number)[][]) => {
  out(`| ${head.join(' | ')} |`);
  out(`|${head.map(() => '---').join('|')}|`);
  for (const r of rows) out(`| ${r.join(' | ')} |`);
  out();
};
const f1 = (n: number) => (!isFinite(n) ? 'inf' : Math.abs(n) >= 100 ? fmtBig(Math.round(n)) : Math.abs(n) >= 10 ? n.toFixed(0) : n.toFixed(1));
const hullName = (id: string) => HULLS[id as keyof typeof HULLS].name;
const buildText = (e: Entry | null) => (e ? `${hullName(e.hull)}, ${e.fam === 'mult' ? `${e.flats} Flat+ L${e.flatLevel} + ${e.copies - e.flats!} Percent x L${e.level}` : `${e.copies} dmg blocks L${e.level}`}` : '-');

// ------------------------------------------------------------------ the points
const POINTS: Point[] = [
  ...TIERS.map(n => ({ label: `tier ${n}`, kind: 'tier' as const, n, e: n })),
  ...RINGS.map(n => ({ label: `ring ${n}`, kind: 'ring' as const, n, e: tierOfRing(n) })),
  ...WAVES.map(n => ({ label: `FF wave ${n}`, kind: 'wave' as const, n, e: tierOfWave(n) })),
];

/** Needs of a point. Free Fly points report keep-up DPS in both columns (there is no pass or clear). */
function needsOf(p: Point): WallNeeds {
  if (p.kind === 'tier') return campaignNeeds(p.n);
  if (p.kind === 'ring') return ringNeeds(p.n);
  const f = flyNeeds(p.n);
  return { pass: f.keepUp, passMedian: f.keepUp, clear: f.keepUp, toughest: f.toughest, hp: f.toughest, total: 0, blocks: 0, rows: 0, credits: 0 };
}
/** Pass need smoothed over the neighbouring campaign tiers (templates make single tiers jumpy: a cheap column or a costly one). */
function smoothPass(p: Point): number {
  if (p.kind !== 'tier') return needsOf(p).pass;
  const xs: number[] = [];
  for (let t = Math.max(1, p.n - 3); t <= Math.min(MAX_TIER, p.n + 3); t++) xs.push(campaignNeeds(t).pass);
  return xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
}

interface Owned {
  budget: number; hero: number;
  /** A casual builder (the sensible alternating build of src/debug/hullBuilds.ts) and a builder who stacks Percent x, each without and with the hero level. */
  casual: Entry | null; casualHero: Entry | null; builder: Entry | null; builderHero: Entry | null;
}
const ownedAt = (p: Point, mul = 1): Owned => {
  const budget = budgetAt(p.e) * mul;
  const hero = heroLevelFor(medalsAt(p.e));
  return { budget, hero, casual: bestOwned(budget, 0, 'std'), casualHero: bestOwned(budget, hero, 'std'), builder: bestOwned(budget), builderHero: bestOwned(budget, hero) };
};
const est = (e: Entry | null) => (e ? e.est : 0);

// ------------------------------------------------------------------ A
function partA() {
  out('## A. Progress model: what a buyer owns\n');
  out(`Career tier e: the campaign tier itself; a Frontier ring r is e = ${MAP_BASE_TIER} + 0.3 r; a Free Fly wave w is the e whose Frontier Free Fly square has wave equivalent w (e = ${MAP_BASE_TIER} + 4 (w - 6)). Credits banked on arriving at e = 3 runs x 50% of the full-clear credits of every tier before it (campaign up to 100, Frontier walls of the matching ring beyond), nothing wasted, Free Fly income not counted. Two buyers with the same credits: the **casual** buyer owns the best "sensible build" (hull + k damage blocks, Flat+ and Percent x alternating, one level; src/debug/hullBuilds.ts, the build every 17a bot used); the **builder** owns the best of that family and of the multiplier family (1-3 Flat+ next to the generator, every other block a Percent x, the Percent x line a player who understands the game builds). Prices are the real ones (hull + copies + upgrades). Hero level = all Medals (campaign first clears + Free Fly milestone Medals + Frontier Medals) spent on hero levels, +0.5 base damage each.\n`);
  const rows = POINTS.map(p => {
    const o = ownedAt(p);
    return [p.label, f1(p.e), f1(o.budget), medalsAt(p.e), o.hero, buildText(o.casual), f1(est(o.casual)), f1(est(o.casualHero)), buildText(o.builder), f1(est(o.builder)), f1(est(o.builderHero))];
  });
  table(['point', 'career tier', 'credits banked', 'Medals', 'hero lvl', 'casual build', 'DPS', 'DPS + hero', 'builder build', 'DPS', 'DPS + hero'], rows);
  const top = [...buildCatalogue()].sort((a, b) => b.est - a.est)[0];
  const topStd = [...buildCatalogue()].filter(e => e.fam === 'std').sort((a, b) => b.est - a.est)[0];
  out(`Model ceilings (hero 0): casual ${buildText(topStd)} = ${f1(topStd.est)} DPS for ${f1(topStd.cost)} credits; builder ${buildText(top)} = ${f1(top.est)} DPS for ${f1(top.cost)}. More credits buy nothing in this model: it only knows Flat+ and Percent x lines (see Not verified), so the real ceiling with all 41 blocks is higher.\n`);
}

// ------------------------------------------------------------------ B
function partB() {
  out('## B. Needed vs owned\n');
  out('Pass = DPS to carve the cheapest column while the wall crosses at max boost (x4, ship at the top; flying low needs a quarter of it). Clear = DPS to destroy every block before the wall reaches a ship at the bottom. Toughest = effective HP (shield + HP x armor weight) of the toughest single block. Free Fly rows: both columns are the keep-up DPS (all HP of the wave, splits included, over one 40 s wave; every body assumed to split like a rock; the toughest column is raw HP of the first body). Ratio = owned DPS / needed, T = trivial (above 5x), X = impossible (below 0.5x).\n');
  table(['point', 'pass DPS', 'pass (7-tier median)', 'clear DPS', 'toughest block', 'clear / pass'], POINTS.map(p => {
    const n = needsOf(p);
    return [p.label, f1(n.pass), f1(smoothPass(p)), f1(n.clear), f1(n.toughest), p.kind === 'wave' ? '-' : (n.clear / n.pass).toFixed(0)];
  }));
  out('Owned / needed. "no hero" and "hero" = without and with the hero level of that point.\n');
  table(['point', 'casual pass', 'casual pass +hero', 'builder pass', 'builder pass +hero', 'casual clear', 'casual clear +hero', 'builder clear', 'builder clear +hero'], POINTS.map(p => {
    const n = needsOf(p), o = ownedAt(p);
    return [p.label, ratioText(est(o.casual) / n.pass), ratioText(est(o.casualHero) / n.pass), ratioText(est(o.builder) / n.pass), ratioText(est(o.builderHero) / n.pass),
      ratioText(est(o.casual) / n.clear), ratioText(est(o.casualHero) / n.clear), ratioText(est(o.builder) / n.clear), ratioText(est(o.builderHero) / n.clear)];
  }));
  out(`Sensitivity of the credit model: the clear ratio with the hero level (casual / builder) when the budget is x${WASTEFUL_MUL} (a buyer who wastes half on hulls they leave behind), x1, and x${GRINDER_MUL} (a grinder who replays walls).\n`);
  table(['point', `x${WASTEFUL_MUL}`, 'x1', `x${GRINDER_MUL}`], POINTS.map(p => {
    const n = needsOf(p);
    return [p.label, ...[WASTEFUL_MUL, 1, GRINDER_MUL].map(m => { const o = ownedAt(p, m); return `${ratioText(est(o.casualHero) / n.clear)} / ${ratioText(est(o.builderHero) / n.clear)}`; })];
  }));
}

// ------------------------------------------------------------------ C
interface BotResult {
  desc: string; kind: string; hull: string; copies: number; level: number; cost: number; est: number;
  tierPass: number; tierPassFail: string; tierClear: number; ringPass: number; ringClear: number; ffWaves: number[]; ffDied: boolean[];
  needPassAtReach: number; needClearAtReach: number;
}
type Mode = 'current' | 'proposed';
const okState = (s: string) => s === 'passed' || s === 'cleared';
const RING_LADDER = [0, 5, 10, 25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 1000, 1300, 1600, 2000];

/** Highest n in 0..max with ok(n) true by galloping then bisecting, then checking the non-monotone members (spike and milestone tiers) strictly. */
function reach(ok: (n: number) => boolean, max: number, special: number[] = []): number {
  let lo = 0, hi = 1;
  while (hi <= max && ok(hi)) { lo = hi; hi = Math.min(max + 1, hi * 2); if (lo === max) break; }
  if (lo < max) { let a = lo, b = Math.min(hi, max + 1); while (b - a > 1) { const m = (a + b) >> 1; if (ok(m)) a = m; else b = m; } lo = a; }
  for (const s of special.filter(x => x <= lo).sort((a, b) => a - b)) if (!ok(s)) return s - 1;
  return lo;
}

function fly(grid: () => Grid): { waves: number[]; died: boolean[] } {
  const runs = FF_SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: grid(), seed }), FF_LIMIT, []); });
  return { waves: runs.map(r => r.wave), died: runs.map(r => r.died) };
}

/** A level with every block's HP and shield multiplied (whole numbers): the walls of the proposed curves, for the bots. */
function scaled(l: LevelDef, k: number): LevelDef {
  return { ...l, cells: l.cells.map(c => (c ? { hp: wholeHp(c.hp * k), armor: c.armor, shield: c.shield > 0 ? wholeHp(c.shield * k) : 0 } : null)) };
}

/** Flies one build: mode 'current' = the game as it is, 'proposed' = the same walls with the HP of the proposed curves (Free Fly is not flown). */
function flyBuild(mk: () => Grid, hull: string, kind: string, e: Entry | null, mode: Mode = 'current', opts: { mods?: RunModifiers; noFly?: boolean } = {}): BotResult {
  const g = mk();
  const sim = (l: LevelDef, bot: 'carve' | 'clearAll') => simulateWall(l, mk(), bot, { modifiers: opts.mods });
  const level = (t: number) => (mode === 'current' ? generateLevel(t) : scaled(generateLevel(t), proposedBlockHp(t) / blockHp(t)));
  const ringWalls = (r: number) => (mode === 'current' ? frontierWalls(r) : frontierWalls(r).map(l => scaled(l, proposedRingHp(r) / currentRingHp(r))));
  const passMemo = new Map<number, boolean>(), clearMemo = new Map<number, boolean>();
  const tierPassOk = (t: number) => { if (!passMemo.has(t)) { const l = level(t); passMemo.set(t, okState(sim(l, 'carve').state) || okState(sim(l, 'clearAll').state)); } return passMemo.get(t)!; };
  const tierClearOk = (t: number) => { if (!clearMemo.has(t)) clearMemo.set(t, sim(level(t), 'clearAll').state === 'cleared'); return clearMemo.get(t)!; };
  const special = Array.from({ length: MAX_TIER }, (_, i) => i + 1).filter(t => isSpike(t) || t % 10 === 0);
  const tierPass = reach(tierPassOk, MAX_TIER, special);
  const tierClear = reach(tierClearOk, MAX_TIER, special);
  const ringOk = (mode: 'pass' | 'clear') => (i: number) => {
    const ws = ringWalls(RING_LADDER[i]);
    const wins = ws.filter(l => (mode === 'pass'
      ? okState(sim(l, 'carve').state) || okState(sim(l, 'clearAll').state)
      : sim(l, 'clearAll').state === 'cleared')).length;
    return wins * 2 > ws.length;
  };
  const ringPass = RING_LADDER[reach(ringOk('pass'), RING_LADDER.length - 1)];
  const ringClear = RING_LADDER[reach(ringOk('clear'), RING_LADDER.length - 1)];
  const ff = mode === 'current' && !opts.noFly ? fly(mk) : { waves: [] as number[], died: [] as boolean[] };
  const nR = tierPass > 0 ? campaignNeeds(tierPass) : null, nC = tierClear > 0 ? campaignNeeds(tierClear) : null;
  const est = compile(g).stats.estDps;
  return {
    desc: e ? buildText(e).replace(/^[^,]*, /, '') : '1 Flat+ L1', kind, hull, copies: e?.copies ?? 1, level: e?.level ?? 1, cost: e?.cost ?? 0, est,
    tierPass, tierPassFail: tierPass < MAX_TIER ? `${tierPass + 1} ${generateLevel(tierPass + 1).name}` : 'none', tierClear, ringPass, ringClear,
    ffWaves: ff.waves, ffDied: ff.died, needPassAtReach: nR ? nR.pass : 0, needClearAtReach: nC ? nC.clear : 0,
  };
}

/** The builds of part C: per hull the sensible build, and the best the hull's price point (PRICE_POINT_FACTOR x its price) buys. */
export function buildList(): { hull: string; kind: 'sensible' | 'tuned'; entry: Entry | null; mk: () => Grid }[] {
  const list: { hull: string; kind: 'sensible' | 'tuned'; entry: Entry | null; mk: () => Grid }[] = [];
  for (const hull of HULL_ORDER) {
    const sensible = hull === 'dart' ? null : bestFor(hull);
    list.push({ hull, kind: 'sensible', entry: sensible, mk: hull === 'dart' ? buildDartStarterGrid : () => standardBuild(hull)! });
    if (hull === 'dart') continue;
    const tuned = bestOnHull(hull, PRICE_POINT_FACTOR * HULLS[hull].price);
    if (tuned) list.push({ hull, kind: 'tuned', entry: tuned, mk: () => gridOfEntry(tuned)! });
  }
  return list;
}
const bestFor = (hull: string): Entry | null => {
  const cat = buildCatalogue();
  const g = standardBuild(hull)!;
  const n = g.cells.reduce((k, c) => k + (c.type === 'empty' && (c.blockId === 'flat_plus' || c.blockId === 'percent_mult') ? 1 : 0), 0);
  const lv = Math.max(...g.cells.filter(c => c.type === 'empty' && c.blockId).map(c => c.level));
  return cat.find(e => e.fam === 'std' && e.hull === hull && e.copies === n && e.level === lv) ?? null;
};

/** The bot results of every build in `mode`: read from the cache, flown when missing (HULLS limits which, SKIP_BOTS flies nothing). */
function botResults(mode: Mode): BotResult[] {
  mkdirSync(CACHE, { recursive: true });
  const only = process.env.HULLS ? new Set(process.env.HULLS.split(',')) : null;
  const results: BotResult[] = [];
  for (const b of buildList()) {
    const file = `${CACHE}/${b.hull}-${b.kind}${mode === 'current' ? '' : '-' + mode}.json`;
    if (existsSync(file) && !process.env.FORCE) { results.push(JSON.parse(readFileSync(file, 'utf8'))); continue; }
    if (only && !only.has(b.hull)) continue;
    if (process.env.SKIP_BOTS) continue;
    const t0 = Date.now();
    const r = flyBuild(b.mk, b.hull, b.kind, b.entry, mode);
    writeFileSync(file, JSON.stringify(r, null, 1));
    console.error(`${b.hull} ${b.kind} ${mode} done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pass ${r.tierPass}, clear ${r.tierClear}, ring ${r.ringPass}/${r.ringClear}, FF ${r.ffWaves}`);
    results.push(r);
  }
  return results;
}

function partC() {
  const results = botResults('current');
  out('## C. How far a build gets (bots)\n');
  out(`Bots: the carve bot and the clear-all bot of src/wall/sim.ts, the Free Fly bot of src/debug/freeflyBot.ts (${FF_SEEDS.length} seeds, cap ${FF_LIMIT} s). Highest tier passed: pass = the carve bot passes or the clear-all bot passes or clears; found by galloping and bisecting, then every spike and milestone tier up to it is checked, so it is the highest tier of the strict order up to rare template luck (a bot is not a human). Frontier rings: a ring counts when more than half of its (up to 3) wall squares on the axes are won, tested on the ring ladder ${RING_LADDER.slice(1, 8).join(', ')} ... ${RING_LADDER[RING_LADDER.length - 1]}. "sensible" = src/debug/hullBuilds.ts as 17a uses it; "price point" = the best Flat+ / Percent x build the hull's price x ${PRICE_POINT_FACTOR} buys (half hull, half blocks). Dart = the starter: one Flat+ and nothing else.\n`);
  const row = (r: BotResult) => [hullName(r.hull), r.kind, r.hull === 'dart' ? '1 Flat+ L1' : r.desc, f1(r.cost), f1(r.est), r.tierPass, r.tierPassFail, r.tierClear, r.ringPass, r.ringClear,
    r.ffWaves.join('/'), r.ffDied.every(Boolean) ? 'died' : 'cap'];
  table(['hull', 'build', 'dmg blocks', 'credits', 'est. DPS', 'tier passed', 'first tier not passed', 'tier cleared', 'ring passed', 'ring cleared', 'FF waves', 'FF end'], results.map(row));
  out('Career-matched: the build each buyer of section A owns at a position (casual = the sensible family, builder = the multiplier family; both with the hero level as base damage), flown on the walls as they are. This is the check of the model: does a player at tier t clear tier t?\n');
  careerTable(false);
  return results;
}

/** Career-matched bots: the build each buyer owns at a point (hero level included as base damage), flown on the walls, today and with the proposed HP. */
const CAREER: Point[] = POINTS.filter(p => (p.kind === 'tier' && [10, 20, 30, 40, 50, 60, 75, 100].includes(p.n)) || (p.kind === 'ring' && [50, 100, 200, 400].includes(p.n)));
interface CareerRow { p: Point; fam: 'casual' | 'builder'; hero: number; entry: Entry; r: BotResult }
function careerBots(mode: Mode): CareerRow[] {
  mkdirSync(CACHE, { recursive: true });
  const only = process.env.CAREER ? new Set(process.env.CAREER.split(',')) : null;
  const rows: CareerRow[] = [];
  for (const p of CAREER) {
    const o = ownedAt(p);
    for (const fam of ['casual', 'builder'] as const) {
      const entry = fam === 'casual' ? o.casualHero : o.builderHero;
      if (!entry) continue;
      const file = `${CACHE}/career-${p.label.replace(' ', '')}-${fam}${mode === 'current' ? '' : '-' + mode}.json`;
      if (existsSync(file) && !process.env.FORCE) { rows.push({ p, fam, hero: o.hero, entry, r: JSON.parse(readFileSync(file, 'utf8')) }); continue; }
      if ((only && !only.has(p.label)) || process.env.SKIP_BOTS) continue;
      const t0 = Date.now();
      const r = flyBuild(() => gridOfEntry(entry)!, entry.hull, fam, entry, mode, { mods: computeRunModifiers(o.hero, []), noFly: true });
      writeFileSync(file, JSON.stringify(r, null, 1));
      console.error(`career ${p.label} ${fam} ${mode} done in ${((Date.now() - t0) / 1000).toFixed(0)} s: pass ${r.tierPass}, clear ${r.tierClear}, ring ${r.ringPass}/${r.ringClear}`);
      rows.push({ p, fam, hero: o.hero, entry, r });
    }
  }
  return rows;
}
function careerTable(withProposed: boolean) {
  const cur = careerBots('current'), prop = withProposed ? careerBots('proposed') : [];
  const cell = (c: CareerRow, key: 'tierPass' | 'tierClear' | 'ringPass' | 'ringClear') => {
    const q = prop.find(x => x.p.label === c.p.label && x.fam === c.fam);
    return withProposed ? `${c.r[key]} -> ${q ? q.r[key] : '?'}` : String(c.r[key]);
  };
  table(['position', 'buyer', 'hero lvl', 'build the model gives', 'est. DPS', 'tier passed', 'tier cleared', 'ring passed', 'ring cleared'], cur.map(c => [c.p.label, c.fam, c.hero, buildText(c.entry), f1(c.entry.est),
    cell(c, 'tierPass'), cell(c, 'tierClear'), cell(c, 'ringPass'), cell(c, 'ringClear')]));
}

// ------------------------------------------------------------------ D
function slabSpec(t: number, over: Partial<WallSpec> = {}): WallSpec {
  const rows = over.rows ?? rowsForTier(t);
  return {
    tier: t, seed: t * 1000003 + 12345, template: 0, rows, target: blocksForRows(rows), hp: wholeHp(blockHp(t)), armorFrac: armorFraction(t), shieldFrac: shieldFraction(t),
    approachSpeed: approachSpeedFor(t), spike: false, ...over,
  };
}
const needsOfSpec = (s: WallSpec) => wallNeeds(buildWall(s));

function partD() {
  out('## D. Levers other than HP (a slab wall at the campaign tier, each lever changed alone; the cell is needed pass DPS / clear DPS as a multiple of the unchanged wall)\n');
  const ts = [10, 20, 30, 40, 60, 80, 100];
  const lever: [string, (t: number) => Partial<WallSpec>][] = [
    ['no armor', () => ({ armorFrac: 0 })],
    ['armor share x2', t => ({ armorFrac: Math.min(0.6, armorFraction(t) * 2) })],
    ['no shields', () => ({ shieldFrac: 0 })],
    ['shield share x2', t => ({ shieldFrac: Math.min(0.6, shieldFraction(t) * 2) })],
    ['wall speed x0.7', t => ({ approachSpeed: approachSpeedFor(t) * 0.7 })],
    ['wall speed x1.4', t => ({ approachSpeed: approachSpeedFor(t) * 1.4 })],
    ['rows x0.5', t => ({ rows: Math.max(4, Math.round(rowsForTier(t) * 0.5)) })],
    ['rows x2', t => ({ rows: Math.round(rowsForTier(t) * 2) })],
    ['spike (HP x1.6)', t => ({ hp: wholeHp(blockHp(t) * SPIKE_HP_MUL) })],
    ['HP x2', t => ({ hp: wholeHp(blockHp(t) * 2) })],
  ];
  const base = ts.map(t => needsOfSpec(slabSpec(t)));
  const rows = lever.map(([name, f]) => [name, ...ts.map((t, i) => {
    const n = needsOfSpec(slabSpec(t, f(t)));
    return `${(n.pass / base[i].pass).toFixed(2)} / ${(n.clear / base[i].clear).toFixed(2)}`;
  })]);
  table(['lever', ...ts.map(t => `tier ${t}`)], rows);
  out(`Wall width (${WALL_COLS} columns): needed clear DPS is proportional to the columns, needed pass DPS does not depend on it (one lane); a 31-column wall would need 1.48x the clear DPS and the same pass DPS.\n`);
  out('The lane: pass needs the cheapest column. How much dearer the median column is, what passing costs at the base wall speed (flying low, no boost) and the structural gap between clearing and passing:\n');
  table(['tier', 'pass DPS (cheapest column, boost x4)', 'pass if lane = median column', 'median / cheapest', 'pass at base speed (no boost)', 'clear / pass'], [1, 5, 10, 20, 30, 40, 60, 80, 100].map(t => {
    const n = campaignNeeds(t);
    return [t, f1(n.pass), f1(n.passMedian), (n.passMedian / n.pass).toFixed(2), f1(n.pass / BOOST_MAX), (n.clear / n.pass).toFixed(0)];
  }));
  out('How much armor and shields already inflate a wall (total effective HP / sum of raw HP) and the base wall speed:\n');
  table(['tier', 'armored share', 'shielded share', 'effective HP / raw HP', 'rows', 'wall speed px/s', 'seconds to clear (screen height / speed)', 'toughest block eff. HP / raw HP'], ts.map(t => {
    const l = generateLevel(t);
    const n = wallNeeds(l);
    const raw = n.blocks * n.hp;
    return [t, armorFraction(t).toFixed(2), shieldFraction(t).toFixed(2), (n.total / raw).toFixed(2), l.rows, l.approachSpeed.toFixed(0), (760 / l.approachSpeed).toFixed(0), (n.toughest / n.hp).toFixed(2)];
  }));
}

// ------------------------------------------------------------------ E
function partE() {
  out('## E. Proposed curves and the ratio tables with them\n');
  proposalParts(out, table, { f1, ratioText, POINTS, needsOf, ownedAt, est });
  out('Career-matched bots (as in section C): today -> on the proposed walls.\n');
  careerTable(true);
  const cur = botResults('current'), prop = botResults('proposed');
  if (!prop.length) return;
  out('The bots on the proposed walls (same builds, same walls, only block HP and shields scaled by the proposed curve; Free Fly is not flown). Cells read today -> proposed.\n');
  table(['hull', 'build', 'est. DPS', 'tier passed', 'tier cleared', 'ring passed', 'ring cleared'], prop.map(r => {
    const c = cur.find(x => x.hull === r.hull && x.kind === r.kind);
    const pair = (a: number | undefined, b: number) => `${a ?? '?'} -> ${b}`;
    return [hullName(r.hull), r.kind, f1(r.est), pair(c?.tierPass, r.tierPass), pair(c?.tierClear, r.tierClear), pair(c?.ringPass, r.ringPass), pair(c?.ringClear, r.ringClear)];
  }));
}

// BOTS_ONLY=1 HULLS=<ids>: fly (or read from the cache) the bots of those hulls in both modes, print nothing else (parallel shells).
if (process.env.BOTS_ONLY) { botResults('current'); botResults('proposed'); careerBots('current'); careerBots('proposed'); process.exit(0); }
if (PARTS.has('a')) partA();
if (PARTS.has('b')) partB();
if (PARTS.has('c')) partC();
if (PARTS.has('d')) partD();
if (PARTS.has('e')) partE();
if (!process.env.NO_WRITE) writeFileSync(OUT, lines.join('\n') + '\n');
