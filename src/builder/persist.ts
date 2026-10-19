import { Grid } from '../engine/compiler';
import { Rotation } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import { cloneGrid, HULL_BUILDERS } from '../game/gridUtils';
import { orientLegacyAuto } from '../engine/orient';
import { STARTER_HULL } from '../data/hulls';

export type SlotId = 'A' | 'B';
export const SLOTS: SlotId[] = ['A', 'B'];

/** A player-placed block. Fixed hull cells (void, generator, ejector) are never saved. */
export interface BlockEntry {
  x: number;
  y: number;
  blockId: string;
  level: number;
  /** Stored orientation (chunk 16a: every block has one; saves before version 3 could also have blocks in "auto" mode). */
  rotation: Rotation;
}

export interface HullSave {
  active: SlotId;
  slots: Record<SlotId, BlockEntry[]>;
}

export interface SavedBuilder {
  version: 3;
  /** Hull shown on the Build screen. */
  activeHull?: string;
  hulls: Record<string, HullSave>;
}

export const STORAGE_KEY = 'mgbm.builder.v2';
/** Key used by the previous builder (whole grid, compass-style rotations 0..3, Straight blocks). */
export const LEGACY_KEY = 'mgbm_grid';
/** The hull of a fresh save: the free Dart with its one slot empty. */
export const DEFAULT_HULL: string = STARTER_HULL;
/** Hull of builds saved before the hull ladder, and of the old grid format. */
export const LEGACY_HULL = 'shuttle';

/** Default circuit for slot A of the Shuttle (0-indexed x,y): each block faces the way the signal reaches it (turn_l is entered heading east). */
export const DEFAULT_SHUTTLE_A: BlockEntry[] = [
  { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0 },
  { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 90 },
  { x: 8, y: 5, blockId: 'flat_plus', level: 1, rotation: 0 },
];

export function defaultSave(): SavedBuilder {
  return {
    version: 3,
    hulls: {
      [DEFAULT_HULL]: { active: 'A', slots: { A: [], B: [] } },
      // The Shuttle (bought later) comes with its classic circuit already built.
      [LEGACY_HULL]: { active: 'A', slots: { A: DEFAULT_SHUTTLE_A.map(e => ({ ...e })), B: [] } },
    },
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
      out.push({ x: c.x, y: c.y, blockId: c.blockId, level: c.level, rotation: c.rotation });
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
  }
  return g;
}

function isRotation(r: unknown): r is Rotation {
  return r === 0 || r === 90 || r === 180 || r === 270;
}

/** Where entries come from: 'v3' stores every orientation; 'v2' (builder saves and layouts before chunk 16a) has a `manual` flag and auto blocks; 'legacy' is the oldest grid format (compass rotations, all auto). */
export type EntrySource = 'v3' | 'v2' | 'legacy';

/**
 * Validates untrusted entries against a hull. Anything unusable (unknown or unplaceable block,
 * Straight, outside the hull, on a fixed cell, duplicate cell) is dropped, never thrown on.
 * Blocks that were in auto mode (every block of a 'legacy' source, those without `manual: true` in a 'v2' one) get their
 * orientation worked out ONCE here, against the circuit as saved (orientLegacyAuto), and keep it from then on.
 */
export function sanitizeEntries(raw: unknown, hull: Grid, source: EntrySource = 'v3'): BlockEntry[] {
  const out: BlockEntry[] = [];
  const autoIdx: number[] = [];
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
    if (source === 'v3') { if (isRotation(rotation)) rot = rotation; }
    else if (source === 'v2' && manual === true && isRotation(rotation)) rot = rotation;
    else autoIdx.push(idx);
    used.add(idx);
    out.push({ x: cx, y: cy, blockId, level: lvOk ? (level as number) : 1, rotation: rot });
  }
  if (autoIdx.length > 0) {
    const g = cloneGrid(hull);
    for (const e of out) { const c = g.cells[e.y * g.w + e.x]; c.blockId = e.blockId; c.rotation = e.rotation; }
    orientLegacyAuto(g, autoIdx);
    for (const e of out) e.rotation = g.cells[e.y * g.w + e.x].rotation;
  }
  return out;
}

/** Cell type as stored by older builds. The 'blocked' type was removed; such a cell is void now. */
export function legacyCellType(t: unknown): 'empty' | 'void' | 'generator' | 'ejector' | null {
  if (t === 'blocked') return 'void';
  return t === 'empty' || t === 'void' || t === 'generator' || t === 'ejector' ? t : null;
}

/** Reads the whole old-format grid ({w,h,cells[]}) and keeps only what survives sanitising. */
export function migrateLegacyGrid(raw: unknown, hull: Grid): BlockEntry[] {
  const cells = (raw as { cells?: unknown } | null)?.cells;
  if (!Array.isArray(cells)) return [];
  const entries = cells
    .filter((c: any) => c && legacyCellType(c.type) === 'empty' && typeof c.blockId === 'string')
    .map((c: any) => ({ x: c.x, y: c.y, blockId: c.blockId, level: c.level }));
  return sanitizeEntries(entries, hull, 'legacy');
}

function sanitizeHullSave(raw: unknown, hullId: string, source: EntrySource): HullSave {
  const hull = hullGrid(hullId);
  const r = (raw ?? {}) as Record<string, any>;
  const slots = (r.slots ?? {}) as Record<string, unknown>;
  return {
    active: r.active === 'B' ? 'B' : 'A',
    slots: { A: sanitizeEntries(slots.A, hull, source), B: sanitizeEntries(slots.B, hull, source) },
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
      if (data && (data.version === 2 || data.version === 3) && data.hulls && typeof data.hulls === 'object') {
        const out: SavedBuilder = defaultSave();
        for (const hullId of Object.keys(HULL_BUILDERS)) {
          if (data.hulls[hullId]) out.hulls[hullId] = sanitizeHullSave(data.hulls[hullId], hullId, data.version === 2 ? 'v2' : 'v3');
        }
        if (typeof data.activeHull === 'string' && data.activeHull in HULL_BUILDERS) out.activeHull = data.activeHull;
        // A save from before the ladder with no remembered hull was building on the Shuttle: keep it there.
        else if (data.hulls[LEGACY_HULL]) out.activeHull = LEGACY_HULL;
        return out;
      }
    } catch {
      /* fall through to legacy / default */
    }
  }
  if (legacyRaw) {
    try {
      const entries = migrateLegacyGrid(JSON.parse(legacyRaw), hullGrid(LEGACY_HULL));
      const out = defaultSave();
      out.hulls[LEGACY_HULL] = { active: 'A', slots: { A: entries, B: [] } };
      out.activeHull = LEGACY_HULL;
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
  v: 3;
  hull: string;
  blocks: BlockEntry[];
}

export function encodeLayout(hullId: string, entries: BlockEntry[]): string {
  const clip: LayoutClip = { mgbm: 'layout', v: 3, hull: hullId, blocks: entries };
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
  if (!data || data.mgbm !== 'layout' || (data.v !== 2 && data.v !== 3) || !Array.isArray(data.blocks) || typeof data.hull !== 'string') {
    return { ok: false, error: 'Clipboard does not contain a layout' };
  }
  if (data.hull !== expectedHull) return { ok: false, error: `Layout is for the ${data.hull} hull` };
  const entries = sanitizeEntries(data.blocks, hullGrid(expectedHull), data.v === 2 ? 'v2' : 'v3');
  return { ok: true, hull: data.hull, entries, dropped: data.blocks.length - entries.length };
}
