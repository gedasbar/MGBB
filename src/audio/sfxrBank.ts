import { PARAM_SPECS, SfxrParams, sanitizeParams } from './sfxr';
import { SOUND_IDS } from './sounds';
import baked from './sfxrSounds.json';

/** localStorage key of the designs in progress (debug builds only). */
export const SFXR_DRAFT_KEY = 'mgbm_sfxr_draft';
export const SFXR_FORMAT_VERSION = 1;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export interface ImportResult { ok: boolean; count: number; ignored: string[]; error?: string }

/** Rounds to 4 decimals so the exported text stays short and a round trip is exact. */
const round = (v: number) => Math.round(v * 10000) / 10000;
function rounded(p: SfxrParams): SfxrParams {
  const o = { ...p };
  for (const s of PARAM_SPECS) o[s.key] = round(o[s.key]);
  return o;
}

/**
 * The designed sounds: slot id -> params. Starts from `src/audio/sfxrSounds.json` (what ships), then the designs kept in
 * a localStorage draft while tuning (debug builds; the draft replaces the file). A slot without an entry keeps its hand-made sound from sounds.ts.
 */
export class SfxrBank {
  private readonly map = new Map<string, SfxrParams>();
  private listeners: (() => void)[] = [];

  constructor(shipped: unknown = baked, private readonly storage: Store | null = null) {
    // A draft in localStorage is a full snapshot and replaces the shipped file (so clearing a slot while tuning sticks).
    let draft: unknown = null;
    if (storage) { try { const raw = storage.getItem(SFXR_DRAFT_KEY); if (raw) draft = JSON.parse(raw); } catch { draft = null; } }
    this.read(draft ?? shipped);
  }

  private read(src: unknown): { count: number; ignored: string[] } {
    const ignored: string[] = [];
    let count = 0;
    const sounds = src && typeof src === 'object' ? ((src as any).sounds ?? src) : null;
    if (sounds && typeof sounds === 'object') {
      for (const [id, v] of Object.entries(sounds as Record<string, unknown>)) {
        if (id === 'version') continue;
        if (!(SOUND_IDS as readonly string[]).includes(id) || !v || typeof v !== 'object') { ignored.push(id); continue; }
        this.map.set(id, sanitizeParams(v));
        count++;
      }
    }
    return { count, ignored };
  }

  has(id: string): boolean { return this.map.has(id); }
  get(id: string): SfxrParams | undefined { return this.map.get(id); }
  get size(): number { return this.map.size; }
  ids(): string[] { return [...this.map.keys()]; }

  /** Assigns a design to a slot ("Use in game"). Returns false for an unknown slot. */
  assign(id: string, params: SfxrParams): boolean {
    if (!(SOUND_IDS as readonly string[]).includes(id)) return false;
    this.map.set(id, sanitizeParams(params));
    this.changed();
    return true;
  }

  /** Back to the hand-made sound of the slot. */
  clear(id: string): void { if (this.map.delete(id)) this.changed(); }

  onChange(fn: () => void): void { this.listeners.push(fn); }

  /** All designs as one JSON text: paste it into `src/audio/sfxrSounds.json`. */
  exportJson(): string {
    const sounds: Record<string, SfxrParams> = {};
    for (const id of SOUND_IDS) { const p = this.map.get(id); if (p) sounds[id] = rounded(p); }
    return JSON.stringify({ version: SFXR_FORMAT_VERSION, sounds }, null, 1);
  }

  /** Reads the text `exportJson` made (replaces every design). Bad text changes nothing. */
  importJson(text: string): ImportResult {
    let data: unknown;
    try { data = JSON.parse(text); } catch { return { ok: false, count: 0, ignored: [], error: 'Not valid JSON' }; }
    if (!data || typeof data !== 'object') return { ok: false, count: 0, ignored: [], error: 'Not an object' };
    const v = (data as any).version;
    if (typeof v === 'number' && v > SFXR_FORMAT_VERSION) return { ok: false, count: 0, ignored: [], error: 'Made by a newer version' };
    this.map.clear();
    const { count, ignored } = this.read(data);
    this.changed();
    return { ok: true, count, ignored };
  }

  private changed() {
    if (this.storage) { try { this.storage.setItem(SFXR_DRAFT_KEY, this.exportJson()); } catch { /* storage full or blocked */ } }
    for (const fn of this.listeners) fn();
  }
}
