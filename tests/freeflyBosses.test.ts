import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { PointerState } from '../src/input';
import { WaveDirector, planWave } from '../src/game/waves';
import { BossFight } from '../src/game/boss';
import {
  BASTION, BOSSES, BOSS_BREATHER, BOSS_CORES_MUL, BOSS_CREDIT_MUL, BOSS_ROUND_HP_MUL, bossAt, bossMaxHp, COLOSSUS, ENRAGE_AFTER, HIVE, isBossWave, QUEEN,
} from '../src/data/bosses';
import { rockHp, tierOfTime } from '../src/econ/economy';
import { FREEFLY_REWARD_MUL, freeFlyRewardTier, waveBudget, waveHpMul, WAVE_TIME } from '../src/data/waves';
import { rockReward } from '../src/econ/economy';
import { coresForWave } from '../src/shipyard/cores';
import { defaultRecords, noteBossRecords, sanitizeRecords } from '../src/achievements/rules';
import { flyRunResult } from '../src/game/runEnd';
import { ProgressStore, defaultProgress } from '../src/econ/progress';
import { ACHIEVEMENT_BY_ID } from '../src/data/achievements';
import { EnemyField, newHomePick } from '../src/engine/targets';
import { SpatialHash } from '../src/engine/spatialHash';


const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });
const run = (w: World, seconds: number) => { for (let i = 0; i < Math.round(seconds / DT); i++) w.update(DT, idle()); };
/** A world at the start of boss wave `wave` with the boss arrived at its post and nothing else going on. */
function bossWorld(wave: number): World {
  const w = new World({ startWave: wave, seed: 5 });
  w.god = true; // the bosses shoot; these tests are about the boss, not about dodging
  run(w, 0.1);
  expect(w.boss).not.toBeNull();
  while (w.boss && w.boss.entering) w.update(DT, idle());
  return w;
}
/** Kills the boss the real way: its HP is down to a sliver and a heavy player shot is on its body. */
function killBoss(w: World) {
  const b = w.boss!;
  b.hp = 1e-6;
  const c = b.conduits[0];
  expect(w.pool.spawn(c.x, c.y, 0, -1, 1e9)).toBeGreaterThanOrEqual(0);
  w.update(DT, idle());
}
/** Freezes a boss's own movement (the sway and the Bastion's turn), so a test can set a geometry and keep it. */
const freeze = (b: BossFight) => { Object.defineProperty(b, 'speedScale', { get: () => 0 }); };

describe('the schedule', () => {
  it('every 10th wave is a boss wave; the four bosses rotate and each round is stronger', () => {
    expect([1, 5, 9, 11, 15, 19].some(isBossWave)).toBe(false);
    const ids = [10, 20, 30, 40, 50, 60, 70, 80, 90].map(w => bossAt(w)!.def.id);
    expect(ids).toEqual(['hive', 'bastion', 'queen', 'colossus', 'hive', 'bastion', 'queen', 'colossus', 'hive']);
    expect([10, 40, 50, 80, 90].map(w => bossAt(w)!.round)).toEqual([0, 0, 1, 1, 2]);
    expect(bossAt(25)).toBeNull();
    expect(BOSSES.map(b => b.id)).toEqual(['hive', 'bastion', 'queen', 'colossus']);
  });

  it('a boss wave has no normal spawns, and the wave ends when the boss dies, not on the 40 s timer', () => {
    expect(planWave(7, 10)).toEqual([]);
    expect(planWave(7, 20)).toEqual([]);
    expect(planWave(7, 9).length).toBeGreaterThan(0);
    const d = new WaveDirector(7);
    const out: unknown[] = [];
    for (let t = 0; t <= 9 * WAVE_TIME + 1; t += 1) d.update(t, 0, out as never);
    expect(d.wave).toBe(10);
    expect(d.holding).toBe(true);
    // 200 s later (five wave lengths) the wave is still 10: the timer does not start the next one
    for (let t = 9 * WAVE_TIME + 1; t < 9 * WAVE_TIME + 200; t += 1) d.update(t, 0, out as never);
    expect(d.wave).toBe(10);
    // the boss dies at t: the next wave starts BOSS_BREATHER later
    const tDead = 9 * WAVE_TIME + 200;
    d.releaseBoss(tDead);
    d.update(tDead + BOSS_BREATHER - 0.5, 0, out as never);
    expect(d.wave).toBe(10);
    d.update(tDead + BOSS_BREATHER + 0.01, 0, out as never);
    expect(d.wave).toBe(11);
  });

  it('a world flying into wave 10 stops spawning rocks and starts the boss; killing it starts wave 11', () => {
    const w = new World({ startWave: 9, seed: 5 });
    w.god = true;
    run(w, WAVE_TIME + 0.5);
    expect(w.wave).toBe(10);
    expect(w.boss?.def.id).toBe('hive');
    const rocksBefore = w.mitosis.enemies.filter(e => !e.bossRole).length;
    run(w, 3);
    expect(w.mitosis.enemies.filter(e => !e.bossRole && e.y < 0).length).toBe(0); // nothing new at the top
    expect(w.mitosis.enemies.filter(e => !e.bossRole).length).toBeLessThanOrEqual(rocksBefore);
    killBoss(w);
    expect(w.boss).toBeNull();
    run(w, BOSS_BREATHER - 1);
    expect(w.wave).toBe(10);
    run(w, 2);
    expect(w.wave).toBe(11);
    expect(w.boss).toBeNull();
  });
});

describe('enrage', () => {
  it('starts exactly after ENRAGE_AFTER seconds: attacks twice as often, moves faster, banner event once', () => {
    const w = bossWorld(20);
    const b = w.boss!;
    const t0 = b.time;
    run(w, ENRAGE_AFTER - t0 - 0.5);
    expect(b.enraged).toBe(false);
    expect(w.bossEvents.some(e => e.kind === 'enrage')).toBe(false);
    run(w, 1);
    expect(b.enraged).toBe(true);
    expect(w.bossEvents.filter(e => e.kind === 'enrage').length).toBe(1);
    run(w, 3);
    expect(w.bossEvents.filter(e => e.kind === 'enrage').length).toBe(1);
    expect(b.attackScale).toBeCloseTo(0.5, 5);
    expect(b.speedScale).toBeGreaterThan(1);
  });

  it('the Bastion fires about twice as many rings after the enrage', () => {
    const w = bossWorld(20);
    const b = w.boss!;
    const v0 = b.volleys;
    run(w, 14);
    const before = b.volleys - v0;
    b.time = ENRAGE_AFTER; // enrage now
    run(w, 0.1);
    const v1 = b.volleys;
    run(w, 14);
    const after = b.volleys - v1;
    expect(b.enraged).toBe(true);
    expect(after).toBeGreaterThanOrEqual(before * 1.6);
  });

  it('after the enrage the boss sinks, and reaching the bottom edge ends the run', () => {
    const w = bossWorld(40);
    const b = w.boss!;
    w.god = false;
    b.time = ENRAGE_AFTER;
    const y0 = b.anchorY;
    run(w, 5);
    expect(b.anchorY).toBeGreaterThan(y0 + 80);
    w.teleportShip(270, 940); // far from the Colossus' shadow so it is the sinking that ends the run, tested below
    let guard = 0;
    while (!w.gameOver && guard++ < 60 * 80) { w.hull = 1e9; w.teleportShip(270, 940); w.update(DT, idle()); if (b.reachedBottom) break; }
    expect(b.reachedBottom).toBe(true);
    expect(w.gameOver).toBe(true);
    expect(w.hull).toBe(0);
  });
});

describe('Hive Mother', () => {
  it('her core is open for OPEN_FOR seconds in every cycle, closed otherwise', () => {
    const cycle = HIVE.closedFor + HIVE.openFor;
    expect(BossFight.coreOpenAt(0)).toBe(false);
    expect(BossFight.coreOpenAt(HIVE.closedFor - 0.01)).toBe(false);
    expect(BossFight.coreOpenAt(HIVE.closedFor + 0.01)).toBe(true);
    expect(BossFight.coreOpenAt(cycle - 0.01)).toBe(true);
    expect(BossFight.coreOpenAt(cycle + 0.01)).toBe(false);
    expect(BossFight.coreOpenAt(cycle + HIVE.closedFor + 0.5)).toBe(true);
  });

  it('shots do full damage into an open core and only CLOSED_TAKEN of it into a closed one', () => {
    const w = bossWorld(10);
    const b = w.boss!;
    freeze(b);
    const perHit = { open: [] as number[], closed: [] as number[] };
    for (let i = 0; i < 60 * 40; i++) {
      w.teleportShip(b.anchorX, 760);
      const hp0 = b.hp;
      const open = b.coreOpen;
      w.update(DT, idle());
      const hits = w.hits.filter(h => h.enemyId === b.conduits[0]?.id).length;
      w.hits.length = 0;
      w.enemyBullets.clear();
      if (hits > 0 && b.hp < hp0 && b.hp > 0) (open ? perHit.open : perHit.closed).push((hp0 - b.hp) / hits);
      if (b.hp < b.maxHp * 0.5) break;
    }
    expect(perHit.open.length).toBeGreaterThan(3);
    expect(perHit.closed.length).toBeGreaterThan(3);
    const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
    expect(mean(perHit.open) / mean(perHit.closed)).toBeCloseTo(1 / HIVE.closedTaken, 0);
  });

  it('keeps making splitting rocks, but never more than MAX_ROCKS at once', () => {
    const w = bossWorld(10);
    w.god = true;
    run(w, 40);
    expect(w.boss!.rocksMade).toBeGreaterThan(2);
    const rocks = w.mitosis.enemies.filter(e => e.defId === 'mitotic_rock' && !e.bossRole);
    expect(rocks.length).toBeLessThanOrEqual(HIVE.maxRocks + 8); // her rocks split into children; the cap is on what she makes
  });
});

describe('Bastion', () => {
  /** Ring turned so that the place at the bottom (straight down from the core, towards the ship) is `slot`. */
  function aim(b: BossFight, slot: number, between = false) {
    const step = (Math.PI * 2) / BASTION.slots;
    b.ringAngle = Math.PI / 2 - (slot + (between ? 0.5 : 0)) * step;
  }
  const hpAfterShooting = (slot: number, between: boolean) => {
    const w = bossWorld(20);
    const b = w.boss!;
    freeze(b);
    const hp0 = b.hp;
    for (let i = 0; i < 60 * 3; i++) { aim(b, slot, between); w.teleportShip(b.anchorX, 760); w.update(DT, idle()); w.enemyBullets.clear(); }
    return { lost: hp0 - b.hp, b };
  };

  it('has plates on every place that is not a gap, and the gaps are where the data says', () => {
    const w = bossWorld(20);
    const b = w.boss!;
    const gaps = Array.from({ length: BASTION.slots }, (_, k) => k).filter(k => b.isGap(k));
    expect(gaps).toEqual([0, 1, 5, 6, 10, 11]);
    expect(b.plates.length).toBe(BASTION.slots - gaps.length);
  });

  it('a plate in the way blocks every shot; the same shots through a gap hit the core', () => {
    const blocked = hpAfterShooting(3, false); // place 3 is a plate, straight below the core
    expect(blocked.lost).toBe(0);
    const open = hpAfterShooting(0, true); // between places 0 and 1: the middle of a gap
    expect(open.lost).toBeGreaterThan(0);
  });

  it('rings of bullets leave through the gaps only', () => {
    const w = bossWorld(20);
    const b = w.boss!;
    freeze(b);
    w.enemyBullets.clear();
    run(w, BASTION.fireEvery + 0.1);
    expect(b.volleys).toBeGreaterThanOrEqual(1);
    const eb = w.enemyBullets;
    const n = eb.count;
    expect(n).toBe(BASTION.gapStarts.length * (BASTION.gapSlots * 2 - 1));
    for (let i = 0; i < eb.max; i++) {
      if (!eb.active[i]) continue;
      const a = Math.atan2(eb.vy[i], eb.vx[i]);
      const step = (Math.PI * 2) / BASTION.slots;
      const k = (((a - b.ringAngle) / step) % BASTION.slots + BASTION.slots) % BASTION.slots; // place number (fractional)
      const nearest = Math.round(k * 2) / 2;
      // the bullet's direction is a place of a gap or the middle between two places of the same gap
      const lo = Math.floor(nearest), hi = Math.ceil(nearest);
      expect(b.isGap(lo % BASTION.slots) && b.isGap(hi % BASTION.slots)).toBe(true);
    }
  });
});

describe('Swarm Queen', () => {
  it('has her escorts; a killed escort leaves, and comes back after ESCORT_RESPAWN seconds', () => {
    const w = bossWorld(30);
    const b = w.boss!;
    expect(b.escorts.filter(Boolean).length).toBe(QUEEN.escorts);
    const e = b.escorts[2]!;
    e.hp = 0;
    run(w, 0.1);
    expect(b.escorts[2]).toBeNull();
    expect(b.escortKills).toBe(1);
    expect(w.mitosis.enemies.includes(e)).toBe(false);
    expect(w.kills).toBe(0); // an escort is no kill and pays nothing
    run(w, QUEEN.escortRespawn - 1);
    expect(b.escorts[2]).toBeNull();
    run(w, 1.5);
    expect(b.escorts[2]).not.toBeNull();
    expect(b.escortReturns).toBe(1);
    expect(b.escorts.filter(Boolean).length).toBe(QUEEN.escorts);
  });

  it('flies around the upper screen and fires aimed bursts', () => {
    const w = bossWorld(30);
    const b = w.boss!;
    const xs: number[] = [];
    for (let i = 0; i < 60 * 12; i++) { w.update(DT, idle()); w.enemyBullets.clear(); xs.push(b.anchorX); }
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(120);
    expect(b.volleys).toBeGreaterThanOrEqual(5);
    expect(b.anchorY).toBeLessThan(QUEEN.yMax + 20);
  });
});

describe('Colossus', () => {
  it('has no attacks and drifts from side to side', () => {
    const w = bossWorld(40);
    const b = w.boss!;
    const xs: number[] = [];
    for (let i = 0; i < 60 * 30; i++) { w.update(DT, idle()); xs.push(b.anchorX); }
    expect(b.volleys).toBe(0);
    expect(w.enemyBullets.count).toBe(0);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(100);
    expect(b.conduits.length).toBe(COLOSSUS.count);
  });

  it('carries far more HP than the other bosses of its wave, and the HP grows with the wave and the round', () => {
    // the tier of a run follows its clock, as in the game (a boss of wave n arrives at tier tierOfTime((n - 1) x WAVE_TIME))
    const tierAt = (wave: number) => tierOfTime((wave - 1) * WAVE_TIME);
    const ratio = (id: 'hive' | 'bastion' | 'queen' | 'colossus', wave: number) => bossMaxHp(id, wave, tierAt(wave)) / ((waveBudget(wave) / 4) * rockHp(tierAt(wave)) * waveHpMul(wave));
    const defs = Object.fromEntries(BOSSES.map(b => [b.id, b.hpWaves]));
    expect(ratio('colossus', 40)).toBeCloseTo(defs.colossus, 1);
    expect(ratio('hive', 10)).toBeCloseTo(defs.hive, 1);
    expect(defs.colossus).toBeGreaterThanOrEqual(3 * Math.max(defs.hive, defs.bastion, defs.queen));
    // the second round of the same boss: x BOSS_ROUND_HP_MUL on top of the wave's growth
    expect(ratio('colossus', 80)).toBeCloseTo(defs.colossus * BOSS_ROUND_HP_MUL, 1);
    expect(ratio('hive', 90)).toBeCloseTo(defs.hive * BOSS_ROUND_HP_MUL * BOSS_ROUND_HP_MUL, 1);
    const hp = (id: 'hive' | 'bastion' | 'queen' | 'colossus', wave: number) => bossMaxHp(id, wave, tierAt(wave));
    expect(hp('colossus', 80)).toBeGreaterThan(hp('colossus', 40) * BOSS_ROUND_HP_MUL);
    expect([10, 20, 30, 40, 50, 60].map(w => hp(bossAt(w)!.def.id, w)).every((v, i, a) => i === 0 || v > a[i - 1] * 0.5)).toBe(true);
    // a boss of the same wave takes more HP at a later tier (it scales like the rocks do)
    expect(bossMaxHp('hive', 10, 40)).toBeGreaterThan(bossMaxHp('hive', 10, 30));
  });

  it('every part of the Colossus takes hits for the one HP pool', () => {
    const w = bossWorld(40);
    const b = w.boss!;
    const hp0 = b.hp;
    // a shot at the left end and one at the right end of the rectangle both count
    for (const side of [-1, 1]) {
      const c = b.conduits[side < 0 ? 0 : b.conduits.length - 1];
      w.projSys.shipX = w.shipX;
      const slot = w.pool.spawn(c.x, c.y + 30, 0, -1, 1, 0, 0);
      expect(slot).toBeGreaterThanOrEqual(0);
      const before = b.hp;
      w.update(DT, idle());
      expect(b.hp).toBeLessThan(before);
    }
    expect(b.hp).toBeLessThan(hp0);
  });
});

describe('rewards', () => {
  it('a boss kill pays credits and Cores once, announces itself, and the next wave starts after the breather', () => {
    const w = bossWorld(10);
    const credits0 = w.creditsExact, cores0 = w.cores, kills0 = w.kills;
    const tier = w.tier;
    killBoss(w);
    expect(w.boss).toBeNull();
    const wantCredits = rockReward(freeFlyRewardTier(tier), 1) * BOSS_CREDIT_MUL * FREEFLY_REWARD_MUL;
    expect(w.creditsExact - credits0).toBeCloseTo(wantCredits, 3);
    expect(w.cores - cores0).toBe(Math.floor(coresForWave(10) * BOSS_CORES_MUL + 1e-9 + 0)); // the wave start's own Cores were paid before cores0 was read
    expect(w.kills - kills0).toBe(1);
    const defeats = w.bossEvents.filter(e => e.kind === 'defeat');
    expect(defeats.length).toBe(1);
    expect(defeats[0].noHit).toBe(true);
    expect(w.bossesDefeated).toEqual([{ id: 'hive', wave: 10, noHit: true }]);
    // nothing more is ever paid for the same boss
    const c1 = w.creditsExact, k1 = w.cores;
    run(w, 2);
    expect(w.creditsExact).toBeCloseTo(c1, 6);
    expect(w.cores).toBe(k1);
    expect(w.bossesDefeated.length).toBe(1);
    expect(w.mitosis.enemies.some(e => e.bossRole)).toBe(false);
  });

  it('the boss pays more than a whole normal wave (credits and Cores)', () => {
    const tier = 25;
    const bossCredits = rockReward(freeFlyRewardTier(tier), 1) * BOSS_CREDIT_MUL;
    // a normal wave 9: its whole budget in basic rocks, every rock paying its parent reward
    const waveCredits = (waveBudget(9) / 4) * rockReward(freeFlyRewardTier(tier), 1);
    expect(bossCredits).toBeGreaterThan(waveCredits);
    expect(coresForWave(10) * BOSS_CORES_MUL).toBeGreaterThan(coresForWave(10));
  });

  it('"without being hit": a hull hit during the fight takes the flag away', () => {
    const w = bossWorld(10);
    w.god = false;
    w.invuln = 0;
    w.enemyBullets.spawn(w.shipX, w.shipY, 0, 0);
    run(w, 0.1);
    expect(w.hull).toBeLessThan(100);
    killBoss(w);
    expect(w.bossesDefeated[0].noHit).toBe(false);
    // a Second Chance charge spent counts as a hit too
    const x = bossWorld(10);
    x.god = false;
    x.secondChancesLeft = 1;
    x.invuln = 0;
    x.enemyBullets.spawn(x.shipX, x.shipY, 0, 0);
    run(x, 0.1);
    killBoss(x);
    expect(x.bossesDefeated[0].noHit).toBe(false);
  });

  it('the run result lists the bosses, and the save keeps each boss id once and counts the untouched fights', () => {
    const w = bossWorld(10);
    killBoss(w);
    const r = flyRunResult(w);
    expect(r.bosses).toEqual([{ id: 'hive', noHit: true }]);
    const store = new ProgressStore(null, defaultProgress());
    store.recordRun(r);
    store.recordRun(r);
    expect(store.data.records.bosses).toEqual(['hive']);
    expect(store.data.records.bossNoHit).toBe(2);
    expect(store.data.achievements).toContain('boss_hive');
    expect(store.data.achievements).toContain('boss_untouched');
    expect(store.data.achievements).not.toContain('boss_bastion');
  });

  it('records: unknown ids are dropped on load, the first-kill achievements exist for all four bosses', () => {
    const rec = sanitizeRecords({ bosses: ['hive', 'nonsense', 3, 'hive', 'queen'], bossNoHit: 2.9 });
    expect(rec.bosses).toEqual(['hive', 'queen']);
    expect(rec.bossNoHit).toBe(2);
    expect(sanitizeRecords(undefined)).toEqual(defaultRecords());
    const r = defaultRecords();
    noteBossRecords(r, [{ id: 'bastion', noHit: false }, { id: 'zzz', noHit: true }]);
    expect(r.bosses).toEqual(['bastion']);
    expect(r.bossNoHit).toBe(0);
    for (const id of ['boss_hive', 'boss_bastion', 'boss_queen', 'boss_colossus', 'boss_untouched']) expect(ACHIEVEMENT_BY_ID[id]).toBeDefined();
  });
});

describe('boss bodies are not rocks', () => {
  it('plates and the core never leak, never die, and are never counted as kills', () => {
    const w = bossWorld(20);
    run(w, 30);
    expect(w.kills).toBe(0);
    expect(w.leaks).toBe(0);
    expect(w.boss!.parts.length).toBe(w.mitosis.enemies.filter(e => e.bossRole).length);
    for (const p of w.boss!.plates) expect(p.hp).toBeGreaterThan(0);
  });

  it('the debug jump clears the field, drops a running boss and puts the clock at the new wave', () => {
    const w = bossWorld(10);
    w.jumpToWave(30);
    expect(w.boss).toBeNull();
    expect(w.mitosis.enemies.length).toBe(0);
    run(w, 0.2);
    expect(w.wave).toBe(30);
    expect(w.boss?.def.id).toBe('queen');
    w.jumpToWave(1);
    run(w, 0.2);
    expect(w.wave).toBe(1);
    expect(w.boss).toBeNull();
  });
});

describe('homing and plates', () => {
  it('a homing shot never picks an invulnerable plate, even when it is the nearest body', () => {
    const body = (id: number, x: number, y: number, role?: 'conduit' | 'plate') => ({ id, x, y, radius: 17, hp: 100, maxHp: 100, armor: 0, shield: 0, maxShield: 0, bossRole: role });
    const plate = body(1, 270, 400, 'plate'), core = body(2, 270, 250, 'conduit');
    const hash = new SpatialHash(540, 960, 64);
    hash.insert(plate.id, plate.x, plate.y); hash.insert(core.id, core.x, core.y);
    const field = new EnemyField([plate, core], hash);
    const out = newHomePick();
    expect(field.nearestInCone(270, 700, 500, 0, -1, Math.cos((60 * Math.PI) / 180), out)).toBe(true);
    expect(out.target?.id).toBe(2);
    const list: unknown[] = [];
    field.collectNear(270, 400, 300, list as never);
    expect(list.length).toBe(1);
  });
});
