import { describe, it, expect } from 'vitest';
import { BLOCK_ECONOMY } from '../src/data/blockEconomy';
import { HULL_ORDER } from '../src/data/hulls';
import {
  BASE_PRICE, copyPrice, FAMILY_MULT, GEN_BODIES, HULL_PRICE, leakDamage, parentReward, rockHp, rockReward, tierOfTime, upgradePrice,
} from '../src/econ/economy';
import {
  buyCopy, buyHull, buyUpgrade, defaultProgress, loadProgress, Progress, PROGRESS_KEY, ProgressStore, richProgress, serializeProgress,
} from '../src/econ/progress';
import { BLOCKS, pickerBlocks } from '../src/data/blocks';
import { describeBlock } from '../src/engine/compilerTypes';
import { BuilderModel, StorageLike } from '../src/builder/model';
import { MitosisSystem } from '../src/engine/mitosis';
import { CONFIG } from '../src/config';
import { World } from '../src/game/world';
import { fmtBig } from '../src/ui/format';
import { richModel } from './helpers';

const mem = (init: Record<string, string> = {}) => {
  const d = { ...init };
  return { d, getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; }, removeItem: (k: string) => { delete d[k]; } };
};
const withCredits = (n: number): Progress => ({ ...defaultProgress(), credits: n });

describe('pricing formulas', () => {
  const cases: [string, number, number][] = [
    // id, owned count, expected copy price = round(base * growth^owned) (family B, chunk 16c-2)
    ['turn_l', 0, 30], ['turn_l', 2, 43], ['flat_plus', 1, 72], ['splitter_2', 0, 120], ['splitter_2', 3, 295], ['splitter_3', 2, 1472], ['fork_impact', 0, 900], ['percent_mult', 9, 1060],
  ];
  it.each(cases)('copy price of %s with %i owned is %i', (id, owned, price) => {
    expect(copyPrice(id, owned)).toBe(price);
    expect(copyPrice(id, owned)).toBe(Math.round(BASE_PRICE[id] * Math.pow(BLOCK_ECONOMY[id].growth, owned)));
  });
  const ups: [string, number, number][] = [['flat_plus', 1, 120], ['flat_plus', 2, 264], ['flat_plus', 3, 581], ['homing', 1, 1600]];
  it.each(ups)('upgrade price of %s from level %i is %i (base*2*2.2^(level-1))', (id, level, price) => {
    expect(upgradePrice(id, level)).toBe(price);
  });
  it('every picker block has a base price, and the hull ladder is free then strictly ascending', () => {
    for (const b of pickerBlocks()) expect(BASE_PRICE[b.id]).toBeGreaterThan(0);
    expect(pickerBlocks().length).toBe(41);
    expect(HULL_PRICE.dart).toBe(0);
    const ladder = HULL_ORDER.map(id => HULL_PRICE[id]);
    for (let i = 1; i < ladder.length; i++) expect(ladder[i]).toBeGreaterThan(ladder[i - 1]);
  });
  it('formats big numbers compactly', () => {
    expect([0, 999, 1000, 9720, 12345, 1234567].map(fmtBig)).toEqual(['0', '999', '1K', '9.72K', '12.3K', '1.23M']);
  });
});

describe('purchases', () => {
  it('buyCopy: insufficient funds rejected, exact funds accepted, counts and credits correct', () => {
    const p = withCredits(42);
    expect(buyCopy(p, 'turn_l')).toMatchObject({ ok: false });
    expect(p.credits).toBe(42);
    expect(p.owned.turn_l).toBe(2);
    p.credits = 43;
    expect(buyCopy(p, 'turn_l')).toEqual({ ok: true, price: 43 });
    expect(p.credits).toBe(0);
    expect(p.owned.turn_l).toBe(3);
    expect(copyPrice('turn_l', p.owned.turn_l)).toBe(52); // price follows the new owned count
  });
  it('buyUpgrade: exact funds accepted, one level per purchase, MAX rejected', () => {
    const p = withCredits(119);
    expect(buyUpgrade(p, 'flat_plus').ok).toBe(false);
    p.credits = 120;
    expect(buyUpgrade(p, 'flat_plus')).toEqual({ ok: true, price: 120 });
    expect(p.levels.flat_plus).toBe(2);
    expect(p.credits).toBe(0);
    p.credits = 1e9;
    for (let i = 0; i < BLOCKS.turn_l.maxLevel - 1; i++) expect(buyUpgrade(p, 'turn_l').ok).toBe(true);
    expect(buyUpgrade(p, 'turn_l')).toMatchObject({ ok: false }); // at its max level
    expect(p.levels.turn_l).toBe(BLOCKS.turn_l.maxLevel);
    for (let i = 0; i < 20; i++) buyUpgrade(p, 'flat_plus');
    expect(p.levels.flat_plus).toBe(BLOCKS.flat_plus.maxLevel);
  });
  it('buyHull: rejected below the price, accepted at exactly the price, never twice', () => {
    const price = HULL_PRICE.fan;
    const p = withCredits(price - 1);
    expect(buyHull(p, 'fan').ok).toBe(false);
    expect(p.ownedHulls).toEqual(['dart']);
    p.credits = price;
    expect(buyHull(p, 'fan')).toEqual({ ok: true, price });
    expect(p.credits).toBe(0);
    expect(p.ownedHulls).toEqual(['dart', 'fan']);
    p.credits = price;
    expect(buyHull(p, 'fan').ok).toBe(false);
    expect(p.credits).toBe(price);
    expect(buyHull(p, 'dart').ok).toBe(false);   // the free starter is already owned
  });
  it('the store saves and notifies on a purchase', () => {
    const st = mem();
    const store = new ProgressStore(st, withCredits(500));
    let n = 0;
    store.onChange(() => n++);
    store.buyCopy('splitter_2');
    expect(n).toBe(1);
    expect(JSON.parse(st.d[PROGRESS_KEY]).owned.splitter_2).toBe(1);
    expect(JSON.parse(st.d[PROGRESS_KEY]).credits).toBe(380);
  });
});

describe('persistence', () => {
  it('new-game defaults', () => {
    const p = defaultProgress();
    expect(p.credits).toBe(0);
    expect(p.ownedHulls).toEqual(['dart']);
    expect(Object.fromEntries(Object.entries(p.owned).filter(([, v]) => v > 0))).toEqual({ turn_l: 2, turn_r: 2, flat_plus: 1 });
    expect(Object.values(p.levels).every(l => l === 1)).toBe(true);
  });
  it('round-trips through storage', () => {
    const p = withCredits(1234);
    p.owned.splitter_2 = 3; p.levels.flat_plus = 4; p.ownedHulls.push('fan'); p.bestTier = 6; p.bestTime = 75.5; p.totalKills = 99; p.runs = 5;
    expect(loadProgress(serializeProgress(p))).toEqual(p);
  });
  const bad: [string, string | null][] = [
    ['no save', null], ['not json', '{oops'], ['an array', '[1,2]'], ['a number', '42'],
    ['wrong types', JSON.stringify({ credits: 'lots', owned: 5, levels: [], ownedHulls: 'fan', runs: -3 })],
  ];
  it.each(bad)('falls back to defaults on %s', (_n, raw) => {
    expect(loadProgress(raw)).toEqual(defaultProgress());
  });
  it('keeps what is valid and drops what is not (levels clamped, unknown hulls and ids ignored)', () => {
    const p = loadProgress(JSON.stringify({ credits: 50.9, owned: { splitter_2: 2, nope: 9, turn_l: -1 }, levels: { flat_plus: 99, homing: 3 }, ownedHulls: ['fan', 'ghost'] }));
    // Homing lost its levels (16c-2): the 3 levels it had are refunded at the old upgrade prices (400 x 2, 400 x 2 x 2.2).
    expect(p.credits).toBe(50 + 800 + 1760);
    expect(p.owned.splitter_2).toBe(2);
    expect(p.owned.turn_l).toBe(2); // negative -> default
    expect('nope' in p.owned).toBe(false);
    expect(p.levels.flat_plus).toBe(1); // above max -> 1
    expect(p.levels.homing).toBe(1);
    expect(p.ownedHulls).toEqual(['dart', 'shuttle', 'fan']);   // the Dart is always owned; an old save keeps its Shuttle
  });
  it('an old save (builder circuit, no progress key) loads with new-game progress and does not crash', () => {
    const st = mem({ 'mgbm.builder.v2': JSON.stringify({ version: 2, hulls: { shuttle: { active: 'A', slots: { A: [], B: [] } } } }) });
    const m = new BuilderModel(st);
    expect(m.store.data).toEqual(defaultProgress());
  });
});

describe('earning', () => {
  it('the tier rises every 15 s and rock HP and rewards follow the tier growth', () => {
    expect([0, 14.9, 15, 30, 59.9, 60].map(tierOfTime)).toEqual([1, 1, 2, 3, 4, 5]);
    expect(rockHp(1)).toBe(5);
    expect(rockHp(5)).toBeCloseTo(5 * Math.pow(CONFIG.ECON.TIER_HP_GROWTH, 4), 6);
    expect(parentReward(1)).toBe(7);
    expect(parentReward(3)).toBeCloseTo(7 * 1.05 * 1.05, 9);
  });
  it('later generations pay less each, and a whole family pays ~1.1x the parent', () => {
    for (const tier of [1, 5, 20]) {
      const per = [1, 2, 3, 4].map(g => rockReward(tier, g));
      for (let i = 1; i < 4; i++) expect(per[i]).toBeLessThan(per[i - 1]);
      const family = per.reduce((s, r, g) => s + r * GEN_BODIES[g], 0);
      expect(family / parentReward(tier)).toBeCloseTo(FAMILY_MULT, 9);
    }
  });
  it('killing a full family in the simulation pays about 1.1x the parent reward', () => {
    const w = new World({ autoSpawn: false });
    w.spawnRock(270, 300, 100);
    const total = () => w.creditsExact;
    // kill every body as soon as it appears, until none are left
    for (let guard = 0; guard < 40 && w.mitosis.enemies.length; guard++) {
      for (const e of w.mitosis.enemies) e.hp = 0;
      w.update(1 / 60, { x: 0, y: 0, active: false, type: 'mouse', seen: false });
      w.splits.length = 0;
    }
    expect(w.kills).toBe(15);
    expect(total() / parentReward(1)).toBeGreaterThan(1.0);
    expect(total() / parentReward(1)).toBeLessThan(1.2);
    expect(w.credits).toBe(Math.floor(total()));
  });
  it('children inherit the tier of the family', () => {
    const m = new MitosisSystem();
    const parent = m.spawn('mitotic_rock', 1, 100, 0, 0, 20)!;
    parent.tier = 7;
    m.handleDeath(parent);
    expect(m.enemies.length).toBe(2);
    expect(m.enemies.every(e => e.tier === 7)).toBe(true);
  });
  it('a rock that reaches the bottom edge is removed and hurts the hull by its size (small 0.5x, medium 1x, large 1.5x)', () => {
    expect([1, 2, 3, 4].map(g => leakDamage(100, g))).toEqual([15, 10, 5, 5]);
    const w = new World({ autoSpawn: false });
    const rock = w.spawnRock(30, CONFIG.VIEW.H - 1, 100)!;
    w.shipX = 500; w.shipY = 100;
    const ptr = { x: 500, y: 100, active: false, type: 'mouse', seen: true };
    for (let i = 0; i < 5; i++) w.update(1 / 60, ptr);
    expect(w.mitosis.enemies.includes(rock)).toBe(false);
    expect(w.leaks).toBe(1);
    expect(w.hull).toBe(85);
    expect(w.kills).toBe(0);
  });
  it('leaks can end the run', () => {
    const w = new World({ autoSpawn: false });
    w.hull = 5;
    w.spawnRock(30, CONFIG.VIEW.H - 1, 100);
    w.shipX = 500; w.shipY = 100;
    for (let i = 0; i < 5; i++) w.update(1 / 60, { x: 500, y: 100, active: false, type: 'mouse', seen: true });
    expect(w.gameOver).toBe(true);
    expect(w.hull).toBe(0);
  });
});

/** A builder model on the Shuttle of an old save (new-game inventory, Shuttle owned). */
function shuttleModel(st: StorageLike | null): BuilderModel {
  return new BuilderModel(st, 'shuttle', new ProgressStore(st, { ...defaultProgress(), ownedHulls: ['dart', 'shuttle'] }));
}

describe('inventory and levels in the builder', () => {
  it('a circuit that uses more copies than owned is trimmed on load, never crashes, and the blocks are returned', () => {
    const entries = [[3, 7], [4, 7], [5, 7], [3, 5], [4, 5]].map(([x, y]) => ({ x, y, blockId: 'flat_plus', level: 1, rotation: 0, manual: false }));
    entries.push({ x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, manual: false });
    const st = mem({ 'mgbm.builder.v2': JSON.stringify({ version: 2, hulls: { shuttle: { active: 'A', slots: { A: entries, B: entries } } } }) });
    let m!: BuilderModel;
    expect(() => { m = shuttleModel(st); }).not.toThrow();
    expect(m.trimmed).toBe(8); // 4 extra Flat+ in each of A and B
    expect(m.placedCount('flat_plus')).toBe(1);
    expect(m.placedCount('turn_r')).toBe(1);
    expect(m.available('flat_plus')).toBe(0);
    m.switchSlot('B');
    expect(m.placedCount('flat_plus')).toBe(1); // B draws from the same inventory
    expect(JSON.parse(st.getItem('mgbm.builder.v2')!).hulls.shuttle.slots.A.filter((e: any) => e.blockId === 'flat_plus').length).toBe(1);
  });
  it('placing decrements and removing returns the available count; unowned blocks cannot be placed', () => {
    const m = shuttleModel(null);
    expect(m.available('turn_l')).toBe(1); // 2 owned, 1 on the default circuit
    expect(m.place(2, 6, 'turn_l').ok).toBe(true);
    expect(m.available('turn_l')).toBe(0);
    expect(m.place(2, 5, 'turn_l')).toMatchObject({ ok: false });
    expect(m.place(3, 5, 'splitter_2')).toMatchObject({ ok: false, error: 'No Splitter 2 left' });
    m.remove(2, 6);
    expect(m.available('turn_l')).toBe(1);
  });
  it('a locked hull cannot be selected until it is bought', () => {
    const m = new BuilderModel(null);
    expect(m.switchHull('fan')).toMatchObject({ ok: false });
    m.store.data.credits = HULL_PRICE.fan;
    m.store.buyHull('fan');
    expect(m.switchHull('fan').ok).toBe(true);
  });
  it('the saved level of a block reaches the compiler, the stats strip and the inspector text', () => {
    const m = richModel();
    const base = m.compiled.stats.damagePerShot;
    expect(base).toBe(2);
    m.store.buyUpgrade('flat_plus'); // rich progress has 0 credits: nothing happens
    expect(m.store.data.levels.flat_plus).toBe(1);
    m.store.data.credits = 1e6;
    expect(m.store.buyUpgrade('flat_plus').ok).toBe(true);
    m.refreshLevels();
    expect(m.compiled.stats.damagePerShot).toBe(3);
    const cell = m.grid.cells.find(c => c.blockId === 'flat_plus')!;
    expect(cell.level).toBe(2);
    expect(describeBlock(BLOCKS.flat_plus, cell.level)).toBe('Adds +2 damage to each projectile.');
    expect(m.gridForFlight().cells.find(c => c.blockId === 'flat_plus')!.level).toBe(2);
    // a block placed later also takes the saved level
    m.store.data.levels.percent_mult = 3;
    m.place(3, 4, 'percent_mult');
    expect(m.grid.cells.find(c => c.blockId === 'percent_mult')!.level).toBe(3);
  });
  it('every shown block with more than one level changes its numbers when the level rises', () => {
    for (const b of pickerBlocks().filter(x => x.maxLevel > 1)) {
      const a = describeBlock(b, 1);
      const z = describeBlock(b, b.maxLevel);
      expect(z, `${b.id} rule text must change with level`).not.toBe(a);
    }
  });
  it('rich progress helper owns 20 of everything', () => {
    const p = richProgress();
    expect(Object.values(p.owned).every(n => n === 20)).toBe(true);
  });
});

describe('level scaling of the formerly flat modifiers', () => {
  const cases: [string, number, number, number][] = [
    // formula, level, expected at level, expected at level 1
    ['aoeCircleRadius', 3, 74, 54], ['shieldBreakMul', 2, 2, 1.5],
  ];
  it.each(cases)('%s at level %i is %d (level 1: %d)', async (fn, level, atLevel, atOne) => {
    const proj = (await import('../src/engine/projectiles')) as unknown as Record<string, (l: number) => number>;
    expect(proj[fn](level)).toBeCloseTo(atLevel, 9);
    expect(proj[fn](1)).toBeCloseTo(atOne, 9);
  });
  it('Shield-Breaker multiplies only what hits a shield (16c-2): none on bare HP, x(mult x 2) on the shield, plain overflow after it', async () => {
    const { applyDamage } = await import('../src/engine/damage');
    const hit = (sb: boolean | number, shield = 0) => {
      const e = { hp: 1000, maxHp: 1000, armor: 0, shield, maxShield: shield };
      applyDamage(e, 100, 0, 1, 0, sb);
      return { hp: 1000 - e.hp, shield: shield - e.shield };
    };
    expect(hit(false)).toEqual({ hp: 100, shield: 0 });
    expect(hit(true)).toEqual({ hp: 100, shield: 0 }); // no shield: no bonus
    expect(hit(2)).toEqual({ hp: 100, shield: 0 });
    expect(hit(true, 1000)).toEqual({ hp: 0, shield: 300 }); // 100 x 1.5 x 2 to the shield
    expect(hit(false, 1000)).toEqual({ hp: 0, shield: 100 });
    const broke = hit(true, 100); // the shield (100) needs 100 / 3 of the hit; the other 66.7 gets through as plain damage
    expect(broke.shield).toBe(100);
    expect(broke.hp).toBeCloseTo(100 - 100 / 3, 9);
  });

});
