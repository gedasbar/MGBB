import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { ABOVE_SCREEN_MAX, World } from '../src/game/world';
import { PointerState } from '../src/input';
import { ROSTER, SPECIES } from '../src/data/species';
import { ENEMY_ART, rockShape } from '../src/ui/rockArt';
import { rockHp } from '../src/econ/economy';

const DT = 1 / 60;
const VW = CONFIG.VIEW.W;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });

/** Kills every body as soon as it exists; returns bodies killed per (generation, defId) and the first children. */
function killWholeFamily(defId: string) {
  const w = new World({ autoSpawn: false });
  w.spawnSpecies(defId, 270, 300, { hp: 1000 });
  const seen: { gen: number; defId: string; radius: number; armor: number; shield: number; maxShield: number; hp: number }[] = [];
  const ids = new Set<number>();
  for (let guard = 0; guard < 40 && w.mitosis.enemies.length; guard++) {
    for (const e of w.mitosis.enemies) {
      if (!ids.has(e.id)) { ids.add(e.id); seen.push({ gen: e.generation, defId: e.defId, radius: e.radius, armor: e.armor, shield: e.shield, maxShield: e.maxShield, hp: e.maxHp }); }
      e.hp = 0;
    }
    w.update(DT, idle());
  }
  return { w, seen };
}

describe('Free Fly species: split rules', () => {
  const count = (seen: { gen: number }[], g: number) => seen.filter(s => s.gen === g).length;

  it('Rock: 2 children per split down to generation 4 (1 + 2 + 4 + 8), as before', () => {
    const { seen, w } = killWholeFamily('mitotic_rock');
    expect([1, 2, 3, 4].map(g => count(seen, g))).toEqual([1, 2, 4, 8]);
    expect(w.kills).toBe(15);
  });
  it('Darter does not split', () => {
    const { seen } = killWholeFamily('darter');
    expect(seen.length).toBe(1);
  });
  it('Drifter splits once into 2 smaller Drifters', () => {
    const { seen } = killWholeFamily('drifter');
    expect([1, 2, 3].map(g => count(seen, g))).toEqual([1, 2, 0]);
    expect(seen.filter(s => s.gen === 2).every(s => s.defId === 'drifter' && s.radius === 13)).toBe(true);
  });
  it('Mother splits into 3 Brood, each of which splits once more into 2', () => {
    const { seen } = killWholeFamily('mother');
    expect([1, 2, 3, 4].map(g => count(seen, g))).toEqual([1, 3, 6, 0]);
    const g2 = seen.filter(s => s.gen === 2), g3 = seen.filter(s => s.gen === 3);
    expect(g2.every(s => s.defId === 'brood' && s.radius === 20 && Math.abs(s.hp - 400) < 1e-9)).toBe(true);
    expect(g3.every(s => s.defId === 'brood' && s.radius === 13 && Math.abs(s.hp - 200) < 1e-9)).toBe(true);
  });
  it('Ironclad is armored; its shell cracks into 2 unarmored rocks that go on splitting as rocks', () => {
    const { seen } = killWholeFamily('ironclad');
    expect(seen[0].armor).toBeGreaterThan(0);
    expect([1, 2, 3, 4].map(g => count(seen, g))).toEqual([1, 2, 4, 8]);
    expect(seen.filter(s => s.gen > 1).every(s => s.defId === 'mitotic_rock' && s.armor === 0)).toBe(true);
  });
  it('Warden has a shield of half its HP; it splits once into 2 Wardens with their own shields', () => {
    const { seen } = killWholeFamily('warden');
    expect(seen[0].maxShield).toBeCloseTo(500, 9);
    expect([1, 2, 3].map(g => count(seen, g))).toEqual([1, 2, 0]);
    expect(seen.filter(s => s.gen === 2).every(s => s.defId === 'warden' && Math.abs(s.maxShield - s.hp * 0.5) < 1e-9)).toBe(true);
  });
  it('Budder does not split on death, but buds a small rock every 3.5 s while alive, at most 3', () => {
    const { seen } = killWholeFamily('budder');
    expect(seen.length).toBe(1);
    const w = new World({ autoSpawn: false });
    const b = w.spawnSpecies('budder', 270, 100, { hp: 1e9 })!;
    const t0 = w.mitosis.enemies.length;
    for (let i = 0; i < Math.round(3.4 / DT); i++) { w.update(DT, idle()); b.y = 100; }
    expect(w.mitosis.enemies.length).toBe(t0);
    for (let i = 0; i < Math.round(0.2 / DT); i++) { w.update(DT, idle()); b.y = 100; }
    expect(w.mitosis.enemies.length).toBe(t0 + 1);
    const bud = w.mitosis.enemies.find(e => e !== b)!;
    expect(bud.defId).toBe('mitotic_rock');
    expect(bud.generation).toBe(3);
    expect(bud.maxHp).toBeCloseTo(0.25e9, 0);
    for (let i = 0; i < Math.round(20 / DT); i++) { w.update(DT, idle()); b.y = 100; for (const e of w.mitosis.enemies) if (e !== b) e.y = 300; }
    expect(w.mitosis.enemies.filter(e => e !== b).length).toBe(3);
  });
  it('director spawns get HP from the tier and the species', () => {
    const w = new World({ autoSpawn: false });
    expect(w.spawnSpecies('mother', 100, -30)!.maxHp).toBeCloseTo(rockHp(1) * 3, 9);
    expect(w.spawnSpecies('darter', 100, -30)!.radius).toBe(SPECIES.darter.radius);
  });
});

describe('Free Fly species: movement stays inside the screen', () => {
  for (const sp of ROSTER) {
    it(`${sp.name}: 120 s of spawns, splits and a sweeping ship: every body inside [r, W - r], never above for > 6 s`, () => {
      const w = new World({ autoSpawn: false });
      const p: PointerState = { x: VW / 2, y: 760, active: false, type: 'mouse', seen: true };
      const above = new Map<number, number>();
      let worst = 0, maxAbove = 0, bodies = 0;
      for (let i = 0; i < 120 * 60; i++) {
        w.hull = 1e9;
        p.x = VW / 2 + Math.sin(i / 70) * (VW / 2);
        if (i % 90 === 0) w.spawnSpecies(sp.id, (i / 90) % 3 === 0 ? 0 : (i / 90) % 3 === 1 ? VW : VW / 2, -sp.radius, { hp: 300 });
        w.update(DT, p);
        bodies = Math.max(bodies, w.mitosis.enemies.length);
        for (const e of w.mitosis.enemies) {
          worst = Math.max(worst, e.radius - e.x, e.x + e.radius - VW);
          if (e.y < 0) { const t = (above.get(e.id) ?? 0) + DT; above.set(e.id, t); maxAbove = Math.max(maxAbove, t); } else above.delete(e.id);
        }
      }
      expect(bodies).toBeGreaterThan(2);
      expect(w.kills).toBeGreaterThan(10);
      expect(worst).toBeLessThanOrEqual(1e-6);
      expect(maxAbove).toBeLessThanOrEqual(ABOVE_SCREEN_MAX + 2 * DT);
    });
  }

  it('a Drifter slides side to side and bounces off both sides; a Darter dives at the ship', () => {
    const w = new World({ autoSpawn: false });
    const d = w.spawnSpecies('drifter', 270, 100, { hp: 1e9 })!;
    const xs: number[] = [];
    for (let i = 0; i < 12 * 60; i++) { w.update(DT, idle()); d.y = 100; xs.push(d.x); }
    expect(Math.min(...xs)).toBeLessThan(d.radius + 1);
    expect(Math.max(...xs)).toBeGreaterThan(VW - d.radius - 1);
    const w2 = new World({ autoSpawn: false });
    w2.shipX = 480; w2.shipY = 800;
    const dart = w2.spawnSpecies('darter', 60, -10, { hp: 1e9 })!;
    w2.update(DT, idle());
    expect(dart.vx).toBeGreaterThan(30);
    expect(dart.vy).toBeGreaterThan(100);
  });
});

describe('Free Fly species: art', () => {
  it('every roster species has its own art def; stretched shapes stay inside the unit circle (the hit circle)', () => {
    const shades = new Set<number>();
    for (const sp of [...ROSTER, SPECIES.brood]) {
      const def = ENEMY_ART[sp.id];
      expect(def, sp.id).toBeDefined();
      shades.add(def.shades.edge);
      for (let id = 1; id < 20; id++) for (const [x, y] of rockShape(def, id).outer) expect(Math.hypot(x, y)).toBeLessThanOrEqual(1.0001);
    }
    expect(shades.size).toBe(ROSTER.length + 1);
  });
});
