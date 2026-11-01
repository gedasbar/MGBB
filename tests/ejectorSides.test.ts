import { describe, it, expect } from 'vitest';
import { compile, Grid, GridCell } from '../src/engine/compiler';
import { Dir } from '../src/engine/compilerTypes';
import { parseLayout } from '../src/game/gridUtils';
import { standardBuild } from '../src/debug/hullBuilds';
import { HULL_ORDER } from '../src/data/hulls';
import { Gun, spawnOffsetsFor } from '../src/game/fire';
import { ProjectilePool } from '../src/engine/pools';
import { ProjectileSystem } from '../src/engine/projectiles';
import { FIRE_OFFSET_SCALE } from '../src/wall/constants';
import { LANE_GAP } from '../src/engine/effects';

const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, '0');
};
const at = (g: Grid, x: number, y: number): GridCell => g.cells[y * g.w + x];
const fixed = (g: Grid, x: number, y: number, type: 'generator' | 'ejector', facing: Dir) => { const c = at(g, x, y); c.type = type; c.facing = facing; };
const open = () => parseLayout(new Array(9).fill('_'.repeat(9)));

describe('chunk 25a: an ejector takes a signal from any side', () => {
  it('entered from the left it fires right (east); the recipe sits on that ejector', () => {
    const g = open();
    fixed(g, 1, 4, 'generator', 'E');
    fixed(g, 6, 4, 'ejector', 'N'); // the stored facing no longer matters
    const c = compile(g);
    expect(c.recipes.map(r => [r.direction, r.x, r.y])).toEqual([['E', 6, 4]]);
    expect(c.cellInfo[4 * 9 + 6].inDirs).toEqual(['E']);
    expect(c.warnings).toEqual([]);
  });
  it('from above it fires down, from the right it fires left, from below it fires up (as before)', () => {
    for (const [gen, ej, want] of [[[4, 1, 'S'], [4, 6], 'S'], [[7, 4, 'W'], [2, 4], 'W'], [[4, 7, 'N'], [4, 2], 'N']] as const) {
      const g = open();
      fixed(g, gen[0], gen[1], 'generator', gen[2] as Dir);
      fixed(g, ej[0], ej[1], 'ejector', 'N');
      expect(compile(g).recipes.map(r => r.direction)).toEqual([want]);
    }
  });
  it('a sideways shot flies sideways, and Angle turns it relative to that direction', () => {
    const g = open();
    fixed(g, 1, 4, 'generator', 'E');
    at(g, 3, 4).blockId = 'angle_left'; at(g, 3, 4).rotation = 90;
    fixed(g, 6, 4, 'ejector', 'N');
    const c = compile(g);
    expect(c.recipes.length).toBe(1);
    const pool = new ProjectilePool(64);
    const sys = new ProjectileSystem(pool);
    sys.modifiersTable = c.recipes.map(r => r.packet.mods);
    const gun = new Gun(pool, sys, c.recipes, spawnOffsetsFor(c.recipes, g), 0.25);
    gun.update(0.25, 270, 800);
    gun.fire(270, 800);
    const i = [...Array(64).keys()].find(k => pool.active[k])!;
    expect(pool.vx[i]).toBeGreaterThan(0); // east
    expect(Math.abs(pool.vy[i])).toBeLessThan(Math.abs(pool.vx[i])); // only turned a little
    expect(pool.vy[i]).not.toBe(0);
  });
  it('every hull\'s standard build compiles to the same recipes as before (all fire up)', () => {
    const rows = HULL_ORDER.map(id => {
      const g = standardBuild(id);
      if (!g) return [id];
      return [id, compile(g).recipes.map(r => [r.direction, r.x, r.y, r.lane, !!r.extra, r.packet.damage])];
    });
    expect((rows.flat(2) as unknown[]).filter(v => v === 'E' || v === 'S' || v === 'W').length).toBe(0);
    expect(fnv(JSON.stringify(rows))).toBe('157ff3e4');
  });
});

describe('chunk 25a: tighter shot spacing', () => {
  it('constants', () => {
    expect(FIRE_OFFSET_SCALE).toBe(0.125);
    expect(LANE_GAP).toBe(4);
  });
});
