import { describe, expect, it } from 'vitest';
import { CONFIG, SHIP_MAX_SPEED, TOUCH_DRAG_GAIN } from '../src/config';
import { ShipSteer, stepToward, segDistSq } from '../src/engine/steer';
import { WallWorld } from '../src/wall/wallWorld';
import { World } from '../src/game/world';
import { CELL, VIEW_H, VIEW_W } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { buildStarterGrid } from '../src/game/starter';
import { WallCamera, clampShipX, pushShipX, edgePushSpeed } from '../src/wall/camera';
import { InputManager } from '../src/input';
import { planSteps, SIM_MAX_STEP } from '../src/game/timestep';
import { estimateRefreshHz } from '../src/ui/refreshRate';
import { fmtPlayTime, PLAYTIME_FLUSH_SECONDS, PlayTimeTracker } from '../src/econ/playTime';
import { defaultProgress, loadProgress, ProgressStore, serializeProgress, unlockSummary, UNLOCK_NAMES_SHOWN } from '../src/econ/progress';
import { sqKey } from '../src/frontier/world';
import { addCaptainKills, isTierUnlocked, nextTierGoal, sanitizeCaptains, tiersReached } from '../src/captains/state';
import { LEGACY_TIER_KILLS, TIER_KILLS } from '../src/captains/data';
import { TIER_LOCKS } from '../src/data/tierLocks';
import { skillPointsFor } from '../src/skills/rules';
import { jump } from './helpers/jump';

const DT = 1 / 60;
const plain: BlockDef = { hp: 1000, armor: 0, shield: 0 };

/** One row of 21 columns with blocks where `has(c)` says so. */
function oneRow(has: (c: number) => boolean): LevelDef {
  return { tier: 1, cols: 21, rows: 1, cells: Array.from({ length: 21 }, (_, c) => (has(c) ? plain : null)), approachSpeed: 0 };
}
function wallWorldOf(l: LevelDef): WallWorld {
  const w = new WallWorld(l, { grid: buildStarterGrid() });
  w.autoFire = false;
  w.setWallOffset(400);
  return w;
}
const rowY = 400 - CELL / 2; // the middle of the only row
const colX = (c: number) => c * CELL + CELL / 2;

describe('ship speed cap (24a)', () => {
  it('crossing the screen width takes about 0.2 s, and no step moves the ship further than SHIP_MAX_SPEED x dt', () => {
    expect(CONFIG.VIEW.W / SHIP_MAX_SPEED).toBeCloseTo(0.2, 6);
    const w = wallWorldOf(oneRow(c => c === 0));
    jump(w, { x: colX(10), y: rowY });
    let x = w.shipX, y = w.shipY;
    for (let i = 0; i < 12; i++) {
      w.update(DT, { x: colX(10) + 500, y: 100 }); // far away: every step is a full capped step
      expect(Math.hypot(w.shipX - x, w.shipY - y)).toBeLessThanOrEqual(SHIP_MAX_SPEED * DT + 1e-9);
      if (i < 3) expect(Math.hypot(w.shipX - x, w.shipY - y)).toBeCloseTo(SHIP_MAX_SPEED * DT, 6);
      x = w.shipX; y = w.shipY;
    }
  });

  it('stepToward lands exactly on a near target and caps a far one', () => {
    expect(stepToward(0, 0, 3, 4, DT)).toEqual({ dx: 3, dy: 4 });
    const s = stepToward(0, 0, 3000, 4000, DT);
    expect(Math.hypot(s.dx, s.dy)).toBeCloseTo(SHIP_MAX_SPEED * DT, 6);
    expect(s.dx / s.dy).toBeCloseTo(0.75, 6);
  });

  it('Free Fly: the same cap', () => {
    const w = new World({ autoSpawn: false });
    const x0 = w.shipX, y0 = w.shipY;
    w.update(DT, { x: 10, y: 10, active: true, type: 'mouse', seen: true });
    expect(Math.hypot(w.shipX - x0, w.shipY - y0)).toBeCloseTo(SHIP_MAX_SPEED * DT, 4);
  });
});

describe('swept ship collision (24a)', () => {
  it('a ship asked to jump across a block crashes; one asked to go the same way through a gap does not', () => {
    const blocked = wallWorldOf(oneRow(c => c === 10));
    jump(blocked, { x: colX(8), y: rowY });
    expect(blocked.state).toBe('playing');
    // 0.1 s: the cap allows 270 px, the target is 216 px away and on the far side of the block in column 10.
    blocked.update(0.1, { x: colX(12), y: rowY });
    expect(blocked.shipX).toBeCloseTo(colX(12), 6);
    expect(blocked.shipHitsBlock()).toBe(false); // where it ended is clear: a point test would say safe
    expect(blocked.state).toBe('crashed');

    const open = wallWorldOf(oneRow(c => c === 0));
    jump(open, { x: colX(8), y: rowY });
    open.update(0.1, { x: colX(12), y: rowY });
    expect(open.state).toBe('playing');
  });

  it('a block scrolling down through the ship in one big step crashes it too (swept in the wall\'s own frame)', () => {
    const w = new WallWorld(oneRow(c => c === 10), { grid: buildStarterGrid() });
    w.autoFire = false;
    w.setWallOffset(100);
    jump(w, { x: colX(10), y: 400 }); // well below the row
    expect(w.state).toBe('playing');
    w.level.approachSpeed = 2000;
    w.update(0.25, { x: colX(10), y: 400 }); // the row travels 500 px down, over the ship, within one step
    expect(w.state).toBe('crashed');
  });

  it('Free Fly: the path flown touches a rock on the way and the hull takes the hit', () => {
    const w = new World({ autoSpawn: false });
    w.invuln = 0;
    w.teleportShip(100, 500);
    const rock = w.mitosis.spawn('mitotic_rock', 1, 1000, 250, 500, 10)!;
    rock.vx = 0; rock.vy = 0;
    const before = w.hull;
    w.update(0.1, { x: 400, y: 500, active: true, type: 'mouse', seen: true }); // 270 px of flight: ends at x 370, past the rock at 250
    expect(Math.abs(w.shipX - rock.x)).toBeGreaterThan(rock.radius + w.hitR + 20); // the end point alone is clear of it
    expect(w.hull).toBeLessThan(before);
  });

  it('segDistSq: the closest approach of a segment to a point', () => {
    expect(segDistSq(0, 0, 10, 0, 5, 3)).toBe(9);
    expect(segDistSq(0, 0, 10, 0, 15, 0)).toBe(25);
    expect(segDistSq(0, 0, 0, 0, 3, 4)).toBe(25);
  });
});

describe('touch: relative drag (24a)', () => {
  const bounds = { minX: 13, maxX: 527, minY: 24, maxY: 936 };
  const finger = (x: number, y: number, active = true) => ({ x, y, active, type: 'touch', seen: true });

  it('a finger anywhere moves the ship by the finger\'s movement (x TOUCH_DRAG_GAIN), never to the finger', () => {
    const s = new ShipSteer(270, 768, bounds, 'relative');
    s.update(finger(100, 100)); // the press: nothing moves
    expect([s.x, s.y]).toEqual([270, 768]);
    s.update(finger(130, 90));
    expect(s.x).toBeCloseTo(270 + 30 * TOUCH_DRAG_GAIN, 9);
    expect(s.y).toBeCloseTo(768 - 10 * TOUCH_DRAG_GAIN, 9);
    s.update(finger(120, 90, false)); // lifted: stays
    expect([s.x, s.y]).toEqual([300, 758]);
    s.update(finger(500, 800)); // a new press far away: no jump either
    expect([s.x, s.y]).toEqual([300, 758]);
    s.update(finger(480, 810));
    expect([s.x, s.y]).toEqual([280, 768]);
  });

  it('the gain scales the movement, and the target stays inside the bounds', () => {
    const s = new ShipSteer(270, 768, bounds, 'relative', 2);
    s.update(finger(0, 0));
    s.update(finger(10, 0));
    expect(s.x).toBe(290);
    s.update(finger(500, 0));
    expect(s.x).toBe(bounds.maxX);
    s.update(finger(490, 0)); // back 10 px x 2: it leaves the side at once (no hidden overshoot to work off)
    expect(s.x).toBe(bounds.maxX - 20);
  });

  it('mouse follows the cursor; direct touch puts the target above the finger', () => {
    const m = new ShipSteer(270, 768, bounds, 'relative');
    m.update({ x: 200, y: 300, active: false, type: 'mouse', seen: true });
    expect([m.x, m.y]).toEqual([200, 300]);
    const d = new ShipSteer(270, 768, bounds, 'direct');
    d.update(finger(200, 300));
    expect([d.x, d.y]).toEqual([200, 260]);
    d.update(finger(200, 300, false));
    expect([d.x, d.y]).toEqual([200, 260]);
    const unseen = new ShipSteer(270, 768, bounds);
    unseen.update({ x: 1, y: 1, active: true, type: 'touch', seen: false });
    expect([unseen.x, unseen.y]).toEqual([270, 768]);
  });
});

describe('edge push follows the ship (24a)', () => {
  it('a ship held against the left side keeps the camera scrolling at the edge speed with no input at all', () => {
    const cam = new WallCamera(0, 0, 21 * CELL);
    const steer = new ShipSteer(270, 768, { minX: clampShipX(0), maxX: clampShipX(VIEW_W), minY: 24, maxY: 936 });
    steer.update({ x: 270, y: 700, active: true, type: 'touch', seen: true });
    steer.update({ x: 0, y: 700, active: true, type: 'touch', seen: true }); // dragged 270 px left: against the side
    expect(steer.x).toBe(clampShipX(0));
    steer.update({ x: 0, y: 700, active: false, type: 'touch', seen: true }); // finger lifted
    const x0 = cam.x;
    for (let i = 0; i < 90; i++) cam.update(DT, pushShipX(true, true, steer.x)); // the ship stays at the side: only its place is read
    expect(cam.speed).toBeCloseTo(edgePushSpeed(clampShipX(0)), 0); // the full edge speed, to the left
    expect(cam.speed).toBeLessThan(-400);
    expect(cam.travel).toBeLessThan(-300);
    expect(cam.x).not.toBe(x0);
  });

  it('no push before the run is under way or after it ended', () => {
    expect(pushShipX(true, false, 5)).toBeNull();
    expect(pushShipX(false, true, 5)).toBeNull();
    expect(pushShipX(true, true, 5)).toBe(clampShipX(5));
  });
});

/** A just-enough browser: the input manager only needs addEventListener, a rect and a style. */
function fakeBrowser() {
  const handlers: Record<string, ((e: any) => void)[]> = {};
  const on = (type: string, f: (e: any) => void) => { (handlers[type] ??= []).push(f); };
  const g = globalThis as any;
  const prev = g.window;
  g.window = { addEventListener: on };
  const el: any = { style: {}, addEventListener: on, getBoundingClientRect: () => ({ left: 0, top: 0, width: 540, height: 960 }) };
  const input = new InputManager(el);
  const fire = (type: string, e: any) => { for (const f of handlers[type] ?? []) f(e); };
  return { input, fire, restore: () => { g.window = prev; } };
}

describe('UI taps are consumed (24a)', () => {
  it('a press that lands on a UI control never moves the ship; a press elsewhere does', () => {
    const b = fakeBrowser();
    try {
      b.input.uiHit = (x, y) => x > 480 && y < 60; // the pause button's corner
      let taps = 0;
      b.input.onTap(() => { taps++; });
      b.fire('pointerdown', { clientX: 500, clientY: 30, pointerType: 'touch' });
      expect(b.input.pointer.active).toBe(false);
      expect(b.input.pointer.seen).toBe(false);
      b.fire('pointermove', { clientX: 300, clientY: 400, pointerType: 'touch' }); // dragging on from the button: still the button's
      expect(b.input.pointer.seen).toBe(false);
      b.fire('pointerup', { clientX: 500, clientY: 30, pointerType: 'touch' });
      expect(taps).toBe(1); // the tap still reaches the tap listeners (the control uses it)
      b.fire('pointerdown', { clientX: 200, clientY: 300, pointerType: 'touch' });
      expect(b.input.pointer.active).toBe(true);
      expect([b.input.pointer.x, b.input.pointer.y]).toEqual([200, 300]);
      b.fire('pointermove', { clientX: 210, clientY: 310, pointerType: 'touch' });
      expect([b.input.pointer.x, b.input.pointer.y]).toEqual([210, 310]);
    } finally { b.restore(); }
  });
});

describe('frame rate (24a)', () => {
  /** Runs the main loop's planning for `seconds` of frames at `hz` and returns the simulated time and the longest step. */
  function simulate(hz: number, seconds: number, jitter = 0) {
    let t = 0, longest = 0, steps = 0;
    for (let f = 0; f < seconds * hz; f++) {
      const frame = (1 / hz) * (1 + (f % 2 ? jitter : -jitter));
      const p = planSteps(frame);
      t += p.steps * p.dt;
      steps += p.steps;
      longest = Math.max(longest, p.dt);
    }
    return { t, longest, steps };
  }

  it('one second of simulation time is the same at 60 and 120 Hz (and at 144 and 30), and no step is longer than 1/60 s', () => {
    for (const hz of [30, 60, 90, 120, 144]) {
      const r = simulate(hz, 1);
      expect(r.t).toBeCloseTo(1, 9);
      expect(r.longest).toBeLessThanOrEqual(SIM_MAX_STEP + 1e-12);
    }
    // 120 Hz really gets a step on every frame (the picture changes every frame), 60 Hz one per frame.
    expect(simulate(120, 1).steps).toBe(120);
    expect(simulate(60, 1).steps).toBe(60);
  });

  it('a wall flown for a second advances the same distance at 60 and 120 Hz', () => {
    const run = (hz: number) => {
      const l = oneRow(c => c === 0);
      l.approachSpeed = 100;
      const w = new WallWorld(l, { grid: buildStarterGrid() });
      w.autoFire = false;
      for (let f = 0; f < hz; f++) { const p = planSteps(1 / hz); for (let i = 0; i < p.steps; i++) w.update(p.dt, null); }
      return { off: w.wallOffsetY, time: w.time };
    };
    const a = run(60), b = run(120);
    expect(b.time).toBeCloseTo(a.time, 9);
    expect(b.off).toBeCloseTo(a.off, 6);
    expect(a.off).toBeCloseTo(100, 4);
  });

  it('a hitch is split into several steps that still add up; a sleeping tab is capped', () => {
    const p = planSteps(0.2);
    expect(p.steps).toBe(12);
    expect(p.steps * p.dt).toBeCloseTo(0.2, 9);
    expect(planSteps(30)).toEqual(planSteps(0.25));
    expect(planSteps(0).steps).toBe(0);
  });

  it('the display rate is read from the short frame gaps and snapped to a common rate', () => {
    const gaps = (ms: number, n = 60) => Array.from({ length: n }, (_, i) => ms + (i % 5 === 0 ? 0.3 : -0.2));
    expect(estimateRefreshHz(gaps(8.33))).toBe(120);
    expect(estimateRefreshHz(gaps(16.67))).toBe(60);
    expect(estimateRefreshHz([...gaps(8.33, 50), ...Array.from({ length: 12 }, () => 40)])).toBe(120); // a few slow frames do not lower it
    expect(estimateRefreshHz([16, 16])).toBe(0); // too few to say
  });
});

describe('time played (24a)', () => {
  it('counts only while the page is visible, saves every 15 s and when hidden', () => {
    let total = 0, saves = 0;
    const t = new PlayTimeTracker(s => { total += s; }, () => { saves++; });
    for (let i = 0; i < 60; i++) t.tick(DT, true);
    expect(total).toBeCloseTo(1, 9);
    for (let i = 0; i < 600; i++) t.tick(DT, false); // hidden: nothing counts
    expect(total).toBeCloseTo(1, 9);
    expect(saves).toBe(1); // hiding saved what was counted
    for (let i = 0; i < 60 * PLAYTIME_FLUSH_SECONDS; i++) t.tick(DT, true);
    expect(saves).toBe(2);
    t.tick(NaN, true); t.tick(-1, true);
    expect(total).toBeCloseTo(1 + PLAYTIME_FLUSH_SECONDS, 6);
  });

  it('shows hours and minutes', () => {
    expect(fmtPlayTime(0)).toBe('0h 0m');
    expect(fmtPlayTime(12 * 3600 + 34 * 60 + 59)).toBe('12h 34m');
    expect(fmtPlayTime(NaN)).toBe('0h 0m');
  });

  it('is saved in the store; an old save starts at 0; garbage is repaired', () => {
    const s = new ProgressStore(null, defaultProgress());
    s.addPlayTime(125.5);
    s.addPlayTime(-5);
    s.addPlayTime(Infinity);
    s.flushPlayTime();
    const again = loadProgress(serializeProgress(s.data));
    expect(again.version).toBe(12);
    expect(again.timePlayed).toBeCloseTo(125.5, 9);
    const old: any = JSON.parse(serializeProgress(defaultProgress()));
    old.version = 11; delete old.timePlayed; delete old.newBlocks; delete old.skillPointsSeen;
    const migrated = loadProgress(JSON.stringify(old));
    expect(migrated.version).toBe(12);
    expect(migrated.timePlayed).toBe(0);
    expect(migrated.newBlocks).toEqual([]);
    expect(loadProgress(JSON.stringify({ ...old, version: 12, timePlayed: -3 })).timePlayed).toBe(0);
    expect(loadProgress(JSON.stringify({ ...old, version: 12, timePlayed: 'x' })).timePlayed).toBe(0);
  });
});

describe('unlock notices and NEW marks (24a)', () => {
  it('passing a tier that unlocks a block marks it NEW, lists it for the run summary once, and opening its info clears the mark', () => {
    const s = new ProgressStore(null, defaultProgress());
    expect(TIER_LOCKS.accelerator).toBe(5);
    s.data.passedTiers = [1, 2, 3, 4];
    s.commit();
    expect(s.data.newBlocks).toEqual([]);
    expect(s.shopDot).toBe(false);
    s.data.passedTiers = [1, 2, 3, 4, 5];
    s.commit();
    expect(s.data.newBlocks).toEqual(expect.arrayContaining(['accelerator', 'cleaver']));
    expect(s.shopDot).toBe(true);
    const u = s.takeRunUnlocks();
    expect(u.blocks).toEqual(expect.arrayContaining(['Accelerator', 'Cleaver']));
    expect(unlockSummary(u.blocks, u.skillPoints)).toMatch(/^Unlocked: .*Accelerator/);
    expect(s.takeRunUnlocks()).toEqual({ blocks: [], skillPoints: 0 }); // once
    // The marks outlive the run summary and a reload.
    expect(loadProgress(serializeProgress(s.data)).newBlocks).toEqual(expect.arrayContaining(['accelerator']));
    s.markBlockSeen('accelerator');
    expect(s.data.newBlocks).not.toContain('accelerator');
    expect(s.data.newBlocks).toContain('cleaver');
    s.markBlockSeen('cleaver');
    s.markBlockSeen('not_a_block'); // harmless
    expect(s.shopDot).toBe(false);
  });

  it('a block the save owns already is not marked; the same unlock does not mark twice', () => {
    const p = defaultProgress();
    p.owned.accelerator = 1;
    const s = new ProgressStore(null, p);
    s.data.passedTiers = [1, 2, 3, 4, 5];
    s.commit(); s.commit();
    expect(s.data.newBlocks).not.toContain('accelerator');
    expect(s.data.newBlocks.filter(id => id === 'cleaver')).toHaveLength(1);
  });

  it('a Frontier ring that earns skill points is listed, dots the Skills tab until it is opened; old saves start with no dot', () => {
    const s = new ProgressStore(null, defaultProgress());
    expect(s.skillsDot).toBe(false);
    s.data.frontier.sq[sqKey(0, -100)] = 2;
    s.commit();
    expect(s.skillPointsEarned).toBe(skillPointsFor(100));
    expect(s.skillsDot).toBe(true);
    const u = s.takeRunUnlocks();
    expect(u.skillPoints).toBe(skillPointsFor(100));
    expect(u.blocks).toEqual(['Frontier Echo']);
    expect(unlockSummary(u.blocks, u.skillPoints)).toBe(`Unlocked: Frontier Echo, +${skillPointsFor(100)} skill points`);
    s.markSkillsSeen();
    expect(s.skillsDot).toBe(false);
    // An older save that already has the points is not told about them.
    const old: any = JSON.parse(serializeProgress(s.data));
    old.version = 11; delete old.skillPointsSeen;
    const loaded = new ProgressStore(null, loadProgress(JSON.stringify(old)));
    expect(loaded.skillsDot).toBe(false);
  });

  it('the summary line: names, "and N more", singular point, empty when nothing', () => {
    expect(unlockSummary([], 0)).toBe('');
    expect(unlockSummary(['Accelerator'], 1)).toBe('Unlocked: Accelerator, +1 skill point');
    expect(unlockSummary([], 2)).toBe('Unlocked: +2 skill points');
    const many = Array.from({ length: UNLOCK_NAMES_SHOWN + 3 }, (_, i) => `B${i}`);
    expect(unlockSummary(many, 0)).toBe(`Unlocked: ${many.slice(0, UNLOCK_NAMES_SHOWN).join(', ')} and 3 more`);
  });
});

describe('captain option tiers (24a)', () => {
  it('kills needed are 0 / 2000 / 10000 / 40000; the old thresholds are kept for saves', () => {
    expect(TIER_KILLS).toEqual([0, 2000, 10000, 40000]);
    expect(LEGACY_TIER_KILLS).toEqual([0, 300, 1500, 6000]);
    expect(tiersReached(1999, TIER_KILLS)).toBe(1);
    expect(tiersReached(40000, TIER_KILLS)).toBe(4);
    expect(tiersReached(6000, LEGACY_TIER_KILLS)).toBe(4);
  });

  it('a save made under the old thresholds keeps the tiers it had opened, and nothing it had not', () => {
    const save = { selected: 'cadet', owned: ['cadet'], milestones: [], heroes: { cadet: { level: 2, kills: 1600, owned: [], active: {} }, gunner: { level: 0, kills: 299, owned: [], active: {} } } };
    const c = sanitizeCaptains(save);
    expect([1, 2, 3, 4].map(t => isTierUnlocked(c.heroes.cadet, t))).toEqual([true, true, true, false]); // 1600 kills opened tiers 2 and 3 before
    expect([1, 2, 3, 4].map(t => isTierUnlocked(c.heroes.gunner, t))).toEqual([true, false, false, false]); // 299 had opened none
    expect(nextTierGoal(c.heroes.cadet)).toEqual({ tier: 4, kills: 40000 });
    // It survives a save and a load, and more kills still open the next tiers by the new numbers.
    const again = sanitizeCaptains(JSON.parse(JSON.stringify(c)));
    expect(again.heroes.cadet.tiersOpened).toBe(3);
    addCaptainKills({ medals: 0, captains: again }, 'gunner', 1700);
    expect(isTierUnlocked(again.heroes.gunner, 2)).toBe(false); // 1999 kills
    addCaptainKills({ medals: 0, captains: again }, 'gunner', 1);
    expect(isTierUnlocked(again.heroes.gunner, 2)).toBe(true); // 2000
    expect(again.heroes.gunner.tiersOpened).toBe(2);
  });

  it('a new game starts with tier 1 open only', () => {
    const c = sanitizeCaptains(undefined);
    expect([1, 2, 3, 4].map(t => isTierUnlocked(c.heroes.cadet, t))).toEqual([true, false, false, false]);
  });
});

describe('screen constants used by the checks above', () => {
  it('the view is the size the tests assume', () => {
    expect([VIEW_W, VIEW_H]).toEqual([540, 960]);
  });
});
