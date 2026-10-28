import { describe, it, expect } from 'vitest';
import { wrapDist, wrapDx, wrapX } from '../src/engine/wrap';
import { buildStarterGrid } from '../src/game/starter';
import { ringScreenX, WallCamera } from '../src/wall/camera';
import { CELL, VIEW_W, WALL_COLS } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';

const W = WALL_COLS * CELL;
const plain: BlockDef = { hp: 100, armor: 0, shield: 0 };

function wall(rows: number, f: (r: number, c: number) => boolean, wrap = true): WallWorld {
  const cells: (BlockDef | null)[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < WALL_COLS; c++) cells.push(f(r, c) ? plain : null);
  const level: LevelDef = { tier: 1, cols: WALL_COLS, rows, cells, approachSpeed: 0, wrap };
  const w = new WallWorld(level, { grid: buildStarterGrid() });
  w.autoFire = false;
  w.setWallOffset(300);
  return w;
}

function shoot(w: WallWorld, x: number, y: number, damage: number, mods: any[], vx = 0, vy = 0) {
  w.projSys.modifiersTable = [mods];
  const i = w.pool.spawn(x, y, vx, vy, damage, 0, 0);
  w.projSys.init(i);
  return i;
}

describe('ring maths', () => {
  it('wrapDx is in [-W/2, W/2), antisymmetric, and wrapX folds into [0, W)', () => {
    for (let i = 0; i < 300; i++) {
      const a = (i * 37.31) % W, b = (i * 91.77 + 13) % W;
      const d = wrapDx(a, b, W);
      expect(d).toBeGreaterThanOrEqual(-W / 2);
      expect(d).toBeLessThan(W / 2);
      expect(wrapDx(b, a, W)).toBeCloseTo(-d, 9);
      expect(wrapX(b + d, W)).toBeCloseTo(a, 6);
    }
    expect(wrapX(-10, W)).toBe(W - 10);
    expect(wrapDist(W - 10, 100, 10, 100, W)).toBe(20);
  });
});

describe('ring walls', () => {
  it('a projectile fired near the right side hits a block at the left side, across the seam', () => {
    const w = wall(3, (r, c) => r === 2 && c === 0);
    const b = w.blocks[2 * WALL_COLS + 0]!;
    shoot(w, W - 3, b.y, 150, [], 600, 0);
    w.update(1 / 60, null);
    expect(w.blocks[2 * WALL_COLS + 0]).toBeNull();
    expect(w.destroyed).toBe(1);
  });

  it('a projectile wraps instead of leaving or bouncing', () => {
    const w = wall(3, (r, c) => r === 0 && c === 10); // one far block: a wall with none is already cleared (and drops its shots)
    const i = shoot(w, W - 2, 500, 10, [], 600, 0);
    w.update(1 / 60, null);
    expect(w.pool.active[i]).toBe(1);
    expect(w.pool.x[i]).toBeGreaterThanOrEqual(0);
    expect(w.pool.x[i]).toBeLessThan(20);
    expect(w.pool.vx[i]).toBeGreaterThan(0);
  });

  it('the ship x wraps and the ship collides with a block on the other side of the seam', () => {
    const w = wall(3, (r, c) => r === 2 && c === 0);
    w.update(1 / 60, { x: W + 20, y: 300 - 27 });
    expect(w.shipX).toBeCloseTo(20, 6);
    expect(w.state).toBe('crashed');
    const v = wall(3, (r, c) => r === 2 && c === 0);
    v.update(1 / 60, { x: W - 5, y: 300 - 27 });   // 5 px left of the seam is inside column 20, which is empty; column 0 starts at the seam
    expect(v.shipX).toBeCloseTo(W - 5, 6);
    expect(v.state).toBe('crashed');   // the ship's hit circle (8 px) reaches over the seam into column 0
    const u = wall(3, (r, c) => r === 2 && c === 0);
    u.update(1 / 60, { x: W - 12, y: 300 - 27 });
    expect(u.state).toBe('playing');
  });

  it('AoE and homing take the short way round the seam', () => {
    const w = wall(5, (_r, c) => c === 0 || c === WALL_COLS - 1);
    w.setWallOffset(400);
    const left = w.blocks[3 * WALL_COLS + 0]!;
    shoot(w, W - 1, left.y, 30, [{ type: 'aoe_circle', radius: 50 }]);
    w.update(1e-6, null);
    // blocks of column 20 and column 0 around the seam were both hit, once each
    const hit = w.all.filter(b => w.blocks[b.id] === b && b.hp < 100);
    expect(hit.some(b => b.col === 0)).toBe(true);
    expect(hit.some(b => b.col === WALL_COLS - 1)).toBe(true);
    // homing: a shot just left of the seam, heading up, is pulled right toward a block in column 0 only
    const h = wall(3, (r, c) => r === 2 && c === 0);
    const target = h.blocks[2 * WALL_COLS + 0]!;
    const i = shoot(h, W - 20, target.y + 200, 10, [{ type: 'homing', level: 1 }], 0, -600);
    for (let k = 0; k < 6; k++) h.update(1 / 60, null);
    expect(h.pool.vx[i]).toBeGreaterThan(5);
  });

  it('screen position is continuous across the seam while the camera sweeps through it', () => {
    const cam = new WallCamera(0, W - VIEW_W, W);
    expect(cam.x).toBeCloseTo((W - VIEW_W) / 2, 9);
    const objX = 5;   // an object just right of the seam
    let prev: number | null = null;
    let crossed = false;
    cam.x = W - 400;
    for (let k = 0; k < 800; k++) {
      cam.update(1 / 60, 539);   // pointer at the right edge: the camera runs right and wraps
      const sx = ringScreenX(objX, cam.x, VIEW_W, W, true);
      // Off screen the position flips from one end of the ring to the other (the point opposite the viewport centre):
      // that is invisible. Whenever the object is on or near the screen it never jumps (at most 420 px/s = 7 px a step).
      const near = (v: number) => v > -100 && v < VIEW_W + 100;
      if (prev !== null && (near(sx) || near(prev))) {
        expect(Math.abs(sx - prev)).toBeLessThan(10);
        if (near(sx) && near(prev)) crossed = true;
      }
      prev = sx;
    }
    expect(cam.travel).toBeGreaterThan(W);   // went all the way round
    expect(crossed).toBe(true);
  });

  it('wrap: false still clamps the camera and the ship', () => {
    const cam = new WallCamera(0, W - VIEW_W);
    for (let k = 0; k < 600; k++) cam.update(1 / 60, 539);
    expect(cam.x).toBe(W - VIEW_W);
    const w = wall(3, () => false, false);
    w.update(1 / 60, { x: W + 50, y: 700 });
    expect(w.shipX).toBe(W);
  });
});
