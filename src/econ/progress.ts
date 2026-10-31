import { MAX_TIER } from '../wall/generator';
import { applySquareRun, defaultFrontier, FrontierSave, sanitizeFrontier, SquareRunOutcome } from '../frontier/state';
import { parseKey, sqKey } from '../frontier/world';
import { MAP_UNLOCK_TIER } from '../frontier/constants';
import { EncounterOutcome } from '../frontier/encounter';
import { highestPassed, isTierUnlocked, TIER_LOCKS, tierLockOf, tierRequirementText } from '../data/tierLocks';
import { blockName, furthestRing, gateOf, isBlockUnlocked, newlyReached, Reach, reachBySector, requirementText } from '../frontier/unlocks';
import { CaptainsState, defaultCaptains, sanitizeCaptains, addCaptainKills, buyOption, activateOption, claimFlyMilestone, rollMedals, selectCaptain, unlockCaptain, upgradeHero, CaptainResult, MedalAward } from '../captains/state';
import { modifiersFor, RunModifiers } from '../captains/modifiers';
import { BLOCKS, pickerBlocks } from '../data/blocks';
import { LEGACY_MAX_LEVEL, migrateEconomyV8, migrateRemovedBlocks, refundNotice } from './migrate';
import { HULL_BUILDERS } from '../game/gridUtils';
import { STARTER_HULL } from '../data/hulls';
import { medalPriceOf } from '../data/blockEconomy';
import { buySkill, respecSkills, sanitizeSkillList, skillEffects, skillPointsFor, SkillResult } from '../skills/rules';
import {
  atCopyCap, copyPrice, DEFAULT_OWNED, HULL_PRICE, maxLevelOf, upgradePrice,
} from './economy';

export const PROGRESS_KEY = 'mgbm.progress.v1';

/** Save format version: 1 = Free Fly only, 2 adds the campaign fields, 3 adds passedTiers and wallBestClearTime, 4 adds the Dart (a free hull every save owns; hulls already owned are kept), 5 adds bestWave (Free Fly waves, chunk 10a; older saves start at 0), 6 adds `captains` (chunk 13a) and makes `medals` a spendable balance, 7 adds `frontier` (chunk 15a; older saves load with an empty Frontier), 8 is the 16c-2 economy (blocks without upgrades are reset to level 1 and refunded, copies above the new caps refunded; see econ/migrate.ts), 9 adds the best credits earned in one run per campaign tier and per Frontier square (chunk 19a; older saves start with none), 10 removes the Reverse block (chunk 21a: owned copies are refunded at their price formula, see econ/migrate.ts), 11 adds `skills` (chunk 22a: the owned skill-tree nodes; older saves start with none), 12 adds `timePlayed`, `newBlocks` and `skillPointsSeen` (chunk 24a: seconds played with the page visible; blocks unlocked and not yet looked at; skill points the player has seen. Older saves start at 0 / none / the points they already have, so nothing is marked new). The storage key stays the same; v1 saves are migrated on load. */
export const PROGRESS_VERSION = 12;

/** Everything the player keeps between runs. */
export interface Progress {
  version: 12;
  /** A one-time message for the next screen that can show it (the economy refund of the version 8 migration); cleared when taken. */
  notice?: string;
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
  /** Chunk 19a: best credits earned in ONE run (passed, cleared or crashed alike), per campaign tier (key = tier) and per Frontier square (key = "x,y", the origin included). Absent = never earned any. */
  wallBestCredits: Record<string, number>;
  squareBestCredits: Record<string, number>;
  /** Medals in hand: one per tier's first full clear and the Free Fly milestones, minus what the captains took. */
  medals: number;
  /** Captains (chunk 13a): owned, selected, levels, kills, options, claimed Free Fly milestones. */
  captains: CaptainsState;
  highestCleared: number;
  /** Frontier grid map (chunk 15a): world seed and the passed / cleared squares, sparse. */
  frontier: FrontierSave;
  /** Chunk 22a: owned skill-tree node ids (the free start node is implicit). Points come from the furthest Frontier ring. */
  skills: string[];
  /** Chunk 24a: total seconds played with the page visible (Settings shows it as hours and minutes). */
  timePlayed: number;
  /** Chunk 24a: blocks that were unlocked and whose info the player has not opened yet (they carry a NEW mark; the Shop tab has a dot). */
  newBlocks: string[];
  /** Chunk 24a: how many skill points the player has seen on the Skills tab; more points earned than this puts a dot on the tab. */
  skillPointsSeen: number;
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
    version: 12, credits: 0, owned, levels, ownedHulls: [STARTER_HULL], bestTier: 0, bestTime: 0, bestWave: 0, totalKills: 0, runs: 0,
    clearedTiers: [], passedTiers: [], wallBestPct: {}, wallBestTime: {}, wallBestClearTime: {}, wallBestCredits: {}, squareBestCredits: {}, medals: 0, highestCleared: 0, captains: defaultCaptains(),
    frontier: defaultFrontier(), skills: [], timePlayed: 0, newBlocks: [], skillPointsSeen: 0,
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
  // v9 (chunk 19a): best credits per tier and per square. Older saves have none; unusable entries are dropped.
  if (r.wallBestCredits && typeof r.wallBestCredits === 'object') {
    for (const [k, v] of Object.entries(r.wallBestCredits as Record<string, unknown>)) {
      const t = Number(k);
      if (Number.isInteger(t) && t >= 1 && t <= MAX_TIER && typeof v === 'number' && v > 0 && v <= Number.MAX_VALUE) out.wallBestCredits[k] = Math.floor(v);
    }
  }
  if (r.squareBestCredits && typeof r.squareBestCredits === 'object') {
    for (const [k, v] of Object.entries(r.squareBestCredits as Record<string, unknown>)) {
      if (parseKey(k) && typeof v === 'number' && v > 0 && v <= Number.MAX_VALUE) out.squareBestCredits[k] = Math.floor(v);
    }
  }
  // Saves older than v6 held one Medal per cleared tier: never trust a stored count above that. From v6 on Medals are a
  // balance (earned minus spent, Free Fly milestones included), so only a sanity ceiling applies.
  const v6 = typeof r.version === 'number' && r.version >= 6;
  out.medals = v6 ? int(r.medals, 0, MEDALS_CEILING, 0) : Math.min(out.clearedTiers.length, int(r.medals, 0, MAX_TIER, out.clearedTiers.length));
  out.captains = sanitizeCaptains(r.captains);
  // v1-v6 saves have no frontier: it starts empty (only the free origin).
  out.frontier = sanitizeFrontier(r.frontier);
  // v11 (chunk 22a): owned skill nodes, kept only if real, joined to the start and paid for by the furthest ring.
  out.skills = sanitizeSkillList(r.skills, skillPointsFor(furthestRing(reachBySector(out.frontier))));
  // v12 (chunk 24a): time played, the NEW marks, and the skill points already seen. A save from before has no marks and nothing new to see.
  out.timePlayed = num(r.timePlayed, 0, 0);
  const points = skillPointsFor(furthestRing(reachBySector(out.frontier)));
  out.skillPointsSeen = typeof r.version === 'number' && r.version >= 12 ? int(r.skillPointsSeen, 0, 1e9, 0) : points;
  out.newBlocks = typeof r.version === 'number' && r.version >= 12 && Array.isArray(r.newBlocks) ? Array.from(new Set(r.newBlocks.filter((id: unknown): id is string => typeof id === 'string' && id in BLOCKS))) : [];
  out.highestCleared = out.clearedTiers.length ? out.clearedTiers[out.clearedTiers.length - 1] : 0;
  // A save older than v8 still holds the levels of blocks that lost them: read them with the old ceiling so the migration can refund them.
  const migrating = !(typeof r.version === 'number' && r.version >= 8);
  const levelCeiling = (id: string) => (migrating ? LEGACY_MAX_LEVEL : maxLevelOf(id));
  for (const id of Object.keys(d.owned)) {
    out.owned[id] = int(r.owned?.[id], 0, 1e6, d.owned[id]);
    out.levels[id] = int(r.levels?.[id], 1, levelCeiling(id), 1);
  }
  // Blocks that exist but are not for sale yet (hidden): only a dev cheat ever writes them; kept so they survive a reload.
  for (const id of Object.keys(BLOCKS)) {
    if (id in out.owned) continue;
    const n = int(r.owned?.[id], 1, 1e6, 0);
    if (n > 0) { out.owned[id] = n; out.levels[id] = int(r.levels?.[id], 1, levelCeiling(id), 1); }
  }
  // Saves older than v8 (chunk 16c-2): upgrades that no longer exist are refunded, copies above the new caps too.
  if (!(typeof r.version === 'number' && r.version >= 8)) {
    const refund = migrateEconomyV8(out.owned, out.levels);
    out.credits += refund.credits;
    const note = refundNotice(refund);
    if (note) out.notice = note;
  } else if (typeof r.notice === 'string' && r.notice.length < 400) out.notice = r.notice;
  // Saves older than v10 (chunk 21a): copies of blocks taken out of the game are refunded (the block itself is not in `out.owned`, so it is gone).
  if (!(typeof r.version === 'number' && r.version >= 10) && r.owned && typeof r.owned === 'object') {
    const removed = migrateRemovedBlocks(r.owned as Record<string, unknown>);
    out.credits += removed.credits;
    if (removed.notice) out.notice = out.notice ? `${out.notice} ${removed.notice}` : removed.notice;
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

interface SquareRunResult {
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
function applyFrontierRun(p: Progress, run: SquareRunResult): SquareRunOutcome & { newBestEarnings: boolean } {
  const cleared = run.destroyed >= run.total;
  return applyFrontierOutcome(p, { ...run, cleared, passed: cleared || !!run.passed });
}

/**
 * Books any Frontier run by its outcome (a wall run above, or a Free Fly encounter): credits and kills as usual, then the
 * square's state and the first-clear Medal. Free Fly records (best wave / time) are not touched.
 */
function applyFrontierOutcome(p: Progress, run: { x: number; y: number; credits: number; kills: number; cleared: boolean; passed: boolean; medalDouble?: number; rand?: () => number }): SquareRunOutcome & { newBestEarnings: boolean } {
  p.credits += Math.floor(run.credits);
  p.totalKills += run.kills;
  p.runs++;
  const r = applySquareRun(p.frontier, run.x, run.y, { cleared: run.cleared, passed: run.passed, medalDouble: run.medalDouble, rand: run.rand });
  p.medals += r.medals;
  // A run on a square that cannot be played (r.ok false) never happens through the UI and keeps no record.
  return { ...r, newBestEarnings: r.ok && noteBestCredits(p.squareBestCredits, sqKey(run.x, run.y), run.credits) };
}

/** Chunk 19a: keeps `credits` (whole) under `key` when it beats the stored best. Returns whether it did; nothing earned is never a record. */
export function noteBestCredits(best: Record<string, number>, key: string, credits: number): boolean {
  const c = Math.floor(credits);
  if (!(c > 0) || c <= (best[key] ?? 0)) return false;
  best[key] = c;
  return true;
}

/** The encounter outcome as a square result: cleared fills, passed and cleared both unlock, failed changes nothing. */
const outcomeFlags = (o: EncounterOutcome) => ({ cleared: o === 'cleared', passed: o !== 'failed' });

/** A shop block that is locked: by a Frontier ring (legendary blocks) or by a campaign tier (chunk 20b), and the player owns no copy of it. */
export function blockLockReason(p: Progress, id: string, reach: Reach = reachBySector(p.frontier)): string | null {
  const owned = p.owned[id] ?? 0;
  if (!isBlockUnlocked(id, owned, reach)) return requirementText(gateOf(id)!);
  if (!isTierUnlocked(id, owned, p.passedTiers, reach)) return tierRequirementText(tierLockOf(id)!);
  return null;
}

/** Chunk 24a: the run summary's "Unlocked" line: block names (at most UNLOCK_NAMES_SHOWN, then "and N more") and new skill points. Empty when there is nothing. */
export const UNLOCK_NAMES_SHOWN = 6;
export function unlockSummary(blocks: readonly string[], skillPoints: number): string {
  const parts: string[] = [];
  if (blocks.length > 0) {
    const shown = blocks.slice(0, UNLOCK_NAMES_SHOWN).join(', ');
    parts.push(blocks.length > UNLOCK_NAMES_SHOWN ? `${shown} and ${blocks.length - UNLOCK_NAMES_SHOWN} more` : shown);
  }
  if (skillPoints > 0) parts.push(`+${skillPoints} skill point${skillPoints === 1 ? '' : 's'}`);
  return parts.length ? `Unlocked: ${parts.join(', ')}` : '';
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
export function applyWallRun(p: Progress, run: WallRunResult): { medal: boolean; /** Medals paid (2 when doubled). */ medals: number; medalDoubled: boolean; newBestPct: boolean; newBestTime: boolean; newlyPassed: boolean; newBestEarnings: boolean } {
  p.credits += Math.floor(run.credits);
  p.totalKills += run.kills;
  p.runs++;
  const key = String(run.tier);
  const newBestEarnings = noteBestCredits(p.wallBestCredits, key, run.credits);
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
  return { medal, medals, medalDoubled, newBestPct, newBestTime, newlyPassed, newBestEarnings };
}

export type BuyResult = { ok: true; price: number } | { ok: false; error: string };

export function buyCopy(p: Progress, id: string): BuyResult {
  if (!(id in p.owned)) return { ok: false, error: 'Not for sale' };
  const lock = blockLockReason(p, id);
  if (lock) return { ok: false, error: lock };
  if (atCopyCap(id, p.owned[id], skillEffects(p.skills))) return { ok: false, error: `Max copies of ${BLOCKS[id]?.name ?? id}` };
  const price = copyPrice(id, p.owned[id]);
  const medals = medalPriceOf(id);
  if (p.credits < price) return { ok: false, error: 'Not enough credits' };
  // Legendary blocks (chunk 20a) cost Medals on top of the credits; both are checked before either is taken.
  if (p.medals < medals) return { ok: false, error: 'Not enough Medals' };
  p.credits -= price;
  p.medals -= medals;
  p.owned[id]++;
  return { ok: true, price };
}

export function buyUpgrade(p: Progress, id: string): BuyResult {
  if (!(id in p.levels)) return { ok: false, error: 'Not for sale' };
  const lock = blockLockReason(p, id);
  if (lock) return { ok: false, error: lock };
  const level = p.levels[id];
  if (maxLevelOf(id) <= 1) return { ok: false, error: 'This block has no upgrades' };
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

export interface RunResult { credits: number; kills: number; time: number; tier: number; /** Free Fly wave reached. */ wave?: number; /** Chunk 21a: the run's largest hit and total damage (shown on the summary, never saved). */ shots?: { bestShot: number; totalDamage: number } }

/** The progress object plus its storage. Every change goes through `commit()`, which saves and notifies. */
export class ProgressStore {
  data: Progress;
  private listeners = new Set<() => void>();

  /** Frontier reach per sector as of the last commit (directional unlocks), and the unlocks it produced not yet shown. */
  private reach: Reach;
  /** Highest passed tier as of the last commit (tier-locked blocks, chunk 20b). */
  private tierReach: number;
  unlockNotices: string[] = [];
  /** Chunk 24a: skill points earned since the last takeRunUnlocks (the run summary lists them with the unlocked blocks). */
  private pendingSkillPoints = 0;
  /** Skill points as of the last commit. */
  private skillPts: number;

  constructor(private storage: StorageLike | null = null, initial?: Progress) {
    let raw: string | null = null;
    try { raw = storage?.getItem(PROGRESS_KEY) ?? null; } catch { /* storage unavailable */ }
    this.data = initial ?? loadProgress(raw);
    this.reach = reachBySector(this.data.frontier);
    this.tierReach = highestPassed(this.data.passedTiers);
    this.skillPts = skillPointsFor(furthestRing(this.reach));
  }

  /** Reach per sector (cached; recomputed on every commit). */
  get frontierReach(): Reach { return this.reach; }

  /** The one-time economy message of a migrated save, once (null afterwards). */
  takeNotice(): string | null {
    const n = this.data.notice ?? null;
    if (n !== null) { delete this.data.notice; this.commit(); }
    return n;
  }

  /** "Unlocked: <block>" messages produced since the last call (each threshold once). */
  takeUnlockNotices(): string[] { const n = this.unlockNotices; this.unlockNotices = []; return n; }

  /**
   * Chunk 24a: what the runs since the last call unlocked, for the run summary: block names and new skill points. Taken once. (The
   * Frontier and Skills screens no longer show these as toasts: a Frontier that opens used to queue a toast for every block at once.)
   */
  takeRunUnlocks(): { blocks: string[]; skillPoints: number } {
    const blocks = this.unlockNotices.map(n => n.replace(/^Unlocked: /, ''));
    const out = { blocks, skillPoints: this.pendingSkillPoints };
    this.unlockNotices = [];
    this.pendingSkillPoints = 0;
    return out;
  }

  /** The player opened this block's info: its NEW mark goes away. */
  markBlockSeen(id: string) {
    const i = this.data.newBlocks.indexOf(id);
    if (i < 0) return;
    this.data.newBlocks.splice(i, 1);
    this.commit();
  }

  /** Skill points earned in all, and whether the player has not seen them all on the Skills tab yet (the tab's dot). */
  get skillPointsEarned(): number { return this.skillPts; }
  get skillsDot(): boolean { return this.skillPts > this.data.skillPointsSeen; }
  get shopDot(): boolean { return this.data.newBlocks.length > 0; }
  /** The Skills tab was opened: the points are seen. */
  markSkillsSeen() {
    if (this.data.skillPointsSeen >= this.skillPts) return;
    this.data.skillPointsSeen = this.skillPts;
    this.commit();
  }

  /** Chunk 24a: adds seconds played (the page was visible). Saved by flushPlayTime, not on every call. */
  addPlayTime(seconds: number) {
    if (seconds > 0 && isFinite(seconds)) this.data.timePlayed += seconds;
  }
  flushPlayTime() { this.commit(); }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private noteUnlockedBlock(id: string) {
    this.unlockNotices.push(`Unlocked: ${blockName(id)}`);
    if (!this.data.newBlocks.includes(id)) this.data.newBlocks.push(id);
  }

  commit() {
    const after = reachBySector(this.data.frontier);
    for (const u of newlyReached(this.reach, after)) this.noteUnlockedBlock(u.blockId);
    this.reach = after;
    // Passing a tier unlocks its blocks (announced once; a block the save already owns is not).
    const tierNow = highestPassed(this.data.passedTiers);
    if (tierNow > this.tierReach) {
      for (const [id, t] of Object.entries(TIER_LOCKS)) {
        if (t > this.tierReach && t <= tierNow && !(this.data.owned[id] > 0)) this.noteUnlockedBlock(id);
      }
    }
    this.tierReach = tierNow;
    // A further Frontier ring earns skill points (the run summary says so; the Skills tab gets a dot until it is opened).
    const pts = skillPointsFor(furthestRing(after));
    if (pts > this.skillPts) this.pendingSkillPoints += pts - this.skillPts;
    this.skillPts = pts;
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
  recordFrontierFly(run: { x: number; y: number; credits: number; kills: number; outcome: EncounterOutcome; medalDouble?: number; rand?: () => number }): SquareRunOutcome & { newBestEarnings: boolean } {
    const r = applyFrontierOutcome(this.data, { ...run, medalDouble: this.squareMedalChance(run.medalDouble), ...outcomeFlags(run.outcome) });
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
    const m = modifiersFor(c.selected, c.heroes[c.selected]);
    const skills = skillEffects(this.data.skills);
    // Salvage (chunk 22a): +x% credits per legendary block owned, in every mode.
    const legendary = Object.keys(this.data.owned).filter(id => BLOCKS[id]?.category === 'legendary' && this.data.owned[id] > 0).length;
    m.creditMul += skills.legendaryCredits * legendary;
    return { ...m, furthestRing: furthestRing(this.reach), skills };
  }

  /** Medal squares (chunk 22a, Salvage): the captain's double chance plus the skill's chance of one extra Medal. */
  private squareMedalChance(captain = 0): number { return Math.min(1, captain + skillEffects(this.data.skills).medalSquareExtra); }

  // ---- Skills (chunk 22a): rules live in skills/rules.ts, the store commits and notifies.
  /** The ring that pays skill points: the furthest passed or cleared Frontier square in any direction (what Frontier Echo reads). */
  get skillRing(): number { return furthestRing(this.reach); }
  buySkill(id: string): SkillResult { const r = buySkill(this.data, this.skillRing, id); if (r.ok) this.commit(); return r; }
  respecSkills(): SkillResult { const r = respecSkills(this.data); if (r.ok) this.commit(); return r; }

  /**
   * Salvage credit bonus (chunk 22a) for a finished level: a replay of a level cleared before pays more, and so does a run that beats the
   * level's best earnings (the first run has nothing to beat). Both add. `key` is the tier number or the square key.
   */
  creditBonusMul(kind: 'tier' | 'square', key: string, credits: number): number {
    const sk = skillEffects(this.data.skills);
    if (sk.replayCredits === 0 && sk.recordCredits === 0) return 1;
    const d = this.data;
    const cleared = kind === 'tier' ? d.clearedTiers.includes(Number(key)) : d.frontier.sq[key] === 2;
    const best = (kind === 'tier' ? d.wallBestCredits : d.squareBestCredits)[key] ?? 0;
    return 1 + (cleared ? sk.replayCredits : 0) + (best > 0 && credits > best ? sk.recordCredits : 0);
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
  recordWallRun(run: { credits: number; kills: number; tier?: number; square?: { x: number; y: number }; destroyed?: number; total?: number; time?: number; passed?: boolean; medalDouble?: number; rand?: () => number }): { medal: boolean; medals: number; medalDoubled: boolean; newBestEarnings: boolean } {
    let newBestEarnings = false;
    let medal = false;
    let medals = 0;
    let medalDoubled = false;
    if (run.square && run.destroyed !== undefined && run.total !== undefined) {
      const r = applyFrontierRun(this.data, { ...run.square, medalDouble: this.squareMedalChance(run.medalDouble), destroyed: run.destroyed, total: run.total, credits: run.credits, kills: run.kills, passed: run.passed, rand: run.rand });
      medal = r.medals > 0; medals = r.medals; medalDoubled = r.medalDoubled; newBestEarnings = r.newBestEarnings;
    } else if (run.tier !== undefined && run.destroyed !== undefined && run.total !== undefined) {
      const r = applyWallRun(this.data, { tier: run.tier, destroyed: run.destroyed, total: run.total, time: run.time ?? 0, credits: run.credits, kills: run.kills, passed: run.passed, medalDouble: run.medalDouble, rand: run.rand });
      medal = r.medal; medals = r.medals; medalDoubled = r.medalDoubled; newBestEarnings = r.newBestEarnings;
    } else {
      this.data.credits += Math.floor(run.credits);
      this.data.totalKills += run.kills;
      this.data.runs++;
    }
    this.commit();
    return { medal, medals, medalDoubled, newBestEarnings };
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
