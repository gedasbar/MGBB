import { CHUNK_BY_ID, REMOVED_CHUNKS } from '../data/shipChunks';
import { DESIGN_NAME_MAX, LEGACY_GENERATOR_BASE_PRICE, LEGACY_GENERATOR_CHUNK, LEGACY_GENERATOR_GROWTH, LEGACY_REMOVED_CHUNK_PRICES, MAX_DESIGNS, SHIPYARD_UNLOCK_RING } from './constants';
import { chunkPrice, Design, isEmptyDesign, rotAt, shipyardOpen, SLOT_COUNT } from './design';

/** The Shipyard part of the save (chunk 31a, save version 14; 31c: version 15 adds the rotation of each placed chunk and removes the Generator chunk): Cores, the chunk inventory and up to MAX_DESIGNS saved designs. */
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
    // Chunk 31c: the Generator chunk is gone (the generator is a fixed cell now). Copies a save owned are refunded at the price formula they were bought at.
    const gen = (raw.chunks as Record<string, unknown>)[LEGACY_GENERATOR_CHUNK];
    if (typeof gen === 'number' && Number.isInteger(gen) && gen > 0) out.cores = Math.min(CORES_CEILING, out.cores + generatorRefund(Math.min(gen, CHUNK_COPIES_CEILING)));
    // Chunk 31d: Full and Bar are gone. Copies are refunded at what they cost; saved designs lose them below (an id that is not a chunk is an empty slot).
    out.cores = Math.min(CORES_CEILING, out.cores + removedChunksRefund(raw.chunks as Record<string, unknown>).cores);
  }
  if (Array.isArray(raw.designs)) {
    for (let i = 0; i < MAX_DESIGNS; i++) {
      const d = raw.designs[i] as { slots?: unknown; name?: unknown; rot?: unknown } | null | undefined;
      if (!d || typeof d !== 'object' || !Array.isArray(d.slots) || d.slots.length !== SLOT_COUNT) continue;
      // An id that is not a chunk (a save from a newer game, a hand edit) becomes an empty slot.
      const design: Design = { slots: d.slots.map((s: unknown) => (typeof s === 'string' && s in CHUNK_BY_ID ? s : null)) };
      // Rotations: a whole number 0..3 for each slot; anything else (no list, an old design, a hand edit) is 0.
      if (Array.isArray(d.rot)) {
        const rot = design.slots.map((_, k) => cleanRot((d.rot as unknown[])[k]));
        if (rot.some(r => r !== 0)) design.rot = rot;
      }
      const name = cleanName(d.name);
      if (name) design.name = name;
      if (!isEmptyDesign(design)) out.designs[i] = design;
    }
  }
  return out;
}

/** What a save gets back for `copies` Generator chunks (31a / 31b prices: base x growth^i for the i-th copy, whole Cores). */
export function generatorRefund(copies: number): number {
  let sum = 0;
  for (let i = 0; i < copies; i++) sum += Math.max(1, Math.round(LEGACY_GENERATOR_BASE_PRICE * Math.pow(LEGACY_GENERATOR_GROWTH, i)));
  return sum;
}

/** Chunk 31d: Cores refunded for copies owned of the chunks in REMOVED_CHUNKS (each copy at base x growth^k, whole Cores), and which chunks had copies. Pure; nothing is written. */
export function removedChunksRefund(chunks: Record<string, unknown> | null | undefined): { cores: number; names: string[] } {
  let cores = 0;
  const names: string[] = [];
  for (const id of REMOVED_CHUNKS) {
    const n = chunks?.[id];
    const price = LEGACY_REMOVED_CHUNK_PRICES[id];
    if (!price || typeof n !== 'number' || !Number.isInteger(n) || n <= 0) continue;
    for (let k = 0; k < Math.min(n, CHUNK_COPIES_CEILING); k++) cores += Math.max(1, Math.round(price.base * Math.pow(price.growth, k)));
    names.push(id);
  }
  return { cores, names };
}

/** The one-time message for the removed chunks, or '' when the save owned none. */
export function removedChunksNotice(chunks: Record<string, unknown> | null | undefined): string {
  const { cores, names } = removedChunksRefund(chunks);
  if (!names.length) return '';
  return `The ${names.map(n => (n === 'full' ? 'Full' : 'Bar')).join(' and ')} chunk${names.length > 1 ? 's were' : ' was'} removed (same shape as another chunk). You got ${cores} Cores back and any slot that held one is empty now.`;
}

/** A rotation from untrusted data: a whole number turned into 0..3 quarter turns; anything else is 0. */
export const cleanRot = (r: unknown): number => (typeof r === 'number' && Number.isInteger(r) ? ((r % 4) + 4) % 4 : 0);

/** A design name from untrusted data: a string, trimmed, at most DESIGN_NAME_MAX characters; '' when there is none. */
export const cleanName = (n: unknown): string => (typeof n === 'string' ? n.trim().slice(0, DESIGN_NAME_MAX) : '');

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
  if (design && !isEmptyDesign(design)) {
    const out: Design = { slots: design.slots.map(s => (s && s in CHUNK_BY_ID ? s : null)) };
    if (design.rot && design.slots.some((_, i) => rotAt(design, i) !== 0)) out.rot = design.slots.map((_, i) => rotAt(design, i));
    const name = cleanName(design.name);
    if (name) out.name = name;
    p.designs[slot] = out;
  } else p.designs[slot] = null;
  return { ok: true };
}
