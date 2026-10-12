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

// ---- Chunk 11a: Bouncing (fixed), Mitosis blocks, Gravity Well, Static Charge, Random Router
/** Bouncing: bounces a projectile gets (2 at level 1, +1 per level), and the random spread added to each reflection (degrees, +/-). */
export const bounceCount = (l: number) => 1 + l;
export const BOUNCE_SPREAD_DEG = 35;

/** Fission Catalyst: seconds before a rock (or the children it just made) can be forced to split again. */
export const fissionCooldown = (l: number) => Math.max(0.4, 1 - 0.1 * (l - 1));
/** Cauterize: seconds a hit rock cannot split, and the extra credits of a kill inside that window. */
export const cauterizeTime = (l: number) => 3 + 0.5 * (l - 1);
export const cauterizeBonus = (l: number) => 0.25 + 0.05 * (l - 1);
/** Cleaver: damage multiplier against fragments (generation 2 and later) and against parents (generation 1). */
export const cleaverBonus = (l: number) => 2 + 0.1 * (l - 1);
export const cleaverPenalty = (l: number) => Math.min(1, 0.9 + 0.025 * (l - 1));
/** Rocks count generations from 1 (the parent); this is the first one Cleaver treats as a fragment. */
export const FRAGMENT_GENERATION = 2;
/** Culling Bolt: share of the target's max HP dealt on top of the hit, capped at this many times the packet's damage. */
export const cullingPct = (l: number) => 0.04 + 0.01 * (l - 1);
export const CULLING_CAP = 6;
/** Residue Seed: cloud radius (px), lifetime and tick interval (s), and each tick's share of the killing hit. */
export const RESIDUE_RADIUS = 40;
export const RESIDUE_TIME = 2.5;
export const RESIDUE_TICK = 0.5;
export const residueFrac = (l: number) => 0.4 + 0.1 * (l - 1);
/** Overkill Spill: share of a kill's excess damage sent to the children on top of what rocks already pass on (100%). */
export const spillFrac = (l: number) => Math.min(1, 0.5 + 0.1 * (l - 1));
/** Gravity Well: pull radius (px), lifetime (s) and pull speed (px/s). */
export const WELL_RADIUS = 120;
export const WELL_TIME = 1.5;
export const wellPull = (l: number) => 120 + 40 * (l - 1);
/** Static Charge: hits on one target within the window release a pulse of this share of the hit's damage. */
export const STATIC_HITS = 3;
export const STATIC_WINDOW = 2;
export const staticFrac = (l: number) => 1.5 + 0.25 * (l - 1);
/** Random Router: chance that a packet takes BOTH outputs on a pulse (otherwise 50/50 left or right). */
export const routerBoth = (l: number) => 0.1 * (l - 1);
