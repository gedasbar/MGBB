import { HIT_BURN, HIT_CLOUD } from '../engine/projectiles';
import type { SfxEngine } from './engine';

/** Monotonic counters a world exposes; the feed turns their growth into sounds. */
export interface SfxCounters { shots: number; chainJumps: number; wellsMade: number; bounces: number }

/** The part of a hit event the sound layer needs (shared by rock and block hits). */
export interface SfxHit { id: number; damage: number; kind: number; armor: number; shield: number; maxShield: number }

/** Pitch of a hit tick by damage: 1.0 at about 10 damage, a little higher for bigger hits (a "tier" of tens, hundreds, thousands). */
export function damagePitch(damage: number): number {
  return 0.8 + 0.12 * Math.min(4, Math.max(0, Math.log10(Math.max(1, damage))));
}

/** Pitch of a rock's pop by generation: parents are low, fragments higher. */
export function popPitch(generation: number): number {
  return Math.min(1.5, 0.7 + 0.18 * Math.max(0, generation - 1));
}

/** Per-screen sound state: counter baselines and which targets had a shield up (to tell a break from a plain hit). */
export class SfxFeed {
  private shots = 0;
  private chain = 0;
  private wells = 0;
  private bounces = 0;
  private readonly shielded = new Set<number>();

  constructor(private readonly engine: Pick<SfxEngine, 'play'>) {}

  /** Once per frame: shots, chain lightning, gravity wells and bounces since the last call (one sound each; rate limits do the rest). */
  frame(c: SfxCounters) {
    if (c.shots > this.shots) this.engine.play('shot');
    if (c.chainJumps > this.chain) this.engine.play('chain');
    if (c.wellsMade > this.wells) this.engine.play('well');
    if (c.bounces > this.bounces) this.engine.play('bounce');
    this.shots = c.shots; this.chain = c.chainJumps; this.wells = c.wellsMade; this.bounces = c.bounces;
  }

  /** A hit on a rock (`rock` true) or a wall block. Burn and cloud ticks are silent. */
  hit(h: SfxHit, rock: boolean) {
    if (h.kind === HIT_BURN || h.kind === HIT_CLOUD) return;
    if (h.maxShield > 0) {
      if (h.shield > 0) {
        if (this.shielded.size > 512) this.shielded.clear();
        this.shielded.add(h.id);
        this.engine.play('shieldHit');
        return;
      }
      if (this.shielded.delete(h.id)) { this.engine.play('shieldBreak'); return; }
    }
    if (h.armor > 0) { this.engine.play('armorPing'); return; }
    this.engine.play(rock ? 'rockHit' : 'tick', { pitch: damagePitch(h.damage) });
  }

  /** A rock died (`generation` of the rock) or a wall block was destroyed (undefined). */
  kill(generation?: number) {
    if (generation === undefined) this.engine.play('blockDestroyed');
    else this.engine.play('rockPop', { pitch: popPitch(generation) });
  }

  split() { this.engine.play('split'); }
}
