import { fmtBig } from '../ui/format';
import { CRYSTAL_PULL_ACCEL, CRYSTAL_PULL_CURVE, CRYSTAL_PULL_KICK, CRYSTAL_PULL_MAX_SPEED, CRYSTAL_PULL_MUL, CRYSTAL_BLINK, CRYSTAL_BLINK_HZ, CRYSTAL_CAP, CRYSTAL_DRAG, CRYSTAL_DRIFT, CRYSTAL_LIFE, CRYSTAL_PICKUP_RADIUS } from '../data/coreCrystals';
import { segDistSq } from './steer';

/** One Core crystal: a place, a value in Cores (a fraction), a slow drift and an age. */
export interface Crystal { x: number; y: number; vx: number; vy: number; value: number; age: number;
  /** Chunk 34b: true once the magnet has caught it; it then flies at the ship and no longer ages. */
  pulled: boolean }

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
/** Chunk 34b: the magnet's radius, CRYSTAL_PULL_MUL x the pickup radius (so each Core Magnet copy grows it the same way). */
export const pullRadius = (mul: number): number => CRYSTAL_PULL_MUL * pickupRadius(mul);

/** Chunk 34b: text of the "+N" popup: whole Cores in K/M formatting from 10 up, one decimal below (crystals are worth fractions early on; never "+0"). */
export function crystalPopText(value: number): string {
  if (value >= 10) return `+${fmtBig(Math.round(value))}`;
  const v = Math.max(0.1, Math.round(value * 10) / 10);
  return `+${Number.isInteger(v) ? v : v.toFixed(1)}`;
}

/** One collection this step: where the crystal was when the ship took it and what it was worth. */
export interface Pickup { x: number; y: number; value: number }

/** The crystals of a Free Fly run (no Pixi). Counts what was dropped, collected and lost so the summary can say "collected 120 / 180". */
export class CrystalField {
  readonly list: Crystal[] = [];
  /** Total Cores of crystals dropped (merged value counts once), collected, and the part that faded away. */
  dropped = 0;
  collected = 0;
  /** Crystals picked up by the last update (the screen plays the chime). */
  pickedUp = 0;
  /** Chunk 34b: what the last update collected (the screen pops the "+N" and the sparks from it). */
  readonly pickups: Pickup[] = [];
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
    this.list.push({ x, y, vx: Math.cos(a) * CRYSTAL_DRIFT, vy: Math.sin(a) * CRYSTAL_DRIFT, value, age: 0, pulled: false });
  }

  /**
   * Moves and ages the crystals, collects those the ship's path (from -> to this step) came within `radius` of; returns the Cores collected now.
   * Chunk 34b: a crystal within `pull` of the ship is caught by the magnet: it flies at the ship (curving in) and is collected on arrival. Its own
   * step is swept too, so a fast crystal cannot jump past the ship.
   */
  update(dt: number, fromX: number, fromY: number, shipX: number, shipY: number, radius: number, pull: number = radius * CRYSTAL_PULL_MUL): number {
    this.pickedUp = 0;
    this.pickups.length = 0;
    let got = 0;
    const r2 = radius * radius;
    const p2 = pull * pull;
    const keep = Math.pow(CRYSTAL_DRAG, dt);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const c = this.list[i];
      const ox = c.x, oy = c.y;
      if (!c.pulled) {
        const dx = shipX - c.x, dy = shipY - c.y;
        if (dx * dx + dy * dy <= p2) {
          c.pulled = true;
          const d = Math.hypot(dx, dy) || 1;
          // A sideways kick (side by the crystal's slot parity, repeatable) so the path bends in instead of running straight.
          const side = (i & 1) === 0 ? 1 : -1;
          c.vx = (-dy / d) * CRYSTAL_PULL_KICK * CRYSTAL_PULL_CURVE * side;
          c.vy = (dx / d) * CRYSTAL_PULL_KICK * CRYSTAL_PULL_CURVE * side;
        }
      }
      if (c.pulled) {
        const dx = shipX - c.x, dy = shipY - c.y;
        const d = Math.hypot(dx, dy) || 1;
        c.vx += (dx / d) * CRYSTAL_PULL_ACCEL * dt;
        c.vy += (dy / d) * CRYSTAL_PULL_ACCEL * dt;
        const sp = Math.hypot(c.vx, c.vy);
        if (sp > CRYSTAL_PULL_MAX_SPEED) { c.vx *= CRYSTAL_PULL_MAX_SPEED / sp; c.vy *= CRYSTAL_PULL_MAX_SPEED / sp; }
      } else {
        c.age += dt;
        c.vx *= keep; c.vy *= keep;
      }
      c.x += c.vx * dt; c.y += c.vy * dt;
      const hit = segDistSq(fromX, fromY, shipX, shipY, c.x, c.y) <= r2 || segDistSq(ox, oy, c.x, c.y, shipX, shipY) <= r2;
      if (hit) {
        got += c.value; this.pickedUp++;
        this.pickups.push({ x: c.x, y: c.y, value: c.value });
        this.list.splice(i, 1);
      } else if (c.age >= CRYSTAL_LIFE) {
        this.list.splice(i, 1);
      }
    }
    this.collected += got;
    return got;
  }

  clear() { this.list.length = 0; this.dropped = 0; this.collected = 0; this.pickedUp = 0; this.pickups.length = 0; this.spin = 0; }
}
