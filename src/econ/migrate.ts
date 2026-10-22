import { BLOCKS } from '../data/blocks';
import { capOf, UPGRADABLE } from '../data/blockEconomy';
import { fmtBig } from '../ui/format';
import { LEGACY_BASE_PRICE, legacyCopyPrice, legacyUpgradePrice } from './legacyPrices';

/** The highest level any block had before 16c-2 (Flat+ and Percent x). */
export const LEGACY_MAX_LEVEL = 10;

/** What the version 7 to 8 save migration (chunk 16c-2) gave back. */
export interface EconomyRefund {
  /** Credits refunded in all. */
  credits: number;
  /** Credits from upgrade levels of blocks that no longer have levels, and the number of levels removed. */
  upgradeCredits: number;
  levelsRemoved: number;
  /** Credits from copies above a new cap, and the number of copies. */
  copyCredits: number;
  copiesRemoved: number;
}

/**
 * Chunk 16c-2, step 8. Mutates `owned` and `levels` (block id -> count / level):
 * - a block that lost its upgrades goes to level 1 and every level it had is refunded at the OLD upgrade price;
 * - copies above the new cap are removed (owned = the cap) and refunded at the OLD price each one was bought at.
 * Saved circuits that place more copies than are owned are trimmed afterwards by the builder's inventory check (last in reading order first).
 */
export function migrateEconomyV8(owned: Record<string, number>, levels: Record<string, number>): EconomyRefund {
  const out: EconomyRefund = { credits: 0, upgradeCredits: 0, levelsRemoved: 0, copyCredits: 0, copiesRemoved: 0 };
  for (const id of Object.keys(LEGACY_BASE_PRICE)) {
    const def = BLOCKS[id];
    if (!def) continue;
    const level = levels[id] ?? 1;
    if (!UPGRADABLE.has(id) && level > 1) {
      for (let l = 1; l < level; l++) out.upgradeCredits += legacyUpgradePrice(id, l);
      out.levelsRemoved += level - 1;
      levels[id] = 1;
    } else if (UPGRADABLE.has(id) && level > def.maxLevel) {
      levels[id] = def.maxLevel;
    }
    const n = owned[id] ?? 0;
    const cap = capOf(id);
    if (n > cap) {
      for (let k = cap; k < n; k++) out.copyCredits += legacyCopyPrice(id, k);
      out.copiesRemoved += n - cap;
      owned[id] = cap;
    }
  }
  out.credits = out.upgradeCredits + out.copyCredits;
  return out;
}

/** The one-time message shown after a migration that refunded something (null when it refunded nothing). */
export function refundNotice(r: EconomyRefund): string | null {
  if (r.credits <= 0) return null;
  const parts: string[] = [];
  if (r.levelsRemoved > 0) parts.push(`${r.levelsRemoved} upgrade level${r.levelsRemoved === 1 ? '' : 's'} removed`);
  if (r.copiesRemoved > 0) parts.push(`${r.copiesRemoved} cop${r.copiesRemoved === 1 ? 'y' : 'ies'} over the new limits`);
  return `Economy update: ${fmtBig(r.credits)} credits refunded (${parts.join(', ')}).`;
}
