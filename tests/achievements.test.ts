import { describe, it, expect } from 'vitest';
import { ACHIEVEMENTS, AchievementDef, FILL_MIN_CELLS } from '../src/data/achievements';
import { CHALLENGES, CHALLENGE_BY_ID, ChallengeDef } from '../src/data/challenges';
import { BLOCKS } from '../src/data/blocks';
import { HULL_ORDER } from '../src/data/hulls';
import { lateSlot } from '../src/data/lateTiers';
import { defaultProgress, loadProgress, Progress, ProgressStore, PROGRESS_VERSION, serializeProgress } from '../src/econ/progress';
import { goalOf, grantAchievements, metricTotal, metricValue, newlyEarned, noteCircuitRecords, noteRunRecords, progressOf, totalAchievementMedals } from '../src/achievements/rules';
import { checkBuild, challengeUnlocked, challengeVerdict, completeChallenge, firingEjectors, ruleLines } from '../src/challenges/rules';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { Grid } from '../src/engine/compiler';
import { getWorld, ring as ringOf, sector, sqKey } from '../src/frontier/world';
import { checkImportString, exportSaveString } from '../src/econ/saveTransfer';
import { WallWorld } from '../src/wall/wallWorld';
import { makeTestWall } from '../src/wall/level';
import { buildDartGrid } from '../src/game/gridUtils';
import { richModel } from './helpers';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const ordinary = () => Object.values(BLOCKS).filter(b => b.shown && b.category !== 'legendary').map(b => b.id);
const legendary = () => Object.values(BLOCKS).filter(b => b.shown && b.category === 'legendary').map(b => b.id);

/** A square on the given side at ring r that is not a hole (a hole is never stored, so it would not count). */
function squareOn(seed: number, side: 'N' | 'E' | 'S' | 'W', r: number): string {
  const w = getWorld(seed);
  for (let i = -r; i <= r; i++) {
    const [x, y] = side === 'N' ? [i, -r] : side === 'S' ? [i, r] : side === 'E' ? [r, i] : [-r, i];
    if (sector(x, y) === side && ringOf(x, y) === r && !w.isHole(x, y)) return sqKey(x, y);
  }
  throw new Error(`no open square on ${side} ring ${r}`);
}

/** Sets what a metric reads to `v` on a fresh save. */
function setMetric(p: Progress, metric: AchievementDef['metric'], v: number) {
  switch (metric) {
    case 'passedTier': p.passedTiers = range(v); break;
    case 'clearedTiers': case 'clearedClassic': p.clearedTiers = range(v); p.passedTiers = range(v); break;
    case 'clearedMaze': p.clearedTiers = v > 0 ? [106] : []; break;
    case 'ring': if (v > 0) p.frontier.sq[squareOn(p.frontier.seed, 'N', v)] = 2; break;
    case 'ringAllSides': if (v > 0) for (const s of ['N', 'E', 'S', 'W'] as const) p.frontier.sq[squareOn(p.frontier.seed, s, v)] = 2; break;
    case 'legendaryOwned': legendary().slice(0, v).forEach(id => { p.owned[id] = 1; }); break;
    case 'heroLevel': p.captains.heroes.cadet.level = v; break;
    case 'skillsSpent': p.skills = Array.from({ length: v }, (_, i) => `n${i}`); break;
    case 'bestShot': p.records.bestShot = v; break;
    case 'bestAvgDps': p.records.bestAvgDps = v; break;
    case 'circuitBlocks': p.records.maxCircuitBlocks = v; break;
    case 'hullFilled': p.records.hullFilled = v; break;
    case 'hullsOwned': p.ownedHulls = HULL_ORDER.slice(0, v) as unknown as string[]; break;
    case 'ordinaryOwned': ordinary().slice(0, v).forEach(id => { p.owned[id] = 1; }); break;
    case 'flyWave': p.bestWave = v; break;
  }
}

describe('achievement data', () => {
  it('has unique ids, real goals, a hint on every hidden one, and the cosmetic ids are unique across both lists', () => {
    expect(new Set(ACHIEVEMENTS.map(a => a.id)).size).toBe(ACHIEVEMENTS.length);
    for (const a of ACHIEVEMENTS) {
      expect(goalOf(a), a.id).toBeGreaterThan(0);
      if (a.hidden) expect(a.hint, a.id).toBeTruthy();
      if ('medals' in a.reward) expect(a.reward.medals, a.id).toBeGreaterThan(0);
    }
    const cos = [...ACHIEVEMENTS, ...CHALLENGES].flatMap(d => ('cosmetic' in d.reward ? [d.reward.cosmetic.id] : []));
    expect(new Set(cos).size).toBe(cos.length);
    expect(ACHIEVEMENTS.filter(a => a.hidden).map(a => a.id)).toEqual(['after_100']);
  });

  it("the 'all' goals are the real sizes: 19 hulls, every ordinary block, 12 legendary blocks", () => {
    expect(metricTotal('hullsOwned')).toBe(19);
    expect(metricTotal('legendaryOwned')).toBe(12);
    expect(metricTotal('ordinaryOwned')).toBe(ordinary().length);
    expect(ordinary().length).toBe(54);
  });

  it('pays 158 Medals in all (the number the design note and the report quote)', () => {
    expect(totalAchievementMedals()).toBe(158);
  });
});

describe('every achievement condition: one short of the goal is not enough, the goal is', () => {
  it.each(ACHIEVEMENTS.map(a => [a.id, a] as const))('%s', (_id, a) => {
    const goal = goalOf(a);
    const below = defaultProgress();
    setMetric(below, a.metric, goal - 1);
    expect(metricValue(below, a.metric)).toBe(goal - 1);
    expect(newlyEarned(below).map(x => x.id)).not.toContain(a.id);
    const at = defaultProgress();
    setMetric(at, a.metric, goal);
    expect(metricValue(at, a.metric)).toBe(goal);
    expect(newlyEarned(at).map(x => x.id)).toContain(a.id);
  });

  it('progress is value / goal, capped at the goal', () => {
    const p = defaultProgress();
    p.passedTiers = range(37);
    const a = ACHIEVEMENTS.find(x => x.id === 'pass_50')!;
    expect(progressOf(p, a)).toEqual({ value: 37, goal: 50, done: false });
    p.passedTiers = range(80);
    expect(progressOf(p, a)).toEqual({ value: 50, goal: 50, done: true });
  });

  it('ring 100 in ALL FOUR directions needs every side: three sides are not enough', () => {
    const p = defaultProgress();
    for (const s of ['N', 'E', 'S'] as const) p.frontier.sq[squareOn(p.frontier.seed, s, 100)] = 2;
    expect(metricValue(p, 'ringAllSides')).toBe(0);
    expect(newlyEarned(p).map(a => a.id)).toContain('ring_100');
    expect(newlyEarned(p).map(a => a.id)).not.toContain('ring_100_all');
  });

  it("the hidden 'after 100' counts tiers 1-100 only; a Maze tier counts only when it is a Maze", () => {
    const p = defaultProgress();
    p.clearedTiers = [...range(99), 101];
    expect(metricValue(p, 'clearedClassic')).toBe(99);
    p.clearedTiers = [103]; // Monolith, not a Maze
    expect(metricValue(p, 'clearedMaze')).toBe(0);
    expect(lateSlot(106)?.type).toBe('maze');
    p.clearedTiers = [106];
    expect(metricValue(p, 'clearedMaze')).toBe(1);
  });
});

describe('granting', () => {
  it('pays Medals and cosmetic ids once, however often the check runs', () => {
    const store = new ProgressStore(null, defaultProgress());
    store.data.passedTiers = range(25);
    store.commit();
    expect(store.data.achievements).toEqual(['pass_10', 'pass_25']);
    expect(store.data.medals).toBe(3);
    store.commit(); store.commit();
    expect(store.data.medals).toBe(3);
    const p = defaultProgress();
    const legend = ACHIEVEMENTS.find(a => a.id === 'legend_all')!;
    const g1 = grantAchievements(p, [legend]);
    const g2 = grantAchievements(p, [legend]);
    expect(g1.cosmetics.map(c => c.id)).toEqual(['skin_legend']);
    expect(g2).toEqual({ medals: 0, cosmetics: [] });
    expect(p.cosmetics).toEqual(['skin_legend']);
    expect(p.medals).toBe(0);
    expect(p.achievements).toEqual(['legend_all']);
    // a Medal achievement handed over twice (a stale list) is paid once
    const hero = ACHIEVEMENTS.find(a => a.id === 'hero_10')!;
    expect(grantAchievements(p, [hero, hero]).medals).toBe(2);
    expect(grantAchievements(p, [hero]).medals).toBe(0);
    expect(p.medals).toBe(2);
    expect(p.achievements).toEqual(['legend_all', 'hero_10']);
  });

  it('a new achievement during play is a toast (once), not a load summary', () => {
    const store = new ProgressStore(null, defaultProgress());
    expect(store.takeAchievementSummary()).toBeNull();
    store.data.passedTiers = range(10);
    store.commit();
    expect(store.hasAchievementToasts).toBe(true);
    expect(store.takeAchievementToasts().map(a => a.id)).toEqual(['pass_10']);
    expect(store.takeAchievementToasts()).toEqual([]);
    expect(store.takeAchievementSummary()).toBeNull();
  });

  it('an existing save is granted everything it has reached at once, as ONE summary and no toasts, and the summary is taken once', () => {
    const p = defaultProgress();
    p.passedTiers = range(30);
    p.clearedTiers = range(26);
    p.bestWave = 12;
    const store = new ProgressStore(null, p);
    const s = store.takeAchievementSummary();
    expect(s).not.toBeNull();
    const ids = ['pass_10', 'pass_25', 'clear_25', 'wave_10'];
    expect(store.data.achievements).toEqual(expect.arrayContaining(ids));
    expect(s!.count).toBe(store.data.achievements.length);
    expect(s!.names.length).toBe(s!.count);
    expect(s!.medals).toBe(1 + 2 + 2 + 1);
    expect(store.data.medals).toBe(s!.medals);
    expect(store.hasAchievementToasts).toBe(false);
    expect(store.takeAchievementSummary()).toBeNull();
  });

  it('a brand-new save has nothing to summarize', () => {
    expect(new ProgressStore(null, defaultProgress()).takeAchievementSummary()).toBeNull();
  });

  it('a hero level, hulls and skills are read from the save as they stand', () => {
    const p = defaultProgress();
    p.captains.heroes.gunner.level = 21;
    p.ownedHulls = ['dart', 'twin', 'prong', 'wisp', 'hornet'];
    expect(metricValue(p, 'heroLevel')).toBe(21);
    expect(metricValue(p, 'hullsOwned')).toBe(5);
  });
});

describe('records', () => {
  it('keep the best hit and best average DPS of a run, finite and whole; Infinity and nonsense never break them', () => {
    const p = defaultProgress();
    noteRunRecords(p.records, { bestShot: 250, totalDamage: 5000 }, 10);
    expect(p.records).toMatchObject({ bestShot: 250, bestAvgDps: 500 });
    noteRunRecords(p.records, { bestShot: 90, totalDamage: 100 }, 10); // worse: kept
    expect(p.records).toMatchObject({ bestShot: 250, bestAvgDps: 500 });
    noteRunRecords(p.records, { bestShot: Infinity, totalDamage: NaN }, 0);
    expect(Number.isFinite(p.records.bestShot)).toBe(true);
    expect(p.records.bestAvgDps).toBe(500);
    noteRunRecords(p.records, undefined, 5);
    expect(JSON.parse(JSON.stringify(p.records)).bestShot).toBe(p.records.bestShot); // survives JSON
  });

  it('flow through the store: a Free Fly run and a wall run', () => {
    const store = new ProgressStore(null, defaultProgress());
    store.recordRun({ credits: 1, kills: 1, time: 10, tier: 1, shots: { bestShot: 20_000, totalDamage: 20_000 } });
    expect(store.data.records).toMatchObject({ bestShot: 20_000, bestAvgDps: 2000 });
    expect(store.data.achievements).toEqual(expect.arrayContaining(['shot_100', 'shot_10k', 'dps_1k']));
    store.recordWallRun({ credits: 0, kills: 0, tier: 1, destroyed: 1, total: 2, time: 2, shots: { bestShot: 3_000_000, totalDamage: 6_000_000 } });
    expect(store.data.records).toMatchObject({ bestShot: 3_000_000, bestAvgDps: 3_000_000 });
    expect(store.data.achievements).toEqual(expect.arrayContaining(['shot_1m', 'dps_1m']));
  });

  it('circuit size: 50 blocks in one circuit; a hull counts as filled only with FILL_MIN_CELLS or more cells', () => {
    const p = defaultProgress();
    noteCircuitRecords(p.records, 50, 80);
    expect(p.records).toMatchObject({ maxCircuitBlocks: 50, hullFilled: 0 });
    noteCircuitRecords(p.records, 1, 1); // the Dart filled: too small to count
    noteCircuitRecords(p.records, FILL_MIN_CELLS - 1, FILL_MIN_CELLS - 1);
    expect(p.records.hullFilled).toBe(0);
    noteCircuitRecords(p.records, FILL_MIN_CELLS, FILL_MIN_CELLS);
    expect(p.records.hullFilled).toBe(1);
    noteCircuitRecords(p.records, 3, 80); // a smaller circuit later never lowers a record
    expect(p.records).toMatchObject({ maxCircuitBlocks: 50, hullFilled: 1 });
  });

  it('the builder reports its circuit: filling the Kestrel (12 cells) earns "Not an inch spare"', () => {
    const m = richModel(null, 'kestrel');
    const empty = m.grid.cells.filter(c => c.type === 'empty');
    expect(empty.length).toBe(FILL_MIN_CELLS);
    for (const c of empty) m.place(c.x, c.y, 'turn_l');
    expect(m.store.data.records.hullFilled).toBe(1);
    expect(m.store.data.achievements).toContain('fill_hull');
  });
});

describe('save version 13', () => {
  it('an older save loads with empty achievement fields and the version bumped', () => {
    expect(PROGRESS_VERSION).toBe(13);
    const old = loadProgress(JSON.stringify({ version: 12, credits: 77, passedTiers: [1, 2, 3], bestWave: 4 }));
    expect(old.version).toBe(13);
    expect(old).toMatchObject({ credits: 77, achievements: [], challengesDone: [], cosmetics: [] });
    expect(old.records).toEqual({ bestShot: 0, bestAvgDps: 0, maxCircuitBlocks: 0, hullFilled: 0 });
  });

  it('round-trips, drops unknown ids and repairs garbage', () => {
    const p = defaultProgress();
    p.achievements = ['pass_10'];
    p.challengesDone = ['c_dart'];
    p.cosmetics = ['skin_legend'];
    p.records.bestShot = 123;
    const back = loadProgress(serializeProgress(p));
    expect(back).toMatchObject({ achievements: ['pass_10'], challengesDone: ['c_dart'], cosmetics: ['skin_legend'] });
    expect(back.records.bestShot).toBe(123);
    const bad = loadProgress(JSON.stringify({ version: 13, achievements: ['pass_10', 'nope', 5, 'pass_10'], challengesDone: ['ghost', 'c_twin'], cosmetics: 'x', records: { bestShot: -5, hullFilled: 7, maxCircuitBlocks: 'a' } }));
    expect(bad.achievements).toEqual(['pass_10']);
    expect(bad.challengesDone).toEqual(['c_twin']);
    expect(bad.cosmetics).toEqual([]);
    expect(bad.records).toEqual({ bestShot: 0, bestAvgDps: 0, maxCircuitBlocks: 0, hullFilled: 0 });
  });

  it('Export / Import keeps it all', () => {
    const p = defaultProgress();
    p.achievements = ['pass_10', 'pass_25'];
    p.challengesDone = ['c_prong'];
    p.cosmetics = ['skin_zenith'];
    const str = exportSaveString(p, null);
    const r = checkImportString(str);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.progress).toMatchObject({ version: 13, achievements: ['pass_10', 'pass_25'], challengesDone: ['c_prong'], cosmetics: ['skin_zenith'] });
  });
});

// ---------------------------------------------------------------------------------------------------------------- challenges
const gridWith = (hull: string, blocks: Record<string, number> = {}): Grid => {
  const g = HULL_BUILDERS[hull]();
  const empty = g.cells.filter(c => c.type === 'empty');
  let i = 0;
  for (const [id, n] of Object.entries(blocks)) for (let k = 0; k < n; k++) empty[i++].blockId = id;
  return g;
};
const recipes = (n: number) => ({ recipes: Array.from({ length: n }, (_, i) => ({ x: i, y: 0 })) as never });
const ch = (id: string) => CHALLENGE_BY_ID[id];

describe('challenge data', () => {
  it('has unique ids, a real tier, real hulls and real blocks', () => {
    expect(new Set(CHALLENGES.map(c => c.id)).size).toBe(CHALLENGES.length);
    for (const c of CHALLENGES) {
      expect(c.tier, c.id).toBeGreaterThanOrEqual(1);
      expect(c.tier, c.id).toBeLessThanOrEqual(200);
      for (const h of c.rules.hulls ?? []) expect(HULL_ORDER as readonly string[], c.id).toContain(h);
      for (const b of [...(c.rules.banBlocks ?? []), ...(c.rules.needBlocks ?? [])]) expect(BLOCKS[b]?.shown, `${c.id} ${b}`).toBe(true);
    }
  });

  it('every one of the 19 hulls has a challenge, and they spread from tier 10 to 150', () => {
    for (const h of HULL_ORDER) expect(CHALLENGES.some(c => c.rules.hulls?.includes(h)), h).toBe(true);
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(20);
    expect(Math.min(...CHALLENGES.map(c => c.tier))).toBe(10);
    expect(Math.max(...CHALLENGES.map(c => c.tier))).toBe(150);
  });

  it('the tier-specific ones sit on the right tier: Maze, Strong Wind, Fortress', () => {
    expect(lateSlot(ch('c_maze_nofire').tier)?.type).toBe('maze');
    expect(lateSlot(ch('c_wind').tier)?.type).toBe('strong_wind');
    expect(lateSlot(ch('c_fortress').tier)?.type).toBe('fortress');
  });

  it('every rule line list starts with the goal and tier, and every rule type adds a line', () => {
    expect(ruleLines(ch('c_prong'))).toEqual(['Clear tier 30', 'Hull: Prong']);
    const all: ChallengeDef = { id: 'x', name: 'x', tier: 9, goal: 'pass', reward: { medals: 1 }, rules: { hulls: ['dart'], banBlocks: ['piercing'], banCategory: ['legendary'], needBlocks: ['homing'], maxBlocks: 3, maxEjectors: 1, noFire: true, timeLimit: 20 } };
    expect(ruleLines(all).length).toBe(9);
  });
});

describe('challenge build rules: allowed and blocked', () => {
  it('hull: the wrong hull is blocked with a plain message (and says when it is not owned); the right one passes', () => {
    const c = ch('c_prong');
    expect(checkBuild(c.rules, gridWith('twin'), recipes(1))).toMatch(/needs the Prong hull.*ship button/);
    expect(checkBuild(c.rules, gridWith('twin'), recipes(1), false)).toMatch(/do not own yet/);
    expect(checkBuild(c.rules, gridWith('prong'), recipes(1))).toBeNull();
  });

  it('banned blocks: the named block is refused, other blocks are fine', () => {
    const c = ch('c_no_aoe');
    expect(checkBuild(c.rules, gridWith('shuttle', { aoe_circle: 1 }), recipes(1))).toMatch(/AoE - Circle/);
    expect(checkBuild(c.rules, gridWith('shuttle', { aoe_rect: 1 }), recipes(1))).toMatch(/AoE - Rectangle/);
    expect(checkBuild(c.rules, gridWith('shuttle', { piercing: 2, flat_plus: 1 }), recipes(1))).toBeNull();
  });

  it('banned category: any legendary block is refused', () => {
    const c = ch('c_no_legend');
    expect(checkBuild(c.rules, gridWith('shuttle', { mirror: 1 }), recipes(1))).toMatch(/Mirror/);
    expect(checkBuild(c.rules, gridWith('shuttle', { flat_plus: 3 }), recipes(1))).toBeNull();
  });

  it('needed blocks: refused until the block is on the circuit', () => {
    const c = ch('c_halberd');
    expect(checkBuild(c.rules, gridWith('halberd'), recipes(1))).toMatch(/needs Piercing/);
    expect(checkBuild(c.rules, gridWith('halberd', { piercing: 1 }), recipes(1))).toBeNull();
  });

  it('at most N blocks: N is fine, N + 1 is refused with the count', () => {
    const c = ch('c_12_blocks');
    expect(checkBuild(c.rules, gridWith('shuttle', { turn_l: 12 }), recipes(1))).toBeNull();
    expect(checkBuild(c.rules, gridWith('shuttle', { turn_l: 13 }), recipes(1))).toMatch(/At most 12 blocks.*you have 13/);
  });

  it('at most N ejectors fire: counts distinct ejectors, not recipes, and not ones no signal reaches', () => {
    const c = ch('c_one_ejector');
    expect(checkBuild(c.rules, gridWith('prong'), recipes(2))).toMatch(/At most 1 ejector may fire: 2 do/);
    // two recipes from the same ejector (a +1 Projectile lane) are ONE ejector
    expect(firingEjectors({ recipes: [{ x: 3, y: 2 }, { x: 3, y: 2 }] as never })).toBe(1);
    expect(checkBuild(c.rules, gridWith('prong'), { recipes: [{ x: 3, y: 2 }, { x: 3, y: 2 }] as never })).toBeNull();
  });

  it('a circuit that reaches no ejector is refused (no shots to fly with)', () => {
    expect(checkBuild({}, gridWith('prong'), recipes(0))).toMatch(/doesn't reach an ejector/);
  });

  it('the first broken rule is the one reported, and a challenge with no build rule always passes', () => {
    expect(checkBuild({ hulls: ['dart'], banBlocks: ['piercing'] }, gridWith('twin', { piercing: 1 }), recipes(1))).toMatch(/hull/);
    expect(checkBuild({ timeLimit: 30 }, gridWith('twin', { piercing: 1 }), recipes(1))).toBeNull();
  });
});

describe('challenge in-run rules and verdict', () => {
  it('the verdict: clear needs a clear, pass takes either, a crash never counts', () => {
    const clear = ch('c_prong');
    const pass = ch('c_fast_40');
    expect(challengeVerdict(clear, { outcome: 'cleared', time: 99 }).ok).toBe(true);
    expect(challengeVerdict(clear, { outcome: 'passed', time: 99 }).ok).toBe(false);
    expect(challengeVerdict(clear, { outcome: 'crashed', time: 1 }).reason).toMatch(/crashed/);
    expect(challengeVerdict(pass, { outcome: 'passed', time: 29 }).ok).toBe(true);
    expect(challengeVerdict(pass, { outcome: 'crashed', time: 5 }).ok).toBe(false);
  });

  it('time limit: exactly at the limit is met, a second later is not', () => {
    const c = ch('c_fast_25');
    expect(challengeVerdict(c, { outcome: 'cleared', time: 35 }).ok).toBe(true);
    const slow = challengeVerdict(c, { outcome: 'cleared', time: 35.4 });
    expect(slow.ok).toBe(false);
    expect(slow.reason).toMatch(/Too slow.*36 s.*35 s/);
  });

  it('no firing: the gun is silent in a challenge run, and fires as usual without the rule', () => {
    const level = makeTestWall({ tier: 1, rows: 6, gaps: 0 });
    const quiet = new WallWorld(level, { grid: buildDartGrid(), rules: { noFire: true } });
    const loud = new WallWorld(level, { grid: buildDartGrid() });
    for (let i = 0; i < 120; i++) { quiet.update(1 / 60, null); loud.update(1 / 60, null); }
    expect(loud.pool.count).toBeGreaterThan(0);
    expect(quiet.pool.count).toBe(0);
    quiet.fire();
    expect(quiet.pool.count).toBe(0);
  });

  it('time limit in the world: overTime turns true once the clock passes the limit (and only then)', () => {
    const level = makeTestWall({ tier: 1, rows: 6, gaps: 0 });
    const w = new WallWorld(level, { grid: buildDartGrid(), rules: { timeLimit: 1 } });
    expect(w.overTime).toBe(false);
    for (let i = 0; i < 30; i++) w.update(1 / 60, null);
    expect(w.overTime).toBe(false);
    for (let i = 0; i < 40; i++) w.update(1 / 60, null);
    expect(w.overTime).toBe(true);
    expect(new WallWorld(level, { grid: buildDartGrid() }).overTime).toBe(false);
  });
});

describe('challenge unlock and rewards', () => {
  it('a challenge opens when its tier has been passed', () => {
    const p = defaultProgress();
    expect(challengeUnlocked(p, ch('c_dart'))).toBe(false);
    p.passedTiers = [10];
    expect(challengeUnlocked(p, ch('c_dart'))).toBe(true);
    expect(challengeUnlocked(p, ch('c_twin'))).toBe(false);
  });

  it('the reward is paid once: Medals the first time, nothing the second; a cosmetic id is stored once', () => {
    const p = defaultProgress();
    expect(completeChallenge(p, 'c_prong')).toEqual({ paid: true, medals: 2, cosmetic: null });
    expect(completeChallenge(p, 'c_prong')).toEqual({ paid: false, medals: 0, cosmetic: null });
    expect(p.medals).toBe(2);
    expect(p.challengesDone).toEqual(['c_prong']);
    const z = completeChallenge(p, 'c_zenith');
    expect(z.cosmetic?.id).toBe('skin_zenith');
    expect(completeChallenge(p, 'c_zenith').paid).toBe(false);
    expect(p.cosmetics).toEqual(['skin_zenith']);
    expect(completeChallenge(p, 'ghost')).toEqual({ paid: false, medals: 0, cosmetic: null });
    expect(p.medals).toBe(2);
  });

  it('through the store: paid once, saved, and the unlocked list survives a reload', () => {
    const store = new ProgressStore(null, defaultProgress());
    expect(store.completeChallenge('c_dart').paid).toBe(true);
    expect(store.completeChallenge('c_dart').paid).toBe(false);
    expect(store.data.medals).toBe(1);
    const back = loadProgress(serializeProgress(store.data));
    expect(back.challengesDone).toEqual(['c_dart']);
  });
});
