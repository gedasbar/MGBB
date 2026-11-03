import { DEFAULT_MODE, MAP_MEMORY_KEY, MAP_MODES, MapMode } from './constants';

/**
 * Chunk 29b: which mode screen the Map tab goes back to. `open` is the mode screen the player is in (or was last in), null when they pressed "<" and are on the carousel;
 * `last` is the mode the carousel opens centred on. It is UI state kept in localStorage (key `mgbm_mapnav`), not in the save: the save stays version 13 and Export / Import do not carry it.
 */
export interface MapMemory { open: MapMode | null; last: MapMode }

export const isMapMode = (v: unknown): v is MapMode => typeof v === 'string' && (MAP_MODES as readonly string[]).includes(v);

/** Reads whatever is stored and returns a valid memory (anything wrong falls back to "on the carousel, centred on Campaign"). */
export function sanitizeMemory(raw: unknown): MapMemory {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const last = isMapMode(r.last) ? r.last : DEFAULT_MODE;
  const open = isMapMode(r.open) ? r.open : null;
  return { open, last: open ?? last };
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export class MapMemoryStore {
  constructor(private storage: Store | null) {}

  get(): MapMemory {
    try {
      const raw = this.storage?.getItem(MAP_MEMORY_KEY);
      return sanitizeMemory(raw ? JSON.parse(raw) : null);
    } catch { return sanitizeMemory(null); }
  }

  private put(m: MapMemory) {
    try { this.storage?.setItem(MAP_MEMORY_KEY, JSON.stringify(m)); } catch { /* private mode: the memory just lasts nothing */ }
  }

  /** A mode screen was opened: the Map tab goes back to it from now on. */
  setOpen(mode: MapMode) { this.put({ open: mode, last: mode }); }

  /** "<" was pressed on a mode screen: the Map tab shows the carousel, centred on that mode. */
  backToCarousel(mode: MapMode) { this.put({ open: null, last: mode }); }

  /** The mode the carousel should open on. */
  centred(): MapMode { return this.get().last; }
}

let shared: MapMemoryStore | null = null;
export function mapMemory(): MapMemoryStore {
  if (!shared) shared = new MapMemoryStore(typeof localStorage !== 'undefined' ? localStorage : null);
  return shared;
}
