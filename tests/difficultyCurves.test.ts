// Chunk 18b: the Frontier's HP past ring 250, the Frontier-only lane rule, and the hull trait lines.
import { describe, expect, it } from 'vitest';
import { FRONTIER_CURVE_RING, FRONTIER_LATE_GROWTH, FRONTIER_SEED, MAP_BASE_TIER, MAP_MIN_COLUMN_SHARE } from '../src/frontier/constants';
import { frontierLevel, ringBlockHp, squareKind, squareLevel } from '../src/frontier/level';
import { blockHpFloat } from '../src/wall/level';
import { blocksForRows, buildWall, WallSpec } from '../src/wall/generator';
import { WALL_COLS } from '../src/wall/constants';
import { HULL_ORDER, hullTrait, SINGLE_LANE_TRAIT, WIDE_COVERAGE_TRAIT } from '../src/data/hulls';
import { hullStatLine, hullTraitLine } from '../src/builder/hullPickerLogic';

describe('Frontier block HP (18b)', () => {
  it('follows the campaign curve at the effective tier to ring 250 and joins tier 100 there', () => {
    expect(ringBlockHp(0)).toBeCloseTo(blockHpFloat(MAP_BASE_TIER), 9);
    expect(ringBlockHp(100)).toBeCloseTo(blockHpFloat(MAP_BASE_TIER + 30), 9);
    expect(ringBlockHp(FRONTIER_CURVE_RING)).toBeCloseTo(blockHpFloat(100), 6);
  });
  it('grows by FRONTIER_LATE_GROWTH a ring after that and never falls', () => {
    expect(ringBlockHp(300) / ringBlockHp(250)).toBeCloseTo(Math.pow(FRONTIER_LATE_GROWTH, 50), 9);
    expect(ringBlockHp(1000)).toBeGreaterThan(ringBlockHp(500) * 100);
    let last = 0;
    for (let r = 0; r <= 1200; r += 10) { expect(ringBlockHp(r)).toBeGreaterThanOrEqual(last); last = ringBlockHp(r); }
  });
  it('squares read it', () => {
    const sq = (r: number) => { for (let k = 0; k < 40; k++) { const p = squareLevel(r, k, FRONTIER_SEED); if (p.kind === 'wall' && !p.spike) return p; } throw new Error('no square'); };
    for (const r of [60, 300, 600]) {
      const hp = sq(r).hp / ringBlockHp(r);
      expect(hp).toBeGreaterThan(0.85);
      expect(hp).toBeLessThan(1.15); // MAP_HP_NOISE 10% plus rounding
    }
  });
});

describe('the Frontier-only lane rule (18b)', () => {
  const colCounts = (cells: unknown[], cols: number) => Array.from({ length: cols }, (_, c) => cells.filter((x, i) => x && i % cols === c).length);
  const spec = (template: number, over: Partial<WallSpec> = {}): WallSpec => ({
    tier: 40, seed: 777 + template, template, rows: 24, target: blocksForRows(24), hp: 100, armorFrac: 0, shieldFrac: 0, approachSpeed: 26, spike: false, ...over,
  });
  it('a Frontier spec raises the cheapest column; the default (campaign) rule is untouched', () => {
    let strictlyBetter = 0;
    for (let tpl = 0; tpl < 8; tpl++) {
      const campaign = colCounts(buildWall(spec(tpl)).cells, WALL_COLS);
      const same = colCounts(buildWall(spec(tpl, { minColumnShare: 0.3 })).cells, WALL_COLS);
      const frontier = colCounts(buildWall(spec(tpl, { minColumnShare: MAP_MIN_COLUMN_SHARE })).cells, WALL_COLS);
      expect(same).toEqual(campaign);
      expect(Math.min(...frontier)).toBeGreaterThanOrEqual(Math.min(...campaign));
      if (Math.min(...frontier) > Math.min(...campaign)) strictlyBetter++;
    }
    expect(strictlyBetter).toBeGreaterThan(0);
  });
  it('real Frontier walls have a lane at least as dear as the median allows', () => {
    let seen = 0;
    for (let x = 30; x < 80 && seen < 6; x++) {
      if (squareKind(x, 3, FRONTIER_SEED) !== 'wall') continue;
      const l = frontierLevel(squareLevel(x, 3, FRONTIER_SEED));
      const c = colCounts(l.cells, l.cols).sort((a, b) => a - b);
      expect(c[0]).toBeGreaterThanOrEqual(Math.floor(c[Math.floor(c.length / 2)] * 0.7));
      seen++;
    }
    expect(seen).toBeGreaterThan(3);
  });
});

describe('hull trait lines (18b)', () => {
  it('one ejector: single lane; three or more: wide coverage; two: none', () => {
    expect(hullTrait(1)).toBe(SINGLE_LANE_TRAIT);
    expect(hullTrait(2)).toBeNull();
    expect(hullTrait(3)).toBe(WIDE_COVERAGE_TRAIT);
    expect(hullTrait(10)).toBe(WIDE_COVERAGE_TRAIT);
  });
  it('every hull gets the line its layout earns', () => {
    for (const id of HULL_ORDER) {
      const s = hullStatLine(id);
      expect(hullTraitLine(s)).toBe(s.ejectors <= 1 ? SINGLE_LANE_TRAIT : s.ejectors >= 3 ? WIDE_COVERAGE_TRAIT : null);
    }
    expect(hullTraitLine(hullStatLine('mantis'))).toBe(SINGLE_LANE_TRAIT);
    expect(hullTraitLine(hullStatLine('halberd'))).toBe(WIDE_COVERAGE_TRAIT);
    expect(hullTraitLine(hullStatLine('hornet'))).toBeNull();
  });
});
