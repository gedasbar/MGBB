import { describe, expect, it } from 'vitest';
import { applyWallRun, defaultProgress, loadProgress, noteBestCredits, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { sqKey } from '../src/frontier/world';
import { fmtBig } from '../src/ui/format';

const wall = (p: ReturnType<typeof defaultProgress>, tier: number, credits: number, destroyed = 1, passed = false) =>
  applyWallRun(p, { tier, destroyed, total: 5, time: 10, credits, kills: destroyed, passed });

describe('best earnings per campaign tier (chunk 19a)', () => {
  it('keeps the highest credits of one run per tier; crashed, passed and cleared runs all count', () => {
    const p = defaultProgress();
    expect(wall(p, 3, 120).newBestEarnings).toBe(true); // crashed run
    expect(p.wallBestCredits['3']).toBe(120);
    expect(wall(p, 3, 80).newBestEarnings).toBe(false); // lower: kept
    expect(p.wallBestCredits['3']).toBe(120);
    expect(wall(p, 3, 500, 2, true).newBestEarnings).toBe(true); // passed
    expect(wall(p, 3, 900.7, 5).newBestEarnings).toBe(true); // cleared, whole credits
    expect(p.wallBestCredits['3']).toBe(900);
    expect(wall(p, 4, 7).newBestEarnings).toBe(true); // another tier is separate
    expect(p.wallBestCredits['3']).toBe(900);
  });
  it('a run that earned nothing is never a record, and the value is absent until something was earned', () => {
    const p = defaultProgress();
    expect(wall(p, 2, 0).newBestEarnings).toBe(false);
    expect(wall(p, 2, 0.4).newBestEarnings).toBe(false);
    expect(p.wallBestCredits['2']).toBeUndefined();
    expect(noteBestCredits(p.wallBestCredits, '2', NaN)).toBe(false);
  });
  it('the store reports the flag and a tie is not a new best', () => {
    const store = new ProgressStore(null);
    expect(store.recordWallRun({ credits: 50, kills: 2, tier: 1, destroyed: 2, total: 5, time: 5 }).newBestEarnings).toBe(true);
    expect(store.recordWallRun({ credits: 50, kills: 2, tier: 1, destroyed: 2, total: 5, time: 5 }).newBestEarnings).toBe(false);
    expect(store.recordWallRun({ credits: 70, kills: 3 }).newBestEarnings).toBe(false); // a debug wall has no tier
  });
});

describe('best earnings per Frontier square (chunk 19a)', () => {
  it('wall runs and Free Fly encounters both keep a best per square; a locked square keeps none', () => {
    const store = new ProgressStore(null);
    const sq = { x: 1, y: 0 };
    const run = (credits: number, passed = false) => store.recordWallRun({ credits, kills: 1, square: sq, destroyed: 1, total: 9, time: 3, passed });
    // (1,0) may be a hole in the seeded world: find a playable neighbour of the origin.
    const open = [[1, 0], [0, 1], [-1, 0], [0, -1]].map(([x, y]) => ({ x, y })).find(q => { const r = store.recordFrontierFly({ ...q, credits: 0, kills: 0, outcome: 'failed' }); return r.ok; })!;
    sq.x = open.x; sq.y = open.y;
    expect(run(40).newBestEarnings).toBe(true);
    expect(store.data.squareBestCredits[sqKey(sq.x, sq.y)]).toBe(40);
    expect(run(10).newBestEarnings).toBe(false);
    expect(store.recordFrontierFly({ ...sq, credits: 300, kills: 5, outcome: 'cleared' }).newBestEarnings).toBe(true);
    expect(store.data.squareBestCredits[sqKey(sq.x, sq.y)]).toBe(300);
    const far = store.recordWallRun({ credits: 999, kills: 1, square: { x: 40, y: 40 }, destroyed: 1, total: 9, time: 3 });
    expect(far.newBestEarnings).toBe(false);
    expect(store.data.squareBestCredits[sqKey(40, 40)]).toBeUndefined();
  });
});

describe('save version 9 (chunk 19a)', () => {
  it('an older save loads with no best earnings and keeps everything else', () => {
    const old = { version: 8, credits: 777, owned: {}, levels: {}, ownedHulls: ['dart'], clearedTiers: [1, 2], passedTiers: [1, 2], wallBestTime: { '1': 9 } };
    const p = loadProgress(JSON.stringify(old));
    expect(PROGRESS_VERSION).toBe(12);
    expect(p.version).toBe(12);
    expect(p.wallBestCredits).toEqual({});
    expect(p.squareBestCredits).toEqual({});
    expect(p.credits).toBe(777);
    expect(p.wallBestTime['1']).toBe(9);
    expect(p.notice).toBeUndefined();
  });
  it('round-trips, and bad entries (out of range tier, bad key, negative, NaN, text) are dropped', () => {
    const p = defaultProgress();
    p.wallBestCredits['5'] = 1200;
    p.squareBestCredits[sqKey(2, -3)] = 3.4e9;
    const back = loadProgress(serializeProgress(p));
    expect(back.wallBestCredits).toEqual({ '5': 1200 });
    expect(back.squareBestCredits).toEqual({ '2,-3': 3.4e9 });
    const bad = loadProgress(JSON.stringify({ ...JSON.parse(serializeProgress(p)), wallBestCredits: { '0': 5, '101': 5, '7': -1, '8': 'x', '9': null, '10': 15.9 }, squareBestCredits: { nope: 5, '1,1': -2, '3,4': 8 } }));
    expect(bad.wallBestCredits).toEqual({ '10': 15 });
    expect(bad.squareBestCredits).toEqual({ '3,4': 8 });
  });
  it('shows as K / M / B', () => {
    expect(fmtBig(1200)).toBe('1.2K');
    expect(fmtBig(3_400_000)).toBe('3.4M');
  });
});
