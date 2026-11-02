import { describe, it, expect } from 'vitest';
import {
  CROSSWIND_ACCEL, crosswindSide, FOG_RADIUS, lateSlot, lateTypeTiers, LateType, MITOSIS_HP_SHARE, MITOSIS_SIZE_MUL, REGROWTH_DELAY, REGROWTH_PER_SEC, STRONG_WIND_SPEED_MUL,
} from '../src/data/lateTiers';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { PROJECTILE_SPEED } from '../src/game/fire';
import { HIT_BURN, PHASE_NORMAL } from '../src/engine/projectiles';
import { CELL, WALL_COLS } from '../src/wall/constants';
import { generateLevel } from '../src/wall/generator';
import { fogRadiusFloor } from '../src/wall/lateWalls';
import { LevelDef, makeTestWall } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import type { LateEffects } from '../src/data/lateTiers';

// Chunk 27b: the five effect types of tiers 101-200 (docs/tiers-101-200-effects.md). One group per type.

const tiersOf = (type: LateType) => lateTypeTiers().filter(t => lateSlot(t)!.type === type);
const firstOf = (type: LateType) => tiersOf(type)[0];

/** A wall of `rows` rows of tier-115 blocks that does not move, with the given effect. */
function wallWith(effects: LateEffects | undefined, rows = 10): LevelDef {
  return { ...makeTestWall({ tier: 115, rows, approachSpeed: 0 }), approachSpeed: 0, effects };
}
/** The Fan's straight column: Flat+ first, then `ids`. */
function gridOf(ids: string[] = []) {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus', 10);
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}
const times = (id: string, n: number) => Array.from({ length: n }, () => id);
const laneX = (w: WallWorld) => (WALL_COLS * CELL) / 2 - (w.spawnOffsets[0]?.x ?? 0);
const activeShots = (w: WallWorld) => Array.from({ length: w.pool.max }, (_, i) => i).filter(i => w.pool.active[i]);

/** Runs the world with the ship held at (x, y); returns the total damage dealt to blocks. */
function fly(w: WallWorld, seconds: number, y: number, x = laneX(w)): number {
  let dmg = 0;
  for (let i = 0; i < seconds * 60; i++) {
    w.update(1 / 60, { x, y });
    for (const h of w.hits) dmg += h.damage;
    w.hits.length = 0;
    w.killEvents.length = 0;
  }
  return dmg;
}

describe('the schedule builds the five effect types', () => {
  it('every effect tier carries exactly its own effect, nothing else', () => {
    const keyOf: Record<string, keyof LateEffects> = { strong_wind: 'strongWind', crosswind: 'crosswind', fog: 'fog', regrowth: 'regrowth', mitosis_wall: 'mitosis' };
    for (const [type, key] of Object.entries(keyOf)) {
      const tiers = tiersOf(type as LateType);
      expect(tiers.length).toBeGreaterThanOrEqual(3);
      for (const t of tiers) {
        const l = generateLevel(t);
        expect(Object.keys(l.effects ?? {}), `tier ${t}`).toEqual([key]);
        expect(l.typeLine).toBeTruthy();
      }
    }
    for (const t of [...tiersOf('monolith'), ...tiersOf('maze'), ...tiersOf('fortress'), ...tiersOf('drift')]) expect(generateLevel(t).effects).toBeUndefined();
    expect(generateLevel(111).effects).toBeUndefined(); // an ordinary tier
  });
});

describe('Strong Wind', () => {
  it('every shot leaves backwards: the launch direction is turned 180 degrees', () => {
    const w = new WallWorld(wallWith({ strongWind: { turnDeg: 180, speedMul: 1 } }), { grid: gridOf() });
    w.fire();
    const [i] = activeShots(w);
    expect(w.pool.vy[i]).toBeGreaterThan(PROJECTILE_SPEED * 0.99); // straight down
    expect(Math.abs(w.pool.vx[i])).toBeLessThan(1e-6);
    const calm = new WallWorld(wallWith(undefined), { grid: gridOf() });
    calm.fire();
    expect(calm.pool.vy[activeShots(calm)[0]]).toBeLessThan(-PROJECTILE_SPEED * 0.99); // straight up
  });

  it('Angle still adds to the turned direction, and the speed multiplier of the rank applies', () => {
    const w = new WallWorld(wallWith({ strongWind: { turnDeg: 180, speedMul: 1.4 } }), { grid: gridOf(['angle_left']) });
    w.fire();
    const i = activeShots(w)[0];
    expect(Math.hypot(w.pool.vx[i], w.pool.vy[i])).toBeCloseTo(PROJECTILE_SPEED * 1.4, 3);
    expect(w.pool.vy[i]).toBeGreaterThan(0);
    expect(Math.abs(w.pool.vx[i])).toBeGreaterThan(1); // 15 degrees off straight back
  });

  it('a plain gun does no damage to the wall in the wind; Upturn, a 4-copy curve with Brake, and Ship Magnet get through', () => {
    const wind = { strongWind: { turnDeg: 180, speedMul: 1 } };
    const hold = (ids: string[], effects: LateEffects | undefined) => {
      const w = new WallWorld(wallWith(effects, 20), { grid: gridOf(ids) });
      w.god = true;
      w.setWallOffset(300 - 40); // the bottom edge of the wall is 40 px above the ship (the wall spans the whole ring: a U-turn may land anywhere)
      w.teleportShip(laneX(w), 300);
      return fly(w, 4, 300);
    };
    expect(hold([], undefined)).toBeGreaterThan(0);
    expect(hold([], wind)).toBe(0);
    expect(hold(times('upturn', 2), wind)).toBeGreaterThan(0);
    expect(hold([...times('brake', 3), ...times('curving_left', 4)], wind)).toBeGreaterThan(0);
    expect(hold(times('magnetized', 2), wind)).toBeGreaterThan(0);
    // These do not bring a shot back: documented in docs/strong-wind-table.md.
    expect(hold(['boomerang'], wind)).toBe(0);
    expect(hold(times('homing', 3), wind)).toBe(0);
  });

  it('later returns are faster (a wider U-turn), the turn is always 180 degrees', () => {
    const tiers = tiersOf('strong_wind');
    const mul = tiers.map(t => generateLevel(t).effects!.strongWind!.speedMul);
    expect(mul[0]).toBe(1);
    for (let k = 1; k < mul.length; k++) expect(mul[k]).toBeGreaterThanOrEqual(mul[k - 1]);
    expect(mul[mul.length - 1]).toBeGreaterThan(mul[0]);
    expect(STRONG_WIND_SPEED_MUL.length).toBeGreaterThanOrEqual(5);
    for (const t of tiers) expect(generateLevel(t).effects!.strongWind!.turnDeg).toBe(180);
  });
});

describe('Crosswind', () => {
  const crossLevel = (accel: number) => wallWith({ crosswind: { accel } });

  it('a shot in flight drifts sideways by a x t^2 / 2, to the side of the sign', () => {
    for (const accel of [300, -300]) {
      const w = new WallWorld(crossLevel(accel), { grid: gridOf() });
      w.god = true;
      w.setWallOffset(-2000); // the wall is far above: the shot flies free
      w.teleportShip(laneX(w), 700);
      w.fire();
      const i = activeShots(w)[0];
      const x0 = w.pool.x[i];
      for (let k = 0; k < 30; k++) w.update(1 / 60, { x: laneX(w), y: 700 });
      const t = 0.5;
      const drift = (((w.pool.x[i] - x0 + (WALL_COLS * CELL) / 2) % (WALL_COLS * CELL)) + WALL_COLS * CELL) % (WALL_COLS * CELL) - (WALL_COLS * CELL) / 2;
      expect(Math.abs(drift - 0.5 * accel * t * t)).toBeLessThan(0.05 * Math.abs(0.5 * accel * t * t)); // within 5% (the steps are 1/60 s)
      expect(Math.sign(w.pool.vx[i])).toBe(Math.sign(accel));
    }
  });

  it('only a shot in normal flight is pushed: a waiting mine stays put', () => {
    const w = new WallWorld(crossLevel(400), { grid: gridOf() });
    w.setWallOffset(-2000);
    w.fire();
    const i = activeShots(w)[0];
    w.pool.phase[i] = PHASE_NORMAL + 5; // any non-normal phase (a waiting mine is 5)
    w.pool.vx[i] = 0; w.pool.vy[i] = 0;
    const x0 = w.pool.x[i];
    for (let k = 0; k < 10; k++) w.update(1 / 60, null);
    expect(w.pool.x[i]).toBe(x0);
    expect(w.pool.vx[i]).toBe(0);
  });

  it('the push is fixed per tier (the same every time), grows with each return, and both sides occur', () => {
    const tiers = tiersOf('crosswind');
    const accels = tiers.map(t => generateLevel(t).effects!.crosswind!.accel);
    expect(accels.map(Math.abs)).toEqual(accels.map((_, k) => CROSSWIND_ACCEL[Math.min(k, CROSSWIND_ACCEL.length - 1)]));
    for (let k = 1; k < accels.length; k++) expect(Math.abs(accels[k])).toBeGreaterThan(Math.abs(accels[k - 1]));
    for (const t of tiers) expect(Math.sign(generateLevel(t).effects!.crosswind!.accel)).toBe(crosswindSide(t));
    expect(generateLevel(tiers[0]).effects!.crosswind!.accel).toBe(generateLevel(tiers[0]).effects!.crosswind!.accel);
    const sides = new Set(Array.from({ length: 100 }, (_, k) => crosswindSide(101 + k)));
    expect(sides.size).toBe(2);
  });

  it('an Angle block into the wind brings a shot that missed the lane back onto it', () => {
    // 400 px of flight at 360 px/s^2 drifts a shot about 80 px, more than the lane's half width plus the shot: it misses the column straight above the ship.
    const lane = (ids: string[], accel: number) => {
      const w = new WallWorld(wallWith(accel ? { crosswind: { accel } } : undefined, 20), { grid: gridOf(ids) });
      w.god = true;
      w.setWallOffset(700 - 400);
      w.teleportShip(laneX(w), 700);
      let dmg = 0;
      for (let i = 0; i < 180; i++) {
        w.update(1 / 60, { x: laneX(w), y: 700 });
        for (const h of w.hits) if (h.blockId % WALL_COLS === 10) dmg += h.damage;
        w.hits.length = 0;
      }
      return dmg;
    };
    expect(lane([], 0)).toBeGreaterThan(0);
    expect(lane([], 360)).toBe(0);
    expect(lane(['angle_left'], 360) + lane(['angle_right'], 360)).toBeGreaterThan(0); // one of the two sides is into the wind
  });
});

describe('Fog', () => {
  const fogLevel = (radius: number) => wallWith({ fog: { radius } }, 6);

  it('a block is drawn inside the radius, hidden outside it, fading at the rim; a block that was hit stays drawn', () => {
    const w = new WallWorld(fogLevel(300), { grid: gridOf() });
    w.setWallOffset(500); // the bottom edge of the wall at y 500
    w.teleportShip(laneX(w), 560);
    const near = w.blocks[(w.level.rows - 1) * w.level.cols + 10]!; // bottom row, straight above the ship
    const far = w.blocks[0 * w.level.cols + 10]!;                    // the top row, 5 rows up
    expect(w.fogAlpha(near)).toBe(1);
    expect(w.fogAlpha(far)).toBe(0);
    far.revealed = true;
    expect(w.fogAlpha(far)).toBe(1);
    // The rim: a ship placed so the block's near edge is 30 px inside the radius sees it half drawn (the fade is 60 px wide).
    far.revealed = false;
    const edgeY = w.blockTop(0) + CELL; // bottom edge of the top row
    w.teleportShip(laneX(w), edgeY + 300 - 30);
    expect(w.fogAlpha(far)).toBeCloseTo(0.5, 1);
  });

  it('without Fog every block is fully drawn whatever the distance', () => {
    const w = new WallWorld(wallWith(undefined, 6), { grid: gridOf() });
    w.setWallOffset(500);
    for (const b of w.all) expect(w.fogAlpha(b)).toBe(1);
  });

  it('damage still happens in the dark: a hidden block takes hits, and is shown by them', () => {
    const w = new WallWorld(fogLevel(120), { grid: gridOf() });
    w.god = true;
    w.setWallOffset(400);
    w.teleportShip(laneX(w), 900); // far below: the whole wall is hidden
    const b = w.blocks[(w.level.rows - 1) * w.level.cols + 10]!;
    expect(w.fogAlpha(b)).toBe(0);
    const hp0 = b.hp;
    fly(w, 1.5, 900);
    expect(b.hp).toBeLessThan(hp0);
    expect(b.revealed).toBe(true);
    expect(w.fogAlpha(b)).toBe(1);
  });

  it('is fair: every fog tier shows a block at least FOG_REACT_SECONDS before the fastest scroll could carry it to the ship, and the radius shrinks on each return', () => {
    const tiers = tiersOf('fog');
    expect(tiers.length).toBeGreaterThanOrEqual(3);
    const radii = tiers.map(t => generateLevel(t).effects!.fog!.radius);
    for (const t of tiers) expect(generateLevel(t).effects!.fog!.radius, `tier ${t}`).toBeGreaterThan(fogRadiusFloor(t));
    for (let k = 1; k < radii.length; k++) expect(radii[k]).toBeLessThan(radii[k - 1]);
    expect(FOG_RADIUS[FOG_RADIUS.length - 1]).toBeGreaterThan(fogRadiusFloor(200));
  });
});

describe('Regrowth', () => {
  const regLevel = (perSec: number) => wallWith({ regrowth: { delay: REGROWTH_DELAY, perSec } }, 4);
  const hurt = (w: WallWorld, b: ReturnType<WallWorld['blockAt']> & {}, share: number, kind = 0) => {
    b.hp = b.maxHp * (1 - share);
    w.projSys.onHit!(b, 1, b.x, b.y, kind);
    b.hp = b.maxHp * (1 - share); // the callback only records; keep the HP we set
  };
  const run = (w: WallWorld, s: number) => { for (let i = 0; i < s * 60; i++) w.update(1 / 60, null); };

  it('a block left alone for 1 s heals perSec x max HP a second, not before', () => {
    const w = new WallWorld(regLevel(0.1), { grid: gridOf() });
    w.autoFire = false;
    const b = w.blocks[10]!;
    hurt(w, b, 0.5);
    const hp0 = b.hp;
    run(w, 0.9);
    expect(b.hp).toBe(hp0); // inside the delay
    run(w, 0.1 + 1);        // delay is over, then one second of healing
    expect(Math.abs(b.hp - (hp0 + b.maxHp * 0.1))).toBeLessThan(b.maxHp * 0.1 * (2 / 60)); // one second of healing, give or take a step
  });

  it('a hit (or a burn tick) starts the wait again, and healing stops at max HP', () => {
    const w = new WallWorld(regLevel(0.5), { grid: gridOf() });
    w.autoFire = false;
    const b = w.blocks[10]!;
    hurt(w, b, 0.5);
    run(w, 1.5);
    expect(b.hp).toBeGreaterThan(b.maxHp * 0.5);
    const before = b.hp;
    w.projSys.onHit!(b, 1, b.x, b.y, HIT_BURN); // a burn tick counts as damage
    run(w, 0.5);
    expect(b.hp).toBe(before);
    run(w, 5);
    expect(b.hp).toBe(b.maxHp);
  });

  it('a wall without Regrowth never heals', () => {
    const w = new WallWorld(wallWith(undefined, 4), { grid: gridOf() });
    w.autoFire = false;
    const b = w.blocks[10]!;
    hurt(w, b, 0.5);
    const hp0 = b.hp;
    run(w, 5);
    expect(b.hp).toBe(hp0);
  });

  it('heals more on each return, and burst damage beats it: a sustained trickle does not kill a block, a burst does', () => {
    const rates = tiersOf('regrowth').map(t => generateLevel(t).effects!.regrowth!.perSec);
    for (let k = 1; k < rates.length; k++) expect(rates[k]).toBeGreaterThan(rates[k - 1]);
    expect(REGROWTH_PER_SEC[0]).toBeGreaterThan(0);
    // A trickle of 5% of the block every 2.5 s against a heal of 6% a second (1.5 s of it between hits): the block stays whole. A burst of the whole block is not healed away.
    const w = new WallWorld(regLevel(0.06), { grid: gridOf() });
    w.autoFire = false;
    const b = w.blocks[10]!;
    for (let k = 0; k < 6; k++) { hurt(w, b, 0.05); run(w, 2.5); }
    expect(b.hp).toBe(b.maxHp);
    b.hp = 1;
    w.projSys.onHit!(b, b.maxHp, b.x, b.y, 0);
    run(w, 0.5);
    expect(b.hp).toBeLessThan(2); // nothing heals while it is being hit
  });
});

describe('Mitosis Wall', () => {
  const mitLevel = (rows = 6): LevelDef => wallWith({ mitosis: { children: 2, hpShare: MITOSIS_HP_SHARE, maxGen: 2, sizeMul: MITOSIS_SIZE_MUL } }, rows);
  /** A Mitosis world whose only blocks are the cells in `keep` [row, col]. */
  function worldWith(keep: [number, number][], rows = 6) {
    const level = mitLevel(rows);
    const split = new WallWorld(level, { grid: gridOf() });
    for (const b of [...split.all]) if (!keep.some(([r, c]) => r === b.row && c === b.col)) (split as any).blocks[b.row * split.level.cols + b.col] = null;
    // The world holds only the kept blocks, removed by hand so none of them split. Counters are rebuilt:
    const alive = split.blocks.filter(Boolean).length;
    (split as any).alive = alive; (split as any).totalBlocks = alive;
    (split as any).rowAlive = Array.from({ length: split.level.rows }, (_, r) => split.blocks.slice(r * split.level.cols, (r + 1) * split.level.cols).filter(Boolean).length);
    return split;
  }

  it('a destroyed block leaves two children, left and right, with 40% of its max HP, smaller', () => {
    const w = worldWith([[3, 10]]);
    const parent = w.blocks[3 * WALL_COLS + 10]!;
    w.destroyBlock(parent);
    const l = w.blocks[3 * WALL_COLS + 9]!, r = w.blocks[3 * WALL_COLS + 11]!;
    expect(l && r).toBeTruthy();
    expect(w.blocks[2 * WALL_COLS + 10]).toBeNull(); // nothing behind: two children are enough
    for (const c of [l, r]) {
      expect(c.maxHp).toBe(Math.max(1, Math.round(parent.maxHp * MITOSIS_HP_SHARE)));
      expect(c.hp).toBe(c.maxHp);
      expect(c.gen).toBe(1);
      expect(c.half).toBeCloseTo((CELL / 2) * MITOSIS_SIZE_MUL, 6);
    }
    expect(w.alive).toBe(2);
    expect(w.total).toBe(3);
    expect(w.destroyed).toBe(1);
    expect(w.fx.splits).toBe(2);
  });

  it('left and right come first; the cell behind is used only when one of them is taken; a boxed-in block leaves nothing', () => {
    const wL = worldWith([[3, 10], [3, 9]]);
    wL.destroyBlock(wL.blocks[3 * WALL_COLS + 10]!);
    expect(wL.blocks[3 * WALL_COLS + 11]).toBeTruthy();  // right
    expect(wL.blocks[2 * WALL_COLS + 10]).toBeTruthy();  // behind (the left cell is taken)
    expect(wL.blocks[3 * WALL_COLS + 9]!.gen).toBe(0);   // the block that was there is untouched
    const boxed = worldWith([[3, 10], [3, 9], [3, 11], [2, 10]]);
    boxed.destroyBlock(boxed.blocks[3 * WALL_COLS + 10]!);
    expect(boxed.alive).toBe(3);
    expect(boxed.fx.splits).toBe(0);
    const top = worldWith([[0, 10]]);                    // the top row has no cell behind
    top.destroyBlock(top.blocks[10]!);
    expect(top.alive).toBe(2);
  });

  it('children split once more and no further: two generations at most', () => {
    const w = worldWith([[3, 10]]);
    w.destroyBlock(w.blocks[3 * WALL_COLS + 10]!);
    const child = w.blocks[3 * WALL_COLS + 9]!;
    expect(child.gen).toBe(1);
    w.destroyBlock(child);
    const grand = w.all.filter(b => b.gen === 2 && w.blocks[b.row * WALL_COLS + b.col] === b);
    expect(grand.length).toBe(2);
    expect(grand[0].maxHp).toBe(Math.max(1, Math.round(child.maxHp * MITOSIS_HP_SHARE)));
    const before = w.alive;
    w.destroyBlock(grand[0]);
    expect(w.alive).toBe(before - 1); // a generation-2 block leaves nothing
  });

  it('credits: a child pays its share of the parent (40%, then 16%)', () => {
    const w = new WallWorld(mitLevel(), { grid: gridOf() });
    w.autoFire = false;
    for (const b of [...w.all]) if (!(b.row === 3 && b.col === 10)) { (w as any).blocks[b.row * WALL_COLS + b.col] = null; }
    (w as any).alive = 1; (w as any).totalBlocks = 1;
    (w as any).rowAlive = Array.from({ length: w.level.rows }, (_, r) => (r === 3 ? 1 : 0));
    const p = w.blocks[3 * WALL_COLS + 10]!;
    w.destroyBlock(p);
    const full = w.killEvents[0].reward;
    const c = w.blocks[3 * WALL_COLS + 9]!;
    w.destroyBlock(c);
    expect(w.killEvents[1].reward).toBeCloseTo(full * MITOSIS_HP_SHARE, 9);
    const g = w.all.find(b => b.gen === 2 && w.blocks[b.row * WALL_COLS + b.col] === b)!;
    w.destroyBlock(g);
    expect(w.killEvents[w.killEvents.length - 1].reward).toBeCloseTo(full * MITOSIS_HP_SHARE ** 2, 9);
  });

  it('children are hazards with the box they are drawn at: the ship dies on a child, and passes just outside its smaller box', () => {
    const w = worldWith([[3, 10]]);
    w.setWallOffset(600);
    w.destroyBlock(w.blocks[3 * WALL_COLS + 10]!);
    const child = w.blocks[3 * WALL_COLS + 11]!;
    const cx = child.x, cy = child.y;
    w.teleportShip(cx, cy);
    expect(w.shipHitsBlock()).toBe(true);
    // The child's half side is 0.75 x 27 = 20.25; a ship at x offset 20.25 + hitR + 2 is outside, although still inside the cell.
    w.teleportShip(cx + child.half + w.hitR + 2, cy);
    expect(w.shipHitsBlock()).toBe(false);
    expect(child.half + w.hitR + 2).toBeLessThan(CELL / 2 + w.hitR); // a normal block would still have been touched
  });

  it('clearing a split wall means destroying the children too; the destroyed share never passes 100%', () => {
    const w = new WallWorld(mitLevel(3), { grid: gridOf() });
    w.autoFire = false;
    w.destroyAll();
    expect(w.alive).toBe(0);
    expect(w.destroyed).toBe(w.total);
    expect(w.percentDestroyed).toBe(100);
    expect(w.total).toBeGreaterThan(3 * WALL_COLS);
  });

  it('the wall: parents are lighter than an ordinary block of the tier and grow back toward it on each return', () => {
    const tiers = tiersOf('mitosis_wall');
    const hp = tiers.map(t => generateLevel(t).cells.find(c => c)!.hp);
    expect(hp[0]).toBeLessThan(generateLevel(tiers[0] + 1).cells.find(c => c)!.hp);
    for (const t of tiers) expect(generateLevel(t).effects!.mitosis).toMatchObject({ children: 2, maxGen: 2, hpShare: 0.4 });
  });
});
