import { describe, expect, it } from 'vitest';
import { BuilderModel } from '../src/builder/model';
import { buyAndSelectHull, fmtPulse, hullFacts, hullFactsLine, hullRowState } from '../src/builder/hullPicker';
import { pickerBlocks } from '../src/data/blocks';
import { HULL_ORDER, HULL_PRICES } from '../src/data/hulls';
import { blockLockReason } from '../src/econ/progress';
import { fmtBig, fmtStat } from '../src/ui/format';
import { sheetContent } from '../src/builder/paletteLogic';
import { HULL_INFO } from '../src/game/gridUtils';

/** Chunk 16e: placing rules behind the dimmed tiles, hull purchase from the builder's hull picker, stats-strip number format. */

describe('the builder cannot place unowned or locked blocks', () => {
  const model = () => new BuilderModel(null);
  const emptyCell = (m: BuilderModel) => m.grid.cells.find(c => c.type === 'empty' && !c.blockId)!;

  it('an unowned block: place is refused, nothing changes, and the tile content says so', () => {
    const m = model();
    const id = pickerBlocks().find(b => (m.store.data.owned[b.id] ?? 0) === 0 && !blockLockReason(m.store.data, b.id))!.id;
    const c = emptyCell(m);
    const res = m.place(c.x, c.y, id);
    expect(res.ok).toBe(false);
    expect(m.cellAt(c.x, c.y)!.blockId).toBeNull();
    const content = sheetContent({
      id, name: 'X', desc: '', owned: 0, available: m.available(id), level: 1, maxLevel: 3, credits: 0, copyPrice: 1, upgradePrice: 1, lock: null, showFree: true,
    });
    expect(content.place.enabled).toBe(false);
  });

  it('a locked block (a Frontier gate not reached): place is refused too', () => {
    const m = model();
    const lockedId = pickerBlocks().find(b => blockLockReason(m.store.data, b.id, m.store.frontierReach))?.id;
    expect(lockedId).toBeDefined();
    expect(m.available(lockedId!)).toBe(0);
    const c = emptyCell(m);
    expect(m.place(c.x, c.y, lockedId!).ok).toBe(false);
    expect(m.cellAt(c.x, c.y)!.blockId).toBeNull();
  });

  it('an owned block still places (the refusal is about ownership, not a blanket ban)', () => {
    const m = model();
    const id = Object.keys(m.store.data.owned).find(k => (m.store.data.owned[k] ?? 0) > 0 && m.available(k) > 0)!;
    const c = emptyCell(m);
    expect(m.place(c.x, c.y, id)).toEqual({ ok: true });
    expect(m.cellAt(c.x, c.y)!.blockId).toBe(id);
  });
});

describe('hull picker: facts', () => {
  it('slots, ejectors and pulse rate come from the hull grids and tables', () => {
    expect([hullFacts('dart').slots, hullFacts('dart').ejectors, hullFacts('dart').pulsesPerSecond]).toEqual([1, 1, 2]);
    expect([hullFacts('twin').slots, hullFacts('twin').ejectors, hullFacts('twin').pulsesPerSecond]).toEqual([2, 1, 2.5]);
    expect([hullFacts('prong').slots, hullFacts('prong').ejectors, hullFacts('prong').pulsesPerSecond]).toEqual([3, 2, 4]);
    expect(hullFacts('shuttle').pulsesPerSecond).toBe(5);
    for (const id of HULL_ORDER) expect(hullFacts(id).price).toBe(HULL_PRICES[id]);
  });

  it('the info line reads like the rest of the UI', () => {
    expect(hullFactsLine(hullFacts('twin'))).toBe('Slots 2 · Ejectors 1 · 2.5 pulses/s');
    expect(fmtPulse(4)).toBe('4/s');
    expect(() => hullFacts('nope')).toThrow();
  });

  it('every hull in the picker has facts', () => {
    for (const h of HULL_INFO) expect(hullFacts(h.id).name).toBe(h.name);
  });

  it('row states: the current hull, owned ones and unowned ones', () => {
    expect(hullRowState(['dart'], 'dart', 'dart')).toBe('current');
    expect(hullRowState(['dart', 'twin'], 'dart', 'twin')).toBe('owned');
    expect(hullRowState(['dart'], 'dart', 'prong')).toBe('unowned');
  });
});

describe('hull picker: buying a hull', () => {
  it('pays the old shop price, owns the hull and selects it', () => {
    const m = new BuilderModel(null);
    m.store.data.credits = 100;
    expect(m.hullId).toBe('dart');
    const r = buyAndSelectHull(m, 'twin');
    expect(r).toEqual({ ok: true, price: HULL_PRICES.twin });
    expect(m.store.data.credits).toBe(100 - HULL_PRICES.twin);
    expect(m.store.data.ownedHulls).toContain('twin');
    expect(m.hullId).toBe('twin');
  });

  it('not enough credits: nothing is paid, owned or switched', () => {
    const m = new BuilderModel(null);
    m.store.data.credits = HULL_PRICES.twin - 1;
    const before = JSON.stringify(m.store.data.ownedHulls);
    const r = buyAndSelectHull(m, 'twin');
    expect(r).toEqual({ ok: false, error: 'Not enough credits' });
    expect(m.store.data.credits).toBe(HULL_PRICES.twin - 1);
    expect(JSON.stringify(m.store.data.ownedHulls)).toBe(before);
    expect(m.hullId).toBe('dart');
  });

  it('exactly the price is enough and leaves 0', () => {
    const m = new BuilderModel(null);
    m.store.data.credits = HULL_PRICES.twin;
    expect(buyAndSelectHull(m, 'twin').ok).toBe(true);
    expect(m.store.data.credits).toBe(0);
  });

  it('an owned hull cannot be bought again (no second charge); an unknown id is refused', () => {
    const m = new BuilderModel(null);
    m.store.data.credits = 1000;
    expect(buyAndSelectHull(m, 'twin').ok).toBe(true);
    const credits = m.store.data.credits;
    expect(buyAndSelectHull(m, 'twin')).toEqual({ ok: false, error: 'Already owned' });
    expect(buyAndSelectHull(m, 'nope').ok).toBe(false);
    expect(m.store.data.credits).toBe(credits);
  });

  it('an unowned hull still cannot be switched to without buying it', () => {
    const m = new BuilderModel(null);
    expect(m.switchHull('prong').ok).toBe(false);
    expect(m.hullId).toBe('dart');
  });
});

describe('stats strip numbers (K / M / B)', () => {
  it('small values as before: whole numbers plain, one decimal otherwise', () => {
    expect([0, 3, 5.2, 12.5, 999].map(fmtStat)).toEqual(['0', '3', '5.2', '12.5', '999']);
    expect(fmtStat(0.004)).toBe('0');
    expect(fmtStat(1.5)).toBe('1.5');
  });

  it('thousands, millions, billions with their suffix', () => {
    expect(fmtStat(140_000)).toBe('140K');
    expect(fmtStat(1_000)).toBe('1K');
    expect(fmtStat(2_400_000)).toBe('2.4M');
    expect(fmtStat(7_250_000_000)).toBe('7.25B');
  });

  it('fmtBig keeps the zeros of whole hundreds (it used to print 140K as 14K and 100K as 1K)', () => {
    expect([100_000, 140_000, 250_000, 100_000_000].map(fmtBig)).toEqual(['100K', '140K', '250K', '100M']);
    expect([10_000, 1_500, 12_300].map(fmtBig)).toEqual(['10K', '1.5K', '12.3K']);
  });

  it('negative values keep their sign', () => {
    expect(fmtStat(-2_400_000)).toBe('-2.4M');
    expect(fmtStat(-12.5)).toBe('-12.5');
    expect(fmtStat(-0.001)).toBe('0');
  });

  it('never prints NaN or Infinity and agrees with fmtBig from 1000 up', () => {
    expect(fmtStat(NaN)).toBe('0');
    expect(fmtStat(Infinity)).toBe('0');
    for (const n of [1000, 54_321, 1_234_567, 9e9]) expect(fmtStat(n)).toBe(fmtBig(n));
  });
});
