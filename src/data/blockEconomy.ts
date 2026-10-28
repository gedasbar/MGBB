/**
 * Block economy (chunk 16c-2): which blocks have upgrades, the single level of the others, and the copy cap and price of every
 * shown block. This is the one table to edit; the reasons and the measurements are in docs/economy-audit.md and docs/economy-design.md.
 *
 * Copy price of the n-th copy = round(base x growth^(n-1)). Upgrade price (L to L+1) = round(base x UPGRADE_MUL x UPGRADE_GROWTH^(L-1)).
 */

/** Upgrade price: base x UPGRADE_MUL x UPGRADE_GROWTH^(level-1). */
export const UPGRADE_MUL = 2.0;
export const UPGRADE_GROWTH = 2.2;

/** Growth bands (price multiplier per copy already owned). */
const GROWTH_NORMAL = 1.30;

/** The only blocks with levels. Every other block has one level (`maxLevel` 1) and runs at `FIXED_LEVEL`. */
export const UPGRADABLE: ReadonlySet<string> = new Set([
  'flat_plus', 'percent_mult', 'lucky_strike', 'jackpot', 'gamblers_gate', 'shield_breaker', 'armor_piercer', 'pure_converter',
]);

/**
 * The level a block without upgrades runs at (docs/economy-audit.md, A2): the middle level where it measured at least 1.1x
 * better than level 1 in some scenario, otherwise level 1 (absent here).
 */
export const FIXED_LEVEL: Readonly<Record<string, number>> = {
  alternator: 3, random_router: 3, capacitor: 3, executioner: 3, cleaver: 3, culling_bolt: 3, piercing: 3, boomerang: 3,
  chain_lightning: 3, aoe_rect: 3, frostbite: 3, static_charge: 3,
};

export interface BlockEconomy {
  /** Medals the copy costs on top of its credits (legendary blocks, chunk 20a); absent = none. */
  medals?: number;
  /** Copies one can own; null = no cap (the stacking shape blocks, whose benefit falls off by itself). */
  cap: number | null;
  /** Price of the first copy. */
  base: number;
  /** Price multiplier per copy already owned. */
  growth: number;
}

const one = (base: number): BlockEconomy => ({ cap: 1, base, growth: 1 });

/**
 * Legendary blocks (chunk 20a): one copy, paid in credits AND Medals, by the Frontier ring that unlocks them (frontier/unlocks.ts).
 * Credits are about 5 runs of a Frontier wall at that ring (reports/chunk20a/prices.md; the first guess of 50K / 200K / 800K was 30 / 15 / 13 runs); change the prices here.
 */
export const LEGENDARY_PRICE_BY_RING: Readonly<Record<number, { credits: number; medals: number }>> = {
  100: { credits: 8_000, medals: 15 },
  200: { credits: 65_000, medals: 25 },
  300: { credits: 300_000, medals: 40 },
};
const legendary = (ring: number): BlockEconomy => ({ cap: 1, base: LEGENDARY_PRICE_BY_RING[ring].credits, growth: 1, medals: LEGENDARY_PRICE_BY_RING[ring].medals });
/** A stacking shape block: no cap, normal growth. */
const stack = (base: number): BlockEconomy => ({ cap: null, base, growth: GROWTH_NORMAL });

/**
 * Chunk 21a: the 16 blocks that moved from the Frontier to campaign tiers (20b) were repriced: the first copy costs about 2.5 runs at its unlock
 * tier (5 runs for Overkill Spill, Residue Seed and Chain Lightning, which are meant to be dear). One "run" is the credits of half a wall at that tier
 * (docs/difficulty-audit.md model; the column is in reports/chunk20b/prices.md). The test in tests/chunk21a.test.ts holds the table.
 *
 * THE TABLE TO EDIT: one line per block shown in the Shop.
 *   cap    = how many copies you can own (null = no limit). The Shop shows "owned / cap" and the Buy button reads "Max" at the cap.
 *   base   = price in credits of the FIRST copy.
 *   growth = how much the price multiplies for each copy you already own. Price of copy n = base x growth^(n-1).
 *            1 means every copy costs the same; GROWTH_NORMAL = 1.30 (or write a number such as 1.2).
 * Shortcuts: one(base) = a block you can own once; stack(base) = no cap, normal growth.
 * Example: { cap: 20, base: 30, growth: 1.2 } = up to 20 copies, the first costs 30, the second 36, the third 43 ...
 * Every shown block needs a line (the unit tests complain if one is missing). How to edit: docs/EDITING.md.
 */
export const BLOCK_ECONOMY: Readonly<Record<string, BlockEconomy>> = {
  // Pathing
  turn_l: { cap: 20, base: 30, growth: 1.2 },
  turn_r: { cap: 20, base: 30, growth: 1.2 },
  splitter_2: { cap: 15, base: 120, growth: 1.35 },
  splitter_3: { cap: 15, base: 700, growth: 1.45 },
  alternator: one(3470),
  random_router: one(110),
  delay_line: one(1000),
  // Damage
  flat_plus: { cap: 10, base: 60, growth: 1.2 },
  plus_one: { cap: 10, base: 110, growth: 1.5 },
  percent_mult: { cap: 10, base: 100, growth: GROWTH_NORMAL },
  lucky_strike: { cap: 6, base: 70, growth: 1.25 },
  jackpot: { cap: 6, base: 75, growth: 1.25 },
  gamblers_gate: { cap: 4, base: 45, growth: 1.25 },
  overclock: { cap: 3, base: 500, growth: 1.35 },
  capacitor: one(2260),
  executioner: one(2870),
  // Mitosis (effects: one copy)
  fission_catalyst: one(4190),
  cauterize: one(1000),
  cleaver: one(60),
  culling_bolt: one(920),
  residue_seed: one(2260),
  overkill_spill: one(460),
  // Shape blocks that stack (engine: every copy on the path adds a step)
  piercing: stack(500),
  bouncing: stack(500),
  aoe_circle: stack(600),
  aoe_rect: stack(600),
  chain_lightning: stack(9600),
  homing: stack(800),
  fork_impact: stack(900),
  boomerang: stack(1000),
  orbit: stack(1450),
  mine: stack(110),
  // One copy: a second would change nothing (the engine reads one level) or make the shot worse (turn rates add)
  curving_right: { cap: 4, base: 300, growth: GROWTH_NORMAL },
  random_curve: { cap: 4, base: 300, growth: GROWTH_NORMAL },
  shield_breaker: one(440),
  armor_piercer: one(440),
  pure_converter: one(600),
  gravity_well: one(750),
  // Status (effects: one copy)
  ignite: one(1000),
  frostbite: one(340),
  corrosion: one(540),
  static_charge: one(140),
  // Motion blocks (chunk 20b, docs/motion-blocks.md). The cap is the number of copies that still add something; growth 1.30; the first copy costs about 2.5 runs at its unlock tier (scripts/motion-prices.ts).
  curving_left: { cap: 4, base: 300, growth: GROWTH_NORMAL },
  angle_left: { cap: 4, base: 100, growth: GROWTH_NORMAL },
  angle_right: { cap: 4, base: 100, growth: GROWTH_NORMAL },
  accelerator: { cap: 3, base: 60, growth: GROWTH_NORMAL },
  brake: { cap: 5, base: 180, growth: GROWTH_NORMAL },
  scatter: { cap: 3, base: 200, growth: GROWTH_NORMAL },
  upturn: { cap: 3, base: 300, growth: GROWTH_NORMAL },
  align: one(450),
  extender: { cap: 2, base: 650, growth: GROWTH_NORMAL },
  centreline: { cap: 3, base: 1300, growth: GROWTH_NORMAL },
  magnetized: { cap: 3, base: 1800, growth: GROWTH_NORMAL },
  persist: one(2500),
  // Legendary (one copy, credits + Medals; the ring is the one that unlocks the block)
  frontier_echo: legendary(100), payload: legendary(200), lone_shot: legendary(300),
  last_breath: legendary(100), zigzag: legendary(200), heavy_round: legendary(300),
  hollow_core: legendary(100), idle_barrels: legendary(200), waypoint: legendary(300),
  rebound: legendary(100), mirror: legendary(200), fuse: legendary(300),
};

/** Medals a copy of the block costs on top of its credit price (0 for every ordinary block). */
export const medalPriceOf = (id: string): number => BLOCK_ECONOMY[id]?.medals ?? 0;

/** Ownership cap of a block (Infinity when it has none). Unknown ids (hidden blocks) have no cap. */
export const capOf = (id: string): number => BLOCK_ECONOMY[id]?.cap ?? Infinity;
