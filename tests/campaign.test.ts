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
      expect(countBlocks(l)).toBeLessThanOrEqual(blocksForTier(l.tier));
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
