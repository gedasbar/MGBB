import { BLOCKS } from '../data/blocks';
import { getWorld, parseKey, ring, sector, Sector, SECTOR_NAME } from './world';
import type { FrontierSave } from './state';

/**
 * Directional unlocks (chunk 15b): going far in one direction of the Frontier unlocks blocks. Each of the four sectors has
 * a threshold at each of UNLOCK_RINGS; reaching it (a passed or cleared square at that ring or beyond, in that sector)
 * unlocks one block. The blocks are PLACEHOLDERS for the legendary blocks of a later chunk.
 */

/** Ring thresholds, the same in every direction. */
export const UNLOCK_RINGS = [10, 25, 50, 100] as const;
export const UNLOCK_SECTORS: Exclude<Sector, 'C'>[] = ['N', 'E', 'S', 'W'];

/** sector -> one block per UNLOCK_RINGS entry, in ring order. Every direction mixes categories; rarer blocks come later. */
const UNLOCK_BLOCKS: Record<Exclude<Sector, 'C'>, [string, string, string, string]> = {
  N: ['random_router', 'cleaver', 'frostbite', 'chain_lightning'],
  E: ['overkill_spill', 'mine', 'capacitor', 'fission_catalyst'],
  S: ['static_charge', 'culling_bolt', 'orbit', 'executioner'],
  W: ['corrosion', 'gravity_well', 'residue_seed', 'alternator'],
};

/** Blocks of the two newest batches (chunks 9a and 11a) that stay free: one per category, the cheaper ones. */
export const FREE_NEW_BLOCKS = ['delay_line', 'overclock', 'boomerang', 'ignite', 'cauterize'];

export interface UnlockEntry { sector: Exclude<Sector, 'C'>; ring: number; blockId: string }

/** All 16 entries: sector by sector, ring by ring. */
export const UNLOCKS: UnlockEntry[] = UNLOCK_SECTORS.flatMap(sec => UNLOCK_RINGS.map((r, i) => ({ sector: sec, ring: r, blockId: UNLOCK_BLOCKS[sec][i] })));

const GATE = new Map(UNLOCKS.map(u => [u.blockId, u]));
/** The unlock that gates a block (undefined = not gated). */
export const gateOf = (blockId: string): UnlockEntry | undefined => GATE.get(blockId);

/** "Reach ring 25 West". */
export const requirementText = (u: UnlockEntry) => `Reach ring ${u.ring} ${SECTOR_NAME[u.sector]}`;

export type Reach = Record<Exclude<Sector, 'C'>, number>;

/** Highest ring of a passed or cleared square in each sector (0 = none). Holes are never stored, the origin never counts. */
export function reachBySector(f: FrontierSave): Reach {
  const out: Reach = { N: 0, E: 0, S: 0, W: 0 };
  const w = getWorld(f.seed);
  for (const k of Object.keys(f.sq)) {
    const p = parseKey(k);
    if (!p) continue;
    const sec = sector(p.x, p.y);
    if (sec === 'C' || w.isHole(p.x, p.y)) continue;
    const r = ring(p.x, p.y);
    if (r > out[sec]) out[sec] = r;
  }
  return out;
}

/** Entries reached by `after` and not by `before`: what a change just unlocked (each fires once, per sector independently). */
export function newlyReached(before: Reach, after: Reach): UnlockEntry[] {
  return UNLOCKS.filter(u => before[u.sector] < u.ring && after[u.sector] >= u.ring);
}

/**
 * Whether a block may be bought: not gated, or already owned (grandfather rule: a save that owns a copy keeps it unlocked),
 * or its threshold is reached.
 */
export function isBlockUnlocked(blockId: string, owned: number, reach: Reach): boolean {
  const g = gateOf(blockId);
  return !g || owned > 0 || reach[g.sector] >= g.ring;
}

/** The unlock (if any) whose threshold ring a square sits on: same sector, ring equal to the threshold. */
export function unlockOnSquare(x: number, y: number): UnlockEntry | undefined {
  const sec = sector(x, y);
  if (sec === 'C') return undefined;
  const r = ring(x, y);
  return UNLOCKS.find(u => u.sector === sec && u.ring === r);
}

/** Block name for the UI. */
export const blockName = (id: string) => BLOCKS[id]?.name ?? id;
