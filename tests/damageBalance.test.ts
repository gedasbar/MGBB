// Chunk 14a: invariants of the small-number damage balance (docs/balance-damage.md).
import { describe, it, expect } from 'vitest';
import { compile, Grid } from '../src/engine/compiler';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { HULL_ORDER } from '../src/data/hulls';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { buildPathGrid, buildStarterGrid, place } from '../src/game/starter';
import { World } from '../src/game/world';
import { flatPlusAdd, orbitTime } from '../src/engine/effects';
import { PROJECTILE_MAX_AGE } from '../src/wall/constants';
import { HERO_LEVEL_BASE_DAMAGE } from '../src/captains/data';
import { blockHp } from '../src/wall/level';
import { generateLevel } from '../src/wall/generator';
import { rockHp } from '../src/econ/economy';

const DT = 1 / 60;
/** A hull with nothing placed, except the Shuttle's two starter turns (its ejector is off the generator's column). */
function bare(hull: string): Grid {
  if (hull !== 'shuttle') return compile(HULL_BUILDERS[hull]()).recipes.length ? HULL_BUILDERS[hull]() : buildPathGrid(hull)!;
  const g = buildStarterGrid();
  for (const c of g.cells) if (c.blockId === 'flat_plus') c.blockId = null;
  return g;
}
const est = (g: Grid) => compile(g).stats.estDps;

describe('small numbers: the basic shot and Flat+', () => {
  it.each(HULL_ORDER.map(h => [h]))('%s: every shot of the bare hull deals exactly 1', (hull) => {
    const c = compile(bare(hull));
    expect(c.recipes.length).toBeGreaterThan(0);
    for (const r of c.recipes) expect(r.packet.damage).toBe(1);
    // and the projectile the world actually fires
    const w = new World({ grid: bare(hull), autoSpawn: false });
    w.fire();
    const shots: number[] = [];
    for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) shots.push(w.pool.damage[i]);
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every(d => d === 1)).toBe(true);
  });
  it('Flat+ L1 adds exactly +1 (and +1 a level)', () => {
    expect(flatPlusAdd(1)).toBe(1);
    const g = HULL_BUILDERS.twin();
    place(g, 1, 2, 'flat_plus');
    expect(compile(g).recipes[0].packet.damage).toBe(2);
    place(g, 1, 3, 'flat_plus');
    expect(compile(g).recipes[0].packet.damage).toBe(3);
    place(g, 1, 3, 'flat_plus', 5);
    expect(compile(g).recipes[0].packet.damage).toBe(1 + 1 + 5);
  });
  it('HP the player meets are small whole numbers: wall block 1-3 at tier 1, a tier-1 rock 5', () => {
    expect(blockHp(1)).toBeGreaterThanOrEqual(1);
    expect(blockHp(1)).toBeLessThanOrEqual(3);
    for (const t of [1, 6, 11, 21, 50, 100]) for (const c of generateLevel(t).cells) if (c) {
      expect(Number.isInteger(c.hp)).toBe(true);
      expect(Number.isInteger(c.shield)).toBe(true);
    }
    expect(rockHp(1)).toBe(5);
  });
  it('a level-10 hero multiplies the bare shot by 6 (levels are uncapped since 16c-2, the +0.5 a level is unchanged)', () => {
    expect(1 + 10 * HERO_LEVEL_BASE_DAMAGE).toBe(6);
  });
});

describe('level curves', () => {
  it('every visible block: L5 (or max) is at most 4x L1 on the Twin + Flat+ reference (compile estimate)', () => {
    for (const b of pickerBlocks()) {
      if (b.maxLevel < 2) continue;
      const mk = (l: number) => { const g = HULL_BUILDERS.twin(); place(g, 1, 3, 'flat_plus'); place(g, 1, 2, b.id, l); return g; };
      const e1 = est(mk(1));
      if (e1 === 0) continue; // routing blocks lose the line on a straight Twin
      expect(est(mk(Math.min(5, b.maxLevel))) / e1, b.id).toBeLessThanOrEqual(4);
    }
  });
  it('Orbit launches before the projectile expires at every level', () => {
    expect(orbitTime(BLOCKS.orbit.maxLevel)).toBeLessThan(PROJECTILE_MAX_AGE);
  });
  it('a Piercing L5 shot hits a body it passes through once, not once per frame', () => {
    const g = HULL_BUILDERS.twin();
    place(g, 1, 2, 'piercing', 5);
    const w = new World({ grid: g, autoSpawn: false });
    w.hull = 1e9;
    w.fire();
    let k = -1;
    for (let i = 0; i < w.pool.max; i++) if (w.pool.active[i]) { k = i; break; }
    const e = w.spawnSpecies('darter', w.pool.x[k], w.pool.y[k] - 50, { hp: 1000, radius: 40 })!;
    let hits = 0;
    const idle = { x: w.shipX, y: w.shipY, active: false, type: 'mouse' as const, seen: true };
    // 14 frames: the shot (600 px/s) crosses the body; the gun's next shot (0.25 s later) has not arrived yet.
    for (let f = 0; f < 14; f++) { w.update(DT, idle); hits += w.hits.filter(h => h.enemyId === e.id && h.kind === 0).length; w.hits.length = 0; }
    expect(hits).toBe(1);
    expect(1000 - e.hp).toBeCloseTo(1, 6);
  });
});
