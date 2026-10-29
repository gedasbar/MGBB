import { rng } from '../rng';
import { ProjectilePool } from './pools';
import { Modifier } from './compilerTypes';
import { SpatialHash } from './spatialHash';
import { EnemyStats, applyDamage, DamageResult, damageToKill } from './damage';
import { EnemyField, HomePick, newHomePick, TargetField } from './targets';
import {
  BOOMERANG_CATCH, boomerangRange, BURN_TICK, CHAIN_FRAC, CHAIN_RANGE, CHAIN_ARC_LIFE, chainJumps, corrosionCap, CORROSION_STEP,
  executionerMul, EXECUTIONER_BELOW, frostBonus, frostSlow, frostTime, igniteFrac, IGNITE_TIME, mineDistance, MINE_SIZE, MINE_WAIT,
  orbitTime, ORBIT_OPEN, ORBIT_RADIUS, ORBIT_REHIT,
  bounceCount, BOUNCE_SPREAD_DEG, cauterizeBonus, cauterizeTime, cleaverBonus, cleaverPenalty, CULLING_CAP, cullingPct,
  FRAGMENT_GENERATION, residueFrac, RESIDUE_RADIUS, RESIDUE_TICK, RESIDUE_TIME, spillFrac, STATIC_HITS, STATIC_WINDOW, staticFrac,
  WELL_TIME, wellPull, stackGrowth, homingRange, HOMING_RANGE_BASE, PIERCE_DAMAGE_KEEP, HOMING_CONE_BASE_DEG, homingConeDeg, mineExtra, MINE_SPREAD, orbitPassTime, harmonic, aoeStackDamage, FORK_PAIR_DAMAGE, MAX_BOUNCES, CHAIN_STACK_FALL,
  HOMING_RETARGET, lastBreathMul, ZIGZAG_ANGLE_DEG, ZIGZAG_PERIOD, zigzagMul,
  CENTRE_ACCEL, CENTRE_SOFT, MAGNET_ACCEL, MAGNET_SOFT, SWEEP_MAX, SWEEP_MIN, SWEEP_MIN_SPACING, upturnDelay, UPTURN_RATE_DEG, curveRateDeg, curveTotalDeg, randomCurveRateDeg,
} from './effects';
import { RING } from './pools';
import { CONFIG } from '../config';
import { TRIGGERS, triggerCarried, triggerDue } from './triggers';
import { CELL } from '../wall/constants';
import { wrapDx } from './wrap';

export interface EnemyEntity extends EnemyStats {
  id: number;
  x: number;
  y: number;
  radius: number;
  // Status effects (chunk 9a). All optional: absent means "none". Rocks and wall blocks both carry them.
  /** Burn: seconds left, damage per second, time banked towards the next tick. */
  burnT?: number;
  burnDps?: number;
  burnTick?: number;
  /** Frozen: seconds left, drift slowdown (0..1) and extra damage taken (0.25 = +25%). */
  freezeT?: number;
  freezeSlow?: number;
  freezeBonus?: number;
  /** Armor before Corrosion touched it (set by the first corrosive hit). */
  armor0?: number;
  /** Already in the status list. */
  tracked?: boolean;
  // Chunk 11a. Present on Free Fly rocks (Mitosis blocks read and write them); absent on wall blocks.
  /** Rocks count generations from 1 (the parent). */
  generation?: number;
  /** Cauterize: seconds left in which the rock cannot split, and the credit bonus of a kill inside it. */
  cauterizedTimer?: number;
  cauterizeBonus?: number;
  /** Fission Catalyst: level of a hit that asked for a split (the world acts on it after the hits), and when this rock may be forced again. */
  fissionLevel?: number;
  fissionReady?: number;
  /** Overkill Spill: damage each child takes when this rock dies (a share of the killing hit), and the chain step it is at. */
  spillBurst?: number;
  spillDepth?: number;
  /** Static Charge: hits counted in the current window, and when the window began (projectile-system clock). */
  scN?: number;
  scFirst?: number;
}

/** How a hit reached the callback: a projectile hit, a burn tick or a chain jump. */
export const HIT_NORMAL = 0;

/** The two numbers of a run's summary (chunk 21a). */
export interface RunStats { bestShot: number; totalDamage: number }
export const HIT_BURN = 1;
export const HIT_CHAIN = 2;
/** A Static Charge pulse (a normal hit with its own number) and a Residue Seed cloud tick (a quiet tick, like a burn). */
export const HIT_PULSE = 3;
export const HIT_CLOUD = 4;
export type HitCallback = (enemy: EnemyEntity, hpDamage: number, x: number, y: number, kind?: number) => void;

/** Movement phases of Orbit / Boomerang / Mine projectiles (pool.phase). */
export const PHASE_NORMAL = 0;
export const PHASE_ORBIT = 1;
export const PHASE_BOOM_OUT = 2;
export const PHASE_BOOM_BACK = 3;
export const PHASE_MINE_TRAVEL = 4;
export const PHASE_MINE_WAIT = 5;

/** Short chain-lightning arcs: a fixed ring of lines the screens draw while their time is above 0. */
export const ARC_MAX = 48;
/** Residue Seed clouds and Gravity Well attractors alive at once (a ring: the oldest is replaced). */
export const CLOUD_MAX = 32;
export const WELL_MAX = 16;

/** Levels of the effect modifiers on the projectile being processed (0 = absent). */
export interface EffectLevels {
  chain: number; boomerang: number; orbit: number; mine: number; ignite: number; corrosion: number; frostbite: number; executioner: number;
  fission: number; cauterize: number; cleaver: number; culling: number; residue: number; spill: number; gravity: number; staticCharge: number;
}

/** Copies of each stacking shape block on the projectile being processed (0 = absent). Every copy adds a step (chunk 16c-2). */
export interface StackCounts {
  pierce: number; bounce: number; aoeCircle: number; aoeRect: number; chain: number; homing: number; fork: number;
  boomerang: number; orbit: number; mine: number;
}

/** Copies of the motion blocks (chunk 20b) on the projectile being processed (0 = absent). */
export interface MotionCounts { upturn: number; centreline: number; magnet: number; align: number; persist: number }

/** Counters of what the effect blocks did (debug hook and tests). */
export interface EffectCounters {
  chainJumps: number;
  boomerangReturns: number;
  orbitLaunches: number;
  mineDetonations: number;
  mineExpired: number;
  igniteApplied: number;
  burnTicks: number;
  corrosionStrips: number;
  freezeApplied: number;
  frozenBonusHits: number;
  executionerHits: number;
  // Chunk 11a
  bounces: number;
  edgeBounces: number;
  cleaverHits: number;
  cullingHits: number;
  residueClouds: number;
  residueTicks: number;
  wellsMade: number;
  staticPulses: number;
  cauterizeMarks: number;
  fissionMarks: number;
  spillMarks: number;
  // Chunk 17b: what the shape blocks did (the interaction audit counts them)
  aoeBlasts: number;
  forks: number;
  pierceHits: number;
  homingSteers: number;
  // Chunk 20a: what the legendary blocks did
  lastBreathHits: number;
  zigzagFlips: number;
  loneBoosts: number;
  reboundBonuses: number;
  mirrorClones: number;
  fuseEmits: number;
  // Chunk 20b: what the motion blocks did
  persistContinues: number;
  aligns: number;
  upturnTurns: number;
  sweepHits: number;
  // Chunk 21b: shots the overload rule removed (stale and off-screen) and fork fragments it refused
  expired: number;
  forksRefused: number;
}

/** Base hit radius of a projectile (scaled by the pool's size). */
export const PROJECTILE_RADIUS = 10;
/** Steering constants of the path modifiers (rates are degrees per second at block level 1 and scale with level). */
export const HOMING_RATE_DEG = 180;
export const HOMING_RANGE = HOMING_RANGE_BASE;
/** Total opening angle of the homing cone, centred on the heading. */
export const HOMING_CONE_DEG = HOMING_CONE_BASE_DEG;
/** Seconds between new random-curve noise targets. */
export const RANDOM_CURVE_PERIOD = 0.35;
export const FORK_ANGLE_DEG = 35;
export const FORK_SIZE = 0.6;

const RAD = Math.PI / 180;
const smooth = (t: number) => t * t * (3 - 2 * t);

function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/** Armor-Piercer damage multiplier at a block level: x2 at level 1. */
export const armorPierceMul = (level: number) => 1 + level;
/**
 * AoE - Rectangle (chunk 19a) in wall cells: 1 copy = 1 row x 3 wide (the hit block and one each side), then alternately one row
 * deeper (behind the hit) and two wider: 2 = 2 x 3, 3 = 2 x 5, 4 = 3 x 5, 5 = 3 x 7. Free Fly uses the same cell size in pixels.
 */
export const aoeRectCells = (copies: number) => {
  const k = Math.max(1, copies);
  return { cols: 3 + 2 * Math.floor((k - 1) / 2), rows: 1 + Math.floor(k / 2) };
};
/** AoE - Circle (19a): one copy's radius is this many cells (the shot sits on the hit block's edge, so it reaches the blocks beside it); +10 px per level as before. */
export const AOE_CIRCLE_CELLS = 1;
export const aoeCircleRadius = (level: number) => Math.round(CELL * AOE_CIRCLE_CELLS) + 10 * (level - 1);
/** Shield-Breaker direct-damage multiplier: x1.5 at level 1, +0.5 per level. */
export const shieldBreakMul = (level: number) => 1 + 0.5 * level;
export const forkDamageFrac = (level: number) => 0.5 + 0.1 * (level - 1);

/** What Homing asks of a field: the two steering queries (ListField has only these; every TargetField has them). */
export type TargetHoming = Pick<TargetField, 'nearestInCone' | 'byId'>;

/**
 * Everything the hot loops need to know about one modifier list, read once and kept (chunk 21b): the per-shot `find` and counting loops of
 * steer() and processField() ran every shot, every frame, over a list that never changes. Valid while `mods` is the same array of the same length.
 */
interface ModInfo {
  mods: Modifier[];
  len: number;
  mi: EffectLevels;
  stk: StackCounts;
  mv: MotionCounts;
  pierce: Modifier | undefined; bounce: Modifier | undefined; aoe: Modifier | undefined; rect: Modifier | undefined;
  fork: Modifier | undefined; homing: Modifier | undefined;
  /** Armor-Piercer multiplier (0 = none) and Shield-Breaker multiplier (false = none). */
  armorPierce: number;
  shieldBreaker: number | false;
  /** Steering: copies of Upturn, Centreline, Ship Magnet, Curving (left / right), Random Curve, Homing; Zigzag present; anything that steers at all. */
  upK: number; cenK: number; magK: number; curveL: number; curveR: number; randK: number; homingK: number; zigzag: boolean; steers: boolean;
  /** Last Breath or Zigzag present (a hit's damage factor). */
  hitFactor: boolean;
}
const EMPTY_MODS: Modifier[] = [];

/**
 * A plain list of targets as a TargetField for the two steering queries (tests and tools that call steer(dt, enemies)); the brute-force
 * search every other implementation is checked against. Only `nearestInCone` and `byId` exist.
 */
export class ListField {
  items: EnemyEntity[] = [];
  wrapW = 0;
  nearestInCone(px: number, py: number, range: number, hx: number, hy: number, cosHalf: number, out: HomePick): boolean {
    let best = range * range;
    let found: EnemyEntity | null = null;
    let bdx = 0, bdy = 0;
    for (const e of this.items) {
      if (e.hp <= 0) continue;
      const dx = this.wrapW > 0 ? wrapDx(e.x, px, this.wrapW) : e.x - px;
      const dy = e.y - py;
      const d2 = dx * dx + dy * dy;
      if (d2 > best) continue;
      if (dx * hx + dy * hy < Math.sqrt(d2) * cosHalf) continue;
      best = d2; found = e; bdx = dx; bdy = dy;
    }
    if (!found) return false;
    out.target = found; out.dx = bdx; out.dy = bdy;
    return true;
  }
  byId(id: number): EnemyEntity | null {
    for (const e of this.items) if (e.id === id) return e;
    return null;
  }
}

export class ProjectileSystem {
  pool: ProjectilePool;

  modifiersTable: Modifier[][] = [];

  /** Ring walls: width of the ring in px, so homing takes the short way round; 0 (Free Fly, flat walls) keeps plain x maths. */
  wrapW = 0;

  /** Scratch objects reused by every projectile (no per-shot allocation). */
  private pick: HomePick = newHomePick();
  private list = new ListField();
  private infoCache: (ModInfo | undefined)[] = [];
  private blast: EnemyEntity[] = [];
  private chainBuf: EnemyEntity[] = [];
  private chainSeen: number[] = [];
  /** Targets with a live burn or freeze (swap-removed when both end). */
  private affected: EnemyEntity[] = [];
  /** Seconds of steer() time so far: Orbit's per-target re-hit timers compare against it. */
  private clock = 0;

  /**
   * The part of the world the player can see, for the overload rule's "off-screen": x within `viewHalfW` of `viewCx` (the short way round on a
   * ring wall) and y between `viewTop` and `viewBottom`. The default sees everything sideways; the wall screen moves it with the camera.
   */
  viewCx = 0;
  viewHalfW = Infinity;
  viewTop = -50;
  viewBottom = CONFIG.VIEW.H + 50;

  /** Where the ship is: Orbit circles it and Boomerang returns to it. Set by the world before steer(). */
  shipX = 0;
  shipY = 0;

  /** Chain-lightning arcs (a ring): from, to, seconds left. */
  readonly arcX0 = new Float32Array(ARC_MAX);
  readonly arcY0 = new Float32Array(ARC_MAX);
  readonly arcX1 = new Float32Array(ARC_MAX);
  readonly arcY1 = new Float32Array(ARC_MAX);
  readonly arcT = new Float32Array(ARC_MAX);
  private arcNext = 0;

  /** Chunk 21a: what the run summary shows. `bestShot` = the largest single hit (any source), `totalDamage` = the damage of every hit and cloud tick, as the hit pipeline counts it (burn ticks are not counted). */
  readonly runStats: RunStats = { bestShot: 0, totalDamage: 0 };
  readonly fx: EffectCounters = {
    chainJumps: 0, boomerangReturns: 0, orbitLaunches: 0, mineDetonations: 0, mineExpired: 0, igniteApplied: 0, burnTicks: 0,
    corrosionStrips: 0, freezeApplied: 0, frozenBonusHits: 0, executionerHits: 0,
    bounces: 0, edgeBounces: 0, cleaverHits: 0, cullingHits: 0, residueClouds: 0, residueTicks: 0, wellsMade: 0, staticPulses: 0,
    cauterizeMarks: 0, fissionMarks: 0, spillMarks: 0, aoeBlasts: 0, forks: 0, pierceHits: 0, homingSteers: 0,
    lastBreathHits: 0, zigzagFlips: 0, loneBoosts: 0, reboundBonuses: 0, mirrorClones: 0, fuseEmits: 0,
    persistContinues: 0, aligns: 0, upturnTurns: 0, sweepHits: 0, expired: 0, forksRefused: 0,
  };

  /** Residue Seed clouds (a ring): position, seconds left, damage per tick, seconds since the last tick. Drawn by the screens. */
  readonly cloudX = new Float32Array(CLOUD_MAX);
  readonly cloudY = new Float32Array(CLOUD_MAX);
  readonly cloudT = new Float32Array(CLOUD_MAX);
  readonly cloudD = new Float64Array(CLOUD_MAX);
  private cloudTick = new Float32Array(CLOUD_MAX);
  private cloudNext = 0;
  /** Gravity Well attractors (a ring): position, seconds left, pull speed. Free Fly applies the pull to its rocks. */
  readonly wellX = new Float32Array(WELL_MAX);
  readonly wellY = new Float32Array(WELL_MAX);
  readonly wellT = new Float32Array(WELL_MAX);
  readonly wellS = new Float32Array(WELL_MAX);
  private wellNext = 0;

  /** Copies of the stacking shape blocks on the projectile being processed (the cached object of its modifier list, set by use()). */
  private stk: StackCounts = { pierce: 0, bounce: 0, aoeCircle: 0, aoeRect: 0, chain: 0, homing: 0, fork: 0, boomerang: 0, orbit: 0, mine: 0 };
  /** Copies of the motion blocks on the projectile being processed (set by use()). */
  private mv: MotionCounts = { upturn: 0, centreline: 0, magnet: 0, align: 0, persist: 0 };
  /** Persist: the share of the last direct hit's damage the target did NOT need (0 when it survived); written by strike() while `trackLeft` is on. */
  private leftFrac = 0;
  private trackLeft = false;

  /** Captain effects on every hit (chunk 13a). The neutral values change nothing; the world sets them at run start. */
  readonly bonus = { damageMul: 1, vsArmor: 0, vsShield: 0, vsFragment: 0 };

  /** Optional hook fired once per enemy damaged (used for hit flash / damage numbers). */
  onHit: HitCallback | null = null;

  constructor(pool: ProjectilePool) {
    this.pool = pool;
  }

  /** Called once right after a projectile is spawned: seeds the random-curve noise from the combat RNG stream. */
  init(i: number) {
    const info = this.use(this.pool.modIndex[i]);
    const bounce = info.bounce;
    if (bounce) {
      // Each extra Bouncing block on the path adds one bounce.
      this.pool.bounces[i] = Math.min(MAX_BOUNCES, bounceCount(bounce.level ?? 1) + this.stk.bounce - 1);
    }
    if (info.randK > 0) {
      this.pool.aux1[i] = rng.combat.next() * 2 - 1;
      this.pool.aux2[i] = rng.combat.next() * 2 - 1;
      this.pool.aux3[i] = 0;
    }
    // Movement phases: Orbit first, then (or instead) Mine or Boomerang. Fork copies fly plain.
    const pool = this.pool;
    if (pool.copy[i]) return;
    const mi = info.mi;
    if (mi.orbit || mi.mine || mi.boomerang) {
      pool.s3[i] = Math.hypot(pool.vx[i], pool.vy[i]);
      pool.s2[i] = 0;
      if (mi.orbit) { pool.phase[i] = PHASE_ORBIT; pool.s1[i] = Math.atan2(pool.vy[i], pool.vx[i]); }
      else { pool.s1[i] = 0; pool.phase[i] = mi.mine ? PHASE_MINE_TRAVEL : PHASE_BOOM_OUT; }
    }
  }

  /** The cached facts of a modifier list (chunk 21b), also pointing `mi`, `stk` and `mv` at its effect levels, stack counts and motion counts. */
  private use(idx: number): ModInfo {
    const mods = this.modifiersTable[idx] || EMPTY_MODS;
    let info = this.infoCache[idx];
    if (!info || info.mods !== mods || info.len !== mods.length) {
      info = this.readMods(mods);
      this.infoCache[idx] = info;
    }
    this.stk = info.stk;
    this.mv = info.mv;
    return info;
  }

  /** Reads the effect levels, stack counts and steering facts off a modifier list. */
  private readMods(mods: Modifier[]): ModInfo {
    const mi: EffectLevels = {
      chain: 0, boomerang: 0, orbit: 0, mine: 0, ignite: 0, corrosion: 0, frostbite: 0, executioner: 0,
      fission: 0, cauterize: 0, cleaver: 0, culling: 0, residue: 0, spill: 0, gravity: 0, staticCharge: 0,
    };
    const stk: StackCounts = { pierce: 0, bounce: 0, aoeCircle: 0, aoeRect: 0, chain: 0, homing: 0, fork: 0, boomerang: 0, orbit: 0, mine: 0 };
    const mv: MotionCounts = { upturn: 0, centreline: 0, magnet: 0, align: 0, persist: 0 };
    const info: ModInfo = {
      mods, len: mods.length, mi, stk, mv,
      pierce: undefined, bounce: undefined, aoe: undefined, rect: undefined, fork: undefined, homing: undefined,
      armorPierce: 0, shieldBreaker: false,
      upK: 0, cenK: 0, magK: 0, curveL: 0, curveR: 0, randK: 0, homingK: 0, zigzag: false, steers: false, hitFactor: false,
    };
    for (const m of mods) {
      switch (m.type) {
        case 'piercing': stk.pierce++; info.pierce ??= m; break;
        case 'bouncing': stk.bounce++; info.bounce ??= m; break;
        case 'aoe_circle': stk.aoeCircle++; info.aoe ??= m; break;
        case 'aoe_rect': stk.aoeRect++; info.rect ??= m; break;
        case 'homing': stk.homing++; info.homing ??= m; info.homingK++; break;
        case 'fork_impact': stk.fork++; info.fork ??= m; break;
        case 'chain_lightning': mi.chain = m.level ?? 1; stk.chain++; break;
        case 'boomerang': mi.boomerang = m.level ?? 1; stk.boomerang++; break;
        case 'orbit': mi.orbit = m.level ?? 1; stk.orbit++; break;
        case 'mine': mi.mine = m.level ?? 1; stk.mine++; break;
        case 'ignite': mi.ignite = m.level ?? 1; break;
        case 'corrosion': mi.corrosion = m.level ?? 1; break;
        case 'frostbite': mi.frostbite = m.level ?? 1; break;
        case 'executioner': mi.executioner = m.level ?? 1; break;
        case 'fission_catalyst': mi.fission = m.level ?? 1; break;
        case 'cauterize': mi.cauterize = m.level ?? 1; break;
        case 'cleaver': mi.cleaver = m.level ?? 1; break;
        case 'culling_bolt': mi.culling = m.level ?? 1; break;
        case 'residue_seed': mi.residue = m.level ?? 1; break;
        case 'overkill_spill': mi.spill = m.level ?? 1; break;
        case 'gravity_well': mi.gravity = m.level ?? 1; break;
        case 'static_charge': mi.staticCharge = m.level ?? 1; break;
        case 'upturn': mv.upturn++; info.upK++; break;
        case 'centreline': mv.centreline++; info.cenK++; break;
        case 'magnetized': mv.magnet++; info.magK++; break;
        case 'align': mv.align++; break;
        case 'persist': mv.persist++; break;
        case 'armor_piercer': if (info.armorPierce === 0) info.armorPierce = armorPierceMul(m.level ?? 1); break;
        case 'shield_breaker': if (info.shieldBreaker === false) info.shieldBreaker = shieldBreakMul(m.level ?? 1); break;
        case 'curve': if (m.dir === 'left') info.curveL++; else info.curveR++; break;
        case 'random_curve': info.randK++; break;
        case 'zigzag': info.zigzag = true; info.hitFactor = true; break;
        case 'last_breath': info.hitFactor = true; break;
      }
    }
    info.steers = info.upK + info.cenK + info.magK + info.curveL + info.curveR + info.randK + info.homingK > 0 || info.zigzag;
    return info;
  }

  /**
   * Orbit / Boomerang / Mine movement of one projectile. It sets the velocity so the world's `x += v * dt` lands where
   * the phase wants the projectile (Orbit: a point on the circle round the ship).
   */
  private stepPhase(i: number, dt: number) {
    const pool = this.pool;
    const ph = pool.phase[i];
    const mi = this.use(pool.modIndex[i]).mi;
    const speed = pool.s3[i];
    if (ph === PHASE_ORBIT) {
      pool.s2[i] += dt;
      const t = pool.s2[i];
      if (t >= orbitTime(mi.orbit) + (this.stk.orbit - 1) * orbitPassTime(speed)) {
        const a = pool.s1[i];
        pool.vx[i] = Math.cos(a) * speed;
        pool.vy[i] = Math.sin(a) * speed;
        pool.age[i] = 0;
        pool.s1[i] = 0;
        pool.s2[i] = 0;
        pool.phase[i] = mi.mine ? PHASE_MINE_TRAVEL : mi.boomerang ? PHASE_BOOM_OUT : PHASE_NORMAL;
        this.fx.orbitLaunches++;
        return;
      }
      const r = ORBIT_RADIUS * Math.min(1, t / ORBIT_OPEN);
      const th = pool.s1[i] + (speed / ORBIT_RADIUS) * t;
      pool.vx[i] = this.dxw(this.shipX + Math.cos(th) * r, pool.x[i]) / dt;
      pool.vy[i] = (this.shipY + Math.sin(th) * r - pool.y[i]) / dt;
    } else if (ph === PHASE_BOOM_OUT) {
      pool.s1[i] += Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      if (pool.s1[i] >= boomerangRange(mi.boomerang) * stackGrowth(this.stk.boomerang)) {
        pool.phase[i] = PHASE_BOOM_BACK;
        pool.skipId[i] = -1; // the way back may hit what the way out hit
        pool.age[i] = 0;
      }
    } else if (ph === PHASE_BOOM_BACK) {
      const dx = this.dxw(this.shipX, pool.x[i]);
      const dy = this.shipY - pool.y[i];
      const d = Math.hypot(dx, dy);
      if (d <= Math.max(BOOMERANG_CATCH, speed * dt)) {
        this.fx.boomerangReturns++;
        pool.free(i);
        return;
      }
      pool.vx[i] = (dx / d) * speed;
      pool.vy[i] = (dy / d) * speed;
      pool.age[i] = 0;
    } else if (ph === PHASE_MINE_TRAVEL) {
      const step = Math.hypot(pool.vx[i], pool.vy[i]) * dt;
      const dist = mineDistance(mi.mine);
      if (pool.s1[i] + step >= dist) {
        // This frame's move ends exactly `dist` px from the start; from the next frame on the mine sits still.
        const k = step > 0 ? (dist - pool.s1[i]) / step : 0;
        pool.vx[i] *= k;
        pool.vy[i] *= k;
        // Every extra Mine copy lays one more mine beside this one (they wait, and detonate, on their own).
        const hx = pool.vx[i], hy = pool.vy[i];
        const hl = Math.hypot(hx, hy) || 1;
        const endX = pool.x[i] + hx * dt * k, endY = pool.y[i] + hy * dt * k;
        const extra = mineExtra(this.stk.mine);
        for (let e = 1; e <= extra; e++) {
          const side = (e % 2 ? 1 : -1) * Math.ceil(e / 2) * MINE_SPREAD;
          const m = pool.spawn(endX + (-hy / hl) * side, endY + (hx / hl) * side, 0, 0, pool.damage[i], pool.pure[i], pool.modIndex[i]);
          if (m < 0) break;
          pool.phase[m] = PHASE_MINE_WAIT;
          pool.size[m] = MINE_SIZE * stackGrowth(this.stk.mine);
          pool.s2[m] = 0;
        }
        pool.s1[i] = dist;
        pool.s2[i] = 0;
        pool.size[i] = MINE_SIZE * stackGrowth(this.stk.mine);
        pool.phase[i] = PHASE_MINE_WAIT;
      } else {
        pool.s1[i] += step;
      }
    } else if (ph === PHASE_MINE_WAIT) {
      pool.vx[i] = 0;
      pool.vy[i] = 0;
      pool.s2[i] += dt;
      pool.age[i] = 0; // a waiting mine is exempt from the wall's projectile age limit
      if (pool.s2[i] >= MINE_WAIT) { this.fx.mineExpired++; pool.free(i); }
    }
  }

  /**
   * Zigzag (chunk 20a): the shot leaves ZIGZAG_ANGLE_DEG to the left of its heading and every ZIGZAG_PERIOD seconds turns by twice that, the
   * other way each time, so it weaves between the two sides of its line. `zigN` counts the changes (each adds ZIGZAG_GAIN damage at a hit).
   */
  private stepZigzag(i: number, dt: number) {
    const pool = this.pool;
    const a = ZIGZAG_ANGLE_DEG * RAD;
    if (pool.zigT[i] < 0) { this.rotateV(i, -a); pool.zigT[i] = 0; }
    pool.zigT[i] += dt;
    while (pool.zigT[i] >= ZIGZAG_PERIOD && pool.zigN[i] < 255) {
      pool.zigT[i] -= ZIGZAG_PERIOD;
      pool.zigN[i]++;
      this.rotateV(i, pool.zigN[i] % 2 === 1 ? 2 * a : -2 * a);
      this.fx.zigzagFlips++;
    }
  }

  /** Turns a projectile's velocity by `rad` (clockwise on screen), keeping its speed. */
  private rotateV(i: number, rad: number) {
    const pool = this.pool;
    const c = Math.cos(rad), s = Math.sin(rad);
    const vx = pool.vx[i], vy = pool.vy[i];
    pool.vx[i] = vx * c - vy * s;
    pool.vy[i] = vx * s + vy * c;
  }

  /**
   * Path modifiers: curving, homing and random curve turn a projectile's velocity (speed is kept). `targets` is the field Homing looks in
   * (the world's own, for a world) or a plain list (tests: searched by brute force).
   */
  steer(dt: number, targets: EnemyEntity[] | TargetHoming) {
    const pool = this.pool;
    let field: TargetHoming;
    if (Array.isArray(targets)) { this.list.items = targets; this.list.wrapW = this.wrapW; field = this.list; } else field = targets;
    this.clock += dt;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.prevX[i] = pool.x[i];
      pool.prevY[i] = pool.y[i];
      pool.age[i] += dt;
      if (pool.phase[i] !== PHASE_NORMAL && dt > 0) {
        this.stepPhase(i, dt);
        if (!pool.active[i]) continue;
        const ph = pool.phase[i];
        // These phases own the velocity: no curving or homing on top.
        if (ph === PHASE_ORBIT || ph === PHASE_BOOM_BACK || ph === PHASE_MINE_WAIT) continue;
      }
      const info = this.use(pool.modIndex[i]);
      if (!info.steers) continue;
      const upK = info.upK, cenK = info.cenK, magK = info.magK; // copies of Upturn, Centreline and Ship Magnet (chunk 20b)
      const curveR = info.curveR, curveL = info.curveL, randK = info.randK; // chunk 21a: curves are counted by copies
      // Chunk 21a, Upturn takes over: after its delay no other steering (curves, Random Curve, Homing, Centreline, Ship Magnet, Zigzag) acts on the
      // shot; it turns to straight up and stays straight. (Orbit before launch, a waiting Mine and a Boomerang's way back never reach this point.)
      if (upK > 0 && pool.age[i] >= upturnDelay(upK)) { this.upturn(i, upK, dt); continue; }
      if (info.zigzag) this.stepZigzag(i, dt);
      let turn = 0; // radians per second, clockwise on screen
      if (randK > 0) {
        let phase = pool.aux3[i] + dt / RANDOM_CURVE_PERIOD;
        while (phase >= 1) {
          phase -= 1;
          pool.aux1[i] = pool.aux2[i];
          pool.aux2[i] = rng.combat.next() * 2 - 1;
        }
        pool.aux3[i] = phase;
        const v = pool.aux1[i] + (pool.aux2[i] - pool.aux1[i]) * smooth(phase);
        turn += v * randomCurveRateDeg(randK) * RAD;
      }
      // Curving: the copies on the path set the rate and the total angle (a Left and a Right cancel). `curved` is what this shot has turned so far.
      let curveRot = 0;
      const netCurve = curveR - curveL;
      if (netCurve !== 0 && dt > 0) {
        const left = curveTotalDeg(Math.abs(netCurve)) - pool.curved[i];
        if (left > 0) {
          const step = Math.min(curveRateDeg(Math.abs(netCurve)) * dt, left);
          pool.curved[i] += step;
          curveRot = Math.sign(netCurve) * step * RAD;
        }
      }
      let rotate = turn * dt + curveRot;
      if (info.homing) rotate += this.homingTurn(i, field, info.homingK, info.homing.level ?? 1, dt);
      if (rotate !== 0) {
        const c = Math.cos(rotate);
        const s = Math.sin(rotate);
        const vx = pool.vx[i];
        const vy = pool.vy[i];
        pool.vx[i] = vx * c - vy * s;
        pool.vy[i] = vx * s + vy * c;
      }
      if (cenK > 0 || magK > 0) this.pull(i, cenK, magK, dt);
    }
  }

  /**
   * Homing (chunk 21b): the turn this frame, in radians (0 when the shot has no target). A shot keeps the target it locked on while that
   * target is alive, in range and inside the cone; with none it looks for the nearest one in its cone, at most every HOMING_RETARGET seconds
   * (the first search of a shot is staggered by its pool slot, so a volley does not search on one frame). The search is a radius query on the
   * field (spatial hash in Free Fly, cell lookup on the wall), not a scan of every target.
   */
  private homingTurn(i: number, field: TargetHoming, copies: number, level: number, dt: number): number {
    const pool = this.pool;
    const px = pool.x[i], py = pool.y[i];
    const vx = pool.vx[i], vy = pool.vy[i];
    const speed = Math.hypot(vx, vy);
    const hx = speed > 0 ? vx / speed : 1;
    const hy = speed > 0 ? vy / speed : 0;
    const range = homingRange(copies);
    const cosHalf = Math.cos(Math.min(Math.PI, (homingConeDeg(copies) / 2) * RAD));
    let dx = 0, dy = 0;
    let found = false;
    if (pool.homeId[i] >= 0) {
      const t = field.byId(pool.homeId[i]);
      if (t && t.hp > 0) {
        dx = this.dxw(t.x, px);
        dy = t.y - py;
        const d2 = dx * dx + dy * dy;
        found = d2 <= range * range && dx * hx + dy * hy >= Math.sqrt(d2) * cosHalf;
      }
      if (!found) pool.homeId[i] = -1;
    }
    pool.homeT[i] -= dt;
    if (!found && pool.homeT[i] <= 0) {
      pool.homeT[i] = HOMING_RETARGET;
      const pick = this.pick;
      if (field.nearestInCone(px, py, range, hx, hy, cosHalf, pick) && pick.target) {
        pool.homeId[i] = pick.target.id;
        dx = pick.dx; dy = pick.dy;
        found = true;
      }
    }
    if (!found) return 0;
    const diff = wrapAngle(Math.atan2(dy, dx) - Math.atan2(vy, vx));
    const maxStep = HOMING_RATE_DEG * level * harmonic(copies) * RAD * dt;
    this.fx.homingSteers++;
    return Math.max(-maxStep, Math.min(maxStep, diff));
  }

  /**
   * Graceful overload (chunk 21b). With the pool at CONFIG.OVERLOAD.EXPIRE_FROM of its size or more, removes plain shots that are off-screen
   * (see viewCx) and have hit nothing for CONFIG.OVERLOAD.STALE_AGE seconds, at most EXPIRE_PER_FRAME of them, and stops as soon as the pool
   * is under the threshold again. A shot with an AoE blast owed still pays it (retire). Returns how many were removed.
   */
  expireStale(): number {
    const pool = this.pool;
    const o = CONFIG.OVERLOAD;
    const floor = pool.max * o.EXPIRE_FROM;
    if (pool.count < floor) return 0;
    let n = 0;
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i] || pool.phase[i] !== PHASE_NORMAL) continue;
      if (pool.age[i] - pool.hitAge[i] < o.STALE_AGE) continue;
      if (pool.y[i] >= this.viewTop && pool.y[i] <= this.viewBottom && Math.abs(this.dxw(pool.x[i], this.viewCx)) <= this.viewHalfW) continue;
      this.retire(i);
      this.fx.expired++;
      if (++n >= o.EXPIRE_PER_FRAME || pool.count < floor) break;
    }
    return n;
  }

  /** Upturn (chunk 20b): turns the heading toward straight up, the short way, at UPTURN_RATE_DEG x harmonic(copies) degrees per second. */
  private upturn(i: number, copies: number, dt: number) {
    const pool = this.pool;
    const diff = wrapAngle(-Math.PI / 2 - Math.atan2(pool.vy[i], pool.vx[i]));
    if (Math.abs(diff) < 1e-4) return;
    const maxStep = UPTURN_RATE_DEG * harmonic(copies) * RAD * dt;
    this.rotateV(i, Math.max(-maxStep, Math.min(maxStep, diff)));
    this.fx.upturnTurns++;
  }

  /**
   * Centreline and Ship Magnet (chunk 20b): an acceleration added to the velocity. The speed may fall (a shot flying straight away from
   * the magnet slows down, turns and comes back) but never rises over the speed the shot was launched at, so a pull bends a shot
   * instead of speeding it up. Centreline pulls sideways toward the x the shot was fired from (proportional inside CENTRE_SOFT px, so it
   * does not jitter on the line); Ship Magnet pulls toward the ship's current position (proportional inside MAGNET_SOFT px). Extra copies
   * pull harder by the harmonic sum.
   */
  private pull(i: number, centreCopies: number, magnetCopies: number, dt: number) {
    const pool = this.pool;
    let ax = 0, ay = 0;
    if (centreCopies > 0) {
      const dx = this.dxw(pool.anchorX[i], pool.x[i]);
      ax += CENTRE_ACCEL * harmonic(centreCopies) * Math.max(-1, Math.min(1, dx / CENTRE_SOFT));
    }
    if (magnetCopies > 0) {
      const dx = this.dxw(this.shipX, pool.x[i]);
      const dy = this.shipY - pool.y[i];
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const a = MAGNET_ACCEL * harmonic(magnetCopies) * Math.min(1, d / MAGNET_SOFT);
        ax += (dx / d) * a;
        ay += (dy / d) * a;
      }
    }
    const vx = pool.vx[i] + ax * dt;
    const vy = pool.vy[i] + ay * dt;
    const sp = Math.hypot(vx, vy);
    const k = sp > pool.vmax[i] ? pool.vmax[i] / sp : 1;
    pool.vx[i] = vx * k;
    pool.vy[i] = vy * k;
  }

  /** Free Fly: rocks found through the spatial hash. */
  processHits(enemies: EnemyEntity[], spatial: SpatialHash, tier: number) {
    this.processField(new EnemyField(enemies, spatial), tier);
  }

  /** The one hit pipeline: every projectile against any set of targets (rocks or wall blocks). */
  processField(field: TargetField, tier: number) {
    const blast = this.blast;
    this.flushExitBlasts(field, tier);
    for (let i = 0; i < this.pool.max; i++) {
      if (!this.pool.active[i]) continue;

      let px = this.pool.x[i];
      let py = this.pool.y[i];
      let damage = this.pool.damage[i];
      const pure = this.pool.pure[i];
      const info = this.use(this.pool.modIndex[i]);

      const isPiercing = !!info.pierce;
      const bounceMod = info.bounce;
      const aoeMod = info.aoe;
      const rectMod = info.rect;
      const forkMod = info.fork;
      const armorPierce = info.armorPierce;
      const isShieldBreaker = info.shieldBreaker;
      const hitR = PROJECTILE_RADIUS * this.pool.size[i];

      const mi = info.mi;
      const phase = this.pool.phase[i];
      let target: EnemyEntity | null = null;
      if (phase === PHASE_ORBIT) {
        // An orbiting projectile may touch several targets at once: take the first one not hit within ORBIT_REHIT seconds.
        field.collectCircle(px, py, hitR, blast);
        for (const c of blast) {
          if (c.hp > 0 && !this.ringBlocked(i, c.id)) { target = c; break; }
        }
      } else {
        target = field.hitCircle(px, py, hitR, this.pool.skipId[i]);
        if (!target && phase !== PHASE_MINE_WAIT) {
          // Chunk 20b: a fast shot (Accelerator) moves further in one step than a target is wide: look along the path it just flew.
          const swept = this.sweep(i, field, hitR);
          if (swept) { target = swept.target; px = swept.x; py = swept.y; this.pool.x[i] = px; this.pool.y[i] = py; this.fx.sweepHits++; }
        }
      }
      if (!target) continue;
      if (phase === PHASE_MINE_WAIT) this.fx.mineDetonations++;
      const kAlign = this.mv.align, kPersist = this.mv.persist;
      // Legendary hit-time factors (Last Breath, Zigzag). `shotDamage` is what the shot carries on; `damage` is this hit's.
      const shotDamage = damage;
      if (info.hitFactor) damage *= this.hitFactor(i, info.mods);
      this.pool.hitAge[i] = this.pool.age[i];

      // ---- 1. the direct hit (every hit)
      const pool = this.pool;
      const isCopy = pool.copy[i] === 1;
      const first = pool.hits[i] === 0;
      if (first) pool.firstDamage[i] = damage;
      if (pool.hits[i] < 255) pool.hits[i]++;
      // A stacked AoE costs the whole shot 5% damage per extra copy (direct hit and blast alike, so the builder's estimate can show it).
      const aoeFactor = isCopy ? 1 : aoeMod ? aoeStackDamage(this.stk.aoeCircle) : rectMod ? aoeStackDamage(this.stk.aoeRect) : 1;
      this.leftFrac = 0;
      this.trackLeft = kPersist > 0;
      this.strike(target, damage * aoeFactor, pure, tier, armorPierce, isShieldBreaker, mi, px, py, HIT_NORMAL);
      this.trackLeft = false;
      const leftFrac = this.leftFrac; // Persist: the share of this hit's damage the target did not need

      // ---- 2. what happens to the shot: does this hit use it up? (decided here, carried out in step 4)
      const aoeAny = aoeMod || rectMod;
      const keepsFlying = phase === PHASE_ORBIT || phase === PHASE_BOOM_OUT || phase === PHASE_BOOM_BACK;
      let ended = false;
      let pierceDamage = 0; // the shot's damage after this hit when it pierces
      let bounceOnPierceEnd = false;
      // Chunk 20b, in this order (docs/motion-blocks.md section 1): Persist (killed with damage to spare), then the old rules. (Reverse was removed in 21a.)
      const persists = !keepsFlying && kPersist > 0 && leftFrac > 0;
      const persistDamage = shotDamage * leftFrac;
      if (persists) {
        ended = false;
      } else if (keepsFlying) {
        // Orbit and Boomerang shots never end by a hit; with an AoE block they explode on the first hit instead (docs/interactions.md).
        ended = !!aoeAny && triggerCarried(TRIGGERS.aoe, isCopy);
      } else if (isPiercing) {
        // Chunk 19a: pierce by count. A piercing shot passes through what it hit and cannot hit it again; every Piercing copy on the
        // path lets it through ONE more target (1 copy: 2 targets). Damage stays PIERCE_DAMAGE_KEEP of the hit before (1.0: full).
        const canPierce = pool.pierced[i] < this.stk.pierce;
        pierceDamage = shotDamage * PIERCE_DAMAGE_KEEP;
        // Piercing first; a Bouncing block turns the shot that Piercing would have used up into a bounce, at full damage.
        bounceOnPierceEnd = !canPierce && !!bounceMod && this.bouncesLeft(i, bounceMod.level ?? 1) > 0;
        ended = !canPierce && !bounceOnPierceEnd;
      } else if (bounceMod && this.bouncesLeft(i, bounceMod.level ?? 1) > 0) {
        ended = false;
      } else {
        ended = true;
      }

      // ---- 3. the effects with a trigger (engine/triggers.ts); a fork copy only has what the table lets it carry
      if (mi.gravity && triggerCarried(TRIGGERS.gravityWell, isCopy) && triggerDue(TRIGGERS.gravityWell, first, ended)) this.addWell(px, py, mi.gravity);
      if (forkMod && triggerCarried(TRIGGERS.fork, isCopy) && triggerDue(TRIGGERS.fork, first, ended)) this.fork(i, target.id, forkMod.level ?? 1, this.stk.fork, damage);
      if (mi.chain && triggerCarried(TRIGGERS.chain, isCopy) && pool.chains[i] < (TRIGGERS.chain.maxPerShot ?? 255) && triggerDue(TRIGGERS.chain, first, ended)) {
        pool.chains[i]++;
        this.chain(field, target, damage, pure, tier, armorPierce, isShieldBreaker, mi);
      }
      if (aoeAny && triggerCarried(TRIGGERS.aoe, isCopy) && TRIGGERS.aoe.fires === 'shot_end' && !ended) {
        // The shot flies on: the blast is owed where it last hit, and comes when it leaves play (retire()).
        pool.aoePending[i] = 1;
        pool.lastX[i] = px;
        pool.lastY[i] = py;
      }
      if (aoeAny && triggerCarried(TRIGGERS.aoe, isCopy) && triggerDue(TRIGGERS.aoe, first, ended)) {
        // The target of this hit took the direct hit; everything else in the area takes the blast (a stacked AoE: x0.95 per extra copy).
        this.fx.aoeBlasts++;
        // On every hit the blast is as strong as this hit; a rule that waits for the shot's end pays the first hit's damage.
        const blastDamage = TRIGGERS.aoe.fires === 'shot_end' ? pool.firstDamage[i] : damage;
        if (aoeMod) {
          const radius = (aoeMod.radius || aoeCircleRadius(aoeMod.level ?? 1)) * stackGrowth(this.stk.aoeCircle);
          field.collectCircle(px, py, radius, blast);
          this.blastOthers(blast, target, blastDamage * aoeFactor, pure, tier, armorPierce, isShieldBreaker, mi);
        } else {
          // A block of wall cells centred on the hit block, reaching behind it (aoeRectCells).
          const { cols, rows } = aoeRectCells(this.stk.aoeRect);
          field.collectArea(target, cols, rows, blast);
          this.blastOthers(blast, target, blastDamage * aoeFactor, pure, tier, armorPierce, isShieldBreaker, mi);
        }
      }

      // ---- 4. carry out the shot's movement
      if (ended) { pool.free(i); continue; }
      if (phase === PHASE_ORBIT) {
        this.ringAdd(i, target.id); // orbiting: hits, and keeps going
      } else if (phase === PHASE_BOOM_OUT || phase === PHASE_BOOM_BACK) {
        pool.skipId[i] = target.id; // a boomerang flies on through what it hit; each leg hits a target once
      } else if (persists) {
        // Persist: the target is dead; the shot goes on with the damage it did not need.
        pool.skipId[i] = target.id;
        pool.damage[i] = persistDamage;
        this.fx.persistContinues++;
      } else if (isPiercing) {
        pool.skipId[i] = target.id;
        if (bounceOnPierceEnd) { pool.damage[i] = shotDamage; pool.pierced[i] = 0; this.bounce(i, field, target, px, py, hitR); }
        else { this.fx.pierceHits++; pool.damage[i] = pierceDamage; pool.pierced[i]++; }
      } else {
        this.bounce(i, field, target, px, py, hitR); // ricochet off whatever it hit, full damage kept
      }
      // Align: a shot that survived this hit by passing, bouncing or persisting flies straight up again.
      if (kAlign > 0 && !keepsFlying) {
        const sp = Math.hypot(pool.vx[i], pool.vy[i]);
        pool.vx[i] = 0;
        pool.vy[i] = -sp;
        this.fx.aligns++;
      }
    }
  }

  /**
   * Swept hit test (chunk 20b): the shot moved from (prevX, prevY) to its position in one step. A move longer than SWEEP_MIN px is
   * looked at in points no further apart than the shot's radius (at least SWEEP_MIN_SPACING px), earliest first; the first target
   * touched wins. Null for a short move, a move over SWEEP_MAX px (a wrap or a jump) or nothing in the way.
   */
  private sweep(i: number, field: TargetField, hitR: number): { target: EnemyEntity; x: number; y: number } | null {
    const pool = this.pool;
    const dx = this.dxw(pool.x[i], pool.prevX[i]);
    const dy = pool.y[i] - pool.prevY[i];
    const len = Math.hypot(dx, dy);
    if (!(len > SWEEP_MIN) || len > SWEEP_MAX) return null;
    const n = Math.ceil(len / Math.max(SWEEP_MIN_SPACING, hitR));
    for (let k = 1; k < n; k++) {
      let x = pool.prevX[i] + (dx * k) / n;
      const y = pool.prevY[i] + (dy * k) / n;
      if (this.wrapW > 0) x = ((x % this.wrapW) + this.wrapW) % this.wrapW;
      const t = field.hitCircle(x, y, hitR, pool.skipId[i]);
      if (t) return { target: t, x, y };
    }
    return null;
  }

  /**
   * Damage factor of a hit from the modifiers that read the shot's state (chunk 20a): Last Breath doubles a hit in the last second of
   * the shot's life, Zigzag adds ZIGZAG_GAIN per direction change so far. 1 for a shot with neither.
   */
  private hitFactor(i: number, mods: Modifier[]): number {
    let f = 1;
    for (const m of mods) {
      if (m.type === 'last_breath') {
        const k = lastBreathMul(this.pool.age[i], this.pool.life[i]);
        if (k > 1) { f *= k; this.fx.lastBreathHits++; }
      } else if (m.type === 'zigzag') f *= zigzagMul(this.pool.zigN[i]);
    }
    return f;
  }

  /** AoE blasts owed by shots that left play after hitting (retire()): x, y, damage, pure, modifier list, the target not to hit again. */
  private exitBlasts: { x: number; y: number; dmg: number; pure: number; mod: number; skip: number }[] = [];

  /**
   * A shot leaves play without being used up by a hit (flew off the screen, too old): frees it. If an AoE blast is still owed
   * (it pierced or bounced and the blast waits for the shot's end) the blast goes off where the shot last hit, in the next hit step.
   */
  retire(i: number) {
    const pool = this.pool;
    if (pool.active[i] && pool.aoePending[i]) {
      const info = this.use(pool.modIndex[i]);
      const circle = info.stk.aoeCircle;
      const rect = info.stk.aoeRect;
      const f = circle ? aoeStackDamage(circle) : aoeStackDamage(rect);
      this.exitBlasts.push({ x: pool.lastX[i], y: pool.lastY[i], dmg: pool.firstDamage[i] * f, pure: pool.pure[i], mod: pool.modIndex[i], skip: pool.skipId[i] });
    }
    pool.free(i);
  }

  private flushExitBlasts(field: TargetField, tier: number) {
    const list = this.exitBlasts;
    for (const b of list) {
      const info = this.use(b.mod);
      const mi = info.mi;
      const aoeMod = info.aoe;
      const rectMod = info.rect;
      const armorPierce = info.armorPierce;
      const shieldBreaker = info.shieldBreaker;
      this.fx.aoeBlasts++;
      if (aoeMod) field.collectCircle(b.x, b.y, (aoeMod.radius || aoeCircleRadius(aoeMod.level ?? 1)) * stackGrowth(this.stk.aoeCircle), this.blast);
      else if (rectMod) {
        // No target to centre on (the rule that waits for the shot's end): the same cells around the point it last hit.
        const { cols, rows } = aoeRectCells(this.stk.aoeRect);
        field.collectRect(b.x, b.y - ((rows - 1) * CELL) / 2, cols * CELL, rows * CELL, this.blast);
      } else continue;
      for (const ce of this.blast) {
        if (ce.id === b.skip || ce.hp <= 0) continue;
        this.strike(ce, b.dmg, b.pure, tier, armorPierce, shieldBreaker, mi, ce.x, ce.y, HIT_NORMAL);
      }
    }
    list.length = 0;
  }

  /** The blast of an AoE: every living target in the list except the one that took the direct hit. */
  private blastOthers(
    list: EnemyEntity[], skip: EnemyEntity, dmg: number, pure: number, tier: number, armorPierce: number,
    shieldBreaker: number | boolean, mi: EffectLevels,
  ) {
    for (const ce of list) {
      if (ce === skip || ce.hp <= 0) continue;
      this.strike(ce, dmg, pure, tier, armorPierce, shieldBreaker, mi, ce.x, ce.y, HIT_NORMAL);
    }
  }

  // ------------------------------------------------------------------ bouncing
  /** Bounces a projectile has left (set at launch; set here for a projectile made without init()). */
  bouncesLeft(i: number, level: number): number {
    if (this.pool.bounces[i] < 0) this.pool.bounces[i] = bounceCount(level);
    return this.pool.bounces[i];
  }

  /**
   * One bounce: reflect off the surface the field reports (the contact normal), add up to +/- BOUNCE_SPREAD_DEG of seeded
   * random spread, keep the speed, use up one bounce. The target it hit is skipped until it hits something else, so a
   * bounce that points back into it cannot hit it twice. A spread that would aim into the surface turns the other way.
   */
  private bounce(i: number, field: TargetField, target: EnemyEntity, px: number, py: number, hitR: number) {
    const pool = this.pool;
    const info = field.bounceInfo ? field.bounceInfo(target, px, py, hitR) : null;
    let vx = pool.vx[i];
    let vy = pool.vy[i];
    const speed = Math.hypot(vx, vy) || 1;
    if (info) {
      const vn = vx * info.nx + vy * info.ny;
      if (vn < 0) { vx -= 2 * vn * info.nx; vy -= 2 * vn * info.ny; }
      pool.x[i] += info.nx * info.push;
      pool.y[i] += info.ny * info.push;
    } else { vx = -vx; vy = -vy; }
    const spread = (rng.combat.next() * 2 - 1) * BOUNCE_SPREAD_DEG * RAD;
    const base = Math.atan2(vy, vx);
    let a = base + spread;
    if (info && Math.cos(a) * info.nx + Math.sin(a) * info.ny < 0.1) a = base - spread;
    if (info && Math.cos(a) * info.nx + Math.sin(a) * info.ny < 0.1) a = base;
    pool.vx[i] = Math.cos(a) * speed;
    pool.vy[i] = Math.sin(a) * speed;
    pool.skipId[i] = target.id;
    pool.bounces[i]--;
    this.fx.bounces++;
  }

  /** Free Fly screen edges: a Bouncing projectile with bounces left reflects off the edge it crossed (no damage). Returns true if it did. */
  edgeBounce(i: number, minX: number, maxX: number, minY: number, maxY: number): boolean {
    const pool = this.pool;
    if (pool.bounces[i] <= 0) return false;
    let hit = false;
    if (pool.x[i] < minX && pool.vx[i] < 0) { pool.x[i] = minX; pool.vx[i] = -pool.vx[i]; hit = true; }
    else if (pool.x[i] > maxX && pool.vx[i] > 0) { pool.x[i] = maxX; pool.vx[i] = -pool.vx[i]; hit = true; }
    if (pool.y[i] < minY && pool.vy[i] < 0) { pool.y[i] = minY; pool.vy[i] = -pool.vy[i]; hit = true; }
    else if (pool.y[i] > maxY && pool.vy[i] > 0) { pool.y[i] = maxY; pool.vy[i] = -pool.vy[i]; hit = true; }
    if (!hit) return false;
    pool.bounces[i]--;
    pool.skipId[i] = -1;
    this.fx.bounces++;
    this.fx.edgeBounces++;
    return true;
  }

  // ------------------------------------------------------------------ orbit: recently hit targets
  private ringBlocked(i: number, id: number): boolean {
    const pool = this.pool;
    const n = pool.ringN[i];
    const base = i * RING;
    for (let k = 0; k < n; k++) {
      if (pool.ringId[base + k] === id && this.clock - pool.ringT[base + k] < ORBIT_REHIT / harmonic(this.stk.orbit)) return true;
    }
    return false;
  }

  private ringAdd(i: number, id: number) {
    const pool = this.pool;
    const base = i * RING;
    const n = pool.ringN[i];
    // Reuse the entry of this target, else the next free slot, else overwrite the oldest.
    let slot = -1;
    let oldest = 0;
    for (let k = 0; k < n; k++) {
      if (pool.ringId[base + k] === id) { slot = k; break; }
      if (pool.ringT[base + k] < pool.ringT[base + oldest]) oldest = k;
    }
    if (slot < 0) {
      if (n < RING) { slot = n; pool.ringN[i] = n + 1; } else slot = oldest;
    }
    pool.ringId[base + slot] = id;
    pool.ringT[base + slot] = this.clock;
  }

  // ------------------------------------------------------------------ damage and status
  /**
   * One target takes one hit: Executioner and frozen bonuses, armor/shield maths (applyDamage), the hit callback, then the
   * statuses of the projectile (Ignite, Frostbite, Corrosion). Every damage source of the pipeline goes through here.
   */
  private strike(
    t: EnemyEntity, dmg: number, pure: number, tier: number, armorPierce: number, shieldBreaker: number | boolean,
    mi: EffectLevels,
    x: number, y: number, kind: number,
  ): DamageResult {
    let d = dmg;
    // Captain effects: damage %, and the extra against armor, shields and fragments (all identity when neutral).
    const cb = this.bonus;
    if (cb.damageMul !== 1) d *= cb.damageMul;
    if (cb.vsArmor > 0 && t.armor > 0) d *= 1 + cb.vsArmor;
    if (cb.vsShield > 0 && t.shield > 0) d *= 1 + cb.vsShield;
    if (cb.vsFragment > 0 && t.generation !== undefined && t.generation >= FRAGMENT_GENERATION) d *= 1 + cb.vsFragment;
    // Cleaver (rocks only: wall blocks have no generation): fragments take more, parents less.
    if (mi.cleaver && t.generation !== undefined) {
      d *= t.generation >= FRAGMENT_GENERATION ? cleaverBonus(mi.cleaver) : cleaverPenalty(mi.cleaver);
      this.fx.cleaverHits++;
    }
    // Culling Bolt: a share of the target's max HP on top of the hit, at most CULLING_CAP times the packet's damage.
    if (mi.culling) { d += Math.min(cullingPct(mi.culling) * t.maxHp, CULLING_CAP * dmg); this.fx.cullingHits++; }
    if (mi.executioner && t.hp < t.maxHp * EXECUTIONER_BELOW) { d *= executionerMul(mi.executioner); this.fx.executionerHits++; }
    if ((t.freezeT ?? 0) > 0) { d *= 1 + (t.freezeBonus ?? 0); this.fx.frozenBonusHits++; }
    if (this.trackLeft) {
      // Persist: how much of this hit the target needed to die (the shot keeps the rest); 0 left when it survives.
      this.trackLeft = false;
      const need = damageToKill(t, pure, tier, armorPierce, shieldBreaker);
      this.leftFrac = d > 0 && need < d ? 1 - need / d : 0;
    }
    const res = applyDamage(t, d, pure, tier, armorPierce, shieldBreaker);
    this.noteDamage(d);
    if (this.onHit) this.onHit(t, res.hpDamage, x, y, kind);
    this.afterHit(t, res.killed, d, mi, kind);
    if (t.hp > 0) {
      if (mi.ignite) this.ignite(t, d * igniteFrac(mi.ignite));
      if (mi.frostbite) this.freeze(t, mi.frostbite);
      // Static Charge: the STATIC_HITS-th hit inside the window releases an extra pulse and the count starts over.
      if (mi.staticCharge && this.staticCount(t)) {
        const extra = d * staticFrac(mi.staticCharge);
        const r2 = applyDamage(t, extra, pure, tier, armorPierce, shieldBreaker);
        this.noteDamage(extra);
        this.fx.staticPulses++;
        if (this.onHit) this.onHit(t, r2.hpDamage, x, y, HIT_PULSE);
        this.afterHit(t, r2.killed, extra, mi, HIT_PULSE);
        if (r2.killed) res.killed = true;
      }
    }
    if (mi.corrosion && t.armor > 0) this.corrode(t, mi.corrosion);
    return res;
  }

  /** Run statistics (chunk 21a): a hit that is not a number or not positive counts for nothing; the total never overflows to Infinity. */
  private noteDamage(d: number) {
    if (!(d > 0)) return;
    const st = this.runStats;
    if (d > st.bestShot) st.bestShot = Math.min(d, Number.MAX_VALUE);
    st.totalDamage = Math.min(Number.MAX_VALUE, st.totalDamage + d);
  }

  /**
   * What a hit leaves behind on the target: Cauterize and Overkill Spill marks (rocks), a Fission Catalyst request when it did
   * not kill (rocks; the world acts on it), and a Residue Seed cloud where a target died. `d` is the damage of that hit.
   */
  private afterHit(t: EnemyEntity, killed: boolean, d: number, mi: EffectLevels, kind: number) {
    const rock = t.generation !== undefined;
    // Chunk 14a cap: what a kill passes on (Spill burst, Residue cloud) counts the killing hit only up to the target's max HP.
    // Without it a rare huge shot (stacked Alternators, Capacitor) killing a small target seeded a cloud worth many targets.
    const worth = Math.min(d, t.maxHp);
    if (rock) {
      if (mi.cauterize) {
        t.cauterizedTimer = Math.max(t.cauterizedTimer ?? 0, cauterizeTime(mi.cauterize));
        t.cauterizeBonus = Math.max(t.cauterizeBonus ?? 0, cauterizeBonus(mi.cauterize));
        this.fx.cauterizeMarks++;
      }
      if (killed) {
        if (mi.spill) { t.spillBurst = Math.max(t.spillBurst ?? 0, worth * spillFrac(mi.spill)); this.fx.spillMarks++; }
      } else if (mi.fission) {
        t.fissionLevel = Math.max(t.fissionLevel ?? 0, mi.fission);
        this.fx.fissionMarks++;
      }
    }
    if (killed && mi.residue && kind !== HIT_CLOUD && kind !== HIT_BURN) this.addCloud(t.x, t.y, worth * residueFrac(mi.residue));
  }

  /** Counts a hit on `t` for Static Charge; true when it is the STATIC_HITS-th inside STATIC_WINDOW (the count is reset then). */
  private staticCount(t: EnemyEntity): boolean {
    if (t.scN === undefined || this.clock - (t.scFirst ?? 0) > STATIC_WINDOW) { t.scN = 1; t.scFirst = this.clock; }
    else t.scN++;
    if (t.scN >= STATIC_HITS) { t.scN = 0; return true; }
    return false;
  }

  // ------------------------------------------------------------------ Residue Seed clouds and Gravity Well attractors
  private addCloud(x: number, y: number, dmgPerTick: number) {
    const k = this.cloudNext;
    this.cloudNext = (k + 1) % CLOUD_MAX;
    this.cloudX[k] = x; this.cloudY[k] = y; this.cloudT[k] = RESIDUE_TIME; this.cloudD[k] = dmgPerTick; this.cloudTick[k] = 0;
    this.fx.residueClouds++;
  }

  private addWell(x: number, y: number, level: number) {
    const k = this.wellNext;
    this.wellNext = (k + 1) % WELL_MAX;
    this.wellX[k] = x; this.wellY[k] = y; this.wellT[k] = WELL_TIME; this.wellS[k] = wellPull(level);
    this.fx.wellsMade++;
  }

  /** A level ended: drops every shot in flight, cloud, attractor and arc, so the frozen last frame shows nothing still moving. */
  dropAll() {
    for (let i = 0; i < this.pool.max; i++) this.pool.free(i);
    this.arcT.fill(0);
    this.clearFieldFx();
  }

  /** Drops every cloud and attractor (a restarted run). */
  clearFieldFx() {
    this.cloudT.fill(0);
    this.wellT.fill(0);
  }

  /** Moves every cloud down the screen with a scrolling wall (the cloud stays where the block died). */
  shiftClouds(dy: number) {
    for (let k = 0; k < CLOUD_MAX; k++) if (this.cloudT[k] > 0) this.cloudY[k] += dy;
  }

  /**
   * Per step, after the hits: ages the clouds and the attractors, and ticks every cloud that is due: each living target inside
   * the radius takes the tick's damage (armor and shield apply, nothing else; a kill by a cloud leaves no new cloud).
   */
  updateClouds(dt: number, field: TargetField, tier: number) {
    for (let k = 0; k < WELL_MAX; k++) if (this.wellT[k] > 0) this.wellT[k] -= dt;
    const buf = this.blast;
    for (let k = 0; k < CLOUD_MAX; k++) {
      if (this.cloudT[k] <= 0) continue;
      this.cloudT[k] -= dt;
      this.cloudTick[k] += dt;
      while (this.cloudTick[k] >= RESIDUE_TICK - 1e-9) {
        this.cloudTick[k] -= RESIDUE_TICK;
        field.collectCircle(this.cloudX[k], this.cloudY[k], RESIDUE_RADIUS, buf);
        for (const c of buf) {
          if (c.hp <= 0) continue;
          const res = applyDamage(c, this.cloudD[k], 0, tier);
          this.noteDamage(this.cloudD[k]);
          this.fx.residueTicks++;
          if (this.onHit) this.onHit(c, res.hpDamage, c.x, c.y, HIT_CLOUD);
        }
      }
    }
  }

  private track(t: EnemyEntity) {
    if (!t.tracked) { t.tracked = true; this.affected.push(t); }
  }

  /** Burn: refreshes the timer, keeps the stronger of the two rates (never stacks). */
  private ignite(t: EnemyEntity, dps: number) {
    t.burnT = IGNITE_TIME;
    if (dps > (t.burnDps ?? 0)) t.burnDps = dps;
    if (t.burnTick === undefined) t.burnTick = 0;
    this.fx.igniteApplied++;
    this.track(t);
  }

  private freeze(t: EnemyEntity, level: number) {
    const time = frostTime(level);
    if (time > (t.freezeT ?? 0)) t.freezeT = time;
    if (frostSlow(level) > (t.freezeSlow ?? 0)) t.freezeSlow = frostSlow(level);
    if (frostBonus(level) > (t.freezeBonus ?? 0)) t.freezeBonus = frostBonus(level);
    this.fx.freezeApplied++;
    this.track(t);
  }

  /** Corrosion: 5% of the remaining armor per hit, never below (1 - cap) of the original. */
  private corrode(t: EnemyEntity, level: number) {
    if (t.armor0 === undefined) t.armor0 = t.armor;
    const floor = t.armor0 * (1 - corrosionCap(level));
    const next = Math.max(floor, t.armor * (1 - CORROSION_STEP));
    if (next < t.armor) { t.armor = next; this.fx.corrosionStrips++; }
  }

  /** Signed x delta a - b, the short way round on a ring wall (plain subtraction when the world does not wrap). */
  private dxw(a: number, b: number): number {
    return this.wrapW > 0 ? wrapDx(a, b, this.wrapW) : a - b;
  }

  private addArc(x0: number, y0: number, x1: number, y1: number) {
    const k = this.arcNext;
    this.arcNext = (k + 1) % ARC_MAX;
    this.arcX0[k] = x0; this.arcY0[k] = y0; this.arcX1[k] = x1; this.arcY1[k] = y1;
    this.arcT[k] = CHAIN_ARC_LIFE;
  }

  /** Chain Lightning: from the target that was hit, jump to the nearest unhit living target in range, up to the level's count. */
  private chain(
    field: TargetField, origin: EnemyEntity, damage: number, pure: number, tier: number, armorPierce: number,
    shieldBreaker: number | boolean, mi: EffectLevels,
  ) {
    const seen = this.chainSeen;
    const buf = this.chainBuf;
    seen.length = 0;
    seen.push(origin.id);
    let cur = origin;
    const baseJumps = chainJumps(mi.chain);
    const jumps = baseJumps + Math.max(0, this.stk.chain - 1);
    for (let j = 0; j < jumps; j++) {
      field.collectCircle(cur.x, cur.y, CHAIN_RANGE, buf);
      let best: EnemyEntity | null = null;
      let bestD = CHAIN_RANGE * CHAIN_RANGE;
      for (const c of buf) {
        if (c.hp <= 0 || seen.includes(c.id)) continue;
        const d2 = this.dxw(c.x, cur.x) ** 2 + (c.y - cur.y) ** 2;
        if (d2 <= bestD) { bestD = d2; best = c; }
      }
      if (!best) break;
      seen.push(best.id);
      this.addArc(cur.x, cur.y, cur.x + this.dxw(best.x, cur.x), best.y);
      this.strike(best, damage * CHAIN_FRAC * (j < baseJumps ? 1 : Math.pow(CHAIN_STACK_FALL, j - baseJumps + 1)), pure, tier, armorPierce, shieldBreaker, mi, best.x, best.y, HIT_CHAIN);
      this.fx.chainJumps++;
      cur = best;
    }
  }

  /** Per step: arc lifetimes, burn ticks and freeze timers. Call once per update, before the hits of that step. */
  updateStatus(dt: number) {
    for (let k = 0; k < ARC_MAX; k++) if (this.arcT[k] > 0) this.arcT[k] -= dt;
    const list = this.affected;
    for (let k = list.length - 1; k >= 0; k--) {
      const t = list[k];
      if (t.hp > 0) {
        if ((t.freezeT ?? 0) > 0) {
          t.freezeT = (t.freezeT as number) - dt;
          if (t.freezeT <= 0) { t.freezeT = 0; t.freezeSlow = 0; t.freezeBonus = 0; }
        }
        if ((t.burnT ?? 0) > 0) {
          const step = Math.min(dt, t.burnT as number);
          t.burnT = (t.burnT as number) - dt;
          t.burnTick = (t.burnTick ?? 0) + step;
          while ((t.burnTick as number) >= BURN_TICK - 1e-9 && t.hp > 0) {
            t.burnTick = (t.burnTick as number) - BURN_TICK;
            this.burn(t, (t.burnDps ?? 0) * BURN_TICK);
          }
          if (t.burnT <= 0) {
            // Burn over: pay the part of a tick that is left, so the total is exactly rate x duration.
            if ((t.burnTick as number) > 1e-6 && t.hp > 0) this.burn(t, (t.burnDps ?? 0) * (t.burnTick as number));
            t.burnT = 0; t.burnDps = 0; t.burnTick = 0;
          }
        }
      }
      if (t.hp <= 0 || ((t.burnT ?? 0) <= 0 && (t.freezeT ?? 0) <= 0)) {
        t.tracked = false;
        list[k] = list[list.length - 1];
        list.pop();
      }
    }
  }

  private burn(t: EnemyEntity, dmg: number) {
    if (!(dmg > 0)) return; // NaN or nothing: no tick
    const d = (t.freezeT ?? 0) > 0 ? dmg * (1 + (t.freezeBonus ?? 0)) : dmg;
    const taken = Math.min(Math.max(0, t.hp), d);
    t.hp -= d;
    this.fx.burnTicks++;
    if (this.onHit) this.onHit(t, taken, t.x, t.y, HIT_BURN);
  }

  /**
   * Pairs of copies at a fraction of the damage and 0.6x size, +/- 35 degrees x j off the heading for the j-th pair (one pair per Fork
   * block on the path; each pair deals 0.8 of the one before). They cannot fork again, and the pool's limit stops the spawns.
   */
  private fork(i: number, enemyId: number, level: number, pairs: number, shotDamage: number) {
    const pool = this.pool;
    this.fx.forks++;
    const speed = Math.hypot(pool.vx[i], pool.vy[i]);
    const heading = Math.atan2(pool.vy[i], pool.vx[i]);
    for (let j = 1; j <= pairs; j++) {
      const dmg = shotDamage * forkDamageFrac(level) * Math.pow(FORK_PAIR_DAMAGE, j - 1);
      for (const sign of [-1, 1]) {
        if (!pool.admits('fork')) { this.fx.forksRefused++; return; } // chunk 21b: the cheapest shots are refused first as the pool fills
        const a = heading + sign * Math.min(FORK_ANGLE_DEG * j, 85) * RAD;
        const k = pool.spawn(pool.x[i], pool.y[i], Math.cos(a) * speed, Math.sin(a) * speed, dmg, pool.pure[i], pool.modIndex[i]);
        if (k < 0) return; // the pool is full: no more forks this hit
        pool.size[k] = pool.size[i] * FORK_SIZE;
        pool.life[k] = pool.life[i];
        pool.anchorX[k] = pool.anchorX[i];
        pool.copy[k] = 1;
        pool.skipId[k] = enemyId;
        this.init(k);
      }
    }
  }
}
