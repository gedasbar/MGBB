/**
 * THE TRIGGER TABLE (chunk 17b, design in docs/interactions.md): when does each on-hit effect fire, and who carries it?
 * This is the one place to change a rule; the hit pipeline in projectiles.ts reads it.
 *
 *   fires      'every_hit'  on every hit of the shot (local and cheap effects);
 *              'first_hit'  only on the first hit of the shot (spawning effects: the main shot goes on if it can);
 *              'shot_end'   only on the hit that uses the shot up: a plain shot on its first hit, a Piercing shot when its damage
 *                           is gone, a Bouncing shot when its bounces are gone. A piercing or bouncing shot travels, then explodes once.
 *   fragments  true = the copies a Fork on Impact makes also have this effect (false: they are plain shots, so nothing cascades).
 *   arcs       true = a Chain Lightning arc also carries it (statuses and Mitosis effects do; nothing else).
 *   maxPerShot most times it can fire for one shot (absent = no limit).
 *
 * Status and Mitosis effects (Ignite, Frostbite, Corrosion, Static Charge, Executioner, Cleaver, Culling Bolt, Cauterize, Fission
 * Catalyst, Overkill Spill, Residue Seed) fire on every hit inside `strike()` in projectiles.ts, for the shot, its blast victims,
 * its fork copies and its chain arcs alike; their row below is the rule, they are not switched from this table.
 */
import { CHAIN_ARCS_PER_SHOT } from './effects';

export type When = 'every_hit' | 'first_hit' | 'shot_end';

export interface Trigger {
  fires: When;
  fragments: boolean;
  arcs: boolean;
  maxPerShot?: number;
}

export const TRIGGERS = {
  /** Ignite, Frostbite, Corrosion, Static Charge and the Mitosis effects: informational, applied in strike(). */
  status: { fires: 'every_hit', fragments: true, arcs: true } as Trigger,
  /** AoE Circle and AoE Rectangle: one blast where the shot ends. Boomerang and Orbit shots never end by a hit, so with AoE they explode on their first hit. */
  aoe: { fires: 'shot_end', fragments: false, arcs: false } as Trigger,
  /** Fork on Impact: two copies on the first hit. */
  fork: { fires: 'first_hit', fragments: false, arcs: false } as Trigger,
  /** Chain Lightning: every hit, at most this many chains per shot (each Chain copy adds one jump to every chain). */
  chain: { fires: 'every_hit', fragments: false, arcs: false, maxPerShot: CHAIN_ARCS_PER_SHOT } as Trigger,
  /** Gravity Well: one pulling spot per shot, on its first hit. */
  gravityWell: { fires: 'first_hit', fragments: false, arcs: false } as Trigger,
} as const;

/** Whether `t` fires on this hit. `firstHit`: no earlier hit of this shot; `shotEnds`: this hit uses the shot up. */
export function triggerDue(t: Trigger, firstHit: boolean, shotEnds: boolean): boolean {
  return t.fires === 'every_hit' || (t.fires === 'first_hit' && firstHit) || (t.fires === 'shot_end' && shotEnds);
}

/** Whether the shot being processed has `t`'s effect: a fork copy only has what `fragments` allows. */
export function triggerCarried(t: Trigger, isFragment: boolean): boolean {
  return !isFragment || t.fragments;
}
