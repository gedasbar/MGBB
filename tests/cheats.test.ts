import { describe, it, expect } from 'vitest';
import { BLOCKS } from '../src/data/blocks';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_KEY, isUnlocked } from '../src/econ/progress';
import { addCredits, addMedals, ownAllBlocks, ownAllHulls, resetCampaign, resetEverything, unlockAllTiers } from '../src/debug/cheats';
import { maxLevelOf } from '../src/econ/economy';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { BuilderModel } from '../src/builder/model';
import { World } from '../src/game/world';
import { WAVE_TIME } from '../src/data/waves';

const mem = () => { const m: Record<string, string> = {}; return { m, st: { getItem: (k: string) => m[k] ?? null, setItem: (k: string, v: string) => { m[k] = v; }, removeItem: (k: string) => { delete m[k]; } } }; };
const fresh = () => { const { m, st } = mem(); return { m, store: new ProgressStore(st) }; };

describe('dev cheats', () => {
  it('add credits goes through the store: listeners hear it and the save has it', () => {
    const { m, store } = fresh();
    let heard = 0; store.onChange(() => heard++);
    addCredits(store, 1000); addCredits(store, 10_000_000);
    expect(store.data.credits).toBe(10_001_000);
    expect(heard).toBe(2);
    expect(JSON.parse(m[PROGRESS_KEY]).credits).toBe(10_001_000);
    addCredits(store, -99_999_999); // never below zero
    expect(store.data.credits).toBe(0);
  });
  it('own all blocks gives N copies of every block, hidden ones too; max level on request; it survives a reload', () => {
    const { m, store } = fresh();
    ownAllBlocks(store, 7, false);
    expect(Object.keys(BLOCKS).every(id => store.data.owned[id] === 7)).toBe(true);
    expect(store.data.levels.flat_plus).toBe(1);
    ownAllBlocks(store, 10, true);
    expect(Object.keys(BLOCKS).every(id => store.data.levels[id] === maxLevelOf(id))).toBe(true);
    const back = loadProgress(m[PROGRESS_KEY]);
    expect(Object.keys(BLOCKS).every(id => back.owned[id] === 10 && back.levels[id] === maxLevelOf(id))).toBe(true);
    expect(Object.keys(BLOCKS).some(id => !BLOCKS[id].shown)).toBe(true); // hidden ones exist and were included
  });
  it('own all hulls', () => {
    const { store } = fresh();
    ownAllHulls(store); ownAllHulls(store);
    expect([...store.data.ownedHulls].sort()).toEqual(Object.keys(HULL_BUILDERS).sort());
  });
  it('unlock all tiers opens 1-100 without Medals or clears; reset campaign undoes it and keeps credits', () => {
    const { store } = fresh();
    addCredits(store, 50);
    unlockAllTiers(store);
    expect(store.data.passedTiers.length).toBe(100);
    expect(isUnlocked(store.data, 100)).toBe(true);
    expect(store.data.medals).toBe(0);
    expect(store.data.clearedTiers).toEqual([]);
    addMedals(store, 10);
    expect(store.data.medals).toBe(10);
    resetCampaign(store);
    expect(store.data.passedTiers).toEqual([]);
    expect(store.data.medals).toBe(0);
    expect(isUnlocked(store.data, 2)).toBe(false);
    expect(store.data.credits).toBe(50);
  });
  it('reset everything returns progress AND saved circuits to the new-game state', () => {
    const { m, st } = mem();
    const store = new ProgressStore(st);
    const model = new BuilderModel(st, undefined, store);
    ownAllBlocks(store, 5, true); ownAllHulls(store); addCredits(store, 999);
    expect(model.place(0, 1, 'flat_plus').ok).toBe(true);
    expect(model.grid.cells.some(c => c.blockId)).toBe(true);
    resetEverything(store, model);
    expect(store.data).toEqual(defaultProgress());
    expect(model.hullId).toBe('dart');
    expect(model.grid.cells.some(c => c.blockId)).toBe(false);
    expect(JSON.parse(m[PROGRESS_KEY]).credits).toBe(0);
  });
  it('start wave N puts the run at wave N (time and tier follow); reset keeps it; god mode stops contact damage', () => {
    const w = new World({ startWave: 10, seed: 3 });
    const ptr = { x: 270, y: 760, active: false, type: 'mouse', seen: true } as const;
    w.update(1 / 60, ptr);
    expect(w.wave).toBe(10);
    expect(w.time).toBeCloseTo(9 * WAVE_TIME, 1);
    expect(w.tier).toBe(1 + Math.floor(9 * WAVE_TIME / 15));
    w.update(1.5, ptr);
    expect(w.mitosis.enemies.some(e => e.defId === 'mother')).toBe(true);
    w.reset(); w.update(1 / 60, ptr);
    expect(w.wave).toBe(10);
    const g = new World({ autoSpawn: false });
    g.god = true;
    g.spawnRock(g.shipX, g.shipY, 1e9);
    for (let i = 0; i < 30; i++) g.update(1 / 60, { x: g.shipX, y: g.shipY, active: false, type: 'mouse', seen: false });
    expect(g.hull).toBe(100);
    g.god = false;
    for (let i = 0; i < 30; i++) g.update(1 / 60, { x: g.shipX, y: g.shipY, active: false, type: 'mouse', seen: false });
    expect(g.hull).toBeLessThan(100);
  });
});
