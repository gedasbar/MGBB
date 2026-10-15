import { Mulberry32 } from '../rng';
import { CONFIG } from '../config';
import { SpeciesDef } from '../data/species';
import { SPAWN_EDGE, SPAWN_WINDOW, WAVE_TIME, waveBudget } from '../data/waves';
import { tierOfTime } from '../econ/economy';
import { PlannedSpawn, unlockedAt } from '../game/waves';
import {
  FF_RAMP_END, FF_START_SHARE, FF_START_SPREAD, FF_WAVE_AT_BASE, FF_WAVE_CAP, FF_WAVES_PER_TIER, FREEFLY_PASS_SHARE, MAP_BASE_TIER,
} from './constants';

/**
 * Free Fly squares (chunk 15b): the "frontier encounter". Pure functions only; World plays the plan and FlyScreen shows it.
 * Design: docs/frontier-design.md, section 9.
 */

/** Everything an encounter needs; made by squareLevel for a Free Fly square. */
export interface EncounterParams {
  /** Wave equivalent: the species that may appear and the HP growth are that wave's. */
  wave: number;
  /** Fixed tier of the encounter (normal Free Fly's tier at the start of that wave): rock HP and kill rewards. */
  tier: number;
  /** Extra HP multiplier: SPIKE_HP_MUL on spike squares, else 1. */
  hpMul: number;
  /** Per-species weight multipliers (seeded). */
  weights: Record<string, number>;
  /** Trickle rate and starting group multipliers (seeded). */
  trickleMul: number;
  startMul: number;
  duration: number;
  seed: number;
}

/** Wave equivalent of an effective tier: monotonic, at least 1, capped at FF_WAVE_CAP. */
export function waveEquivalent(tier: number): number {
  return Math.max(1, Math.min(FF_WAVE_CAP, Math.round(FF_WAVE_AT_BASE + (tier - MAP_BASE_TIER) * FF_WAVES_PER_TIER)));
}

/** The tier normal Free Fly has when `wave` starts (HP and rewards of an encounter at that wave). */
export const encounterTier = (wave: number) => tierOfTime((Math.max(1, wave) - 1) * WAVE_TIME);

function pick(list: SpeciesDef[], w: (s: SpeciesDef) => number, rnd: Mulberry32): SpeciesDef {
  let total = 0;
  for (const s of list) total += w(s);
  let r = rnd.next() * total;
  for (const s of list) { r -= w(s); if (r < 0) return s; }
  return list[list.length - 1];
}

/**
 * What spawns and when: a starting group (FF_START_SHARE of the wave's budget x startMul, over the first FF_START_SPREAD
 * seconds) and then a trickle whose point rate starts at the normal wave's (budget / SPAWN_WINDOW) x trickleMul and grows
 * linearly to x FF_RAMP_END at the end. Species are the wave's unlocked ones, by weight x the square's multipliers.
 * Deterministic for the same params.
 */
export function planEncounter(p: EncounterParams): PlannedSpawn[] {
  const rnd = new Mulberry32(p.seed | 0);
  const open = unlockedAt(p.wave).filter(s => s.weight > 0);
  const weight = (s: SpeciesDef) => s.weight * (p.weights[s.id] ?? 1);
  const x = (r: number) => r + SPAWN_EDGE + rnd.next() * (CONFIG.VIEW.W - 2 * (r + SPAWN_EDGE));
  const out: PlannedSpawn[] = [];
  const add = (s: SpeciesDef, at: number) => out.push({ at, defId: s.id, x: x(s.radius), generation: 1, radius: s.radius, hpMul: s.hpMul });
  const budget = waveBudget(p.wave);
  let start = budget * FF_START_SHARE * p.startMul;
  while (start > 0) { const s = pick(open, weight, rnd); add(s, rnd.next() * FF_START_SPREAD); start -= s.cost; }
  const rate0 = (budget / SPAWN_WINDOW) * p.trickleMul;
  const rate = (t: number) => rate0 * (1 + (FF_RAMP_END - 1) * Math.min(1, t / p.duration));
  let t = FF_START_SPREAD;
  for (;;) {
    const s = pick(open, weight, rnd);
    t += s.cost / rate(t);
    if (t >= p.duration) break;
    add(s, t);
  }
  return out.sort((a, b) => a.at - b.at);
}

export type EncounterOutcome = 'cleared' | 'passed' | 'failed';

/** Survived the whole time = cleared; ended (died or quit) after at least half = passed; earlier = failed. */
export function encounterOutcome(time: number, duration: number, survived: boolean): EncounterOutcome {
  if (survived && time >= duration - 1e-9) return 'cleared';
  return time >= duration * FREEFLY_PASS_SHARE - 1e-9 ? 'passed' : 'failed';
}

/** Hands out an encounter's spawns when due (same contract as the wave director; no waves start). */
export class EncounterDirector {
  private next = 0;
  held = 0;
  constructor(readonly wave: number, private plan: PlannedSpawn[], private aliveHold: number) {}
  jumpTo() { /* encounters always start at 0 */ }
  timeToNext(): number { return Infinity; }
  update(time: number, alive: number, out: PlannedSpawn[]): number {
    while (this.next < this.plan.length && this.plan[this.next].at <= time) {
      if (alive >= this.aliveHold) { this.held++; break; }
      out.push(this.plan[this.next++]);
      alive++;
    }
    return 0;
  }
}
