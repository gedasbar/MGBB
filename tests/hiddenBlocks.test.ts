import { describe, it, expect } from 'vitest';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { compile, Grid } from '../src/engine/compiler';
import { describeBlock } from '../src/engine/compilerTypes';
import { SpatialHash } from '../src/engine/spatialHash';
import { PX_PER_CELL, World } from '../src/game/world';
import { FIRE_OFFSET_SCALE } from '../src/wall/constants';
import { buildFanGrid } from '../src/game/gridUtils';
import { buildStarterGrid, place } from '../src/game/starter';
import { PointerState } from '../src/input';
import { rng } from '../src/rng';
import { glyphFor, GLYPHS } from '../src/ui/blockArt';

/**
 * Chunk 4 part B: blocks that moved from hidden to the picker. One table, one row per block:
 * a compile assertion and a Fly behavioural assertion against a baseline without the block.
 */

const SLOT = { col: 9, row: 5 }; // on the vertical run into the Shuttle ejector
const withBlock = (id?: string): Grid => {
  const g = buildStarterGrid();
  if (id) place(g, SLOT.col, SLOT.row, id);
  return g;
};
const newWorld = (id?: string) => new World({ grid: withBlock(id), autoSpawn: false });
const pointer: PointerState = { x: 0, y: 0, active: false, type: 'mouse', seen: false };

function fireOne(w: World): number {
  w.pool.active.fill(0);
  w.pool.count = 0;
  w.fire();
  for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) return i;
  throw new Error('nothing fired');
}

function run(w: World, frames: number, onFrame?: () => void) {
  for (let f = 0; f < frames; f++) { w.update(1 / 60, pointer); onFrame?.(); }
}

/** Fires one projectile, spawns an enemy under it and runs the real hit processing once. */
function hitOnce(w: World, enemy: { armor?: number } = {}, extra: [number, number][] = []) {
  const i = fireOne(w);
  const e = w.spawnRock(w.pool.x[i], w.pool.y[i], 100000)!;
  e.armor = enemy.armor ?? 0;
  const others = extra.map(([dx, dy]) => w.spawnRock(w.pool.x[i] + dx, w.pool.y[i] + dy, 100000)!);
  const hash = new SpatialHash(540, 960, 64);
  for (const en of w.mitosis.enemies) hash.insert(en.id, en.x, en.y);
  const damage = w.pool.damage[i];
  w.projSys.processHits(w.mitosis.enemies, hash, 1);
  return { i, e, others, damage, taken: 100000 - e.hp, takenBy: (o: { hp: number }) => 100000 - o.hp };
}

const heading = (w: World, i: number) => Math.atan2(w.pool.vy[i], w.pool.vx[i]) * 180 / Math.PI;

interface Row {
  id: string;
  mod: Record<string, unknown>;
  text: RegExp;
  fly: () => void;
}

const ROWS: Row[] = [
  {
    id: 'armor_piercer',
    mod: { type: 'armor_piercer', level: 1 },
    text: /×2 damage to enemies that have armor/,
    fly: () => {
      const armoredBase = hitOnce(newWorld(), { armor: 10 }).taken;
      const armored = hitOnce(newWorld('armor_piercer'), { armor: 10 }).taken;
      expect(armored / armoredBase).toBeCloseTo(2, 5);
      const plainBase = hitOnce(newWorld(), { armor: 0 }).taken;
      const plain = hitOnce(newWorld('armor_piercer'), { armor: 0 }).taken;
      expect(plain).toBeCloseTo(plainBase, 5); // no effect on unarmored enemies
    },
  },
  {
    id: 'curving_right',
    mod: { type: 'curve', dir: 'right', level: 1 },
    text: /clockwise at 90° per second/,
    fly: () => {
      const base = newWorld();
      const b = fireOne(base);
      run(base, 30);
      expect(base.pool.vx[b]).toBeCloseTo(0, 3);
      const w = newWorld('curving_right');
      const i = fireOne(w);
      const speed = Math.hypot(w.pool.vx[i], w.pool.vy[i]);
      run(w, 30); // 0.5 s at 90 deg/s = 45 degrees clockwise: up (-90) becomes -45
      expect(heading(w, i)).toBeCloseTo(-45, 0);
      expect(w.pool.vx[i]).toBeGreaterThan(0);
      expect(Math.hypot(w.pool.vx[i], w.pool.vy[i])).toBeCloseTo(speed, 1);
    },
  },
  {
    id: 'homing',
    mod: { type: 'homing', level: 1 },
    text: /180° per second toward the nearest enemy within 400 px and a 60° cone/,
    fly: () => {
      const trial = (id?: string) => {
        const w = newWorld(id);
        const i = fireOne(w);
        // 250 px ahead and 90 px to the right: 20 degrees off the heading, inside the 60 degree cone.
        const e = w.spawnRock(w.pool.x[i] + 90, w.pool.y[i] - 250, 100000)!;
        run(w, 40);
        return 100000 - e.hp;
      };
      expect(trial()).toBe(0); // straight shot misses
      expect(trial('homing')).toBeGreaterThan(0);
      // Outside the cone (target almost beside the projectile): no steering.
      const w = newWorld('homing');
      const i = fireOne(w);
      w.spawnRock(w.pool.x[i] + 200, w.pool.y[i] - 20, 100000);
      w.projSys.steer(1 / 60, w.mitosis.enemies);
      expect(w.pool.vx[i]).toBeCloseTo(0, 3);
      // Beyond 400 px: no steering either.
      const far = newWorld('homing');
      const j = fireOne(far);
      far.spawnRock(far.pool.x[j] + 100, far.pool.y[j] - 500, 100000);
      far.projSys.steer(1 / 60, far.mitosis.enemies);
      expect(far.pool.vx[j]).toBeCloseTo(0, 3);
    },
  },
  {
    id: 'random_curve',
    mod: { type: 'random_curve', level: 1 },
    text: /at most 120° per second/,
    fly: () => {
      const trial = () => {
        rng.reset(7);
        const w = newWorld('random_curve');
        const i = fireOne(w);
        let maxRate = 0;
        let prev = heading(w, i);
        run(w, 60, () => {
          const h = heading(w, i);
          maxRate = Math.max(maxRate, Math.abs(h - prev) * 60);
          prev = h;
        });
        return { vx: w.pool.vx[i], maxRate };
      };
      const a = trial();
      const b = trial();
      expect(a.vx).toBe(b.vx); // seeded combat RNG: same seed, same path
      expect(Math.abs(a.vx)).toBeGreaterThan(1);
      expect(a.maxRate).toBeLessThanOrEqual(120.5);
      const base = newWorld();
      const k = fireOne(base);
      run(base, 60);
      expect(base.pool.vx[k]).toBeCloseTo(0, 3);
    },
  },
  {
    id: 'aoe_rect',
    mod: { type: 'aoe_rect', level: 3 }, // fixed level 3 since 16c-2
    text: /240 px wide and 36 px tall/,
    fly: () => {
      // Neighbours: inside the bar, outside it horizontally, outside it vertically.
      const near: [number, number][] = [[60, 0], [150, 0], [0, -60]];
      const base = hitOnce(newWorld(), {}, near);
      expect(base.others.map(base.takenBy)).toEqual([0, 0, 0]);
      const r = hitOnce(newWorld('aoe_rect'), {}, near);
      expect(r.taken).toBeGreaterThan(0);
      expect(r.takenBy(r.others[0])).toBeCloseTo(r.taken, 5); // full damage, once
      expect(r.takenBy(r.others[1])).toBe(0);
      expect(r.takenBy(r.others[2])).toBe(0);
    },
  },
  {
    id: 'fork_impact',
    mod: { type: 'fork_impact', level: 1 },
    text: /2 copies at 50% damage and 0\.6× size/,
    fly: () => {
      const base = newWorld();
      hitOnce(base);
      expect(base.pool.count).toBe(0);
      const w = newWorld('fork_impact');
      const h = hitOnce(w);
      expect(w.pool.count).toBe(2);
      const copies: number[] = [];
      for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) copies.push(i);
      const angles = copies.map(i => heading(w, i) + 90).sort((a, b) => a - b);
      expect(angles[0]).toBeCloseTo(-35, 3);
      expect(angles[1]).toBeCloseTo(35, 3);
      for (const i of copies) {
        expect(w.pool.damage[i]).toBeCloseTo(h.damage * 0.5, 5);
        expect(w.pool.size[i]).toBeCloseTo(0.6, 5);
        expect(w.pool.skipId[i]).toBe(h.e.id);
      }
      // A copy that hits another enemy deals its damage and does not fork again.
      const c = copies[0];
      w.pool.x[copies[1]] = 10; // park the other copy away from the enemy
      w.pool.y[copies[1]] = 10;
      const other = w.spawnRock(w.pool.x[c], w.pool.y[c], 100000)!;
      const hash = new SpatialHash(540, 960, 64);
      for (const en of w.mitosis.enemies) hash.insert(en.id, en.x, en.y);
      w.projSys.processHits(w.mitosis.enemies, hash, 1);
      expect(100000 - other.hp).toBeCloseTo(h.damage * 0.5, 5);
      expect(w.pool.count).toBe(1); // the hitting copy is gone, nothing new forked
    },
  },
];

describe('hidden blocks that are now shown: compile + Fly, per block', () => {
  for (const row of ROWS) {
    it(`${row.id}: compile`, () => {
      const base = compile(withBlock());
      const res = compile(withBlock(row.id));
      expect(res.recipes.length).toBe(1);
      expect(res.recipes[0].packet.damage).toBe(base.recipes[0].packet.damage); // only a modifier, no damage change
      expect(res.recipes[0].packet.mods).toEqual([expect.objectContaining(row.mod)]);
      expect(BLOCKS[row.id].shown).toBe(true);
      expect(pickerBlocks().map(b => b.id)).toContain(row.id);
      expect(describeBlock(BLOCKS[row.id], 1)).toMatch(row.text);
      expect(GLYPHS[row.id], `${row.id} has a plate glyph`).toBeDefined();
    });
    it(`${row.id}: fly`, row.fly);
  }

  it('glyph flags: routing and curve glyphs turn with the block, symbol glyphs stay upright', () => {
    for (const id of ['turn_l', 'turn_r', 'splitter_2', 'splitter_3', 'curving_right', 'random_curve']) expect(glyphFor(id).rotatesWithBlock, id).toBe(true);
    for (const id of ['flat_plus', 'lucky_strike', 'homing', 'aoe_rect', 'fork_impact', 'armor_piercer']) expect(glyphFor(id).rotatesWithBlock, id).toBe(false);
    expect(glyphFor('no_such_block')).toBeDefined();
  });

  it('B0: projectiles spawn at their own ejector, and the count and damage per pulse still match the stats', () => {
    const g = buildFanGrid();
    place(g, 5, 6, 'splitter_3');
    place(g, 2, 6, 'turn_r');
    place(g, 8, 6, 'turn_l');
    const compiled = compile(g);
    expect(compiled.recipes.length).toBe(3);
    const w = new World({ grid: g, autoSpawn: false });
    w.pool.active.fill(0);
    w.pool.count = 0;
    w.fire();
    const xs: number[] = [];
    const ys: number[] = [];
    let dmg = 0;
    for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) { xs.push(w.pool.x[i] - w.shipX); ys.push(w.pool.y[i] - w.shipY); dmg += w.pool.damage[i]; }
    expect(xs.sort((a, b) => a - b)).toEqual([-3 * PX_PER_CELL * FIRE_OFFSET_SCALE, 0, 3 * PX_PER_CELL * FIRE_OFFSET_SCALE]);
    expect(ys.every(y => y === (0 - (g.h - 1) / 2) * PX_PER_CELL * FIRE_OFFSET_SCALE)).toBe(true);
    expect(w.pool.count).toBe(compiled.stats.projectilesPerPulse);
    expect(dmg / w.pool.count).toBe(compiled.stats.damagePerShot);
  });
});
