import { CHUNK_BY_ID } from '../data/shipChunks';
import { customHullId, customHullName, DESIGN_NAME_MAX, MAX_DESIGNS } from './constants';
import {
  chunkPrice, chunkUsage, Design, designProblems, designStats, DesignStats, emptyDesign, isEmptyDesign, SLOT_COUNT,
} from './design';
import { cleanName, ShipyardResult } from './state';

/**
 * The Shipyard's editing session (chunk 31b), pure: no Pixi, no DOM. It works on the progress store's chunk inventory and saved designs
 * (an `EditorStore`), one design slot at a time, with its own undo / redo stacks (they reset when the slot changes, like leaving a circuit).
 * Every edit is saved at once (`setDesign`), so leaving the screen never loses work; a half-finished design is kept, it just cannot fly.
 */
export interface EditorStore {
  data: { cores: number; chunks: Record<string, number>; designs: (Design | null)[] };
  shipyardOpen: boolean;
  setDesign(slot: number, design: Design | null): ShipyardResult;
  buyChunk(id: string): ShipyardResult;
}

export type EditResult = { ok: true } | { ok: false; error: string };

const HISTORY_LIMIT = 100;
const copyOf = (d: Design): Design => (d.name ? { slots: [...d.slots], name: d.name } : { slots: [...d.slots] });

export class ShipyardEditor {
  slot = 0;
  private undoStack: Design[] = [];
  private redoStack: Design[] = [];

  constructor(private store: EditorStore) {}

  /** The design being edited (a fresh empty one while the slot holds none). A copy: change it through the methods. */
  design(): Design { return copyOf(this.store.data.designs[this.slot] ?? emptyDesign()); }

  hullId(): string { return customHullId(this.slot); }
  /** "Custom 1" or the player's own name. */
  label(slot = this.slot): string { return this.store.data.designs[slot]?.name || customHullName(slot); }
  slotLabels(): string[] { return Array.from({ length: MAX_DESIGNS }, (_, i) => this.label(i)); }

  switchSlot(i: number): EditResult {
    if (!Number.isInteger(i) || i < 0 || i >= MAX_DESIGNS) return { ok: false, error: 'No such design slot' };
    if (i !== this.slot) { this.slot = i; this.undoStack = []; this.redoStack = []; }
    return { ok: true };
  }

  // ---------------------------------------------------------------- inventory

  owned(id: string): number { return this.store.data.chunks[id] ?? 0; }
  /** Copies the design does not use yet. */
  free(id: string, d: Design = this.design()): number { return Math.max(0, this.owned(id) - (chunkUsage(d)[id] ?? 0)); }
  price(id: string): number { return chunkPrice(id, this.owned(id)); }
  canAfford(id: string): boolean { return this.store.data.cores >= this.price(id); }
  cores(): number { return this.store.data.cores; }

  buy(id: string): EditResult {
    const r = this.store.buyChunk(id);
    return r.ok ? { ok: true } : r;
  }

  // ---------------------------------------------------------------- editing (each change is one undo step)

  private apply(next: Design): EditResult {
    const prev = this.design();
    const r = this.store.setDesign(this.slot, next);
    if (!r.ok) return r;
    this.undoStack.push(prev);
    if (this.undoStack.length > HISTORY_LIMIT) this.undoStack.shift();
    this.redoStack = [];
    return { ok: true };
  }

  /** Puts a chunk in a slot of the grid (0..15, row-major): uses one free copy; a chunk already there goes back to the free copies (replace). */
  place(cell: number, id: string): EditResult {
    if (!Number.isInteger(cell) || cell < 0 || cell >= SLOT_COUNT) return { ok: false, error: 'No such slot' };
    const c = CHUNK_BY_ID[id];
    if (!c) return { ok: false, error: 'Not a chunk' };
    const d = this.design();
    if (d.slots[cell] === id) return { ok: true };
    if (this.free(id, d) <= 0) return { ok: false, error: `No ${c.name} left` };
    d.slots[cell] = id;
    return this.apply(d);
  }

  /** Takes the chunk out of a slot (its copy is free again). */
  remove(cell: number): EditResult {
    if (!Number.isInteger(cell) || cell < 0 || cell >= SLOT_COUNT) return { ok: false, error: 'No such slot' };
    const d = this.design();
    if (d.slots[cell] === null) return { ok: true };
    d.slots[cell] = null;
    return this.apply(d);
  }

  /** Renames the design (trimmed, cut to DESIGN_NAME_MAX; empty goes back to "Custom N"). A rename is not an undo step. */
  rename(name: string): EditResult {
    const d = this.design();
    const n = cleanName(name).slice(0, DESIGN_NAME_MAX);
    if (n) d.name = n; else delete d.name;
    const r = this.store.setDesign(this.slot, d);
    return r.ok ? { ok: true } : r;
  }

  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }

  undo(): EditResult {
    const prev = this.undoStack.pop();
    if (!prev) return { ok: false, error: 'Nothing to undo' };
    const cur = this.design();
    const r = this.store.setDesign(this.slot, isEmptyDesign(prev) && !prev.name ? null : prev);
    if (!r.ok) { this.undoStack.push(prev); return r; }
    this.redoStack.push(cur);
    return { ok: true };
  }

  redo(): EditResult {
    const next = this.redoStack.pop();
    if (!next) return { ok: false, error: 'Nothing to redo' };
    const cur = this.design();
    const r = this.store.setDesign(this.slot, next);
    if (!r.ok) { this.redoStack.push(next); return r; }
    this.undoStack.push(cur);
    return { ok: true };
  }

  // ---------------------------------------------------------------- state of the design

  /** Mistakes first, then what the design needs to own (empty = it can fly). */
  problems(): string[] { return designProblems(this.design(), this.store.data.chunks); }
  stats(): DesignStats | null { return designStats(this.design()); }
  /** Valid, fully owned and the Shipyard open: "Use this ship" is allowed. */
  canUse(): boolean { return this.store.shipyardOpen && this.problems().length === 0; }
}
