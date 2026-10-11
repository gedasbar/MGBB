import { describe, it, expect } from 'vitest';
import { CONFIG } from '../src/config';
import { EASE_TIME, GRACE_TIME, PointerGate } from '../src/engine/control';
import { World } from '../src/game/world';
import { buildStarterGrid } from '../src/game/starter';
import { CELL, SHIP_START_Y, WORLD_WIDTH } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { PointerState } from '../src/input';

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

  it('after the first move the ship eases in over 0.25 s, is safe for 1.0 s, then a block crashes it', () => {
    const w = wallOverTheTop();
    w.beginControl();
    const y0 = w.shipY;
    w.update(DT, atTop);
    expect(w.shipY).toBeLessThan(y0);                  // moving...
    expect(w.shipY).toBeGreaterThan(atTop.y + 100);    // ...but not there yet
    for (let i = 0; i < Math.round(EASE_TIME / DT); i++) w.update(DT, atTop);
    expect(w.shipY).toBeCloseTo(atTop.y, 5);           // exactly on the pointer after the ease
    // Inside a block, invulnerable.
    expect(w.invuln).toBeGreaterThan(0);
    while (w.invuln > 0) { expect(w.state).toBe('playing'); w.update(DT, atTop); }
    expect(w.time).toBeGreaterThan(GRACE_TIME - 2 * DT);
    expect(w.time).toBeLessThan(GRACE_TIME + 2 * DT);
    // The first step with invuln spent: still on a live block -> crash.
    w.update(DT, atTop);
    expect(w.state).toBe('crashed');
  });

  it('without safeStart the ship follows the pointer immediately (the old behaviour tests rely on)', () => {
    const level: LevelDef = { tier: 1, cols: 21, rows: 1, cells: Array.from({ length: 21 }, () => null), approachSpeed: 0 };
    const w = new WallWorld(level, { grid: buildStarterGrid() });
    w.update(DT, { x: 300, y: 400 });
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

  it('after beginControl a rock on the ship does no damage for 1.0 s, then it does', () => {
    const w = new World({ autoSpawn: false, safeStart: true });
    w.beginControl();
    const p = pointerAt(w.shipX, w.shipY);
    const rock = w.spawnRock(w.shipX, w.shipY, 1e9)!;
    const keepOn = () => { rock.x = w.shipX; rock.y = w.shipY; };
    let t = 0;
    while (t < GRACE_TIME - 2 * DT) { keepOn(); w.update(DT, p); t += DT; }
    expect(w.hull).toBe(w.maxHull);
    for (let i = 0; i < 12; i++) { keepOn(); w.update(DT, p); }
    expect(w.hull).toBeLessThan(w.maxHull);
  });
});
