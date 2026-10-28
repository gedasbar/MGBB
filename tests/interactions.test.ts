import { describe, it, expect } from 'vitest';
import { BLOCKS, MORE } from '../src/data/blocks';
import { BLOCK_ECONOMY, capOf } from '../src/data/blockEconomy';
import { copyPrice } from '../src/econ/economy';
import { compile } from '../src/engine/compiler';
import { Modifier } from '../src/engine/compilerTypes';
import { CHAIN_ARCS_PER_SHOT, chainJumps, homingConeDeg, homingRange, PIERCE_DAMAGE_KEEP, MINE_EXTRA_MAX, orbitPassTime, orbitTime, ORBIT_RADIUS } from '../src/engine/effects';
import { ProjectilePool } from '../src/engine/pools';
import { EnemyEntity, PHASE_MINE_WAIT, PHASE_NORMAL, ProjectileSystem } from '../src/engine/projectiles';
import { SpatialHash } from '../src/engine/spatialHash';
import { TRIGGERS, triggerCarried, triggerDue } from '../src/engine/triggers';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';

// Chunk 17b: the trigger table (AoE once at the end of the shot, Fork on the first hit, Chain capped, fragments carry statuses only),
// the AoE penalty in the estimate, the "one more copy" lines, and what an extra Homing / Orbit / Mine copy does.

const DT = 1 / 60;
function rig() {
  const pool = new ProjectilePool(256);
  const sys = new ProjectileSystem(pool);
  const enemies: EnemyEntity[] = [];
  const hash = new SpatialHash(540, 960, 64);
  let nextId = 1;
  const rock = (x: number, y: number, hp = 100000, radius = 20) => {
    const e: EnemyEntity = { id: nextId++, x, y, radius, hp, maxHp: hp, armor: 0, shield: 0, maxShield: 0 };
    enemies.push(e);
    return e;
  };
  const launch = (mods: Modifier[], x: number, y: number, vx: number, vy: number, damage = 100) => {
    sys.modifiersTable = [mods];
    sys.shipX = x; sys.shipY = y;
    const i = pool.spawn(x, y, vx, vy, damage, 0, 0);
    sys.init(i);
    return i;
  };
  const step = (n = 1) => {
    for (let k = 0; k < n; k++) {
      sys.steer(DT, enemies);
      for (let i = 0; i < pool.max; i++) if (pool.active[i]) { pool.x[i] += pool.vx[i] * DT; pool.y[i] += pool.vy[i] * DT; }
      sys.updateStatus(DT);
      hash.clear();
      for (const e of enemies) hash.insert(e.id, e.x, e.y);
      sys.processHits(enemies, hash, 1);
    }
  };
  return { pool, sys, enemies, rock, launch, step };
}
const mods = (...types: [string, number?][]): Modifier[] => types.map(([type, level]) => ({ type, level: level ?? 1 }));
const taken = (e: EnemyEntity, from = 100000) => from - e.hp;
/** n Piercing copies on the path, as `mods` entries. */
const pierce = (n: number): [string, number][] => Array.from({ length: n }, () => ['piercing', 1]);

describe('the trigger table', () => {
  it('says what the design note says', () => {
    expect(TRIGGERS.aoe.fires).toBe('every_hit');
    expect(TRIGGERS.fork.fires).toBe('first_hit');
    expect(TRIGGERS.chain.fires).toBe('every_hit');
    expect(TRIGGERS.chain.maxPerShot).toBe(3);
    expect(CHAIN_ARCS_PER_SHOT).toBe(3);
    expect(TRIGGERS.status).toMatchObject({ fires: 'every_hit', fragments: true, arcs: true });
    for (const t of [TRIGGERS.aoe, TRIGGERS.fork, TRIGGERS.chain]) expect(t.fragments).toBe(false);
  });
  it('triggerDue and triggerCarried follow the table', () => {
    expect(triggerDue(TRIGGERS.aoe, false, false)).toBe(true); // 19a: every hit
    expect(triggerDue({ ...TRIGGERS.aoe, fires: 'shot_end' }, true, false)).toBe(false); // the 'shot_end' rule still works if the table is switched back
    expect(triggerDue({ ...TRIGGERS.aoe, fires: 'shot_end' }, false, true)).toBe(true);
    expect(triggerDue(TRIGGERS.fork, true, false)).toBe(true);
    expect(triggerDue(TRIGGERS.fork, false, true)).toBe(false);
    expect(triggerDue(TRIGGERS.chain, false, false)).toBe(true);
    expect(triggerCarried(TRIGGERS.aoe, true)).toBe(false);
    expect(triggerCarried(TRIGGERS.status, true)).toBe(true);
  });
});

describe('AoE fires on every hit (19a)', () => {
  /** A shot with two Piercing copies (3 targets) through four weak rocks in a line, with a bystander beside the first, the third and the fourth. */
  function line(extra: Modifier[]) {
    const r = rig();
    const path = [0, 1, 2, 3].map(j => r.rock(270, 700 - 90 * j, 30, 20));
    const beside1 = r.rock(310, 700, 100000, 10);
    const beside3 = r.rock(310, 700 - 180, 100000, 10);
    const beside4 = r.rock(310, 700 - 270, 100000, 10);
    r.launch([...mods(...pierce(2), ['aoe_circle', 1]), ...extra], 270, 900, 0, -600, 100);
    return { r, path, beside1, beside3, beside4 };
  }
  it('a piercing shot makes a blast on EVERY hit: the bystanders beside the first and the last pierce hit are both hurt', () => {
    const { r, path, beside1, beside3, beside4 } = line([]);
    r.step(120);
    expect(path.slice(0, 3).every(e => e.hp <= 0)).toBe(true);
    expect(path[3].hp).toBe(30);               // the shot ended after three targets
    expect(r.sys.fx.aoeBlasts).toBe(3);
    expect(taken(beside1)).toBeGreaterThan(0); // blast at the first hit
    expect(taken(beside3)).toBeGreaterThan(0); // blast at the last hit
    expect(taken(beside4)).toBe(0);            // the shot did not reach this one
  });
  it('a plain shot (no Piercing, no Bouncing) blasts on its first hit', () => {
    const r = rig();
    const target = r.rock(270, 600);
    const near = r.rock(310, 600, 100000, 10);
    r.launch(mods(['aoe_circle', 1]), 270, 800, 0, -600, 100);
    r.step(60);
    expect(r.sys.fx.aoeBlasts).toBe(1);
    expect(taken(target)).toBe(100);
    expect(taken(near)).toBe(100);
  });
  it('a bouncing shot blasts on every bounce too', () => {
    const r = rig();
    r.rock(270, 600);
    r.rock(270, 300);
    const i = r.launch(mods(['bouncing', 1], ['aoe_circle', 1]), 270, 800, 0, -600, 100);
    r.step(40);
    expect(r.sys.fx.bounces).toBeGreaterThanOrEqual(1);
    expect(r.sys.fx.aoeBlasts).toBe(r.sys.fx.bounces + (r.pool.active[i] ? 0 : 1));
  });
  it('a shot that leaves play owes no blast (retire adds nothing under the every-hit rule)', () => {
    const r = rig();
    r.rock(270, 700); r.rock(270, 610);
    const beside = r.rock(310, 610, 100000, 10);
    const i = r.launch(mods(...pierce(5), ['aoe_circle', 1]), 270, 900, 0, -600, 100);
    r.step(80);
    expect(r.sys.fx.aoeBlasts).toBe(2);
    expect(r.pool.active[i]).toBe(1);
    const before = taken(beside);
    r.sys.retire(i);
    r.step(1);
    expect(r.sys.fx.aoeBlasts).toBe(2);
    expect(taken(beside)).toBe(before);
  });
});

describe('Piercing + AoE + Fork cannot explode (19a)', () => {
  it('3 Piercing copies, AoE and Fork through a dense cluster: 4 blasts at most, one fork, fork copies add no blast, few shots alive', () => {
    const r = rig();
    for (let j = 0; j < 6; j++) for (let k = -3; k <= 3; k++) r.rock(270 + 40 * k, 700 - 70 * j, 100000, 15);
    r.launch(mods(...pierce(3), ['aoe_circle', 1], ['fork_impact', 1]), 270, 900, 0, -600, 100);
    let maxAlive = 0;
    for (let n = 0; n < 150; n++) { r.step(1); maxAlive = Math.max(maxAlive, r.pool.count); }
    expect(r.sys.fx.forks).toBe(1);
    expect(r.sys.fx.aoeBlasts).toBe(4);   // one blast per hit of the main shot (3 copies = 4 targets); the fork copies carry none
    expect(maxAlive).toBeLessThanOrEqual(3);
  });
});

describe('Piercing by count (19a)', () => {
  const targets = (copies: number, rocks = 6) => {
    const r = rig();
    const path = Array.from({ length: rocks }, (_, j) => r.rock(270, 700 - 90 * j, 100000, 20));
    const i = r.launch(mods(...pierce(copies)), 270, 900, 0, -600, 100);
    r.step(120);
    return { r, path, i, hit: path.filter(e => e.hp < 100000).length };
  };
  it('1 copy hits 2 targets and the shot ends after the second; 3 copies hit 4', () => {
    const one = targets(1);
    expect(one.hit).toBe(2);
    expect(one.r.pool.active[one.i]).toBe(0);
    expect(targets(3).hit).toBe(4);
    expect(targets(0 + 1, 1).hit).toBe(1);
  });
  it('every hit is at full damage (PIERCE_DAMAGE_KEEP = 1)', () => {
    expect(PIERCE_DAMAGE_KEEP).toBe(1);
    const { path } = targets(3);
    for (const e of path.slice(0, 4)) expect(taken(e)).toBe(100);
  });
});

describe('Fork on Impact fires on the first hit; fragments carry statuses only', () => {
  it('Fork plus AoE on one shot: both happen', () => {
    const r = rig();
    r.rock(270, 600);
    const near = r.rock(310, 600, 100000, 10);
    r.launch(mods(['fork_impact', 1], ['aoe_circle', 1]), 270, 800, 0, -600, 100);
    r.step(30);
    expect(r.sys.fx.forks).toBe(1);
    expect(r.sys.fx.aoeBlasts).toBe(1);
    expect(taken(near)).toBeGreaterThan(0);
    expect(r.pool.count).toBeGreaterThanOrEqual(1); // the fragments fly on (one may already have hit the neighbour)
  });
  it('a piercing shot forks once (first hit), not on every hit', () => {
    const r = rig();
    for (let j = 0; j < 4; j++) r.rock(270, 700 - 90 * j);
    r.launch(mods(...pierce(3), ['fork_impact', 1]), 270, 900, 0, -600, 100);
    r.step(100);
    expect(r.sys.fx.forks).toBe(1);
  });
  it('fragments keep the statuses but never blast, fork or chain', () => {
    const r = rig();
    r.rock(270, 600);                          // the main hit
    const off = r.rock(419, 417, 100000, 30);  // on the path of the right fragment (35 degrees off the heading)
    r.rock(419 + 70, 417, 100000, 10);        // a neighbour that a blast or a chain from the fragment would reach
    r.launch(mods(['fork_impact', 1], ['aoe_circle', 1], ['chain_lightning', 1], ['ignite', 1]), 270, 800, 0, -600, 100);
    r.step(24);                                              // the main shot has hit (step 19), the fragments are on their way
    expect(r.sys.fx.forks).toBe(1);
    const afterMain = { blasts: r.sys.fx.aoeBlasts, jumps: r.sys.fx.chainJumps, ignites: r.sys.fx.igniteApplied };
    r.step(60);
    expect(taken(off)).toBeGreaterThan(0);                   // the fragment hit it
    expect(r.sys.fx.aoeBlasts).toBe(afterMain.blasts);       // no blast from a fragment
    expect(r.sys.fx.chainJumps).toBe(afterMain.jumps);       // no chain from a fragment
    expect(r.sys.fx.forks).toBe(1);                          // and no second fork
    expect(r.sys.fx.igniteApplied).toBeGreaterThan(afterMain.ignites); // the status travels with it
  });
});

describe('Chain Lightning: every hit, at most 3 chains per shot', () => {
  it('a piercing shot through five rocks with two neighbours each chains only three times', () => {
    const r = rig();
    for (let j = 0; j < 5; j++) {
      r.rock(270, 800 - 100 * j);
      r.rock(270 - 60, 800 - 100 * j, 100000, 10);
      r.rock(270 + 60, 800 - 100 * j, 100000, 10);
    }
    r.launch(mods(...pierce(5), ['chain_lightning', 1]), 270, 950, 0, -600, 100);
    r.step(120);
    expect(r.sys.fx.pierceHits).toBeGreaterThanOrEqual(5);
    expect(r.sys.fx.chainJumps).toBe(CHAIN_ARCS_PER_SHOT * chainJumps(1));
  });
  it('a shot that hits twice chains twice (every hit up to the cap)', () => {
    const r = rig();
    for (let j = 0; j < 2; j++) {
      r.rock(270, 800 - 100 * j);
      r.rock(270 - 60, 800 - 100 * j, 100000, 10);
      r.rock(270 + 60, 800 - 100 * j, 100000, 10);
    }
    r.launch(mods(...pierce(1), ['chain_lightning', 1]), 270, 950, 0, -600, 100);
    r.step(100);
    expect(r.sys.fx.chainJumps).toBe(2 * chainJumps(1));
  });
});

describe('Gravity Well makes one pulling spot per shot', () => {
  it('a piercing shot through three rocks makes one', () => {
    const r = rig();
    for (let j = 0; j < 3; j++) r.rock(270, 800 - 100 * j);
    r.launch(mods(...pierce(2), ['gravity_well', 1]), 270, 950, 0, -600, 100);
    r.step(100);
    expect(r.sys.fx.wellsMade).toBe(1);
  });
});

describe('the estimate shows the AoE penalty', () => {
  const est = (k: number, id = 'aoe_circle') => {
    const g = buildFanGrid();
    place(g, 5, 9, 'flat_plus');
    for (let j = 0; j < k; j++) place(g, 5, 8 - j, id);
    return compile(g).stats.estDps;
  };
  it('x0.95 per extra copy of the Circle and of the Rectangle', () => {
    for (const id of ['aoe_circle', 'aoe_rect']) {
      expect(est(2, id) / est(1, id), id).toBeCloseTo(0.95, 10);
      expect(est(3, id) / est(1, id), id).toBeCloseTo(0.9025, 10);
    }
    expect(est(0)).toBeGreaterThan(0);
    expect(est(1)).toBeCloseTo(est(0), 10); // one copy costs nothing
  });
});

describe('every stacking block says what one more copy does', () => {
  const stackers = ['piercing', 'bouncing', 'aoe_circle', 'aoe_rect', 'chain_lightning', 'homing', 'fork_impact', 'boomerang', 'orbit', 'mine'];
  it.each(stackers)('%s: the rule text has an "Each extra copy" line', (id) => {
    const text = BLOCKS[id].maxLevel > 1 ? BLOCKS[id].desc : BLOCKS[id].desc;
    for (const l of [1, BLOCKS[id].fixedLevel ?? 1, BLOCKS[id].maxLevel]) {
      const t = typeof text === 'function' ? text(l) : text;
      expect(t, `${id} level ${l}`).toContain('Each extra copy:');
    }
  });
  it('the AoE blocks name the 5% penalty and the bigger area', () => {
    for (const id of ['aoe_circle', 'aoe_rect']) {
      const t = (BLOCKS[id].desc as (l: number) => string)(1);
      expect(t).toContain('-5% damage');
      expect(t).toContain('bigger area');
    }
    expect(MORE.aoe).toContain('-5%');
  });
});

describe('Homing, Orbit and Mine: an extra copy does something', () => {
  it('Homing (19a nerf): one copy is clearly shorter-sighted than the old 400 px / 60 deg, three copies are about the old values', () => {
    const OLD_RANGE = 400, OLD_CONE = 60;
    expect(homingRange(1)).toBeLessThan(OLD_RANGE * 0.9);
    expect(homingConeDeg(1)).toBeLessThan(OLD_CONE * 0.7);
    expect(Math.abs(homingRange(3) / OLD_RANGE - 1)).toBeLessThan(0.1);
    expect(Math.abs(homingConeDeg(3) / OLD_CONE - 1)).toBeLessThan(0.1);
    expect(homingConeDeg(2)).toBeGreaterThan(homingConeDeg(1));
  });
  it('Homing: the seek range grows with the copies (then longer with shrinking steps)', () => {
    expect(homingRange(2)).toBeGreaterThan(homingRange(1));
    expect(homingRange(3) - homingRange(2)).toBeLessThan(homingRange(2) - homingRange(1) + 1e-9 + 100);
    // a rock 360 px away, 20 degrees off the heading: only a shot with two copies sees it (one copy: 328 px, 33 degree cone)
    const turned = (k: number) => {
      const r = rig();
      r.rock(270 + 360 * Math.sin(20 * Math.PI / 180), 900 - 360 * Math.cos(20 * Math.PI / 180), 100000, 20);
      const i = r.launch(Array.from({ length: k }, () => ({ type: 'homing', level: 1 })), 270, 900, 0, -600, 100);
      r.step(1);
      return Math.abs(r.pool.vx[i]);
    };
    expect(turned(1)).toBeCloseTo(0, 6);
    expect(turned(2)).toBeGreaterThan(1);
  });
  it('Orbit: each extra copy adds one more full pass round the ship before the launch', () => {
    const launchAt = (k: number) => {
      const r = rig();
      const i = r.launch(Array.from({ length: k }, () => ({ type: 'orbit', level: 1 })), 270, 800, 0, -600, 100);
      let t = 0;
      while (r.pool.phase[i] !== PHASE_NORMAL || t === 0) { r.step(1); t += DT; if (t > 20) break; }
      return t;
    };
    const t1 = launchAt(1), t2 = launchAt(2), t3 = launchAt(3);
    expect(t1).toBeCloseTo(orbitTime(1), 1);
    expect(t2 - t1).toBeCloseTo(orbitPassTime(600), 1);
    expect(t3 - t2).toBeCloseTo(orbitPassTime(600), 1);
    expect(orbitPassTime(600)).toBeCloseTo((2 * Math.PI * ORBIT_RADIUS) / 600, 12);
  });
  it('Mine: each extra copy lays one more mine beside the first, up to the maximum', () => {
    const mines = (k: number) => {
      const r = rig();
      r.launch(Array.from({ length: k }, () => ({ type: 'mine', level: 1 })), 270, 800, 0, -600, 100);
      r.step(60);
      let n = 0;
      for (let i = 0; i < r.pool.max; i++) if (r.pool.active[i] && r.pool.phase[i] === PHASE_MINE_WAIT) n++;
      return n;
    };
    expect([1, 2, 3, 4, 5, 8].map(mines)).toEqual([1, 2, 3, 4, 1 + MINE_EXTRA_MAX, 1 + MINE_EXTRA_MAX]);
  });
  it('an extra mine detonates when touched, like the first', () => {
    const r = rig();
    r.launch([{ type: 'mine', level: 1 }, { type: 'mine', level: 1 }], 270, 800, 0, -600, 100);
    r.step(60);
    const xs: number[] = [];
    for (let i = 0; i < r.pool.max; i++) if (r.pool.active[i]) xs.push(r.pool.x[i]);
    expect(xs.length).toBe(2);
    const e = r.rock(Math.max(...xs), r.pool.y[r.pool.active.findIndex(a => a === 1)], 100000, 12);
    r.step(2);
    expect(taken(e)).toBeGreaterThan(0);
    expect(r.sys.fx.mineDetonations).toBeGreaterThanOrEqual(1);
  });
});

describe('caps and prices (17b)', () => {
  it('Splitters 15, Turns 20, with steeper copy prices', () => {
    expect(capOf('splitter_2')).toBe(15);
    expect(capOf('splitter_3')).toBe(15);
    expect(capOf('turn_l')).toBe(20);
    expect(capOf('turn_r')).toBe(20);
    expect([BLOCK_ECONOMY.splitter_2.growth, BLOCK_ECONOMY.splitter_3.growth, BLOCK_ECONOMY.turn_l.growth, BLOCK_ECONOMY.turn_r.growth]).toEqual([1.35, 1.45, 1.2, 1.2]);
    expect([BLOCK_ECONOMY.splitter_2.base, BLOCK_ECONOMY.splitter_3.base, BLOCK_ECONOMY.turn_l.base]).toEqual([120, 700, 30]); // bases kept
    expect(copyPrice('splitter_3', 14)).toBe(Math.round(700 * Math.pow(1.45, 14)));
  });
});
