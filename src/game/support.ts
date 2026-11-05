import type { SpeciesDef } from '../data/species';

/**
 * Pure rules of the three Free Fly enemies of chunk 32a (docs/freefly-v2.md section 2): the Gunner's walk / stop / fire cycle
 * and burst aim, and the nearest-N link choice a Shielder and a Leech use. No Pixi, no World: the world calls these.
 */

type GunDef = NonNullable<SpeciesDef['gun']>;

/** A Gunner's clock: seconds into its walk-then-stop cycle, and whether this stop has fired already. */
export interface GunState { t: number; fired: boolean }

export const newGunState = (g: GunDef): GunState => ({ t: g.walk - g.firstWalk, fired: false });

/**
 * Advances a Gunner by `dt`. While walking the clock only runs when `canShoot` (it is on screen and above the ship), so the
 * first stop comes `firstWalk` seconds after it appears. At `aimAt` seconds into the stop it fires once (`fire`), at `stop` it walks on.
 * `moving` is false during the stop.
 */
export function gunStep(st: GunState, g: GunDef, dt: number, canShoot: boolean): { moving: boolean; fire: boolean } {
  if (st.t < g.walk) {
    if (canShoot) st.t = Math.min(g.walk, st.t + dt);
    return { moving: st.t < g.walk, fire: false };
  }
  st.t += dt;
  let fire = false;
  if (!st.fired && st.t >= g.walk + g.aimAt) { st.fired = true; fire = canShoot; }
  if (st.t >= g.walk + g.stop) { st.t = 0; st.fired = false; return { moving: true, fire }; }
  return { moving: false, fire };
}

/** Velocities of an aimed burst: `count` bullets in a fan, `spreadDeg` apart, centred on the line from (gx, gy) to (tx, ty). */
export function burstVelocities(gx: number, gy: number, tx: number, ty: number, speed: number, count: number, spreadDeg: number): { vx: number; vy: number }[] {
  const base = Math.atan2(ty - gy, tx - gx);
  const out: { vx: number; vy: number }[] = [];
  for (let i = 0; i < count; i++) {
    const a = base + ((i - (count - 1) / 2) * spreadDeg * Math.PI) / 180;
    out.push({ vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
  }
  return out;
}

interface Pos { id: number; x: number; y: number; hp: number }

/** The nearest `max` bodies within `range` px of (sx, sy) that are alive and `eligible`, nearest first. */
export function nearestWithin<T extends Pos>(sx: number, sy: number, all: readonly T[], range: number, max: number, eligible: (e: T) => boolean): T[] {
  const r2 = range * range;
  const found: { e: T; d: number }[] = [];
  for (const e of all) {
    if (!(e.hp > 0) || !eligible(e)) continue;
    const d = (e.x - sx) * (e.x - sx) + (e.y - sy) * (e.y - sy);
    if (d <= r2) found.push({ e, d });
  }
  found.sort((a, b) => a.d - b.d || a.e.id - b.e.id);
  return found.slice(0, max).map(f => f.e);
}
