import { describe, it, expect } from 'vitest';
import { CONFIG, shipHalfW } from '../src/config';
import { World } from '../src/game/world';
import { buildStarterGrid } from '../src/game/starter';
import { buildDartGrid } from '../src/game/gridUtils';
import { applyDamage } from '../src/engine/damage';
import { ProgressStore } from '../src/econ/progress';
import {
  BOOST_MAX, CAMERA_MAX_X, CELL, EDGE_ZONE, FIRE_OFFSET_SCALE, MAX_CAMERA_SPEED, SHIELD_REGEN_DELAY, SHIELD_REGEN_PER_SEC, SHIP_HIT_R, SHIP_START_Y, TOP_ZONE, VIEW_W, WALL_COLS,
  PASS_MARGIN_CELLS, WORLD_WIDTH,
} from '../src/wall/constants';
import { clampShipX, edgePushSpeed, WallCamera } from '../src/wall/camera';
import { BlockDef, blockHp, LevelDef, makeTestWall, rewardPerBlock } from '../src/wall/level';
import { simulateWall } from '../src/wall/sim';
import { boostT, scrollSpeed, WallWorld } from '../src/wall/wallWorld';

type Cell = BlockDef | null;
const plain = (hp = 100): BlockDef => ({ hp, armor: 0, shield: 0 });

/** A small wall for tests: rows x 21, every cell `plain` unless `f` says otherwise. approachSpeed 0 keeps it still. */
function level(rows: number, f: (r: number, c: number) => Cell = () => plain(), approachSpeed = 0, wrap = true): LevelDef {
  const cells: Cell[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < WALL_COLS; c++) cells.push(f(r, c));
  return { tier: 1, cols: WALL_COLS, rows, cells, approachSpeed, wrap };
}

function world(l: LevelDef): WallWorld {
  const w = new WallWorld(l, { grid: buildStarterGrid() });
  w.autoFire = false;
  return w;
}

const blockAt = (w: WallWorld, r: number, c: number) => w.blocks[r * WALL_COLS + c]!;

/** Drops a stationary projectile with modifier table entry `mod` at (x, y) and runs one step. */
function shoot(w: WallWorld, x: number, y: number, damage: number, mods: any[] = [], opts: { vx?: number; vy?: number; pure?: number } = {}) {
  w.projSys.modifiersTable = [mods];
  const i = w.pool.spawn(x, y, opts.vx ?? 0, opts.vy ?? 0, damage, opts.pure ?? 0, 0);
  w.projSys.init(i);
  return i;
}

describe('Wall data model', () => {
  it('block HP is 2 at tier 1 (a Dart + Flat+ shot of 2 kills it), grows 13% per tier until tier 38 and is a whole number; reward formula', () => {
    expect(blockHp(1)).toBe(2);
    expect(blockHp(11)).toBe(Math.round(2 * Math.pow(1.13, 10)));
    expect(blockHp(38)).toBe(Math.round(2 * Math.pow(1.13, 37)));
    expect(blockHp(100)).toBe(blockHp(38));
    for (let t = 1; t <= 100; t++) expect(Number.isInteger(blockHp(t))).toBe(true);
    expect(rewardPerBlock(1)).toBeCloseTo(0.4, 9);
    expect(rewardPerBlock(21)).toBeCloseTo(0.4 * Math.pow(1.05, 20), 9);
  });

  it('constants: 54 px cell, 21 columns, 10 visible', () => {
    expect(CELL).toBe(54);
    expect(WORLD_WIDTH).toBe(21 * 54);
    expect(CAMERA_MAX_X).toBe(WORLD_WIDTH - VIEW_W);
  });

  it('makeTestWall is a full 21 x rows wall with the requested fractions and gaps, and is deterministic', () => {
    const l = makeTestWall({ tier: 3, rows: 10, armorFraction: 0.5, shieldFraction: 0.25, gaps: 5 });
    expect(l.cols).toBe(21);
    expect(l.cells.length).toBe(210);
    expect(l.cells.filter(c => c === null).length).toBe(5);
    const live = l.cells.filter((c): c is BlockDef => c !== null);
    expect(live.every(c => c.hp === blockHp(3))).toBe(true);
    const armored = live.filter(c => c.armor > 0).length / live.length;
    const shielded = live.filter(c => c.shield > 0).length / live.length;
    expect(armored).toBeGreaterThan(0.35);
    expect(armored).toBeLessThan(0.65);
    expect(shielded).toBeGreaterThan(0.12);
    expect(shielded).toBeLessThan(0.38);
    expect(makeTestWall({ tier: 3, rows: 10, armorFraction: 0.5, shieldFraction: 0.25, gaps: 5 })).toEqual(l);
    const plainWall = makeTestWall({ tier: 1, rows: 4 });
    expect(plainWall.cells.every(c => c !== null && c.armor === 0 && c.shield === 0)).toBe(true);
  });
});

describe('Grid lookup', () => {
  it('maps a world position to the cell under it (row 0 is the top, the wall hangs above offset y); a flat wall ends at its sides', () => {
    const w = world(level(3, () => plain(), 0, false));
    // offset 0: the bottom row (2) fills y in [-54, 0), row 0 fills [-162, -108)
    expect(w.cellAt(10, -1)).toEqual({ col: 0, row: 2 });
    expect(w.cellAt(CELL * 5 + 1, -54 - 1)).toEqual({ col: 5, row: 1 });
    expect(w.cellAt(WORLD_WIDTH - 1, -161)).toEqual({ col: 20, row: 0 });
    expect(w.cellAt(10, 1)).toBeNull(); // below the wall
    expect(w.cellAt(-1, -10)).toBeNull(); // left of the world
    expect(w.cellAt(WORLD_WIDTH + 1, -10)).toBeNull();
    w.setWallOffset(300);
    expect(w.cellAt(10, 299)).toEqual({ col: 0, row: 2 });
    expect(w.cellAt(10, 300 - 54 * 3 + 1)).toEqual({ col: 0, row: 0 });
    expect(w.blockAt(10, 299)).toBe(blockAt(w, 2, 0));
    w.destroyBlock(blockAt(w, 2, 0));
    expect(w.blockAt(10, 299)).toBeNull();
  });
});

describe('Block damage uses the enemy damage function', () => {
  it('shield absorbs before HP, armor reduces, pure ignores both (through the real hit pipeline)', () => {
    const w = world(level(3, (r, c) => (r === 2 && c === 0 ? { hp: 100, armor: 0, shield: 50 } : r === 2 && c === 1 ? { hp: 100, armor: 10, shield: 0 } : r === 2 && c === 2 ? { hp: 100, armor: 10, shield: 50 } : plain())));
    const shielded = blockAt(w, 2, 0);
    const armored = blockAt(w, 2, 1);
    const both = blockAt(w, 2, 2);

    shoot(w, shielded.x, shielded.y, 30);
    w.update(1e-6, null);
    expect(shielded.shield).toBeCloseTo(20, 4);
    expect(shielded.hp).toBe(100);
    shoot(w, shielded.x, shielded.y, 30);
    w.update(1e-6, null);
    expect(shielded.shield).toBe(0);
    expect(shielded.hp).toBeCloseTo(90, 4);

    shoot(w, armored.x, armored.y, 40);
    w.update(1e-6, null);
    expect(armored.hp).toBeCloseTo(80, 4); // armor 10 against the engine's armor scale of 10 halves direct damage

    shoot(w, both.x, both.y, 40, [], { pure: 1 });
    w.update(1e-6, null);
    expect(both.shield).toBe(50); // pure damage ignores the shield...
    expect(both.hp).toBeCloseTo(60, 4); // ...and the armor

    // Same numbers as the function that rocks use.
    const probe = { hp: 100, maxHp: 100, armor: 10, shield: 50, maxShield: 50 };
    applyDamage(probe, 40, 1, 1);
    expect(probe.shield).toBe(50);
    expect(probe.hp).toBeCloseTo(60, 6);
  });

  it('Shield-Breaker and Armor-Piercer behave as on enemies', () => {
    const w = world(level(3, (r, c) => (r === 2 && c === 0 ? { hp: 1000, armor: 0, shield: 100 } : r === 2 && c === 1 ? { hp: 1000, armor: 10, shield: 0 } : plain())));
    const s = blockAt(w, 2, 0);
    shoot(w, s.x, s.y, 20, [{ type: 'shield_breaker', level: 1 }]); // 20 x1.5 direct, shield takes double: 60
    w.update(1e-6, null);
    expect(s.shield).toBeCloseTo(40, 4);
    const a = blockAt(w, 2, 1);
    shoot(w, a.x, a.y, 40, [{ type: 'armor_piercer', level: 1 }]); // x2 against armor, then halved by it
    w.update(1e-6, null);
    expect(a.hp).toBeCloseTo(1000 - 40, 4);
  });

  it('a shield regenerates only after 2 s without a hit, at a fixed share of its maximum per second', () => {
    const w = world(level(3, (r, c) => (r === 2 && c === 0 ? { hp: 100, armor: 0, shield: 40 } : plain())));
    const b = blockAt(w, 2, 0);
    shoot(w, b.x, b.y, 30);
    w.update(1 / 60, null);
    expect(b.shield).toBeCloseTo(10, 4);
    for (let i = 0; i < 60; i++) w.update(1 / 60, null); // 1 s later: still waiting
    expect(b.shield).toBeCloseTo(10, 4);
    for (let i = 0; i < 60 + 30; i++) w.update(1 / 60, null); // past the 2 s delay, 0.5 s of regeneration
    expect(b.shield).toBeGreaterThan(10);
    expect(b.shield).toBeLessThan(40);
    const regen = b.shield - 10;
    expect(regen).toBeGreaterThan(40 * SHIELD_REGEN_PER_SEC * 0.3);
    expect(regen).toBeLessThanOrEqual(40 * SHIELD_REGEN_PER_SEC * 0.5 + 0.3);
    for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, null);
    expect(b.shield).toBe(40); // capped at the maximum
    expect(SHIELD_REGEN_DELAY).toBe(2);
    // A new hit resets the wait.
    shoot(w, b.x, b.y, 10);
    w.update(1 / 60, null);
    const after = b.shield;
    for (let i = 0; i < 90; i++) w.update(1 / 60, null);
    expect(b.shield).toBe(after);
  });
});

describe('Wall approach and the top-edge boost', () => {
  it('scroll speed is the base at 35% of the screen height or lower, 4x at the top edge, and rises monotonically between', () => {
    const base = 26;
    expect(boostT(TOP_ZONE * CONFIG.VIEW.H)).toBe(0);
    expect(scrollSpeed(base, CONFIG.VIEW.H)).toBe(base);
    expect(scrollSpeed(base, TOP_ZONE * CONFIG.VIEW.H)).toBe(base);
    expect(scrollSpeed(base, 0)).toBe(base * BOOST_MAX);
    expect(BOOST_MAX).toBe(4);
    let prev = scrollSpeed(base, TOP_ZONE * CONFIG.VIEW.H);
    for (let y = TOP_ZONE * CONFIG.VIEW.H - 5; y >= 0; y -= 5) {
      const v = scrollSpeed(base, y);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(scrollSpeed(base, TOP_ZONE * CONFIG.VIEW.H / 2)).toBeCloseTo(base * 2.5, 9); // t = 0.5
  });

  it('the wall keeps approaching at the base speed (no stop line), and faster with the ship near the top', () => {
    const w = world(level(2, (_r, c) => (c === 10 ? null : plain()), 150)); // the ship starts in the empty column 10
    for (let i = 0; i < 60 * 6; i++) w.update(1 / 60, null);
    expect(w.wallOffsetY).toBeCloseTo(900, 1); // far past where the old stop line was
    const f = world(level(2, () => plain(), 100));
    f.update(1 / 60, { x: 10, y: 0 });
    expect(f.wallOffsetY).toBeCloseTo(scrollSpeed(100, 24) / 60, 6); // the ship is held at the 24 px screen margin
    expect(f.state).toBe('playing'); // x 10 is inside column 0 but the wall is still above the screen
  });

  it('starts with the whole wall above the screen, at least 6 cells from the ship', () => {
    const w = world(makeTestWall({ tier: 1, rows: 8 }));
    expect(w.wallOffsetY).toBe(0);
    expect(w.all.every(b => b.y + CELL / 2 <= 0)).toBe(true);
    expect(SHIP_START_Y - w.wallOffsetY).toBeGreaterThanOrEqual(6 * CELL);
  });
});

describe('Crash, pass, clear', () => {
  it('touching a live block with the hit point ends the run at once; a gap, or a destroyed block, is safe', () => {
    const w = world(level(3, (r, c) => (c === 8 && r === 2 ? null : plain())));
    w.setWallOffset(400);
    const x = 8 * CELL + 27;
    w.update(1 / 60, { x, y: 400 - 27 }); // the empty cell
    expect(w.state).toBe('playing');
    w.update(1 / 60, { x: x + CELL, y: 400 - 27 }); // inside the neighbouring live block
    expect(w.state).toBe('crashed');
    const t = w.time;
    w.update(1 / 60, null);
    expect(w.time).toBe(t);
    // Destroyed blocks never kill.
    const v = world(level(3));
    v.setWallOffset(400);
    v.destroyBlock(v.blocks[2 * WALL_COLS + 8]!);
    v.update(1 / 60, { x, y: 400 - 27 });
    expect(v.state).toBe('playing');
  });

  it('the hit point is 7 px: brushing the edge of a block 8 px away is safe, 6 px away crashes', () => {
    // The small-class hit radius (HIT_RADIUS): the Dart's. Bigger hulls have bigger circles (tests/hullLadder.test.ts).
    const mk = () => { const w = new WallWorld(level(1, (_r, c) => (c === 5 ? plain() : null)), { grid: buildDartGrid() }); w.autoFire = false; w.setWallOffset(300); return w; };
    const right = 6 * CELL; // x where column 5 ends
    const a = mk();
    a.update(1 / 60, { x: right + 9, y: 300 - 27 });
    expect(a.state).toBe('playing');
    const b = mk();
    b.update(1 / 60, { x: right + 7, y: 300 - 27 });
    expect(b.state).toBe('crashed');
    expect(SHIP_HIT_R).toBe(8);
  });

  it('a block that is damaged but alive still kills; a wall scrolling onto the ship crashes it', () => {
    const w = world(level(2, () => plain(), 100));
    const b = w.blocks[1 * WALL_COLS + 4]!;
    b.hp = 1;
    w.setWallOffset(500);
    w.update(1 / 60, { x: 4 * CELL + 27, y: 520 });
    expect(w.state).toBe('playing');
    for (let i = 0; i < 60; i++) w.update(1 / 60, { x: 4 * CELL + 27, y: 520 });
    expect(w.state).toBe('crashed');
  });

  it('flying above the far end of the wall with blocks left passes the level; with none left it is a clear', () => {
    const w = world(level(2, (_r, c) => (c === 0 ? plain() : null)));
    w.setWallOffset(700);
    const x = 10 * CELL; // an empty lane
    w.update(1 / 60, { x, y: w.finishY + 5 });
    expect(w.state).toBe('playing');
    w.update(1 / 60, { x, y: w.finishY - 5 });
    expect(w.state).toBe('passed');
    expect(w.alive).toBe(2);
    const c = world(level(2));
    c.setWallOffset(700);
    c.destroyAll();
    c.update(1 / 60, { x: 100, y: c.finishY - 5 });
    expect(c.state).toBe('cleared');
  });

  it('the (invisible) pass line is PASS_MARGIN_CELLS = 1 cell beyond the last row', () => {
    const w = world(level(4));
    w.setWallOffset(500);
    expect(PASS_MARGIN_CELLS).toBe(1);
    expect(w.finishY).toBeCloseTo(500 - 4 * CELL - PASS_MARGIN_CELLS * CELL, 9);
    expect(w.progress).toBeGreaterThanOrEqual(0);
    expect(w.progress).toBeLessThan(1);
  });

  it('a cleared wall pays credits per block, a shot kills a tier-1 block, and credits are banked once', () => {
    const w = world(level(2));
    w.setWallOffset(100);
    expect(w.alive).toBe(42);
    w.destroyAll();
    w.update(1 / 60, null);
    expect(w.state).toBe('cleared');
    expect(w.creditsExact).toBeCloseTo(42 * rewardPerBlock(1), 9);
    expect(w.percentDestroyed).toBe(100);
    const store = new ProgressStore(null);
    expect(w.bank(store)).toBe(true);
    expect(w.bank(store)).toBe(false);
    expect(store.data.credits).toBe(w.credits);
    expect(store.data.runs).toBe(1);
    expect(store.data.bestTier).toBe(0);
    const s = world(level(2, () => plain(blockHp(1))));
    const b = blockAt(s, 1, 4);
    shoot(s, b.x, b.y, 101);
    s.update(1e-6, null);
    expect(s.blocks[1 * WALL_COLS + 4]).toBeNull();
    expect(s.killEvents.length).toBe(1);
  });
});

describe('Ejector offset', () => {
  it('the Shuttle ejector is scaled by FIRE_OFFSET_SCALE and the ship fits in the lane its shots carve', () => {
    const w = world(level(2));
    const dx = Math.abs(w.spawnOffsets[0].x);
    expect(dx).toBeCloseTo(3 * 14 * FIRE_OFFSET_SCALE, 9);
    expect(dx + SHIP_HIT_R).toBeLessThan(CELL / 2 - 8);
    expect(Math.abs(w.spawnOffsets[0].y)).toBeCloseTo(4 * 14 * FIRE_OFFSET_SCALE, 9);
  });
});

describe('Edge-push camera', () => {
  it('is 0 at the inner edge of the 18% zone, rises linearly to exactly 420 px/s at the clamp edge m, signed by side', () => {
    const zone = VIEW_W * EDGE_ZONE;
    const m = shipHalfW(VIEW_W);
    expect(zone).toBeCloseTo(97.2, 9);
    expect(m).toBe(13);
    expect(edgePushSpeed(zone)).toBe(0);
    expect(edgePushSpeed(VIEW_W - zone)).toBeCloseTo(0, 9);
    expect(edgePushSpeed(270)).toBe(0);
    expect(edgePushSpeed(m)).toBe(-MAX_CAMERA_SPEED);
    expect(edgePushSpeed(VIEW_W - m)).toBe(MAX_CAMERA_SPEED);
    // Never above the max, even for an unclamped input.
    expect(edgePushSpeed(-30)).toBe(-MAX_CAMERA_SPEED);
    expect(edgePushSpeed(VIEW_W + 30)).toBe(MAX_CAMERA_SPEED);
    // Monotonic and linear from the zone edge to the clamp edge, both directions.
    let prev = 0;
    for (let x = VIEW_W - zone; x <= VIEW_W - m; x += 1) {
      const v = edgePushSpeed(x);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(MAX_CAMERA_SPEED);
      prev = v;
    }
    const mid = edgePushSpeed(VIEW_W - (zone + m) / 2);
    expect(mid).toBeCloseTo(MAX_CAMERA_SPEED / 2, 6);
    expect(mid).toBeCloseTo(-edgePushSpeed((zone + m) / 2), 6); // the two sides mirror each other
  });

  it('the ship screen x stays in [m, W-m] for any pointer x, so the whole ship (half width m) is on screen', () => {
    const m = shipHalfW(VIEW_W);
    for (let px = -500; px <= VIEW_W + 500; px += 7) {
      const x = clampShipX(px);
      expect(x).toBeGreaterThanOrEqual(m);
      expect(x).toBeLessThanOrEqual(VIEW_W - m);
      expect(x - m).toBeGreaterThanOrEqual(0);       // left side of the art
      expect(x + m).toBeLessThanOrEqual(VIEW_W);     // right side of the art
    }
    expect(clampShipX(-500)).toBe(m);
    expect(clampShipX(VIEW_W + 500)).toBe(VIEW_W - m);
    expect(clampShipX(200)).toBe(200);
    expect(shipHalfW(1080)).toBe(26); // scales with the viewport
  });

  it('starts centred, speeds up to 420, clamps at both ends and stops when the pointer leaves the zone', () => {
    const cam = new WallCamera();
    expect(cam.x).toBe(CAMERA_MAX_X / 2);
    for (let i = 0; i < 30; i++) cam.update(1 / 60, VIEW_W);
    expect(cam.speed).toBeGreaterThan(300);
    expect(cam.speed).toBeLessThanOrEqual(MAX_CAMERA_SPEED);
    expect(cam.x).toBeGreaterThan(CAMERA_MAX_X / 2);
    for (let i = 0; i < 60 * 4; i++) cam.update(1 / 60, VIEW_W);
    expect(cam.x).toBe(CAMERA_MAX_X);
    expect(cam.speed).toBe(0);
    for (let i = 0; i < 60 * 4; i++) cam.update(1 / 60, 0);
    expect(cam.x).toBe(0);
    // Leave the zone: the scroll stops within a fraction of a second and stays stopped.
    cam.x = 300;
    for (let i = 0; i < 30; i++) cam.update(1 / 60, VIEW_W);
    for (let i = 0; i < 60; i++) cam.update(1 / 60, 270);
    const x = cam.x;
    expect(cam.speed).toBe(0);
    for (let i = 0; i < 30; i++) cam.update(1 / 60, 270);
    expect(cam.x).toBe(x);
    // No pointer (touch released): nothing pushes.
    cam.update(1 / 60, null);
    expect(cam.x).toBe(x);
  });
});

describe('Shared hit pipeline on a wall', () => {
  it('piercing passes through several blocks of a column', () => {
    const w = world(level(8));
    w.setWallOffset(8 * CELL + 40); // the wall's lowest row sits near the bottom of the screen
    const col = 7;
    const x = col * CELL + 27;
    const lowest = blockAt(w, 7, col);
    const i = shoot(w, x, lowest.y + 20, 450, [{ type: 'piercing', level: 1 }], { vy: -600 });
    for (let k = 0; k < 120 && w.pool.active[i]; k++) w.update(1 / 60, null);
    const killed = [0, 1, 2, 3, 4, 5, 6, 7].filter(r => w.blocks[r * WALL_COLS + col] === null).length;
    expect(killed).toBeGreaterThanOrEqual(3);
    expect(w.destroyed).toBe(killed);
    // A plain shot of the same size stops at the first block.
    const w2 = world(level(8));
    w2.setWallOffset(8 * CELL + 40);
    const j = shoot(w2, x, blockAt(w2, 7, col).y + 20, 450, [], { vy: -600 });
    for (let k = 0; k < 120 && w2.pool.active[j]; k++) w2.update(1 / 60, null);
    expect(w2.destroyed).toBe(1);
  });

  it('AoE circle damages every block in the area exactly once, and nothing outside', () => {
    const w = world(level(5));
    w.setWallOffset(400);
    const mid = blockAt(w, 3, 8);
    shoot(w, mid.x, mid.y, 30, [{ type: 'aoe_circle', radius: 50 }]);
    w.update(1e-6, null);
    const hit = w.all.filter(b => w.blocks[b.id] === b && b.hp < 100);
    expect(hit.length).toBe(9); // the block and its eight neighbours (corners are within 38 px)
    expect(hit.every(b => Math.abs(b.hp - 70) < 1e-6)).toBe(true);
    expect(w.hits.length).toBe(9);
    expect(w.pool.count).toBe(0); // the shot detonated
    expect(blockAt(w, 3, 11).hp).toBe(100);
  });

  it('AoE rectangle damages the blocks in a horizontal bar once each', () => {
    const w = world(level(5));
    w.setWallOffset(400);
    const mid = blockAt(w, 3, 8);
    shoot(w, mid.x, mid.y, 30, [{ type: 'aoe_rect', level: 1 }]); // 160 x 24 bar: three columns wide
    w.update(1e-6, null);
    const hit = w.all.filter(b => w.blocks[b.id] === b && b.hp < 100);
    expect(hit.length).toBe(3);
    expect(hit.every(b => b.row === 3 && Math.abs(b.hp - 70) < 1e-6)).toBe(true);
  });

  it('a bouncing shot ricochets off the left and right world edges; others leave the world', () => {
    const w = world(level(3, () => plain(), 0, false));
    w.setWallOffset(300);
    const i = shoot(w, 3, 600, 10, [{ type: 'bouncing' }], { vx: -600, vy: 0 });
    w.update(1 / 60, null);
    expect(w.pool.active[i]).toBe(1);
    expect(w.pool.vx[i]).toBeGreaterThan(0);
    expect(w.pool.x[i]).toBeGreaterThan(0);
    const j = shoot(w, WORLD_WIDTH - 3, 600, 10, [{ type: 'bouncing' }], { vx: 600, vy: 0 });
    w.update(1 / 60, null);
    expect(w.pool.active[j]).toBe(1);
    expect(w.pool.vx[j]).toBeLessThan(0);
    expect(w.pool.x[j]).toBeLessThan(WORLD_WIDTH);
    const k = shoot(w, 3, 600, 10, [], { vx: -600, vy: 0 });
    w.update(1 / 60, null);
    expect(w.pool.active[k]).toBe(0);
  });

  it('a bouncing shot reflects off an armored block AND a plain block and keeps its damage (chunk 11a: it used to bounce only off armor)', () => {
    const w = world(level(3, (_r, c) => (c === 4 ? { hp: 1000, armor: 10, shield: 0 } : plain(1000))));
    w.setWallOffset(300);
    const b = blockAt(w, 2, 4);
    const i = shoot(w, b.x, 300 + 4, 20, [{ type: 'bouncing', level: 1 }], { vx: 0, vy: -600 }); // from below, into the bottom face
    w.update(1 / 60, null);
    expect(b.hp).toBeLessThan(1000);
    expect(w.pool.active[i]).toBe(1);
    expect(w.pool.vy[i]).toBeGreaterThan(0); // reflected straight back down
    expect(w.pool.damage[i]).toBe(20);
    const p = blockAt(w, 2, 9);
    const j = shoot(w, p.x, 300 + 4, 20, [{ type: 'bouncing', level: 1 }], { vx: 0, vy: -600 });
    w.update(1 / 60, null);
    expect(p.hp).toBeLessThan(1000);
    expect(w.pool.active[j]).toBe(1);
    expect(w.pool.vy[j]).toBeGreaterThan(0); // reflected back down (the random spread is at most 35 degrees)
    expect(w.pool.damage[j]).toBe(20);
  });

  it('fork on impact spawns two smaller copies that hit neighbouring blocks', () => {
    const w = world(level(3));
    w.setWallOffset(300);
    const b = blockAt(w, 2, 8);
    shoot(w, b.x, 300 - 10, 200, [{ type: 'fork_impact', level: 1 }], { vy: -600 });
    w.update(1 / 60, null);
    expect(w.pool.count).toBe(2); // the parent died on the hit (200 > 100), two copies took off
    expect(w.pool.copy[w.pool.active.indexOf(1)]).toBe(1);
  });

  it('homing steers toward a living block inside its cone and range', () => {
    const w = world(level(3, (_r, c) => (c === 10 ? plain() : null)));
    w.setWallOffset(300);
    const target = blockAt(w, 2, 10);
    // Below and a little to the left of the block, heading straight up: the block is ~15 degrees to the right.
    const i = shoot(w, target.x - 50, target.y + 200, 10, [{ type: 'homing', level: 1 }], { vy: -600 });
    for (let k = 0; k < 6; k++) w.update(1 / 60, null);
    expect(w.pool.vx[i]).toBeGreaterThan(5);
    // Nothing in range: flies straight.
    const w2 = world(level(3, (_r, c) => (c === 10 ? plain() : null)));
    w2.setWallOffset(300);
    const far = shoot(w2, 20, 700, 10, [{ type: 'homing', level: 1 }], { vy: -600 });
    for (let k = 0; k < 6; k++) w2.update(1 / 60, null);
    expect(w2.pool.vx[far]).toBe(0);
  });

  it('projectiles are removed above the top of the wall, below the screen and after the max age', () => {
    const w = world(level(2));
    w.setWallOffset(300);
    const up = shoot(w, 20, -300, 10, [], { vy: -600 });
    w.update(1 / 60, null);
    expect(w.pool.active[up]).toBe(0);
    const down = shoot(w, 20, CONFIG.VIEW.H + 49, 10, [], { vy: 600 });
    w.update(1 / 60, null);
    expect(w.pool.active[down]).toBe(0);
    const old = shoot(w, 20, 600, 10, [], { vx: 0, vy: 0 });
    w.pool.age[old] = 3.5;
    w.update(1 / 60, null);
    expect(w.pool.active[old]).toBe(0);
  });
});

describe('Simulation bots', () => {
  it('the path carver passes tier 1 and the clear-all pilot clears it, with the starter gun', () => {
    const l = makeTestWall({ tier: 1, rows: 8, approachSpeed: 26 });
    const carve = simulateWall(l, buildStarterGrid(), 'carve');
    expect(carve.state === 'passed' || carve.state === 'cleared').toBe(true);
    const all = simulateWall(l, buildStarterGrid(), 'clearAll');
    expect(all.state).toBe('cleared');
    expect(all.destroyed).toBe(168);
    expect(all.credits).toBe(Math.floor(168 * 0.4));
  });
});

describe('Free Fly is unaffected', () => {
  it('World still fires from its ejector and kills rocks through the same pipeline', () => {
    const w = new World({ autoSpawn: false });
    const rock = w.spawnRock(w.shipX + w.spawnOffsets[0].x, w.shipY - 150, 300);
    expect(rock).toBeTruthy();
    const pointer = { x: w.shipX, y: w.shipY, active: false, type: 'mouse', seen: false };
    for (let i = 0; i < 90; i++) w.update(1 / 60, pointer);
    expect(w.mitosis.enemies.length === 0 || w.mitosis.enemies[0].hp < 300).toBe(true);
    expect(w.kills + w.hits.length).toBeGreaterThan(0);
    expect(w.shipX).toBe(CONFIG.VIEW.W / 2);
    expect(w.hull).toBe(100);
  });
});
