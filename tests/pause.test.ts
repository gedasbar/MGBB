import { describe, it, expect } from 'vitest';
import { PauseController, RESUME_MAX_FRAME } from '../src/game/pause';
import { World } from '../src/game/world';
import { WallWorld } from '../src/wall/wallWorld';
import { makeTestWall } from '../src/wall/level';
import { buildStarterGrid } from '../src/game/starter';
import { bankFlyRun, flyRunResult } from '../src/game/runEnd';
import { ProgressStore } from '../src/econ/progress';
import { PointerState } from '../src/input';
import { EASE_TIME } from '../src/engine/control';

const DT = 1 / 60;
const ptr = (x: number, y: number): PointerState => ({ x, y, active: false, type: 'mouse', seen: true });

/** The same gate ScreenManager.update applies, around a world step. */
function run(world: World, ctl: PauseController, seconds: number, p: PointerState, frame = DT) {
  for (let i = 0; i < Math.round(seconds / DT); i++) if (ctl.step(DT, frame)) world.update(ctl.dt, p);
}

describe('Pause', () => {
  it('nothing advances while paused: wave clock, time, enemies, projectiles, invulnerability, hull', () => {
    const w = new World({ autoSpawn: true, seed: 5, safeStart: true });
    w.beginControl();
    const ctl = new PauseController();
    run(w, ctl, 6, ptr(270, 700));
    expect(w.time).toBeGreaterThan(5.9);
    expect(w.mitosis.enemies.length).toBeGreaterThan(0);
    ctl.pause();
    const snap = () => JSON.stringify({
      t: w.time, wave: w.wave, left: w.waveTimeLeft, inv: w.invuln, hull: w.hull, proj: w.pool.count, shots: w.gun.shots,
      e: w.mitosis.enemies.map(e => [e.id, e.x, e.y, e.hp]),
    });
    const before = snap();
    run(w, ctl, 10, ptr(100, 300));
    expect(snap()).toBe(before);
    ctl.resume();
    run(w, ctl, 1, ptr(270, 700));
    expect(w.time).toBeGreaterThan(JSON.parse(before).t);
  });

  it('the first step after a resume is clamped: a long wait is not one big time step', () => {
    const ctl = new PauseController();
    ctl.pause();
    expect(ctl.step(1 / 60, 0.25)).toBe(false);
    ctl.resume();
    expect(ctl.step(0.25, 0.25)).toBe(true);
    expect(ctl.frameTime).toBeLessThanOrEqual(RESUME_MAX_FRAME);
    expect(ctl.dt).toBeLessThanOrEqual(RESUME_MAX_FRAME);
    expect(ctl.step(0.25, 0.25)).toBe(true);
    expect(ctl.frameTime).toBe(0.25); // only the first one is clamped
  });

  it('pause() and resume() are idempotent', () => {
    const ctl = new PauseController();
    expect(ctl.pause()).toBe(true);
    expect(ctl.pause()).toBe(false);
    expect(ctl.resume()).toBe(true);
    expect(ctl.resume()).toBe(false);
  });

  it('after a resume the ship eases to a far pointer instead of teleporting (Free Fly and walls)', () => {
    const w = new World({ autoSpawn: false, seed: 1, safeStart: true });
    w.beginControl();
    for (let i = 0; i < 40; i++) w.update(DT, ptr(100, 600));
    expect(w.shipX).toBeCloseTo(100, 3);
    w.resumeEase();
    w.update(DT, ptr(500, 200));            // pointer moved far away while paused
    expect(w.shipX).toBeLessThan(150);       // one step later the ship is still near where it was
    expect(w.shipX).toBeGreaterThan(100);
    for (let i = 0; i < Math.ceil(EASE_TIME / DT) + 2; i++) w.update(DT, ptr(500, 200));
    expect(w.shipX).toBeCloseTo(500, 3);

    const ww = new WallWorld(makeTestWall({ tier: 1, rows: 4, gaps: 6 }), { grid: buildStarterGrid(), safeStart: true });
    ww.beginControl();
    for (let i = 0; i < 40; i++) ww.update(DT, { x: ww.worldW / 2, y: 600 });
    const x0 = ww.shipX;
    ww.resumeEase();
    ww.update(DT, { x: x0 + 200, y: 200 });
    expect(Math.abs(ww.shipX - x0)).toBeLessThan(40);
  });

  it('quit banks the credits so far and reports the run as it stands (same as a crash)', () => {
    const w = new World({ autoSpawn: true, seed: 3, safeStart: false });
    for (let i = 0; i < 60 * 20; i++) { w.hull = 1e9; w.update(DT, ptr(270 + Math.sin(i / 40) * 200, 700)); }
    const store = new ProgressStore(null);
    const before = store.data.credits;
    const { result, marks } = bankFlyRun(w, store);
    expect(result).toEqual(flyRunResult(w));
    expect(result.credits).toBe(w.credits);
    expect(result.wave).toBe(Math.max(1, w.wave));
    expect(store.data.credits).toBe(before + Math.floor(w.credits));
    expect(store.data.runs).toBe(1);
    expect(marks.newBestTime).toBe(true);
  });

  it('a wall quit mid-run banks once and counts as not passed', () => {
    const ww = new WallWorld(makeTestWall({ tier: 1, rows: 4, gaps: 6 }), { grid: buildStarterGrid(), safeStart: false });
    for (let i = 0; i < 300; i++) ww.update(DT, { x: ww.worldW / 2, y: 600 });
    const store = new ProgressStore(null);
    expect(ww.state).toBe('playing');
    expect(ww.bank(store)).toBe(true);
    expect(ww.bank(store)).toBe(false);
    expect(store.data.runs).toBe(1);
  });
});
