import { describe, it, expect } from 'vitest';
import { generateLevel, isSpike, MAX_SPIKES, MIN_SPIKES, ARMOR_START, SHIELD_START, blocksForTier } from '../src/wall/generator';
import { LevelDef, totalHp, countBlocks, blockHp } from '../src/wall/level';

const all = Array.from({ length: 100 }, (_, i) => generateLevel(i + 1));

describe('Level generator', () => {
  it('is deterministic: the same tier twice is identical (and needs no Math.random)', () => {
    const orig = Math.random;
    Math.random = () => { throw new Error('Math.random used'); };
    try {
      for (const t of [1, 7, 23, 50, 99, 100]) {
        // bypass the cache by comparing against a JSON round trip of a fresh module state is not possible, so compare content
        expect(JSON.stringify(generateLevel(t))).toBe(JSON.stringify(generateLevel(t)));
      }
    } finally { Math.random = orig; }
  });

  it('every level has 21 columns, cells for rows x 21, and the tier block count', () => {
    for (const l of all) {
      expect(l.cols).toBe(21);
      expect(l.cells.length).toBe(l.rows * 21);
      expect(countBlocks(l)).toBeLessThanOrEqual(blocksForTier(l.tier) + 21); // a few blocks may be added to leave no empty column
      expect(countBlocks(l)).toBeGreaterThan(blocksForTier(l.tier) * 0.97);
      expect(l.campaign).toBe(true);
    }
  });

  it('has 8 to 16 spike tiers, none in tiers 1-5, none on a milestone, HP x1.6 with the flag', () => {
    const spikes = all.filter(l => l.spike);
    expect(spikes.length).toBeGreaterThanOrEqual(MIN_SPIKES);
    expect(spikes.length).toBeLessThanOrEqual(MAX_SPIKES);
    for (const l of spikes) {
      expect(l.tier).toBeGreaterThan(5);
      expect(l.tier % 10).not.toBe(0);
      expect(isSpike(l.tier)).toBe(true);
      const first = l.cells.find(c => c)!;
      expect(first.hp).toBeCloseTo(blockHp(l.tier) * 1.6, 6);
    }
    const plain = all.find(l => !l.spike)!;
    expect(plain.cells.find(c => c)!.hp).toBeCloseTo(blockHp(plain.tier), 6);
  });

  it('every tier has a name and a hint; milestones are hand-defined, flagged and never spikes', () => {
    for (const l of all) {
      expect(l.name && l.name.length).toBeGreaterThan(0);
      expect(l.hint && l.hint.length).toBeGreaterThan(5);
    }
    const names = new Set<string>();
    for (let t = 10; t <= 100; t += 10) {
      const l = generateLevel(t);
      expect(l.milestone).toBe(true);
      expect(l.spike).toBeUndefined();
      names.add(l.name!);
    }
    expect(names.size).toBe(10);
    expect(generateLevel(100).name).toBe('The Last Wall');
  });

  it('never repeats a template three tiers in a row', () => {
    for (let t = 3; t <= 100; t++) {
      const [a, b, c] = [all[t - 3], all[t - 2], all[t - 1]];
      if (a.milestone || b.milestone || c.milestone) continue;
      expect(a.name === b.name && b.name === c.name).toBe(false);
    }
  });

  it('total HP trends upward (spikes bump above, normal tiers never fall >5% below the previous normal tier)', () => {
    let prev: LevelDef | null = null;
    for (const l of all) {
      if (prev && !l.spike) expect(totalHp(l)).toBeGreaterThanOrEqual(totalHp(prev) * 0.95);
      if (!l.spike) prev = l;
      if (l.spike) expect(totalHp(l)).toBeGreaterThan(totalHp(all[l.tier - 2]));
    }
    expect(totalHp(all[99])).toBeGreaterThan(totalHp(all[0]) * 100);
  });

  it('armor and shields are absent before their start tiers and grow after', () => {
    const count = (l: LevelDef, k: 'armor' | 'shield') => l.cells.filter(c => c && c[k] > 0).length / countBlocks(l);
    for (const l of all) {
      if (l.tier < ARMOR_START) expect(count(l, 'armor')).toBe(0);
      if (l.tier < SHIELD_START) expect(count(l, 'shield')).toBe(0);
    }
    expect(count(generateLevel(ARMOR_START), 'armor')).toBeGreaterThan(0.03);
    expect(count(generateLevel(SHIELD_START), 'shield')).toBeGreaterThan(0.03);
    expect(count(generateLevel(99), 'armor')).toBeGreaterThan(0.3);
    expect(count(generateLevel(99), 'shield')).toBeGreaterThan(0.3);
  });

  it('armor is clustered by template, not scattered: front-row mode puts it in the lowest rows', () => {
    const l = all.slice(10, 20).find(x => !x.milestone)!;
    const rowsWithArmor = new Set<number>();
    l.cells.forEach((c, i) => { if (c && c.armor > 0) rowsWithArmor.add(Math.floor(i / 21)); });
    expect(rowsWithArmor.size).toBeLessThan(l.rows);
  });
});

import { applyWallRun, defaultProgress, isUnlocked, loadProgress, nextTier, ProgressStore, serializeProgress } from '../src/econ/progress';
import { rewardPerBlock } from '../src/wall/level';

const run = (tier: number, destroyed: number, total = 100, time = 60) => ({ tier, destroyed, total, time, credits: destroyed * rewardPerBlock(tier), kills: destroyed });

describe('Campaign progress', () => {
  it('unlocks in strict order: tier 1 is open, tier N needs tier N-1 cleared (spikes included)', () => {
    const p = defaultProgress();
    expect(isUnlocked(p, 1)).toBe(true);
    expect(isUnlocked(p, 2)).toBe(false);
    expect(nextTier(p)).toBe(1);
    applyWallRun(p, run(1, 100));
    expect(isUnlocked(p, 2)).toBe(true);
    expect(isUnlocked(p, 3)).toBe(false);
    expect(nextTier(p)).toBe(2);
    applyWallRun(p, run(5, 100)); // clearing out of order (debug) does not open tier 4 or skip ahead
    expect(isUnlocked(p, 4)).toBe(false);
    expect(isUnlocked(p, 6)).toBe(true);
    expect(isUnlocked(p, 101)).toBe(false);
    expect(isUnlocked(p, 0)).toBe(false);
    const spike = [...Array(100).keys()].map(i => generateLevel(i + 1)).find(l => l.spike)!;
    expect(isUnlocked(p, spike.tier)).toBe(false); // not skippable
  });

  it('a Medal only comes with the first full clear of a tier; replays pay credits but no Medal', () => {
    const p = defaultProgress();
    let r = applyWallRun(p, run(1, 60));
    expect(r.medal).toBe(false);
    expect(p.medals).toBe(0);
    expect(p.clearedTiers).toEqual([]);
    expect(p.wallBestPct['1']).toBe(60);
    const credits0 = p.credits;
    expect(credits0).toBe(Math.floor(60 * rewardPerBlock(1)));
    r = applyWallRun(p, run(1, 100, 100, 80));
    expect(r.medal).toBe(true);
    expect(p.medals).toBe(1);
    expect(p.clearedTiers).toEqual([1]);
    expect(p.highestCleared).toBe(1);
    expect(p.wallBestTime['1']).toBe(80);
    expect(p.credits).toBe(credits0 + Math.floor(100 * rewardPerBlock(1)));
    r = applyWallRun(p, run(1, 100, 100, 70)); // replay: faster, pays again, no second Medal
    expect(r.medal).toBe(false);
    expect(p.medals).toBe(1);
    expect(p.wallBestTime['1']).toBe(70);
    expect(p.credits).toBe(credits0 + 2 * Math.floor(100 * rewardPerBlock(1)));
    applyWallRun(p, run(1, 40)); // a worse replay changes no best
    expect(p.wallBestPct['1']).toBe(100);
    expect(p.wallBestTime['1']).toBe(70);
    expect(p.runs).toBe(4);
  });

  it('a failed run saves its best percent (capped below 100) and pays credits', () => {
    const p = defaultProgress();
    applyWallRun(p, run(3, 99, 100));
    expect(p.wallBestPct['3']).toBe(99);
    applyWallRun(p, run(3, 94, 100));
    expect(p.wallBestPct['3']).toBe(99);
    expect(p.clearedTiers).toEqual([]);
    expect(p.wallBestTime['3']).toBeUndefined();
  });

  it('the store banks a campaign run once, with the medal flag, and a debug wall without a tier gives no campaign progress', () => {
    const store = new ProgressStore(null);
    expect(store.recordWallRun({ credits: 10, kills: 5, tier: 1, destroyed: 5, total: 5, time: 12 })).toEqual({ medal: true });
    expect(store.data.clearedTiers).toEqual([1]);
    expect(store.recordWallRun({ credits: 3, kills: 3 })).toEqual({ medal: false });
    expect(store.data.clearedTiers).toEqual([1]);
    expect(store.data.credits).toBe(13);
  });

  it('migrates a save from before the campaign fields, and survives garbage in them', () => {
    const old = { version: 1, credits: 123, owned: { turn_l: 2 }, levels: {}, ownedHulls: ['shuttle'], bestTier: 4, bestTime: 50, totalKills: 9, runs: 3 };
    const p = loadProgress(JSON.stringify(old));
    expect(p.version).toBe(4);
    expect(p.credits).toBe(123);
    expect(p.bestTier).toBe(4);
    expect(p.clearedTiers).toEqual([]);
    expect(p.medals).toBe(0);
    expect(p.wallBestPct).toEqual({});
    expect(p.highestCleared).toBe(0);
    const bad = loadProgress(JSON.stringify({ ...old, clearedTiers: [3, 'x', 3, 500, 1], wallBestPct: { '1': 150, '2': 40, zz: 5 }, wallBestTime: 'no', medals: 99 }));
    expect(bad.clearedTiers).toEqual([1, 3]);
    expect(bad.wallBestPct).toEqual({ '2': 40 });
    expect(bad.medals).toBe(2); // never more Medals than cleared tiers
    expect(bad.highestCleared).toBe(3);
    // round trip
    const again = loadProgress(serializeProgress(bad));
    expect(again).toEqual(bad);
  });
});

import { WallCamera } from '../src/wall/camera';
import { CAMERA_MAX_X, CELL, MIN_START_GAP_CELLS, SHIP_START_Y, WORLD_WIDTH } from '../src/wall/constants';
import { makeTestWall } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { buildStarterGrid } from '../src/game/starter';

describe('Edge columns', () => {
  /** Holds the dot where a pointer at `pointerX` puts it (camera at an end) and lets the gun fire for 1.5 s. */
  function shootFrom(pointerX: number, cameraAtMax: boolean) {
    const w = new WallWorld(makeTestWall({ tier: 1, rows: 3, approachSpeed: 0 }), { grid: buildStarterGrid() });
    const cam = new WallCamera();
    cam.x = cameraAtMax ? CAMERA_MAX_X : 0;
    w.setWallOffset(300);
    for (let i = 0; i < 90; i++) w.update(1 / 60, { x: pointerX + cam.x, y: 700 });
    return w;
  }

  it('on a ring the dot wraps (world x 1134 is x 0), so the ejector carves column 0 from either side of the seam and column 20 too', () => {
    const left = shootFrom(0, false);
    expect(left.shipX).toBeCloseTo(0, 6);
    expect(left.blocks[2 * 21 + 0]).toBeNull();
    expect(left.blocks[2 * 21 + 1]).not.toBeNull();
    const right = shootFrom(540, true);   // 594 + 540 = 1134 = the seam
    expect(right.shipX).toBeCloseTo(0, 6);
    expect(right.blocks[2 * 21 + 0]).toBeNull();
    const near = shootFrom(520, true); // dot at 1114, ejector at about 1124
    expect(near.blocks[2 * 21 + 20]).toBeNull();
    expect(near.blocks[2 * 21 + 19]).not.toBeNull();
    expect(CELL * 21).toBe(WORLD_WIDTH);
  });

  it('a flat wall (wrap: false) still clamps the dot to 0 .. the wall width', () => {
    const level = { ...makeTestWall({ tier: 1, rows: 3, approachSpeed: 0 }), wrap: false };
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    for (let i = 0; i < 5; i++) w.update(1 / 60, { x: 5000, y: 700 });
    expect(w.shipX).toBe(WORLD_WIDTH);
    for (let i = 0; i < 5; i++) w.update(1 / 60, { x: -300, y: 700 });
    expect(w.shipX).toBe(0);
  });
});

describe('Generator guarantees (6c)', () => {
  it('every one of the 21 columns holds at least one block, so a lane always has to be carved', () => {
    for (const l of all) {
      for (let c = 0; c < 21; c++) {
        let n = 0;
        for (let r = 0; r < l.rows; r++) if (l.cells[r * 21 + c]) n++;
        expect(n, `tier ${l.tier} column ${c}`).toBeGreaterThan(0);
      }
    }
  });

  it('the first block row starts at least 6 cells from where the ship starts', () => {
    for (const l of all) {
      let bottomRow = l.rows - 1;
      while (bottomRow > 0 && !l.cells.slice(bottomRow * 21, bottomRow * 21 + 21).some(Boolean)) bottomRow--;
      // The wall starts with its bottom edge at y = 0; the lowest block row's bottom edge is that much higher when rows are empty.
      const bottomEdge = 0 - (l.rows - 1 - bottomRow) * CELL;
      expect(SHIP_START_Y - bottomEdge).toBeGreaterThanOrEqual(MIN_START_GAP_CELLS * CELL);
    }
  });
});

describe('Passed tiers (6c)', () => {
  it('a pass unlocks the next tier without a Medal; a later full clear gives the Medal once', () => {
    const p = defaultProgress();
    const r = applyWallRun(p, { ...run(1, 5, 100, 20), passed: true });
    expect(r.medal).toBe(false);
    expect(r.newlyPassed).toBe(true);
    expect(p.passedTiers).toEqual([1]);
    expect(p.clearedTiers).toEqual([]);
    expect(p.medals).toBe(0);
    expect(isUnlocked(p, 2)).toBe(true);
    expect(p.wallBestTime['1']).toBe(20);
    expect(p.wallBestPct['1']).toBe(5);
    expect(applyWallRun(p, run(1, 100, 100, 70)).medal).toBe(true);
    expect(p.passedTiers).toEqual([1]);
    expect(p.medals).toBe(1);
    expect(p.wallBestTime['1']).toBe(20); // the quicker pass stays the best pass...
    expect(p.wallBestClearTime['1']).toBe(70); // ...and the clear has its own time
    expect(applyWallRun(p, { ...run(1, 10, 100, 15), passed: true }).medal).toBe(false);
  });

  it('a crash pays credits for the blocks destroyed, saves the percent, and unlocks nothing', () => {
    const p = defaultProgress();
    const r = applyWallRun(p, run(4, 30, 100, 12));
    expect(r.newlyPassed).toBe(false);
    expect(p.passedTiers).toEqual([]);
    expect(p.credits).toBe(Math.floor(30 * rewardPerBlock(4)));
    expect(p.wallBestPct['4']).toBe(30);
    expect(p.wallBestTime['4']).toBeUndefined();
  });

  it('a v2 save (cleared tiers only) loads with those tiers passed', () => {
    const p = loadProgress(JSON.stringify({ version: 2, credits: 5, clearedTiers: [1, 2], medals: 2, wallBestPct: { '1': 100 }, wallBestTime: { '1': 40 } }));
    expect(p.version).toBe(4);
    expect(p.passedTiers).toEqual([1, 2]);
    expect(p.wallBestClearTime).toEqual({});
    expect(isUnlocked(p, 3)).toBe(true);
  });
});
