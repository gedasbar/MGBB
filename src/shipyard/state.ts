import { CHUNK_BY_ID } from '../data/shipChunks';
import { MAX_DESIGNS, SHIPYARD_UNLOCK_RING } from './constants';
import { chunkPrice, Design, isEmptyDesign, shipyardOpen, SLOT_COUNT } from './design';

/** The Shipyard part of the save (chunk 31a, save version 14): Cores, the chunk inventory and up to MAX_DESIGNS saved designs. */
export interface ShipyardSave {
  cores: number;
  /** Chunk id -> copies owned. */
  chunks: Record<string, number>;
  /** One entry per design slot: a design or null. */
  designs: (Design | null)[];
}

export const defaultShipyard = (): ShipyardSave => ({ cores: 0, chunks: {}, designs: new Array<Design | null>(MAX_DESIGNS).fill(null) });

/** Cores in a save are whole numbers; nothing honest holds more than this. */
const CORES_CEILING = 1e12;
const CHUNK_COPIES_CEILING = 1000;

/** Validates untrusted data into the three Shipyard fields. Never throws; anything unusable becomes the new-game value (0 Cores, no chunks, no designs). */
export function sanitizeShipyard(raw: { cores?: unknown; chunks?: unknown; designs?: unknown } | null | undefined): ShipyardSave {
  const out = defaultShipyard();
  if (!raw || typeof raw !== 'object') return out;
  if (typeof raw.cores === 'number' && isFinite(raw.cores) && raw.cores > 0) out.cores = Math.min(CORES_CEILING, Math.floor(raw.cores));
  if (raw.chunks && typeof raw.chunks === 'object') {
    for (const [id, n] of Object.entries(raw.chunks as Record<string, unknown>)) {
      if (id in CHUNK_BY_ID && typeof n === 'number' && Number.isInteger(n) && n > 0) out.chunks[id] = Math.min(n, CHUNK_COPIES_CEILING);
    }
  }
  if (Array.isArray(raw.designs)) {
    for (let i = 0; i < MAX_DESIGNS; i++) {
      const d = raw.designs[i] as { slots?: unknown } | null | undefined;
      if (!d || typeof d !== 'object' || !Array.isArray(d.slots) || d.slots.length !== SLOT_COUNT) continue;
      // An id that is not a chunk (a save from a newer game, a hand edit) becomes an empty slot.
      const design: Design = { slots: d.slots.map((s: unknown) => (typeof s === 'string' && s in CHUNK_BY_ID ? s : null)) };
      if (!isEmptyDesign(design)) out.designs[i] = design;
    }
  }
  return out;
}

export type ShipyardResult = { ok: true; price?: number } | { ok: false; error: string };

const closedText = `The Shipyard opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`;

/** Buys one copy of a chunk with Cores. The Shipyard must be open (`furthestRing` is the ring Frontier Echo reads). */
export function buyChunk(p: ShipyardSave, id: string, furthestRing: number): ShipyardResult {
  if (!(id in CHUNK_BY_ID)) return { ok: false, error: 'Not for sale' };
  if (!shipyardOpen(furthestRing)) return { ok: false, error: closedText };
  const price = chunkPrice(id, p.chunks[id] ?? 0);
  if (p.cores < price) return { ok: false, error: `Not enough Cores (${price} needed)` };
  p.cores -= price;
  p.chunks[id] = (p.chunks[id] ?? 0) + 1;
  return { ok: true, price };
}

/** Saves a design in a slot (any design: a half-finished one is kept, it just cannot fly until it is valid and owned). null clears the slot. */
export function setDesign(p: ShipyardSave, slot: number, design: Design | null, furthestRing: number): ShipyardResult {
  if (!Number.isInteger(slot) || slot < 0 || slot >= MAX_DESIGNS) return { ok: false, error: 'No such design slot' };
  if (!shipyardOpen(furthestRing)) return { ok: false, error: closedText };
  if (design !== null && design.slots.length !== SLOT_COUNT) return { ok: false, error: 'A design has 16 slots' };
  p.designs[slot] = design && !isEmptyDesign(design) ? { slots: design.slots.map(s => (s && s in CHUNK_BY_ID ? s : null)) } : null;
  return { ok: true };
}
