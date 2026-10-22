// Chunk 17a, step 4: turns reports/chunk17a/hull-income.json (scripts/hull-pricing.ts) into the hull price table.
// Run: npx vite-node scripts/hull-pricing-fit.ts   (prints the table; writes reports/chunk17a/hull-prices.md)
import { readFileSync, writeFileSync } from 'fs';
import { HULL_ORDER, HULLS } from '../src/data/hulls';
import { generateLevel } from '../src/wall/generator';
import { rewardPerBlock } from '../src/wall/level';
import { frontierLevel, squareKind, squareLevel } from '../src/frontier/level';
import { FRONTIER_SEED, MAP_BASE_TIER, MAP_TIER_PER_RING } from '../src/frontier/constants';

const data = JSON.parse(readFileSync('reports/chunk17a/hull-income.json', 'utf8'));
const RUNS_TARGET = 4.5;                          // the middle of "3 to 6 runs"
const fullClear = (l: { cells: unknown[]; tier: number }) => l.cells.filter(Boolean).length * rewardPerBlock(l.tier);
/** Credits of a full clear of campaign tier T; a typical run that passes or half-clears pays half. */
const campaignRun = (t: number) => 0.5 * fullClear(generateLevel(t));
/** Same for a Frontier ring: mean over up to three wall squares of that ring. */
function frontierRun(r: number): number {
  const out: number[] = [];
  for (const [x, y] of [[r, 0], [0, -r], [-r, 0], [0, r], [r, 7], [7, -r]]) {
    if (squareKind(x, y, FRONTIER_SEED) === 'wall') out.push(0.5 * fullClear(frontierLevel(squareLevel(x, y, FRONTIER_SEED))));
    if (out.length === 3 || (r === 0 && out.length)) break;
  }
  return out.reduce((a, b) => a + b, 0) / Math.max(1, out.length);
}
const fmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K' : String(Math.round(n)));

// ---------------------------------------------------------------- the model
// A player's position when saving for hull n is an "effective tier": campaign tier up to 100, then the Frontier at
// tier 25 + 0.3 x ring. It advances by POINT_STEP per hull from POINT_START at the Wisp, so the Zenith sits deep in the
// Frontier. Income per run at a position = the larger of (a) the Free Fly run the bot earns with hull n-1's build, and
// (b) a half-clear of the content at that position (a pass or a half-clear pays about half the wall: docs/economy-audit.md D1).
// Price = RUNS_TARGET x income, then regularised: growth between GROWTH_MIN and GROWTH_MAX per hull, two significant digits.
const POINT_START = 10;            // Wisp: campaign tier 10 (the brief says 8-12)
const POINT_STEP = 9;              // tiers per hull: 1.05^9 = 1.55; the Zenith lands at Frontier ring 400, the deepest ring the sensible builds pass
const GROWTH_MIN = 1.5, GROWTH_MAX = 2.0;
const KEEP = new Set(['dart', 'twin', 'prong']);   // unchanged hulls
const twoDigits = (n: number) => { const e = Math.pow(10, Math.floor(Math.log10(n)) - 1); return Math.round(n / e) * e; };

const ringOfTier = (t: number) => Math.max(0, Math.round((t - MAP_BASE_TIER) / MAP_TIER_PER_RING));
const halfClear = (point: number) => (point <= 100 ? campaignRun(point) : frontierRun(ringOfTier(point)));
const whereText = (point: number) => (point <= 100 ? `campaign tier ${point}` : `Frontier ring ${ringOfTier(point)}`);

/** Highest campaign tier / Frontier ring the build of a hull passes (bot, scripts/hull-pricing.ts). */
const reach = (id: string) => ({
  tier: Math.max(0, ...data[id].wall.filter((r: any) => ['passed', 'cleared'].includes(r.carve) || ['passed', 'cleared'].includes(r.clearAll)).map((r: any) => r.tier)),
  cleared: Math.max(0, ...data[id].wall.filter((r: any) => r.clearAll === 'cleared').map((r: any) => r.tier)),
  ring: Math.max(-1, ...data[id].frontier.filter((r: any) => r.passed).map((r: any) => r.ring)),
});

const out: string[] = [];
out.push('| # | hull | price | where a player can afford it | income / run there | runs | what pays | previous build passes it? |');
out.push('|---|---|---|---|---|---|---|---|');
let prevPrice = 0;
const finals: Record<string, number> = {};
HULL_ORDER.forEach((id, i) => {
  const point = POINT_START + POINT_STEP * (i - 3);
  const prev = i > 0 ? HULL_ORDER[i - 1] : null;
  const ff = prev ? data[prev].ff.credits : 0;
  const camp = i >= 3 ? halfClear(point) : 0;
  const income = Math.max(ff, camp);
  let price: number;
  if (KEEP.has(id)) price = HULLS[id].price;
  else {
    price = twoDigits(RUNS_TARGET * income);
    price = Math.min(prevPrice * GROWTH_MAX, Math.max(prevPrice * GROWTH_MIN, price));
    price = twoDigits(price);
  }
  finals[id] = price;
  const ffOnly = i < 3;
  const where = ffOnly ? 'Free Fly (any)' : whereText(point);
  const reachPrev = prev ? reach(prev) : null;
  const ok = !reachPrev || ffOnly ? '-' : point <= 100 ? (reachPrev.tier >= point ? 'yes' : `no (passes ${reachPrev.tier})`) : (reachPrev.ring >= ringOfTier(point) ? 'yes' : `no (ring ${reachPrev.ring})`);
  out.push(`| ${i + 1} | ${HULLS[id].name} | ${fmt(price)} | ${where} | ${fmt(ffOnly ? ff : income)} (${ff >= camp ? 'Free Fly' : 'half-clear'}) | ${(price / Math.max(1, ffOnly ? ff : income)).toFixed(1)} | ${ff >= camp ? 'Free Fly' : 'wall'} | ${ok} |`);
  prevPrice = price;
});
console.log(out.join('\n'));
console.log('\nFINAL', JSON.stringify(finals));
console.log('growth', HULL_ORDER.slice(1).map((id, i) => (finals[id] / Math.max(1, finals[HULL_ORDER[i]])).toFixed(2)).join(' '));
writeFileSync('reports/chunk17a/hull-prices.md', out.join('\n') + '\n');
