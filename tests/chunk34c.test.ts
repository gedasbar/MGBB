import { describe, expect, it } from 'vitest';
import { AMOUNT_GAP, AMOUNT_ICON_MIN, amountIconSize, amountLayout, costRowLayout } from '../src/ui/amountLayout';
import { defaultStats, favouriteHull, fmtSince, noteMedalsEarned, noteRunStats, sanitizeStats, sinceLine, statSections } from '../src/stats/stats';
import { defaultProgress, loadProgress, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { hullBuyLabel } from '../src/builder/hullPickerLogic';
import { sheetContent } from '../src/builder/paletteLogic';

describe('amount layout (chunk 34c)', () => {
  it('the icon and the number are centred on the same line, whatever the size and the alignment', () => {
    for (const fontSize of [12, 14, 16, 20, 28, 80]) {
      for (const align of ['left', 'center', 'right'] as const) {
        const l = amountLayout({ fontSize, textW: 40, align });
        expect(l.iconTop + l.iconSize / 2).toBeCloseTo(l.textCentreY, 6);
        expect(l.iconCentreY).toBeCloseTo(l.textCentreY, 6);
      }
    }
  });

  it('the icon size comes from the text size (0.8 x, at least 10 px)', () => {
    expect(amountIconSize(16)).toBe(13);
    expect(amountIconSize(80)).toBe(64);
    expect(amountIconSize(8)).toBe(AMOUNT_ICON_MIN);
    expect(amountLayout({ fontSize: 20, textW: 10 }).iconSize).toBe(amountIconSize(20));
  });

  it('left, centre and right put the origin at the left end, the middle and the right end of the row', () => {
    const left = amountLayout({ fontSize: 16, textW: 50, align: 'left' });
    const centre = amountLayout({ fontSize: 16, textW: 50, align: 'center' });
    const right = amountLayout({ fontSize: 16, textW: 50, align: 'right' });
    expect(left.iconX).toBe(0);
    expect(left.textX).toBe(13 + AMOUNT_GAP);
    expect(left.width).toBe(13 + AMOUNT_GAP + 50);
    expect(centre.iconX).toBeCloseTo(-left.width / 2, 6);
    expect(right.textX + 50).toBeCloseTo(0, 6);
  });

  it('a prefix sits first, then the icon, then the number', () => {
    const l = amountLayout({ fontSize: 16, textW: 30, prefixW: 70, align: 'left' });
    expect(l.prefixX).toBe(0);
    expect(l.iconX).toBe(70 + AMOUNT_GAP);
    expect(l.textX).toBe(70 + AMOUNT_GAP + 13 + AMOUNT_GAP);
  });

  it('a two-currency price is centred on its origin with the "+" between the amounts', () => {
    const r = costRowLayout([60, 40], 10);
    expect(r.xs).toHaveLength(2);
    expect(r.plusXs).toHaveLength(1);
    expect(r.xs[0]).toBeCloseTo(-r.width / 2, 6);
    expect(r.xs[1] + 40).toBeCloseTo(r.width / 2, 6);
    expect(r.plusXs[0]).toBeGreaterThan(r.xs[0] + 60);
    expect(r.plusXs[0] + 10).toBeLessThan(r.xs[1]);
    expect(costRowLayout([30], 0).xs[0]).toBeCloseTo(-15, 6);
  });

  it('buttons hand the view their price as amounts (credits, credits + Medals)', () => {
    const hull = hullBuyLabel({ price: 1200 } as never, 5000);
    expect(hull.costs).toEqual([{ kind: 'credits', text: '1.2K' }]);
    const base = { name: 'Legend', desc: '', level: 1, maxLevel: 1, owned: 0, available: 0, credits: 1e6, upgradePrice: 0, copyPrice: 8000 };
    const legendary = sheetContent({ ...base, medalPrice: 15, medals: 20 } as never);
    expect(legendary.buy?.costs).toEqual([{ kind: 'credits', text: '8K' }, { kind: 'medals', text: '15' }]);
    const plain = sheetContent({ ...base } as never);
    expect(plain.buy?.costs).toEqual([{ kind: 'credits', text: '8K' }]);
  });
});

describe('stats counters (chunk 34c)', () => {
  it('a run adds to its mode, the blocks or rocks, the damage, the currencies and the hull', () => {
    const s = defaultStats(1000);
    noteRunStats(s, { mode: 'campaign', blocks: 40, damage: 900.7, credits: 120, hull: 'dart' });
    noteRunStats(s, { mode: 'freefly', rocks: 25, damage: 100, credits: 30, cores: 7, hull: 'dart', bosses: [{ id: 'hive' }] });
    noteRunStats(s, { mode: 'frontier', blocks: 5, credits: 9, hull: 'twin' });
    noteRunStats(s, { mode: 'frontier', rocks: 3, credits: 4, cores: 2, hull: 'twin' });
    expect(s).toMatchObject({ runsCampaign: 1, runsFreeFly: 1, runsFrontier: 2, blocks: 45, rocks: 28, damage: 1000, credits: 163, cores: 9, bossKills: { hive: 1 }, hullRuns: { dart: 2, twin: 2 } });
  });

  it('the damage of a run that dealt Infinity or NaN cannot poison the total', () => {
    const s = defaultStats(1);
    noteRunStats(s, { mode: 'freefly', damage: Infinity, credits: NaN });
    noteRunStats(s, { mode: 'freefly', damage: NaN });
    expect(Number.isFinite(s.damage) && Number.isFinite(s.credits)).toBe(true);
    expect(s.damage).toBe(0);
  });

  it('the favourite hull is the one flown most; none before the first run', () => {
    const s = defaultStats(1);
    expect(favouriteHull(s)).toBeNull();
    noteRunStats(s, { mode: 'campaign', hull: 'dart' });
    noteRunStats(s, { mode: 'campaign', hull: 'twin' });
    noteRunStats(s, { mode: 'campaign', hull: 'twin' });
    expect(favouriteHull(s)).toEqual({ id: 'twin', runs: 2 });
  });

  it('Medals count when they rise and never when they are spent', () => {
    const store = new ProgressStore(null, { ...defaultProgress(), medals: 5 });
    expect(store.data.stats.medals).toBe(0); // the 5 in hand at load were not counted
    store.data.medals += 3; store.commit();
    expect(store.data.stats.medals).toBe(3);
    store.data.medals -= 6; store.commit();
    expect(store.data.stats.medals).toBe(3);
    store.data.medals += 1; store.commit();
    expect(store.data.stats.medals).toBe(4);
    const s = defaultStats(1); noteMedalsEarned(s, 2); noteMedalsEarned(s, -5);
    expect(s.medals).toBe(2);
  });

  it('the store counts a Free Fly run, a wall run and a Frontier Free Fly run by their mode, with the hull', () => {
    const store = new ProgressStore(null, defaultProgress());
    store.recordRun({ credits: 50, cores: 4, kills: 12, time: 60, tier: 1, wave: 3, hull: 'dart', shots: { bestShot: 9, totalDamage: 300 }, bosses: [{ id: 'bastion', noHit: false }] });
    store.recordWallRun({ credits: 70, kills: 33, tier: 1, destroyed: 33, total: 60, time: 40, passed: false, hull: 'twin', shots: { bestShot: 5, totalDamage: 150 } });
    store.recordFrontierFly({ x: 1, y: 0, credits: 20, cores: 3, kills: 8, outcome: 'failed' as never, hull: 'twin', shots: { bestShot: 2, totalDamage: 40 }, time: 30 });
    const s = store.data.stats;
    expect(s).toMatchObject({ runsFreeFly: 1, runsCampaign: 1, runsFrontier: 1, rocks: 20, blocks: 33, damage: 490, credits: 140, cores: 7, bossKills: { bastion: 1 }, hullRuns: { dart: 1, twin: 2 } });
  });
});

describe('stats in the save (version 18)', () => {
  it('the save is version 18 and the counters survive a save and load', () => {
    expect(PROGRESS_VERSION).toBe(19);
    const store = new ProgressStore(null, defaultProgress());
    store.recordRun({ credits: 10, kills: 4, time: 5, tier: 1, wave: 1, hull: 'dart' });
    const back = loadProgress(serializeProgress(store.data));
    expect(back.stats).toEqual(store.data.stats);
  });

  it('a version 17 save migrates: everything it had is kept, the counters start at 0 and say since when', () => {
    const old = { ...defaultProgress(), version: 17, bestWave: 12, medals: 9, passedTiers: [1, 2, 3, 4], clearedTiers: [1, 2, 3], records: { bestShot: 777, bestAvgDps: 55, maxCircuitBlocks: 3, hullFilled: 0, bosses: ['hive'], bossNoHit: 0 }, timePlayed: 7200 } as Record<string, unknown>;
    delete old.stats;
    const before = Date.now();
    const p = loadProgress(JSON.stringify(old));
    expect(p.version).toBe(19);
    expect(p.stats).toMatchObject({ runsCampaign: 0, runsFrontier: 0, runsFreeFly: 0, blocks: 0, rocks: 0, damage: 0, credits: 0, cores: 0, medals: 0, bossKills: {}, hullRuns: {} });
    expect(p.stats.since).toBeGreaterThanOrEqual(before);
    expect(p.stats.since).toBeLessThanOrEqual(Date.now());
    expect(p.bestWave).toBe(12); expect(p.medals).toBe(9);
    // what the older data holds shows at once
    const rows = Object.fromEntries(statSections(p).flatMap(sec => sec.rows).map(r => [r.label, r.value]));
    expect(rows['Best shot']).toBe('777');
    expect(rows['Best average DPS in a run']).toBe('55');
    expect(rows['Best Free Fly wave']).toBe('12');
    expect(rows['Highest tier passed']).toBe('4');
    expect(rows['Highest tier cleared']).toBe('3');
    expect(rows['Blocks destroyed']).toBe('0');
    expect(typeof rows['Time played']).toBe('string');
  });

  it('a version 18 save keeps its counters and its start date; junk is cleaned', () => {
    const p = defaultProgress();
    p.stats = { ...defaultStats(555), blocks: 10, bossKills: { hive: 2 }, hullRuns: { dart: 4 } };
    const back = loadProgress(serializeProgress(p));
    expect(back.stats.since).toBe(555);
    expect(back.stats.blocks).toBe(10);
    const dirty = sanitizeStats({ since: 'x', blocks: -4, rocks: 'many', damage: Infinity, bossKills: { hive: 3, nobody: 9 }, hullRuns: { dart: 2, '': 5, ok: -1 } }, 777);
    expect(dirty).toMatchObject({ since: 777, blocks: 0, rocks: 0, damage: 0, bossKills: { hive: 3 }, hullRuns: { dart: 2 } });
  });

  it('the page marks the counted rows and says since when', () => {
    const p = defaultProgress();
    p.stats = { ...defaultStats(new Date(2026, 10, 7, 12).getTime()), credits: 1234, cores: 5, medals: 2 };
    const rows = statSections(p).flatMap(sec => sec.rows);
    expect(rows.find(r => r.label === 'Credits')?.value).toEqual({ kind: 'credits', text: '1.23K' });
    expect(rows.find(r => r.label === 'Cores')?.value).toEqual({ kind: 'cores', text: '5' });
    expect(rows.find(r => r.label === 'Medals')?.value).toEqual({ kind: 'medals', text: '2' });
    expect(rows.filter(r => r.label.endsWith('killed')).length).toBeGreaterThanOrEqual(4);
    expect(rows.find(r => r.label === 'Best shot')?.counted).toBeFalsy();
    expect(rows.find(r => r.label === 'Blocks destroyed')?.counted).toBe(true);
    expect(fmtSince(new Date(2026, 10, 7, 12).getTime())).toBe('7 Nov 2026');
    expect(sinceLine(p.stats)).toContain('7 Nov 2026');
  });
});
