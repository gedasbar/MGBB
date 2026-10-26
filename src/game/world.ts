import { CONFIG, HIT_RADIUS, shipHalfW } from '../config';
import { ProjectilePool } from '../engine/pools';
import { MitosisSystem } from '../engine/mitosis';
import { ProjectileSystem } from '../engine/projectiles';
import { SpatialHash } from '../engine/spatialHash';
import { compile, EjectorRecipe, Grid } from '../engine/compiler';
import { Gun, PX_PER_CELL, spawnOffsetsFor } from './fire';
import { PointerState } from '../input';
import { buildStarterGrid, ROCK_RADIUS } from './starter';
import { leakDamage, rockHp, rockReward, tierOfTime, wholeRockHp } from '../econ/economy';
import { easeK, EASE_TIME, GRACE_TIME } from '../engine/control';
import { fireRateMul, hitRadiusOf, shotSpeedMul } from '../data/hulls';
import { speciesOf } from '../data/species';
import { ENEMIES } from '../data/enemies';
import { EnemyField } from '../engine/targets';
import { HIT_BURN, HIT_CLOUD } from '../engine/projectiles';
import { fissionCooldown, SPILL_CHAIN_DEPTH, WELL_RADIUS } from '../engine/effects';
import { PROJECTILE_MAX_AGE } from '../wall/constants';
import { FREEFLY_REWARD_MUL, freeFlyRewardTier, waveBonus, waveHpMul, WAVE_TIME } from '../data/waves';
import { PlannedSpawn, WaveDirector } from './waves';
import { ALIVE_HOLD } from '../data/waves';
import { EncounterDirector } from '../frontier/encounter';
import { SHIELD_REGEN_DELAY, SHIELD_REGEN_PER_SEC } from '../wall/constants';
import type { MitosisEnemy } from '../engine/mitosis';
import { neutralModifiers, RunModifiers } from '../captains/modifiers';
import { SECOND_CHANCE_INVULN } from '../captains/data';

export const TOUCH_OFFSET_Y = -40; // finger sits below the ship on touch
export { PX_PER_CELL };
const CONTACT_DAMAGE = 10;
/** Hull of an unmodified ship. Leak damage always uses this base (a captain's extra hull does not make leaks hurt more). */
const BASE_HULL = 100;
/** A rock whose centre stays above the top edge this long is moved in at the edge. */
export const ABOVE_SCREEN_MAX = 6;

/** `kind`: 0 projectile hit, 1 burn tick, 2 chain jump (HIT_* in engine/projectiles). */
/** One hit on a rock. `armor`, `shield` and `maxShield` are what the rock has left AFTER the hit (the sound layer reads them). */
export interface HitEvent { enemyId: number; damage: number; x: number; y: number; kind: number; armor: number; shield: number; maxShield: number }
/** An enemy body died: `reward` is the credits it paid (fractional; the run keeps the exact total). */
export interface KillEvent { x: number; y: number; reward: number; generation: number; }
export interface SplitEvent { parentId: number; x: number; y: number; radius: number; childIds: number[]; defId: string; }

/**
 * Pure game simulation (no Pixi). main.ts renders it; tests drive it directly.
 */
export class World {
  readonly pool = new ProjectilePool();
  readonly projSys = new ProjectileSystem(this.pool);
  readonly mitosis = new MitosisSystem();
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
   * invulnerability lasts GRACE_TIME. Without `safeStart` (unit tests) control is immediate.
   */
  controlStarted: boolean;
  private controlT: number;
  private easeFrom = { x: 0, y: 0 };
  /** Radius of the invisible hit circle: set by the hull's size class (HIT_RADIUS for a small hull). */
  hitR = HIT_RADIUS;
  hull = BASE_HULL;
  readonly maxHull: number;
  /** The active captain's effects for this run (neutral when none was given). */
  readonly mods: RunModifiers;
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
  bonusCredits = 0;
  /** Waves that started during the last update() calls (the screen shows a banner); consumers clear it. */
  waveEvents: { wave: number; bonus: number }[] = [];
  private kicks = new Map<number, { vx: number; vy: number }>();
  /** Per body: constant sideways speed (a Drifter's slide, a Darter's aim), signed; flipped with the sway at a side. */
  private baseVx = new Map<number, number>();
  /** Budders: seconds towards the next bud and buds made so far. */
  private budState = new Map<number, { t: number; n: number }>();

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

  constructor(opts: { grid?: Grid; autoSpawn?: boolean; safeStart?: boolean; seed?: number; startWave?: number; modifiers?: RunModifiers; encounter?: World['encounter'] } = {}) {
    this.mods = opts.modifiers ?? neutralModifiers();
    this.encounter = opts.encounter ?? null;
    this.maxHull = BASE_HULL * this.mods.hullMul;
    this.hull = this.maxHull;
    this.secondChancesLeft = this.mods.secondChances;
    this.seed = opts.seed ?? 1;
    this.director = this.makeDirector();
    this.startWave = Math.max(1, Math.floor(opts.startWave ?? 1));
    this.applyStartWave();
    const compiled = compile(opts.grid ?? buildStarterGrid(), { baseDamage: this.mods.baseDamage });
    const hull = opts.grid ?? buildStarterGrid();
    this.recipes = compiled.recipes;
    this.fireRateMul = fireRateMul(hull.hullId) * this.mods.fireRateMul;
    this.spawnOffsets = spawnOffsetsFor(this.recipes, hull);
    this.warnings = compiled.warnings;
    this.projSys.modifiersTable = this.recipes.map(r => r.packet.mods);
    this.gun = new Gun(this.pool, this.projSys, this.recipes, this.spawnOffsets, 1 / (CONFIG.PULSE.BASE_RATE * this.fireRateMul));
    this.gun.speedMul = this.mods.projSpeedMul * shotSpeedMul(hull.hullId);
    this.hitR = hitRadiusOf(hull.hullId);
    const b = this.projSys.bonus;
    b.damageMul = this.mods.damageMul;
    b.vsArmor = this.mods.vsArmor;
    b.vsShield = this.mods.vsShield;
    b.vsFragment = this.mods.vsFragment;
    this.autoSpawn = opts.autoSpawn ?? true;
    this.controlStarted = !opts.safeStart;
    this.controlT = opts.safeStart ? 0 : Infinity;
    this.safeStart = !!opts.safeStart;
    this.projSys.onHit = (e, dmg, x, y, kind = 0) => {
      this.hits.push({ enemyId: e.id, damage: dmg, x, y, kind, armor: e.armor, shield: e.shield, maxShield: e.maxShield });
      // A shield regenerates SHIELD_REGEN_DELAY after the last hit; a burn tick does not hold it back (as on the wall).
      if (kind !== HIT_BURN && kind !== HIT_CLOUD) (e as MitosisEnemy).lastHit = this.time;
    };
  }

  /** Tier of the run: starts at 1 and rises by one every 15 seconds of survival (an encounter's tier is fixed). */
  get tier(): number { return this.encounter ? this.encounter.tier : tierOfTime(this.time); }

  private makeDirector(): WaveDirector | EncounterDirector {
    return this.encounter ? new EncounterDirector(this.encounter.wave, this.encounter.plan, ALIVE_HOLD) : new WaveDirector(this.seed);
  }

  private applyStartWave() {
    this.time = (this.startWave - 1) * WAVE_TIME;
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
    this.mitosis.enemies.length = 0;
    this.kicks.clear(); this.aboveT.clear(); this.swayDir.clear(); this.baseVx.clear(); this.budState.clear();
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
    this.waveEvents.length = 0;
    this.hull = this.maxHull;
    this.secondChancesLeft = this.mods.secondChances;
    this.invuln = 0;
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
  spawnSpecies(defId: string, x: number, y: number, o: { hp?: number; radius?: number; generation?: number } = {}) {
    const sp = speciesOf(defId);
    const r = o.radius ?? sp.radius;
    const W = CONFIG.VIEW.W;
    const e = this.mitosis.spawn(defId, o.generation ?? 1, o.hp ?? wholeRockHp(rockHp(this.tier) * sp.hpMul), Math.max(r, Math.min(W - r, x)), y, r);
    if (e) { e.tier = this.tier; this.initMotion(e); }
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
  }

  private forget(id: number) {
    this.kicks.delete(id);
    this.aboveT.delete(id);
    this.swayDir.delete(id);
    this.baseVx.delete(id);
    this.budState.delete(id);
  }

  /** After a pause: the ship eases to the pointer again (the spawn-safety ease) instead of jumping to where it is now. */
  resumeEase() {
    if (this.controlStarted) this.controlT = 0;
  }

  /** The player's first move: the ship starts easing to the pointer and is untouchable by enemies for GRACE_TIME. */
  beginControl() {
    if (this.controlStarted) return;
    this.controlStarted = true;
    this.controlT = 0;
    this.invuln = Math.max(this.invuln, GRACE_TIME + this.mods.spawnInvuln);
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
    if (!this.controlStarted) { baseX = this.shipX; baseY = this.shipY; }
    const decay = Math.exp(-12 * dt);
    this.knockX *= decay;
    this.knockY *= decay;
    if (Math.abs(this.knockX) < 0.05) this.knockX = 0;
    if (Math.abs(this.knockY) < 0.05) this.knockY = 0;
    const m = CONFIG.PLAYER.MARGIN;
    const mx = shipHalfW(VW);
    this.shipX = Math.max(mx, Math.min(VW - mx, baseX + this.knockX));
    this.shipY = Math.max(m, Math.min(CONFIG.VIEW.H - m, baseY + this.knockY));

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
      if (started) {
        const bonus = waveBonus(started) * this.mods.waveBonusMul;
        this.bonusCredits += bonus;
        this.creditsExact += bonus;
        this.waveEvents.push({ wave: started, bonus });
      }
      const hpMul = waveHpMul(this.director.wave) * (this.encounter ? this.encounter.hpMul : 1);
      for (const s of this.due) {
        this.spawnSpecies(s.defId, s.x, -s.radius, { hp: wholeRockHp(rockHp(this.tier) * s.hpMul * hpMul), radius: s.radius, generation: s.generation });
      }
      this.due.length = 0;
    }

    // --- Projectile movement (path modifiers steer first)
    const pool = this.pool;
    this.projSys.steer(dt, this.mitosis.enemies);
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      pool.x[i] += pool.vx[i] * dt;
      pool.y[i] += pool.vy[i] * dt;
      // A Bouncing shot with bounces left reflects off the screen edges (no damage); one that carries the block cannot fly for ever.
      if (pool.bounces[i] >= 0) {
        this.projSys.edgeBounce(i, 0, VW, 0, CONFIG.VIEW.H);
        if (pool.age[i] > PROJECTILE_MAX_AGE) { pool.free(i); continue; }
      }
      if (pool.x[i] < -50 || pool.x[i] > VW + 50 || pool.y[i] < -50 || pool.y[i] > CONFIG.VIEW.H + 50) {
        pool.free(i);
      }
    }

    // --- Enemy movement (drift + sway + soft separation via spatial hash)
    const enemies = this.mitosis.enemies;
    const byId = new Map<number, (typeof enemies)[number]>();
    const spatial = new SpatialHash(VW, CONFIG.VIEW.H, 64);
    for (const e of enemies) { byId.set(e.id, e); spatial.insert(e.id, e.x, e.y); }

    const budsDue: MitosisEnemy[] = [];
    for (const e of enemies) {
      // Frostbite slows the whole drift (1 when not frozen, so unfrozen rocks move exactly as before).
      const slow = (e.freezeT ?? 0) > 0 ? 1 - (e.freezeSlow ?? 0) : 1;
      // Species motion (the basic rock: ENEMY_SPEED down, a 30 px/s sine sway, no constant slide).
      const sp = speciesOf(e.defId);
      e.vy = sp.speed * slow;
      e.vx = (Math.sin(this.time + e.id) * sp.sway + (this.baseVx.get(e.id) ?? 0)) * (this.swayDir.get(e.id) ?? 1) * slow;
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
      for (const nid of spatial.query(e.x, e.y, e.radius * 2)) {
        if (nid === e.id) continue;
        const o = byId.get(nid);
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

      // Contact damage + knockback (none while invulnerable: the first second of control and 0.5 s after a hit)
      const sx = this.shipX - e.x;
      const sy = this.shipY - e.y;
      const d = Math.sqrt(sx * sx + sy * sy) || 1;
      if (d < e.radius + this.hitR && this.invuln <= 0 && !this.god) {
        if (this.secondChancesLeft > 0) {
          // Second Chance: this contact deals no damage; the ship is untouchable for a second.
          this.secondChancesLeft--;
          this.fx.secondChance++;
          this.invuln = SECOND_CHANCE_INVULN;
        } else {
          this.hull -= CONTACT_DAMAGE;
          this.invuln = 0.5;
        }
        this.knockX += (sx / d) * 50;
        this.knockY += (sy / d) * 50;
        if (this.hull <= 0) { this.hull = 0; this.gameOver = true; }
      }
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
    const field = new EnemyField(enemies, spatial);
    this.projSys.processField(field, 1);
    this.projSys.updateClouds(dt, field, 1); // Residue Seed ticks and the age of Gravity Wells
    this.applyFission();

    // --- Death → mitosis
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.hp <= 0) {
        let reward = rockReward(freeFlyRewardTier(e.tier), e.generation) * speciesOf(e.defId).rewardMul * FREEFLY_REWARD_MUL * this.mods.creditMul;
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
        this.killEvents.push({ x: e.x, y: e.y, reward, generation: e.generation });
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
  }
}
