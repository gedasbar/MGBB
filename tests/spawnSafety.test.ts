import { describe, it, expect } from 'vitest';
import { CONFIG, SHIP_MAX_SPEED } from '../src/config';
import { EASE_TIME, SPAWN_INVULN_SECONDS, PointerGate } from '../src/engine/control';
import { World } from '../src/game/world';
import { buildStarterGrid } from '../src/game/starter';
import { CELL, SHIP_START_Y, WORLD_WIDTH } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { PointerState } from '../src/input';
import { neutralModifiers } from '../src/captains/modifiers';

const DT = 1 / 60;
const plain: BlockDef = { hp: 100, armor: 0, shield: 0 };

/** Three full rows of blocks that cover the top of the screen (y 0..3 cells) and never move. */
function wallOverTheTop(): WallWorld {
  const cols = 21;
  const level: LevelDef = { tier: 1, cols, rows: 3, cells: Array.from({ length: cols * 3 }, () => plain), approachSpeed: 0 };
  const w = new WallWorld(level, { grid: buildStarterGrid(), safeStart: true });
  w.autoFire = false;
  w.setWallOffset(3 * CELL);
  return w;
}
const atTop = { x: WORLD_WIDTH / 2, y: CONFIG.PLAYER.MARGIN };

describe('pointer gate', () => {
  it('the first reading is only remembered; a later move or a new press fires it, once', () => {
    const g = new PointerGate();
    expect(g.observe({ x: 270, y: 20, active: false }, false)).toBe(false);   // never seen
    expect(g.observe({ x: 270, y: 20, active: false })).toBe(false);          // parked where the FLY button was
    expect(g.observe({ x: 270, y: 20, active: false })).toBe(false);
    expect(g.observe({ x: 271, y: 20, active: false })).toBe(true);
    expect(g.observe({ x: 271, y: 20, active: false })).toBe(true);           // stays fired
    const t = new PointerGate();
    t.observe({ x: 5, y: 5, active: false });
    expect(t.observe({ x: 5, y: 5, active: true })).toBe(true);               // a press without movement
  });
});

describe('wall spawn safety', () => {
  it('a pointer parked at the top edge does not move or crash the ship before the first move', () => {
    const w = wallOverTheTop();
    expect(w.shipY).toBe(SHIP_START_Y);
    for (let i = 0; i < 60 * 5; i++) w.update(DT, atTop);                     // the screen would pass the target if it were following
    expect(w.state).toBe('playing');
    expect(w.shipY).toBe(SHIP_START_Y);
    expect(w.shipX).toBe(WORLD_WIDTH / 2);
  });

  it('after the first move the ship eases in over 0.25 s, is safe for SPAWN_INVULN_SECONDS from the first frame of the run, then a block crashes it', () => {
    const w = wallOverTheTop();
    w.beginControl();
    const y0 = w.shipY;
    w.update(DT, atTop);
    expect(w.shipY).toBeLessThan(y0);                  // moving...
    expect(w.shipY).toBeGreaterThan(atTop.y + 100);    // ...but not there yet
    for (let i = 0; i < Math.round(EASE_TIME / DT) + 20; i++) w.update(DT, atTop); // the ease, then the capped flight (744 px at SHIP_MAX_SPEED)
    expect(w.shipY).toBeCloseTo(atTop.y, 5);           // exactly on the pointer after the flight
    // Inside a block, invulnerable.
    expect(w.invuln).toBeGreaterThan(0);
    while (w.invuln > 0) { expect(w.state).toBe('playing'); w.update(DT, atTop); }
    expect(w.time).toBeGreaterThan(SPAWN_INVULN_SECONDS - 2 * DT);
    expect(w.time).toBeLessThan(SPAWN_INVULN_SECONDS + 2 * DT);
    // The first step with invuln spent: still on a live block -> crash.
    w.update(DT, atTop);
    expect(w.state).toBe('crashed');
  });

  it('without safeStart the ship follows the pointer at once, at SHIP_MAX_SPEED at most (chunk 24a: never a jump)', () => {
    const level: LevelDef = { tier: 1, cols: 21, rows: 1, cells: Array.from({ length: 21 }, (_, c) => (c === 0 ? plain : null)), approachSpeed: 0 }; // one block far away, so the wall is not cleared
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    w.autoFire = false;
    const x0 = w.shipX, y0 = w.shipY;
    w.update(DT, { x: 300, y: 400 });
    expect(Math.hypot(w.shipX - x0, w.shipY - y0)).toBeCloseTo(SHIP_MAX_SPEED * DT, 6); // one capped step toward the target
    for (let i = 0; i < 60; i++) w.update(DT, { x: 300, y: 400 });
    expect(w.shipX).toBe(300);
    expect(w.shipY).toBe(400);
  });
});

describe('Free Fly spawn safety', () => {
  const pointerAt = (x: number, y: number): PointerState => ({ x, y, active: false, type: 'mouse', seen: true });

  it('the ship stays put until control starts, whatever the pointer does', () => {
    const w = new World({ autoSpawn: false, safeStart: true });
    for (let i = 0; i < 120; i++) w.update(DT, pointerAt(539, 10));           // right edge and top edge
    expect(w.shipX).toBe(CONFIG.VIEW.W / 2);
    expect(w.shipY).toBe(CONFIG.VIEW.H * 0.8);
    expect(w.controlStarted).toBe(false);
  });

  it('after beginControl a rock on the ship does no damage until SPAWN_INVULN_SECONDS after the run started, then it does', () => {
    const w = new World({ autoSpawn: false, safeStart: true });
    w.beginControl();
    const p = pointerAt(w.shipX, w.shipY);
    const rock = w.spawnRock(w.shipX, w.shipY, 1e9)!;
    const keepOn = () => { rock.x = w.shipX; rock.y = w.shipY; };
    let t = 0;
    while (t < SPAWN_INVULN_SECONDS - 2 * DT) { keepOn(); w.update(DT, p); t += DT; }
    expect(w.hull).toBe(w.maxHull);
    for (let i = 0; i < 12; i++) { keepOn(); w.update(DT, p); }
    expect(w.hull).toBeLessThan(w.maxHull);
  });
});

describe('spawn invulnerability runs from the first frame (24d)', () => {
  const pointerAt = (x: number, y: number): PointerState => ({ x, y, active: false, type: 'mouse', seen: true });
  const run = (world: { update(dt: number, p: any): void }, p: any, seconds: number, tap?: { at: number; fn: () => void }) => {
    let t = 0;
    while (t < seconds) { if (tap && t >= tap.at) { tap.fn(); } world.update(DT, p); t += DT; }
  };

  it('Free Fly: invulnerable at t=0 with no input, not at t=1.6, with or without an early tap', () => {
    for (const early of [false, true]) {
      const w = new World({ autoSpawn: false, safeStart: true });
      const p = pointerAt(w.shipX, w.shipY);
      expect(w.invuln).toBeCloseTo(SPAWN_INVULN_SECONDS, 6);                  // before any update, no input
      run(w, p, 0.5, early ? { at: 0.1, fn: () => w.beginControl() } : undefined);
      expect(w.invuln).toBeGreaterThan(0);                                    // still safe at 0.5 s
      run(w, p, 1.1, early ? { at: 0, fn: () => w.beginControl() } : undefined);
      expect(w.invuln).toBeLessThanOrEqual(0);                                // spent at 1.6 s
    }
  });

  it('Free Fly: a waiting player is hit by a rock after the time is up (control never started)', () => {
    const w = new World({ autoSpawn: false, safeStart: true });
    const p = pointerAt(w.shipX, w.shipY);
    const rock = w.spawnRock(w.shipX, w.shipY, 1e9)!;
    for (let i = 0; i < 60 * 1.4; i++) { rock.x = w.shipX; rock.y = w.shipY; w.update(DT, p); }
    expect(w.hull).toBe(w.maxHull);
    for (let i = 0; i < 60 * 0.6; i++) { rock.x = w.shipX; rock.y = w.shipY; w.update(DT, p); }
    expect(w.hull).toBeLessThan(w.maxHull);
    expect(w.controlStarted).toBe(false);
  });

  it('wall: invulnerable at t=0 with no input, not at t=1.6, with or without an early tap; a captain bonus adds on', () => {
    for (const early of [false, true]) {
      const w = wallOverTheTop();
      expect(w.invuln).toBeCloseTo(SPAWN_INVULN_SECONDS, 6);
      if (early) w.beginControl();
      expect(w.invuln).toBeCloseTo(SPAWN_INVULN_SECONDS, 6);                  // a tap does not restart or extend it
      run(w, atTop, 1.6);
      expect(w.invuln).toBe(0);
    }
    const level: LevelDef = { tier: 1, cols: 21, rows: 1, cells: [plain], approachSpeed: 0 };
    const mods = { ...neutralModifiers(), spawnInvuln: 0.5 };
    expect(new WallWorld(level, { grid: buildStarterGrid(), safeStart: true, modifiers: mods }).invuln).toBeCloseTo(SPAWN_INVULN_SECONDS + 0.5, 6);
  });

  it('wall: a waiting ship on a block crashes once the time is up, not before', () => {
    const w = wallOverTheTop();
    w.teleportShip(WORLD_WIDTH / 2, CONFIG.PLAYER.MARGIN);
    run(w, atTop, 1.4);
    expect(w.state).toBe('playing');
    run(w, atTop, 0.3);
    expect(w.state).toBe('crashed');
    expect(w.controlStarted).toBe(false);
  });

  it('worlds without safeStart (unit tests) start with no invulnerability', () => {
    expect(new World({ autoSpawn: false }).invuln).toBe(0);
  });
});
