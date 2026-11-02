// Chunk 28a: challenge rules (the list is data in src/data/challenges.ts). Pure functions: the builder asks `checkBuild` before FLY, the wall
// screen asks `challengeVerdict` when the run ends, the store pays `completeChallenge` once.

import { BLOCKS } from '../data/blocks';
import { CHALLENGES, CHALLENGE_BY_ID, ChallengeDef, ChallengeRules } from '../data/challenges';
import { HULLS, HullId } from '../data/hulls';
import type { Grid, CompiledShip } from '../engine/compiler';
import type { Cosmetic } from '../data/achievements';
import type { Progress } from '../econ/progress';

const hullName = (id: string) => HULLS[id as HullId]?.name ?? id;
const blockNames = (ids: readonly string[]) => ids.map(id => BLOCKS[id]?.name ?? id).join(', ');
const CATEGORY_WORD: Record<string, string> = { legendary: 'legendary blocks', pathing: 'pathing blocks', damage: 'damage blocks', modifier: 'modifier blocks', status: 'status blocks', mitosis: 'mitosis blocks', passive: 'passive blocks' };

/** The number of ejectors that fire in a compiled circuit (an ejector no signal reaches is not counted). */
export function firingEjectors(compiled: Pick<CompiledShip, 'recipes'>): number {
  return new Set(compiled.recipes.map(r => `${r.x},${r.y}`)).size;
}

export const placedBlocks = (grid: Grid): string[] => grid.cells.filter(c => c.blockId).map(c => c.blockId as string);

/** The rules as short lines for the builder banner and the challenge list. */
export function ruleLines(c: ChallengeDef): string[] {
  const r = c.rules;
  const out: string[] = [`${c.goal === 'clear' ? 'Clear' : 'Pass'} tier ${c.tier}`];
  if (r.hulls) out.push(`Hull: ${r.hulls.map(hullName).join(' or ')}`);
  if (r.banBlocks) out.push(`No ${blockNames(r.banBlocks)}`);
  if (r.banCategory) out.push(`No ${r.banCategory.map(k => CATEGORY_WORD[k] ?? k).join(', ')}`);
  if (r.needBlocks) out.push(`Must use ${blockNames(r.needBlocks)}`);
  if (r.maxBlocks !== undefined) out.push(`At most ${r.maxBlocks} blocks`);
  if (r.maxEjectors !== undefined) out.push(r.maxEjectors === 1 ? 'One ejector fires' : `At most ${r.maxEjectors} ejectors fire`);
  if (r.noFire) out.push('Do not fire a shot');
  if (r.timeLimit !== undefined) out.push(`Within ${r.timeLimit} seconds`);
  return out;
}

/** Why a circuit may not fly this challenge, in plain words; null = it may. The first broken rule is the one reported. */
export function checkBuild(rules: ChallengeRules, grid: Grid, compiled: Pick<CompiledShip, 'recipes'>, hullOwned = true): string | null {
  if (rules.hulls && !rules.hulls.includes(grid.hullId ?? '')) {
    const names = rules.hulls.map(hullName).join(' or ');
    return hullOwned ? `This challenge needs the ${names} hull. Pick it with the ship button.` : `This challenge needs the ${names} hull, which you do not own yet.`;
  }
  const ids = placedBlocks(grid);
  if (rules.banBlocks) {
    const bad = rules.banBlocks.filter(b => ids.includes(b));
    if (bad.length) return `Not allowed in this challenge: ${blockNames(bad)}. Remove it first.`;
  }
  if (rules.banCategory) {
    const bad = Array.from(new Set(ids.filter(id => rules.banCategory!.includes(BLOCKS[id]?.category))));
    if (bad.length) return `Not allowed in this challenge: ${blockNames(bad)} (${rules.banCategory.map(k => CATEGORY_WORD[k] ?? k).join(', ')}). Remove it first.`;
  }
  if (rules.needBlocks) {
    const missing = rules.needBlocks.filter(b => !ids.includes(b));
    if (missing.length) return `This challenge needs ${blockNames(missing)} on your circuit.`;
  }
  if (rules.maxBlocks !== undefined && ids.length > rules.maxBlocks) return `At most ${rules.maxBlocks} blocks allowed: you have ${ids.length}.`;
  if (compiled.recipes.length === 0) return "Your circuit doesn't reach an ejector";
  if (rules.maxEjectors !== undefined) {
    const n = firingEjectors(compiled);
    if (n > rules.maxEjectors) return `At most ${rules.maxEjectors} ejector${rules.maxEjectors === 1 ? '' : 's'} may fire: ${n} do. Cut the signal to the others.`;
  }
  return null;
}

export type RunOutcome = 'cleared' | 'passed' | 'crashed';

/** Did the finished run meet the challenge? `reason` says why not. (No-fire is enforced while flying: the gun cannot fire.) */
export function challengeVerdict(c: ChallengeDef, run: { outcome: RunOutcome; time: number }): { ok: boolean; reason: string } {
  const met = c.goal === 'clear' ? run.outcome === 'cleared' : run.outcome !== 'crashed';
  if (!met) return { ok: false, reason: run.outcome === 'crashed' ? 'The ship crashed.' : `Tier ${c.tier} was passed but not cleared.` };
  if (c.rules.timeLimit !== undefined && run.time > c.rules.timeLimit) return { ok: false, reason: `Too slow: ${Math.ceil(run.time)} s, the limit is ${c.rules.timeLimit} s.` };
  return { ok: true, reason: '' };
}

/** A challenge opens when its tier has been passed (so the list grows with progress). */
export const challengeUnlocked = (p: Pick<Progress, 'passedTiers'>, c: ChallengeDef): boolean => p.passedTiers.includes(c.tier);
export const challengeDone = (p: Pick<Progress, 'challengesDone'>, id: string): boolean => p.challengesDone.includes(id);

/** Pays a finished challenge once: marks it done and gives the reward. Unknown ids and repeats pay nothing. */
export function completeChallenge(p: Progress, id: string): { paid: boolean; medals: number; cosmetic: Cosmetic | null } {
  const c = CHALLENGE_BY_ID[id];
  if (!c || p.challengesDone.includes(id)) return { paid: false, medals: 0, cosmetic: null };
  p.challengesDone.push(id);
  if ('medals' in c.reward) { p.medals += c.reward.medals; return { paid: true, medals: c.reward.medals, cosmetic: null }; }
  if (!p.cosmetics.includes(c.reward.cosmetic.id)) p.cosmetics.push(c.reward.cosmetic.id);
  return { paid: true, medals: 0, cosmetic: c.reward.cosmetic };
}

/** What a challenge pays, for the list and the summary. */
export function challengeRewardText(c: ChallengeDef): string {
  if ('medals' in c.reward) return `${c.reward.medals} Medal${c.reward.medals === 1 ? '' : 's'}`;
  return `${c.reward.cosmetic.name} (coming soon)`;
}

export const challengeCounts = (p: Pick<Progress, 'challengesDone' | 'passedTiers'>) => ({
  done: CHALLENGES.filter(c => p.challengesDone.includes(c.id)).length,
  open: CHALLENGES.filter(c => challengeUnlocked(p, c)).length,
  total: CHALLENGES.length,
});
