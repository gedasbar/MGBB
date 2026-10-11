import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { ABOVE_SCREEN_MAX, World } from '../src/game/world';
import { PointerState } from '../src/input';
import { ROSTER, SPECIES } from '../src/data/species';
import { ENEMY_ART, rockShape } from '../src/ui/rockArt';
import { rockHp } from '../src/econ/economy';
import { loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress, defaultProgress } from '../src/econ/progress';
import { planWave, unlockedAt, WaveDirector, PlannedSpawn } from '../src/game/waves';
import { ALIVE_HOLD, specialKind, SPECIAL_BUDGET_MUL, WAVE_TIME, waveBonus, waveBudget } from '../src/data/waves';

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


const pointsOf = (list: PlannedSpawn[]) => list.reduce((s, p) => s + (p.generation > 1 ? 1 : SPECIES[p.defId].cost), 0);

describe('Free Fly wave director', () => {
  it('is deterministic for a seed: same waves, same spawns, same run; another seed differs', () => {
    for (const wave of [1, 4, 5, 9, 10, 23]) expect(planWave(77, wave)).toEqual(planWave(77, wave));
    expect(planWave(77, 3)).not.toEqual(planWave(78, 3));
    const run = (seed: number) => {
      const w = new World({ seed });
      const p: PointerState = { x: VW / 2, y: 760, active: false, type: 'mouse', seen: true };
      for (let i = 0; i < 100 * 60; i++) { w.hull = 1e9; p.x = VW / 2 + Math.sin(i / 50) * 200; w.update(DT, p); }
      return { kills: w.kills, credits: w.creditsExact, alive: w.mitosis.enemies.map(e => [e.defId, Math.round(e.x * 1e6)]) };
    };
    expect(run(5)).toEqual(run(5));
  });

  it('species unlock in order: Rock 1, Darter 2, Drifter 3, Mother 4, Ironclad 6, Warden 7, Budder 8, each first in its first wave', () => {
    const expected: Record<string, number> = { mitotic_rock: 1, darter: 2, drifter: 3, mother: 4, ironclad: 6, warden: 7, budder: 8 };
    for (const [id, first] of Object.entries(expected)) {
      expect(SPECIES[id].firstWave).toBe(first);
      expect(unlockedAt(first - 1).some(s => s.id === id)).toBe(false);
      expect(unlockedAt(first).some(s => s.id === id)).toBe(true);
      if (!specialKind(first)) for (const seed of [1, 2, 3]) expect(planWave(seed, first)[0].defId === id || planWave(seed, first).some(p => p.defId === id && p.at <= 2)).toBe(true);
    }
    // No locked species ever shows up in a normal wave.
    for (let wave = 1; wave <= 12; wave++) {
      if (specialKind(wave)) continue;
      const open = new Set(unlockedAt(wave).map(s => s.id));
      for (const seed of [1, 9, 33]) for (const p of planWave(seed, wave)) expect(open.has(p.defId)).toBe(true);
    }
  });

  it('the spawn budget never decreases between waves, and each wave spends it', () => {
    let prev = 0;
    for (let wave = 1; wave <= 60; wave++) {
      expect(waveBudget(wave)).toBeGreaterThanOrEqual(prev);
      prev = waveBudget(wave);
      if (specialKind(wave) === 'mothers') continue;
      const budget = waveBudget(wave) * (specialKind(wave) ? SPECIAL_BUDGET_MUL : 1);
      const spent = pointsOf(planWave(11, wave));
      expect(spent).toBeLessThanOrEqual(budget + 1e-9);
      expect(spent).toBeGreaterThan(budget - 4); // leftover is less than the dearest pick
    }
  });

  it('every 5th wave is special: a Swarm of Darters and pebbles on 5, 15; Mothers only on 10, 20; bonus 10 x wave / 5', () => {
    expect([5, 10, 15, 20, 4].map(specialKind)).toEqual(['swarm', 'mothers', 'swarm', 'mothers', null]);
    for (const p of planWave(3, 5)) expect(p.defId === 'darter' || (p.defId === 'mitotic_rock' && p.generation === 3)).toBe(true);
    const m = planWave(3, 10);
    expect(m.length).toBeGreaterThanOrEqual(2);
    expect(m.every(p => p.defId === 'mother')).toBe(true);
    expect([4, 5, 10, 15].map(waveBonus)).toEqual([0, 10, 20, 30]);
  });

  it('waves start every 40 s; spawns enter above the top, inside the width; the bonus is paid at the wave start', () => {
    const w = new World({ seed: 4 });
    const p: PointerState = { x: VW / 2, y: 760, active: false, type: 'mouse', seen: true };
    const starts: [number, number][] = [];
    const born = new Set<number>();
    for (let i = 0; i < Math.round((4 * WAVE_TIME + 1) / DT); i++) {
      w.hull = 1e9;
      w.update(DT, p);
      for (const ev of w.waveEvents) starts.push([ev.wave, w.time]);
      w.waveEvents.length = 0;
      for (const e of w.mitosis.enemies) if (!born.has(e.id)) {
        born.add(e.id);
        if (e.generation === 1) { expect(e.y).toBeLessThan(0); expect(e.x).toBeGreaterThanOrEqual(e.radius); expect(e.x).toBeLessThanOrEqual(VW - e.radius); }
      }
    }
    expect(starts.map(s => s[0])).toEqual([1, 2, 3, 4, 5]);
    starts.forEach(([wave, t]) => expect(Math.abs(t - (wave - 1) * WAVE_TIME)).toBeLessThan(DT * 1.5));
    expect(w.bonusCredits).toBe(10);
  });

  it('holds spawns while too many bodies are alive, and sends them later', () => {
    const d = new WaveDirector(2);
    const out: PlannedSpawn[] = [];
    d.update(WAVE_TIME - 1, ALIVE_HOLD, out);
    expect(out.length).toBe(0);
    expect(d.held).toBeGreaterThan(0);
    d.update(WAVE_TIME - 1, 0, out);
    expect(out.length).toBe(planWave(2, 1).length);
  });
});


describe('Free Fly records (save v5)', () => {
  it('a v4 save loads with everything kept and bestWave 0; v5 round-trips bestWave', () => {
    const v4 = { version: 4, credits: 321, owned: { turn_l: 3, flat_plus: 2 }, levels: { flat_plus: 2 }, ownedHulls: ['dart', 'twin'], bestTier: 6, bestTime: 88.5, totalKills: 40, runs: 7, clearedTiers: [1, 2], passedTiers: [1, 2, 3], medals: 2 };
    const p = loadProgress(JSON.stringify(v4));
    expect(PROGRESS_VERSION).toBe(5);
    expect(p.version).toBe(5);
    expect(p.bestWave).toBe(0);
    expect([p.credits, p.owned.flat_plus, p.levels.flat_plus, p.bestTier, p.bestTime, p.totalKills, p.runs, p.medals]).toEqual([321, 2, 2, 6, 88.5, 40, 7, 2]);
    expect(p.ownedHulls).toEqual(['dart', 'twin']);
    expect(p.passedTiers).toEqual([1, 2, 3]);
    p.bestWave = 9;
    expect(loadProgress(serializeProgress(p)).bestWave).toBe(9);
    expect(loadProgress(JSON.stringify({ ...v4, version: 5, bestWave: -3 })).bestWave).toBe(0);
    expect(loadProgress(JSON.stringify({ ...v4, version: 5, bestWave: 'x' })).bestWave).toBe(0);
  });
  it('recordRun keeps the best wave and best time, and says when either is new', () => {
    const st = new ProgressStore(null, defaultProgress());
    expect(st.recordRun({ credits: 50, kills: 9, time: 100, tier: 7, wave: 3 })).toEqual({ newBestTier: true, newBestTime: true, newBestWave: true });
    expect(st.recordRun({ credits: 5, kills: 1, time: 150, tier: 3, wave: 2 })).toEqual({ newBestTier: false, newBestTime: true, newBestWave: false });
    expect(st.data.bestWave).toBe(3);
    expect(st.data.bestTime).toBe(150);
    expect(st.data.credits).toBe(55);
    // A run without a wave (older callers) never touches the record.
    st.recordRun({ credits: 0, kills: 0, time: 1, tier: 1 });
    expect(st.data.bestWave).toBe(3);
  });
});
