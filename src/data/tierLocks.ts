/**
 * Campaign-tier locks (chunk 20b): an ordinary block that is bought only after the player has PASSED a campaign tier (a passed or cleared
 * tier; tiers unlock in strict order, so passing tier N means the player is at least that far). A block not listed here has no tier lock.
 * The Frontier now unlocks the twelve legendary blocks only (frontier/unlocks.ts); the 16 ordinary blocks that used to sit at Frontier
 * rings 10 / 25 / 50 live here, between tier 5 and tier 60, the simple and cheap ones first.
 *
 * Grandfather rules (see isTierUnlocked): a save that owns a copy keeps buying; a save that had already reached the old Frontier ring of a
 * moved block keeps it unlocked (LEGACY_RING_GATES); a player who has passed the tier has it.
 */
import type { Reach } from '../frontier/unlocks';
import type { Sector } from '../frontier/world';

/** THE TABLE TO EDIT: block id -> the campaign tier to pass. */
export const TIER_LOCKS: Readonly<Record<string, number>> = {
  // New motion blocks (chunk 20b). Curving Left, Angle Left and Angle Right are free from the start (not listed).
  accelerator: 5, brake: 15, scatter: 15, upturn: 20, align: 25, extender: 30, centreline: 40, magnetized: 45, persist: 50, reverse: 60,
  // Moved from the Frontier's rings 10 / 25 / 50 (ordered by strength; the strongest are the last)
  cleaver: 5, mine: 10, random_router: 10, static_charge: 12, overkill_spill: 18, frostbite: 22, corrosion: 28, gravity_well: 32,
  culling_bolt: 35, residue_seed: 38, orbit: 42, capacitor: 48, executioner: 52, alternator: 55, fission_catalyst: 58, chain_lightning: 60,
};

/** "Pass tier 12": same padlock and place as the Frontier requirement text. */
export const tierRequirementText = (tier: number) => `Pass tier ${tier}`;

/** The Frontier gates the moved blocks had (chunk 15b): a save that already reached one keeps the block unlocked. */
export const LEGACY_RING_GATES: Readonly<Record<string, { sector: Exclude<Sector, 'C'>; ring: number }>> = {
  random_router: { sector: 'N', ring: 10 }, cleaver: { sector: 'N', ring: 25 }, frostbite: { sector: 'N', ring: 50 }, chain_lightning: { sector: 'N', ring: 50 },
  overkill_spill: { sector: 'E', ring: 10 }, mine: { sector: 'E', ring: 25 }, capacitor: { sector: 'E', ring: 50 }, fission_catalyst: { sector: 'E', ring: 50 },
  static_charge: { sector: 'S', ring: 10 }, culling_bolt: { sector: 'S', ring: 25 }, orbit: { sector: 'S', ring: 50 }, executioner: { sector: 'S', ring: 50 },
  corrosion: { sector: 'W', ring: 10 }, gravity_well: { sector: 'W', ring: 25 }, residue_seed: { sector: 'W', ring: 50 }, alternator: { sector: 'W', ring: 50 },
};

/** Highest passed tier (0 = none). */
export const highestPassed = (passedTiers: readonly number[]): number => passedTiers.reduce((m, t) => (t > m ? t : m), 0);

/** The tier lock of a block (undefined = none). */
export const tierLockOf = (blockId: string): number | undefined => TIER_LOCKS[blockId];

/** Whether a tier-locked block may be bought: owned already, tier passed, or its old Frontier ring reached. A block with no tier lock is true. */
export function isTierUnlocked(blockId: string, owned: number, passedTiers: readonly number[], reach: Reach): boolean {
  const tier = TIER_LOCKS[blockId];
  if (tier === undefined || owned > 0 || highestPassed(passedTiers) >= tier) return true;
  const old = LEGACY_RING_GATES[blockId];
  return !!old && reach[old.sector] >= old.ring;
}
