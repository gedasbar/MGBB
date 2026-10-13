import { Mulberry32 } from '../rng';
import { DEFAULT_APPROACH_SPEED, WALL_COLS } from './constants';
import { BlockDef, blockHp, LevelDef, rowsForTier, wholeHp } from './level';

export const MAX_TIER = 100;
export const SPIKE_HP_MUL = 1.6;
/** First tier with armored blocks / shielded blocks. */
export const ARMOR_START = 11;
export const SHIELD_START = 21;
/** Share of blocks armored / shielded at the start tier and at tier 100. */
export const ARMOR_FRAC: [number, number] = [0.05, 0.4];
export const SHIELD_FRAC: [number, number] = [0.05, 0.4];
export const MIN_SPIKES = 8;
export const MAX_SPIKES = 16;
export const FIRST_SPIKE_TIER = 6;
/** No column may hold fewer blocks than this share of the median column (keeps every lane a real cost). */
export const MIN_COLUMN_SHARE = 0.3;

/** Armor value of a block (the engine halves direct damage at 10) and the shield pool as a share of HP, by tier. */
const armorValue = (tier: number) => (tier >= 60 ? 20 : 10);
const shieldShare = (tier: number) => (tier >= 60 ? 1 : 0.5);

/**
 * A shape is a filter over the grid. `rb` counts rows from the bottom (0 = the row nearest the player), `c` is the
 * column 0..20, `h` the height being tried. The generator grows `h` until the shape holds enough blocks.
 */
type Shape = (rb: number, c: number, h: number, rand: Mulberry32) => boolean;
const MID = (WALL_COLS - 1) / 2;
const dist = (c: number) => Math.abs(c - MID);

interface Template { name: string; hint: string; shape: Shape }

const TEMPLATES: Template[] = [
  { name: 'Slab', hint: 'A dense slab: steady fire wins.', shape: (_rb, _c, _h, rand) => rand.next() > 0.08 },
  { name: 'Pillars', hint: 'Pillars with gaps between them: fire down the gaps to dig in.', shape: (rb, c) => c % 4 < 2 || rb < 2 },
  { name: 'Checker', hint: 'A checkerboard: shots hit one block and stop, spread your fire.', shape: (rb, c) => (rb + c) % 2 === 0 },
  { name: 'Arrow', hint: 'An arrow head: the tip arrives first, the wings last.', shape: (rb, c, h) => { const d = Math.floor((rb * 10) / Math.max(1, h - 1)); return dist(c) >= d && dist(c) < d + 4; } },
  { name: 'Corridor', hint: 'A central corridor lets you fly deep, but the sides are solid.', shape: (rb, c, h) => rb >= h - 2 || dist(c) > 1.5 },
  { name: 'Towers', hint: 'Two towers: split fire or sweep between them.', shape: (rb, c, h) => c <= 4 || c >= 16 || rb >= h - 2 },
  { name: 'Rings', hint: 'Nested rings: each ring has to be broken before the next.', shape: (rb, c, h) => Math.min(rb, h - 1 - rb, c, WALL_COLS - 1 - c) % 3 === 0 },
  { name: 'Stairs', hint: 'A staircase: the left side comes first, climb along it.', shape: (rb, c, h) => c < 6 + Math.floor((rb * 15) / Math.max(1, h - 1)) },
];

interface Milestone { name: string; hint: string; shape: Shape; armor?: Mode; shield?: Mode; armorFrac?: number; shieldFrac?: number }

const MILESTONES: Record<number, Milestone> = {
  10: { name: 'Gatehouse', hint: 'Armor appears next tier: bring Armor-Piercer or pure damage.', shape: (rb, c, h) => !((c === 4 || c === 5 || c === 15 || c === 16) && rb < h - 3) },
  20: { name: 'Bands', hint: 'Armored bands with empty rows between: shields begin next tier.', shape: (rb) => rb % 6 !== 5, armor: 'front' },
  30: { name: 'Diamond', hint: 'Shields soak damage and recover after 2 s: burst them or use Shield-Breaker.', shape: (rb, c, h) => dist(c) <= 10 * (1 - Math.abs((2 * rb) / Math.max(1, h - 1) - 1)) + 0.5, shield: 'core' },
  40: { name: 'Twin Citadels', hint: 'Two huge towers joined at the top: area damage thins them.', shape: (rb, c, h) => c <= 5 || c >= 15 || rb >= h - 3 },
  50: { name: 'The Maze', hint: 'Walls with alternating gaps: curving and homing shots find the way.', shape: (rb, c) => (rb % 4 === 3 ? (Math.floor(rb / 4) % 2 === 0 ? c > 3 : c < 17) : c % 5 === 0) },
  60: { name: 'Iron Rings', hint: 'Thick double rings, heavier armor and shields from here on.', shape: (rb, c, h) => Math.floor(Math.min(rb, h - 1 - rb, c, WALL_COLS - 1 - c) / 2) % 2 === 0, armor: 'core', shield: 'sides' },
  70: { name: 'Fortress', hint: 'A rim, a moat and a keep: break the rim, then pour fire into the keep.', shape: (rb, c, h) => Math.min(rb, h - 1 - rb, c, WALL_COLS - 1 - c) < 2 || (dist(c) <= 3 && rb > 3 && rb < h - 4), armor: 'front', shield: 'core' },
  80: { name: 'The Funnel', hint: 'An opening narrows toward the top: pierce along it.', shape: (rb, c, h) => dist(c) > 4 - Math.floor((rb * 4) / Math.max(1, h - 1)), shield: 'back' },
  90: { name: 'Bulwark', hint: 'Checkered 2x2 slabs, armored and shielded: bring everything you have.', shape: (rb, c) => ((rb >> 1) + (c >> 1)) % 2 === 0, armor: 'sides', shield: 'back' },
  100: { name: 'The Last Wall', hint: 'No gaps, half armored, half shielded: the hardest wall there is.', shape: () => true, armorFrac: 0.5, shieldFrac: 0.5 },
};

type Mode = 'front' | 'back' | 'core' | 'sides';

/** Spike tiers: about 1 in 8 of tiers 6..100 (never a milestone), clamped to 8..16 of them by the seeded rolls. */
const spikeSet: Set<number> = (() => {
  const cand: { t: number; roll: number }[] = [];
  for (let t = FIRST_SPIKE_TIER; t <= MAX_TIER; t++) if (t % 10 !== 0) cand.push({ t, roll: new Mulberry32(t * 7919 + 99).next() });
  const natural = cand.filter(c => c.roll < 1 / 8).length;
  const count = Math.max(MIN_SPIKES, Math.min(MAX_SPIKES, natural));
  return new Set([...cand].sort((a, b) => a.roll - b.roll).slice(0, count).map(c => c.t));
})();

export const isSpike = (tier: number) => spikeSet.has(tier);
export const isMilestone = (tier: number) => tier % 10 === 0 && tier >= 10 && tier <= MAX_TIER;

/** Template of every tier, built in order so that no template appears three tiers in a row. */
const templateIndex: number[] = (() => {
  const out: number[] = [0];
  for (let t = 1; t <= MAX_TIER; t++) {
    let pick = Math.floor(new Mulberry32(t * 31337 + 7).next() * TEMPLATES.length);
    if (t === 1) pick = 0; // tier 1 is always the plain slab
    if (t >= 3 && out[t - 1] === pick && out[t - 2] === pick) pick = (pick + 1) % TEMPLATES.length;
    out[t] = pick;
  }
  return out;
})();

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const armorFraction = (tier: number) => (tier < ARMOR_START ? 0 : lerp(ARMOR_FRAC[0], ARMOR_FRAC[1], (tier - ARMOR_START) / (MAX_TIER - ARMOR_START)));
export const shieldFraction = (tier: number) => (tier < SHIELD_START ? 0 : lerp(SHIELD_FRAC[0], SHIELD_FRAC[1], (tier - SHIELD_START) / (MAX_TIER - SHIELD_START)));

/** Number of blocks in the tier's wall: a solid wall of the tier's rows minus a few gaps, whatever the shape. */
export const blocksForTier = (tier: number) => WALL_COLS * rowsForTier(tier) - 6;

/** Blocks ordered so that the first `n` of them are the ones a mode picks (front = nearest the player). */
function pickCluster(blocks: { r: number; c: number }[], h: number, mode: Mode, n: number, rand: Mulberry32): Set<number> {
  const scored = blocks.map((b, i) => {
    const noise = rand.next() * 0.9;
    const s = mode === 'front' ? b.r : mode === 'back' ? h - b.r : mode === 'core' ? 20 - dist(b.c) * 2 : dist(b.c) * 2;
    return { i, s: s + noise };
  });
  scored.sort((a, b) => b.s - a.s);
  return new Set(scored.slice(0, n).map(x => x.i));
}

const cache = new Map<number, LevelDef>();

/** The wall of a campaign tier (1..100). Pure function of the tier number: no Math.random. */
export function generateLevel(tier: number): LevelDef {
  const t = Math.max(1, Math.min(MAX_TIER, Math.floor(tier)));
  const hit = cache.get(t);
  if (hit) return hit;

  const ms = isMilestone(t) ? MILESTONES[t] : undefined;
  const tpl = ms ?? TEMPLATES[templateIndex[t]];
  const spike = isSpike(t);
  const rows = rowsForTier(t);
  const target = blocksForTier(t);
  const seed = t * 1000003 + 12345;

  // Grow the shape upward until it holds enough blocks, then trim the surplus from the far (top) end.
  let h = rows;
  let mask: boolean[] = [];
  let count = 0;
  for (;; h++) {
    const rand = new Mulberry32(seed);
    mask = [];
    count = 0;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < WALL_COLS; c++) {
        const on = tpl.shape(h - 1 - r, c, h, rand);
        mask.push(on);
        if (on) count++;
      }
    }
    if (count >= target || h >= rows * 4) break;
  }
  // Every column holds blocks (no straight open lane), and none is a nearly free lane next to its neighbours: a column
  // below MIN_COLUMN_SHARE of the median column gets blocks spread over its height.
  const colCount = (c: number) => { let n = 0; for (let r = 0; r < h; r++) if (mask[r * WALL_COLS + c]) n++; return n; };
  const counts = Array.from({ length: WALL_COLS }, (_, c) => colCount(c));
  const median = [...counts].sort((x, y) => x - y)[Math.floor(WALL_COLS / 2)];
  const minCount = Math.max(1, Math.ceil(median * MIN_COLUMN_SHARE));
  for (let c = 0; c < WALL_COLS; c++) {
    const need = minCount - counts[c];
    if (need <= 0) continue;
    const step = h / minCount;
    for (let k = 0, added = 0; k < minCount && added < need; k++) {
      let r = Math.min(h - 1, Math.floor(k * step + step / 2));
      for (let d = 0; d < h; d++) {
        const cand = r + (d % 2 === 0 ? d / 2 : -(d + 1) / 2);
        if (cand >= 0 && cand < h && !mask[cand * WALL_COLS + c]) { mask[cand * WALL_COLS + c] = true; added++; count++; break; }
      }
    }
    counts[c] = colCount(c);
  }
  // Trim the surplus from the far (top) end, never taking a column below its minimum.
  for (let i = 0; i < mask.length && count > target; i++) {
    const c = i % WALL_COLS;
    if (mask[i] && counts[c] > minCount) { mask[i] = false; counts[c]--; count--; }
  }

  const blocks: { r: number; c: number; idx: number }[] = [];
  mask.forEach((on, idx) => { if (on) blocks.push({ r: Math.floor(idx / WALL_COLS), c: idx % WALL_COLS, idx }); });

  const rand = new Mulberry32(seed + 1);
  const modes: Mode[] = ['front', 'core', 'sides'];
  const armorMode = ms?.armor ?? modes[Math.floor(rand.next() * modes.length)];
  const shieldModes: Mode[] = ['back', 'core', 'sides'];
  const shieldMode = ms?.shield ?? shieldModes[Math.floor(rand.next() * shieldModes.length)];
  const nArmor = Math.round(blocks.length * (ms?.armorFrac ?? armorFraction(t)));
  const nShield = Math.round(blocks.length * (ms?.shieldFrac ?? shieldFraction(t)));
  const armored = pickCluster(blocks, h, armorMode, nArmor, rand);
  const shielded = pickCluster(blocks, h, shieldMode, nShield, rand);

  const hp = wholeHp(blockHp(t) * (spike ? SPIKE_HP_MUL : 1));
  const cells: (BlockDef | null)[] = new Array(mask.length).fill(null);
  blocks.forEach((b, i) => {
    cells[b.idx] = { hp, armor: armored.has(i) ? armorValue(t) : 0, shield: shielded.has(i) ? wholeHp(hp * shieldShare(t)) : 0 };
  });

  const level: LevelDef = {
    tier: t, cols: WALL_COLS, rows: h, wrap: true, cells, approachSpeed: DEFAULT_APPROACH_SPEED,
    name: ms ? ms.name : tpl.name,
    hint: ms ? ms.hint : tpl.hint + (nArmor > 0 ? ' Some blocks are armored.' : '') + (nShield > 0 ? ' Some have shields.' : ''),
    campaign: true,
    ...(spike ? { spike: true } : {}),
    ...(ms ? { milestone: true } : {}),
  };
  cache.set(t, level);
  return level;
}
