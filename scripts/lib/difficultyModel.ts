// Chunk 18a: the pure model behind scripts/difficulty-audit.ts (what content needs, what a buyer owns). No game number is
// changed here; every constant below is an ASSUMPTION of the audit and is printed in docs/difficulty-audit.md.
import { compile, Grid } from '../../src/engine/compiler';
import { standardBuild } from '../../src/debug/hullBuilds';
import { HULL_ORDER, HULL_PRICES } from '../../src/data/hulls';
import { copyCap, copyPrice, DEFAULT_OWNED, rockHp, upgradePrice, wholeRockHp } from '../../src/econ/economy';
import { heroLevelCost, HERO_LEVEL_BASE_DAMAGE } from '../../src/captains/data';
import { generateLevel } from '../../src/wall/generator';
import { LevelDef, rewardPerBlock } from '../../src/wall/level';
import { blockCost } from '../../src/wall/sim';
import { BOOST_MAX, CELL, PASS_MARGIN_CELLS, VIEW_H } from '../../src/wall/constants';
import { frontierLevel, squareKind, squareLevel } from '../../src/frontier/level';
import { FRONTIER_SEED, MAP_BASE_TIER, MAP_TIER_PER_RING, FF_WAVES_PER_TIER, FF_WAVE_AT_BASE } from '../../src/frontier/constants';
import { planWave } from '../../src/game/waves';
import { ENEMIES } from '../../src/data/enemies';
import { WAVE_TIME, waveHpMul } from '../../src/data/waves';
import { tierOfTime } from '../../src/econ/economy';
import { HULL_BUILDERS } from '../../src/game/gridUtils';

/**
 * Chunk 18b: coverage. A wall is 21 columns wide and a one-ejector hull must sweep it, so raw DPS overstates it (18a: a Shuttle
 * builder with an 86K estimate cleared tier 53, a Halberd builder with 5.3K cleared 99). The builder buyer ranks builds by
 * estimate x this weight; the casual buyer stays on the raw estimate. Weights are read off the 18a bot tables.
 */
export const COVERAGE_WEIGHT: Record<number, number> = { 1: 0.1, 2: 0.4 };
const ejectorCache = new Map<string, number>();
export function ejectorsOf(hull: string): number {
  if (!ejectorCache.has(hull)) ejectorCache.set(hull, HULL_BUILDERS[hull]().cells.filter(c => c.type === 'ejector').length);
  return ejectorCache.get(hull)!;
}
export const coverageOf = (hull: string) => COVERAGE_WEIGHT[ejectorsOf(hull)] ?? 1;
/** What the builder buyer ranks by. */
export const scoreOf = (e: { hull: string; est: number }) => e.est * coverageOf(e.hull);

// ------------------------------------------------------------------ assumptions of the buyer model
/** Runs the player makes per campaign tier before moving on, and the share of a wall each run destroys (balance-damage part C). */
export const RUNS_PER_TIER = 3;
export const SHARE_PER_RUN = 0.5;
/** Medals: one per first clear, Free Fly milestone Medals (7 exist: waves 5..50) arrive one per this many career tiers, Frontier Medals per ring. */
export const FLY_MEDAL_EVERY_TIERS = 7;
export const FLY_MEDALS_MAX = 7;
export const FRONTIER_MEDALS_PER_RING = 0.25;
/** The sensible buyer spends half of what a position is worth on the hull and half on blocks when asked for "the build at a hull's price point". */
export const PRICE_POINT_FACTOR = 2;
/** Sensitivity of the budget: a buyer who wastes credits on hulls they leave behind, and a grinder who replays walls. */
export const WASTEFUL_MUL = 0.5;
export const GRINDER_MUL = 4;

// ------------------------------------------------------------------ the career axis
/** A place the audit looks at: a campaign tier, a Frontier ring or a Free Fly wave, with its career tier e. */
export interface Point { label: string; kind: 'tier' | 'ring' | 'wave'; n: number; e: number }

/** Effective tier of a Frontier ring (no noise) and the ring of an effective tier. */
export const tierOfRing = (ring: number) => MAP_BASE_TIER + ring * MAP_TIER_PER_RING;
export const ringOfTier = (tier: number) => Math.max(0, (tier - MAP_BASE_TIER) / MAP_TIER_PER_RING);
/** Effective tier at which the Frontier's Free Fly squares have wave equivalent `wave` (inverse of waveEquivalent, uncapped). */
export const tierOfWave = (wave: number) => MAP_BASE_TIER + (wave - FF_WAVE_AT_BASE) / FF_WAVES_PER_TIER;

/** Wall squares of a ring along the axes, as the hull-pricing script samples them (never Free Fly squares), up to 3. */
export function frontierWalls(ring: number): LevelDef[] {
  const out: LevelDef[] = [];
  for (const [x, y] of [[ring, 0], [0, -ring], [-ring, 0], [0, ring], [ring, 7], [7, -ring]]) {
    if (ring === 0 && out.length) break;
    if (squareKind(x, y, FRONTIER_SEED) === 'wall') out.push(frontierLevel(squareLevel(x, y, FRONTIER_SEED)));
    if (out.length === 3) break;
  }
  return out;
}

// ------------------------------------------------------------------ what content needs
export interface WallNeeds {
  /** DPS to carve the cheapest column while the wall crosses at max boost. */
  pass: number;
  /** The same if the lane were the median column instead of the cheapest (what a MIN_COLUMN_SHARE of 1 would ask). */
  passMedian: number;
  /** DPS to destroy every block before the wall reaches a ship at the bottom. */
  clear: number;
  /** Effective HP (shield + armor-weighted HP) of the toughest single block. */
  toughest: number;
  /** Highest raw block HP. */
  hp: number;
  total: number;
  blocks: number;
  rows: number;
  /** Credits of one full clear. */
  credits: number;
}

const SHIP_MARGIN = 24;
/** The same arithmetic as scripts/balance-wall.ts and balance-damage part C. */
export function wallNeeds(l: LevelDef): WallNeeds {
  const cols: number[] = new Array(l.cols).fill(0);
  let toughest = 0, hp = 0, blocks = 0;
  l.cells.forEach((c, i) => {
    if (!c) return;
    cols[i % l.cols] += blockCost(c);
    toughest = Math.max(toughest, blockCost(c));
    hp = Math.max(hp, c.hp);
    blocks++;
  });
  const total = cols.reduce((a, b) => a + b, 0);
  const cross = (l.rows * CELL + PASS_MARGIN_CELLS * CELL + SHIP_MARGIN) / (l.approachSpeed * BOOST_MAX);
  const clearTime = (VIEW_H - SHIP_MARGIN - 7) / l.approachSpeed;
  const sorted = [...cols].sort((a, b) => a - b);
  return { pass: sorted[0] / cross, passMedian: sorted[Math.floor(sorted.length / 2)] / cross, clear: total / clearTime, toughest, hp, total, blocks, rows: l.rows, credits: blocks * rewardPerBlock(l.tier) };
}

/** Mean needs of the wall squares of a Frontier ring. */
export function ringNeeds(ring: number): WallNeeds {
  const ws = frontierWalls(ring).map(wallNeeds);
  const m = (k: keyof WallNeeds) => ws.reduce((s, w) => s + w[k], 0) / ws.length;
  return { pass: m('pass'), passMedian: m('passMedian'), clear: m('clear'), toughest: m('toughest'), hp: m('hp'), total: m('total'), blocks: m('blocks'), rows: m('rows'), credits: m('credits') };
}

export const campaignNeeds = (tier: number) => wallNeeds(generateLevel(tier));

/** HP of a whole splitting family as a multiple of its first body, from generation g on (4 generations). */
const SHARE = ENEMIES.mitotic_rock.split!.hpShare;
const familyFrom = (g: number) => { let s = 0; for (let k = 0; k <= 4 - g; k++) s += Math.pow(2 * SHARE, k); return s; };

export interface FlyNeeds {
  /** Total HP to chew through per second to keep up with the waves (all bodies, splits included, over one WAVE_TIME). */
  keepUp: number;
  /** HP of the toughest first body of the wave. */
  toughest: number;
  tier: number;
}
/** Free Fly wave `wave` as the normal Free Fly plays it (tier by time, wave HP growth). Every body is assumed to split like a rock. */
export function flyNeeds(wave: number, seed = 1): FlyNeeds {
  const tier = tierOfTime((wave - 1) * WAVE_TIME);
  let total = 0, toughest = 0;
  for (const s of planWave(seed, wave)) {
    const hp = wholeRockHp(rockHp(tier) * s.hpMul * waveHpMul(wave));
    total += hp * familyFrom(s.generation);
    toughest = Math.max(toughest, hp);
  }
  return { keepUp: total / WAVE_TIME, toughest, tier };
}

// ------------------------------------------------------------------ credits and medals
/** Credits a sensible player earns while playing career tier t (campaign up to 100, Frontier rings beyond). */
const incomeCache = new Map<number, number>();
export function incomeAt(t: number): number {
  const k = Math.round(t);
  const hit = incomeCache.get(k);
  if (hit !== undefined) return hit;
  const full = k <= 100 ? campaignNeeds(k).credits : ringNeeds(Math.round(ringOfTier(k))).credits;
  const v = RUNS_PER_TIER * SHARE_PER_RUN * full;
  incomeCache.set(k, v);
  return v;
}
/** Credits banked on arriving at career tier `e` (every tier before it played, nothing wasted). */
export function budgetAt(e: number): number {
  let s = 0;
  for (let t = 1; t < Math.round(e); t++) s += incomeAt(t);
  return s;
}
/** Medals on arriving at career tier `e`. */
export function medalsAt(e: number): number {
  const campaign = Math.min(Math.max(0, Math.round(e) - 1), 100);
  const fly = Math.min(FLY_MEDALS_MAX, Math.floor(e / FLY_MEDAL_EVERY_TIERS));
  const frontier = e > MAP_BASE_TIER ? ringOfTier(e) * FRONTIER_MEDALS_PER_RING : 0;
  return Math.floor(campaign + fly + frontier);
}
/** Hero level that `medals` buy when all of them go to hero levels (an upper bound: captains and options cost Medals too). */
export function heroLevelFor(medals: number): number {
  let lv = 0, spent = 0;
  while (spent + heroLevelCost(lv) <= medals) spent += heroLevelCost(lv++);
  return lv;
}
export const heroDamage = (level: number) => level * HERO_LEVEL_BASE_DAMAGE;

// ------------------------------------------------------------------ what a buyer owns
/** Credits a circuit costs the buyer: the hull, every copy beyond the new-game inventory, and the upgrades to the highest level used. */
export function gridCost(hull: string, g: Grid): number {
  let cost = HULL_PRICES[hull as keyof typeof HULL_PRICES] ?? 0;
  const n: Record<string, number> = {}, lv: Record<string, number> = {};
  for (const c of g.cells) {
    if (c.type !== 'empty' || !c.blockId) continue;
    n[c.blockId] = (n[c.blockId] ?? 0) + 1;
    lv[c.blockId] = Math.max(lv[c.blockId] ?? 1, c.level);
  }
  for (const id of Object.keys(n)) {
    if (n[id] > copyCap(id)) return Infinity;
    for (let k = DEFAULT_OWNED[id] ?? 0; k < n[id]; k++) cost += copyPrice(id, k);
    for (let l = 1; l < lv[id]; l++) cost += upgradePrice(id, l);
  }
  return cost;
}

export interface Entry {
  hull: string;
  /** Damage blocks in all (Flat+ and Percent x). */
  copies: number;
  /** Level of the Percent x copies (the standard family: of every damage block). */
  level: number;
  cost: number;
  est: number;
  /** 'std' = src/debug/hullBuilds.ts as 17a uses it (Flat+ and Percent x alternate). 'mult' = a few Flat+ next to the generator, the rest Percent x. */
  fam: 'std' | 'mult';
  /** mult family: Flat+ copies and their level. */
  flats?: number;
  flatLevel?: number;
}
const isDmg = (c: { type: string; blockId?: string | null }) => c.type === 'empty' && (c.blockId === 'flat_plus' || c.blockId === 'percent_mult');
export const blockCount = (g: Grid) => g.cells.reduce((n, c) => n + (isDmg(c) ? 1 : 0), 0);

/**
 * The multiplier family: the sensible build's cells, the `flats` nearest the generator (Manhattan distance, a stand-in for path
 * order) Flat+ at `flatLevel`, every other one Percent x at `level`. A player who knows the game stacks Percent x on the main
 * line (x1.5 to x3 a copy) and keeps a few Flat+ in front of them; the alternating sensible build is a floor, this is closer to a ceiling.
 */
export function multBuild(hull: string, flats: number, percents: number, flatLevel: number, level: number): Grid | null {
  const g = standardBuild(hull, flats + percents, 1);
  if (!g || blockCount(g) < flats + percents) return null;
  const gen = g.cells.findIndex(c => c.type === 'generator');
  const gx = gen % g.w, gy = Math.floor(gen / g.w);
  const idx = g.cells.map((c, i) => (isDmg(c) ? i : -1)).filter(i => i >= 0)
    .sort((a, b) => (Math.abs((a % g.w) - gx) + Math.abs(Math.floor(a / g.w) - gy)) - (Math.abs((b % g.w) - gx) + Math.abs(Math.floor(b / g.w) - gy)));
  idx.forEach((i, k) => { g.cells[i].blockId = k < flats ? 'flat_plus' : 'percent_mult'; g.cells[i].level = k < flats ? flatLevel : level; });
  return g;
}
/** The grid of an entry. */
export const gridOfEntry = (e: Entry): Grid | null =>
  e.fam === 'std' ? standardBuild(e.hull, e.copies, e.level) : multBuild(e.hull, e.flats!, e.copies - e.flats!, e.flatLevel!, e.level);

let catalogue: Entry[] | null = null;
/** Every (hull, damage-block copies, level) of both families, priced, with its compile estimate at hero level 0. */
export function buildCatalogue(): Entry[] {
  if (catalogue) return catalogue;
  const out: Entry[] = [];
  for (const hull of HULL_ORDER) {
    const seen = new Set<string>();
    for (let level = 1; level <= 10; level++) {
      for (let copies = 1; copies <= 20; copies++) {
        const g = standardBuild(hull, copies, level);
        if (!g) continue;
        const real = blockCount(g);
        const key = `${real}:${level}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const cost = gridCost(hull, g);
        if (!isFinite(cost)) continue;
        out.push({ hull, copies: real, level, cost, est: compile(g).stats.estDps, fam: 'std' });
      }
    }
    const slots = blockCount(standardBuild(hull, 20, 1) ?? ({ cells: [] } as unknown as Grid));
    for (let flats = 1; flats <= 3; flats++) {
      for (let percents = 1; percents <= Math.min(10, slots - flats); percents++) {
        for (let level = 1; level <= 10; level++) {
          for (const flatLevel of new Set([1, Math.min(3, level), level])) {
            const g = multBuild(hull, flats, percents, flatLevel, level);
            if (!g) continue;
            const cost = gridCost(hull, g);
            if (!isFinite(cost)) continue;
            out.push({ hull, copies: flats + percents, level, cost, est: compile(g).stats.estDps, fam: 'mult', flats, flatLevel });
          }
        }
      }
    }
  }
  catalogue = out;
  return out;
}

/** The best entry the budget buys at a hero level, from the sensible family only ('std', a casual builder) or both ('any', a player who stacks Percent x): hero 0 ranks everything, the 60 best at hero 0 are re-estimated with the hero's base damage. */
export function bestOwned(budget: number, hero = 0, family: 'std' | 'any' = 'any'): Entry | null {
  const rank = family === 'std' ? (e: Entry) => e.est : scoreOf;
  const cands = buildCatalogue().filter(e => e.cost <= budget && (family === 'any' || e.fam === 'std')).sort((a, b) => rank(b) - rank(a));
  if (!cands.length) return null;
  if (!hero) return cands[0];
  let best: Entry | null = null;
  for (const e of cands.slice(0, 60)) {
    const g = gridOfEntry(e);
    if (!g) continue;
    const est = compile(g, { baseDamage: heroDamage(hero) }).stats.estDps;
    if (!best || rank({ ...e, est }) > rank(best)) best = { ...e, est };
  }
  return best;
}

/** Best entry of one hull under a budget (the "build at the hull's price point"). */
export function bestOnHull(hull: string, budget: number): Entry | null {
  const c = buildCatalogue().filter(e => e.hull === hull && e.cost <= budget).sort((a, b) => b.est - a.est);
  return c[0] ?? null;
}

// ------------------------------------------------------------------ reading a ratio
export const TRIVIAL = 5;
export const IMPOSSIBLE = 0.5;
/** Marks a ratio owned / needed: above TRIVIAL it is trivial (T), below IMPOSSIBLE impossible (X). */
export const mark = (r: number) => (r > TRIVIAL ? ' T' : r < IMPOSSIBLE ? ' X' : '');
export const ratioText = (r: number) => (!isFinite(r) ? 'inf' : r >= 100 ? r.toFixed(0) : r >= 10 ? r.toFixed(1) : r.toFixed(2)) + mark(r);

