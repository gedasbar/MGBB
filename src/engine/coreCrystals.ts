import { CRYSTAL_BLINK, CRYSTAL_BLINK_HZ, CRYSTAL_CAP, CRYSTAL_DRAG, CRYSTAL_DRIFT, CRYSTAL_LIFE, CRYSTAL_PICKUP_RADIUS } from '../data/coreCrystals';
import { segDistSq } from './steer';

/** One Core crystal: a place, a value in Cores (a fraction), a slow drift and an age. */
export interface Crystal { x: number; y: number; vx: number; vy: number; value: number; age: number }

/**
 * The share of a Cores pool a kill takes: its own reward over the reward of everything still to be killed (itself, the live bodies and the spawns
 * still queued), so a wave's pool is spent in proportion to the kills and the last kill of the wave takes what is left.
 */
export function killShare(reward: number, othersReward: number): number {
  if (!(reward > 0)) return 0;
  return reward / (reward + Math.max(0, othersReward));
}

/** True while a crystal is drawn: always, then blinking (CRYSTAL_BLINK_HZ) in its last CRYSTAL_BLINK seconds. */
export function crystalVisible(age: number): boolean {
  if (age < CRYSTAL_LIFE - CRYSTAL_BLINK) return true;
  return Math.floor((age - (CRYSTAL_LIFE - CRYSTAL_BLINK)) * CRYSTAL_BLINK_HZ * 2) % 2 === 0;
}

/** Pickup radius in px: the base radius times the Core Magnet multiplier (1 + 0.6 per copy). */
export const pickupRadius = (mul: number): number => CRYSTAL_PICKUP_RADIUS * Math.max(1, mul);

/** The crystals of a Free Fly run (no Pixi). Counts what was dropped, collected and lost so the summary can say "collected 120 / 180". */
export class CrystalField {
  readonly list: Crystal[] = [];
  /** Total Cores of crystals dropped (merged value counts once), collected, and the part that faded away. */
  dropped = 0;
  collected = 0;
  /** Crystals picked up by the last update (the screen plays the chime). */
  pickedUp = 0;
  private spin = 0;

  constructor(readonly cap: number = CRYSTAL_CAP) {}

  /** A crystal worth `value` Cores where something died. At the cap the value joins the nearest crystal (which gets a fresh life). */
  drop(x: number, y: number, value: number): void {
    if (!(value > 0)) return;
    this.dropped += value;
    if (this.list.length >= this.cap) {
      let best = this.list[0], bd = Infinity;
      for (const c of this.list) {
        const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
        if (d < bd) { bd = d; best = c; }
      }
      best.value += value;
      best.age = 0;
      return;
    }
    // A repeatable direction (no Math.random: the run's combat randomness stays untouched).
    const a = (this.spin++ * 2.399963) % (Math.PI * 2);
    this.list.push({ x, y, vx: Math.cos(a) * CRYSTAL_DRIFT, vy: Math.sin(a) * CRYSTAL_DRIFT, value, age: 0 });
  }

  /** Moves and ages the crystals, collects those the ship's path (from -> to this step) came within `radius` of; returns the Cores collected now. */
  update(dt: number, fromX: number, fromY: number, shipX: number, shipY: number, radius: number): number {
    this.pickedUp = 0;
    let got = 0;
    const r2 = radius * radius;
    const keep = Math.pow(CRYSTAL_DRAG, dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      c.age += dt;
      c.x += c.vx * dt; c.y += c.vy * dt;
      c.vx *= keep; c.vy *= keep;
      if (segDistSq(fromX, fromY, shipX, shipY, c.x, c.y) <= r2) {
        got += c.value; this.pickedUp++;
        this.list.splice(i, 1);
      } else if (c.age >= CRYSTAL_LIFE) {
        this.list.splice(i, 1);
      }
    }
    this.collected += got;
    return got;
  }

  clear() { this.list.length = 0; this.dropped = 0; this.collected = 0; this.pickedUp = 0; this.spin = 0; }
}

/** The run summary line: "Cores collected 120 / 180 (67%)" (both numbers rounded to whole Cores, the percentage from the exact values; 100% when nothing dropped). */
export function crystalLine(collected: number, dropped: number): string {
  const d = Math.max(Math.round(dropped), Math.round(collected));
  const c = Math.round(collected);
  const pct = dropped > 0 ? Math.min(100, Math.round((collected / dropped) * 100)) : 100;
  return `Cores collected ${c} / ${d} (${pct}%)`;
}
