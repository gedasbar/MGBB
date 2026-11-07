import { describe, it, expect } from 'vitest';
import { dayKey, daysBetween, fmtCountdown, isDayKey, nextMidnight, seedOfDay, shiftDay } from '../src/daily/clock';
import {
  defaultDaily, ensureDay, freeFlyEvents, historyView, noteDailyRun, noteEvents, questCtx, rerollQuest, rollQuests, runSeedOf, sanitizeDaily, twistOf, wallEvents,
} from '../src/daily/rules';
import { DAILY_ALL_BONUS, DAILY_QUEST_COUNT, QUESTS, QUEST_BY_KIND, QuestCtx, QuestKind, nice } from '../src/data/dailyQuests';
import { HISTORY_DAYS, RUN_TIERS, TWISTS, TWIST_BY_ID } from '../src/data/dailyRun';
import { PROGRESS_VERSION, ProgressStore, defaultProgress, loadProgress, sanitizeProgress, serializeProgress } from '../src/econ/progress';
import { World } from '../src/game/world';
import { PointerState } from '../src/input';
import { WaveDirector, planWave, waveKindOf } from '../src/game/waves';
import { bossAt, isBossWave } from '../src/data/bosses';
import { fogAlpha } from '../src/daily/fog';
import { flyRunResult } from '../src/game/runEnd';
import { MAP_MODES } from '../src/map/constants';
import { modeStatus } from '../src/map/modes';
import { WAVE_TIME } from '../src/data/waves';

const FRESH: QuestCtx = { highestPassed: 0, frontierOpen: false, lateOpen: false, bestWave: 0, hulls: ['dart'], avgRunDamage: 0 };
const MID: QuestCtx = { highestPassed: 30, frontierOpen: true, lateOpen: false, bestWave: 12, hulls: ['dart', 'twin', 'prong'], avgRunDamage: 400 };
const LATE: QuestCtx = { highestPassed: 120, frontierOpen: true, lateOpen: true, bestWave: 40, hulls: ['dart', 'twin', 'prong', 'wisp'], avgRunDamage: 90_000 };
const DAY = '2026-11-07';
const DT = 1 / 60;
const idle = (): PointerState => ({ x: 0, y: 0, active: false, type: 'mouse', seen: false });

/** A player who has passed 40 tiers, has flown to wave 12 and owns three hulls. */
function midPlayer() {
  const p = defaultProgress();
  p.passedTiers = Array.from({ length: 40 }, (_, i) => i + 1);
  p.bestWave = 12;
  p.ownedHulls = ['dart', 'twin', 'prong'];
  return p;
}

describe('the day: local calendar, seeded by the date', () => {
  it('the day key is the LOCAL date and turns over at local midnight', () => {
    const lastSecond = new Date(2026, 10, 7, 23, 59, 59).getTime();
    const midnight = new Date(2026, 10, 8, 0, 0, 0).getTime();
    expect(dayKey(lastSecond)).toBe('2026-11-07');
    expect(dayKey(midnight)).toBe('2026-11-08');
    expect(nextMidnight(lastSecond)).toBe(midnight);
    expect(nextMidnight(new Date(2026, 10, 7, 0, 0, 0).getTime())).toBe(midnight);
    // Month and year ends.
    expect(dayKey(nextMidnight(new Date(2026, 11, 31, 12).getTime()))).toBe('2027-01-01');
    expect(shiftDay('2026-03-01', 1)).toBe('2026-02-28');
    expect(daysBetween('2026-11-07', '2026-11-10')).toBe(3);
  });

  it('isDayKey accepts real dates only', () => {
    expect(isDayKey('2026-11-07')).toBe(true);
    for (const bad of ['2026-13-01', '2026-02-30', '2026-1-1', '', 5, null, '2026-11-07T00:00']) expect(isDayKey(bad)).toBe(false);
  });

  it('the countdown reads hours and minutes, then minutes and seconds', () => {
    expect(fmtCountdown(5 * 3600_000 + 12 * 60_000 + 59_000)).toBe('5h 12m');
    expect(fmtCountdown(12 * 60_000 + 3000)).toBe('12m 03s');
    expect(fmtCountdown(-5)).toBe('0m 00s');
  });

  it('the same day gives the same quests, twist and seed all day; the next day gives different ones', () => {
    const morning = dayKey(new Date(2026, 10, 7, 0, 5).getTime());
    const night = dayKey(new Date(2026, 10, 7, 23, 55).getTime());
    expect(rollQuests(morning, MID)).toEqual(rollQuests(night, MID));
    expect(twistOf(morning)).toBe(twistOf(night));
    expect(runSeedOf(morning)).toBe(runSeedOf(night));
    // Another day: the seed, the quests and the twist all move on.
    const next = shiftDay(DAY, -1);
    expect(runSeedOf(next)).not.toBe(runSeedOf(DAY));
    expect(seedOfDay(next)).not.toBe(seedOfDay(DAY));
    expect(rollQuests(next, MID)).not.toEqual(rollQuests(DAY, MID));
    expect(twistOf(next).id).not.toBe(twistOf(DAY).id);
  });

  it('the twist never repeats within a round of six days and never twice in a row, over a year', () => {
    let day = '2026-01-01';
    let prev = '';
    const seen: string[] = [];
    for (let i = 0; i < 366; i++) {
      const id = twistOf(day).id;
      expect(id).not.toBe(prev);
      prev = id;
      seen.push(id);
      day = shiftDay(day, -1);
    }
    // Every twist comes up, about equally often.
    for (const t of TWISTS) {
      const n = seen.filter(s => s === t.id).length;
      expect(n).toBeGreaterThan(366 / TWISTS.length - 4);
      expect(n).toBeLessThan(366 / TWISTS.length + 4);
    }
  });
});

describe('the quests', () => {
  it('three different kinds a day', () => {
    for (let i = 0; i < 40; i++) {
      const q = rollQuests(shiftDay(DAY, -i), MID);
      expect(q).toHaveLength(DAILY_QUEST_COUNT);
      expect(new Set(q.map(x => x.kind)).size).toBe(DAILY_QUEST_COUNT);
      for (const x of q) { expect(x.n).toBeGreaterThanOrEqual(1); expect(x.progress).toBe(0); expect(x.done).toBe(false); expect(x.medals + x.cores).toBeGreaterThan(0); }
    }
  });

  it('only content the player has unlocked is ever drawn', () => {
    const kindsOver = (ctx: QuestCtx) => { const k = new Set<QuestKind>(); for (let i = 0; i < 300; i++) for (const q of rollQuests(shiftDay(DAY, -i), ctx)) k.add(q.kind); return k; };
    const fresh = kindsOver(FRESH);
    for (const locked of ['squares', 'late_tiers', 'boss', 'wave', 'no_hit', 'hull_clear', 'tiers'] as const) expect(fresh.has(locked), `fresh ${locked}`).toBe(false);
    // A fresh player still gets three quests (the always-open ones).
    expect(rollQuests(DAY, FRESH)).toHaveLength(3);
    const mid = kindsOver(MID);
    expect(mid.has('squares')).toBe(true); // tier 25 passed: Frontier is open
    expect(mid.has('late_tiers')).toBe(false); // tiers 101+ are not open
    expect(mid.has('boss')).toBe(true); // wave 12 was reached: a boss (wave 10) has been met
    const late = kindsOver(LATE);
    expect(late.has('late_tiers')).toBe(true);
    // Every quest drawn must be one whose own `available` says yes.
    for (const ctx of [FRESH, MID, LATE]) for (let i = 0; i < 100; i++) for (const q of rollQuests(shiftDay(DAY, -i), ctx)) expect(QUEST_BY_KIND[q.kind].available(ctx)).toBe(true);
  });

  it('a hull quest names a hull the player can fly', () => {
    let seen = 0;
    for (let i = 0; i < 300; i++) for (const q of rollQuests(shiftDay(DAY, -i), MID)) if (q.kind === 'hull_clear') { seen++; expect(MID.hulls).toContain(q.hull); }
    expect(seen).toBeGreaterThan(5);
  });

  it('goals grow with progress', () => {
    const goal = (kind: QuestKind, ctx: QuestCtx) => QUEST_BY_KIND[kind].goal(ctx);
    for (const kind of ['blocks', 'rocks', 'crystals', 'wave', 'damage'] as const) {
      expect(goal(kind, LATE)).toBeGreaterThan(goal(kind, FRESH));
      expect(goal(kind, LATE)).toBeGreaterThanOrEqual(goal(kind, MID));
    }
    expect(goal('blocks', MID)).toBe(nice(40 + 30 * 6));
    for (const q of QUESTS) expect(Number.isInteger(q.goal(LATE)) && q.goal(LATE) >= 1).toBe(true);
    expect([nice(137), nice(4), nice(1234), nice(12)]).toEqual([140, 4, 1000, 10]);
  });

  it('questCtx reads the save: tier 25 opens the Frontier, all of 1-100 cleared opens the late tiers, custom hulls are left out', () => {
    const p = midPlayer();
    p.ownedHulls = ['dart', 'custom1', 'twin'];
    expect(questCtx(p)).toMatchObject({ highestPassed: 40, frontierOpen: true, lateOpen: false, bestWave: 12, hulls: ['dart', 'twin'] });
    p.clearedTiers = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(questCtx(p).lateOpen).toBe(true);
    p.passedTiers = [1, 2];
    expect(questCtx(p).frontierOpen).toBe(false);
  });
});

describe('progress, rewards and the reroll', () => {
  function withQuests(kinds: [QuestKind, number][]) {
    const p = midPlayer();
    ensureDay(p, DAY);
    p.daily.quests = kinds.map(([kind, n]) => ({ kind, n, progress: 0, done: false, medals: 1, cores: 0, ...(kind === 'hull_clear' ? { hull: 'twin' } : {}) }));
    return p;
  }

  it('events add up, a finished quest pays at once and only once', () => {
    const p = withQuests([['blocks', 100], ['rocks', 50], ['crystals', 10]]);
    p.daily.quests[1].cores = 7; p.daily.quests[1].medals = 0;
    const m0 = p.medals, c0 = p.cores;
    let r = noteEvents(p, DAY, [{ kind: 'blocks', n: 60 }, { kind: 'rocks', n: 20 }]);
    expect(r.notes).toEqual([]);
    expect(p.daily.quests.map(q => q.progress)).toEqual([60, 20, 0]);
    r = noteEvents(p, DAY, [{ kind: 'blocks', n: 60 }]);
    expect(p.daily.quests[0]).toMatchObject({ progress: 100, done: true });
    expect(p.medals).toBe(m0 + 1);
    expect(r.notes).toHaveLength(1);
    // Done is done: more of the same pays nothing and the counter stays at the goal.
    r = noteEvents(p, DAY, [{ kind: 'blocks', n: 500 }]);
    expect(p.medals).toBe(m0 + 1);
    expect(p.daily.quests[0].progress).toBe(100);
    expect(r.notes).toEqual([]);
    noteEvents(p, DAY, [{ kind: 'rocks', n: 30 }]);
    expect(p.cores).toBe(c0 + 7);
    noteEvents(p, DAY, [{ kind: 'rocks', n: 30 }]);
    expect(p.cores).toBe(c0 + 7);
  });

  it('wave quests keep the highest wave reached in one run, not a sum; a hull quest needs its own hull', () => {
    const p = withQuests([['wave', 10], ['no_hit', 6], ['hull_clear', 1]]);
    noteEvents(p, DAY, [{ kind: 'wave', wave: 4 }, { kind: 'hull_clear', hull: 'dart' }]);
    noteEvents(p, DAY, [{ kind: 'wave', wave: 4 }]);
    expect(p.daily.quests[0].progress).toBe(4);
    expect(p.daily.quests[2].progress).toBe(0);
    noteEvents(p, DAY, [{ kind: 'wave', wave: 11 }, { kind: 'no_hit', wave: 7 }, { kind: 'hull_clear', hull: 'twin' }]);
    expect(p.daily.quests.map(q => q.done)).toEqual([true, true, true]);
  });

  it('the bonus for all three is paid once, on the day the third is done', () => {
    const p = withQuests([['blocks', 1], ['rocks', 1], ['crystals', 1]]);
    const m0 = p.medals;
    noteEvents(p, DAY, [{ kind: 'blocks', n: 1 }, { kind: 'rocks', n: 1 }]);
    expect(p.daily.bonusPaid).toBe(false);
    const r = noteEvents(p, DAY, [{ kind: 'crystals', n: 1 }]);
    expect(p.daily.bonusPaid).toBe(true);
    expect(p.medals).toBe(m0 + 3 + (DAILY_ALL_BONUS.medals ?? 0));
    expect(r.notes.some(n => n.startsWith('All daily quests done'))).toBe(true);
    noteEvents(p, DAY, [{ kind: 'crystals', n: 5 }]);
    expect(p.medals).toBe(m0 + 3 + (DAILY_ALL_BONUS.medals ?? 0));
  });

  it('one reroll a day: a different kind, not on a finished quest, then refused', () => {
    const p = midPlayer();
    ensureDay(p, DAY);
    const before = p.daily.quests.map(q => q.kind);
    p.daily.quests[0].done = true; p.daily.quests[0].progress = p.daily.quests[0].n;
    expect(rerollQuest(p, DAY, 0)).toEqual({ ok: false, error: 'This quest is done' });
    expect(p.daily.rerolled).toBe(false);
    expect(rerollQuest(p, DAY, 9).ok).toBe(false);
    const r = rerollQuest(p, DAY, 1);
    expect(r.ok).toBe(true);
    const after = p.daily.quests.map(q => q.kind);
    expect(after[1]).not.toBe(before[1]);
    expect(before.includes(after[1])).toBe(false); // not a kind that is already on the card
    expect(after[0]).toBe(before[0]); expect(after[2]).toBe(before[2]);
    expect(p.daily.quests[1].progress).toBe(0);
    expect(rerollQuest(p, DAY, 2)).toEqual({ ok: false, error: 'Reroll already used today' });
    // The reroll is the same all day (a function of the date), and a new day has a new reroll.
    const q = JSON.stringify(p.daily.quests);
    expect(JSON.stringify(p.daily.quests)).toBe(q);
    ensureDay(p, shiftDay(DAY, -1));
    expect(p.daily.rerolled).toBe(false);
  });

  it('a run feeds the quests through the same events the store books', () => {
    expect(freeFlyEvents({ kills: 12, wave: 5, shots: { totalDamage: 900 }, crystals: { collected: 3 }, bosses: [{}], noHit: true })).toEqual([
      { kind: 'rocks', n: 12 }, { kind: 'damage', n: 900 }, { kind: 'crystals', n: 3 }, { kind: 'boss', n: 1 }, { kind: 'wave', wave: 5 }, { kind: 'no_hit', wave: 5 },
    ]);
    // The daily run has twists: it never counts as "reach wave N".
    expect(freeFlyEvents({ daily: true, kills: 1, wave: 9 }).some(e => e.kind === 'wave' || e.kind === 'no_hit')).toBe(false);
    expect(wallEvents({ kills: 50, tier: 120, passed: true, cleared: true, hull: 'twin' })).toEqual([
      { kind: 'blocks', n: 50 }, { kind: 'damage', n: 0 }, { kind: 'tiers', n: 1 }, { kind: 'late_tiers', n: 1 }, { kind: 'hull_clear', hull: 'twin' },
    ]);
    expect(wallEvents({ kills: 5, tier: 4, passed: false, cleared: false, hull: 'twin' }).map(e => e.kind)).toEqual(['blocks', 'damage']);
    expect(wallEvents({ kills: 5, square: true, passed: true, cleared: false }).map(e => e.kind)).toEqual(['blocks', 'damage', 'squares']);
  });
});

describe('the store: runs reach the quests', () => {
  it('a passed campaign tier, a cleared tier with the quest hull, blocks and damage all count; a crash only counts blocks', () => {
    const store = new ProgressStore(null, midPlayer());
    store.refreshDaily();
    store.data.daily.quests = [
      { kind: 'tiers', n: 2, progress: 0, done: false, medals: 1, cores: 0 },
      { kind: 'hull_clear', n: 1, progress: 0, done: false, medals: 1, cores: 0, hull: 'twin' },
      { kind: 'blocks', n: 100, progress: 0, done: false, medals: 0, cores: 5 },
    ];
    store.recordWallRun({ credits: 1, kills: 10, hull: 'twin', tier: 3, destroyed: 10, total: 40, passed: false });
    expect(store.data.daily.quests.map(q => q.progress)).toEqual([0, 0, 10]);
    store.recordWallRun({ credits: 1, kills: 40, hull: 'dart', tier: 3, destroyed: 40, total: 40 });
    expect(store.data.daily.quests.map(q => q.progress)).toEqual([1, 0, 50]);
    const m0 = store.data.medals;
    store.recordWallRun({ credits: 1, kills: 40, hull: 'twin', tier: 3, destroyed: 40, total: 40 });
    expect(store.data.daily.quests.map(q => q.done)).toEqual([true, true, false]);
    expect(store.data.medals).toBe(m0 + 2);
    expect(store.takeDailyNotes()).toHaveLength(2);
    expect(store.takeDailyNotes()).toEqual([]);
  });

  it('a Free Fly run counts rocks, crystals, damage, bosses, the wave and a no-hit run', () => {
    const store = new ProgressStore(null, midPlayer());
    store.refreshDaily();
    store.data.daily.quests = [
      { kind: 'rocks', n: 30, progress: 0, done: false, medals: 0, cores: 4 },
      { kind: 'no_hit', n: 6, progress: 0, done: false, medals: 1, cores: 0 },
      { kind: 'crystals', n: 5, progress: 0, done: false, medals: 0, cores: 3 },
    ];
    const c0 = store.data.cores;
    store.recordRun({ credits: 5, kills: 31, time: 100, tier: 3, wave: 3, crystals: { collected: 5, dropped: 6 } });
    expect(store.data.daily.quests.map(q => q.done)).toEqual([true, false, true]);
    expect(store.data.cores).toBe(c0 + 7);
    store.recordRun({ credits: 5, kills: 3, time: 100, tier: 3, wave: 8, noHit: true });
    expect(store.data.daily.quests[1]).toMatchObject({ progress: 6, done: true });
  });

  it('the daily run books its best wave and reward tiers but never touches the Free Fly records or Medal waves', () => {
    const store = new ProgressStore(null, midPlayer());
    const before = { bestWave: store.data.bestWave, bestTime: store.data.bestTime, bestTier: store.data.bestTier, runs: store.data.runs };
    store.recordRun({ credits: 5, kills: 3, time: 900, tier: 9, wave: 31, daily: true });
    expect(store.data.bestWave).toBe(before.bestWave);
    expect(store.data.bestTime).toBe(before.bestTime);
    expect(store.data.bestTier).toBe(before.bestTier);
    expect(store.data.runs).toBe(before.runs + 1);
    expect(store.data.daily.runBest).toBe(31);
    expect(store.takeDailyRunMarks()?.paid.map(t => t.wave)).toEqual([5, 10, 15, 20, 30]);
    expect(store.takeDailyRunMarks()).toBeNull();
  });

  it('noHit travels from the world to the run result', () => {
    const w = new World({});
    w.god = false;
    expect(w.everHurt).toBe(false);
    expect(flyRunResult(w).noHit).toBe(true);
    w.hull -= 1; // not by itself a "hit": the flag is set by update() when the hull fell during the frame
    w.update(DT, idle());
    expect(w.everHurt).toBe(false);
    w.spawnSpecies('mitotic_rock', w.shipX, w.shipY);
    w.invuln = 0;
    for (let i = 0; i < 60 && !w.everHurt; i++) w.update(DT, idle());
    expect(w.everHurt).toBe(true);
    expect(flyRunResult(w).noHit).toBeUndefined();
  });
});

describe('the day rolls over at midnight', () => {
  it('a new day draws new quests, clears the run state and keeps yesterday\'s best in the history', () => {
    const p = midPlayer();
    ensureDay(p, DAY);
    noteDailyRun(p, DAY, 12);
    p.daily.quests[0].progress = 3;
    expect(ensureDay(p, DAY)).toBe(false); // the same day changes nothing
    const next = shiftDay(DAY, -1);
    expect(ensureDay(p, next)).toBe(true);
    expect(p.daily.day).toBe(next);
    expect(p.daily.quests.every(q => q.progress === 0 && !q.done)).toBe(true);
    expect(p.daily).toMatchObject({ rerolled: false, bonusPaid: false, runBest: 0, runPaid: [] });
    expect(p.daily.history).toEqual([{ day: DAY, best: 12 }]);
    expect(historyView(p.daily, next).at(-2)).toEqual({ day: DAY, best: 12 });
  });

  it('a gap of days is kept as gaps; days older than the window fall out; a clock set back just draws again', () => {
    const p = midPlayer();
    ensureDay(p, '2026-11-01');
    noteDailyRun(p, '2026-11-01', 7);
    ensureDay(p, '2026-11-03');
    noteDailyRun(p, '2026-11-03', 9);
    ensureDay(p, '2026-11-07');
    const v = historyView(p.daily, '2026-11-07');
    expect(v).toHaveLength(HISTORY_DAYS);
    expect(v.map(h => h.best)).toEqual([7, 0, 9, 0, 0, 0, 0]);
    expect(v[0].day).toBe('2026-11-01');
    ensureDay(p, '2026-11-09'); // 2026-11-01 is now 8 days back: out of the window
    expect(p.daily.history.map(h => h.day)).toEqual(['2026-11-03']);
    expect(ensureDay(p, '2026-11-02')).toBe(true); // the device clock moved back: a plain redraw, nothing crashes
    expect(p.daily.day).toBe('2026-11-02');
    expect(p.daily.history.every(h => h.day < '2026-11-02')).toBe(true);
  });

  it('the store follows the game clock: the debug "Next day" offset moves the day', async () => {
    const { setDayOffset, getDayOffset } = await import('../src/daily/clock');
    const store = new ProgressStore(null, midPlayer());
    const d0 = store.refreshDaily().day;
    expect(d0).toBe(store.today);
    setDayOffset(1);
    expect(store.today).not.toBe(d0);
    expect(store.refreshDaily().day).toBe(store.today);
    setDayOffset(0);
    expect(getDayOffset()).toBe(0);
    expect(store.today).toBe(d0);
  });
});

describe('the daily run: best wave, reward tiers once a day, history', () => {
  it('each reward tier is paid once per day, the best wave is kept', () => {
    const p = midPlayer();
    let m = noteDailyRun(p, DAY, 3);
    expect(m).toMatchObject({ best: 3, newBest: true, paid: [], cores: 0, medals: 0 });
    const c0 = p.cores, md0 = p.medals;
    m = noteDailyRun(p, DAY, 11);
    expect(m.paid.map(t => t.wave)).toEqual([5, 10]);
    expect(p.cores).toBe(c0 + 6 + 12);
    m = noteDailyRun(p, DAY, 11);
    expect(m).toMatchObject({ newBest: false, best: 11, paid: [], cores: 0 });
    m = noteDailyRun(p, DAY, 9); // a worse run changes nothing
    expect(m).toMatchObject({ best: 11, newBest: false, paid: [] });
    m = noteDailyRun(p, DAY, 33);
    expect(m.paid.map(t => t.wave)).toEqual([15, 20, 30]);
    const top = RUN_TIERS[RUN_TIERS.length - 1];
    expect(top.medals).toBeGreaterThan(0);
    expect(p.medals).toBe(md0 + (top.medals ?? 0));
    expect(p.daily.runPaid).toEqual([5, 10, 15, 20, 30]);
    // The next day pays them again.
    expect(noteDailyRun(p, shiftDay(DAY, -1), 5).paid.map(t => t.wave)).toEqual([5]);
  });

  it('twists change the world: Glass Cannon, Boss Rush, Fast Waves, Swarm Day, Gunner Day; Fog is a drawing rule', () => {
    const plain = new World({});
    const gc = new World({ twist: TWIST_BY_ID.glass_cannon.effects });
    expect(gc.maxHull).toBe(plain.maxHull * 0.25);
    expect(gc.projSys.bonus.damageMul).toBe(plain.projSys.bonus.damageMul * 2);
    const fast = new World({ twist: TWIST_BY_ID.fast_waves.effects });
    expect((fast.director as WaveDirector).waveTime).toBeCloseTo(WAVE_TIME * 0.7, 9);
    // Boss Rush: wave 5 is a boss wave (the Hive Mother), 10 the Bastion.
    expect(isBossWave(5)).toBe(false);
    expect(isBossWave(5, 5)).toBe(true);
    expect([5, 10, 15, 20].map(w => bossAt(w, 5)!.def.id)).toEqual(['hive', 'bastion', 'queen', 'colossus']);
    const br = new World({ startWave: 5, seed: 3, twist: TWIST_BY_ID.boss_rush.effects });
    br.god = true;
    for (let i = 0; i < 10; i++) br.update(DT, idle());
    expect(br.boss?.def.id).toBe('hive');
    const noRush = new World({ startWave: 5, seed: 3 });
    for (let i = 0; i < 10; i++) noRush.update(DT, idle());
    expect(noRush.boss).toBeNull();
    // Swarm Day: every third wave is a swarm, so wave 6 is full of Darters and pebbles; a normal wave 6 has none of the swarm look.
    expect(waveKindOf(6, TWIST_BY_ID.swarm_day.effects)).toBe('swarm');
    expect(waveKindOf(6, {})).toBeNull();
    const swarm = planWave(7, 6, TWIST_BY_ID.swarm_day.effects);
    expect(swarm.filter(s => s.defId === 'darter').length).toBeGreaterThan(0);
    expect(swarm.length).toBeGreaterThan(planWave(7, 6).length);
    // Gunner Day: gunners from wave 3 (a normal game has none before wave 8).
    const g = planWave(7, 3, TWIST_BY_ID.gunner_day.effects);
    expect(g.some(s => s.defId === 'gunner')).toBe(true);
    expect(planWave(7, 3).some(s => s.defId === 'gunner')).toBe(false);
    // The same seed and rules give the same wave; no rules is exactly the old game.
    expect(planWave(7, 6, TWIST_BY_ID.swarm_day.effects)).toEqual(swarm);
    expect(planWave(7, 12, {})).toEqual(planWave(7, 12));
    // Fog: fully visible near the ship, gone at the radius, nothing for no fog.
    const r = TWIST_BY_ID.fog.effects.fogRadius!;
    expect([fogAlpha(0, r), fogAlpha(r * 0.65, r), fogAlpha(r, r), fogAlpha(r * 2, r), fogAlpha(500, 0)]).toEqual([1, 1, 0, 0, 1]);
    expect(fogAlpha(r * 0.825, r)).toBeCloseTo(0.5, 5);
  });
});

describe('the save: version 19', () => {
  it('an older save loads with no daily state and everything else kept; the first day then draws', () => {
    expect(PROGRESS_VERSION).toBe(19);
    const old = { ...defaultProgress(), version: 18, credits: 321, bestWave: 14, medals: 6 } as Record<string, unknown>;
    delete old.daily;
    const p = loadProgress(JSON.stringify(old));
    expect(p.version).toBe(19);
    expect(p.daily).toEqual(defaultDaily());
    expect(p.credits).toBe(321); expect(p.bestWave).toBe(14); expect(p.medals).toBe(6);
    const store = new ProgressStore(null, p);
    expect(store.refreshDaily().quests).toHaveLength(3);
  });

  it('a daily state round-trips, and a version 18 save that happens to carry a daily field ignores it', () => {
    const p = midPlayer();
    ensureDay(p, DAY);
    noteDailyRun(p, DAY, 12);
    ensureDay(p, shiftDay(DAY, -1));
    noteDailyRun(p, shiftDay(DAY, -1), 8);
    noteEvents(p, shiftDay(DAY, -1), [{ kind: 'blocks', n: 7 }]);
    const back = loadProgress(serializeProgress(p));
    expect(back.daily).toEqual(p.daily);
    const v18 = { ...JSON.parse(serializeProgress(p)), version: 18 };
    expect(sanitizeProgress(v18).daily).toEqual(defaultDaily());
  });

  it('junk is repaired: bad day, unknown kinds, duplicates, impossible numbers, history from the future', () => {
    expect(sanitizeDaily(null)).toEqual(defaultDaily());
    expect(sanitizeDaily({ day: 'tomorrow', quests: [{ kind: 'blocks', n: 5 }] })).toEqual(defaultDaily());
    const d = sanitizeDaily({
      day: DAY, rerolled: 'yes', bonusPaid: true, runBest: -3, runPaid: [5, 5, 7, 'x'],
      quests: [
        { kind: 'blocks', n: 10, progress: 99, done: true, medals: 1, cores: 2 },
        { kind: 'blocks', n: 10, progress: 1 },
        { kind: 'nonsense', n: 10 },
        { kind: 'rocks', n: 0 },
        { kind: 'hull_clear', n: 1 },
        { kind: 'wave', n: 5, progress: 2, done: true, medals: 'many' },
        { kind: 'damage', n: 5 }, { kind: 'crystals', n: 5 },
      ],
      history: [{ day: shiftDay(DAY, -2), best: 4 }, { day: shiftDay(DAY, 3), best: 6 }, { day: shiftDay(DAY, 3), best: 9 }, { day: '2026-02-30', best: 3 }, { day: shiftDay(DAY, 2), best: 0 }],
    });
    expect(d.quests.map(q => q.kind)).toEqual(['blocks', 'wave', 'damage']); // unknown, duplicate, bad n, hull quest without a hull dropped; at most three
    expect(d.quests[0]).toMatchObject({ progress: 10, done: true });
    expect(d.quests[1]).toMatchObject({ progress: 2, done: false, medals: 0 }); // "done" without the progress is not believed
    expect(d.rerolled).toBe(false);
    expect(d.bonusPaid).toBe(false); // not all three done
    expect(d.runBest).toBe(0);
    expect(d.runPaid).toEqual([5]);
    expect(d.history).toEqual([{ day: shiftDay(DAY, 3), best: 6 }]); // the future day, the duplicate, the bad date and the zero are dropped
  });

  it('Export / Import keeps the daily state', async () => {
    const { exportSaveString, checkImportString } = await import('../src/econ/saveTransfer');
    const p = midPlayer();
    ensureDay(p, DAY);
    noteDailyRun(p, DAY, 17);
    const text = exportSaveString(p, null);
    const r: any = checkImportString(text);
    expect(r.ok).toBe(true);
    expect(r.progress.daily).toEqual(p.daily);
  });
});

describe('the Map carousel has the DAILY card', () => {
  it('it is the fourth mode, after Free Fly, and its card line shows quests done and the twist', () => {
    expect(MAP_MODES).toEqual(['campaign', 'frontier', 'freefly', 'daily']);
    const p = midPlayer();
    const now = new Date(2026, 10, 7, 12).getTime();
    const twist = twistOf(DAY).name;
    expect(modeStatus('daily', p, now)).toEqual({ line: `3 new quests · ${twist}`, locked: false, unlock: '' });
    ensureDay(p, DAY);
    p.daily.quests[0].done = true;
    expect(modeStatus('daily', p, now).line).toBe(`1 / 3 quests · ${twist}`);
  });
});
