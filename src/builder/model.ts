import { compile, CompiledShip, CompileStats, Grid } from '../engine/compiler';
import { normalizeRotation } from '../engine/compilerTypes';
import { BLOCKS } from '../data/blocks';
import { cloneGrid, HULL_BUILDERS } from '../game/gridUtils';
import { ProgressStore } from '../econ/progress';
import {
  BlockEntry, decodeLayout, DEFAULT_HULL, encodeLayout, entriesFromGrid, gridFromEntries, LEGACY_KEY,
  loadBuilder, SavedBuilder, serializeBuilder, SlotId, STORAGE_KEY,
} from './persist';

export const UNDO_LIMIT = 50;

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

export type EditResult = { ok: true } | { ok: false; error: string };

interface SlotState {
  grid: Grid;
  undo: string[];
  redo: string[];
}

/**
 * Headless builder state: two circuits per hull, undo/redo, inventory, persistence.
 * No rendering in here, so everything is unit-testable.
 */
export class BuilderModel {
  hullId = DEFAULT_HULL;
  active: SlotId = 'A';
  /** Credits, owned counts and block levels. Shared with the Shop. */
  readonly store: ProgressStore;
  /** Blocks removed from saved circuits because the player owns fewer than the circuit used. */
  trimmed = 0;
  compiled!: CompiledShip;
  private slots!: Record<SlotId, SlotState>;
  private saved: SavedBuilder;
  private listeners = new Set<() => void>();

  constructor(private storage: StorageLike | null = null, hullId?: string, store?: ProgressStore) {
    this.store = store ?? new ProgressStore(storage);
    let raw: string | null = null;
    let legacy: string | null = null;
    try {
      raw = storage?.getItem(STORAGE_KEY) ?? null;
      legacy = storage?.getItem(LEGACY_KEY) ?? null;
    } catch {
      /* storage unavailable */
    }
    this.saved = loadBuilder(raw, legacy);
    // A player of the old grid format built on what is now the Shuttle: it stays theirs.
    if (legacy && !this.store.data.ownedHulls.includes('shuttle')) { this.store.data.ownedHulls.push('shuttle'); this.store.commit(); }
    this.loadHull(hullId ?? this.saved.activeHull ?? DEFAULT_HULL);
    if ((!raw || legacy || this.trimmed > 0) && storage) this.persist(); // write the new format over a migrated save
  }

  /** Owned count per block id (a live view of the progress object). */
  get owned(): Record<string, number> { return this.store.data.owned; }

  levelOf(blockId: string): number { return this.store.data.levels[blockId] ?? 1; }

  private loadHull(hullId: string) {
    if (!this.store.data.ownedHulls.includes(hullId)) hullId = DEFAULT_HULL;
    this.hullId = hullId;
    const hs = this.saved.hulls[hullId] ?? { active: 'A' as SlotId, slots: { A: [], B: [] } };
    this.active = hs.active;
    this.slots = {
      A: { grid: gridFromEntries(hullId, hs.slots.A), undo: [], redo: [] },
      B: { grid: gridFromEntries(hullId, hs.slots.B), undo: [], redo: [] },
    };
    for (const s of Object.values(this.slots)) this.syncLevels(s.grid);
    this.trimmed += this.trimToInventory();
    this.compiled = compile(this.grid);
  }

  /** Every placed block takes its level from the saved progress. */
  private syncLevels(g: Grid) {
    for (const c of g.cells) if (c.blockId) c.level = this.levelOf(c.blockId);
  }

  /** Re-reads levels after an upgrade (or a progress reset) and recompiles. */
  refreshLevels() {
    for (const s of Object.values(this.slots)) this.syncLevels(s.grid);
    this.commit();
  }

  /**
   * Removes blocks a circuit uses beyond what is owned (the last ones in reading order go first) and
   * returns how many were removed. Covers both circuits of the current hull.
   */
  trimToInventory(): number {
    let removed = 0;
    for (const s of Object.values(this.slots)) {
      const used = new Map<string, number>();
      for (const c of s.grid.cells) {
        if (!c.blockId) continue;
        const n = (used.get(c.blockId) ?? 0) + 1;
        used.set(c.blockId, n);
        if (n > (this.owned[c.blockId] ?? 0)) {
          c.blockId = null; c.level = 1; c.rotation = 0; c.manual = false;
          removed++;
        }
      }
    }
    return removed;
  }

  /** Trims, recompiles and saves; returns how many blocks were removed. */
  enforceInventory(): number {
    const n = this.trimToInventory();
    if (n > 0) { for (const s of Object.values(this.slots)) { s.undo.length = 0; s.redo.length = 0; } }
    this.commit();
    return n;
  }

  get grid(): Grid {
    return this.slots[this.active].grid;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private commit() {
    this.compiled = compile(this.grid);
    this.persist();
    for (const l of this.listeners) l();
  }

  private persist() {
    this.saved.activeHull = this.hullId;
    this.saved.hulls[this.hullId] = {
      active: this.active,
      slots: { A: entriesFromGrid(this.slots.A.grid), B: entriesFromGrid(this.slots.B.grid) },
    };
    try {
      this.storage?.setItem(STORAGE_KEY, serializeBuilder(this.saved));
      this.storage?.removeItem?.(LEGACY_KEY);
    } catch {
      /* quota or private mode: keep working in memory */
    }
  }

  // ------------------------------------------------------------ inventory
  placedCount(blockId: string, grid: Grid = this.grid): number {
    let n = 0;
    for (const c of grid.cells) if (c.blockId === blockId) n++;
    return n;
  }

  /** Owned minus placed in the active circuit (A and B each have the whole inventory to draw from). */
  available(blockId: string): number {
    return (this.owned[blockId] ?? 0) - this.placedCount(blockId);
  }

  // ------------------------------------------------------------ history
  private snapshot(): string {
    return JSON.stringify(entriesFromGrid(this.grid));
  }

  private pushUndo() {
    const s = this.slots[this.active];
    s.undo.push(this.snapshot());
    if (s.undo.length > UNDO_LIMIT) s.undo.shift();
    s.redo.length = 0;
  }

  private restore(snap: string) {
    const g = gridFromEntries(this.hullId, JSON.parse(snap) as BlockEntry[]);
    this.syncLevels(g);
    this.slots[this.active].grid = g;
  }

  get canUndo(): boolean { return this.slots[this.active].undo.length > 0; }
  get canRedo(): boolean { return this.slots[this.active].redo.length > 0; }

  undo(): boolean {
    const s = this.slots[this.active];
    const snap = s.undo.pop();
    if (snap === undefined) return false;
    s.redo.push(this.snapshot());
    this.restore(snap);
    this.commit();
    return true;
  }

  redo(): boolean {
    const s = this.slots[this.active];
    const snap = s.redo.pop();
    if (snap === undefined) return false;
    s.undo.push(this.snapshot());
    this.restore(snap);
    this.commit();
    return true;
  }

  // ------------------------------------------------------------ edits
  cellAt(x: number, y: number) {
    if (x < 0 || y < 0 || x >= this.grid.w || y >= this.grid.h) return null;
    return this.grid.cells[y * this.grid.w + x];
  }

  /** Places (or swaps in) a block in auto mode. Replacing returns the old block to the inventory. */
  place(x: number, y: number, blockId: string): EditResult {
    const c = this.cellAt(x, y);
    const def = BLOCKS[blockId];
    if (!c || c.type !== 'empty') return { ok: false, error: 'You can only build on empty cells' };
    if (!def || !def.shown) return { ok: false, error: 'That block cannot be placed' };
    if (c.blockId === blockId) return { ok: true };
    if (this.available(blockId) <= 0) return { ok: false, error: `No ${def.name} left` };
    this.pushUndo();
    c.blockId = blockId;
    c.level = this.levelOf(blockId);
    c.rotation = 0;
    c.manual = false;
    this.commit();
    return { ok: true };
  }

  remove(x: number, y: number): EditResult {
    const c = this.cellAt(x, y);
    if (!c || c.type !== 'empty' || !c.blockId) return { ok: false, error: 'Nothing to clear here' };
    this.pushUndo();
    c.blockId = null;
    c.level = 1;
    c.rotation = 0;
    c.manual = false;
    this.commit();
    return { ok: true };
  }

  /**
   * Rotates by 90° (+1 clockwise, -1 counter-clockwise) from the orientation currently displayed
   * and switches the block to manual mode.
   */
  rotate(x: number, y: number, steps: 1 | -1): EditResult {
    const c = this.cellAt(x, y);
    if (!c || c.type !== 'empty' || !c.blockId) return { ok: false, error: 'Select a block to rotate' };
    const shown = this.compiled.cellInfo[y * this.grid.w + x].effectiveRotation;
    this.pushUndo();
    c.rotation = normalizeRotation(shown + 90 * steps);
    c.manual = true;
    this.commit();
    return { ok: true };
  }

  /** Back to auto mode: the block follows the line again. */
  autoOrient(x: number, y: number): EditResult {
    const c = this.cellAt(x, y);
    if (!c || c.type !== 'empty' || !c.blockId) return { ok: false, error: 'Select a block first' };
    if (!c.manual) return { ok: true };
    this.pushUndo();
    c.manual = false;
    c.rotation = 0;
    this.commit();
    return { ok: true };
  }

  clearAll(): EditResult {
    if (!this.grid.cells.some(c => c.blockId)) return { ok: false, error: 'Nothing to clear' };
    this.pushUndo();
    for (const c of this.grid.cells) {
      if (c.type === 'empty') { c.blockId = null; c.level = 1; c.rotation = 0; c.manual = false; }
    }
    this.commit();
    return { ok: true };
  }

  /** Switches the hull being built (each hull keeps its own A and B circuits). Undo history starts fresh. */
  switchHull(hullId: string): EditResult {
    if (!(hullId in HULL_BUILDERS)) return { ok: false, error: 'Unknown hull' };
    if (!this.store.data.ownedHulls.includes(hullId)) return { ok: false, error: 'Hull locked: buy it in the Shop' };
    if (hullId === this.hullId) return { ok: true };
    this.persist();
    this.loadHull(hullId);
    this.commit();
    return { ok: true };
  }

  switchSlot(slot: SlotId) {
    if (slot === this.active) return;
    this.active = slot;
    this.commit();
  }

  // ------------------------------------------------------------ copy / paste
  copyLayout(): string {
    return encodeLayout(this.hullId, entriesFromGrid(this.grid));
  }

  pasteLayout(text: string): EditResult {
    const res = decodeLayout(text, this.hullId);
    if (!res.ok) return res;
    const counts = new Map<string, number>();
    for (const e of res.entries) counts.set(e.blockId, (counts.get(e.blockId) ?? 0) + 1);
    for (const [id, n] of counts) {
      if (n > (this.owned[id] ?? 0)) return { ok: false, error: `Not enough ${BLOCKS[id].name} for that layout` };
    }
    this.pushUndo();
    const g = gridFromEntries(this.hullId, res.entries);
    this.syncLevels(g);
    this.slots[this.active].grid = g;
    this.commit();
    return { ok: true };
  }

  // ------------------------------------------------------------ preview
  /** What the circuit would compile to with `blockId` (or nothing) in the cell. Changes nothing. */
  previewPlace(x: number, y: number, blockId: string | null): { grid: Grid; compiled: CompiledShip } | null {
    const base = this.cellAt(x, y);
    if (!base || base.type !== 'empty') return null;
    const g = cloneGrid(this.grid);
    const c = g.cells[y * g.w + x];
    c.blockId = blockId;
    c.level = blockId ? this.levelOf(blockId) : 1;
    c.rotation = 0;
    c.manual = false;
    return { grid: g, compiled: compile(g) };
  }

  /** Fresh grid copy for the Fly screen. */
  gridForFlight(): Grid {
    return cloneGrid(this.grid);
  }
}

export interface StatsDelta {
  damagePerShot: number;
  projectilesPerPulse: number;
  pulsesPerSecond: number;
  estDps: number;
}

export function statsDelta(a: CompileStats, b: CompileStats): StatsDelta {
  return {
    damagePerShot: b.damagePerShot - a.damagePerShot,
    projectilesPerPulse: b.projectilesPerPulse - a.projectilesPerPulse,
    pulsesPerSecond: b.pulsesPerSecond - a.pulsesPerSecond,
    estDps: b.estDps - a.estDps,
  };
}
