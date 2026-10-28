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

// ---- Chunk 20a: legendary blocks (docs/legendaries.md). Every number of the twelve lives here; the Skills tree will change them later.
/** Frontier Echo: share of the furthest Frontier ring added as flat damage (whole numbers: ring 300 = +30). */
export const FRONTIER_ECHO_SHARE = 0.1;
export const frontierEchoAdd = (furthestRing: number) => Math.floor(Math.max(0, furthestRing) * FRONTIER_ECHO_SHARE);
/** Payload: flat damage. */
export const PAYLOAD_ADD = 25;
/** Lone Shot: x2 with one shot alive, falling in a straight line to x1 at LONE_SHOT_FULL shots alive (and above). */
export const LONE_SHOT_BONUS = 1;
export const LONE_SHOT_FULL = 10;
export function loneShotMul(shotsAlive: number): number {
  const n = Math.min(LONE_SHOT_FULL, Math.max(1, Math.floor(shotsAlive)));
  return 1 + (LONE_SHOT_BONUS * (LONE_SHOT_FULL - n)) / (LONE_SHOT_FULL - 1);
}
/** Last Breath: damage multiplier on a hit in the last LAST_BREATH_WINDOW seconds of the shot's lifetime (its age limit is PROJECTILE_MAX_AGE). */
export const LAST_BREATH_MUL = 2;
export const LAST_BREATH_WINDOW = 1.0;
export const lastBreathMul = (age: number, lifetime: number) => (age >= lifetime - LAST_BREATH_WINDOW ? LAST_BREATH_MUL : 1);
/** Zigzag: seconds between direction changes, the angle off the heading each leg flies at, and the damage gained per change (additive). */
export const ZIGZAG_PERIOD = 0.2;
export const ZIGZAG_ANGLE_DEG = 25;
export const ZIGZAG_GAIN = 0.05;
export const zigzagMul = (changes: number) => 1 + ZIGZAG_GAIN * Math.max(0, changes);
/** Heavy Round: x2 at normal shot speed up to x5 at HEAVY_SLOW_SPEED x normal, linear in the speed ratio in between, flat outside. */
export const HEAVY_MUL_NORMAL = 2;
export const HEAVY_MUL_SLOWEST = 5;
export const HEAVY_SLOW_SPEED = 0.2;
export function heavyRoundMul(speedRatio: number): number {
  const r = Math.min(1, Math.max(HEAVY_SLOW_SPEED, speedRatio));
  return HEAVY_MUL_NORMAL + ((HEAVY_MUL_SLOWEST - HEAVY_MUL_NORMAL) * (1 - r)) / (1 - HEAVY_SLOW_SPEED);
}
/** Hollow Core: damage gained per empty buildable cell of the hull (x(1 + share x cells)). */
export const HOLLOW_CORE_PER_CELL = 0.1;
export const hollowCoreMul = (emptyCells: number) => 1 + HOLLOW_CORE_PER_CELL * Math.max(0, emptyCells);
/** Idle Barrels: flat damage per ejector no signal reaches. */
export const IDLE_BARRELS_PER_EJECTOR = 3;
export const idleBarrelsAdd = (idleEjectors: number) => IDLE_BARRELS_PER_EJECTOR * Math.max(0, idleEjectors);
/** Waypoint: damage multiplier per turn or curve block the signal passed before it. */
export const WAYPOINT_PER_TURN = 1.1;
export const waypointMul = (turns: number) => Math.pow(WAYPOINT_PER_TURN, Math.max(0, turns));
/** Rebound: multiplier when the previous shot through the block arrived with less damage. */
export const REBOUND_MUL = 4;
/** Mirror: sideways distance (px) of the clone from the shot. */
export const MIRROR_OFFSET = 16;
/** Fuse: shots collected per released shot and the multiplier on their summed damage (the Capacitor stage with other numbers). */
export const FUSE_N = 10;
export const FUSE_MUL = 2;

// ---- Chunk 20b: motion blocks (docs/motion-blocks.md). Every number of the thirteen lives here.
/** Angle Left / Right: degrees per copy and the most a shot can be aimed off straight (4 copies). */
export const ANGLE_STEP_DEG = 15;
export const ANGLE_MAX_DEG = 60;
/** Accelerator / Brake: speed factor per copy, the floor Brake cannot go under, and the ceiling of the packet's speed multiplier. */
export const ACCELERATOR_MUL = 1.5;
export const BRAKE_MUL = 0.7;
export const BRAKE_FLOOR = 0.2;
export const MAX_SPEED_MUL = 4;
/** Scatter: half-width (degrees) of the random cone for one copy, added per extra copy, and the most. */
export const SCATTER_BASE_DEG = 30;
export const SCATTER_STEP_DEG = 15;
export const SCATTER_MAX_DEG = 60;
/** Upturn: seconds of flight before the shot starts turning up, and the turn rate (degrees per second) of one copy. */
export const UPTURN_DELAY = 0.4;
export const UPTURN_RATE_DEG = 120;
/** Extender: life factor per copy. */
export const EXTENDER_MUL = 2;
/** Centreline: sideways acceleration (px/s^2) toward the firing line, the distance inside which it is proportional (px). */
export const CENTRE_ACCEL = 500;
export const CENTRE_SOFT = 40;
/** Ship Magnet: acceleration (px/s^2) toward the ship's current position and the distance inside which it is proportional (px). */
export const MAGNET_ACCEL = 2400;
export const MAGNET_SOFT = 80;
/** Swept hit test: a move shorter than SWEEP_MIN px is checked at its end only (no existing shot is faster at 60 Hz), a longer one at points SWEEP_SPACING apart, never over SWEEP_MAX. */
export const SWEEP_MIN = 16;
export const SWEEP_MIN_SPACING = 6;
export const SWEEP_MAX = 400;
/** Angle of a packet after one more Angle Left (dir -1) or Right (dir +1) block. */
export const angleAfter = (angle: number, dir: -1 | 1) => Math.max(-ANGLE_MAX_DEG, Math.min(ANGLE_MAX_DEG, angle + dir * ANGLE_STEP_DEG));
/** Scatter half-width after one more Scatter block (0 = none yet). */
export const scatterAfter = (w: number) => (w <= 0 ? SCATTER_BASE_DEG : Math.min(SCATTER_MAX_DEG, w + SCATTER_STEP_DEG));
/** A packet's speed multiplier after a speed block: the Brake floor and the ceiling apply. */
export const clampSpeedMul = (m: number) => Math.min(MAX_SPEED_MUL, Math.max(BRAKE_FLOOR, m));

// ---- Chunk 21a (docs/chunk21a.md)
/** +1 Projectile: the sideways gap (px) between the shots of one lane; the lane is centred on its ejector. */
export const LANE_GAP = 6;
/** Offset (px) of shot `k` of `n` in a lane from the lane's centre: a constant gap, centred. */
export const laneOffset = (k: number, n: number) => (k - (n - 1) / 2) * LANE_GAP;
/** Curving Left / Right: one copy turns CURVE_RATE_STEP_DEG per second until it has turned CURVE_TOTAL_STEP_DEG in all; every copy adds both. */
export const CURVE_RATE_STEP_DEG = 30;
export const CURVE_TOTAL_STEP_DEG = 45;
export const curveRateDeg = (copies: number) => CURVE_RATE_STEP_DEG * copies;
export const curveTotalDeg = (copies: number) => CURVE_TOTAL_STEP_DEG * copies;
/** Random Curve: the most the weave turns per second grows the same way (4 copies = 120, what one copy was before 21a). */
export const randomCurveRateDeg = (copies: number) => CURVE_RATE_STEP_DEG * copies;
/** Upturn: each extra copy shortens the delay by this factor (0.4 s, 0.3 s, 0.225 s). */
export const UPTURN_DELAY_FACTOR = 0.75;
export const upturnDelay = (copies: number) => UPTURN_DELAY * Math.pow(UPTURN_DELAY_FACTOR, Math.max(0, copies - 1));
