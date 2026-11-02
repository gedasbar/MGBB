import { describe, it, expect } from 'vitest';
import { SHIP_CONCEPTS, CONCEPT_HULLS, CONCEPT_STYLES, conceptShip, CONCEPT_COLORS } from '../src/ui/shipConcepts';

describe('ship concepts', () => {
  it('has every style for every concept hull, once', () => {
    for (const h of CONCEPT_HULLS) for (const s of CONCEPT_STYLES) expect(SHIP_CONCEPTS.filter(c => c.hull === h && c.style === s)).toHaveLength(1);
    expect(SHIP_CONCEPTS).toHaveLength(CONCEPT_HULLS.length * CONCEPT_STYLES.length);
  });
  it('keeps every polygon valid and inside the unit box', () => {
    for (const c of SHIP_CONCEPTS) for (const p of c.parts) {
      expect(p.points.length).toBeGreaterThanOrEqual(3);
      expect(p.tone === 'accent' || p.tone in CONCEPT_COLORS).toBe(true);
      for (const [x, y] of p.points) { expect(x).toBeGreaterThanOrEqual(-0.001); expect(x).toBeLessThanOrEqual(1.001); expect(y).toBeGreaterThanOrEqual(-0.001); expect(y).toBeLessThanOrEqual(1.001); }
    }
  });
  it('is left-right symmetric (the mirrored point set equals the point set)', () => {
    const key = (x: number, y: number) => `${x.toFixed(4)},${y.toFixed(4)}`;
    for (const c of SHIP_CONCEPTS) {
      const all = new Set(c.parts.flatMap(p => p.points.map(([x, y]) => key(x, y))));
      for (const p of c.parts) for (const [x, y] of p.points) expect(all.has(key(1 - x, y))).toBe(true);
    }
  });
  it('has a flame under every ship', () => {
    for (const c of SHIP_CONCEPTS) { expect(c.flames.length).toBeGreaterThan(0); for (const f of c.flames) expect(f.length).toBeLessThanOrEqual(0.22); }
    expect(conceptShip('wisp', 'A').hull).toBe('wisp');
  });
});
