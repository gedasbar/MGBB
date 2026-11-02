// Chunk 27a: campaign tiers 101-200 (docs/tiers-101-200.md). Plain data: the schedule of type tiers, the curves and the numbers of each
// type. Every number a playtest might change is here (or in `src/wall/constants.ts` for HP and rewards), nothing is hidden in the builders.

/** First and last tier of the late campaign. Tiers 1..CLASSIC_TIERS are the first hundred (unchanged). */
export const CLASSIC_TIERS = 100;
export const LATE_FIRST = CLASSIC_TIERS + 1;
export const LATE_LAST = 200;
export const isLateTier = (tier: number) => tier >= LATE_FIRST && tier <= LATE_LAST;

export type LateType = 'monolith' | 'maze' | 'fortress' | 'drift' | 'strong_wind' | 'crosswind' | 'fog' | 'regrowth' | 'mitosis_wall';

export interface LateTypeInfo {
  id: LateType;
  name: string;
  /** One short line for the list and the tier panel. */
  line: string;
  /** false = chunk 27b builds the effect; until then its tiers are ordinary hard walls that keep the type in the data. */
  built: boolean;
}

/** In the order the types are introduced (one every 3 tiers from tier 103). */
export const LATE_TYPE_ORDER: readonly LateType[] = ['monolith', 'maze', 'fortress', 'drift', 'strong_wind', 'crosswind', 'fog', 'regrowth', 'mitosis_wall'];

export const LATE_TYPES: Record<LateType, LateTypeInfo> = {
  monolith: { id: 'monolith', name: 'Monolith', line: 'Monolith: one row of huge blocks. Break at least one to pass.', built: true },
  maze: { id: 'maze', name: 'Maze', line: 'Maze: a winding path through blocks too tough to kill. Just fly.', built: true },
  fortress: { id: 'fortress', name: 'Fortress', line: 'Fortress: every block is armored and shielded.', built: true },
  drift: { id: 'drift', name: 'Drift', line: 'Drift: the rows slide sideways while the wall comes.', built: true },
  strong_wind: { id: 'strong_wind', name: 'Strong Wind', line: 'Strong Wind: a steady wind bends your shots.', built: false },
  crosswind: { id: 'crosswind', name: 'Crosswind', line: 'Crosswind: gusts push your ship sideways.', built: false },
  fog: { id: 'fog', name: 'Fog', line: 'Fog: the far part of the wall is hidden.', built: false },
  regrowth: { id: 'regrowth', name: 'Regrowth', line: 'Regrowth: destroyed blocks grow back.', built: false },
  mitosis_wall: { id: 'mitosis_wall', name: 'Mitosis Wall', line: 'Mitosis Wall: blocks split when they are hit.', built: false },
};

// ------------------------------------------------------------------ the schedule
/** The nine types are introduced one by one, a type tier every INTRO_GAP tiers starting at INTRO_FIRST (103, 106, ... 127). */
export const INTRO_FIRST = 103;
export const INTRO_GAP = 3;
/** After the introductions the gap to the next type tier follows this list, repeating (every gap is 2 or 3 tiers). */
export const GAP_PATTERN: readonly number[] = [2, 3, 2, 2, 3, 3, 2, 3];
/** A milestone tier (every 10th) is a named ordinary wall, never a type tier: a type tier that lands on one moves one tier. */
export const LATE_MILESTONE_EVERY = 10;

export interface LateSlot { type: LateType; /** 1 = the first time this type appears, 2 = the second, ... Each return is harder. */ rank: number }

/** Seeded shuffle step for the rounds after the introductions (a small LCG; no Math.random, the schedule is data). */
function shuffled<T>(items: readonly T[], seed: number): T[] {
  const a = [...items];
  let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Every type tier of 101-200, in order, with its type and rank. */
function buildSchedule(): Map<number, LateSlot> {
  const tiers: number[] = [];
  for (let k = 0; k < LATE_TYPE_ORDER.length; k++) tiers.push(INTRO_FIRST + k * INTRO_GAP);
  let last = tiers[tiers.length - 1];
  for (let i = 0; ; i++) {
    const g = GAP_PATTERN[i % GAP_PATTERN.length];
    let t = last + g;
    if (t % LATE_MILESTONE_EVERY === 0) t += g < 3 ? 1 : -1;
    if (t > LATE_LAST) break;
    tiers.push(t);
    last = t;
  }
  // Types: the first round is the introduction order; every later round is a new shuffle whose first type differs from the last one before it.
  const out = new Map<number, LateSlot>();
  const n = LATE_TYPE_ORDER.length;
  let round: LateType[] = [...LATE_TYPE_ORDER];
  let prev: LateType | null = null;
  tiers.forEach((t, i) => {
    const k = i % n;
    const r = Math.floor(i / n);
    if (k === 0 && r > 0) {
      round = shuffled(LATE_TYPE_ORDER, 7919 * r + 13);
      if (round[0] === prev) [round[0], round[1]] = [round[1], round[0]];
    }
    out.set(t, { type: round[k], rank: r + 1 });
    prev = round[k];
  });
  return out;
}

const SCHEDULE = buildSchedule();

/** The type slot of a tier, or null for an ordinary hard wall. */
export const lateSlot = (tier: number): LateSlot | null => SCHEDULE.get(tier) ?? null;
/** Every type tier, ascending. */
export const lateTypeTiers = (): number[] => [...SCHEDULE.keys()].sort((a, b) => a - b);
export const isLateMilestone = (tier: number) => isLateTier(tier) && tier % LATE_MILESTONE_EVERY === 0;

/** Names of the milestone walls (every 10th tier). Each uses the shape of the classic milestone 100 tiers earlier and a heavier mix. */
export const LATE_MILESTONES: Record<number, { name: string; hint: string }> = {
  110: { name: 'Second Gatehouse', hint: 'The gatehouse again, with everything armored from here on.' },
  120: { name: 'Banded Hold', hint: 'Armored bands with empty rows between, each band shielded.' },
  130: { name: 'Crystal', hint: 'A diamond of shielded blocks: burst the shields or break them.' },
  140: { name: 'Twin Keeps', hint: 'Two huge towers joined at the top.' },
  150: { name: 'The Labyrinth', hint: 'Walls with alternating gaps. The way through is long.' },
  160: { name: 'Steel Rings', hint: 'Thick double rings of armor and shields.' },
  170: { name: 'Citadel', hint: 'A rim, a moat and a keep, all heavy.' },
  180: { name: 'The Needle', hint: 'An opening narrows toward the top.' },
  190: { name: 'Rampart', hint: 'Checkered 2x2 slabs, armored and shielded.' },
  200: { name: 'The Endless Wall', hint: 'No gaps, mostly armored, mostly shielded. The hardest wall there is.' },
};

// ------------------------------------------------------------------ curves (the owner will playtest; fitted with bots, scripts/late-tiers-fit.ts)
/**
 * Block HP past tier 100 (docs/tiers-101-200.md): from the HP of tier 100, growth per tier as segments [last tier of the segment, growth
 * per tier]. It starts at x1.10 a tier, three times what tiers 41-60 grew by, and eases off so tier 200 sits near the best the bots can build.
 */
export const LATE_HP_SEGMENTS: readonly (readonly [number, number])[] = [[130, 1.10], [165, 1.075], [200, 1.06]];
/** Credits per block grow slower past tier 100 so credits do not explode (the classic walls grow 1.05 a tier). */
export const LATE_REWARD_GROWTH = 1.02;
/** Medals paid for the first full clear of a tier 101-200 (the classic tiers pay 1). */
export const LATE_CLEAR_MEDALS = 2;
/** Rows of every late wall (the classic curve ends at 41 rows at tier 100). */
export const LATE_ROWS = 41;
/** Share of blocks armored / shielded at tier 100 and at tier 200 (ordinary walls; the classic curve is 0.4 at tier 100). */
export const LATE_ARMOR_FRAC: readonly [number, number] = [0.4, 0.6];
export const LATE_SHIELD_FRAC: readonly [number, number] = [0.4, 0.6];

// ------------------------------------------------------------------ the four layout types, by rank (index rank - 1, the last entry repeats)
/**
 * MONOLITH: rows of full-width huge blocks; HP is this many times the tier's normal block HP. The prompt's start was x500; the fit
 * (docs/tiers-101-200.md section 5, `npm run late-tiers`) is this: a lane through the monolith costs rows x mul x HP, to be broken before the wall
 * reaches the ship (about 29 s), which asks 1.5 x HP DPS at rank 1 up to 2.5 x HP at rank 5, where the ordinary walls of the same tier ask between
 * 0.1 and 2.5 x HP (the median is about 1 x). At x500 it asked 16 x HP and more than the strongest build reaches from tier 134 on.
 */
export const MONOLITH_ROWS: readonly number[] = [1, 1, 2, 2, 3];
export const MONOLITH_HP_MUL: readonly number[] = [45, 50, 30, 35, 25];
/** A monolith has few blocks, so each pays more: the whole wall pays this share of what an ordinary wall of the tier pays. */
export const MONOLITH_REWARD_SHARE = 0.5;

/** MAZE: every block has this many times the tier's HP; the path is `width` cells wide, shifts one column every row of a turn, a turn runs `turnRows` rows. */
export const MAZE_HP_MUL = 1000;
export const MAZE_ROWS: readonly number[] = [41, 41, 45, 45, 49];
export const MAZE_PATH_WIDTH: readonly number[] = [3, 3, 2, 2, 2];
export const MAZE_TURN_ROWS: readonly [number, number][] = [[6, 9], [5, 8], [4, 7], [4, 6], [3, 6]];
export const MAZE_MIN_PATH_WIDTH = 2;

/** FORTRESS: every block armored and shielded. Armor value (the engine halves damage at 10) and shield as a share of the block's HP. */
export const FORTRESS_ARMOR: readonly number[] = [20, 25, 30, 30, 40];
export const FORTRESS_SHIELD_SHARE: readonly number[] = [1.5, 1.75, 2, 2.25, 2.5];
/** The fortress keeps the ordinary HP (its weight is the armor and the shields). */
export const FORTRESS_HP_MUL = 1;

/** DRIFT: share of cells left empty in each row (so there are gaps to weave through), row speeds in px/s, and the variant by rank. */
export type DriftVariant = 'same' | 'alternate' | 'each';
export const DRIFT_VARIANT: readonly DriftVariant[] = ['same', 'alternate', 'each', 'alternate', 'each'];
export const DRIFT_GAP_SHARE = 0.3;
/** Speed of a row: DRIFT_SPEED_BASE x (1 + DRIFT_SPEED_PER_RANK x (rank - 1)); the 'each' variant draws every row's speed between DRIFT_EACH_SPAN of that and 1x, in a random direction. */
export const DRIFT_SPEED_BASE = 24;
export const DRIFT_SPEED_PER_RANK = 0.3;
export const DRIFT_EACH_SPAN = 0.4;
export const DRIFT_HP_MUL: readonly number[] = [0.8, 0.9, 1, 1.1, 1.2];

export const byRank = <T>(list: readonly T[], rank: number): T => list[Math.max(0, Math.min(list.length - 1, rank - 1))];
