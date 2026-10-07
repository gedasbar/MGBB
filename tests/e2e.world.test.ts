import { describe, it, expect } from 'vitest';
import { World } from '../src/game/world';
import { buildStarterGrid, ROCK_HP } from '../src/game/starter';
import { compile, Grid } from '../src/engine/compiler';
import { clientToGame, PointerState } from '../src/input';

/**
 * End-to-end: real compiler, real World loop, real ProjectileSystem / damage / mitosis.
 * No mocks.
 */
function runUntil(world: World, pointer: PointerState, maxTicks: number, done: () => boolean) {
  for (let t = 0; t < maxTicks; t++) {
    world.update(1 / 60, pointer);
    if (done()) return t + 1;
  }
  return -1;
}

describe('starter loadout end-to-end', () => {
  it('starter grid compiles to at least one recipe that includes Flat+ damage', () => {
    const { recipes } = compile(buildStarterGrid());
    expect(recipes.length).toBeGreaterThan(0);
    expect(recipes[0].direction).toBe('N');
    expect(recipes[0].packet.damage).toBe(101); // generator 1 + Flat+ L1 100
    expect(Math.ceil(ROCK_HP / recipes[0].packet.damage)).toBeGreaterThanOrEqual(2);
    expect(Math.ceil(ROCK_HP / recipes[0].packet.damage)).toBeLessThanOrEqual(3);
  });

  it('ship fires, rock in front takes damage, dies and splits into children', () => {
    const world = new World({ autoSpawn: false });
    expect(world.recipes.length).toBeGreaterThan(0);

    const pointer: PointerState = { x: world.shipX, y: world.shipY, active: false, type: 'mouse', seen: true };
    const rock = world.spawnRock(world.shipX, world.shipY - 250)!;
    expect(rock).not.toBeNull();
    const rockId = rock.id;
    const startHp = rock.hp;

    // Keep the ship under the rock (it sways sideways), as a player would.
    const track = () => {
      const r = world.mitosis.enemies.find(e => e.id === rockId);
      if (r) pointer.x = r.x;
    };

    // 1) HP drops
    let hpDropped = false;
    for (let t = 0; t < 120 && !hpDropped; t++) {
      track();
      world.update(1 / 60, pointer);
      const r = world.mitosis.enemies.find(e => e.id === rockId);
      if (!r || r.hp < startHp) hpDropped = true;
    }
    expect(hpDropped).toBe(true);
    expect(world.hits.length).toBeGreaterThan(0);
    expect(world.hits[0].damage).toBeGreaterThan(0);

    // 2) it dies
    let died = false;
    for (let t = 0; t < 180 && !died; t++) {
      track();
      world.update(1 / 60, pointer);
      died = !world.mitosis.enemies.some(e => e.id === rockId);
    }
    expect(died).toBe(true);
    const hitsOnRock = world.hits.filter(h => h.enemyId === rockId).length;
    expect(hitsOnRock).toBeGreaterThanOrEqual(2);
    expect(hitsOnRock).toBeLessThanOrEqual(3);

    // 3) children spawned
    const split = world.splits.find(s => s.parentId === rockId);
    expect(split).toBeDefined();
    expect(split!.childIds.length).toBe(2);
    const children = world.mitosis.enemies.filter(e => split!.childIds.includes(e.id));
    expect(children.length).toBe(2);
    for (const c of children) {
      expect(c.generation).toBe(2);
      expect(c.hp).toBeGreaterThan(0);
      expect(c.hp).toBeLessThan(ROCK_HP);
    }
  });

  it('fails to damage anything when the compiler produces no recipes', () => {
    // Guard: proves the test above depends on compiled recipes, not on a hard-coded shot.
    const empty: Grid = buildStarterGrid();
    empty.cells = empty.cells.map(c => ({ ...c, blockId: null, type: 'empty' as const }));
    const world = new World({ grid: empty, autoSpawn: false });
    expect(world.recipes.length).toBe(0);
    const pointer: PointerState = { x: world.shipX, y: world.shipY, active: false, type: 'mouse', seen: true };
    const rock = world.spawnRock(world.shipX, world.shipY - 250)!;
    const ticks = runUntil(world, pointer, 120, () => rock.hp < ROCK_HP);
    expect(ticks).toBe(-1);
    expect(world.pool.count).toBe(0);
  });

  it('mouse puts the ship centre exactly on the pointer; touch adds an offset', () => {
    const world = new World({ autoSpawn: false });
    const mouse: PointerState = { x: 123, y: 456, active: false, type: 'mouse', seen: true };
    world.update(1 / 60, mouse);
    expect(world.shipX).toBe(123);
    expect(world.shipY).toBe(456);

    const touch: PointerState = { x: 200, y: 600, active: true, type: 'touch', seen: true };
    world.update(1 / 60, touch);
    expect(world.shipX).toBe(200);
    expect(world.shipY).toBe(560);
  });
});

describe('clientToGame', () => {
  it('maps through scale and letterbox offset', () => {
    // 540x960 content drawn at scale 0.5 in a 600x480 box at (100, 50): letterboxed horizontally.
    const rect = { left: 100, top: 50, width: 600, height: 480 };
    // content width = 270, so left bar = (600-270)/2 = 165
    expect(clientToGame(100 + 165, 50, rect)).toEqual({ x: 0, y: 0 });
    expect(clientToGame(100 + 165 + 135, 50 + 240, rect)).toEqual({ x: 270, y: 480 });
    expect(clientToGame(100 + 165 + 270, 50 + 480, rect)).toEqual({ x: 540, y: 960 });
  });
});
