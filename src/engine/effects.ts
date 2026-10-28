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
/** Flat+: damage added per block level (chunk 14a: +1, the size of the basic shot; it was +100). */
const FLAT_PLUS_PER_LEVEL = 1;
export const flatPlusAdd = (l: number) => FLAT_PLUS_PER_LEVEL * l;
export const OVERCLOCK_CAP = 1; // +100%
/** Overclock: damage gained per consecutive packet (2% at level 1, +0.5% per level). */
export const overclockGain = (l: number) => 0.02 + 0.005 * (l - 1);
/** Seconds without a packet after which the streak resets (the gun's own pulse period stretches it, see Gun). */
export const OVERCLOCK_WINDOW = 1;
/** Stats strip: Overclock is shown at its average over this many packets of an unbroken streak. */
const OVERCLOCK_AVG_PACKETS = 60;
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
/**
 * Orbit seconds: 1 at L1, +0.25 a level (chunk 14a; it was +0.5, so L5 orbited 3 s, the projectile's whole life, and never
 * launched: L5 did less damage than L1).
 */
export const orbitTime = (l: number) => 1 + 0.25 * (l - 1);
/** An orbiting projectile hits the same target at most once per this many seconds. */
export const ORBIT_REHIT = 0.3;
/** Seconds the orbit radius takes to open from the ship to ORBIT_RADIUS. */
export const ORBIT_OPEN = 0.12;
/** Mine: every extra copy lays one more mine beside the first when it stops (up to MINE_EXTRA_MAX extra), MINE_SPREAD px apart. */
export const MINE_EXTRA_MAX = 3;
export const MINE_SPREAD = 36;
export const mineExtra = (copies: number) => Math.min(MINE_EXTRA_MAX, Math.max(0, copies - 1));
/**
 * Homing (chunk 19a nerf): ONE copy is short-sighted, THREE copies see what one copy used to (range 400 px, cone 60 degrees).
 * Range grows by the size-block factor stackGrowth (x1.22 at 3 copies), the cone by the harmonic sum (x1.83 at 3 copies),
 * so the bases are 400 / 1.21875 and 60 / 1.8333 rounded.
 */
export const HOMING_RANGE_BASE = 328;
export const homingRange = (copies: number) => HOMING_RANGE_BASE * stackGrowth(copies);
/** Homing: total opening angle of the cone (degrees) of one copy; extra copies widen it logarithmically (harmonic). */
export const HOMING_CONE_BASE_DEG = 33;
export const homingConeDeg = (copies: number) => HOMING_CONE_BASE_DEG * harmonic(copies);
/** Orbit: every extra copy adds one more full pass round the ship, which takes 2 pi r / speed seconds. */
export const orbitPassTime = (speed: number) => (2 * Math.PI * ORBIT_RADIUS) / Math.max(1, speed);
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
/** Chunk 14a: 20% a tick at L1, +5% a level (it was 40% +10%: five ticks were 200-400% of the dead target's HP to every neighbour). */
export const residueFrac = (l: number) => 0.2 + 0.05 * (l - 1);
/**
 * Overkill Spill: share of the killing hit's TOTAL damage that every child of the killed rock takes at once. The brief's 30% (+10% a
 * level) scored 0.01 of a Flat+ (a hit is tens of damage against thousands of HP), so it is 300% at level 1, +50% a level (decision 169).
 */
export const spillFrac = (l: number) => 3 + 0.5 * (l - 1);
/** Overkill Spill: how many generations deep a burst may chain from one kill (a child the burst kills passes it on once more). */
export const SPILL_CHAIN_DEPTH = 2;
/** Gravity Well: pull radius (px), lifetime (s) and pull speed (px/s). */
export const WELL_RADIUS = 120;
export const WELL_TIME = 1.5;
export const wellPull = (l: number) => 120 + 40 * (l - 1);
/** Static Charge: hits on one target within the window release a pulse of this share of the hit's damage. */
export const STATIC_HITS = 3;
export const STATIC_WINDOW = 2;
export const staticFrac = (l: number) => 1.5 + 0.25 * (l - 1);
/** Random Router: chance that a packet takes BOTH outputs on a pulse (otherwise 50/50 left or right). */
/** Chunk 14a: 50% at L1, +10% a level (it was 0% at L1: one lane per pulse, the same as a Turn at an uncommon price). */
export const routerBoth = (l: number) => 0.5 + 0.1 * (l - 1);

// ---- Chunk 16c-2: shape blocks stack. Every copy on the signal path adds a step; the benefit falls off by itself.
/** The j-th copy (j >= 2) of a size-type block (AoE, Boomerang range, Mine trigger) multiplies its size by 1 + STACK_GROWTH / j. */
const STACK_GROWTH = 0.25;
/** Size factor of k copies: product of (1 + STACK_GROWTH / j) for j = 2..k (1 for one copy). */
export function stackGrowth(k: number): number {
  let f = 1;
  for (let j = 2; j <= k; j++) f *= 1 + STACK_GROWTH / j;
  return f;
}
/** Harmonic sum 1 + 1/2 + ... + 1/k (1 for one copy): the logarithmic growth of Homing steering and Orbit re-hit speed. */
export function harmonic(k: number): number {
  let h = 0;
  for (let j = 1; j <= k; j++) h += 1 / j;
  return Math.max(1, h);
}
/** AoE damage factor of k copies: each extra copy deals this much of the one before. */
const AOE_STACK_DAMAGE = 0.95;
export const aoeStackDamage = (k: number) => Math.pow(AOE_STACK_DAMAGE, Math.max(0, k - 1));
/** The estimate's factor for the AoE penalty of a shot's modifier list (a Circle wins over a Rectangle, as in the hit pipeline). */
export function aoeEstimateMul(mods: { type: string }[]): number {
  let circle = 0, rect = 0;
  for (const m of mods) { if (m.type === 'aoe_circle') circle++; else if (m.type === 'aoe_rect') rect++; }
  return circle ? aoeStackDamage(circle) : rect ? aoeStackDamage(rect) : 1;
}
/** Fork on Impact: the j-th pair of forks deals this much of the pair before it. */
export const FORK_PAIR_DAMAGE = 0.8;
/** Most bounces a projectile can hold (the pool stores them in an Int8Array). */
export const MAX_BOUNCES = 127;
/** Chain Lightning: the e-th jump added by an extra copy deals CHAIN_STACK_FALL^e of a normal jump (the jumps of one block stay at 70% each, as before). */
export const CHAIN_STACK_FALL = 0.85;

// ---- Chunk 19a: Piercing by count
/** Share of its damage a Piercing shot keeps after passing through a target: 1.0 = full damage on every hit (tune here). */
export const PIERCE_DAMAGE_KEEP = 1.0;

// ---- Chunk 17b: the trigger table (engine/triggers.ts)
/** Chain Lightning fires on every hit of a shot, but at most this many chains per shot. */
export const CHAIN_ARCS_PER_SHOT = 3;
