// Chunk 14a: damage balance on the small numbers. Run: npm run balance-damage   (PART=a,b,c,d picks parts; default all)
//
// A) Every visible block at L1 and L5 on a reference circuit (Twin: generator -> block -> ejector, and the same with a
//    Flat+ before it; routing blocks on a Fan), benched on the real engine against one big target, a cluster of 8 and a
//    rock that splits (scripts/lib/dmgBench.ts). One table sorted by the big-target DPS with a Flat+.
// B) Per hull: a seeded hill-climb circuit search (fixed tries) with every block at L1, and at L5. The search scores a
//    circuit by its compile estimate times each modifier's measured engine factor (part A); the top 5 are then benched on
//    the engine. Reference = the top 5 with at most 2 copies of any block; the same search with up to 8 copies shows what
//    piling up copies buys: a circuit above 2.5x the reference median is flagged as a degenerate outlier.
// C) Progress: per tier, the DPS a wall needs against the DPS a player could own by then (every circuit the searches met,
//    priced; the best one the credits of the tiers before buy).
// D) Free Fly: waves the existing bot reaches with the best affordable circuit at several credit levels, and per hull.
import { compile, Grid } from '../src/engine/compiler';
import { orientAll } from '../src/engine/orient';
import { evalDamage, emitRate } from '../src/engine/compilerTypes';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { HULL_BUILDERS, cloneGrid } from '../src/game/gridUtils';
import { buildStarterGrid, place } from '../src/game/starter';
import { HULL_ORDER, HULL_PRICES, fireRateMul } from '../src/data/hulls';
import { CONFIG } from '../src/config';
import { Mulberry32 } from '../src/rng';
import { copyPrice, DEFAULT_OWNED, upgradePrice } from '../src/econ/economy';
import { benchAll, BenchRow } from './lib/dmgBench';
import { generateLevel } from '../src/wall/generator';
import { rewardPerBlock } from '../src/wall/level';
import { blockCost } from '../src/wall/sim';
import { BOOST_MAX, CELL, PASS_MARGIN_CELLS, VIEW_H, WALL_COLS } from '../src/wall/constants';
import { HERO_LEVEL_BASE_DAMAGE, heroLevelCost } from '../src/captains/data';
import { World } from '../src/game/world';
import { botRun } from '../src/debug/freeflyBot';
import { rng } from '../src/rng';
import { computeRunModifiers } from '../src/captains/modifiers';
import { readFileSync, writeFileSync } from 'node:fs';

const PARTS = new Set((process.env.PART ?? 'a,b,c,d').split(','));
const QUICK = process.env.QUICK === '1';
const f1 = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1));
const f2 = (n: number) => n.toFixed(2);
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };
const name = (id: string) => BLOCKS[id]?.name ?? id;

// ------------------------------------------------------------------ reference circuits
const ROUTING = new Set(['turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'alternator', 'random_router']);
const lvl = (id: string, l: number) => Math.min(l, BLOCKS[id].maxLevel);
const twinRef = (id: string | null, flat: boolean, l = 1): Grid => {
  const g = HULL_BUILDERS.twin();
  if (flat) place(g, 1, 3, 'flat_plus');
  if (id) place(g, 1, 2, id, lvl(id, l));
  return g;
};
/** Fan: the routing block above a Flat+ (or an empty cell), Turn R / Turn L on the same row to bring L / R to the side ejectors. */
const fanRef = (id: string, flat: boolean, l = 1): Grid => {
  const g = HULL_BUILDERS.fan();
  if (flat) place(g, 5, 9, 'flat_plus');
  place(g, 5, 8, id, lvl(id, l));
  place(g, 2, 8, 'turn_r'); place(g, 8, 8, 'turn_l');
  return g;
};
const refOf = (id: string, flat: boolean, l = 1) => (ROUTING.has(id) ? fanRef(id, flat, l) : twinRef(id, flat, l));

// ------------------------------------------------------------------ part A
interface ARow { id: string; l: number; alone: BenchRow; flat: BenchRow }
type Sc = 'big' | 'cluster' | 'split';
const SCS: Sc[] = ['big', 'cluster', 'split'];
/** Engine factor of a block per scenario = its circuit's engine/estimate ratio over the plain reference's. */
const FACTOR: Record<string, Record<number, Record<Sc, number>>> = {};
/** Objective weights: Free Fly = the three scenarios; walls = big and cluster (rock-only blocks do nothing on a wall). */
const W_FLY: Record<Sc, number> = { big: 1, cluster: 1, split: 1 };
const W_WALL: Record<Sc, number> = { big: 1, cluster: 1, split: 0 };
const ONES: Record<Sc, number> = { big: 1, cluster: 1, split: 1 };
/** Modifier type -> the block that adds it. */
const MOD_BLOCK: Record<string, string> = {};
for (const b of pickerBlocks()) {
  const p = compile(refOf(b.id, false)).recipes[0]?.packet;
  if (p) for (const m of p.mods) if (!MOD_BLOCK[m.type]) MOD_BLOCK[m.type] = b.id;
}

function partA(): ARow[] {
  const rows: ARow[] = [];
  const refTwin = benchAll(twinRef(null, true));
  const refFan = benchAll(fanRef('splitter_2', true));
  const eff = (r: BenchRow, sc: Sc) => r[sc] / Math.max(1e-9, r.est);
  for (const b of pickerBlocks()) {
    FACTOR[b.id] = {};
    for (const l of [1, 5]) {
      if (l > b.maxLevel && l === 5) { FACTOR[b.id][5] = FACTOR[b.id][1]; continue; }
      const flat = benchAll(refOf(b.id, true, l));
      const alone = benchAll(refOf(b.id, false, l));
      rows.push({ id: b.id, l, alone, flat });
      const ref = ROUTING.has(b.id) ? refFan : refTwin;
      FACTOR[b.id][l] = b.id === 'turn_l' || b.id === 'turn_r' ? { ...ONES } : { big: eff(flat, 'big') / eff(ref, 'big'), cluster: eff(flat, 'cluster') / eff(ref, 'cluster'), split: eff(flat, 'split') / eff(ref, 'split') };
    }
  }
  const plainTwin = refTwin;
  console.log('## A. Blocks on the reference circuit (engine HP removed per second)\n');
  console.log(`Twin (4 pulses/s): generator -> [Flat+] -> block -> ejector. Routing blocks: Fan, block above [Flat+], Turn R / Turn L to the side ejectors.`);
  console.log(`Reference Twin + Flat+ (no block): big ${f1(plainTwin.big)}, cluster ${f1(plainTwin.cluster)}, split ${f1(plainTwin.split)} (estimate ${f1(plainTwin.est)}). Fan Splitter 2 + Flat+: big ${f1(refFan.big)}, cluster ${f1(refFan.cluster)}, split ${f1(refFan.split)}.`);
  console.log('Targets sized to the circuit (big 4 s, cluster body 0.75 s, split parent 1.5 s of its estimate). "x ref" = big with Flat+ / the reference\'s big (Fan reference for routing blocks). Factor = engine efficiency (engine / estimate) over the reference\'s, per scenario (big / cluster / split), used by the search.\n');
  console.log('| block | cat | L | alone big | +Flat+ big | +Flat+ cluster | +Flat+ split | x ref (big) | x ref (cluster) | factor b/c/s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  const sorted = [...rows].sort((a, b) => b.flat.big - a.flat.big);
  for (const r of sorted) {
    const ref = ROUTING.has(r.id) ? refFan : refTwin;
    console.log(`| ${name(r.id)} | ${BLOCKS[r.id].category} | ${r.l} | ${f1(r.alone.big)} | ${f1(r.flat.big)} | ${f1(r.flat.cluster)} | ${f1(r.flat.split)} | ${f2(r.flat.big / ref.big)} | ${f2(r.flat.cluster / ref.cluster)} | ${SCS.map(k => f2(FACTOR[r.id][r.l][k])).join(' / ')} |`);
  }
  // Category check (step 3): L1 single-target contribution against the median of its category; L5 / L1.
  console.log('\nCategory check, L1 big-target "x ref" against the category median (target 0.6-1.6; specialists may be lower if they win their niche), and L5 / L1 (target <= 4):\n');
  console.log('| block | cat | L1 x ref | / cat median | best niche (x ref) | L5/L1 big | flag |');
  console.log('|---|---|---|---|---|---|---|');
  const xref = (r: ARow, k: 'big' | 'cluster' | 'split') => r.flat[k] / (ROUTING.has(r.id) ? refFan : refTwin)[k];
  const l1 = rows.filter(r => r.l === 1);
  const cats = new Set(l1.map(r => BLOCKS[r.id].category));
  const catMed: Record<string, number> = {};
  for (const c of cats) catMed[c] = median(l1.filter(r => BLOCKS[r.id].category === c && r.id !== 'turn_l' && r.id !== 'turn_r').map(r => xref(r, 'big')));
  for (const r of l1) {
    const r5 = rows.find(x => x.id === r.id && x.l === 5);
    const rel = xref(r, 'big') / catMed[BLOCKS[r.id].category];
    const niche = Math.max(xref(r, 'cluster'), xref(r, 'split'));
    const ratio = r5 ? r5.flat.big / r.flat.big : 1;
    const flags = [rel > 1.6 ? 'HIGH' : '', rel < 0.6 && niche < 1.15 ? 'LOW (no niche)' : rel < 0.6 ? 'low, niche' : '', ratio > 4 ? 'L5 STEEP' : ''].filter(Boolean).join(' ');
    console.log(`| ${name(r.id)} | ${BLOCKS[r.id].category} | ${f2(xref(r, 'big'))} | ${f2(rel)} | ${f2(niche)} | ${f2(ratio)} | ${flags} |`);
  }
  return rows;
}

// ------------------------------------------------------------------ part B: circuit search
interface Found { key: string; hull: string; level: number; cap: number; score: number; fly: number; wall: number; cost: number; cells: [number, string, number][]; engine?: BenchRow }

const IDS = pickerBlocks().map(b => b.id);
function factorOf(id: string, l: number, sc: Sc): number {
  const f = FACTOR[id];
  if (!f) return 1;
  if (l <= 1) return f[1][sc];
  if (l >= 5) return f[5][sc];
  return f[1][sc] * Math.pow(f[5][sc] / f[1][sc], (l - 1) / 4);
}

/**
 * The search's score per scenario: compile estimate per recipe, times the engine factors of the distinct modifiers on it.
 * Tricks do not compound freely (an AoE shot that also chains is not AoE x Chain): the factors are sorted and the k-th
 * strongest counts with exponent 1/2^k. Weakening factors (below 1) count in full.
 */
export function scoreParts(g: Grid, baseDamage = 0): Record<Sc, number> {
  const c = compile(g, { baseDamage });
  const pps = CONFIG.PULSE.BASE_RATE * fireRateMul(g.hullId);
  const out: Record<Sc, number> = { big: 0, cluster: 0, split: 0 };
  for (const r of c.recipes) {
    const er = emitRate(r.packet);
    const base = er.pulse * er.branch * evalDamage(r.packet) * pps;
    const ids = [...new Set(r.packet.mods.map(m => m.type))].map(t => ({ id: MOD_BLOCK[t], l: r.packet.mods.find(m => m.type === t)!.level ?? 1 })).filter(x => x.id);
    for (const sc of SCS) {
      const fs = ids.map(x => factorOf(x.id, x.l, sc));
      const up = fs.filter(f => f >= 1).sort((a, b) => b - a);
      let f = fs.filter(v => v < 1).reduce((a, v) => a * v, 1);
      up.forEach((v, k) => { f *= Math.pow(v, 1 / 2 ** k); });
      out[sc] += base * f;
    }
  }
  return out;
}
const weigh = (p: Record<Sc, number>, w: Record<Sc, number>) => SCS.reduce((s, k) => s + w[k] * p[k], 0) / SCS.reduce((s, k) => s + w[k], 0);
export const scoreGrid = (g: Grid, baseDamage = 0, w = W_FLY) => weigh(scoreParts(g, baseDamage), w);
const engineOf = (b: BenchRow, w: Record<Sc, number>) => weigh({ big: b.big, cluster: b.cluster, split: b.split }, w);

function circuitCost(hull: string, cells: [number, string, number][]): number {
  let cost = HULL_PRICES[hull as keyof typeof HULL_PRICES] ?? 0;
  const n: Record<string, number> = {}, lv: Record<string, number> = {};
  for (const [, id, l] of cells) { n[id] = (n[id] ?? 0) + 1; lv[id] = Math.max(lv[id] ?? 1, l); }
  for (const id of Object.keys(n)) {
    for (let k = DEFAULT_OWNED[id] ?? 0; k < n[id]; k++) cost += copyPrice(id, k);
    for (let l = 1; l < lv[id]; l++) cost += upgradePrice(id, l);
  }
  return cost;
}

const snapshot = (g: Grid): [number, string, number][] =>
  g.cells.map((c, i) => [i, c.blockId, c.level] as [number, string | null, number]).filter((x): x is [number, string, number] => !!x[1] && g.cells[x[0]].type === 'empty');
export const gridFrom = (hull: string, cells: [number, string, number][]): Grid => {
  const g = HULL_BUILDERS[hull]();
  for (const [i, id, l] of cells) Object.assign(g.cells[i], { blockId: id, level: l, rotation: 0 });
  orientAll(g); // every block faces the way the signal reaches it (chunk 16a: orientation is stored)
  return g;
};

/** Removes blocks that are not on a live path (they do nothing and would only add cost). */
function clean(g: Grid) {
  const c = compile(g);
  g.cells.forEach((cell, i) => { if (cell.type === 'empty' && cell.blockId && !c.cellInfo[i].onPath) cell.blockId = null; });
}

/**
 * The skeletons restarts take turns starting from: the bare hull, and a routing skeleton that reaches every ejector (Prong:
 * Splitter 3 + Turn Left; Fan: Splitter 3 + Turn R / Turn L; Shuttle: the starter's two turns, its ejector is off the
 * generator's column).
 */
function skeleton(hull: string, r: number): Grid {
  if (hull === 'shuttle') {
    const g = buildStarterGrid();
    for (const c of g.cells) if (c.blockId === 'flat_plus') c.blockId = null;
    return g;
  }
  if (r % 2 === 0) return HULL_BUILDERS[hull]();
  if (hull === 'prong') { const g = HULL_BUILDERS.prong(); place(g, 1, 2, 'splitter_3'); place(g, 3, 2, 'turn_l'); return g; }
  if (hull === 'fan') return fanRef('splitter_3', false);
  return HULL_BUILDERS[hull]();
}

const FRONTIER: Found[] = [];
function search(hull: string, level: number, cap: number, seed: number, restarts: number, steps: number, w = W_FLY): Found[] {
  const rnd = new Mulberry32(seed);
  const best = new Map<string, Found>();
  const empties = HULL_BUILDERS[hull]().cells.map((c, i) => (c.type === 'empty' ? i : -1)).filter(i => i >= 0);
  const record = (g: Grid, score: number) => {
    const cells = snapshot(g);
    const key = cells.map(([i, id, l]) => `${i}:${id}:${l}`).join(',');
    if (best.has(key)) return;
    const parts = scoreParts(g);
    const f: Found = { key, hull, level, cap, score, fly: weigh(parts, W_FLY), wall: weigh(parts, W_WALL), cost: circuitCost(hull, cells), cells };
    best.set(key, f);
    FRONTIER.push(f);
  };
  for (let r = 0; r < restarts; r++) {
    const g = skeleton(hull, r);
    const count = (id: string) => g.cells.reduce((n, c) => n + (c.blockId === id ? 1 : 0), 0);
    for (const c of g.cells) if (c.blockId) c.level = lvl(c.blockId, level);
    let cur = scoreGrid(g, 0, w);
    record(g, cur);
    for (let s = 0; s < steps; s++) {
      // Mutate a cell on the live path or next to it (most of the Fan is far from any line).
      const info = compile(g).cellInfo;
      const near = empties.filter(i => info[i].onPath || [-1, 1, -g.w, g.w].some(d => info[i + d]?.onPath));
      const pool = near.length && rnd.next() < 0.85 ? near : empties;
      const i = pool[Math.floor(rnd.next() * pool.length)];
      const cell = g.cells[i];
      const old = { blockId: cell.blockId, level: cell.level };
      if (rnd.next() < 0.25) cell.blockId = null;
      else {
        const id = IDS[Math.floor(rnd.next() * IDS.length)];
        if (count(id) >= cap && cell.blockId !== id) continue;
        cell.blockId = id; cell.level = lvl(id, level);
      }
      cell.rotation = 0;
      orientAll(g);
      const sc = scoreGrid(g, 0, w);
      if (sc >= cur) {
        cur = sc;
        if (sc > 0) { const h = cloneGrid(g); clean(h); record(h, sc); }
      } else { cell.blockId = old.blockId; cell.level = old.level; }
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}

/** The search's best RERANK circuits benched on the engine and sorted by the engine (same objective weights). */
const RERANK = QUICK ? 8 : 20;
function engineTop(found: Found[], w: Record<Sc, number>, n = 5): Found[] {
  const top = found.slice(0, RERANK);
  for (const f of top) f.engine ??= benchAll(gridFrom(f.hull, f.cells));
  return top.sort((a, b) => engineOf(b.engine!, w) - engineOf(a.engine!, w)).slice(0, n);
}

/** A readable chain: G > blocks > E, with branches in braces. */
export function chainOf(g: Grid): string {
  const c = compile(g);
  const live = c.segments.filter(s => s.kind === 'live');
  const at = (x: number, y: number) => g.cells[y * g.w + x];
  const visit = (x: number, y: number, depth: number, seen: Set<string>): string => {
    const outs = live.filter(s => s.fromCell.x === x && s.fromCell.y === y);
    const parts = outs.map(s => {
      const k = `${s.toCell.x},${s.toCell.y},${s.dir}`;
      if (seen.has(k) || depth > 40) return '...';
      seen.add(k);
      const cell = at(s.toCell.x, s.toCell.y);
      if (cell?.type === 'ejector') return 'E';
      const label = cell?.blockId ? `${name(cell.blockId)}${cell.level > 1 ? ' L' + cell.level : ''}` : '?';
      const rest = visit(s.toCell.x, s.toCell.y, depth + 1, seen);
      return rest ? `${label} > ${rest}` : label;
    });
    if (parts.length <= 1) return parts[0] ?? '';
    return `{ ${parts.join(' | ')} }`;
  };
  const gen = g.cells.find(cc => cc.type === 'generator')!;
  return `G > ${visit(gen.x, gen.y, 0, new Set())}`;
}

interface HullResult { hull: string; level: number; ref: Found[]; refBench: BenchRow[]; free: Found[]; freeBench: BenchRow[]; median: number }
const RESULTS: HullResult[] = [];
const TRIES = QUICK ? { restarts: 3, steps: 300 } : { restarts: 6, steps: 900 };

function partB() {
  console.log(`\n## B. Best circuits per hull (seeded hill-climb, ${TRIES.restarts} restarts x ${TRIES.steps} mutations per search)\n`);
  console.log(`Reference search: every block at the level, at most 2 copies of any block. Free search: up to 8 copies. Each search's best ${RERANK} (by its score: estimate x engine factors, diminishing) are benched on the engine and the top 5 by the engine are shown. Engine = mixed HP/s (mean of big, cluster, split).\n`);
  for (const hull of HULL_ORDER) {
    for (const level of [1, 5]) {
      const ref = engineTop(search(hull, level, 2, 1000 + level, TRIES.restarts, TRIES.steps), W_FLY);
      const free = engineTop(search(hull, level, 8, 2000 + level, TRIES.restarts, TRIES.steps), W_FLY);
      // Wall-objective searches feed the progress frontier (part C) only.
      if (PARTS.has('c')) { search(hull, level, 2, 3000 + level, TRIES.restarts, TRIES.steps, W_WALL); search(hull, level, 8, 4000 + level, TRIES.restarts, TRIES.steps, W_WALL); }
      const refBench = ref.map(f => f.engine!);
      const freeBench = free.map(f => f.engine!);
      const med = median(refBench.map(b => b.mixed));
      RESULTS.push({ hull, level, ref, refBench, free, freeBench, median: med });
      console.log(`### ${hull} L${level}: reference median ${f1(med)} HP/s\n`);
      console.log('| # | search | engine mixed | big | cluster | split | x median | cost | chain |');
      console.log('|---|---|---|---|---|---|---|---|---|');
      const line = (tag: string, f: Found, b: BenchRow) => {
        const x = b.mixed / Math.max(1e-9, med);
        console.log(`| ${tag} | ${f1(f.score)} | ${f1(b.mixed)} | ${f1(b.big)} | ${f1(b.cluster)} | ${f1(b.split)} | ${f2(x)}${x > 2.5 ? ' **OUTLIER**' : ''} | ${f.cost} | ${chainOf(gridFrom(hull, f.cells))} |`);
      };
      ref.forEach((f, i) => line(`ref ${i + 1}`, f, refBench[i]));
      free.forEach((f, i) => line(`free ${i + 1}`, f, freeBench[i]));
      console.log('');
    }
    // Mid-game levels for the progress frontier (part C) only.
    if (PARTS.has('c')) for (const level of [2, 3]) for (const cap of [2, 8]) search(hull, level, cap, 5000 + level * 10 + cap, TRIES.restarts, TRIES.steps, W_WALL);
  }
}

// ------------------------------------------------------------------ part C: progress
const SHIP_MARGIN = 24;
/** Runs of effort per tier the economy model assumes, and the share of a wall each run destroys on average. */
const RUNS_PER_TIER = 3;
const SHARE_PER_RUN = 0.5;
/** Free Fly milestone Medals assumed by tier 20 (waves 5 and 10), on top of one Medal per first clear. */
const FLY_MEDALS = 3;

function wallNeeds(t: number) {
  const l = generateLevel(t);
  const cols: number[] = new Array(WALL_COLS).fill(0);
  l.cells.forEach((c, i) => { if (c) cols[i % WALL_COLS] += blockCost(c); });
  const total = cols.reduce((a, b) => a + b, 0);
  const cheapest = Math.min(...cols);
  const cross = (l.rows * CELL + PASS_MARGIN_CELLS * CELL + SHIP_MARGIN) / (l.approachSpeed * BOOST_MAX);
  const clearTime = (VIEW_H - SHIP_MARGIN - 7) / l.approachSpeed;
  return { pass: cheapest / cross, clear: total / clearTime, credits: l.cells.filter(Boolean).length * rewardPerBlock(t) };
}
const heroLevelFor = (medals: number) => { let lv = 0, spent = 0; while (spent + heroLevelCost(lv) <= medals) spent += heroLevelCost(lv++); return lv; };
function bestAffordable(budget: number, baseDamage = 0, mode: 'wall' | 'fly' = 'wall'): { f: Found | null; dps: number } {
  const w = mode === 'wall' ? W_WALL : W_FLY;
  const cands = FRONTIER.filter(f => f.cost <= budget).sort((a, b) => b[mode] - a[mode]).slice(0, baseDamage ? 25 : 1);
  let best: Found | null = null, dps = 0;
  for (const f of cands) { const s = baseDamage ? scoreGrid(gridFrom(f.hull, f.cells), baseDamage, w) : f[mode]; if (s > dps) { dps = s; best = f; } }
  return { f: best, dps };
}

function partC() {
  console.log(`\n## C. Progress: DPS a wall needs against the DPS a player could own\n`);
  console.log(`Income model: before tier N the player has played every tier t < N ${RUNS_PER_TIER} times, destroying ${SHARE_PER_RUN * 100}% of the wall per run (credits = ${RUNS_PER_TIER * SHARE_PER_RUN} x the full-clear credits of each earlier tier; Free Fly income not counted). Owned DPS = the best circuit the searches met that the credits buy (hull + copies + upgrades), its wall score (estimate x the big/cluster engine factors; levels 1, 2, 3 and 5 searched). Hero level from ${FLY_MEDALS} Free Fly Medals + one per earlier tier, all spent on hero levels, base +${HERO_LEVEL_BASE_DAMAGE} a level.`);
  console.log('Pass DPS: the cheapest column carved while the wall crosses at max boost. Clear DPS: every block before the wall reaches a ship at the bottom. Target: owned / clear about 0.5-1 (clear in 2-4 runs), 2 = clears in one run.\n');
  console.log('| tier | pass DPS | clear DPS | credits so far | owned DPS (hero 0) | owned / clear | hero lvl | owned DPS with hero | with hero / clear | best affordable circuit |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  let bank = 0;
  const rows: { t: number; ratio: number; ratioHero: number }[] = [];
  const tiers = [1, 5, 10, 20, 30, 50, 75, 100];
  let ti = 0;
  for (let t = 1; t <= 100; t++) {
    if (t === tiers[ti]) {
      ti++;
      const need = wallNeeds(t);
      const own = bestAffordable(bank);
      const hero = heroLevelFor(t - 1 + (t >= 20 ? FLY_MEDALS : 0));
      const ownH = bestAffordable(bank, hero * HERO_LEVEL_BASE_DAMAGE);
      rows.push({ t, ratio: own.dps / need.clear, ratioHero: ownH.dps / need.clear });
      console.log(`| ${t} | ${f1(need.pass)} | ${f1(need.clear)} | ${Math.round(bank)} | ${f1(own.dps)} | ${f2(own.dps / need.clear)} | ${hero} | ${f1(ownH.dps)} | ${f2(ownH.dps / need.clear)} | ${ownH.f ? `${ownH.f.hull}: ${chainOf(gridFrom(ownH.f.hull, ownH.f.cells))}` : '-'} |`);
    }
    bank += RUNS_PER_TIER * SHARE_PER_RUN * wallNeeds(t).credits;
  }
  return rows;
}

// ------------------------------------------------------------------ part D: Free Fly bot
const BOT_SEEDS = QUICK ? [1] : [1, 2, 3];
const BOT_LIMIT = 1500;
function botWaves(g: Grid, baseDamage = 0): { wave: number; time: number } {
  const runs = BOT_SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: g, seed, modifiers: { ...computeRunModifiers(0, []), baseDamage } }), BOT_LIMIT, []); });
  return { wave: runs.reduce((s, r) => s + r.wave, 0) / runs.length, time: runs.reduce((s, r) => s + r.time, 0) / runs.length };
}
function partD() {
  console.log(`\n## D. Free Fly bot (src/debug/freeflyBot.ts), mean of ${BOT_SEEDS.length} seeds, cap ${BOT_LIMIT} s\n`);
  console.log('Per hull: its best reference circuit (at most 2 copies of a block) at L1 and at L5. Target for a strong build: Dart 5, Twin 8, Prong 12, Fan 16, Shuttle 20.\n');
  console.log('| hull | L | wave reached | survived s | circuit |');
  console.log('|---|---|---|---|---|');
  for (const r of RESULTS) {
    const f = r.ref[0];
    if (!f) continue;
    const g = gridFrom(r.hull, f.cells);
    const b = botWaves(g);
    console.log(`| ${r.hull} | ${r.level} | ${f1(b.wave)} | ${b.time.toFixed(0)} | ${chainOf(g)} |`);
  }
  console.log('\nBy credits spent (best affordable circuit from the searches, hero level 0):\n');
  console.log('| credits | wave reached | survived s | circuit |');
  console.log('|---|---|---|---|');
  for (const c of [0, 150, 500, 2000, 8000, 30000]) {
    const a = bestAffordable(c, 0, 'fly');
    if (!a.f) continue;
    const g = gridFrom(a.f.hull, a.f.cells);
    const b = botWaves(g);
    console.log(`| ${c} | ${f1(b.wave)} | ${b.time.toFixed(0)} | ${a.f.hull}: ${chainOf(g)} |`);
  }
}

// ------------------------------------------------------------------ run
// IN_JSON=<circuits json> with PART=d: fly the per-hull circuits of an earlier run (no search; no credit table).
if (process.env.IN_JSON) {
  const d: { hull: string; level: number; ref: [number, string, number][][] }[] = JSON.parse(readFileSync(process.env.IN_JSON, 'utf8'));
  for (const r of d) RESULTS.push({ hull: r.hull, level: r.level, ref: r.ref.map(cells => ({ key: '', hull: r.hull, level: r.level, cap: 2, score: 0, fly: 0, wall: 0, cost: 0, cells })), refBench: [], free: [], freeBench: [], median: 0 });
}
if (PARTS.has('a') || !process.env.IN_JSON) partA();
if (!process.env.IN_JSON && (PARTS.has('b') || PARTS.has('c') || PARTS.has('d'))) partB();
if (PARTS.has('c')) partC();
if (PARTS.has('d')) partD();
// The audited circuits for tests/damageBalance.test.ts: per hull and level, the reference top 5 and the free top 5.
if (RESULTS.length && !process.env.IN_JSON) writeFileSync(process.env.OUT_JSON ?? 'reports/balance-damage-circuits.json', JSON.stringify(
  RESULTS.map(r => ({ hull: r.hull, level: r.level, ref: r.ref.map(f => f.cells), free: r.free.map(f => f.cells) })),
) + '\n');
