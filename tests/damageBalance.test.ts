// Chunk 14a: invariants of the small-number damage balance (docs/balance-damage.md).
import { describe, it, expect } from 'vitest';
import AUDITED from '../reports/balance-damage-circuits.json';
import { benchAll } from '../scripts/lib/dmgBench';
import { compile, Grid } from '../src/engine/compiler';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { HULL_ORDER } from '../src/data/hulls';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { buildStarterGrid, place } from '../src/game/starter';
import { World } from '../src/game/world';
import { flatPlusAdd, orbitTime, STACK_DECAY } from '../src/engine/effects';
import { PROJECTILE_MAX_AGE } from '../src/wall/constants';
import { HERO_LEVEL_BASE_DAMAGE, HERO_MAX_LEVEL } from '../src/captains/data';
import { blockHp } from '../src/wall/level';
import { generateLevel } from '../src/wall/generator';
import { rockHp } from '../src/econ/economy';

const DT = 1 / 60;
/** A hull with nothing placed, except the Shuttle's two starter turns (its ejector is off the generator's column). */
function bare(hull: string): Grid {
  if (hull !== 'shuttle') return HULL_BUILDERS[hull]();
  const g = buildStarterGrid();
  for (const c of g.cells) if (c.blockId === 'flat_plus') c.blockId = null;
  return g;
}
const fromCells = (hull: string, cells: [number, string, number][]) => {
  const g = HULL_BUILDERS[hull]();
  for (const [i, id, l] of cells) Object.assign(g.cells[i], { blockId: id, level: l, rotation: 0, manual: false });
  return g;
};
const est = (g: Grid) => compile(g).stats.estDps;
const median = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2; };

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
  it('a hero at the max level multiplies the bare shot by at most 6', () => {
    expect(1 + HERO_MAX_LEVEL * HERO_LEVEL_BASE_DAMAGE).toBeLessThanOrEqual(6);
  });
});

describe('no circuit beats 2.5x its hull median (diminishing returns on stacking)', () => {
  // The real rule (docs/balance-damage.md, step 3), on the engine: the circuits npm run balance-damage audited (per hull and
  // level, the top 5 with at most 2 copies of a block and the top 5 with up to 8) are benched again with the current data, and
  // the best 8-copy circuit may not beat 2.5x the median of the 2-copy ones. The Dart is left out: with one free cell a
  // "circuit" is a single block, and Flat+ L5 beats blocks that add no damage of their own by 2.6x (DECISIONS 195).
  it('the audited circuits of npm run balance-damage: the best 8-copy circuit stays within 2.5x the 2-copy median (engine bench)', () => {
    const data = AUDITED as unknown as { hull: string; level: number; ref: [number, string, number][][]; free: [number, string, number][][] }[];
    expect(data.length).toBe(HULL_ORDER.length * 2);
    for (const r of data) {
      if (r.hull === 'dart') continue;
      const ref = r.ref.map(c => benchAll(fromCells(r.hull, c)).mixed);
      const free = benchAll(fromCells(r.hull, r.free[0])).mixed;
      expect(free, `${r.hull} L${r.level}`).toBeLessThanOrEqual(2.5 * median(ref));
    }
  }, 120_000);
  // Bounded, not flat: the product of x3.5, x2.25, x1.63, ... converges to about x22 however many are stacked (it was 3.5^n).
  it('a line full of Percent x L5 (eight copies) is under 3x two copies; each further copy adds half the bonus of the one before', () => {
    const fan = (n: number) => {
      const g = HULL_BUILDERS.fan();
      for (let k = 0; k < n; k++) place(g, 5, 9 - k, 'percent_mult', 5);
      return g;
    };
    expect(STACK_DECAY).toBe(0.5);
    expect(compile(fan(1)).recipes[0].packet.damage).toBeCloseTo(3.5, 9);
    expect(compile(fan(2)).recipes[0].packet.damage).toBeCloseTo(3.5 * 2.25, 9);
    expect(est(fan(8)) / est(fan(2))).toBeLessThan(3);
    expect(est(fan(8)) / est(fan(0))).toBeLessThan(25);
  });
  it('repeated chance gates diminish too (Gambler\'s Gate x3 at 50%, then x2.5: its average bonus halves)', () => {
    const g = HULL_BUILDERS.twin();
    place(g, 1, 2, 'gamblers_gate'); place(g, 1, 3, 'gamblers_gate');
    expect(compile(g).recipes[0].packet.gates.map(x => x.mult)).toEqual([3, 2.5]);
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
