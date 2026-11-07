// Chunk 35a: the daily quests and the daily run. Pure rules (no Pixi, no storage, no clock: the caller passes the day key).
// The day's content is a function of the date (and, for the quests, of the progress when the day was drawn); it is stored in the save the first time
// it is needed, so it cannot change during the day. A new day (a different key, in either direction) draws again.
import { Mulberry32 } from '../rng';
import { daysBetween, dayKey, isDayKey, seedOfDay, shiftDay } from './clock';
import { CLASSIC_TIERS } from '../data/lateTiers';
import { MAP_UNLOCK_TIER } from '../frontier/constants';
import { customSlotOf } from '../shipyard/constants';
import { highestPassed } from '../data/tierLocks';
import {
  DAILY_ALL_BONUS, DAILY_QUEST_COUNT, DAILY_REROLLS, QUESTS, QUEST_BY_KIND, QuestCtx, QuestDef, QuestKind, QuestReward,
} from '../data/dailyQuests';
import { HISTORY_DAYS, RUN_TIERS, TWISTS, TwistDef } from '../data/dailyRun';
import type { Progress } from '../econ/progress';

export interface DailyQuest {
  kind: QuestKind;
  /** The goal (N) and the progress towards it. */
  n: number;
  progress: number;
  /** Hull id of a "clear a tier with ..." quest. */
  hull?: string;
  done: boolean;
  /** The reward, fixed when the quest was drawn (retuning the data file does not change a quest already on the card). */
  medals: number;
  cores: number;
}

export interface DailySave {
  /** The day the quests and the run state belong to; '' before the first day. */
  day: string;
  quests: DailyQuest[];
  /** The one free reroll of today was used. */
  rerolled: boolean;
  /** The bonus for all three quests was paid today. */
  bonusPaid: boolean;
  /** Today's best wave in the daily run, and the reward tiers (their wave numbers) already paid today. */
  runBest: number;
  runPaid: number[];
  /** Best wave of earlier days (no entry = no run that day), ascending, only the days the history still shows. */
  history: { day: string; best: number }[];
}

export const defaultDaily = (): DailySave => ({ day: '', quests: [], rerolled: false, bonusPaid: false, runBest: 0, runPaid: [], history: [] });

// ------------------------------------------------------------------ sanitize
const HULL_ID_MAX = 40;
const wholeIn = (v: unknown, lo: number, hi: number): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);

/** Untrusted data into a DailySave. Never throws; anything unusable is dropped (a save from before version 19 has none). */
export function sanitizeDaily(raw: unknown): DailySave {
  const d = defaultDaily();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Record<string, unknown>;
  if (!isDayKey(r.day)) return d;
  d.day = r.day;
  if (Array.isArray(r.quests)) {
    for (const q of r.quests as Record<string, unknown>[]) {
      if (d.quests.length >= DAILY_QUEST_COUNT || !q || typeof q !== 'object') continue;
      const kind = q.kind as QuestKind;
      const n = wholeIn(q.n, 1, 1e12);
      if (!(typeof kind === 'string' && kind in QUEST_BY_KIND) || n === null || d.quests.some(o => o.kind === kind)) continue;
      const progress = typeof q.progress === 'number' && isFinite(q.progress) && q.progress >= 0 ? Math.min(q.progress, n) : 0;
      const hull = typeof q.hull === 'string' && q.hull.length > 0 && q.hull.length <= HULL_ID_MAX ? q.hull : undefined;
      if (kind === 'hull_clear' && !hull) continue;
      d.quests.push({ kind, n, progress, ...(hull ? { hull } : {}), done: q.done === true && progress >= n, medals: wholeIn(q.medals, 0, 1e6) ?? 0, cores: wholeIn(q.cores, 0, 1e9) ?? 0 });
    }
  }
  d.rerolled = r.rerolled === true;
  d.bonusPaid = r.bonusPaid === true && d.quests.length === DAILY_QUEST_COUNT && d.quests.every(q => q.done);
  d.runBest = wholeIn(r.runBest, 0, 1e6) ?? 0;
  if (Array.isArray(r.runPaid)) d.runPaid = Array.from(new Set((r.runPaid as unknown[]).filter((w): w is number => RUN_TIERS.some(t => t.wave === w)))).sort((a, b) => a - b);
  if (Array.isArray(r.history)) {
    const seen = new Set<string>();
    for (const h of r.history as Record<string, unknown>[]) {
      const best = h && typeof h === 'object' ? wholeIn(h.best, 1, 1e6) : null;
      if (best !== null && isDayKey(h.day) && h.day < d.day && !seen.has(h.day as string)) { seen.add(h.day as string); d.history.push({ day: h.day as string, best }); }
    }
    d.history.sort((a, b) => (a.day < b.day ? -1 : 1));
    d.history = d.history.slice(-HISTORY_DAYS);
  }
  return d;
}

// ------------------------------------------------------------------ the day's content
/** What the quest pool reads from the player. */
export function questCtx(p: Progress): QuestCtx {
  const runs = p.stats.runsCampaign + p.stats.runsFrontier + p.stats.runsFreeFly;
  return {
    highestPassed: highestPassed(p.passedTiers),
    frontierOpen: p.passedTiers.includes(MAP_UNLOCK_TIER),
    lateOpen: p.clearedTiers.filter(t => t >= 1 && t <= CLASSIC_TIERS).length >= CLASSIC_TIERS,
    bestWave: p.bestWave,
    hulls: p.ownedHulls.filter(h => customSlotOf(h) < 0),
    avgRunDamage: runs > 0 ? p.stats.damage / runs : 0,
  };
}

function pickKind(pool: QuestDef[], rnd: Mulberry32): QuestDef {
  let total = 0;
  for (const q of pool) total += q.weight;
  let x = rnd.next() * total;
  for (const q of pool) { x -= q.weight; if (x < 0) return q; }
  return pool[pool.length - 1];
}

function makeQuest(def: QuestDef, ctx: QuestCtx, rnd: Mulberry32): DailyQuest {
  const n = Math.max(1, Math.floor(def.goal(ctx)));
  const hull = def.kind === 'hull_clear' ? ctx.hulls[Math.floor(rnd.next() * ctx.hulls.length)] : undefined;
  const r = def.reward(ctx);
  return { kind: def.kind, n, progress: 0, ...(hull ? { hull } : {}), done: false, medals: r.medals ?? 0, cores: r.cores ?? 0 };
}

/** The quests of day `day` for a player like `ctx`: DAILY_QUEST_COUNT different kinds, only ones the player has unlocked. Same inputs, same quests. */
export function rollQuests(day: string, ctx: QuestCtx): DailyQuest[] {
  const rnd = new Mulberry32(seedOfDay(day, 'quests'));
  const pool = QUESTS.filter(q => q.weight > 0 && q.available(ctx));
  const out: DailyQuest[] = [];
  while (out.length < DAILY_QUEST_COUNT && pool.length > 0) {
    const def = pickKind(pool, rnd);
    pool.splice(pool.indexOf(def), 1);
    out.push(makeQuest(def, ctx, rnd));
  }
  return out;
}

/** The twist of the daily run of `day`. Days are dealt from a shuffled deck of all twists (a new shuffle every TWISTS.length days), so no twist repeats within a round, and never twice in a row. */
export function twistOf(day: string): TwistDef {
  const n = TWISTS.length;
  const num = daysBetween('1970-01-01', day);
  const round = Math.floor(num / n);
  const deck = (k: number): number[] => {
    const a = TWISTS.map((_, i) => i);
    const rnd = new Mulberry32(seedOfDay(String(k), 'twist-deck'));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd.next() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const cur = deck(round);
  // A round never starts with the twist the previous round ended on (the last card of a deck is never moved by this swap).
  if (n > 2 && cur[0] === deck(round - 1)[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return TWISTS[cur[((num % n) + n) % n]];
}

/** The seed of the daily run's waves: the same all day, different on another day. */
export const runSeedOf = (day: string): number => seedOfDay(day, 'run') & 0x7fffffff;

// ------------------------------------------------------------------ the day rolls over
/**
 * Makes `p.daily` the state of `today`. A different day key (a later one, or an earlier one when the device clock moved back) draws new quests and clears the run state;
 * the best wave of the day just ended joins the history. Returns whether anything changed (the caller commits).
 */
export function ensureDay(p: Progress, today: string): boolean {
  const d = p.daily;
  if (d.day === today) return false;
  const history = d.history.slice();
  if (d.day && d.runBest > 0 && !history.some(h => h.day === d.day)) history.push({ day: d.day, best: d.runBest });
  const kept = history.filter(h => { const ago = daysBetween(h.day, today); return ago >= 1 && ago <= HISTORY_DAYS - 1; }).sort((a, b) => (a.day < b.day ? -1 : 1));
  p.daily = { day: today, quests: rollQuests(today, questCtx(p)), rerolled: false, bonusPaid: false, runBest: 0, runPaid: [], history: kept };
  return true;
}

// ------------------------------------------------------------------ progress
/** Things a finished run (or a moment of one) reports; one entry per kind of count. */
export type DailyEvent =
  | { kind: 'blocks' | 'rocks' | 'crystals' | 'tiers' | 'late_tiers' | 'boss' | 'squares' | 'damage'; n: number }
  | { kind: 'hull_clear'; hull: string }
  /** The highest wave this run reached (Free Fly), and the same for a run in which the hull was never hit. */
  | { kind: 'wave' | 'no_hit'; wave: number };

const payReward = (p: Progress, r: QuestReward) => { p.medals += r.medals ?? 0; p.cores += r.cores ?? 0; };
export const rewardText = (r: QuestReward): string => [r.medals ? `${r.medals} Medal${r.medals === 1 ? '' : 's'}` : '', r.cores ? `${r.cores} Cores` : ''].filter(Boolean).join(' + ');

/**
 * Applies run events to today's quests. A finished quest pays its reward at once (once: `done` is kept), and the bonus is paid on the day the third one finishes.
 * Returns one short line per thing that was paid ("Daily quest done: +12 Cores"), for the run summary.
 */
export function noteEvents(p: Progress, today: string, events: readonly DailyEvent[]): { notes: string[]; changed: boolean } {
  const notes: string[] = [];
  let changed = ensureDay(p, today);
  for (const q of p.daily.quests) {
    if (q.done) continue;
    let progress = q.progress;
    for (const e of events) {
      if (e.kind !== q.kind) continue;
      if (e.kind === 'hull_clear') { if (e.hull === q.hull) progress += 1; }
      else if ('wave' in e) progress = Math.max(progress, e.wave);
      else if ('n' in e && e.n > 0 && isFinite(e.n)) progress += e.n;
    }
    progress = Math.min(q.n, progress);
    if (progress === q.progress) continue;
    q.progress = progress;
    changed = true;
    if (progress >= q.n) {
      q.done = true;
      payReward(p, q);
      notes.push(`Daily quest done: +${rewardText(q)}`);
    }
  }
  const d = p.daily;
  if (!d.bonusPaid && d.quests.length === DAILY_QUEST_COUNT && d.quests.every(q => q.done)) {
    d.bonusPaid = true;
    payReward(p, DAILY_ALL_BONUS);
    notes.push(`All daily quests done: +${rewardText(DAILY_ALL_BONUS)}`);
    changed = true;
  }
  return { notes, changed };
}

export type RerollResult = { ok: true } | { ok: false; error: string };

/** Replaces quest `index` of today by a new quest of another kind, once a day, while it is not done. */
export function rerollQuest(p: Progress, today: string, index: number): RerollResult {
  ensureDay(p, today);
  const d = p.daily;
  const q = d.quests[index];
  if (!q) return { ok: false, error: 'No such quest' };
  if (d.rerolled || DAILY_REROLLS < 1) return { ok: false, error: 'Reroll already used today' };
  if (q.done) return { ok: false, error: 'This quest is done' };
  const ctx = questCtx(p);
  const taken = new Set(d.quests.map(o => o.kind));
  const pool = QUESTS.filter(def => def.weight > 0 && def.available(ctx) && !taken.has(def.kind));
  if (pool.length === 0) return { ok: false, error: 'No other quest fits yet' };
  const rnd = new Mulberry32(seedOfDay(today, `reroll${index}`));
  d.quests[index] = makeQuest(pickKind(pool, rnd), ctx, rnd);
  d.rerolled = true;
  return { ok: true };
}

// ------------------------------------------------------------------ the daily run
export interface DailyRunMarks { best: number; newBest: boolean; /** The reward tiers paid by this run, with their text. */ paid: { wave: number; text: string }[]; cores: number; medals: number }

/** Books a finished daily run that reached `wave`: today's best, and each reward tier reached for the first time today. */
export function noteDailyRun(p: Progress, today: string, wave: number): DailyRunMarks {
  ensureDay(p, today);
  const d = p.daily;
  const w = Math.max(1, Math.floor(wave));
  const newBest = w > d.runBest;
  if (newBest) d.runBest = w;
  const paid: DailyRunMarks['paid'] = [];
  let cores = 0, medals = 0;
  for (const t of RUN_TIERS) {
    if (w < t.wave || d.runPaid.includes(t.wave)) continue;
    d.runPaid.push(t.wave);
    payReward(p, t);
    cores += t.cores; medals += t.medals ?? 0;
    paid.push({ wave: t.wave, text: rewardText(t) });
  }
  d.runPaid.sort((a, b) => a - b);
  return { best: d.runBest, newBest, paid, cores, medals };
}

/** The history the screen shows: the last HISTORY_DAYS days, oldest first, today last; `best` 0 = no run that day. */
export function historyView(d: DailySave, today: string): { day: string; best: number }[] {
  const out: { day: string; best: number }[] = [];
  for (let i = HISTORY_DAYS - 1; i >= 0; i--) {
    const day = shiftDay(today, i);
    out.push({ day, best: i === 0 ? (d.day === today ? d.runBest : 0) : (d.history.find(h => h.day === day)?.best ?? 0) });
  }
  return out;
}

/** The three lines of a wall / Free Fly / Frontier run as events (the store books them; kept here so every mode reads the same table). */
export function freeFlyEvents(r: { daily?: boolean; kills: number; wave?: number; shots?: { totalDamage: number }; crystals?: { collected: number }; bosses?: readonly unknown[]; noHit?: boolean }): DailyEvent[] {
  const e: DailyEvent[] = [{ kind: 'rocks', n: r.kills }, { kind: 'damage', n: r.shots?.totalDamage ?? 0 }, { kind: 'crystals', n: r.crystals?.collected ?? 0 }, { kind: 'boss', n: r.bosses?.length ?? 0 }];
  if (r.daily) return e; // the daily run has twists: only counts of things destroyed, never "reach wave N"
  const wave = Math.max(1, r.wave ?? 1);
  e.push({ kind: 'wave', wave });
  if (r.noHit) e.push({ kind: 'no_hit', wave });
  return e;
}
export function wallEvents(r: { kills: number; shots?: { totalDamage: number }; tier?: number; square?: boolean; passed: boolean; cleared: boolean; hull?: string }): DailyEvent[] {
  const e: DailyEvent[] = [{ kind: 'blocks', n: r.kills }, { kind: 'damage', n: r.shots?.totalDamage ?? 0 }];
  if (r.square) { if (r.passed) e.push({ kind: 'squares', n: 1 }); return e; }
  if (r.passed && r.tier !== undefined) { e.push({ kind: 'tiers', n: 1 }); if ((r.tier ?? 0) > CLASSIC_TIERS) e.push({ kind: 'late_tiers', n: 1 }); }
  if (r.cleared && r.hull) e.push({ kind: 'hull_clear', hull: r.hull });
  return e;
}
export function frontierFlyEvents(r: { kills: number; shots?: { totalDamage: number }; crystals?: number; passed: boolean }): DailyEvent[] {
  const e: DailyEvent[] = [{ kind: 'rocks', n: r.kills }, { kind: 'damage', n: r.shots?.totalDamage ?? 0 }, { kind: 'crystals', n: r.crystals ?? 0 }];
  if (r.passed) e.push({ kind: 'squares', n: 1 });
  return e;
}

/** A one-line status for the carousel card: "2 / 3 quests · FOG". Reads the save without drawing a new day. */
export function dailyCardLine(p: Progress, today: string): string {
  const d = p.daily;
  const twist = twistOf(today).name;
  if (d.day !== today) return `3 new quests · ${twist}`;
  return `${d.quests.filter(q => q.done).length} / ${d.quests.length} quests · ${twist}`;
}

export { dayKey };
