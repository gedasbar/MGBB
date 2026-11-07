// Chunk 34c: lifetime statistics. Pure (no Pixi, no storage). `Stats` is the part of the save that is COUNTED from the day it was added
// (save version 18); everything else on the Stats page is read from data the save already had (records, tiers, ring, waves, achievements).

import { BOSSES, BOSS_BY_ID } from '../data/bosses';
import { ACHIEVEMENTS } from '../data/achievements';
import { CHALLENGES } from '../data/challenges';
import { hullName } from '../data/hulls';
import { highestPassed } from '../data/tierLocks';
import { furthestRing, reachBySector } from '../frontier/unlocks';
import { fmtBig } from '../ui/format';
import { fmtPlayTime } from '../econ/playTime';
import type { Cost } from '../ui/amountLayout';
import type { Progress } from '../econ/progress';

export interface Stats {
  /** When counting began (ms since 1970): the day a new game started or the save moved to version 18. */
  since: number;
  runsCampaign: number;
  runsFrontier: number;
  runsFreeFly: number;
  /** Wall blocks destroyed and Free Fly rocks killed (a Frontier square counts by its kind). */
  blocks: number;
  rocks: number;
  /** Free Fly boss kills per boss id. */
  bossKills: Record<string, number>;
  /** Damage dealt by every shot of every run. */
  damage: number;
  /** Credits and Cores paid by runs, Medals earned by any means (clears, milestones, achievements, challenges). */
  credits: number;
  cores: number;
  medals: number;
  /** Runs per hull id. */
  hullRuns: Record<string, number>;
}

/** A counter can never honestly pass this (a hull's lifetime damage in a game of a thousand hours is far below it). */
const COUNT_CEILING = Number.MAX_VALUE;
const HULL_ID_MAX = 40;
const HULLS_KEPT = 60;

export const defaultStats = (now: number = Date.now()): Stats => ({
  since: now, runsCampaign: 0, runsFrontier: 0, runsFreeFly: 0, blocks: 0, rocks: 0, bossKills: {}, damage: 0, credits: 0, cores: 0, medals: 0, hullRuns: {},
});

const count = (v: unknown): number => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(COUNT_CEILING, Math.floor(v)) : 0);
const countMap = (raw: unknown, ok: (k: string) => boolean, cap: number): Record<string, number> => {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const n = count(v);
    if (n > 0 && ok(k) && Object.keys(out).length < cap) out[k] = n;
  }
  return out;
};

/** Untrusted data into Stats. A save from before version 18 (`raw` undefined) starts every counter at 0 with `since` = `now`. */
export function sanitizeStats(raw: unknown, now: number = Date.now()): Stats {
  const r = (raw && typeof raw === 'object' ? raw : null) as Record<string, unknown> | null;
  if (!r) return defaultStats(now);
  const since = typeof r.since === 'number' && isFinite(r.since) && r.since > 0 ? r.since : now;
  return {
    since,
    runsCampaign: count(r.runsCampaign), runsFrontier: count(r.runsFrontier), runsFreeFly: count(r.runsFreeFly),
    blocks: count(r.blocks), rocks: count(r.rocks),
    bossKills: countMap(r.bossKills, k => k in BOSS_BY_ID, BOSSES.length),
    damage: count(r.damage), credits: count(r.credits), cores: count(r.cores), medals: count(r.medals),
    hullRuns: countMap(r.hullRuns, k => k.length > 0 && k.length <= HULL_ID_MAX, HULLS_KEPT),
  };
}

/** One finished run, as the counters see it. */
export interface RunCount {
  mode: 'campaign' | 'frontier' | 'freefly';
  /** Wall blocks destroyed (wall runs) or rocks killed (Free Fly runs). */
  blocks?: number;
  rocks?: number;
  damage?: number;
  credits?: number;
  cores?: number;
  hull?: string;
  bosses?: readonly { id: string }[];
}

const add = (a: number, b: number | undefined): number => Math.min(COUNT_CEILING, a + count(b));

/** Adds one finished run to the counters. Call once per run (the store's three run-booking methods do). */
export function noteRunStats(s: Stats, run: RunCount): void {
  if (run.mode === 'campaign') s.runsCampaign++; else if (run.mode === 'frontier') s.runsFrontier++; else s.runsFreeFly++;
  s.blocks = add(s.blocks, run.blocks);
  s.rocks = add(s.rocks, run.rocks);
  s.damage = add(s.damage, run.damage);
  s.credits = add(s.credits, run.credits);
  s.cores = add(s.cores, run.cores);
  if (run.hull && run.hull.length > 0 && run.hull.length <= HULL_ID_MAX && (run.hull in s.hullRuns || Object.keys(s.hullRuns).length < HULLS_KEPT)) s.hullRuns[run.hull] = (s.hullRuns[run.hull] ?? 0) + 1;
  for (const b of run.bosses ?? []) if (b.id in BOSS_BY_ID) s.bossKills[b.id] = (s.bossKills[b.id] ?? 0) + 1;
}

/** Medals earned: called with the increase of the Medal balance (spending never counts). */
export function noteMedalsEarned(s: Stats, n: number): void { s.medals = add(s.medals, n); }

/** The hull flown most (ties: the one reached first in the map order), or null before the first counted run. */
export function favouriteHull(s: Stats): { id: string; runs: number } | null {
  let best: { id: string; runs: number } | null = null;
  for (const [id, runs] of Object.entries(s.hullRuns)) if (!best || runs > best.runs) best = { id, runs };
  return best;
}

// ------------------------------------------------------------------ the page
export interface StatRow { label: string; /** Plain text value, or an amount (icon + number). */ value: string | Cost; /** The row is counted from `since`, not read from older data. */ counted?: boolean }
export interface StatSection { title: string; rows: StatRow[] }

/** "7 Nov 2026" (fixed English format so the page and the tests do not depend on the browser's locale). */
export function fmtSince(ms: number): string {
  const d = new Date(ms);
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  return `${d.getDate()} ${m} ${d.getFullYear()}`;
}

const n = (v: number): string => fmtBig(v);

/** Every row of the Stats page, grouped. Rows marked `counted` start at 0 for a save that is older than version 18. */
export function statSections(p: Progress): StatSection[] {
  const s = p.stats;
  const fav = favouriteHull(s);
  const ring = furthestRing(reachBySector(p.frontier));
  return [
    { title: 'Time and runs', rows: [
      { label: 'Time played', value: fmtPlayTime(p.timePlayed) },
      { label: 'Runs flown (all)', value: n(p.runs) },
      { label: 'Campaign runs', value: n(s.runsCampaign), counted: true },
      { label: 'Frontier runs', value: n(s.runsFrontier), counted: true },
      { label: 'Free Fly runs', value: n(s.runsFreeFly), counted: true },
      { label: 'Favourite hull', value: fav ? `${hullName(fav.id)} (${n(fav.runs)} runs)` : '–', counted: true },
    ] },
    { title: 'Destroyed', rows: [
      { label: 'Blocks destroyed', value: n(s.blocks), counted: true },
      { label: 'Rocks killed', value: n(s.rocks), counted: true },
      ...BOSSES.map(b => ({ label: `${b.name} killed`, value: n(s.bossKills[b.id] ?? 0), counted: true })),
    ] },
    { title: 'Damage', rows: [
      { label: 'Total damage dealt', value: n(s.damage), counted: true },
      { label: 'Best shot', value: n(p.records.bestShot) },
      { label: 'Best average DPS in a run', value: n(p.records.bestAvgDps) },
    ] },
    { title: 'Progress', rows: [
      { label: 'Highest tier passed', value: n(highestPassed(p.passedTiers)) },
      { label: 'Highest tier cleared', value: n(p.highestCleared) },
      { label: 'Furthest Frontier ring', value: n(ring) },
      { label: 'Best Free Fly wave', value: n(p.bestWave) },
      { label: 'Achievements done', value: `${p.achievements.length} / ${ACHIEVEMENTS.length}` },
      { label: 'Challenges done', value: `${p.challengesDone.length} / ${CHALLENGES.length}` },
    ] },
    { title: 'Earned in all', rows: [
      { label: 'Credits', value: { kind: 'credits', text: n(s.credits) }, counted: true },
      { label: 'Cores', value: { kind: 'cores', text: n(s.cores) }, counted: true },
      { label: 'Medals', value: { kind: 'medals', text: n(s.medals) }, counted: true },
    ] },
  ];
}

/** The small line under the page: which rows are counted and from when. */
export const sinceLine = (s: Stats): string => `Rows marked * are counted since ${fmtSince(s.since)}.`;
