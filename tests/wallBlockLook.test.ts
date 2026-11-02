import { describe, expect, it } from 'vitest';
import { wallFillColor, wallFlashColor, wallHpBand, WALL_HP_BANDS, WALL_HP_COLORS } from '../src/ui/wallBlockLook';
import { SHOT_LOOKS } from '../src/ui/shotLook';
import { generateLevel } from '../src/wall/generator';

describe('wall block colours by max HP (26a)', () => {
  it('log bands: under 100, 100-999, 1K-9.9K, 10K-99K, 100K and up', () => {
    const cases: [number, number][] = [[1, 0], [2, 0], [99, 0], [100, 1], [999, 1], [1000, 2], [9999, 2], [10000, 3], [99999, 3], [100000, 4], [1e9, 4], [Infinity, 4]];
    for (const [hp, band] of cases) expect(wallHpBand(hp), String(hp)).toBe(band);
    expect(wallHpBand(NaN)).toBe(0);
    expect(wallHpBand(-5)).toBe(0);
  });
  it('one colour per band, all different, none a shot colour; band 0 is the old green', () => {
    expect(WALL_HP_COLORS.length).toBe(WALL_HP_BANDS.length + 1);
    expect(new Set(WALL_HP_COLORS).size).toBe(WALL_HP_COLORS.length);
    expect(WALL_HP_COLORS[0]).toBe(0x6fbf73);
    for (const l of SHOT_LOOKS) expect(WALL_HP_COLORS).not.toContain(l.color);
    for (const c of [0x55555a, 0xd4d4d8, 0x5fd4e8]) expect(WALL_HP_COLORS).not.toContain(c); // frame, armor frame, shield bar
  });
  it('a hit flash is lighter than the fill and keeps the band order', () => {
    for (const hp of [10, 500, 5000, 50000, 5e5]) {
      const f = wallFillColor(hp), w = wallFlashColor(hp);
      for (const s of [16, 8, 0]) expect((w >> s) & 255).toBeGreaterThanOrEqual((f >> s) & 255);
      expect(w).not.toBe(f);
    }
  });
  it('the real walls use several bands as the tiers climb', () => {
    const bands = (tier: number) => new Set(generateLevel(tier).cells.filter((c) => c !== null).map((c) => wallHpBand(c!.hp)));
    expect([...bands(1)]).toEqual([0]);
    expect(bands(40).has(1)).toBe(true);
    expect(bands(100).has(2)).toBe(true);
  });
});
