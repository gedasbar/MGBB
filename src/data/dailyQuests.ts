// Chunk 35a: the daily quest pool. EDIT THIS FILE to add, remove or retune quests (docs/daily.md says how). Every quest has:
//   kind       what is counted (the game reports events of these kinds, see src/daily/rules.ts `DailyEvent`)
//   weight     how likely it is to be drawn (0 = never)
//   available  true only when the player has already unlocked the content (no Frontier quest before tier 25, no tier 101+ quest before 101 is open ...)
//   goal       the N of the quest, scaled to the player's progress (always a whole number >= 1)
//   reward     what completing it pays (Medals and / or Cores)
//   text       the line on the card
// Three quests a day, three different kinds, chosen by the date's seed.
import { coresForWave } from '../shipyard/cores';
import { hullName } from './hulls';

export type QuestKind = 'blocks' | 'rocks' | 'crystals' | 'tiers' | 'late_tiers' | 'hull_clear' | 'boss' | 'wave' | 'squares' | 'damage' | 'no_hit';

/** What the quest pool needs to know about the player when the day's quests are drawn (the quests are then fixed for the day). */
export interface QuestCtx {
  /** Highest campaign tier passed. */
  highestPassed: number;
  /** Frontier open (tier 25 passed) and tiers 101-200 open (every tier 1-100 cleared). */
  frontierOpen: boolean;
  lateOpen: boolean;
  /** Best Free Fly wave. */
  bestWave: number;
  /** Hull ids the player can fly (custom Shipyard hulls left out: they change under the player's feet). */
  hulls: readonly string[];
  /** Average damage dealt in a run so far (0 when unknown). */
  avgRunDamage: number;
}

export interface QuestReward { medals?: number; cores?: number }

export interface QuestDef {
  kind: QuestKind;
  weight: number;
  available: (c: QuestCtx) => boolean;
  goal: (c: QuestCtx) => number;
  reward: (c: QuestCtx) => QuestReward;
  /** The card line; `hull` is the hull id of a hull quest. */
  text: (n: number, hull?: string) => string;
}

/** A number rounded to a friendly step (5, 10, 50 ...) so a goal reads "destroy 150 blocks", not "destroy 137". */
export function nice(n: number): number {
  const v = Math.max(1, Math.round(n));
  if (v < 10) return v;
  const step = v < 50 ? 5 : v < 200 ? 10 : v < 1000 ? 50 : Math.pow(10, Math.floor(Math.log10(v)) - 1) * 5;
  return Math.max(step, Math.round(v / step) * step);
}
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
/** Cores a "Cores" quest pays: four waves' worth at the player's best wave (at least wave 3's). */
const coresReward = (c: QuestCtx) => ({ cores: Math.max(1, 4 * coresForWave(Math.max(3, c.bestWave))) });

export const QUESTS: readonly QuestDef[] = [
  {
    kind: 'blocks', weight: 3, available: () => true,
    goal: c => nice(40 + c.highestPassed * 6), reward: coresReward, text: n => `Destroy ${n} wall blocks`,
  },
  {
    kind: 'rocks', weight: 3, available: () => true,
    goal: c => nice(25 + c.bestWave * 6), reward: coresReward, text: n => `Kill ${n} Free Fly rocks`,
  },
  {
    kind: 'crystals', weight: 2, available: () => true,
    goal: c => clamp(Math.round(6 + c.bestWave * 0.8), 6, 60), reward: coresReward, text: n => `Collect ${n} Core crystals`,
  },
  {
    kind: 'tiers', weight: 3, available: c => c.highestPassed >= 1,
    goal: c => clamp(2 + Math.floor(c.highestPassed / 35), 2, 5), reward: () => ({ medals: 1 }), text: n => `Pass ${n} campaign tiers (replays count)`,
  },
  {
    kind: 'late_tiers', weight: 2, available: c => c.lateOpen,
    goal: () => 2, reward: () => ({ medals: 2 }), text: n => `Pass ${n} tiers above 100`,
  },
  {
    kind: 'hull_clear', weight: 2, available: c => c.highestPassed >= 3 && c.hulls.length >= 1,
    goal: () => 1, reward: () => ({ medals: 1 }), text: (_n, hull) => `Clear a campaign tier with the ${hullName(hull ?? 'dart')}`,
  },
  {
    kind: 'boss', weight: 1, available: c => c.bestWave >= 8,
    goal: () => 1, reward: () => ({ medals: 2 }), text: () => 'Beat a Free Fly boss',
  },
  {
    kind: 'wave', weight: 3, available: c => c.bestWave >= 3,
    goal: c => clamp(Math.round(c.bestWave * 0.75), 3, 60), reward: coresReward, text: n => `Reach wave ${n} in Free Fly`,
  },
  {
    kind: 'squares', weight: 2, available: c => c.frontierOpen,
    goal: c => clamp(1 + Math.floor(c.highestPassed / 60), 1, 3), reward: () => ({ medals: 1 }), text: n => `Pass ${n} Frontier square${n === 1 ? '' : 's'}`,
  },
  {
    kind: 'damage', weight: 2, available: () => true,
    goal: c => nice(Math.max(200, c.avgRunDamage * 3)), reward: coresReward, text: n => `Deal ${n} damage in all`,
  },
  {
    kind: 'no_hit', weight: 1, available: c => c.bestWave >= 3,
    goal: c => clamp(3 + Math.floor(c.bestWave / 8), 3, 12), reward: () => ({ medals: 1 }), text: n => `Reach wave ${n} in Free Fly without being hit`,
  },
];
export const QUEST_BY_KIND: Record<QuestKind, QuestDef> = Object.fromEntries(QUESTS.map(q => [q.kind, q])) as Record<QuestKind, QuestDef>;

/** Quests a day. */
export const DAILY_QUEST_COUNT = 3;
/** Paid once on the day the third quest is done. */
export const DAILY_ALL_BONUS: QuestReward = { medals: 2 };
/** One reroll of a quest per day. */
export const DAILY_REROLLS = 1;
