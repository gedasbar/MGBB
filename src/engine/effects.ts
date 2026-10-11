/**
 * Numbers of the chunk 9a blocks (Pathing / Damage / Modifier / Status). Level 1 is the base value; every function adds its
 * increment per level ABOVE 1. The block descriptions in data/blocks.ts and the engine both read these, so the inspector
 * text can never drift from what the engine does.
 */

// ---- Pathing
/** Alternator: damage multiplier of each emitted packet. */
export const alternatorMul = (l: number) => 2 + 0.1 * (l - 1);
/** Delay Line: seconds a packet is held. */
export const delaySeconds = (l: number) => 0.1 * l;

// ---- Damage
export const OVERCLOCK_CAP = 1; // +100%
/** Overclock: damage gained per consecutive packet (2% at level 1, +0.5% per level). */
export const overclockGain = (l: number) => 0.02 + 0.005 * (l - 1);
/** Seconds without a packet after which the streak resets (the gun's own pulse period stretches it, see Gun). */
export const OVERCLOCK_WINDOW = 1;
/** Stats strip: Overclock is shown at its average over this many packets of an unbroken streak. */
export const OVERCLOCK_AVG_PACKETS = 60;
/** The average multiplier of an unbroken streak over OVERCLOCK_AVG_PACKETS packets (packet n has streak n). */
export function overclockAverage(l: number): number {
  const g = overclockGain(l);
  let s = 0;
  for (let n = 0; n < OVERCLOCK_AVG_PACKETS; n++) s += 1 + Math.min(OVERCLOCK_CAP, g * n);
  return s / OVERCLOCK_AVG_PACKETS;
}
/** Capacitor: packets absorbed per emitted shot, and the bonus on the sum. */
export const CAPACITOR_N = 3;
export const capacitorMul = (l: number) => 1 + 0.1 * (l - 1);
/** Executioner: threshold (share of max HP) and multiplier. */
export const EXECUTIONER_BELOW = 0.25;
export const executionerMul = (l: number) => 3 + 0.25 * (l - 1);

// ---- Modifiers
export const CHAIN_RANGE = 150;
export const CHAIN_FRAC = 0.7;
export const chainJumps = (l: number) => 2 + Math.floor((l - 1) / 2);
export const CHAIN_ARC_LIFE = 0.12;
export const boomerangRange = (l: number) => 250 + 75 * (l - 1);
/** The boomerang is gone when it is this close to the ship on its way back. */
export const BOOMERANG_CATCH = 18;
export const ORBIT_RADIUS = 60;
export const orbitTime = (l: number) => 1 + 0.5 * (l - 1);
/** An orbiting projectile hits the same target at most once per this many seconds. */
export const ORBIT_REHIT = 0.3;
/** Seconds the orbit radius takes to open from the ship to ORBIT_RADIUS. */
export const ORBIT_OPEN = 0.12;
export const mineDistance = (l: number) => 220 + 40 * (l - 1);
export const MINE_WAIT = 12;
export const MINE_SIZE = 1.3;

// ---- Status
export const igniteFrac = (l: number) => 0.3 + 0.1 * (l - 1);
export const IGNITE_TIME = 3;
/** Burn damage is applied in ticks of this many seconds (each tick shows one small number). */
export const BURN_TICK = 0.5;
export const CORROSION_STEP = 0.05;
export const corrosionCap = (l: number) => 0.5 + 0.1 * (l - 1);
export const frostSlow = (l: number) => 0.3 + 0.05 * (l - 1);
export const frostTime = (l: number) => 2 + 0.5 * (l - 1);
export const frostBonus = (l: number) => 0.25 + 0.05 * (l - 1);
