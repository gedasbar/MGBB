import { FEEL, ShakeMode } from '../data/feel';

export type ShakeSize = 'small' | 'medium' | 'big';

/** Trauma-based screen shake (chunk 34a). Events add trauma, it decays fast, the offset is amplitude x trauma squared. Pure: no Pixi, the random source is injected. */
export class Shake {
  trauma = 0;
  mode: ShakeMode = 'normal';
  constructor(private rnd: () => number = Math.random) {}

  /** Adds trauma of a size; the size's ceiling stops many small events from piling up into a big shake. Nothing when the mode is off. */
  add(size: ShakeSize) {
    if (this.mode === 'off') return;
    const ceil = FEEL.SHAKE.CEIL[size];
    if (this.trauma >= ceil) return;
    this.trauma = Math.min(ceil, this.trauma + FEEL.SHAKE.ADD[size]);
  }

  update(dt: number) {
    this.trauma = Math.max(0, this.trauma - FEEL.SHAKE.TRAUMA_DECAY * dt);
  }

  /** The largest offset the current trauma can make, in game pixels. */
  get amplitude(): number {
    if (this.mode === 'off') return 0;
    return FEEL.SHAKE.MAX_OFFSET * (this.mode === 'low' ? FEEL.SHAKE.LOW_SCALE : 1) * this.trauma * this.trauma;
  }

  /** A fresh random offset within the amplitude. */
  offset(): { x: number; y: number } {
    const a = this.amplitude;
    if (a <= 0) return { x: 0, y: 0 };
    return { x: (this.rnd() * 2 - 1) * a, y: (this.rnd() * 2 - 1) * a };
  }
}

export type StopKind = 'bossDeath' | 'crash' | 'big';

/** Hit stop (chunk 34a): a very short freeze of the simulation. The screens skip the world update while `step` says frozen. */
export class HitStop {
  on = true;
  left = 0;
  /** Seconds until another "big hit" stop is allowed (real time). */
  private cool = 0;

  request(kind: StopKind) {
    if (!this.on) return;
    const S = FEEL.STOP;
    if (kind === 'big') {
      if (this.cool > 0) return;
      this.cool = S.BIG_COOLDOWN;
      this.left = Math.max(this.left, S.BIG_HIT);
    } else this.left = Math.max(this.left, kind === 'bossDeath' ? S.BOSS_DEATH : S.CRASH);
  }

  /** Call once a frame with the real frame time: true = the simulation must not advance this frame. */
  step(frameTime: number): boolean {
    this.cool = Math.max(0, this.cool - frameTime);
    if (this.left <= 0) return false;
    this.left = Math.max(0, this.left - frameTime);
    return true;
  }
}

/** Auto-drop (chunk 34a): when frames run longer than the budget for DROP_AFTER seconds in a row, `step` returns true once and the particles go to Low for the rest of the run. */
export class FrameBudget {
  private over = 0;
  dropped = false;
  step(frameTime: number): boolean {
    if (this.dropped) return false;
    this.over = frameTime > FEEL.BUDGET.FRAME_BUDGET ? this.over + frameTime : 0;
    if (this.over >= FEEL.BUDGET.DROP_AFTER) { this.dropped = true; return true; }
    return false;
  }
}

/** A number on the screen (chunk 34a): the merge rule and the pop curve, kept pure so they can be tested. */
export interface NumSlot { key: number; value: number; age: number; life: number; big: boolean; used: boolean }

/** Adds `value` to the live number of the same `key` that is younger than the merge window; returns its slot, or null when there is none. */
export function mergeNumber(slots: NumSlot[], key: number, value: number, big: boolean): NumSlot | null {
  for (const s of slots) {
    if (!s.used || s.key !== key || s.age > FEEL.NUMBERS.MERGE_WINDOW) continue;
    s.value += value;
    s.big ||= big;
    s.age = 0;
    s.life = s.big ? FEEL.NUMBERS.BIG_LIFE : FEEL.NUMBERS.LIFE;
    return s;
  }
  return null;
}

/** Scale of a number `age` seconds after it appeared: starts at the pop scale and settles to 1. */
export function popScale(age: number, big: boolean): number {
  const N = FEEL.NUMBERS;
  const top = big ? N.BIG_SCALE : N.POP_SCALE;
  const t = Math.min(1, Math.max(0, age / N.POP_TIME));
  return top + (1 - top) * t;
}

/** A banner `age` seconds after it appeared: slides down from above and settles with a small overshoot scale ("punch"). dy is added to its resting y. */
export function bannerPunch(age: number): { dy: number; scale: number } {
  const B = FEEL.BANNER;
  const t = Math.min(1, Math.max(0, age / B.SLIDE_TIME));
  const ease = 1 - (1 - t) * (1 - t) * (1 - t);
  return { dy: -(1 - ease) * B.SLIDE_DIST, scale: 1 + (B.PUNCH_SCALE - 1) * (1 - t) };
}
