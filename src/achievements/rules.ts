// Chunk 28a: achievement rules. Pure functions over the save (no storage, no screens), so they can be unit-tested; ProgressStore calls them
// after every commit. The list itself is data (src/data/achievements.ts).

import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, AchievementDef, AchievementMetric, Cosmetic, FILL_MIN_CELLS } from '../data/achievements';
import { BLOCKS } from '../data/blocks';
import { HULL_ORDER } from '../data/hulls';
import { lateSlot, LATE_FIRST, LATE_LAST, CLASSIC_TIERS } from '../data/lateTiers';
import { highestPassed } from '../data/tierLocks';
import { furthestRing, reachBySector, UNLOCK_SECTORS } from '../frontier/unlocks';
import { avgDps } from '../ui/runStats';
import type { Progress } from '../econ/progress';

/** Records the save keeps that nothing else in it can rebuild (a run's best hit, a circuit's size). */
export interface Records {
  /** Largest single hit of one run, and the best average DPS of one run (finite, whole). */
  bestShot: number;
  bestAvgDps: number;
  /** Most blocks placed in one circuit, and whether a circuit ever filled a whole hull (1 = yes). */
  maxCircuitBlocks: number;
  hullFilled: number;
}

export const defaultRecords = (): Records => ({ bestShot: 0, bestAvgDps: 0, maxCircuitBlocks: 0, hullFilled: 0 });

const finiteMax = (v: unknown): number => (typeof v === 'number' && v > 0 ? Math.min(Number.MAX_VALUE, Math.floor(v)) : 0);

/** Untrusted data into Records: anything unusable is 0. */
export function sanitizeRecords(raw: unknown): Records {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    bestShot: finiteMax(r.bestShot),
    bestAvgDps: finiteMax(r.bestAvgDps),
    maxCircuitBlocks: Math.min(1000, finiteMax(r.maxCircuitBlocks)),
    hullFilled: r.hullFilled === 1 ? 1 : 0,
  };
}

/** A finished run: its largest hit and total damage (RunStats) and how long it lasted. Keeps the records. */
export function noteRunRecords(rec: Records, shots: { bestShot: number; totalDamage: number } | undefined, time: number) {
  if (!shots) return;
  rec.bestShot = Math.max(rec.bestShot, finiteMax(shots.bestShot));
  rec.bestAvgDps = Math.max(rec.bestAvgDps, finiteMax(avgDps(shots.totalDamage, time)));
}

/** A circuit as it stands: `blocks` placed, of `buildable` empty cells in the hull. */
export function noteCircuitRecords(rec: Records, blocks: number, buildable: number) {
  rec.maxCircuitBlocks = Math.max(rec.maxCircuitBlocks, blocks);
  if (buildable >= FILL_MIN_CELLS && blocks >= buildable) rec.hullFilled = 1;
}

// ------------------------------------------------------------------ metrics
const ordinaryIds = () => Object.values(BLOCKS).filter(b => b.shown && b.category !== 'legendary').map(b => b.id);
const legendaryIds = () => Object.values(BLOCKS).filter(b => b.shown && b.category === 'legendary').map(b => b.id);

/** The size of the whole set a metric counts in, for goals written as 'all'. */
export function metricTotal(metric: AchievementMetric): number {
  if (metric === 'hullsOwned') return HULL_ORDER.length;
  if (metric === 'ordinaryOwned') return ordinaryIds().length;
  if (metric === 'legendaryOwned') return legendaryIds().length;
  return 1;
}

export function metricValue(p: Progress, metric: AchievementMetric): number {
  switch (metric) {
    case 'passedTier': return highestPassed(p.passedTiers);
    case 'clearedTiers': return p.clearedTiers.length;
    case 'clearedClassic': return p.clearedTiers.reduce((n, t) => (t >= 1 && t <= CLASSIC_TIERS ? n + 1 : n), 0);
    case 'clearedMaze': return p.clearedTiers.reduce((n, t) => (t >= LATE_FIRST && t <= LATE_LAST && lateSlot(t)?.type === 'maze' ? n + 1 : n), 0);
    case 'ring': return furthestRing(reachBySector(p.frontier));
    case 'ringAllSides': { const r = reachBySector(p.frontier); return Math.min(...UNLOCK_SECTORS.map(s => r[s])); }
    case 'legendaryOwned': return legendaryIds().filter(id => (p.owned[id] ?? 0) > 0).length;
    case 'heroLevel': return Math.max(0, ...Object.values(p.captains.heroes).map(h => h.level));
    case 'skillsSpent': return p.skills.length;
    case 'bestShot': return p.records.bestShot;
    case 'bestAvgDps': return p.records.bestAvgDps;
    case 'circuitBlocks': return p.records.maxCircuitBlocks;
    case 'hullFilled': return p.records.hullFilled;
    case 'hullsOwned': return p.ownedHulls.filter(h => (HULL_ORDER as readonly string[]).includes(h)).length;
    case 'ordinaryOwned': return ordinaryIds().filter(id => (p.owned[id] ?? 0) > 0).length;
    case 'flyWave': return p.bestWave;
  }
}

export const goalOf = (def: AchievementDef): number => (def.goal === 'all' ? metricTotal(def.metric) : def.goal);

export interface AchievementProgress { value: number; goal: number; done: boolean }

export function progressOf(p: Progress, def: AchievementDef): AchievementProgress {
  const goal = goalOf(def);
  const value = Math.min(goal, metricValue(p, def.metric));
  return { value, goal, done: p.achievements.includes(def.id) || metricValue(p, def.metric) >= goal };
}

/** Achievements whose goal is met and that the save has not earned yet, in list order. */
export function newlyEarned(p: Progress): AchievementDef[] {
  return ACHIEVEMENTS.filter(a => !p.achievements.includes(a.id) && metricValue(p, a.metric) >= goalOf(a));
}

/** Marks them earned and pays them (Medals into the balance, cosmetic ids into the collection). Each is paid once because it is stored. */
export function grantAchievements(p: Progress, defs: readonly AchievementDef[]): { medals: number; cosmetics: Cosmetic[] } {
  let medals = 0;
  const cosmetics: Cosmetic[] = [];
  for (const a of defs) {
    if (p.achievements.includes(a.id)) continue;
    p.achievements.push(a.id);
    if ('medals' in a.reward) { p.medals += a.reward.medals; medals += a.reward.medals; }
    else if (!p.cosmetics.includes(a.reward.cosmetic.id)) { p.cosmetics.push(a.reward.cosmetic.id); cosmetics.push(a.reward.cosmetic); }
  }
  return { medals, cosmetics };
}

/** What the reward line of the panel says. A cosmetic is usable in the Customization tab of the ship hub (chunk 28b). */
export function rewardText(reward: AchievementDef['reward']): string {
  if ('medals' in reward) return `${reward.medals} Medal${reward.medals === 1 ? '' : 's'}`;
  return `${reward.cosmetic.kind === 'skin' ? 'projectile skin' : 'shot trail'}: ${reward.cosmetic.name}`;
}

/** Medals all achievements pay in total (the design note and the report quote it). */
export const totalAchievementMedals = (): number => ACHIEVEMENTS.reduce((n, a) => n + ('medals' in a.reward ? a.reward.medals : 0), 0);

export const achievementName = (id: string): string => ACHIEVEMENT_BY_ID[id]?.name ?? id;
