import { describe, it, expect, beforeEach } from 'vitest';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { compile, Grid } from '../src/engine/compiler';
import { armorScale } from '../src/engine/damage';
import { SpatialHash } from '../src/engine/spatialHash';
import { World } from '../src/game/world';
import { buildFanGrid } from '../src/game/gridUtils';
import { buildStarterGrid, place } from '../src/game/starter';
import { rng } from '../src/rng';
import { CONFIG } from '../src/config';
import { fireRateMul } from '../src/data/hulls';

import { richModel } from './helpers';

/**
 * Block audit: every block offered in the picker must (a) compile correctly and (b) change what the ship
 * actually fires in the Fly simulation. The test names are quoted in the final report.
 */

// Default circuit: Turn Right (6,9), Turn Left (9,9), Flat+ (9,6). Cell (9,5) is on the vertical run before the ejector.
const SLOT = { col: 9, row: 5 };
const withBlock = (id: string): Grid => {
  const g = buildStarterGrid();
  place(g, SLOT.col, SLOT.row, id);
  return g;
};
const segDirsFrom = (g: Grid, col: number, row: number) =>
  compile(g).segments.filter(s => s.fromCell.x === col - 1 && s.fromCell.y === row - 1).map(s => s.dir);

/** Fires one pulse and returns the projectile indices spawned. */
function fireOnce(world: World): number[] {
  world.pool.active.fill(0);
  world.pool.count = 0;
  world.fire();
  const idx: number[] = [];
  for (let i = 0; i < world.pool.max; i++) if (world.pool.active[i]) idx.push(i);
  return idx;
}

/** Fires one projectile, puts an enemy under it and runs the real hit processing once. */
function hitOnce(world: World, enemy: { hp?: number; armor?: number; shield?: number } = {}) {
  const [i] = fireOnce(world);
  const e = world.spawnRock(world.pool.x[i], world.pool.y[i], enemy.hp ?? 100000)!;
  e.armor = enemy.armor ?? 0;
  e.shield = enemy.shield ?? 0;
  e.maxShield = e.shield;
  const hash = new SpatialHash(540, 960, 64);
  for (const en of world.mitosis.enemies) hash.insert(en.id, en.x, en.y);
  const startDamage = world.pool.damage[i];
  const vx0 = world.pool.vx[i];
  const vy0 = world.pool.vy[i];
  world.projSys.processHits(world.mitosis.enemies, hash, 1);
  return { i, e, startDamage, vx0, vy0 };
}

const newWorld = (g: Grid) => new World({ grid: g, autoSpawn: false });

describe('block audit: the picker only offers blocks that compile and change Fly', () => {
  it('the picker lists exactly the audited blocks', () => {
    expect(pickerBlocks().map(b => b.id).sort()).toEqual([
      'alternator', 'aoe_circle', 'aoe_rect', 'armor_piercer', 'boomerang', 'bouncing', 'capacitor', 'cauterize', 'chain_lightning',
      'cleaver', 'corrosion', 'culling_bolt', 'curving_right', 'delay_line', 'executioner', 'fission_catalyst', 'flat_plus',
      'fork_impact', 'frostbite', 'gamblers_gate', 'gravity_well', 'homing', 'ignite', 'jackpot', 'lucky_strike', 'mine',
      'orbit', 'overclock', 'overkill_spill', 'percent_mult', 'piercing', 'pure_converter', 'random_curve', 'random_router',
      'residue_seed', 'shield_breaker', 'splitter_2', 'splitter_3', 'static_charge', 'turn_l', 'turn_r',
      // Chunk 20a: the twelve legendary blocks
      'frontier_echo', 'fuse', 'heavy_round', 'hollow_core', 'idle_barrels', 'last_breath', 'lone_shot', 'mirror', 'payload', 'rebound',
      'waypoint', 'zigzag',
    ].sort());
  });

  it('every hidden block has a stated reason, and none is a fixed cell offered for placement', () => {
    for (const b of Object.values(BLOCKS)) {
      if (!b.shown) expect(b.hideReason, b.id).toBeTruthy();
    }
    expect(BLOCKS.straight.shown).toBe(false);
    expect(BLOCKS.crossover.shown).toBe(false);
  });

  it('every visible block has rule text that states its real numbers', () => {
    const text = (id: string, lv = 1) => {
      const d = BLOCKS[id].desc;
      return typeof d === 'function' ? d(lv) : d;
    };
    expect(text('flat_plus')).toContain("+1 damage");
    expect(text('percent_mult')).toContain('×1.5');
    expect(text('percent_mult', 10)).toContain('×3');
    expect(text('lucky_strike')).toBe('33% chance to double projectile damage.');
    expect(text('jackpot')).toContain('4%');
    expect(text('jackpot')).toContain('10');
    expect(text('gamblers_gate')).toContain('40%');
    expect(text('pure_converter')).toContain('15%');
    expect(text('aoe_circle')).toContain('54 units');
    for (const b of pickerBlocks()) expect(text(b.id).length, b.id).toBeGreaterThan(10);
  });
});

describe('block audit: compiles correctly', () => {
  it('compiles: turn_l sends the line left', () => {
    const g = withBlock('turn_l');
    expect(compile(g).recipes.length).toBe(0);
    expect(segDirsFrom(g, SLOT.col, SLOT.row)).toEqual(['W']);
  });
  it('compiles: turn_r sends the line right', () => {
    const g = withBlock('turn_r');
    expect(compile(g).recipes.length).toBe(0);
    expect(segDirsFrom(g, SLOT.col, SLOT.row)).toEqual(['E']);
  });
  it('compiles: splitter_2 makes a left and a right branch only', () => {
    expect(segDirsFrom(withBlock('splitter_2'), SLOT.col, SLOT.row)).toEqual(['W', 'E']);
  });
  it('compiles: splitter_3 makes left, forward and right branches', () => {
    const g = withBlock('splitter_3');
    expect(segDirsFrom(g, SLOT.col, SLOT.row)).toEqual(['W', 'N', 'E']);
    expect(compile(g).recipes.length).toBe(1);
    expect(compile(g).recipes[0].packet.damage).toBe(2); // the forward copy keeps full damage
  });
  it('compiles: flat_plus adds 1', () => {
    expect(compile(withBlock('flat_plus')).recipes[0].packet.damage).toBe(3);
  });
  it('compiles: percent_mult multiplies by 1.5 in path order', () => {
    expect(compile(withBlock('percent_mult')).recipes[0].packet.damage).toBe(2 * 1.5);
  });
  it('compiles: lucky_strike adds a 33% x2 gate without changing the deterministic damage', () => {
    const p = compile(withBlock('lucky_strike')).recipes[0].packet;
    expect(p.damage).toBe(2);
    expect(p.gates).toEqual([{ prob: 0.33, mult: 2, elseMult: 1 }]);
  });
  it('compiles: jackpot adds a 4% x10 gate', () => {
    expect(compile(withBlock('jackpot')).recipes[0].packet.gates).toEqual([{ prob: 0.04, mult: 10, elseMult: 1 }]);
  });
  it('compiles: gamblers_gate adds a 40% x3-or-lose gate', () => {
    expect(compile(withBlock('gamblers_gate')).recipes[0].packet.gates).toEqual([{ prob: 0.4, mult: 3, elseMult: 0 }]);
  });
  it('compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet', () => {
    for (const [id, type] of [['piercing', 'piercing'], ['bouncing', 'bouncing'], ['aoe_circle', 'aoe_circle'], ['shield_breaker', 'shield_breaker']]) {
      expect(compile(withBlock(id)).recipes[0].packet.mods.map(m => m.type), id).toEqual([type]);
    }
  });
  it('compiles: pure_converter makes 15% of the damage pure', () => {
    expect(compile(withBlock('pure_converter')).recipes[0].packet.pure).toBeCloseTo(0.15, 10);
  });
});

describe('block audit: changes what the ship fires in Fly', () => {
  beforeEach(() => rng.reset(12345));

  it('fly: turn_l and turn_r change whether the ship fires at all', () => {
    expect(fireOnce(newWorld(buildStarterGrid())).length).toBe(1);
    expect(fireOnce(newWorld(withBlock('turn_l'))).length).toBe(0);
    expect(fireOnce(newWorld(withBlock('turn_r'))).length).toBe(0);
  });

  it('fly: splitter_2 and splitter_3 change the number of projectiles per pulse', () => {
    const fan2 = buildFanGrid();
    place(fan2, 5, 6, 'splitter_2');
    place(fan2, 2, 6, 'turn_r');
    place(fan2, 8, 6, 'turn_l');
    expect(fireOnce(newWorld(fan2)).length).toBe(2);

    const fan3 = buildFanGrid();
    place(fan3, 5, 6, 'splitter_3');
    place(fan3, 2, 6, 'turn_r');
    place(fan3, 8, 6, 'turn_l');
    const w = newWorld(fan3);
    expect(fireOnce(w).length).toBe(3);
    expect(compile(fan3).stats.projectilesPerPulse).toBe(3);
  });

  it('fly: flat_plus and percent_mult change the damage of the fired projectile', () => {
    const base = newWorld(buildStarterGrid());
    const [b] = fireOnce(base);
    expect(base.pool.damage[b]).toBe(2);
    const f = newWorld(withBlock('flat_plus'));
    expect(f.pool.damage[fireOnce(f)[0]]).toBe(3);
    const m = newWorld(withBlock('percent_mult'));
    expect(m.pool.damage[fireOnce(m)[0]]).toBeCloseTo(3, 6);
  });

  const roll = (id: string, n = 3000) => {
    const w = newWorld(withBlock(id));
    const dmg: number[] = [];
    for (let k = 0; k < n; k++) {
      const idx = fireOnce(w);
      dmg.push(idx.length ? w.pool.damage[idx[0]] : 0);
    }
    return dmg;
  };

  it('fly: lucky_strike doubles the damage of about 33% of the shots', () => {
    const d = roll('lucky_strike');
    const doubled = d.filter(x => x === 4).length / d.length;
    expect(d.every(x => x === 2 || x === 4)).toBe(true);
    expect(doubled).toBeGreaterThan(0.29);
    expect(doubled).toBeLessThan(0.37);
  });

  it('fly: jackpot multiplies the damage of about 4% of the shots by ten', () => {
    const d = roll('jackpot', 6000);
    const big = d.filter(x => x === 20).length / d.length;
    expect(d.every(x => x === 2 || x === 20)).toBe(true);
    expect(big).toBeGreaterThan(0.025);
    expect(big).toBeLessThan(0.055);
  });

  it('fly: gamblers_gate loses about 60% of the projectiles and triples the rest', () => {
    const d = roll('gamblers_gate');
    const lost = d.filter(x => x === 0).length / d.length;
    expect(d.every(x => x === 0 || x === 6)).toBe(true);
    expect(lost).toBeGreaterThan(0.55);
    expect(lost).toBeLessThan(0.65);
  });

  it('fly: the expected DPS in the stats strip matches the long-run average damage fired', () => {
    for (const id of ['lucky_strike', 'jackpot', 'gamblers_gate']) {
      const d = roll(id, 20000);
      const avg = d.reduce((a, b) => a + b, 0) / d.length;
      const ev = compile(withBlock(id)).stats.estDps / compile(withBlock(id)).stats.pulsesPerSecond;
      expect(Math.abs(avg - ev) / ev, id).toBeLessThan(0.05);
    }
  });

  it('fly: piercing lets the projectile survive a hit (baseline: it is destroyed)', () => {
    // Chunk 19a: one Piercing copy lets the shot through one target, at full damage.
    const wb = newWorld(buildStarterGrid());
    const base = hitOnce(wb, { hp: 0.8 });
    expect(wb.pool.active[base.i]).toBe(0);
    const w = newWorld(withBlock('piercing'));
    const r = hitOnce(w, { hp: 0.8 });
    expect(w.pool.active[r.i]).toBe(1);
    expect(w.pool.damage[r.i]).toBe(r.startDamage);
  });

  it('fly: bouncing ricochets off an armored enemy (baseline: destroyed)', () => {
    const armor = armorScale(1) * 9;
    const wb = newWorld(buildStarterGrid());
    const rb = hitOnce(wb, { armor });
    expect(wb.pool.active[rb.i]).toBe(0);
    const w = newWorld(withBlock('bouncing'));
    const r = hitOnce(w, { armor });
    expect(w.pool.active[r.i]).toBe(1);
    expect(w.pool.vx[r.i] !== r.vx0 || w.pool.vy[r.i] !== r.vy0).toBe(true);
    expect(w.pool.damage[r.i]).toBe(r.startDamage);
  });

  it('fly: aoe_circle also damages a neighbouring enemy (baseline: only the one hit)', () => {
    const twoEnemies = (world: World) => {
      const [i] = fireOnce(world);
      const a = world.spawnRock(world.pool.x[i], world.pool.y[i], 100000)!;
      const b = world.spawnRock(world.pool.x[i] + 30, world.pool.y[i], 100000)!;
      const hash = new SpatialHash(540, 960, 64);
      for (const en of world.mitosis.enemies) hash.insert(en.id, en.x, en.y);
      world.projSys.processHits(world.mitosis.enemies, hash, 1);
      return [a.hp, b.hp];
    };
    const [, bBase] = twoEnemies(newWorld(buildStarterGrid()));
    expect(bBase).toBe(100000);
    const [aHp, bHp] = twoEnemies(newWorld(withBlock('aoe_circle')));
    expect(aHp).toBeLessThan(100000);
    expect(bHp).toBeLessThan(100000);
  });

  it('fly: shield_breaker strips more shield and deals more damage than the same shot without it', () => {
    const base = newWorld(buildStarterGrid());
    const rb = hitOnce(base, { shield: 1000, hp: 5000 });
    const w = newWorld(withBlock('shield_breaker'));
    const r = hitOnce(w, { shield: 1000, hp: 5000 });
    expect(1000 - r.e.shield).toBeGreaterThan(1000 - rb.e.shield);
  });

  it('fly: pure_converter ignores armor, so an armored enemy takes more damage', () => {
    const armor = armorScale(1) * 9;
    const rb = hitOnce(newWorld(buildStarterGrid()), { armor, hp: 5000 });
    const r = hitOnce(newWorld(withBlock('pure_converter')), { armor, hp: 5000 });
    expect(5000 - r.e.hp).toBeGreaterThan(5000 - rb.e.hp);
  });
});

describe('the stats strip equals what the ship fires', () => {
  const circuits: [string, () => Grid][] = [
    ['default circuit', () => buildStarterGrid()],
    ['flat + x1.5', () => { const g = buildStarterGrid(); place(g, 9, 5, 'percent_mult'); return g; }],
    ['three-way split', () => { const g = buildFanGrid(); place(g, 5, 6, 'splitter_3'); place(g, 2, 6, 'turn_r'); place(g, 8, 6, 'turn_l'); return g; }],
    ['split with a damage block on the middle branch', () => {
      const g = buildFanGrid(); place(g, 5, 6, 'splitter_3'); place(g, 5, 4, 'flat_plus'); place(g, 2, 6, 'turn_r'); place(g, 8, 6, 'turn_l'); return g;
    }],
  ];
  for (const [name, make] of circuits) {
    it(`projectiles per pulse and damage per shot: ${name}`, () => {
      const g = make();
      const stats = compile(g).stats;
      const w = newWorld(g);
      const idx = fireOnce(w);
      expect(idx.length).toBe(stats.projectilesPerPulse);
      const dmg = idx.map(i => w.pool.damage[i]);
      expect(dmg.reduce((a, b) => a + b, 0) / dmg.length).toBeCloseTo(stats.damagePerShot, 6);
      expect(stats.pulsesPerSecond).toBe(CONFIG.PULSE.BASE_RATE * fireRateMul(g.hullId)); // the hull's pulse rate (chunk 14a)
    });
  }

  it('the builder model reports the same numbers the Fly screen will fire', () => {
    const m = richModel(null);
    m.place(8, 4, 'percent_mult');
    const w = newWorld(m.gridForFlight());
    const idx = fireOnce(w);
    expect(idx.length).toBe(m.compiled.stats.projectilesPerPulse);
    expect(w.pool.damage[idx[0]]).toBeCloseTo(m.compiled.stats.damagePerShot, 6);
  });
});
