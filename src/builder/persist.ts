import { Grid } from '../engine/compiler';
import { Rotation } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import { HULL_BUILDERS } from '../game/gridUtils';

export type SlotId = 'A' | 'B';
export const SLOTS: SlotId[] = ['A', 'B'];

/** A player-placed block. Fixed hull cells (void, blocked, generator, ejector) are never saved. */
export interface BlockEntry {
  x: number;
  y: number;
  blockId: string;
  level: number;
  rotation: Rotation;
  manual: boolean;
}

export interface HullSave {
  active: SlotId;
  slots: Record<SlotId, BlockEntry[]>;
}

export interface SavedBuilder {
  version: 2;
  /** Hull shown on the Build screen. */
  activeHull?: string;
  hulls: Record<string, HullSave>;
}

export const STORAGE_KEY = 'mgbm.builder.v2';
/** Key used by the previous builder (whole grid, compass-style rotations 0..3, Straight blocks). */
export const LEGACY_KEY = 'mgbm_grid';
export const DEFAULT_HULL = 'shuttle';

/** Default circuit for slot A of the Shuttle (0-indexed x,y). All blocks in auto mode. */
export const DEFAULT_SHUTTLE_A: BlockEntry[] = [
  { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, manual: false },
  { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 0, manual: false },
  { x: 8, y: 5, blockId: 'flat_plus', level: 1, rotation: 0, manual: false },
];

export function defaultSave(): SavedBuilder {
  return {
    version: 2,
    hulls: { [DEFAULT_HULL]: { active: 'A', slots: { A: DEFAULT_SHUTTLE_A.map(e => ({ ...e })), B: [] } } },
  };
}

export function hullGrid(hullId: string): Grid {
  const make = HULL_BUILDERS[hullId];
  if (!make) throw new Error(`Unknown hull ${hullId}`);
  return make();
}

export function entriesFromGrid(g: Grid): BlockEntry[] {
  const out: BlockEntry[] = [];
  for (const c of g.cells) {
    if (c.type === 'empty' && c.blockId) {
      out.push({ x: c.x, y: c.y, blockId: c.blockId, level: c.level, rotation: c.rotation, manual: c.manual });
    }
  }
  return out;
}

/** Puts entries onto the cells of a fresh hull grid. Entries must already be sanitised. */
export function gridFromEntries(hullId: string, entries: BlockEntry[]): Grid {
  const g = hullGrid(hullId);
  for (const e of entries) {
    const c = g.cells[e.y * g.w + e.x];
    c.blockId = e.blockId;
    c.level = e.level;
    c.rotation = e.rotation;
    c.manual = e.manual;
  }
  return g;
}

function isRotation(r: unknown): r is Rotation {
  return r === 0 || r === 90 || r === 180 || r === 270;
}

/**
 * Validates untrusted entries against a hull. Anything unusable (unknown or unplaceable block,
 * Straight, outside the hull, on a fixed cell, duplicate cell) is dropped, never thrown on.
 * `legacy` means the data came from the old builder: rotations are compass steps and are reset,
 * every block goes to auto.
 */
export function sanitizeEntries(raw: unknown, hull: Grid, legacy = false): BlockEntry[] {
  const out: BlockEntry[] = [];
  if (!Array.isArray(raw)) return out;
  const used = new Set<number>();
  for (const e of raw) {
    if (!e || typeof e !== 'object') continue;
    const { x, y, blockId, level, rotation, manual } = e as Record<string, unknown>;
    if (!Number.isInteger(x) || !Number.isInteger(y) || typeof blockId !== 'string') continue;
    const cx = x as number;
    const cy = y as number;
    if (cx < 0 || cy < 0 || cx >= hull.w || cy >= hull.h) continue;
    const idx = cy * hull.w + cx;
    if (hull.cells[idx].type !== 'empty' || used.has(idx)) continue;
    const def = BLOCKS[blockId];
    if (!def || !def.shown) continue;
    const lvOk = Number.isInteger(level) && (level as number) >= 1 && (level as number) <= def.maxLevel;
    let rot: Rotation = 0;
    let man = false;
    if (!legacy && isRotation(rotation) && manual === true) {
      rot = rotation;
      man = true;
    }
    used.add(idx);
    out.push({ x: cx, y: cy, blockId, level: lvOk ? (level as number) : 1, rotation: rot, manual: man });
  }
  return out;
}

/** Reads the whole old-format grid ({w,h,cells[]}) and keeps only what survives sanitising. */
export function migrateLegacyGrid(raw: unknown, hull: Grid): BlockEntry[] {
  const cells = (raw as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) return [];
  const entries = cells
    .filter((c: any) => c && c.type === 'empty' && typeof c.blockId === 'string')
    .map((c: any) => ({ x: c.x, y: c.y, blockId: c.blockId, level: c.level }));
  return sanitizeEntries(entries, hull, true);
}

function sanitizeHullSave(raw: unknown, hullId: string): HullSave {
  const hull = hullGrid(hullId);
  const r = (raw ?? {}) as Record<string, any>;
  const slots = (r.slots ?? {}) as Record<string, unknown>;
  return {
    active: r.active === 'B' ? 'B' : 'A',
    slots: { A: sanitizeEntries(slots.A, hull), B: sanitizeEntries(slots.B, hull) },
  };
}

/**
 * Loads the saved builder state. Never throws: corrupt JSON or an unknown version falls back to the
 * default; an old-format grid is migrated into slot A of the Shuttle.
 */
export function loadBuilder(raw: string | null, legacyRaw: string | null = null): SavedBuilder {
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data && data.version === 2 && data.hulls && typeof data.hulls === 'object') {
        const out: SavedBuilder = defaultSave();
        for (const hullId of Object.keys(HULL_BUILDERS)) {
          if (data.hulls[hullId]) out.hulls[hullId] = sanitizeHullSave(data.hulls[hullId], hullId);
        }
        if (typeof data.activeHull === 'string' && data.activeHull in HULL_BUILDERS) out.activeHull = data.activeHull;
        return out;
      }
    } catch {
      /* fall through to legacy / default */
    }
  }
  if (legacyRaw) {
    try {
      const entries = migrateLegacyGrid(JSON.parse(legacyRaw), hullGrid(DEFAULT_HULL));
      const out = defaultSave();
      out.hulls[DEFAULT_HULL].slots.A = entries;
      return out;
    } catch {
      /* fall through to default */
    }
  }
  return defaultSave();
}

export function serializeBuilder(s: SavedBuilder): string {
  return JSON.stringify(s);
}

/** Clipboard format for Copy / Paste layout. */
export interface LayoutClip {
  mgbm: 'layout';
  v: 2;
  hull: string;
  blocks: BlockEntry[];
}

export function encodeLayout(hullId: string, entries: BlockEntry[]): string {
  const clip: LayoutClip = { mgbm: 'layout', v: 2, hull: hullId, blocks: entries };
  return JSON.stringify(clip);
}

export type DecodeResult =
  | { ok: true; hull: string; entries: BlockEntry[]; dropped: number }
  | { ok: false; error: string };

export function decodeLayout(text: string, expectedHull: string): DecodeResult {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Clipboard does not contain a layout' };
  }
  if (!data || data.mgbm !== 'layout' || data.v !== 2 || !Array.isArray(data.blocks) || typeof data.hull !== 'string') {
    return { ok: false, error: 'Clipboard does not contain a layout' };
  }
  if (data.hull !== expectedHull) return { ok: false, error: `Layout is for the ${data.hull} hull` };
  const entries = sanitizeEntries(data.blocks, hullGrid(expectedHull));
  return { ok: true, hull: data.hull, entries, dropped: data.blocks.length - entries.length };
}
