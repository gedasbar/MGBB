import { pickerBlocks } from '../data/blocks';
import { HULL_BUILDERS } from '../game/gridUtils';
import {
  copyPrice, DEFAULT_OWNED, HULL_PRICE, maxLevelOf, upgradePrice,
} from './economy';

export const PROGRESS_KEY = 'mgbm.progress.v1';

/** Everything the player keeps between runs. */
export interface Progress {
  version: 1;
  credits: number;
  owned: Record<string, number>;
  levels: Record<string, number>;
  ownedHulls: string[];
  bestTier: number;
  bestTime: number;
  totalKills: number;
  runs: number;
}

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem?(k: string): void;
}

export function defaultProgress(): Progress {
  const owned: Record<string, number> = {};
  const levels: Record<string, number> = {};
  for (const b of pickerBlocks()) { owned[b.id] = DEFAULT_OWNED[b.id] ?? 0; levels[b.id] = 1; }
  return { version: 1, credits: 0, owned, levels, ownedHulls: ['shuttle'], bestTier: 0, bestTime: 0, totalKills: 0, runs: 0 };
}

/** A progress object with everything owned (20 of each block, level 1, all hulls). For tests and debugging. */
export function richProgress(count = 20): Progress {
  const p = defaultProgress();
  for (const id of Object.keys(p.owned)) p.owned[id] = count;
  p.ownedHulls = Object.keys(HULL_BUILDERS);
  return p;
}

const num = (v: unknown, min: number, fallback: number) =>
  typeof v === 'number' && isFinite(v) && v >= min ? v : fallback;
const int = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : fallback;

/** Validates untrusted data into a Progress. Never throws; anything unusable falls back to the new-game value. */
export function sanitizeProgress(raw: unknown): Progress {
  const d = defaultProgress();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, any>;
  const out: Progress = {
    ...d,
    credits: Math.floor(num(r.credits, 0, 0)),
    bestTier: int(r.bestTier, 0, 1e9, 0),
    bestTime: num(r.bestTime, 0, 0),
    totalKills: int(r.totalKills, 0, Number.MAX_SAFE_INTEGER, 0),
    runs: int(r.runs, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  for (const id of Object.keys(d.owned)) {
    out.owned[id] = int(r.owned?.[id], 0, 1e6, d.owned[id]);
    out.levels[id] = int(r.levels?.[id], 1, maxLevelOf(id), 1);
  }
  const hulls = Array.isArray(r.ownedHulls) ? r.ownedHulls.filter((h: unknown) => typeof h === 'string' && h in HULL_BUILDERS) : [];
  out.ownedHulls = Array.from(new Set(['shuttle', ...hulls]));
  return out;
}

export function loadProgress(raw: string | null): Progress {
  if (!raw) return defaultProgress();
  try {
    return sanitizeProgress(JSON.parse(raw));
  } catch {
    return defaultProgress();
  }
}

export function serializeProgress(p: Progress): string {
  return JSON.stringify(p);
}

export type BuyResult = { ok: true; price: number } | { ok: false; error: string };

export function buyCopy(p: Progress, id: string): BuyResult {
  if (!(id in p.owned)) return { ok: false, error: 'Not for sale' };
  const price = copyPrice(id, p.owned[id]);
  if (p.credits < price) return { ok: false, error: 'Not enough credits' };
  p.credits -= price;
  p.owned[id]++;
  return { ok: true, price };
}

export function buyUpgrade(p: Progress, id: string): BuyResult {
  if (!(id in p.levels)) return { ok: false, error: 'Not for sale' };
  const level = p.levels[id];
  if (level >= maxLevelOf(id)) return { ok: false, error: 'Already at max level' };
  const price = upgradePrice(id, level);
  if (p.credits < price) return { ok: false, error: 'Not enough credits' };
  p.credits -= price;
  p.levels[id] = level + 1;
  return { ok: true, price };
}

export function buyHull(p: Progress, id: string): BuyResult {
  if (!(id in HULL_PRICE)) return { ok: false, error: 'Not for sale' };
  if (p.ownedHulls.includes(id)) return { ok: false, error: 'Already owned' };
  const price = HULL_PRICE[id];
  if (p.credits < price) return { ok: false, error: 'Not enough credits' };
  p.credits -= price;
  p.ownedHulls.push(id);
  return { ok: true, price };
}

export interface RunResult { credits: number; kills: number; time: number; tier: number }

/** The progress object plus its storage. Every change goes through `commit()`, which saves and notifies. */
export class ProgressStore {
  data: Progress;
  private listeners = new Set<() => void>();

  constructor(private storage: StorageLike | null = null, initial?: Progress) {
    let raw: string | null = null;
    try { raw = storage?.getItem(PROGRESS_KEY) ?? null; } catch { /* storage unavailable */ }
    this.data = initial ?? loadProgress(raw);
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  commit() {
    try { this.storage?.setItem(PROGRESS_KEY, serializeProgress(this.data)); } catch { /* quota or private mode */ }
    for (const l of this.listeners) l();
  }

  addCredits(n: number) {
    this.data.credits += Math.floor(n);
    this.commit();
  }

  /** Back to the new-game state (debug and tests). */
  reset() {
    this.data = defaultProgress();
    this.commit();
  }

  buyCopy(id: string): BuyResult { const r = buyCopy(this.data, id); if (r.ok) this.commit(); return r; }
  buyUpgrade(id: string): BuyResult { const r = buyUpgrade(this.data, id); if (r.ok) this.commit(); return r; }
  buyHull(id: string): BuyResult { const r = buyHull(this.data, id); if (r.ok) this.commit(); return r; }

  /** Adds one finished run to the totals. Call exactly once per run. */
  recordRun(run: RunResult): { newBestTier: boolean; newBestTime: boolean } {
    const d = this.data;
    const newBestTier = run.tier > d.bestTier;
    const newBestTime = run.time > d.bestTime;
    d.credits += Math.floor(run.credits);
    d.totalKills += run.kills;
    d.runs++;
    if (newBestTier) d.bestTier = run.tier;
    if (newBestTime) d.bestTime = run.time;
    this.commit();
    return { newBestTier, newBestTime };
  }
}

let shared: ProgressStore | null = null;

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

export function getProgressStore(): ProgressStore {
  if (!shared) shared = new ProgressStore(safeStorage());
  return shared;
}
