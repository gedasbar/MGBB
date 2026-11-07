import { CONFIG, HIT_RADIUS, shipHalfW, TOUCH_DIRECT_OFFSET_Y } from '../config';
import { segDistSq, stepToward } from '../engine/steer';
import { ProjectilePool } from '../engine/pools';
import { MitosisSystem } from '../engine/mitosis';
import { ProjectileSystem, beyondDespawn } from '../engine/projectiles';
import { SpatialHash } from '../engine/spatialHash';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { Gun, PX_PER_CELL, spawnOffsetsFor } from './fire';
import { PointerState } from '../input';
import { buildStarterGrid, ROCK_RADIUS } from './starter';
import { leakDamage, rockHp, rockReward, tierOfTime, wholeRockHp } from '../econ/economy';
import { easeK, EASE_TIME, SPAWN_INVULN_SECONDS } from '../engine/control';
import { fireRateMul, hitRadiusOf, shotSpeedMul } from '../data/hulls';
import { speciesOf } from '../data/species';
import { ENEMIES } from '../data/enemies';
import { EnemyField } from '../engine/targets';
import { HIT_BURN, HIT_CLOUD, PHASE_NORMAL } from '../engine/projectiles';
import { fissionCooldown, SPILL_CHAIN_DEPTH, WELL_RADIUS } from '../engine/effects';
import { FREEFLY_REWARD_MUL, freeFlyRewardTier, waveBonus, waveHpMul, WAVE_TIME } from '../data/waves';
import { PlannedSpawn, WaveDirector, WaveRules } from './waves';
import type { TwistEffects } from '../data/dailyRun';
import { ALIVE_HOLD } from '../data/waves';
import { EncounterDirector } from '../frontier/encounter';
import { SHIELD_REGEN_DELAY, SHIELD_REGEN_PER_SEC } from '../wall/constants';
import type { MitosisEnemy } from '../engine/mitosis';
import { neutralModifiers, RunModifiers } from '../captains/modifiers';
import { applyHullTraits } from '../shipyard/registry';
import { encounterCores, encounterCoresPerBlock, ENCOUNTER_CORES_SECONDS, waveStartCores } from '../shipyard/cores';
import { CrystalField, killShare, pickupRadius } from '../engine/coreCrystals';
import { CRYSTAL_SHARE } from '../data/coreCrystals';
import { REPAIR_IDLE_SECONDS } from '../shipyard/constants';
import { FlyTraits, NEUTRAL_FLY } from '../shipyard/flyTraits';
import { EnemyBullets } from '../engine/enemyBullets';
import { ENEMY_BULLET_DAMAGE, ENEMY_BULLET_INVULN, ENEMY_BULLET_SPEED } from '../data/enemyBullets';
import { burstVelocities, gunStep, GunState, newGunState, nearestWithin } from './support';
import { themeAt, themeCores, ThemeId } from '../data/waveThemes';
import { BossFight, BossHost } from './boss';
import { BOSS_CORES_MUL, BOSS_CREDIT_MUL, bossAt, bossMaxHp, BossId } from '../data/bosses';
import { coresForWave } from '../shipyard/cores';

export const TOUCH_OFFSET_Y = TOUCH_DIRECT_OFFSET_Y; // finger sits below the ship on touch (direct mode)
export { PX_PER_CELL };
const CONTACT_DAMAGE = 10;
/** Hull of an unmodified ship. Leak damage always uses this base (a captain's extra hull does not make leaks hurt more). */
const BASE_HULL = 100;
/** A rock whose centre stays above the top edge this long is moved in at the edge. */
export const ABOVE_SCREEN_MAX = 6;

/** `kind`: 0 projectile hit, 1 burn tick, 2 chain jump (HIT_* in engine/projectiles). */
/** One hit on a rock. `armor`, `shield` and `maxShield` are what the rock has left AFTER the hit (the sound layer reads them). */
export interface HitEvent { big: boolean; enemyId: number; damage: number; x: number; y: number; kind: number; armor: number; shield: number; maxShield: number }
/** An enemy body died: `reward` is the credits it paid (fractional; the run keeps the exact total). */
export interface KillEvent { x: number; y: number; reward: number; generation: number; defId: string; radius: number; }
/** A boss moment the screen announces (chunk 32b): it enrages, or it dies and pays `credits` and `cores`. */
export interface BossEvent { kind: 'enrage' | 'defeat'; id: BossId; name: string; credits: number; cores: number; noHit: boolean; x: number; y: number }
/** A support enemy's visible link (chunk 32a): from a Shielder or Leech at (ax, ay) to the body `id` at (bx, by), radius `r`. */
export interface SupportLink { kind: 'shield' | 'leech'; id: number; ax: number; ay: number; bx: number; by: number; r: number }
export interface SplitEvent { parentId: number; x: number; y: number; radius: number; childIds: number[]; defId: string; }

/**
 * Pure game simulation (no Pixi). main.ts renders it; tests drive it directly.
 */
export class World {
  readonly pool = new ProjectilePool();
  readonly projSys = new ProjectileSystem(this.pool);
  readonly mitosis = new MitosisSystem();
  /** Enemy bullets (chunk 32a): their own pool; they outlive their shooter and cannot be shot. */
  readonly enemyBullets = new EnemyBullets();
  /** The boss of the current wave while it lives (chunk 32b, docs/freefly-bosses.md), else null. */
  boss: BossFight | null = null;
  /** Bosses killed this run, each with whether the hull was untouched during its fight; moments for the screen to announce (it clears them). */
  readonly bossesDefeated: { id: BossId; wave: number; noHit: boolean }[] = [];
  bossEvents: BossEvent[] = [];
  /** The hull (or a Second Chance charge) was hit during the current boss fight. */
  private bossHurt = false;
  /** Links of the Shielders and Leeches alive this frame (the screen draws them). */
  readonly links: SupportLink[] = [];
  /** Enemy bullets that hurt the ship this run (stats and tests). */
  bulletHits = 0;
  readonly recipes: EjectorRecipe[];
  readonly gun: Gun;
  readonly warnings: string[];
  /** Where each recipe's projectiles leave, relative to the ship centre (from the ejector's cell). */
  readonly spawnOffsets: { x: number; y: number }[];

  /** Ship position in screen px (Free Fly is one fixed screen wide). */
  shipX = CONFIG.VIEW.W / 2;
  shipY = CONFIG.VIEW.H * 0.8;
  /**
   * Spawn safety. A world made with `safeStart` keeps the ship at its start spot until beginControl(); the screen
   * calls that on the first pointer move or press. Then the ship eases to the pointer over EASE_TIME and the contact
   * invulnerability (SPAWN_INVULN_SECONDS) runs from the first frame. Without `safeStart` (unit tests) control is immediate.
   */
  controlStarted: boolean;
  private controlT: number;
  private easeFrom = { x: 0, y: 0 };
  /** Radius of the invisible hit circle: set by the hull's size class (HIT_RADIUS for a small hull). */
  hitR = HIT_RADIUS;
  hull = BASE_HULL;
  /** Chunk 34c: the id of the ship design flown (the Stats page counts runs per hull). */
  hullId = '';
  readonly maxHull: number;
  /** The active captain's effects for this run (neutral when none was given). */
  readonly mods: RunModifiers;
  /** Chunk 35a: the daily run's twist numbers (empty in every other run). */
  readonly twist: TwistEffects;
  /** Chunk 35a: the hull (or a Second Chance) was hit at some point this run (the "without being hit" quest). */
  everHurt = false;
  /** Chunk 32c: the Free Fly trait chunks in force (neutral in a Frontier encounter: they act in normal Free Fly only). */
  readonly flyT: FlyTraits;
  /** Time of the last hull loss or spent Second Chance (Repair Bay waits REPAIR_IDLE_SECONDS after it). */
  private lastHurtT = -Infinity;
  /** Second Chance charges left: the next enemy contact deals no damage. */
  secondChancesLeft = 0;
  invuln = 0;
  knockX = 0;
  knockY = 0;
  gameOver = false;

  time = 0;
  /** Bodies killed this run and the exact (fractional) credits they paid. */
  kills = 0;
  creditsExact = 0;
  /** Highest tier reached this run. */
  maxTier = 1;
  /** Rocks that reached the bottom edge. */
  leaks = 0;
  autoSpawn: boolean;
  private safeStart: boolean;
  /** Pulse-rate multiplier of the hull being flown (the Dart is slow). */
  private fireRateMul: number;
  /** Generator pulses a second (the hull's and the captain's rate); the muzzle flash is skipped above a high rate. */
  get pulseRate(): number { return CONFIG.PULSE.BASE_RATE * this.fireRateMul; }
  /** Seconds each rock's centre has spent above the top edge. */
  private aboveT = new Map<number, number>();
  /** Horizontal direction sign of each rock's sway, flipped when it touches a side. */
  private swayDir = new Map<number, number>();
  private pulseTimer = 0;
  /** Waves (chunk 10a): the seeded director, the spawns due this frame, and the credits paid as wave bonuses. */
  director: WaveDirector | EncounterDirector;
  readonly seed: number;
  /**
   * Frontier encounter (chunk 15b): a fixed plan, a fixed tier, an extra HP multiplier (spike) and a duration. When it is
   * absent (normal Free Fly) nothing below changes: the wave director, the time-based tier and HP x 1.
   */
  readonly encounter: { plan: PlannedSpawn[]; wave: number; tier: number; hpMul: number; duration: number } | null;
  /** Encounter only: the ship survived the whole duration (the run ends then, gameOver is set too). */
  survived = false;
  private due: PlannedSpawn[] = [];
  /** The rocks' spatial hash and the field over it, made once (chunk 21b: they used to be built new every frame); rebuilt twice per update. */
  private readonly spatial = new SpatialHash(CONFIG.VIEW.W, CONFIG.VIEW.H, 64);
  private readonly field = new EnemyField(this.mitosis.enemies, this.spatial);
  /** Reused by the separation query of the enemy loop. */
  private readonly nearIds: number[] = [];
  bonusCredits = 0;
  /** Chunk 31a: Cores earned by a normal Free Fly run so far (exact; the Core Magnet multiplier is already in). An encounter's are worked out from its time (see `cores`). */
  private coresExact = 0;
  /** Whole Cores this run has earned: Free Fly pays when each wave starts (plus the milestone bonus), a Frontier square one block per full 40 s survived. */
  get cores(): number {
    const exact = (this.encounter ? encounterCores(this.encounter.wave, this.time) * this.mods.coresMul : this.coresExact) + this.crystals.collected;
    return Math.floor(exact + 1e-9);
  }
  /** Chunk 32e: the Core crystals the kills drop (docs/core-pickups.md). Their value is CRYSTAL_SHARE of the automatic Cores, collected by flying through them. */
  readonly crystals = new CrystalField();
  /** Cores waiting to be dropped as crystals: the automatic pay of the waves started (or of an encounter's seconds) times CRYSTAL_SHARE, spent by the kills in proportion to their reward. */
  private crystalPool = 0;
  /** Waves that started during the last update() calls (the screen shows a banner); consumers clear it. */
  waveEvents: { wave: number; bonus: number; theme: ThemeId | null; cores: number; boss: BossId | null; skipped?: boolean }[] = [];
  private kicks = new Map<number, { vx: number; vy: number }>();
  /** Per body: constant sideways speed (a Drifter's slide, a Darter's aim), signed; flipped with the sway at a side. */
  private baseVx = new Map<number, number>();
  /** Budders: seconds towards the next bud and buds made so far. */
  private budState = new Map<number, { t: number; n: number }>();
  /** Gunners: the walk / stop / fire clock of each. */
  private gunState = new Map<number, GunState>();
  /** Reused each frame: the Shielders and Leeches found in the enemy loop. */
  private shielders: MitosisEnemy[] = [];
  private leeches: MitosisEnemy[] = [];
  /** Bodies a Leech healed this frame (one Leech per body). */
  private healed = new Set<number>();

  /** Events produced during the last update() calls; consumers clear them. */
  hits: HitEvent[] = [];
  splits: SplitEvent[] = [];
  killEvents: KillEvent[] = [];

  /** Counters of the Mitosis blocks that act in the world (debug hook and tests). */
  readonly fx = { fissionSplits: 0, fissionBlocked: 0, cauterizedKills: 0, spillChildren: 0, wellPulls: 0, secondChance: 0, killHealed: 0 };
  /** Dev cheat (debugHooks.god): contact and leaks do no damage. */
  god = false;
  /** Dev cheat: the run starts at this wave (run time and tier follow it); 1 = normal. */
  private startWave: number;

  constructor(opts: { grid?: Grid; autoSpawn?: boolean; safeStart?: boolean; seed?: number; startWave?: number; modifiers?: RunModifiers; encounter?: World['encounter']; twist?: TwistEffects } = {}) {
    this.twist = opts.encounter ? {} : (opts.twist ?? {});
    this.mods = applyHullTraits(opts.modifiers ?? neutralModifiers(), opts.grid?.hullId);
    this.encounter = opts.encounter ?? null;
    this.flyT = this.encounter ? NEUTRAL_FLY : this.mods.fly;
    this.maxHull = BASE_HULL * this.mods.hullMul * (this.twist.hullMul ?? 1);
    this.hull = this.maxHull;
    this.secondChancesLeft = this.mods.secondChances;
    this.seed = opts.seed ?? 1;
    this.director = this.makeDirector();
    this.startWave = Math.max(1, Math.floor(opts.startWave ?? 1));
    this.applyStartWave();
    const compiled = compile(opts.grid ?? buildStarterGrid(), { baseDamage: this.mods.baseDamage, furthestRing: this.mods.furthestRing, projSpeedMul: this.mods.projSpeedMul, skills: this.mods.skills });
    this.projSys.skills = this.mods.skills;
    const hull = opts.grid ?? buildStarterGrid();
    this.hullId = hull.hullId ?? '';
    this.recipes = compiled.recipes;
    this.fireRateMul = fireRateMul(hull.hullId) * this.mods.fireRateMul;
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hull);
    this.warnings = compiled.warnings;
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.gun = new Gun(this.pool, this.projSys, this.recipes, this.spawnOffsets, 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul));
    this.gun.speedMul = this.mods.projSpeedMul * shotSpeedMul(hull.hullId);
    this.hitR = hitRadiusOf(hull.hullId);
    const b = this.projSys.bonus;
    b.damageMul = this.mods.damageMul * this.flyT.damageMul * (this.twist.damageMul ?? 1);
    b.vsArmor = this.mods.vsArmor;
    b.vsShield = this.mods.vsShield;
    b.vsFragment = this.mods.vsFragment;
    this.autoSpawn = opts.autoSpawn ?? true;
    this.controlStarted = !opts.safeStart;
    this.controlT = opts.safeStart ? 0 : Infinity;
    this.safeStart = !!opts.safeStart;
    this.invuln = this.safeStart ? SPAWN_INVULN_SECONDS + this.mods.spawnInvuln : 0;
    this.projSys.onHit = (e, dmg, x, y, kind = 0) => {
      this.hits.push({ big: this.projSys.hitBig, enemyId: e.id, damage: dmg, x, y, kind, armor: e.armor, shield: e.shield, maxShield: e.maxShield });
      // A shield regenerates SHIELD_REGEN_DELAY after the last hit; a burn tick does not hold it back (as on the wall).
      if (kind !== HIT_BURN && kind !== HIT_CLOUD) (e as MitosisEnemy).lastHit = this.time;
    };
  }

  /** Tier of the run: starts at 1 and rises by one every 15 seconds of survival (an encounter's tier is fixed). */
  get tier(): number { return this.encounter ? this.encounter.tier : tierOfTime(this.time); }

  /** The twist's wave schedule (boss every n, swarm every n, gunner waves). */
  private get waveRules(): WaveRules { return { bossEvery: this.twist.bossEvery, swarmEvery: this.twist.swarmEvery, gunners: this.twist.gunners }; }

  private makeDirector(): WaveDirector | EncounterDirector {
    return this.encounter ? new EncounterDirector(this.encounter.wave, this.encounter.plan, ALIVE_HOLD) : new WaveDirector(this.seed, WAVE_TIME * this.flyT.waveTimeMul * (this.twist.waveTimeMul ?? 1), this.flyT.waveSkip, this.waveRules);
  }

  private applyStartWave() {
    this.time = (this.startWave - 1) * (this.director instanceof WaveDirector ? this.director.waveTime : WAVE_TIME);
    this.director.jumpTo(this.startWave);
  }

  /** True if this rock has a split rule it can still use (the generation cap and the species' own cap). */
  private canSplit(e: MitosisEnemy): boolean {
    const rule = ENEMIES[e.defId]?.split;
    return !!rule && e.generation < Math.min(CONFIG.MITOSIS.MAX_GENERATION, rule.maxGeneration ?? Infinity);
  }

  /** Gravity Well: every live attractor pulls rocks inside WELL_RADIUS towards its point (never past it; the point is kept on the screen). */
  private pullToWells(e: MitosisEnemy, dt: number) {
    const ps = this.projSys;
    for (let k = 0; k < ps.wellT.length; k++) {
      if (ps.wellT[k] <= 0) continue;
      const tx = Math.max(0, Math.min(CONFIG.VIEW.W, ps.wellX[k]));
      const ty = Math.max(0, ps.wellY[k]);
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      if (d > WELL_RADIUS || d < 1e-6) continue;
      const step = Math.min(ps.wellS[k] * dt, d);
      e.x += (dx / d) * step;
      e.y += (dy / d) * step;
      this.fx.wellPulls++;
    }
  }

  /**
   * Fission Catalyst: a rock that was hit without dying and asked for it splits now, if it can split, is not cauterized and its
   * cooldown is over. The children share the rock's remaining HP and start with the cooldown. No kill, no credits.
   */
  private applyFission() {
    const enemies = this.mitosis.enemies;
    if (!enemies.some(e => e.fissionLevel)) return; // the usual case: nothing asked for a split (no array copy)
    for (const e of [...enemies]) {
      const lvl = e.fissionLevel ?? 0;
      if (!lvl) continue;
      e.fissionLevel = 0;
      if (e.hp <= 0) continue;
      if (!this.canSplit(e) || (e.cauterizedTimer ?? 0) > 0 || this.time < (e.fissionReady ?? 0)) { this.fx.fissionBlocked++; continue; }
      const firstChildId = this.mitosis.nextId;
      this.mitosis.handleDeath(e, 0, true, true);
      const childIds: number[] = [];
      for (const c of this.mitosis.enemies) {
        if (c.id < firstChildId) continue;
        childIds.push(c.id);
        c.fissionReady = this.time + fissionCooldown(lvl);
        c.x = Math.max(c.radius, Math.min(CONFIG.VIEW.W - c.radius, c.x));
        const ang = Math.atan2(c.y - e.y, c.x - e.x) || 0;
        this.kicks.set(c.id, { vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160 });
        this.initMotion(c);
      }
      this.forget(e.id);
      this.fx.fissionSplits++;
      this.splits.push({ parentId: e.id, x: e.x, y: e.y, radius: e.radius, childIds, defId: e.defId });
    }
  }

  /** Dev cheat: removes every enemy at once (no credits, no split). */
  clearEnemies() {
    this.dropBoss();
    this.mitosis.enemies.length = 0;
    this.kicks.clear(); this.aboveT.clear(); this.swayDir.clear(); this.baseVx.clear(); this.budState.clear(); this.gunState.clear();
  }

  /** Takes the boss (if any) off the field without paying anything, and lets the director go on (cheats, jumps). */
  private dropBoss() {
    if (!this.boss) return;
    this.boss.dispose();
    this.boss = null;
    if (this.director instanceof WaveDirector) this.director.releaseBoss(this.time);
  }

  /** Dev (debug panel): jumps to the start of wave `n` in the middle of a run: the field is cleared, the clock and tier follow the wave. */
  jumpToWave(n: number) {
    if (this.encounter) return;
    this.dropBoss();
    this.mitosis.enemies.length = 0;
    this.kicks.clear(); this.aboveT.clear(); this.swayDir.clear(); this.baseVx.clear(); this.budState.clear(); this.gunState.clear();
    this.enemyBullets.clear();
    this.due.length = 0;
    this.director = this.makeDirector();
    this.startWave = Math.max(1, Math.floor(n));
    this.applyStartWave();
  }

  /** The credit reward a body would pay, before the run's multipliers (the weight of its share of the crystal pool). */
  private bodyReward(tier: number, generation: number, defId: string): number {
    return rockReward(freeFlyRewardTier(tier), generation) * speciesOf(defId).rewardMul;
  }

  /** A kill drops a crystal worth its share of the pool (the bodies still alive and the spawns still queued share the rest). */
  private dropCrystal(dead: { id: number; x: number; y: number; tier: number; generation: number; defId: string }) {
    if (!(this.crystalPool > 0)) return;
    let others = 0;
    for (const o of this.mitosis.enemies) if (o.id !== dead.id && o.hp > 0 && !o.bossRole) others += this.bodyReward(o.tier, o.generation, o.defId);
    for (const q of this.director.pending) others += this.bodyReward(this.tier, q.generation, q.defId);
    const value = this.crystalPool * killShare(this.bodyReward(dead.tier, dead.generation, dead.defId), others);
    this.crystalPool -= value;
    this.crystals.drop(dead.x, dead.y, value);
  }

  /** The boss of wave `wave` arrives (chunk 32b). */
  private startBoss(wave: number) {
    const b = bossAt(wave, this.twist.bossEvery);
    if (!b) return;
    const self = this;
    const host: BossHost = {
      mitosis: this.mitosis, bullets: this.enemyBullets, tier: this.tier,
      get shipX() { return self.shipX; }, get shipY() { return self.shipY; },
      unitHp: wholeRockHp(rockHp(this.tier) * waveHpMul(wave)),
      spawnRock: (x, y, hp) => { this.spawnSpecies('mitotic_rock', x, y, { hp, radius: ROCK_RADIUS }); },
    };
    this.boss = new BossFight(b.def, b.round, wave, wholeRockHp(bossMaxHp(b.def.id, wave, this.tier, this.twist.bossEvery) * this.flyT.bossHpMul), host, this.seed);
    this.bossHurt = false;
  }

  /** The boss died: pay it once, take its bodies off, announce it, and let the next wave start after a short breather. */
  private defeatBoss() {
    const b = this.boss;
    if (!b || b.rewarded) return;
    b.rewarded = true;
    const credits = rockReward(freeFlyRewardTier(this.tier), 1) * BOSS_CREDIT_MUL * FREEFLY_REWARD_MUL * this.mods.creditMul * (1 + this.mods.skills.freeFlyCredits);
    const cores = coresForWave(b.wave) * BOSS_CORES_MUL * this.mods.coresMul * this.flyT.bossCoresMul;
    this.creditsExact += credits;
    this.coresExact += cores;
    this.kills++;
    this.killEvents.push({ x: b.anchorX, y: b.anchorY, reward: credits, generation: 1, defId: 'mother', radius: 60 });
    this.splits.push({ parentId: -1, x: b.anchorX, y: b.anchorY, radius: 60, childIds: [], defId: 'mother' });
    const noHit = !this.bossHurt;
    this.bossesDefeated.push({ id: b.def.id, wave: b.wave, noHit });
    this.bossEvents.push({ kind: 'defeat', id: b.def.id, name: b.def.name, credits, cores, noHit, x: b.anchorX, y: b.anchorY });
    b.dispose();
    this.boss = null;
    if (this.director instanceof WaveDirector) this.director.releaseBoss(this.time);
  }

  /** Current wave (0 until the director has started the first one). */
  get wave(): number { return this.director.wave; }
  /** Seconds until the next wave. */
  get waveTimeLeft(): number { return this.director.timeToNext(this.time); }

  /** Whole credits earned so far (the HUD number and the summary). */
  get credits(): number { return Math.floor(this.creditsExact + 1e-9); }

  reset() {
    this.kills = 0;
    this.creditsExact = 0;
    this.maxTier = 1;
    this.leaks = 0;
    this.killEvents.length = 0;
    this.director = this.makeDirector();
    this.applyStartWave();
    this.survived = false;
    this.bonusCredits = 0;
    this.coresExact = 0;
    this.crystals.clear();
    this.crystalPool = 0;
    this.waveEvents.length = 0;
    this.hull = this.maxHull;
    this.lastHurtT = -Infinity;
    this.everHurt = false;
    this.secondChancesLeft = this.mods.secondChances;
    this.invuln = this.safeStart ? SPAWN_INVULN_SECONDS + this.mods.spawnInvuln : 0;
    this.knockX = 0;
    this.knockY = 0;
    this.mitosis.enemies.length = 0;
    this.kicks.clear();
    this.pool.active.fill(0);
    this.pool.count = 0;
    this.gun.reset();
    this.projSys.clearFieldFx();
    this.gameOver = false;
    this.shipX = CONFIG.VIEW.W / 2;
    this.shipY = CONFIG.VIEW.H * 0.8;
    this.controlStarted = !this.safeStart;
    this.controlT = this.safeStart ? 0 : Infinity;
    this.aboveT.clear();
    this.swayDir.clear();
    this.baseVx.clear();
    this.budState.clear();
    this.gunState.clear();
    this.enemyBullets.clear();
    this.boss = null;
    this.bossesDefeated.length = 0;
    this.bossEvents.length = 0;
    this.bossHurt = false;
    this.links.length = 0;
    this.bulletHits = 0;
    this.hits.length = 0;
    this.splits.length = 0;
  }

  /** Spawns a rock; x is clamped so it is born inside the screen width. */
  spawnRock(x: number, y: number, hp: number = wholeRockHp(rockHp(this.tier))) {
    return this.spawnSpecies('mitotic_rock', x, y, { hp, radius: ROCK_RADIUS });
  }

  /**
   * Spawns one body of a species (data/species.ts): HP from the tier unless given, x clamped inside the screen width.
   * `generation` > 1 starts it part-way down its split chain (a Swarm's pebbles are generation-3 rocks).
   */
  spawnSpecies(defId: string, x: number, y: number, o: { hp?: number; radius?: number; generation?: number; armor?: number } = {}) {
    const sp = speciesOf(defId);
    const r = o.radius ?? sp.radius;
    const W = CONFIG.VIEW.W;
    const e = this.mitosis.spawn(defId, o.generation ?? 1, o.hp ?? wholeRockHp(rockHp(this.tier) * sp.hpMul), Math.max(r, Math.min(W - r, x)), y, r);
    if (e) {
      e.tier = this.tier;
      if (o.armor && o.armor > e.armor) e.armor = o.armor; // the ARMORED theme (chunk 32a)
      this.initMotion(e);
    }
    return e;
  }

  /** Per-body motion set once at birth: a Drifter's slide direction, a Darter's aim at the ship. */
  private initMotion(e: MitosisEnemy) {
    const sp = speciesOf(e.defId);
    if (sp.zig) this.baseVx.set(e.id, e.id % 2 ? sp.zig : -sp.zig);
    else if (sp.aim) {
      const dy = Math.max(100, this.shipY - e.y);
      this.baseVx.set(e.id, Math.max(-sp.aim, Math.min(sp.aim, ((this.shipX - e.x) * sp.speed) / dy)));
    }
    if (sp.bud) this.budState.set(e.id, { t: 0, n: 0 });
    if (sp.gun) this.gunState.set(e.id, newGunState(sp.gun));
  }

  private forget(id: number) {
    this.kicks.delete(id);
    this.aboveT.delete(id);
    this.swayDir.delete(id);
    this.baseVx.delete(id);
    this.budState.delete(id);
    this.gunState.delete(id);
  }

  /**
   * The ship takes a hit that is not a rock contact (an enemy bullet): a Second Chance charge absorbs it, otherwise `amount`
   * comes off the hull. Either way the ship is untouchable for a while. Ends the run at 0 hull.
   */
  private hurtShip(amount: number, invuln: number) {
    if (this.secondChancesLeft > 0) {
      this.secondChancesLeft--;
      this.fx.secondChance++;
      this.invuln = this.mods.chanceInvuln;
      return;
    }
    this.hull -= amount;
    this.invuln = invuln;
    this.bulletHits++;
    if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
  }

  /** A Gunner fires `count` bullets in a fan at the ship's position now. */
  private fireBurst(e: MitosisEnemy, count: number, spreadDeg: number) {
    const gy = e.y + e.radius * 0.5;
    for (const v of burstVelocities(e.x, gy, this.shipX, this.shipY, ENEMY_BULLET_SPEED, count, spreadDeg)) {
      this.enemyBullets.spawn(e.x, gy, v.vx, v.vy);
    }
  }

  /**
   * Shielders: the nearest few non-Shielder bodies in range take `damageMul` of every hit this frame (`dmgTakenMul`, cleared first).
   * Leeches: the nearest few non-Leech bodies in range heal a share of their max HP a second. Each link is listed for the screen.
   */
  private updateSupport(dt: number) {
    const enemies = this.mitosis.enemies;
    this.links.length = 0;
    for (const e of enemies) if (e.dmgTakenMul !== undefined && !e.bossRole) e.dmgTakenMul = undefined;
    for (const s of this.shielders) {
      if (!(s.hp > 0)) continue; // dying this very step: its shield is already gone
      const d = speciesOf(s.defId).shield!;
      for (const t of nearestWithin(s.x, s.y, enemies, d.range, d.maxLinks, e => e !== s && !e.bossRole && !speciesOf(e.defId).shield)) {
        t.dmgTakenMul = t.dmgTakenMul === undefined ? d.damageMul : Math.min(t.dmgTakenMul, d.damageMul);
        this.links.push({ kind: 'shield', id: t.id, ax: s.x, ay: s.y, bx: t.x, by: t.y, r: t.radius });
      }
    }
    this.healed.clear();
    for (const l of this.leeches) {
      if (!(l.hp > 0)) continue;
      const d = speciesOf(l.defId).heal!;
      // A body is healed by one Leech at a time (a crowd of Leeches does not stack their healing).
      for (const t of nearestWithin(l.x, l.y, enemies, d.range, d.maxLinks, e => e !== l && !e.bossRole && !speciesOf(e.defId).heal && !this.healed.has(e.id))) {
        this.healed.add(t.id);
        if (t.hp < t.maxHp) t.hp = Math.min(t.maxHp, t.hp + t.maxHp * d.perSec * dt);
        this.links.push({ kind: 'leech', id: t.id, ax: l.x, ay: l.y, bx: t.x, by: t.y, r: t.radius });
      }
    }
  }

  /**
   * Contact with a rock (or a boss body): damage and knockback (none while invulnerable: the first second of control and 0.5 s after a hit).
   * Swept (chunk 24a): the closest the ship's path from (fromX, fromY) this step came to the body, so a fast ship cannot pass through one.
   */
  private touch(e: MitosisEnemy, fromX: number, fromY: number) {
    const reach = e.radius + this.hitR;
    const near2 = segDistSq(fromX, fromY, this.shipX, this.shipY, e.x, e.y);
    let sx = this.shipX - e.x;
    let sy = this.shipY - e.y;
    if (near2 < reach * reach && sx * sx + sy * sy >= reach * reach) {
      // Touched on the way and already past: push away from where it was touched (the segment's closest point).
      const vx = this.shipX - fromX, vy = this.shipY - fromY;
      const len2 = vx * vx + vy * vy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((e.x - fromX) * vx + (e.y - fromY) * vy) / len2));
      sx = fromX + vx * t - e.x;
      sy = fromY + vy * t - e.y;
    }
    const d = Math.sqrt(sx * sx + sy * sy) || 1;
    if (near2 < reach * reach && this.invuln <= 0 && !this.god) {
      if (this.secondChancesLeft > 0) {
        // Second Chance: this contact deals no damage; the ship is untouchable for a second.
        this.secondChancesLeft--;
        this.fx.secondChance++;
        this.invuln = this.mods.chanceInvuln;
      } else {
        this.hull -= CONTACT_DAMAGE;
        this.invuln = 0.5;
      }
      this.knockX += (sx / d) * 50;
      this.knockY += (sy / d) * 50;
      if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
    }

  }

  /** After a pause: the ship eases to the pointer again (the spawn-safety ease) instead of jumping to where it is now. */
  resumeEase() {
    if (this.controlStarted) this.controlT = 0;
  }

  /** The player's first move: the ship starts easing to the pointer (the spawn invulnerability runs from the start of the run, 24d). */
  beginControl() {
    if (this.controlStarted) return;
    this.controlStarted = true;
    this.controlT = 0;
  }

  /** Tests and debugging: puts the ship at a place at once (the pointer cannot: it flies at SHIP_MAX_SPEED at most). */
  teleportShip(x: number, y: number) {
    const mx = shipHalfW(CONFIG.VIEW.W);
    this.shipX = Math.max(mx, Math.min(CONFIG.VIEW.W - mx, x));
    this.shipY = Math.max(CONFIG.PLAYER.MARGIN, Math.min(CONFIG.VIEW.H - CONFIG.PLAYER.MARGIN, y));
  }

  /** Fire one pulse: one projectile per compiled ejector recipe (chance gates may drop or boost it). */
  fire() {
    this.gun.fire(this.shipX, this.shipY);
  }

  update(dt: number, pointer: PointerState) {
    if (this.gameOver) return;
    this.time += dt;
    // An encounter ends when its time is up: the ship survived it.
    if (this.encounter && this.time >= this.encounter.duration) { this.time = this.encounter.duration; this.survived = true; this.gameOver = true; this.projSys.dropAll(); return; }
    if (this.tier > this.maxTier) this.maxTier = this.tier;
    if (this.invuln > 0) this.invuln -= dt;
    const VW = CONFIG.VIEW.W;
    const hullBefore = this.hull, chancesBefore = this.secondChancesLeft;

    // --- Ship: pointer only. Mouse = exact, touch = small upward offset while pressed. Nothing moves it before the first move.
    let baseX = this.shipX - this.knockX;
    let baseY = this.shipY - this.knockY;
    if (this.controlStarted && pointer.seen) {
      if (pointer.type === 'touch') {
        if (pointer.active) { baseX = pointer.x; baseY = pointer.y + TOUCH_OFFSET_Y; }
      } else {
        baseX = pointer.x;
        baseY = pointer.y;
      }
    }
    if (this.controlStarted && this.controlT < EASE_TIME) {
      if (this.controlT === 0) this.easeFrom = { x: this.shipX, y: this.shipY };
      const k = easeK(this.controlT + dt);
      baseX = this.easeFrom.x + (baseX - this.easeFrom.x) * k;
      baseY = this.easeFrom.y + (baseY - this.easeFrom.y) * k;
      this.controlT += dt;
    }
    // Chunk 24a: the ship flies toward the pointer at SHIP_MAX_SPEED at most (never a jump); the contact test below sweeps the path flown.
    const fromX = this.shipX, fromY = this.shipY;
    if (!this.controlStarted) { baseX = this.shipX; baseY = this.shipY; }
    else {
      const cx = this.shipX - this.knockX, cy = this.shipY - this.knockY;
      const s = stepToward(cx, cy, baseX, baseY, dt);
      baseX = cx + s.dx;
      baseY = cy + s.dy;
    }
    const decay = Math.exp(-12 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.05) this.knockY = 0;
    const m = CONFIG.PLAYER.MARGIN;
    const mx = shipHalfW(VW);
    this.shipX = Math.max(mx, Math.min(VW - mx, baseX + this.knockX));
    this.shipY = Math.max(m, Math.min(CONFIG.VIEW.H - m, baseY + this.knockY));

    // --- Core crystals (chunk 32e): they drift and fade; the ship's path this step collects those within the pickup radius
    if (this.encounter) this.crystalPool += CRYSTAL_SHARE * encounterCoresPerBlock(this.encounter.wave) / ENCOUNTER_CORES_SECONDS * this.mods.coresMul * dt;
    this.crystals.update(dt, fromX, fromY, this.shipX, this.shipY, pickupRadius(this.mods.pickupMul));

    // --- Auto-fire (the gun also releases shots a Delay Line held back)
    this.projSys.shipX = this.shipX;
    this.projSys.shipY = this.shipY;
    this.gun.update(dt, this.shipX, this.shipY);
    this.pulseTimer += dt;
    const period = 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul);
    while (this.pulseTimer >= period) {
      this.pulseTimer -= period;
      this.fire();
    }

    // --- Waves: the director starts a wave every WAVE_TIME s and hands out its spawns, just above the top edge
    if (this.autoSpawn) {
      const started = this.director.update(this.time, this.mitosis.enemies.length, this.due);
      // Skipped waves (Wave Skipper, chunk 32c) pay nothing: the screen only shows a banner (and counts the wave as reached).
      if (this.director instanceof WaveDirector) for (const w of this.director.skipped) this.waveEvents.push({ wave: w, bonus: 0, theme: null, cores: 0, boss: null, skipped: true });
      if (started) {
        const bonus = waveBonus(started) * this.mods.waveBonusMul;
        this.bonusCredits += bonus;
        this.creditsExact += bonus;
        const theme = this.encounter ? null : themeAt(started, this.twist.gunners);
        const themed = theme ? themeCores(started, this.twist.gunners) * this.mods.coresMul * this.flyT.wavePayMul : 0; // a theme wave pays a Cores bonus (chunk 32a)
        const boss = this.encounter ? null : bossAt(started, this.twist.bossEvery);
        this.waveEvents.push({ wave: started, bonus, theme: theme ? theme.id : null, cores: themed, boss: boss ? boss.def.id : null });
        if (boss) this.startBoss(started);
        if (!this.encounter) {
          const pay = waveStartCores(started) * this.mods.coresMul * this.flyT.wavePayMul + themed;
          this.coresExact += pay;
          this.crystalPool += CRYSTAL_SHARE * pay;
        }
      }
      const hpMul = waveHpMul(this.director.wave) * (this.encounter ? this.encounter.hpMul : this.flyT.enemyHpMul);
      for (const s of this.due) {
        this.spawnSpecies(s.defId, s.x, -s.radius, { hp: wholeRockHp(rockHp(this.tier) * s.hpMul * hpMul), radius: s.radius, generation: s.generation, armor: s.armor });
      }
      this.due.length = 0;
    }

    // --- Projectile movement (path modifiers steer first)
    const pool = this.pool;
    this.projSys.expireStale(); // chunk 21b: with a nearly full pool, shots off the screen that hit nothing for a while go first
    this.projSys.steer(dt, this.field);
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      // A Bouncing shot with bounces left reflects off the screen edges (no damage); one that carries the block cannot fly for ever.
      if (pool.bounces[i] >= 0) {
        this.projSys.edgeBounce(i, 0, VW, 0, CONFIG.VIEW.H);
        if (pool.age[i] > pool.life[i]) { this.projSys.retire(i); continue; }
      } else if (pool.phase[i] === PHASE_NORMAL && pool.age[i] > pool.life[i]) {
        // Chunk 20b: a shot kept in play by Ship Magnet or Centreline still ends at its lifetime (a normal shot has left the screen long before).
        this.projSys.retire(i);
        continue;
      }
      if (beyondDespawn(pool.x[i], pool.y[i], -50, VW, CONFIG.VIEW.H)) {
        this.projSys.retire(i);
      }
    }

    // --- Enemy movement (drift + sway + soft separation via spatial hash)
    const enemies = this.mitosis.enemies;
    const spatial = this.spatial;
    spatial.clear();
    for (const e of enemies) spatial.insert(e.id, e.x, e.y);
    this.field.refresh();

    const budsDue: MitosisEnemy[] = [];
    this.shielders.length = 0;
    this.leeches.length = 0;
    for (const e of enemies) {
      if (e.bossRole) { this.touch(e, fromX, fromY); continue; } // a boss's bodies are placed by BossFight; they only hurt on contact
      // Frostbite slows the whole drift (1 when not frozen, so unfrozen rocks move exactly as before).
      const slow = (e.freezeT ?? 0) > 0 ? 1 - (e.freezeSlow ?? 0) : 1;
      // Species motion (the basic rock: ENEMY_SPEED down, a 30 px/s sine sway, no constant slide).
      const sp = speciesOf(e.defId);
      e.vy = sp.speed * slow;
      e.vx = (Math.sin(this.time + e.id) * sp.sway + (this.baseVx.get(e.id) ?? 0)) * (this.swayDir.get(e.id) ?? 1) * slow;
      if (sp.gun) {
        // Gunner (chunk 32a): it stops now and then and aims a burst at where the ship is when it fires.
        const gs = this.gunState.get(e.id);
        if (gs) {
          const g = gunStep(gs, sp.gun, dt * slow, e.y > 0 && e.y < this.shipY - 40);
          if (!g.moving) { e.vx = 0; e.vy = 0; }
          if (g.fire) this.fireBurst(e, sp.gun.burst, sp.gun.spreadDeg);
        }
      } else if (sp.shield) this.shielders.push(e);
      else if (sp.heal) this.leeches.push(e);
      if (sp.bud && e.y > 0) {
        const b = this.budState.get(e.id);
        if (b && b.n < sp.bud.max && (b.t += dt) >= sp.bud.every) { b.t = 0; b.n++; budsDue.push(e); }
      }
      // Shields recover after SHIELD_REGEN_DELAY without a hit (the wall's numbers).
      if (e.maxShield > 0 && e.shield < e.maxShield && this.time - (e.lastHit ?? -Infinity) >= SHIELD_REGEN_DELAY) {
        e.shield = Math.min(e.maxShield, e.shield + e.maxShield * SHIELD_REGEN_PER_SEC * dt);
      }
      const kick = this.kicks.get(e.id);
      if (kick) {
        e.vx += kick.vx;
        e.vy += kick.vy;
        kick.vx *= decay;
        kick.vy *= decay;
        if (Math.abs(kick.vx) + Math.abs(kick.vy) < 1) this.kicks.delete(e.id);
      }
      const near = spatial.queryInto(e.x, e.y, e.radius * 2, this.nearIds);
      for (let q = 0; q < near.length; q++) {
        const nid = near[q];
        if (nid === e.id) continue;
        const o = this.field.byId(nid);
        if (!o) continue;
        const dx = e.x - o.x;
        const dy = e.y - o.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = e.radius + o.radius;
        if (dist > 0 && dist < minDist) {
          const push = (minDist - dist) * 10 * dt;
          e.x += (dx / dist) * push;
          e.y += (dy / dist) * push;
        }
      }
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if ((e.cauterizedTimer ?? 0) > 0) e.cauterizedTimer = (e.cauterizedTimer as number) - dt;
      this.pullToWells(e, dt);

      // Confined to the screen width: a side reflects the horizontal motion (sway and knockback) and clamps it back inside.
      const minX = e.radius, maxX = VW - e.radius;
      if (e.x < minX || e.x > maxX) {
        const kk = this.kicks.get(e.id);
        const leftSide = e.x < minX;
        e.x = leftSide ? minX : maxX;
        this.swayDir.set(e.id, -(this.swayDir.get(e.id) ?? 1));
        if (kk && (leftSide ? kk.vx < 0 : kk.vx > 0)) kk.vx = -kk.vx;
      }
      // Never hover above the screen: after ABOVE_SCREEN_MAX seconds with its centre over the top edge it is moved in.
      if (e.y < 0) {
        const t = (this.aboveT.get(e.id) ?? 0) + dt;
        if (t > ABOVE_SCREEN_MAX) { e.y = 0; this.aboveT.delete(e.id); } else this.aboveT.set(e.id, t);
      } else if (this.aboveT.size) this.aboveT.delete(e.id);

      this.touch(e, fromX, fromY);
    }

    // --- Enemy bullets (chunk 32a): fly, leave the screen, hit the ship (hull damage and the short invulnerability; none while invulnerable)
    this.enemyBullets.update(dt);
    if (this.enemyBullets.count > 0 && this.invuln <= 0 && !this.god) {
      const hit = this.enemyBullets.firstHit(fromX, fromY, this.shipX, this.shipY, this.hitR);
      if (hit >= 0) {
        this.enemyBullets.remove(hit);
        this.hurtShip(ENEMY_BULLET_DAMAGE, ENEMY_BULLET_INVULN);
      }
    }

    // --- Shielders and Leeches: links to the bodies near them (the screen draws them)
    this.updateSupport(dt);

    // --- The boss (chunk 32b): places its bodies, fires, sets its damage multipliers before the player's shots are resolved
    if (this.boss) {
      this.boss.update(dt);
      if (this.boss.justEnraged) {
        this.boss.justEnraged = false;
        this.bossEvents.push({ kind: 'enrage', id: this.boss.def.id, name: this.boss.def.name, credits: 0, cores: 0, noHit: !this.bossHurt, x: this.boss.anchorX, y: this.boss.anchorY });
      }
      if (this.boss.reachedBottom && !this.god) { this.hull = 0; this.gameOver = true; }
    }

    // --- Budding: a Budder sheds a small rock below itself (it inherits the family tier)
    for (const p of budsDue) {
      const bud = speciesOf(p.defId).bud!;
      const c = this.mitosis.spawn('mitotic_rock', bud.generation, p.maxHp * bud.hpShare, p.x, p.y + p.radius * 0.6, bud.radius);
      if (!c) continue;
      c.tier = p.tier;
      c.x = Math.max(c.radius, Math.min(VW - c.radius, c.x));
      this.initMotion(c);
      this.kicks.set(c.id, { vx: (c.id % 2 ? 1 : -1) * 90, vy: 60 });
    }

    // --- Burn ticks, freeze timers, arc lifetimes
    this.projSys.updateStatus(dt);

    // --- Projectile hits (rebuild hash with post-move positions)
    spatial.clear();
    for (const e of enemies) spatial.insert(e.id, e.x, e.y);
    this.field.refresh();
    this.projSys.processField(this.field, 1);
    this.projSys.updateClouds(dt, this.field, 1); // Residue Seed ticks and the age of Gravity Wells
    this.applyFission();
    if (this.boss && (this.hull < hullBefore || this.secondChancesLeft < chancesBefore)) this.bossHurt = true; // contact and bullets so far this frame
    if (this.boss && this.boss.afterHits()) this.defeatBoss();

    // --- Death → mitosis
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.bossRole) continue; // never a kill or a leak: the boss's bodies are handled by BossFight
      if (e.hp <= 0) {
        let reward = rockReward(freeFlyRewardTier(e.tier), e.generation) * speciesOf(e.defId).rewardMul * FREEFLY_REWARD_MUL * this.mods.creditMul * (1 + this.mods.skills.freeFlyCredits);
        // Cauterize: a kill inside the window leaves no children (the mitosis system's rule) and pays extra, if it would have split.
        const cauterized = (e.cauterizedTimer ?? 0) > 0 && this.canSplit(e);
        if (cauterized) { reward *= 1 + (e.cauterizeBonus ?? 0); this.fx.cauterizedKills++; }
        this.kills++;
        if (this.mods.killHeal > 0 && this.hull < this.maxHull) {
          const healed = Math.min(this.maxHull - this.hull, this.mods.killHeal);
          this.hull += healed;
          this.fx.killHealed += healed;
        }
        this.creditsExact += reward;
        this.killEvents.push({ x: e.x, y: e.y, reward, generation: e.generation, defId: e.defId, radius: e.radius });
        this.dropCrystal(e);
        const firstChildId = this.mitosis.nextId;
        this.mitosis.handleDeath(e, -e.hp);
        const childIds: number[] = [];
        const burst = e.spillBurst ?? 0;
        for (const c of this.mitosis.enemies) {
          if (c.id >= firstChildId) {
            childIds.push(c.id);
            c.x = Math.max(c.radius, Math.min(VW - c.radius, c.x));
            const ang = Math.atan2(c.y - e.y, c.x - e.x) || 0;
            this.kicks.set(c.id, { vx: Math.cos(ang) * 160, vy: Math.sin(ang) * 160 });
            this.initMotion(c);
          }
        }
        // Overkill Spill: every child takes the burst (a share of the killing hit's total damage). A child it kills that can
        // still split is marked with the same burst, so its own children take it when it dies, up to SPILL_CHAIN_DEPTH deep.
        if (burst > 0 && childIds.length > 0) {
          const depth = e.spillDepth ?? 0;
          for (const c of this.mitosis.enemies) {
            if (!childIds.includes(c.id)) continue;
            c.hp = burst === Infinity ? Math.min(c.hp, 0) - 1 : c.hp - burst; // Infinity - Infinity would be NaN
            this.fx.spillChildren++;
            if (c.hp <= 0 && depth + 1 < SPILL_CHAIN_DEPTH && this.canSplit(c)) { c.spillBurst = burst; c.spillDepth = depth + 1; }
          }
        }
        this.forget(e.id);
        this.splits.push({ parentId: e.id, x: e.x, y: e.y, radius: e.radius, childIds, defId: e.defId });
      } else if (e.y >= CONFIG.VIEW.H) {
        // Leak: the rock reached the bottom edge. It is removed and hurts the hull by its size.
        enemies.splice(i, 1);
        this.forget(e.id);
        this.leaks++;
        if (!this.god) {
          this.hull -= leakDamage(BASE_HULL, e.generation) * speciesOf(e.defId).leakMul;
          if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
        }
      }
    }
    if (this.boss && (this.hull < hullBefore || this.secondChancesLeft < chancesBefore)) this.bossHurt = true; // a leak
    // Repair Bay (chunk 32c): heals a share of the max hull a second once REPAIR_IDLE_SECONDS have passed without a hit.
    if (this.hull < hullBefore || this.secondChancesLeft < chancesBefore) { this.lastHurtT = this.time; this.everHurt = true; }
    else if (this.flyT.repairRate > 0 && this.hull > 0 && this.hull < this.maxHull && this.time - this.lastHurtT >= REPAIR_IDLE_SECONDS) {
      this.hull = Math.min(this.maxHull, this.hull + this.maxHull * this.flyT.repairRate * dt);
    }
  }
}
