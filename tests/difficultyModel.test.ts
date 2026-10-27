// Chunk 18a: the difficulty audit's model (scripts/lib/difficultyModel.ts, difficultyProposal.ts). These test the arithmetic the
// audit's tables stand on; the tables themselves are measurements (npm run difficulty-audit).
import { describe, expect, it } from 'vitest';
import { bestOwned, budgetAt, coverageOf, ejectorsOf, scoreOf, buildCatalogue, campaignNeeds, flyNeeds, gridCost, heroLevelFor, incomeAt, medalsAt, ratioText, wallNeeds } from '../scripts/lib/difficultyModel';
import { currentFlyHp, currentRingHp, proposedBlockHp, proposedFlyHp, proposedRingHp, referenceDps, PROPOSED } from '../scripts/lib/difficultyProposal';
import { standardBuild } from '../src/debug/hullBuilds';
import { buildDartStarterGrid } from '../src/game/starter';
import { copyPrice } from '../src/econ/economy';
import { HULLS } from '../src/data/hulls';
import { blockHp, LevelDef } from '../src/wall/level';
import { BOOST_MAX, CELL, PASS_MARGIN_CELLS, VIEW_H } from '../src/wall/constants';

const wall = (cells: ({ hp: number; armor: number; shield: number } | null)[], cols: number): LevelDef =>
  ({ tier: 1, cols, rows: cells.length / cols, cells, approachSpeed: 26 });

describe('wallNeeds', () => {
  // 2 columns x 2 rows. Column 0: HP 4 + HP 4 armored (armor 10 doubles it) = 4 + 8; column 1: HP 10 with a 6 shield + a gap.
  const l = wall([{ hp: 4, armor: 0, shield: 0 }, { hp: 10, armor: 0, shield: 6 }, { hp: 4, armor: 10, shield: 0 }, null], 2);
  const n = wallNeeds(l);
  it('pass is the cheapest column over the crossing time at max boost', () => {
    const cross = (2 * CELL + PASS_MARGIN_CELLS * CELL + 24) / (26 * BOOST_MAX);
    expect(n.pass).toBeCloseTo(12 / cross, 6); // column 1 costs 16, column 0 costs 12
  });
  it('clear is every block over the time until the wall reaches the ship', () => {
    expect(n.clear).toBeCloseTo(28 / ((VIEW_H - 24 - 7) / 26), 6);
  });
  it('the toughest block counts shield and armor', () => {
    expect(n.toughest).toBe(16);
    expect(n.blocks).toBe(3);
  });
  it('the median lane is never cheaper than the cheapest', () => {
    for (const t of [1, 10, 40, 100]) expect(campaignNeeds(t).passMedian).toBeGreaterThanOrEqual(campaignNeeds(t).pass);
  });
});

describe('credits, Medals and hero levels', () => {
  it('nothing is banked on arriving at tier 1 and the first tier pays 3 runs x half its full clear', () => {
    expect(budgetAt(1)).toBe(0);
    expect(budgetAt(2)).toBeCloseTo(incomeAt(1), 9);
    expect(incomeAt(1)).toBeCloseTo(1.5 * campaignNeeds(1).credits, 9);
  });
  it('credits and Medals only grow along the career', () => {
    let prevB = -1, prevM = -1;
    for (const e of [1, 5, 10, 25, 50, 100, 145]) { expect(budgetAt(e)).toBeGreaterThan(prevB); expect(medalsAt(e)).toBeGreaterThanOrEqual(prevM); prevB = budgetAt(e); prevM = medalsAt(e); }
  });
  it('hero levels cost 1, 1, 1, 2, 2, 2, 3 ... Medals (round(1.2^n), at least 1)', () => {
    expect(heroLevelFor(0)).toBe(0);
    expect(heroLevelFor(1)).toBe(1);
    expect(heroLevelFor(3)).toBe(3);
    expect(heroLevelFor(5)).toBe(4); // 1+1+1+2 = 5; the next level costs 2
  });
});

describe('what a buyer owns', () => {
  it('prices a circuit with the real hull and copy prices', () => {
    expect(gridCost('dart', buildDartStarterGrid())).toBe(0);
    const twin = standardBuild('twin', 2, 1)!;
    // one Flat+ (the new-game inventory owns the first one) and one Percent x
    expect(gridCost('twin', twin)).toBe(HULLS.twin.price + copyPrice('percent_mult', 0));
    const four = standardBuild('twin', 2, 3)!; // levels cost upgrades: Percent x 1 -> 2 -> 3
    expect(gridCost('twin', four)).toBeGreaterThan(gridCost('twin', twin));
  });
  it('never offers a build the budget cannot pay, and more money never buys less', () => {
    let last = 0;
    for (const budget of [0, 200, 1000, 5000, 50000, 1e6, 1e8]) {
      const o = bestOwned(budget);
      expect(o).not.toBeNull();
      expect(o!.cost).toBeLessThanOrEqual(budget);
      expect(scoreOf(o!)).toBeGreaterThanOrEqual(last);
      last = scoreOf(o!);
    }
  });
  it('the builder family is at least as strong as the casual family, and strictly stronger with money', () => {
    expect(scoreOf(bestOwned(2e5)!)).toBeGreaterThanOrEqual(scoreOf(bestOwned(2e5, 0, 'std')!));
    expect(scoreOf(bestOwned(2e5)!)).toBeGreaterThan(2 * scoreOf(bestOwned(2e5, 0, 'std')!));
    expect(buildCatalogue().some(e => e.fam === 'mult')).toBe(true);
  });
});

describe('coverage weight (18b)', () => {
  it('counts ejectors and weighs one-ejector hulls down', () => {
    expect(ejectorsOf('shuttle')).toBe(1);
    expect(ejectorsOf('halberd')).toBe(3);
    expect(coverageOf('shuttle')).toBeLessThan(coverageOf('corvette'));
    expect(coverageOf('corvette')).toBeLessThan(coverageOf('halberd'));
    expect(coverageOf('halberd')).toBe(1);
  });
  it('the builder no longer picks a one-ejector hull at tier 75 money', () => {
    expect(ejectorsOf(bestOwned(220_000)!.hull)).toBeGreaterThan(1);
  });
});

describe('Free Fly needs', () => {
  it('grow with the wave', () => {
    let last = 0;
    for (const w of [1, 5, 10, 20, 30]) { const k = flyNeeds(w).keepUp; expect(k).toBeGreaterThan(last); last = k; }
  });
});

describe('ratio marks', () => {
  it('flags trivial above 5x and impossible below 0.5x', () => {
    expect(ratioText(5.01)).toContain('T');
    expect(ratioText(4.9)).not.toContain('T');
    expect(ratioText(0.49)).toContain('X');
    expect(ratioText(0.5)).not.toContain('X');
  });
});

describe('proposed curves (not wired into the game)', () => {
  it('leave the first 30 tiers exactly as they are (small numbers early)', () => {
    for (let t = 1; t <= 30; t++) expect(proposedBlockHp(t)).toBe(blockHp(t));
  });
  it('keep growing to tier 100 and are whole numbers', () => {
    let last = 0;
    for (let t = 30; t <= 100; t++) { const hp = proposedBlockHp(t); expect(hp).toBeGreaterThanOrEqual(last); expect(Number.isInteger(hp)).toBe(true); last = hp; }
    expect(proposedBlockHp(100)).toBeGreaterThan(blockHp(100) * 10);
  });
  it('the Frontier curve joins the campaign curve at the end of the campaign, and Free Fly is unchanged up to the first changed wave', () => {
    expect(proposedRingHp(PROPOSED.frontierPastRing)).toBeCloseTo(proposedBlockHp(100), 0);
    expect(proposedRingHp(0)).toBeCloseTo(proposedBlockHp(25), 0);
    expect(currentRingHp(0)).toBe(blockHp(25));
    for (let w = 1; w <= PROPOSED.flyFromWave; w++) expect(proposedFlyHp(w)).toBe(currentFlyHp(w));
    expect(proposedFlyHp(40)).toBeLessThan(currentFlyHp(40));
  });
  it('the reference DPS is the casual build early, the builder build at the end', () => {
    expect(referenceDps(10, 1000, 10)).toBeCloseTo(10, 6);
    expect(referenceDps(10, 1000, 100)).toBeCloseTo(1000, 6);
    const mid = referenceDps(10, 1000, 70);
    expect(mid).toBeGreaterThan(10);
    expect(mid).toBeLessThan(1000);
  });
});
