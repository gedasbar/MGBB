/**
 * Prices and rules before chunk 16c-2, frozen for the save migration (version 7 to 8): the credits a player spent on upgrades that no
 * longer exist, and on copies above the new caps, are refunded at these. Never edit; the live prices are in data/blockEconomy.ts.
 */
export const LEGACY_COPY_GROWTH = 1.18;
export const LEGACY_UPGRADE_MUL = 2.0;
export const LEGACY_UPGRADE_GROWTH = 2.2;

/** Base copy price of every block that was for sale. */
export const LEGACY_BASE_PRICE: Readonly<Record<string, number>> = {
  turn_l: 40, turn_r: 40, splitter_2: 200, splitter_3: 350, alternator: 800, random_router: 500, delay_line: 500,
  flat_plus: 60, percent_mult: 120, lucky_strike: 100, jackpot: 150, gamblers_gate: 180, overclock: 500, capacitor: 800, executioner: 800,
  fission_catalyst: 1200, cauterize: 500, cleaver: 500, culling_bolt: 800, residue_seed: 800, overkill_spill: 500,
  piercing: 250, bouncing: 250, aoe_circle: 300, shield_breaker: 220, pure_converter: 300, boomerang: 500, orbit: 800, chain_lightning: 1200,
  mine: 500, gravity_well: 800, curving_right: 150, random_curve: 150, homing: 400, aoe_rect: 300, fork_impact: 450, armor_piercer: 220,
  ignite: 500, frostbite: 800, corrosion: 800, static_charge: 500,
};

/** Price of the copy bought when `owned` copies were held. */
export const legacyCopyPrice = (id: string, owned: number) =>
  Math.max(1, Math.round((LEGACY_BASE_PRICE[id] ?? 100) * Math.pow(LEGACY_COPY_GROWTH, owned)));
/** Price of the upgrade from `level` to `level + 1`. */
export const legacyUpgradePrice = (id: string, level: number) =>
  Math.max(1, Math.round((LEGACY_BASE_PRICE[id] ?? 100) * LEGACY_UPGRADE_MUL * Math.pow(LEGACY_UPGRADE_GROWTH, level - 1)));
