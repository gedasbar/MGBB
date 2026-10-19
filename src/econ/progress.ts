import { MAX_TIER } from '../wall/generator';
import { applySquareRun, defaultFrontier, FrontierSave, sanitizeFrontier, SquareRunOutcome } from '../frontier/state';
import { MAP_UNLOCK_TIER } from '../frontier/constants';
import { EncounterOutcome } from '../frontier/encounter';
import { blockName, gateOf, isBlockUnlocked, newlyReached, Reach, reachBySector, requirementText } from '../frontier/unlocks';
import { CaptainsState, defaultCaptains, sanitizeCaptains, addCaptainKills, buyOption, activateOption, claimFlyMilestone, rollMedals, selectCaptain, unlockCaptain, upgradeHero, CaptainResult, MedalAward } from '../captains/state';
import { modifiersFor, RunModifiers } from '../captains/modifiers';
import { BLOCKS, pickerBlocks } from '../data/blocks';
import { HULL_BUILDERS } from '../game/gridUtils';
import { STARTER_HULL } from '../data/hulls';
import {
  copyPrice, DEFAULT_OWNED, HULL_PRICE, maxLevelOf, upgradePrice,
} from './economy';

export const PROGRESS_KEY = 'mgbm.progress.v1';

/** Save format version: 1 = Free Fly only, 2 adds the campaign fields, 3 adds passedTiers and wallBestClearTime, 4 adds the Dart (a free hull every save owns; hulls already owned are kept), 5 adds bestWave (Free Fly waves, chunk 10a; older saves start at 0), 6 adds `captains` (chunk 13a) and makes `medals` a spendable balance, 7 adds `frontier` (chunk 15a; older saves load with an empty Frontier). The storage key stays the same; v1 saves are migrated on load. */
export const PROGRESS_VERSION = 7;

/** Everything the player keeps between runs. */
export interface Progress {
  version: 7;
  credits: number;
  owned: Record<string, number>;
  levels: Record<string, number>;
  ownedHulls: string[];
  bestTier: number;
  /** Free Fly records: best time survived (s) and best wave reached (0 = never flown since waves exist). */
  bestTime: number;
  bestWave: number;
  totalKills: number;
  runs: number;
  /** Campaign tiers cleared (every block destroyed at least once), ascending, no duplicates. */
  clearedTiers: number[];
  /** Campaign tiers passed: flown past the end of the wall or cleared. Always a superset of clearedTiers; unlocks the next tier. */
  passedTiers: number[];
  /** Per campaign tier (key = tier number): best share of blocks destroyed, 0..100, and best clear time in seconds. */
  wallBestPct: Record<string, number>;
  /** Best time of a pass or a clear, and best time of a clear alone. */
  wallBestTime: Record<string, number>;
  wallBestClearTime: Record<string, number>;
  /** Medals in hand: one per tier's first full clear and the Free Fly milestones, minus what the captains took. */
  medals: number;
  /** Captains (chunk 13a): owned, selected, levels, kills, options, claimed Free Fly milestones. */
  captains: CaptainsState;
  highestCleared: number;
  /** Frontier grid map (chunk 15a): world seed and the passed / cleared squares, sparse. */
  frontier: FrontierSave;
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
  return {
    version: 7, credits: 0, owned, levels, ownedHulls: [STARTER_HULL], bestTier: 0, bestTime: 0, bestWave: 0, totalKills: 0, runs: 0,
    clearedTiers: [], passedTiers: [], wallBestPct: {}, wallBestTime: {}, wallBestClearTime: {}, medals: 0, highestCleared: 0, captains: defaultCaptains(),
    frontier: defaultFrontier(),
  };
}

/** A progress object with everything owned (20 of each block, level 1, all hulls). For tests and debugging. */
export function richProgress(count = 20): Progress {
  const p = defaultProgress();
  for (const id of Object.keys(p.owned)) p.owned[id] = count;
  p.ownedHulls = Object.keys(HULL_BUILDERS);
  return p;
}

/** No save can honestly hold more than this many Medals (campaign 100 + milestones 23, doubled, with room to spare). */
const MEDALS_CEILING = 100_000;
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
    // v1-v4 saves have no bestWave: it starts at 0 (their bestTime is kept, it was already Free Fly's).
    bestWave: int(r.bestWave, 0, 1e9, 0),
    totalKills: int(r.totalKills, 0, Number.MAX_SAFE_INTEGER, 0),
    runs: int(r.runs, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  // Campaign fields (absent in v1 saves: they start empty).
  const tiers: number[] = Array.isArray(r.clearedTiers) ? r.clearedTiers.filter((t: unknown) => typeof t === 'number' && Number.isInteger(t) && t >= 1 && t <= MAX_TIER) : [];
  out.clearedTiers = Array.from(new Set(tiers)).sort((a, b) => a - b);
  // v2 saves have no passedTiers: every cleared tier was passed. A cleared tier is always passed.
  const passed: number[] = Array.isArray(r.passedTiers) ? r.passedTiers.filter((t: unknown) => typeof t === 'number' && Number.isInteger(t) && t >= 1 && t <= MAX_TIER) : [];
  out.passedTiers = Array.from(new Set([...passed, ...out.clearedTiers])).sort((a, b) => a - b);
  for (const [src, dst, max] of [[r.wallBestPct, out.wallBestPct, 100], [r.wallBestTime, out.wallBestTime, 1e7], [r.wallBestClearTime, out.wallBestClearTime, 1e7]] as const) {
    if (!src || typeof src !== 'object') continue;
    for (const [k, v] of Object.entries(src as Record<string, unknown>)) {
      const t = Number(k);
      if (Number.isInteger(t) && t >= 1 && t <= MAX_TIER && typeof v === 'number' && isFinite(v) && v >= 0 && v <= max) dst[k] = v;
    }
  }
  // Saves older than v6 held one Medal per cleared tier: never trust a stored count above that. From v6 on Medals are a
  // balance (earned minus spent, Free Fly milestones included), so only a sanity ceiling applies.
  const v6 = typeof r.version === 'number' && r.version >= 6;
  out.medals = v6 ? int(r.medals, 0, MEDALS_CEILING, 0) : Math.min(out.clearedTiers.length, int(r.medals, 0, MAX_TIER, out.clearedTiers.length));
  out.captains = sanitizeCaptains(r.captains);
  // v1-v6 saves have no frontier: it starts empty (only the free origin).
  out.frontier = sanitizeFrontier(r.frontier);
  out.highestCleared = out.clearedTiers.length ? out.clearedTiers[out.clearedTiers.length - 1] : 0;
  for (const id of Object.keys(d.owned)) {
    out.owned[id] = int(r.owned?.[id], 0, 1e6, d.owned[id]);
    out.levels[id] = int(r.levels?.[id], 1, maxLevelOf(id), 1);
  }
  // Blocks that exist but are not for sale yet (hidden): only a dev cheat ever writes them; kept so they survive a reload.
  for (const id of Object.keys(BLOCKS)) {
    if (id in out.owned) continue;
    const n = int(r.owned?.[id], 1, 1e6, 0);
    if (n > 0) { out.owned[id] = n; out.levels[id] = int(r.levels?.[id], 1, maxLevelOf(id), 1); }
  }
  const hulls = Array.isArray(r.ownedHulls) ? r.ownedHulls.filter((h: unknown) => typeof h === 'string' && h in HULL_BUILDERS) : [];
  // Every save owns the Dart; hulls it already owned (the Shuttle of old saves, a bought Fan) are kept.
  // Saves older than v4 owned the Shuttle for free; it stays owned (a save with no usable hull list is just garbage).
  const legacyHulls = Array.isArray(r.ownedHulls) && !(typeof r.version === 'number' && r.version >= 4) ? ['shuttle'] : [];
  out.ownedHulls = Array.from(new Set([STARTER_HULL, ...legacyHulls, ...hulls]));
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

/** A tier is open if it is tier 1 or the tier before it has been cleared. Spikes are not skippable. */
export const isCleared = (p: Progress, tier: number) => p.clearedTiers.includes(tier);
export const isPassed = (p: Progress, tier: number) => p.passedTiers.includes(tier);
export const isUnlocked = (p: Progress, tier: number) => tier === 1 || (tier >= 2 && tier <= MAX_TIER && isPassed(p, tier - 1));
/** The first tier that is open and not cleared yet (MAX_TIER + 1 when all are cleared): where the player goes next. */
export function nextTier(p: Progress): number {
  let t = 1;
  while (t <= MAX_TIER && isPassed(p, t)) t++;
  return Math.min(t, MAX_TIER);
}

/** The Frontier opens once campaign tier MAP_UNLOCK_TIER is passed. */
export const isFrontierUnlocked = (p: Progress) => isPassed(p, MAP_UNLOCK_TIER);

export interface SquareRunResult {
  x: number;
  y: number;
  destroyed: number;
  total: number;
  credits: number;
  kills: number;
  passed?: boolean;
  medalDouble?: number;
  rand?: () => number;
}

/**
 * Books one Frontier square run (win or lose): credits and kills exactly like a campaign run, then the square's state
 * (pass / clear) and its Medal on the first clear of a medal square. A run on a square that cannot be played books the
 * credits only (it never happens through the UI).
 */
export function applyFrontierRun(p: Progress, run: SquareRunResult): SquareRunOutcome {
  const cleared = run.destroyed >= run.total;
  return applyFrontierOutcome(p, { ...run, cleared, passed: cleared || !!run.passed });
}

/**
 * Books any Frontier run by its outcome (a wall run above, or a Free Fly encounter): credits and kills as usual, then the
 * square's state and the first-clear Medal. Free Fly records (best wave / time) are not touched.
 */
export function applyFrontierOutcome(p: Progress, run: { x: number; y: number; credits: number; kills: number; cleared: boolean; passed: boolean; medalDouble?: number; rand?: () => number }): SquareRunOutcome {
  p.credits += Math.floor(run.credits);
  p.totalKills += run.kills;
  p.runs++;
  const r = applySquareRun(p.frontier, run.x, run.y, { cleared: run.cleared, passed: run.passed, medalDouble: run.medalDouble, rand: run.rand });
  p.medals += r.medals;
  return r;
}

/** The encounter outcome as a square result: cleared fills, passed and cleared both unlock, failed changes nothing. */
export const outcomeFlags = (o: EncounterOutcome) => ({ cleared: o === 'cleared', passed: o !== 'failed' });

/** A shop block that is gated by a directional unlock the player has not reached (and owns no copy of). */
export function blockLockReason(p: Progress, id: string, reach: Reach = reachBySector(p.frontier)): string | null {
  if (isBlockUnlocked(id, p.owned[id] ?? 0, reach)) return null;
  return requirementText(gateOf(id)!);
}

export interface WallRunResult {
  tier: number;
  destroyed: number;
  total: number;
  time: number;
  credits: number;
  kills: number;
  /** The ship flew past the end of the wall with blocks left. A full clear counts as passed too. */
  passed?: boolean;
  /** Captain effect: chance the first-clear Medal is doubled, and the RNG that rolls it (Math.random when absent). */
  medalDouble?: number;
  rand?: () => number;
}

/**
 * Books one campaign wall run (win or lose): credits for the blocks destroyed, the best result of the tier, and a Medal
 * the first time the tier is fully cleared. Replays pay credits but no Medal.
 */
export function applyWallRun(p: Progress, run: WallRunResult): { medal: boolean; /** Medals paid (2 when doubled). */ medals: number; medalDoubled: boolean; newBestPct: boolean; newBestTime: boolean; newlyPassed: boolean } {
  p.credits += Math.floor(run.credits);
  p.totalKills += run.kills;
  p.runs++;
  const key = String(run.tier);
  const pct = run.total > 0 ? Math.floor((run.destroyed / run.total) * 100) : 100;
  const cleared = run.destroyed >= run.total;
  const passed = cleared || !!run.passed;
  const shown = cleared ? 100 : Math.min(99, pct);
  const newBestPct = shown > (p.wallBestPct[key] ?? -1);
  if (newBestPct) p.wallBestPct[key] = shown;
  let newBestTime = false;
  let medal = false;
  let medals = 0;
  let medalDoubled = false;
  let newlyPassed = false;
  if (passed) {
    if (run.time < (p.wallBestTime[key] ?? Infinity)) { p.wallBestTime[key] = run.time; newBestTime = true; }
    if (!isPassed(p, run.tier)) {
      p.passedTiers.push(run.tier);
      p.passedTiers.sort((a, b) => a - b);
      newlyPassed = true;
    }
  }
  if (cleared) {
    if (run.time < (p.wallBestClearTime[key] ?? Infinity)) p.wallBestClearTime[key] = run.time;
    if (!isCleared(p, run.tier)) {
      p.clearedTiers.push(run.tier);
      p.clearedTiers.sort((a, b) => a - b);
      const award = rollMedals(1, run.medalDouble ?? 0, run.rand ?? Math.random);
      p.medals += award.medals;
      medals = award.medals;
      medalDoubled = award.doubled;
      medal = true;
    }
    p.highestCleared = Math.max(p.highestCleared, run.tier);
  }
  return { medal, medals, medalDoubled, newBestPct, newBestTime, newlyPassed };
}

export type BuyResult = { ok: true; price: number } | { ok: false; error: string };

export function buyCopy(p: Progress, id: string): BuyResult {
  if (!(id in p.owned)) return { ok: false, error: 'Not for sale' };
  const lock = blockLockReason(p, id);
  if (lock) return { ok: false, error: lock };
  const price = copyPrice(id, p.owned[id]);
  if (p.credits < price) return { ok: false, error: 'Not enough credits' };
  p.credits -= price;
  p.owned[id]++;
  return { ok: true, price };
}

export function buyUpgrade(p: Progress, id: string): BuyResult {
  if (!(id in p.levels)) return { ok: false, error: 'Not for sale' };
  const lock = blockLockReason(p, id);
  if (lock) return { ok: false, error: lock };
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

export interface RunResult { credits: number; kills: number; time: number; tier: number; /** Free Fly wave reached. */ wave?: number }

/** The progress object plus its storage. Every change goes through `commit()`, which saves and notifies. */
export class ProgressStore {
  data: Progress;
  private listeners = new Set<() => void>();

  /** Frontier reach per sector as of the last commit (directional unlocks), and the unlocks it produced not yet shown. */
  private reach: Reach;
  unlockNotices: string[] = [];

  constructor(private storage: StorageLike | null = null, initial?: Progress) {
    let raw: string | null = null;
    try { raw = storage?.getItem(PROGRESS_KEY) ?? null; } catch { /* storage unavailable */ }
    this.data = initial ?? loadProgress(raw);
    this.reach = reachBySector(this.data.frontier);
  }

  /** Reach per sector (cached; recomputed on every commit). */
  get frontierReach(): Reach { return this.reach; }

  /** "Unlocked: <block>" messages produced since the last call (each threshold once). */
  takeUnlockNotices(): string[] { const n = this.unlockNotices; this.unlockNotices = []; return n; }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  commit() {
    const after = reachBySector(this.data.frontier);
    for (const u of newlyReached(this.reach, after)) this.unlockNotices.push(`Unlocked: ${blockName(u.blockId)}`);
    this.reach = after;
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

  /** Books a Frontier Free Fly encounter (chunk 15b). Returns the square outcome (Medal paid on a first clear). */
  recordFrontierFly(run: { x: number; y: number; credits: number; kills: number; outcome: EncounterOutcome; medalDouble?: number; rand?: () => number }): SquareRunOutcome {
    const r = applyFrontierOutcome(this.data, { ...run, ...outcomeFlags(run.outcome) });
    this.commit();
    return r;
  }

  buyCopy(id: string): BuyResult { const r = buyCopy(this.data, id); if (r.ok) this.commit(); return r; }
  buyUpgrade(id: string): BuyResult { const r = buyUpgrade(this.data, id); if (r.ok) this.commit(); return r; }
  buyHull(id: string): BuyResult { const r = buyHull(this.data, id); if (r.ok) this.commit(); return r; }

  // ---- Captains (chunk 13a): rules live in captains/state.ts, the store commits and notifies.
  private captainAct(r: CaptainResult): CaptainResult { if (r.ok) this.commit(); return r; }
  unlockCaptain(id: string) { return this.captainAct(unlockCaptain(this.data, id)); }
  selectCaptain(id: string) { return this.captainAct(selectCaptain(this.data, id)); }
  upgradeHero(id: string) { return this.captainAct(upgradeHero(this.data, id)); }
  buyOption(optionId: string) { return this.captainAct(buyOption(this.data, optionId)); }
  activateOption(optionId: string) { return this.captainAct(activateOption(this.data, optionId)); }
  /** Lifetime kills for a captain (called in instalments by KillBanker: run end, pause, tab hidden). */
  addCaptainKills(id: string, n: number) {
    if (!(n > 0)) return;
    addCaptainKills(this.data, id, n);
    this.commit();
  }
  /** Pays a Free Fly milestone once per save; the Medals are in hand at once. */
  claimFlyMilestone(wave: number, doubleChance = 0, rand: () => number = Math.random): MedalAward | null {
    const a = claimFlyMilestone(this.data, wave, doubleChance, rand);
    if (a) this.commit();
    return a;
  }
  /** The selected captain's effects for a run that starts now. */
  runModifiers(): RunModifiers {
    const c = this.data.captains;
    return modifiersFor(c.selected, c.heroes[c.selected]);
  }

  /** Adds one finished run to the totals. Call exactly once per run. */
  recordRun(run: RunResult): { newBestTier: boolean; newBestTime: boolean; newBestWave: boolean } {
    const d = this.data;
    const newBestTier = run.tier > d.bestTier;
    const newBestTime = run.time > d.bestTime;
    const newBestWave = (run.wave ?? 0) > d.bestWave;
    if (newBestWave) d.bestWave = run.wave!;
    d.credits += Math.floor(run.credits);
    d.totalKills += run.kills;
    d.runs++;
    if (newBestTier) d.bestTier = run.tier;
    if (newBestTime) d.bestTime = run.time;
    this.commit();
    return { newBestTier, newBestTime, newBestWave };
  }

  /**
   * Banks one finished wall level (win or lose): credits, kills and the run count. With a campaign tier it also saves the
   * tier's best result and awards the first-clear Medal. Best tier and best time belong to Free Fly and are not touched.
   * Call exactly once per level (WallWorld.bank guards this).
   */
  recordWallRun(run: { credits: number; kills: number; tier?: number; square?: { x: number; y: number }; destroyed?: number; total?: number; time?: number; passed?: boolean; medalDouble?: number; rand?: () => number }): { medal: boolean; medals: number; medalDoubled: boolean } {
    let medal = false;
    let medals = 0;
    let medalDoubled = false;
    if (run.square && run.destroyed !== undefined && run.total !== undefined) {
      const r = applyFrontierRun(this.data, { ...run.square, destroyed: run.destroyed, total: run.total, credits: run.credits, kills: run.kills, passed: run.passed, medalDouble: run.medalDouble, rand: run.rand });
      medal = r.medals > 0; medals = r.medals; medalDoubled = r.medalDoubled;
    } else if (run.tier !== undefined && run.destroyed !== undefined && run.total !== undefined) {
      const r = applyWallRun(this.data, { tier: run.tier, destroyed: run.destroyed, total: run.total, time: run.time ?? 0, credits: run.credits, kills: run.kills, passed: run.passed, medalDouble: run.medalDouble, rand: run.rand });
      medal = r.medal; medals = r.medals; medalDoubled = r.medalDoubled;
    } else {
      this.data.credits += Math.floor(run.credits);
      this.data.totalKills += run.kills;
      this.data.runs++;
    }
    this.commit();
    return { medal, medals, medalDoubled };
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
