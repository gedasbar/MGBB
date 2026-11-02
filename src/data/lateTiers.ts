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
  /** false = the type's tiers are ordinary hard walls that keep the type in the data (every type is built since chunk 27b). */
  built: boolean;
}

/** In the order the types are introduced (one every 3 tiers from tier 103). */
export const LATE_TYPE_ORDER: readonly LateType[] = ['monolith', 'maze', 'fortress', 'drift', 'strong_wind', 'crosswind', 'fog', 'regrowth', 'mitosis_wall'];

export const LATE_TYPES: Record<LateType, LateTypeInfo> = {
  monolith: { id: 'monolith', name: 'Monolith', line: 'Monolith: one row of huge blocks. Break at least one to pass.', built: true },
  maze: { id: 'maze', name: 'Maze', line: 'Maze: a winding path through blocks too tough to kill. Just fly.', built: true },
  fortress: { id: 'fortress', name: 'Fortress', line: 'Fortress: every block is armored and shielded.', built: true },
  drift: { id: 'drift', name: 'Drift', line: 'Drift: the rows slide sideways while the wall comes.', built: true },
  strong_wind: { id: 'strong_wind', name: 'Strong Wind', line: 'Strong Wind: every shot leaves backwards. Turn it round.', built: true },
  crosswind: { id: 'crosswind', name: 'Crosswind', line: 'Crosswind: a steady wind pushes every shot sideways.', built: true },
  fog: { id: 'fog', name: 'Fog', line: 'Fog: blocks show only near your ship, or once hit.', built: true },
  regrowth: { id: 'regrowth', name: 'Regrowth', line: 'Regrowth: blocks left alone for a second heal fast.', built: true },
  mitosis_wall: { id: 'mitosis_wall', name: 'Mitosis Wall', line: 'Mitosis Wall: a destroyed block splits into two small ones.', built: true },
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

/**
 * FORTRESS: every block armored and shielded. Armor value (the engine halves damage at 10) and shield as a share of the block's HP, by rank. The prompt
 * asked for "heavier than the normal shares": classic walls top out at 50% / 50% with armor 20 and shields of 1 x HP; here every block has both, and the HP
 * is x0.65 so the wall asks about the same as the hardest ordinary wall of its tier (the weight is the armor and the shield, see section 5 of the design note).
 */
export const FORTRESS_ARMOR: readonly number[] = [20, 20, 25, 25, 30];
export const FORTRESS_SHIELD_SHARE: readonly number[] = [1.25, 1.5, 1.5, 1.75, 1.75];
export const FORTRESS_HP_MUL = 0.65;

/**
 * DRIFT: share of cells left empty in each row (so there are gaps to weave through), row speeds in px/s, and the variant by rank. A lane cannot be carved
 * through a wall whose rows slide (the blocks of every row keep coming back into it), so a Drift wall asks about what clearing it asks: it holds
 * DRIFT_BLOCKS blocks (an ordinary wall holds 855) with HP x DRIFT_HP_MUL, tuned with the bots (`PART=reach`).
 */
export type DriftVariant = 'same' | 'alternate' | 'each';
export const DRIFT_VARIANT: readonly DriftVariant[] = ['same', 'alternate', 'each', 'alternate', 'each'];
export const DRIFT_GAP_SHARE = 0.3;
export const DRIFT_BLOCKS = 450;
/** Speed of a row: DRIFT_SPEED_BASE x (1 + DRIFT_SPEED_PER_RANK x (rank - 1)); the 'each' variant draws every row's speed between DRIFT_EACH_SPAN of that and 1x, in a random direction. */
export const DRIFT_SPEED_BASE = 24;
export const DRIFT_SPEED_PER_RANK = 0.3;
export const DRIFT_EACH_SPAN = 0.4;
export const DRIFT_HP_MUL: readonly number[] = [0.12, 0.1, 0.08, 0.07, 0.06];

export const byRank = <T>(list: readonly T[], rank: number): T => list[Math.max(0, Math.min(list.length - 1, rank - 1))];

// ------------------------------------------------------------------ chunk 27b: the five effect types, by rank (index rank - 1, the last entry repeats)
/**
 * What an effect tier does to the run. Every field is optional; a wall has at most one (one type at a time). Numbers are the tables below.
 * `strongWind`: every shot's launch direction is turned `turnDeg` degrees and its speed multiplied. `crosswind`: a steady sideways acceleration
 * on every shot in flight, px/s squared, positive = to the right. `fog`: blocks are drawn only within `radius` px of the ship or once hit.
 * `regrowth`: a block not damaged for `delay` s heals `perSec` x its max HP a second. `mitosis`: see MITOSIS_*.
 */
export interface LateEffects {
  strongWind?: { turnDeg: number; speedMul: number };
  crosswind?: { accel: number };
  fog?: { radius: number };
  regrowth?: { delay: number; perSec: number };
  mitosis?: { children: number; hpShare: number; maxGen: number; sizeMul: number };
}

/** STRONG WIND: the launch direction is turned this many degrees (180 = straight back), and shots fly this much faster (a faster U-turn is a wider one). */
export const STRONG_WIND_TURN_DEG = 180;
export const STRONG_WIND_SPEED_MUL: readonly number[] = [1, 1.1, 1.2, 1.3, 1.4];

/** CROSSWIND: sideways acceleration of every shot in px/s squared; the side (left or right) is fixed per tier (`crosswindSide`). One cell is 54 px: rank 1 pushes a shot about 40 px sideways over a 0.9 s flight, rank 5 about 130 px. */
export const CROSSWIND_ACCEL: readonly number[] = [100, 150, 200, 260, 320];
/** -1 (to the left) or +1 (to the right), fixed by the tier number (the same every visit, alternating in a pattern the player cannot guess from the previous tier). */
export const crosswindSide = (tier: number): -1 | 1 => (((tier * 2654435761) >>> 7) & 1 ? 1 : -1);

/**
 * FOG: radius (px) round the ship inside which blocks are drawn. It shrinks with every return. Fairness: a block must be on screen at least
 * FOG_REACT_SECONDS before the fastest scroll of its tier (BOOST_MAX x the approach speed) could carry it to the ship, plus a cell to read it; `fogRadiusFloor`
 * is that number and a unit test checks every fog tier is above it.
 */
export const FOG_RADIUS: readonly number[] = [420, 360, 310, 270, 240];
export const FOG_REACT_SECONDS = 1.5;
/** Width of the soft edge (px) where a block fades out at the rim of the fog. The block is fully drawn inside radius - FOG_EDGE. */
export const FOG_EDGE = 60;

/** REGROWTH: seconds a block must be left alone before it heals, and the share of its max HP healed per second by rank. */
export const REGROWTH_DELAY = 1;
export const REGROWTH_PER_SEC: readonly number[] = [0.04, 0.06, 0.09, 0.12, 0.16];

/**
 * MITOSIS WALL: a destroyed block splits into MITOSIS_CHILDREN smaller blocks in the empty cells next to it (left and right first, then the cell behind it, further
 * up the wall), each with MITOSIS_HP_SHARE of the block's max HP and MITOSIS_SIZE_MUL of its size; a child may split once more (MITOSIS_MAX_GEN generations in all).
 * A child pays MITOSIS_HP_SHARE of what its parent paid. The wall's own blocks have this share of the tier's HP by rank.
 */
export const MITOSIS_CHILDREN = 2;
export const MITOSIS_HP_SHARE = 0.4;
export const MITOSIS_MAX_GEN = 2;
export const MITOSIS_SIZE_MUL = 0.75;
export const MITOSIS_HP_MUL: readonly number[] = [0.6, 0.65, 0.7, 0.75, 0.8];
