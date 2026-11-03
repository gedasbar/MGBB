import { describe, it, expect } from 'vitest';
import {
  CLASSIC_TIERS, DRIFT_VARIANT, GAP_PATTERN, isLateMilestone, LATE_FIRST, LATE_LAST, LATE_TYPE_ORDER, LATE_TYPES, lateSlot, lateTypeTiers, MAZE_MIN_PATH_WIDTH, MAZE_HP_MUL,
  MONOLITH_HP_MUL, LATE_CLEAR_MEDALS, LATE_HP_SEGMENTS, LATE_REWARD_GROWTH, LATE_ARMOR_FRAC,
} from '../src/data/lateTiers';
import { applyWallRun, classicClearedCount, defaultProgress, isUnlocked, nextTier, sanitizeProgress } from '../src/econ/progress';
import { generateLevel, MAX_TIER } from '../src/wall/generator';
import { blockHp, campaignBlockHp, campaignRewardPerBlock, lateBlockHp, rewardPerBlock } from '../src/wall/level';
import { CELL, WALL_COLS } from '../src/wall/constants';
import { simulateWall } from '../src/wall/sim';
import { WallWorld } from '../src/wall/wallWorld';
import { buildStarterGrid } from '../src/game/starter';
import { backgroundForTier, BACKGROUNDS } from '../src/ui/background';

const cols = WALL_COLS;
const tierOf = (type: string, rank = 1) => lateTypeTiers().find(t => lateSlot(t)!.type === type && lateSlot(t)!.rank === rank)!;
const typeTiers = (type: string) => lateTypeTiers().filter(t => lateSlot(t)!.type === type);

describe('unlock rule', () => {
  it('99 cleared and tier 100 passed keeps tier 101 locked; the 100th clear opens it', () => {
    const p = defaultProgress();
    p.passedTiers = Array.from({ length: 100 }, (_, i) => i + 1);
    p.clearedTiers = Array.from({ length: 99 }, (_, i) => i + 1);   // tier 100 passed but not cleared
    expect(classicClearedCount(p)).toBe(99);
    expect(isUnlocked(p, 100)).toBe(true);
    expect(isUnlocked(p, 101)).toBe(false);
    expect(nextTier(p)).toBe(100);                                  // the highlight stays on the last open tier
    p.clearedTiers.push(100);
    expect(isUnlocked(p, 101)).toBe(true);
    expect(isUnlocked(p, 102)).toBe(false);                         // strict order: 101 is not passed yet
    p.passedTiers.push(101);
    expect(isUnlocked(p, 102)).toBe(true);
    expect(nextTier(p)).toBe(102);
  });

  it('tiers 101+ need the cleared rule even when every earlier tier is only passed (a hand-edited save cannot skip it)', () => {
    const p = defaultProgress();
    p.passedTiers = Array.from({ length: 150 }, (_, i) => i + 1);
    p.clearedTiers = [1, 2, 3];
    expect(isUnlocked(p, 120)).toBe(false);
  });

  it('a clear of tiers above 100 does not count toward the first hundred', () => {
    const p = defaultProgress();
    p.clearedTiers = [...Array.from({ length: 98 }, (_, i) => i + 1), 101, 102];
    expect(classicClearedCount(p)).toBe(98);
  });
});

describe('save', () => {
  it('keeps tiers 101-200 and drops 0 and 201; an old save loads unchanged', () => {
    const d = defaultProgress();
    const p = sanitizeProgress({ ...d, clearedTiers: [5, 150, 200, 201, 0], passedTiers: [5, 150, 200, 201, 0] });
    expect(p.clearedTiers).toEqual([5, 150, 200]);
    expect(p.passedTiers).toEqual([5, 150, 200]);
    const old = sanitizeProgress({ ...d, version: 12, clearedTiers: [1, 2, 3], passedTiers: [1, 2, 3, 4] });
    expect(old.clearedTiers).toEqual([1, 2, 3]);
    expect(old.version).toBe(14);
  });
});

describe('schedule', () => {
  const tiers = lateTypeTiers();
  it('about 35-40 of the 100 tiers are type tiers, every gap is 2 or 3, none on a milestone, none beyond 200', () => {
    expect(tiers.length).toBeGreaterThanOrEqual(35);
    expect(tiers.length).toBeLessThanOrEqual(40);
    for (let i = 1; i < tiers.length; i++) expect([2, 3]).toContain(tiers[i] - tiers[i - 1]);
    for (const t of tiers) { expect(t).toBeGreaterThanOrEqual(LATE_FIRST); expect(t).toBeLessThanOrEqual(LATE_LAST); expect(isLateMilestone(t)).toBe(false); }
    expect(GAP_PATTERN.every(g => g === 2 || g === 3)).toBe(true);
  });
  it('no two type tiers in a row, one type per tier (no combinations), and the same type never twice in a row', () => {
    for (let i = 1; i < tiers.length; i++) {
      expect(tiers[i] - tiers[i - 1]).toBeGreaterThan(1);
      expect(lateSlot(tiers[i])!.type).not.toBe(lateSlot(tiers[i - 1])!.type);
    }
    for (let t = LATE_FIRST; t <= LATE_LAST; t++) { const l = generateLevel(t); expect(typeof l.lateType === 'string' || l.lateType === undefined).toBe(true); expect(!!l.lateType).toBe(!!lateSlot(t)); }
  });
  it('the nine types are introduced one by one in the first 30 tiers, then return harder', () => {
    const intro = tiers.slice(0, 9);
    expect(intro.map(t => lateSlot(t)!.type)).toEqual([...LATE_TYPE_ORDER]);
    expect(intro[8] - CLASSIC_TIERS).toBeLessThanOrEqual(30);
    expect(intro.every(t => lateSlot(t)!.rank === 1)).toBe(true);
    for (const type of LATE_TYPE_ORDER) {
      const ranks = typeTiers(type).map(t => lateSlot(t)!.rank);
      expect(ranks.length).toBeGreaterThanOrEqual(3);              // "several times"
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));     // each return has a higher rank
      expect(ranks[0]).toBe(1);
    }
  });
  it('every type is built since chunk 27b; the five effect types are ordinary walls plus an `effects` record', () => {
    for (const ty of LATE_TYPE_ORDER) expect(LATE_TYPES[ty].built).toBe(true);
    const l = generateLevel(tierOf('fog'));
    expect(l.lateType).toBe('fog');
    expect(l.effects?.fog).toBeDefined();
    expect(l.drift).toBeUndefined();
    expect(l.mazePath).toBeUndefined();
    expect(l.rows).toBeGreaterThanOrEqual(41);
  });
  it('every tier 101-200 builds, with blocks, and the same tier always gives the same wall', () => {
    for (let t = LATE_FIRST; t <= MAX_TIER; t++) {
      const l = generateLevel(t);
      expect(l.tier).toBe(t);
      expect(l.cells.some(c => c)).toBe(true);
      expect(l.campaign).toBe(true);
      expect(l.name, `tier ${t}`).toBeTruthy();
    }
    expect(JSON.stringify(generateLevel(150))).toBe(JSON.stringify(generateLevel(150)));
    expect(generateLevel(110).name).toBe('Second Gatehouse');
    expect(generateLevel(200).name).toBe('The Endless Wall');
  });
});

describe('curves', () => {
  it('block HP continues from tier 100 and starts at x1.10 a tier, clearly faster than tiers 31-100', () => {
    expect(campaignBlockHp(100)).toBe(blockHp(100));
    expect(lateBlockHp(101) / blockHp(100)).toBeGreaterThan(1.09);
    expect(lateBlockHp(101) / blockHp(100)).toBeLessThan(1.11);
    const classicMax = Math.max(...[[31, 40], [41, 60], [61, 100]].map(([a, b]) => Math.pow(blockHp(b) / blockHp(a - 1), 1 / (b - a + 1))));
    expect(Math.pow(lateBlockHp(130) / blockHp(100), 1 / 30)).toBeGreaterThan(classicMax + 0.03);
    for (let t = 102; t <= 200; t++) expect(campaignBlockHp(t)).toBeGreaterThan(campaignBlockHp(t - 1));
    expect(LATE_HP_SEGMENTS[0][1]).toBe(1.1);
  });
  it('rewards past 100 grow slower than 1.05 a tier (1.02), the first hundred are untouched', () => {
    expect(campaignRewardPerBlock(100)).toBe(rewardPerBlock(100));
    expect(campaignRewardPerBlock(101) / campaignRewardPerBlock(100)).toBeCloseTo(1.02, 10);
    expect(LATE_REWARD_GROWTH).toBe(1.02);
    expect(campaignRewardPerBlock(200) / campaignRewardPerBlock(100)).toBeCloseTo(Math.pow(1.02, 100), 6);
    expect(campaignRewardPerBlock(50)).toBe(rewardPerBlock(50));
    expect(rewardPerBlock(150)).toBe(0.4 * Math.pow(1.05, 149));   // the Frontier's effective tiers keep the old curve
  });
  it('the first full clear of a late tier pays 2 Medals, a classic tier 1, a replay none', () => {
    const p = defaultProgress();
    const run = (tier: number) => applyWallRun(p, { tier, destroyed: 10, total: 10, time: 30, credits: 5, kills: 10 });
    expect(run(100).medals).toBe(1);
    expect(run(101).medals).toBe(LATE_CLEAR_MEDALS);
    expect(LATE_CLEAR_MEDALS).toBe(2);
    expect(p.medals).toBe(3);
    expect(run(101).medals).toBe(0);
  });
  it('armor and shield shares grow from 40% at tier 100 toward 60% at tier 200 and the walls keep 41 rows', () => {
    const share = (t: number, key: 'armor' | 'shield') => { const b = generateLevel(t).cells.filter(c => c); return b.filter(c => c![key] > 0).length / b.length; };
    const ordinary = (from: number) => { let t = from; while (lateSlot(t) || isLateMilestone(t)) t--; return t; };
    const t1 = ordinary(105), t2 = ordinary(199);
    expect(share(t1, 'armor')).toBeGreaterThan(0.38);
    expect(share(t2, 'armor')).toBeGreaterThan(share(t1, 'armor'));
    expect(share(t2, 'shield')).toBeGreaterThan(0.55);
    expect(share(t2, 'armor')).toBeLessThan(0.65);
    expect(generateLevel(t2).rows).toBeGreaterThanOrEqual(41);
    expect(LATE_ARMOR_FRAC[1]).toBe(0.6);
  });
});

describe('Monolith', () => {
  it('is full-width rows of blocks with HP x MONOLITH_HP_MUL, no armor, and zero damage cannot pass it', () => {
    const t = tierOf('monolith');
    const l = generateLevel(t);
    expect(l.rows).toBe(1);
    expect(l.cells.length).toBe(cols);
    expect(l.cells.every(c => c && c.hp === Math.round(lateBlockHp(t) * MONOLITH_HP_MUL[0]) && c.armor === 0 && c.shield === 0)).toBe(true);
    const r = simulateWall(l, buildStarterGrid(), 'flyer', { maxTime: 120 });
    expect(r.state).toBe('crashed');
    expect(r.destroyed).toBe(0);
  });
  it('one broken block per row is enough to pass', () => {
    for (const t of [tierOf('monolith', 1), tierOf('monolith', 3)]) {
      const l = generateLevel(t);
      const w = new WallWorld(l, { grid: buildStarterGrid() });
      w.autoFire = false;
      for (let r = 0; r < l.rows; r++) w.destroyBlock(w.blocks[r * cols + 10]!);   // the same column in every row: a straight lane
      expect(w.destroyed).toBe(l.rows);
      const out = simulateWall(l, buildStarterGrid(), 'flyer', { maxTime: 120, prep: (world: WallWorld) => { for (let r = 0; r < l.rows; r++) world.destroyBlock(world.blocks[r * cols + 10]!); } });
      expect(out.state).toBe('passed');
    }
  });
  it('rank 3 has two rows, rank 5 three', () => {
    expect(generateLevel(tierOf('monolith', 3)).rows).toBe(2);
    expect(generateLevel(tierOf('monolith', 5)).rows).toBe(3);
  });
});

describe('Maze', () => {
  it('a bot with ZERO damage passes every maze tier', () => {
    for (const t of typeTiers('maze')) {
      const l = generateLevel(t);
      const r = simulateWall(l, buildStarterGrid(), 'flyer', { maxTime: 240 });
      expect(r.state, `maze tier ${t}`).toBe('passed');
      expect(r.destroyed).toBe(0);
    }
  });
  it('the path is at least 2 cells wide in every row, neighbouring rows share all but one open column, every other block has x1000 HP', () => {
    for (const t of typeTiers('maze')) {
      const l = generateLevel(t);
      const open = (row: number) => new Set(Array.from({ length: cols }, (_, c) => c).filter(c => !l.cells[row * cols + c]));
      for (let row = 0; row < l.rows; row++) {
        expect(open(row).size, `tier ${t} row ${row}`).toBeGreaterThanOrEqual(MAZE_MIN_PATH_WIDTH);
        if (row > 0) {
          const a = open(row), b = open(row - 1);
          expect([...a].filter(c => b.has(c)).length, `tier ${t} rows ${row - 1}/${row}`).toBeGreaterThanOrEqual(open(row).size - 1);
        }
      }
      const hp = Math.round(lateBlockHp(t) * MAZE_HP_MUL);
      expect(l.cells.filter(c => c).every(c => c!.hp === hp)).toBe(true);
    }
  });
  it('the path winds sideways: it moves over many columns and round the seam', () => {
    const l = generateLevel(tierOf('maze', 1));
    const starts = new Set(l.mazePath);
    expect(starts.size).toBeGreaterThanOrEqual(6);
  });
});

describe('Fortress', () => {
  it('every block is armored and shielded, heavier than the classic shares (armor 20+, shield above 1 x HP)', () => {
    for (const t of typeTiers('fortress')) {
      const l = generateLevel(t);
      const blocks = l.cells.filter(c => c);
      expect(blocks.length).toBeGreaterThan(500);
      expect(blocks.every(c => c!.armor >= 20 && c!.shield > c!.hp)).toBe(true);
    }
    const rank1 = generateLevel(tierOf('fortress', 1)).cells.find(c => c)!;
    const rank4 = generateLevel(tierOf('fortress', 4)).cells.find(c => c)!;
    expect(rank4.armor).toBeGreaterThan(rank1.armor);
    expect(rank4.shield / rank4.hp).toBeGreaterThan(rank1.shield / rank1.hp);
  });
});

describe('Drift', () => {
  it('rank 1 slides every row the same way and speed, rank 2 alternates, rank 3 gives every row its own', () => {
    const same = generateLevel(tierOf('drift', 1)).drift!;
    expect(same.variant).toBe('same');
    expect(new Set(same.speeds).size).toBe(1);
    const alt = generateLevel(tierOf('drift', 2)).drift!;
    expect(alt.variant).toBe('alternate');
    alt.speeds.forEach((s, r) => { if (r > 0) expect(Math.sign(s)).toBe(-Math.sign(alt.speeds[r - 1])); });
    expect(new Set(alt.speeds.map(Math.abs)).size).toBe(1);
    const each = generateLevel(tierOf('drift', 3)).drift!;
    expect(each.variant).toBe('each');
    expect(new Set(each.speeds).size).toBeGreaterThan(10);
    expect(each.speeds.some(s => s > 0) && each.speeds.some(s => s < 0)).toBe(true);
    expect(DRIFT_VARIANT.slice(0, 3)).toEqual(['same', 'alternate', 'each']);
  });
  it('rows slide: block positions move, wrap round the cylinder, and a row that left a place no longer blocks it', () => {
    const l = generateLevel(tierOf('drift', 3));
    const w = new WallWorld(l, { grid: buildStarterGrid() });
    w.autoFire = false;
    w.setWallOffset(l.rows * CELL);                                   // the whole wall on screen
    const row = 20;
    const b = w.blocks.slice(row * cols, row * cols + cols).find(x => x)!;
    const x0 = b.x;
    w.advanceDrift(1);
    const speed = l.drift!.speeds[row];
    const expected = (((x0 + speed) % w.worldW) + w.worldW) % w.worldW;
    expect(b.x).toBeCloseTo(expected, 6);
    w.advanceDrift(100);                                              // many seconds: well past the seam
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThan(w.worldW);
    // The block is found where it is now, and not where it was.
    const y = b.y;
    expect(w.blockAt(b.x, y)).toBe(b);
    expect(w.field.hitCircle(b.x, y, 3, -1)).toBe(b);
  });
  it('the ship crashes into a block at its moving position, and not at the place it left', () => {
    // A one-row wall of a single block, sliding right at 50 px/s: after 1 s the block has moved 50 px.
    const cells = Array.from({ length: cols }, (_, c) => (c === 5 ? { hp: 1e9, armor: 0, shield: 0 } : null));
    const level = { tier: 150, cols, rows: 1, wrap: true, cells, approachSpeed: 0, campaign: true, drift: { variant: 'same' as const, speeds: [50] } };
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    w.autoFire = false;
    w.setWallOffset(CELL + 400);                                      // the row is on screen, 400 px from the top
    const rowY = w.blockTop(0) + CELL / 2;
    const homeX = 5 * CELL + CELL / 2;
    w.advanceDrift(1);
    const movedX = homeX + 50;
    w.teleportShip(homeX - CELL / 2 - 1, rowY);                       // the old left edge: the block has left it, 49 px of gap open on the left
    expect(w.shipHitsBlock()).toBe(false);
    w.teleportShip(movedX, rowY);
    expect(w.shipHitsBlock()).toBe(true);
    // Swept: a ship that flies through the block's NEW place within one step is caught.
    w.teleportShip(movedX + 120, rowY);
    expect(w.shipSweptHitsBlock(movedX - 120, rowY - w.wallOffsetY)).toBe(true);
    w.teleportShip(movedX + 120, rowY);
    expect(w.shipSweptHitsBlock(homeX - 150, rowY - w.wallOffsetY)).toBe(true);   // through the moved block as well
  });
  it('shots hit the block where it is now', () => {
    const cells = Array.from({ length: cols }, (_, c) => (c === 5 ? { hp: 1e9, armor: 0, shield: 0 } : null));
    const level = { tier: 150, cols, rows: 1, wrap: true, cells, approachSpeed: 0, campaign: true, drift: { variant: 'same' as const, speeds: [50] } };
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    w.setWallOffset(CELL * 20);
    const y = w.blockTop(0) + CELL / 2;
    const home = 5 * CELL + CELL / 2;
    expect(w.field.hitCircle(home, y, 2, -1)).not.toBeNull();
    w.advanceDrift(2);                                                // 100 px to the right: the home cell is empty now
    expect(w.field.hitCircle(home, y, 2, -1)).toBeNull();
    expect(w.field.hitCircle(home + 100, y, 2, -1)).not.toBeNull();
  });
});

describe('late look', () => {
  it('tiers 101-150 and 151-200 have their own backgrounds, different from the first hundred', () => {
    expect(backgroundForTier(101, false)).toBe('galaxy_teal');
    expect(backgroundForTier(150, false)).toBe('galaxy_teal');
    expect(backgroundForTier(151, false)).toBe('cave_ash');
    expect(backgroundForTier(200, false)).toBe('cave_ash');
    for (let t = 1; t <= 100; t++) expect(['galaxy_teal', 'cave_ash']).not.toContain(backgroundForTier(t, false));
    expect(BACKGROUNDS.galaxy_teal).toBeDefined();
    expect(BACKGROUNDS.cave_ash).toBeDefined();
  });
});
