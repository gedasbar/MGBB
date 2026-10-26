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
export const GROWTH_CHEAP = 1.15;
export const GROWTH_NORMAL = 1.30;

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
  /** Copies one can own; null = no cap (the stacking shape blocks, whose benefit falls off by itself). */
  cap: number | null;
  /** Price of the first copy. */
  base: number;
  /** Price multiplier per copy already owned. */
  growth: number;
}

const one = (base: number): BlockEconomy => ({ cap: 1, base, growth: 1 });
/** A stacking shape block: no cap, normal growth. */
const stack = (base: number): BlockEconomy => ({ cap: null, base, growth: GROWTH_NORMAL });

/**
 * THE TABLE TO EDIT: one line per block shown in the Shop.
 *   cap    = how many copies you can own (null = no limit). The Shop shows "owned / cap" and the Buy button reads "Max" at the cap.
 *   base   = price in credits of the FIRST copy.
 *   growth = how much the price multiplies for each copy you already own. Price of copy n = base x growth^(n-1).
 *            1 means every copy costs the same; GROWTH_CHEAP = 1.15, GROWTH_NORMAL = 1.30 (or write a number such as 1.2).
 * Shortcuts: one(base) = a block you can own once; stack(base) = no cap, normal growth.
 * Example: { cap: 8, base: 30, growth: GROWTH_CHEAP } = up to 8 copies, the first costs 30, the second 35, the third 40 ...
 * Every shown block needs a line (the unit tests complain if one is missing). How to edit: docs/EDITING.md.
 */
export const BLOCK_ECONOMY: Readonly<Record<string, BlockEconomy>> = {
  // Pathing
  turn_l: { cap: 8, base: 30, growth: GROWTH_CHEAP },
  turn_r: { cap: 8, base: 30, growth: GROWTH_CHEAP },
  splitter_2: { cap: 2, base: 120, growth: GROWTH_CHEAP },
  splitter_3: one(700),
  alternator: one(1600),
  random_router: one(1000),
  delay_line: one(1000),
  // Damage
  flat_plus: { cap: 10, base: 60, growth: 1.2 },
  percent_mult: { cap: 10, base: 100, growth: GROWTH_NORMAL },
  lucky_strike: { cap: 6, base: 70, growth: 1.25 },
  jackpot: { cap: 6, base: 75, growth: 1.25 },
  gamblers_gate: { cap: 4, base: 45, growth: 1.25 },
  overclock: { cap: 3, base: 500, growth: 1.35 },
  capacitor: one(1600),
  executioner: one(1600),
  // Mitosis (effects: one copy)
  fission_catalyst: one(2400),
  cauterize: one(1000),
  cleaver: one(1000),
  culling_bolt: one(1600),
  residue_seed: one(1600),
  overkill_spill: one(1000),
  // Shape blocks that stack (engine: every copy on the path adds a step)
  piercing: stack(500),
  bouncing: stack(500),
  aoe_circle: stack(600),
  aoe_rect: stack(600),
  chain_lightning: stack(2400),
  homing: stack(800),
  fork_impact: stack(900),
  boomerang: stack(1000),
  orbit: stack(1600),
  mine: stack(1000),
  // One copy: a second would change nothing (the engine reads one level) or make the shot worse (turn rates add)
  curving_right: one(300),
  random_curve: one(300),
  shield_breaker: one(440),
  armor_piercer: one(440),
  pure_converter: one(600),
  gravity_well: one(1600),
  // Status (effects: one copy)
  ignite: one(1000),
  frostbite: one(1600),
  corrosion: one(1600),
  static_charge: one(1000),
};

/** Ownership cap of a block (Infinity when it has none). Unknown ids (hidden blocks) have no cap. */
export const capOf = (id: string): number => BLOCK_ECONOMY[id]?.cap ?? Infinity;
