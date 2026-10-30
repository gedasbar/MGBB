import { SKILL_BY_ID, SKILL_NODES } from '../data/skillTree';
import {
  RESPEC_MEDALS, SKILL_NODE_COST, SKILL_RING_SLOW_FROM, SKILL_RING_STEP, SKILL_RING_STEP_SLOW, SKILL_START_ID,
} from './constants';
import { neutralSkills, SkillEffects, sumSkillFx } from './effects';

/** Skill points the furthest Frontier ring pays for: 1 per 25 rings up to ring 250, then 1 per 50 (ring 500 = 15, ring 1000 = 25). */
export function skillPointsFor(ring: number): number {
  const r = Math.max(0, Math.floor(Number.isFinite(ring) ? ring : 0));
  const fast = Math.floor(Math.min(r, SKILL_RING_SLOW_FROM) / SKILL_RING_STEP);
  const slow = Math.floor(Math.max(0, r - SKILL_RING_SLOW_FROM) / SKILL_RING_STEP_SLOW);
  return fast + slow;
}

/** The ring that pays the NEXT point (for "Next point at ring N"). */
export function nextPointRing(ring: number): number {
  const r = Math.max(0, Math.floor(Number.isFinite(ring) ? ring : 0));
  if (r < SKILL_RING_SLOW_FROM) return (Math.floor(r / SKILL_RING_STEP) + 1) * SKILL_RING_STEP;
  return SKILL_RING_SLOW_FROM + (Math.floor((r - SKILL_RING_SLOW_FROM) / SKILL_RING_STEP_SLOW) + 1) * SKILL_RING_STEP_SLOW;
}

/** Points not spent yet. */
export const freePoints = (ring: number, owned: readonly string[]) => Math.max(0, skillPointsFor(ring) - owned.length * SKILL_NODE_COST);

/** Why a node cannot be bought now (null = it can). `owned` does not hold the start node. */
export function buyBlocker(ring: number, owned: readonly string[], id: string): string | null {
  const node = SKILL_BY_ID[id];
  if (!node || id === SKILL_START_ID) return 'Unknown skill';
  if (owned.includes(id)) return 'Already owned';
  if (!node.links.some(l => l === SKILL_START_ID || owned.includes(l))) return 'Needs a neighbouring skill first';
  if (freePoints(ring, owned) < SKILL_NODE_COST) return 'No free skill point';
  return null;
}

/** Medals a respec costs: RESPEC_MEDALS, less by the Salvage node (at least 1). */
export function respecCost(owned: readonly string[]): number {
  const cut = Math.min(1, skillEffects(owned).respecDiscount);
  return Math.max(1, Math.ceil(RESPEC_MEDALS * (1 - cut)));
}

/** The effects of a list of owned nodes (unknown ids are ignored). */
export function skillEffects(owned: readonly string[]): SkillEffects {
  if (owned.length === 0) return neutralSkills();
  return sumSkillFx(owned.map(id => SKILL_BY_ID[id]?.fx ?? {}));
}

/**
 * Keeps the ids of a saved list that are real, unique, not the start node, joined to the start by owned nodes (a floating node
 * is dropped) and paid for by `points` (in tree order if there are too many).
 */
export function sanitizeSkillList(raw: unknown, points: number): string[] {
  if (!Array.isArray(raw)) return [];
  const wanted = new Set<string>();
  for (const id of raw) if (typeof id === 'string' && id !== SKILL_START_ID && SKILL_BY_ID[id]) wanted.add(id);
  const out: string[] = [];
  const have = new Set<string>([SKILL_START_ID]);
  let grew = true;
  while (grew && out.length < points) {
    grew = false;
    for (const n of SKILL_NODES) {
      if (out.length >= points) break;
      if (wanted.has(n.id) && !have.has(n.id) && n.links.some(l => have.has(l))) { have.add(n.id); out.push(n.id); grew = true; }
    }
  }
  return out;
}

/** The part of the save the skill actions change. */
export interface SkillHolder { skills: string[]; medals: number }
export type SkillResult = { ok: true; cost: number } | { ok: false; error: string };

/** Buys a node with one point. */
export function buySkill(p: SkillHolder, ring: number, id: string): SkillResult {
  const why = buyBlocker(ring, p.skills, id);
  if (why) return { ok: false, error: why };
  p.skills.push(id);
  return { ok: true, cost: SKILL_NODE_COST };
}

/** Takes back every node (every point is free again) for RESPEC_MEDALS Medals (half with the Salvage node). Nothing owned = nothing happens. */
export function respecSkills(p: SkillHolder): SkillResult {
  if (p.skills.length === 0) return { ok: false, error: 'Nothing to take back' };
  const cost = respecCost(p.skills);
  if (p.medals < cost) return { ok: false, error: `A respec costs ${cost} Medals` };
  p.medals -= cost;
  p.skills = [];
  return { ok: true, cost };
}

/** The two rings the furthest ring sits between: the one that paid the last point and the one that pays the next (for the progress bar). */
export function pointRingBounds(ring: number): { prev: number; next: number } {
  const next = nextPointRing(ring);
  return { prev: next - (next <= SKILL_RING_SLOW_FROM ? SKILL_RING_STEP : SKILL_RING_STEP_SLOW), next };
}
