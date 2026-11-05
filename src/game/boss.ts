import { CONFIG } from '../config';
import { Mulberry32 } from '../rng';
import type { EnemyBullets } from '../engine/enemyBullets';
import type { MitosisEnemy, MitosisSystem } from '../engine/mitosis';
import { ENEMY_BULLET_SPEED } from '../data/enemyBullets';
import {
  BASTION, BossDef, BOSS_ENTRY_SPEED, BOSS_ROUND_ATTACK_MUL, COLOSSUS, ENRAGE_AFTER, ENRAGE_ATTACK_MUL, ENRAGE_BULLET_MUL, ENRAGE_SPEED_MUL, HIVE, PLATE_TAKEN, QUEEN,
} from '../data/bosses';
import { burstVelocities } from './support';

/**
 * One Free Fly boss fight (chunk 32b, docs/freefly-bosses.md). No Pixi: the world makes it, calls `update` once a frame before the
 * player's shots are resolved and `afterHits` right after, and the screen draws it from the public state.
 *
 * How the shots reach it: a boss is a group of ordinary bodies in the world's enemy list (`bossRole` set), so every block that
 * finds or hits enemies works on them unchanged. "Conduit" bodies carry the boss's HP (each frame their HP is set to the boss's
 * and what they lost, after their `dmgTakenMul`, is taken off the boss); "plates" are invulnerable and only absorb shots; "escorts"
 * are small bodies with their own HP. The generic enemy loop skips every body with a `bossRole` (this class places them).
 */
export interface BossHost {
  mitosis: MitosisSystem;
  bullets: EnemyBullets;
  readonly shipX: number;
  readonly shipY: number;
  /** HP of a plain rock of this wave (the boss's rocks and escorts are a share of it). */
  readonly unitHp: number;
  /** Makes one splitting rock (the Hive Mother's). */
  spawnRock(x: number, y: number, hp: number): void;
  /** Run tier the boss was made at (its parts carry it). */
  readonly tier: number;
}

/** HP the plates carry: more than any hit's damage times PLATE_TAKEN, reset every frame. */
const PLATE_HP = 1e15;

export class BossFight {
  readonly def: BossDef;
  readonly round: number;
  readonly wave: number;
  readonly maxHp: number;
  hp: number;
  /** Seconds since it appeared (including the slide-in). */
  time = 0;
  enraged = false;
  /** Set on the frame the enrage starts; the world clears it after announcing. */
  justEnraged = false;
  /** True while it slides in: it neither attacks nor moves sideways yet. */
  entering = true;
  anchorX = CONFIG.VIEW.W / 2;
  anchorY: number;
  /** Hive Mother: her core is open (takes full damage). */
  coreOpen = false;
  /** Bastion: the ring's turn in radians. */
  ringAngle = 0;
  /** Everything of the boss in the enemy list. */
  readonly parts: MitosisEnemy[] = [];
  readonly conduits: MitosisEnemy[] = [];
  readonly plates: MitosisEnemy[] = [];
  /** Swarm Queen: the escort slots (null = dead, waiting to come back) and seconds until each comes back. */
  readonly escorts: (MitosisEnemy | null)[] = [];
  readonly escortTimer: number[] = [];
  /** Escorts killed so far and times one came back (tests, stats). */
  escortKills = 0;
  escortReturns = 0;
  /** Shots of the boss's own weapons so far (tests). */
  volleys = 0;
  rocksMade = 0;
  defeated = false;
  /** The boss sank to the bottom edge after its enrage: the run is lost. */
  reachedBottom = false;
  /** The rewards were paid (the world sets it, so a kill pays once). */
  rewarded = false;

  private phase = 0;
  /** Where the boss rests (the wandering Swarm Queen's moves) and how far the enrage has sunk it; the anchor is their sum once it has arrived. */
  private baseY: number;
  private sink = 0;
  private fightT = 0;
  private fireT = 0;
  private rockT = 0;
  private waypoint = { x: CONFIG.VIEW.W / 2, y: 260 };
  private waypointT = 0;
  private xDir = 1;
  private readonly rnd: Mulberry32;

  constructor(def: BossDef, round: number, wave: number, maxHp: number, private host: BossHost, seed = 1) {
    this.def = def;
    this.round = round;
    this.wave = wave;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.rnd = new Mulberry32((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(wave, 0x85ebca6b)) | 0);
    this.anchorY = -def.extent - 10;
    this.baseY = def.homeY;
    this.waypoint.y = (QUEEN.yMin + QUEEN.yMax) / 2;
    this.build();
  }

  // ------------------------------------------------------------------ parts
  private make(role: 'conduit' | 'plate' | 'escort', defId: string, r: number, hp: number): MitosisEnemy | null {
    const e = this.host.mitosis.spawn(defId, 1, hp, this.anchorX, this.anchorY, r);
    if (!e) return null;
    e.tier = this.host.tier;
    e.bossRole = role;
    this.parts.push(e);
    if (role === 'conduit') this.conduits.push(e);
    else if (role === 'plate') this.plates.push(e);
    return e;
  }

  private build() {
    const id = this.def.id;
    if (id === 'hive') this.make('conduit', 'boss_part', HIVE.radius, this.hp);
    else if (id === 'bastion') {
      this.make('conduit', 'boss_part', BASTION.coreRadius, this.hp);
      for (let k = 0; k < BASTION.slots; k++) if (!this.isGap(k)) this.make('plate', 'boss_part', BASTION.plateR, PLATE_HP);
    } else if (id === 'queen') {
      this.make('conduit', 'boss_part', QUEEN.radius, this.hp);
      for (let k = 0; k < QUEEN.escorts; k++) { this.escorts.push(this.makeEscort()); this.escortTimer.push(0); }
    } else {
      for (let k = 0; k < COLOSSUS.count; k++) this.make('conduit', 'boss_part', COLOSSUS.radius, this.hp);
    }
  }

  private makeEscort(): MitosisEnemy | null {
    const e = this.make('escort', 'darter', QUEEN.escortRadius, Math.max(1, Math.round(this.host.unitHp * QUEEN.escortHp)));
    return e;
  }

  /** Bastion: is place `k` of the ring a gap? */
  isGap(k: number): boolean {
    const n = BASTION.slots;
    return BASTION.gapStarts.some(s => { const d = (((k - s) % n) + n) % n; return d < BASTION.gapSlots; });
  }

  /** Bastion: world position of place `k` of the ring. */
  slotPos(k: number): { x: number; y: number; a: number } {
    const a = this.ringAngle + (k * Math.PI * 2) / BASTION.slots;
    return { x: this.anchorX + Math.cos(a) * BASTION.ringR, y: this.anchorY + Math.sin(a) * BASTION.ringR, a };
  }

  // ------------------------------------------------------------------ rules
  /** Attack interval factor: the enrage and the round make every wait shorter. */
  get attackScale(): number { return (this.enraged ? ENRAGE_ATTACK_MUL : 1) * Math.pow(BOSS_ROUND_ATTACK_MUL, this.round); }
  get speedScale(): number { return this.enraged ? ENRAGE_SPEED_MUL : 1; }
  private get bulletSpeed(): number { return ENEMY_BULLET_SPEED * (this.enraged ? ENRAGE_BULLET_MUL : 1); }
  /** Fraction of HP left, 0..1. */
  get fraction(): number { return Math.max(0, Math.min(1, this.hp / this.maxHp)); }
  /** Seconds until the enrage (0 once it has started). */
  get enrageIn(): number { return Math.max(0, ENRAGE_AFTER - this.time); }
  /** Lowest point of the boss, px. */
  get bottom(): number { return this.anchorY + this.def.extent; }

  /** Hive Mother: is her core open at `fightT` seconds into the fight. */
  static coreOpenAt(fightT: number): boolean {
    const cycle = HIVE.closedFor + HIVE.openFor;
    return fightT % cycle >= HIVE.closedFor;
  }

  // ------------------------------------------------------------------ one frame
  update(dt: number) {
    if (this.defeated) return;
    this.time += dt;
    if (!this.enraged && this.time >= ENRAGE_AFTER) { this.enraged = true; this.justEnraged = true; }
    const W = CONFIG.VIEW.W;

    if (this.entering) {
      this.anchorY += BOSS_ENTRY_SPEED * dt;
      if (this.anchorY >= this.def.homeY) { this.anchorY = this.def.homeY; this.entering = false; }
    } else {
      this.fightT += dt;
      this.phase += dt * this.speedScale;
      if (this.enraged) this.sink += this.def.descent * dt;
      this.move(dt, W);
      this.anchorY = this.baseY + this.sink;
      if (this.enraged && this.bottom >= CONFIG.VIEW.H) this.reachedBottom = true;
      this.attack(dt);
    }
    this.layOut();
  }

  private move(dt: number, W: number) {
    switch (this.def.id) {
      case 'hive': this.anchorX = W / 2 + Math.sin(this.phase * HIVE.swaySpeed) * HIVE.swayPx; break;
      case 'bastion':
        this.anchorX = W / 2 + Math.sin(this.phase * BASTION.swaySpeed) * BASTION.swayPx;
        this.ringAngle += BASTION.turn * this.speedScale * dt;
        break;
      case 'queen': {
        this.waypointT -= dt * this.speedScale;
        if (this.waypointT <= 0) {
          this.waypointT = QUEEN.waypointEvery;
          const m = QUEEN.radius + QUEEN.escortRadius * 2 + QUEEN.orbitR * 0.5;
          this.waypoint = { x: m + this.rnd.next() * (W - 2 * m), y: QUEEN.yMin + this.rnd.next() * (QUEEN.yMax - QUEEN.yMin) };
        }
        const dx = this.waypoint.x - this.anchorX, dy = this.waypoint.y - this.baseY;
        const d = Math.hypot(dx, dy);
        const step = Math.min(d, QUEEN.speed * this.speedScale * dt);
        if (d > 1e-6) { this.anchorX += (dx / d) * step; this.baseY += (dy / d) * step; }
        break;
      }
      case 'colossus': {
        const half = ((COLOSSUS.count - 1) * COLOSSUS.spacing) / 2 + COLOSSUS.radius;
        this.anchorX += this.xDir * COLOSSUS.speed * this.speedScale * dt;
        const lo = COLOSSUS.sideMargin + half, hi = W - COLOSSUS.sideMargin - half;
        if (this.anchorX < lo) { this.anchorX = lo; this.xDir = 1; } else if (this.anchorX > hi) { this.anchorX = hi; this.xDir = -1; }
        break;
      }
    }
  }

  private attack(dt: number) {
    const b = this.host.bullets;
    const sx = this.host.shipX, sy = this.host.shipY;
    const speed = this.bulletSpeed;
    switch (this.def.id) {
      case 'hive': {
        this.coreOpen = BossFight.coreOpenAt(this.fightT);
        this.fireT += dt;
        if (this.fireT >= HIVE.fireEvery * this.attackScale) {
          this.fireT = 0; this.volleys++;
          for (const v of burstVelocities(this.anchorX, this.anchorY + HIVE.radius * 0.5, sx, sy, speed * HIVE.speedMul, HIVE.spread, HIVE.spreadDeg)) b.spawn(this.anchorX, this.anchorY + HIVE.radius * 0.5, v.vx, v.vy);
        }
        this.rockT += dt;
        if (this.rockT >= HIVE.rockEvery * this.attackScale) {
          this.rockT = 0;
          if (this.liveRocks() < HIVE.maxRocks) {
            const a = Math.PI * (0.2 + this.rnd.next() * 0.6); // the lower half
            this.host.spawnRock(this.anchorX + Math.cos(a) * HIVE.radius * 1.3, this.anchorY + Math.sin(a) * HIVE.radius * 1.3, Math.max(1, Math.round(this.host.unitHp * HIVE.rockHp)));
            this.rocksMade++;
          }
        }
        break;
      }
      case 'bastion':
        this.fireT += dt;
        if (this.fireT >= BASTION.fireEvery * this.attackScale) {
          this.fireT = 0; this.volleys++;
          for (const s of BASTION.gapStarts) {
            const a0 = this.slotPos(s).a;
            const step = (Math.PI * 2) / BASTION.slots;
            // Bullets at each place of the gap and one between neighbours: they leave through the opening, not through a plate.
            for (let k = 0; k <= (BASTION.gapSlots - 1) * 2; k++) {
              const a = a0 + (k * step) / 2;
              b.spawn(this.anchorX, this.anchorY, Math.cos(a) * speed, Math.sin(a) * speed);
            }
          }
        }
        break;
      case 'queen':
        this.fireT += dt;
        if (this.fireT >= QUEEN.fireEvery * this.attackScale) {
          this.fireT = 0; this.volleys++;
          for (const v of burstVelocities(this.anchorX, this.anchorY, sx, sy, speed * QUEEN.speedMul, QUEEN.burst, QUEEN.burstDeg)) b.spawn(this.anchorX, this.anchorY, v.vx, v.vy);
        }
        for (let k = 0; k < this.escorts.length; k++) {
          if (this.escorts[k]) continue;
          this.escortTimer[k] -= dt;
          if (this.escortTimer[k] <= 0) { this.escorts[k] = this.makeEscort(); this.escortReturns++; }
        }
        break;
      case 'colossus': break; // no attacks
    }
  }

  /** Rocks of the Hive Mother still alive (the director sends none on a boss wave, so every plain rock counts). */
  private liveRocks(): number {
    let n = 0;
    for (const e of this.host.mitosis.enemies) if (e.defId === 'mitotic_rock' && !e.bossRole && e.hp > 0) n++;
    return n;
  }

  /** Puts every body at its place for this frame and gives each conduit the boss's HP and its damage multiplier. */
  private layOut() {
    const ax = this.anchorX, ay = this.anchorY;
    switch (this.def.id) {
      case 'hive':
        this.place(this.conduits[0], ax, ay);
        if (this.conduits[0]) this.conduits[0].dmgTakenMul = this.coreOpen ? 1 : HIVE.closedTaken;
        break;
      case 'bastion': {
        this.place(this.conduits[0], ax, ay);
        let i = 0;
        for (let k = 0; k < BASTION.slots; k++) {
          if (this.isGap(k)) continue;
          const p = this.slotPos(k);
          const pl = this.plates[i++];
          this.place(pl, p.x, p.y);
          if (pl) { pl.hp = PLATE_HP; pl.maxHp = PLATE_HP; pl.dmgTakenMul = PLATE_TAKEN; }
        }
        break;
      }
      case 'queen': {
        this.place(this.conduits[0], ax, ay);
        const n = this.escorts.length;
        for (let k = 0; k < n; k++) {
          const e = this.escorts[k];
          if (!e) continue;
          const a = this.time * QUEEN.orbitSpeed * this.speedScale + (k * Math.PI * 2) / n;
          e.x = ax + Math.cos(a) * QUEEN.orbitR; e.y = ay + Math.sin(a) * QUEEN.orbitR;
        }
        break;
      }
      case 'colossus': {
        const c = this.conduits;
        for (let k = 0; k < c.length; k++) this.place(c[k], ax + (k - (c.length - 1) / 2) * COLOSSUS.spacing, ay);
        break;
      }
    }
    for (const c of this.conduits) { c.hp = this.hp; c.maxHp = this.maxHp; }
  }

  private place(e: MitosisEnemy | undefined, x: number, y: number) {
    if (!e) return;
    e.x = x; e.y = y; e.vx = 0; e.vy = 0;
  }

  /**
   * After the player's shots (and burn ticks, clouds) of this frame: what the conduits lost is taken off the boss, escorts that died
   * are removed (they return later). True when the boss is dead.
   */
  afterHits(): boolean {
    if (this.defeated) return true;
    let dmg = 0;
    for (const c of this.conduits) {
      const d = this.hp - c.hp;
      if (d > 0) dmg += d; // a NaN hp (cannot happen: dmgTakenMul is never 0) would be ignored here
    }
    if (dmg > 0) this.hp -= dmg;
    if (!(this.hp > 0)) { this.hp = 0; this.defeated = true; return true; }
    for (const c of this.conduits) c.hp = this.hp;
    for (let k = 0; k < this.escorts.length; k++) {
      const e = this.escorts[k];
      if (e && !(e.hp > 0)) {
        const i = this.host.mitosis.enemies.indexOf(e);
        if (i >= 0) this.host.mitosis.enemies.splice(i, 1);
        const j = this.parts.indexOf(e);
        if (j >= 0) this.parts.splice(j, 1);
        this.escorts[k] = null;
        this.escortTimer[k] = QUEEN.escortRespawn;
        this.escortKills++;
      }
    }
    return false;
  }

  /** Takes every body out of the world (the boss died, or a cheat cleared the field). Their HP goes to 0 so no status list keeps them. */
  dispose() {
    const list = this.host.mitosis.enemies;
    for (const p of this.parts) {
      const i = list.indexOf(p);
      if (i >= 0) list.splice(i, 1);
      p.hp = 0;
    }
    this.parts.length = 0; this.conduits.length = 0; this.plates.length = 0;
    this.escorts.fill(null);
  }
}
