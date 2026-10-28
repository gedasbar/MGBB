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

/**
 * Blocks that were taken out of the game, frozen for the save migration (version 9 to 10, chunk 21a): the price formula they had
 * (copy n costs round(base x growth^(n-1)), as in data/blockEconomy.ts) and the name for the message. Never edit an entry; add new ones.
 */
export const REMOVED_BLOCKS: Readonly<Record<string, { name: string; base: number; growth: number }>> = {
  reverse: { name: 'Reverse', base: 4800, growth: 1.3 },
};

/** Credits paid for the first `copies` copies of a removed block, by its price formula (0 for an unknown id). */
export function removedBlockRefund(id: string, copies: number): number {
  const b = REMOVED_BLOCKS[id];
  if (!b || !(copies > 0)) return 0;
  let sum = 0;
  for (let n = 1; n <= copies; n++) sum += Math.max(1, Math.round(b.base * Math.pow(b.growth, n - 1)));
  return sum;
}

/** Chunk 21a, version 9 to 10: refunds every owned copy of every removed block. Returns the credits and the one-time message (null = nothing owned). */
export function migrateRemovedBlocks(owned: Record<string, unknown>): { credits: number; notice: string | null } {
  let credits = 0;
  const names: string[] = [];
  for (const id of Object.keys(REMOVED_BLOCKS)) {
    const n = Math.floor(Number(owned[id]));
    if (!(n > 0)) continue;
    credits += removedBlockRefund(id, Math.min(n, 1000));
    names.push(`${REMOVED_BLOCKS[id].name} (${n})`);
  }
  if (credits <= 0) return { credits: 0, notice: null };
  return { credits, notice: `${names.join(', ')} removed from the game: ${fmtBig(credits)} credits refunded.` };
}

/** Number of placed entries of removed blocks in a saved builder (taken off the circuits by the loader). */
export function countRemovedEntries(hulls: unknown): number {
  let n = 0;
  if (!hulls || typeof hulls !== 'object') return 0;
  for (const h of Object.values(hulls as Record<string, any>)) {
    for (const slot of Object.values((h?.slots ?? {}) as Record<string, unknown>)) {
      if (Array.isArray(slot)) for (const e of slot) if (e && typeof e === 'object' && (e as any).blockId in REMOVED_BLOCKS) n++;
    }
  }
  return n;
}
