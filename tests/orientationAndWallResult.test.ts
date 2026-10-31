import { describe, expect, it } from 'vitest';
import { wallResult } from '../src/wall/result';
import { CELL, PASS_MARGIN_CELLS, RESULT_DELAY_CLEARED, RESULT_DELAY_PASSED, WALL_COLS } from '../src/wall/constants';
import { BlockDef, LevelDef } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { buildStarterGrid } from '../src/game/starter';
import { richModel } from './helpers';
import { decodeLayout, loadBuilder } from '../src/builder/persist';
import { orientLegacyAuto } from '../src/engine/orient';
import { buildShuttleGrid } from '../src/game/gridUtils';
import { selectionAfterTap } from '../src/frontier/session';
import { FrontierWorld } from '../src/frontier/world';
import { FRONTIER_SEED } from '../src/frontier/constants';
import { squareLevel } from '../src/frontier/level';
import { planEncounter } from '../src/frontier/encounter';
import { World } from '../src/game/world';
import { rng } from '../src/rng';
import '../src/data/blocks';
import { jump } from './helpers/jump';

const plain: BlockDef = { hp: 100, armor: 0, shield: 0 };
function wall(rows: number, f: (r: number, c: number) => boolean): WallWorld {
  const cells: (BlockDef | null)[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < WALL_COLS; c++) cells.push(f(r, c) ? plain : null);
  const level: LevelDef = { tier: 1, cols: WALL_COLS, rows, cells, approachSpeed: 0, wrap: true };
  const w = new WallWorld(level, { grid: buildStarterGrid() });
  w.autoFire = false;
  w.setWallOffset(700);
  return w;
}
const LANE = 10 * CELL; // a column with no blocks in the walls below

describe('wallResult: the pure pass / clear decision', () => {
  it('none while blocks are left and the ship is below the pass line', () => {
    expect(wallResult({ alive: 5, shipY: 100, finishY: 50 })).toBeNull();
    expect(wallResult({ alive: 5, shipY: 50, finishY: 50 })).toBeNull(); // exactly on the line is not past it
  });
  it('passed once the ship is above the line with blocks left', () => {
    expect(wallResult({ alive: 5, shipY: 49.9, finishY: 50 })).toBe('passed');
  });
  it('cleared when no block is left, wherever the ship is', () => {
    expect(wallResult({ alive: 0, shipY: 400, finishY: 50 })).toBe('cleared');
  });
  it('cleared wins over passed when both happen in the same step', () => {
    expect(wallResult({ alive: 0, shipY: 10, finishY: 50 })).toBe('cleared');
  });
});

describe('wall results are instant and final', () => {
  it('the pass line is one cell beyond the last row, and the margin decides the moment of the pass', () => {
    expect(PASS_MARGIN_CELLS).toBe(1);
    const w = wall(4, (_r, c) => c === 0);
    const topOfWall = w.wallOffsetY - 4 * CELL;
    expect(w.finishY).toBeCloseTo(topOfWall - CELL, 9);
    jump(w, { x: LANE, y: topOfWall - CELL + 2 }, 1 / 60); // still inside the margin
    expect(w.state).toBe('playing');
    jump(w, { x: LANE, y: topOfWall - CELL - 2 }, 1 / 60); // past it: well before the old 8 cells
    expect(w.state).toBe('passed');
  });

  it('CLEARED: the world stops, the ship ignores the pointer, shots in flight are dropped, credits stay', () => {
    const w = wall(3, (r, c) => r === 2 && c === 0);
    jump(w, { x: LANE, y: 600 }, 1 / 60);
    const b = w.blocks[2 * WALL_COLS]!;
    w.projSys.modifiersTable = [[]];
    const i = w.pool.spawn(LANE, 650, 0, -10, 1, 0, 0);
    w.projSys.init(i);
    expect(w.pool.count).toBe(1);
    w.destroyBlock(b);
    jump(w, { x: LANE, y: 600 }, 1 / 60);
    expect(w.state).toBe('cleared');
    expect(w.pool.count).toBe(0);
    const credits = w.credits;
    const frozen = { t: w.time, x: w.shipX, y: w.shipY, off: w.wallOffsetY };
    for (let k = 0; k < 30; k++) w.update(1 / 60, { x: 3 * CELL, y: 200 });
    expect({ t: w.time, x: w.shipX, y: w.shipY, off: w.wallOffsetY }).toEqual(frozen);
    expect(w.state).toBe('cleared');
    expect(w.credits).toBe(credits);
  });

  it('PASSED: locks input, and the ship can no longer crash even if the pointer is dragged onto a block', () => {
    const w = wall(3, (_r, c) => c === 0);
    const topOfWall = w.wallOffsetY - 3 * CELL;
    jump(w, { x: LANE, y: topOfWall - CELL - 5 }, 1 / 60);
    expect(w.state).toBe('passed');
    const y = w.shipY;
    w.update(1 / 60, { x: 0, y: w.wallOffsetY - CELL });
    expect(w.shipY).toBe(y);
    expect(w.state).toBe('passed');
    expect(w.destroyed).toBe(0);
  });

  it('a clear and a pass in the same step is a clear', () => {
    const w = wall(2, (r, c) => r === 1 && c === 0);
    w.destroyBlock(w.blocks[1 * WALL_COLS]!);
    jump(w, { x: LANE, y: w.finishY - 10 }, 1 / 60);
    expect(w.state).toBe('cleared');
  });

  it('the result delays are short', () => {
    expect(RESULT_DELAY_CLEARED).toBeLessThanOrEqual(0.5);
    expect(RESULT_DELAY_PASSED).toBeLessThanOrEqual(0.5);
  });

  it('Free Fly square: reaching the full time clears at once, stops the world and drops the shots', () => {
    let fly = null;
    for (let x = 2; x < 60 && !fly; x++) fly = squareLevel(x, 11, FRONTIER_SEED).fly ?? null;
    const enc = { plan: planEncounter(fly!), wave: fly!.wave, tier: fly!.tier, hpMul: 1, duration: fly!.duration };
    const p = { x: 270, y: 800, active: false, type: 'mouse' as const, seen: true };
    rng.reset(1);
    const w = new World({ seed: 5, encounter: enc, grid: buildStarterGrid() });
    w.god = true;
    w.beginControl();
    for (let i = 0; i < 180 && w.pool.count === 0; i++) w.update(1 / 60, p);
    expect(w.pool.count).toBeGreaterThan(0);
    w.time = fly!.duration - 0.01;
    w.update(1 / 60, p);
    expect(w.survived).toBe(true);
    expect(w.gameOver).toBe(true);
    expect(w.pool.count).toBe(0);
    const t = w.time;
    w.update(1 / 60, p);
    expect(w.time).toBe(t);
  });
});

describe('Frontier: a hole cannot be selected', () => {
  it('a tap on empty space clears the selection, a tap on a square selects it', () => {
    const W = new FrontierWorld(FRONTIER_SEED);
    let hole: { x: number; y: number } | null = null;
    for (let y = -30; y <= 30 && !hole; y++) for (let x = -30; x <= 30; x++) if (W.isHole(x, y)) { hole = { x, y }; break; }
    expect(hole).not.toBeNull();
    expect(selectionAfterTap(W.isHole(hole!.x, hole!.y), hole!.x, hole!.y)).toBeNull();
    expect(selectionAfterTap(W.isHole(0, 0), 0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('orientation is stored: chosen once at placement', () => {
  const rotations = (m: ReturnType<typeof richModel>) => m.grid.cells.filter(c => c.blockId).map(c => `${c.x},${c.y}:${c.blockId}:${c.rotation}`);

  it('a new block faces the way the signal reaches it; no other block changes, even when the path changes', () => {
    const m = richModel(null);
    const before = rotations(m);
    expect(m.place(6, 8, 'flat_plus').ok).toBe(true); // between the two turns: the line runs east there
    expect(m.cellAt(6, 8)!.rotation).toBe(90);
    expect(rotations(m).filter(s => !s.startsWith('6,8:'))).toEqual(before);

    // A block that changes the whole path: a Turn Left in the first column cell. Everything downstream is now off the path.
    const mid = rotations(m);
    expect(m.place(5, 9, 'turn_l').ok).toBe(true);
    expect(m.cellAt(5, 9)!.rotation).toBe(0);
    expect(rotations(m).filter(s => !s.startsWith('5,9:'))).toEqual(mid);
    expect(m.compiled.recipes.length).toBe(0); // the old route is cut, and nothing rotated to repair it
  });

  it('removing or rotating one block leaves every other orientation alone', () => {
    const m = richModel(null);
    m.place(6, 8, 'flat_plus');
    const base = rotations(m);
    m.rotate(6, 8, 1);
    expect(rotations(m).filter(s => !s.startsWith('6,8:'))).toEqual(base.filter(s => !s.startsWith('6,8:')));
    m.remove(5, 8); // the first turn
    expect(m.cellAt(8, 8)!.rotation).toBe(90);
    expect(m.cellAt(8, 5)!.rotation).toBe(0);
  });

  it('Auto-orient turns only the selected block, once; an off-line block stays as it is', () => {
    const m = richModel(null);
    m.place(3, 3, 'percent_mult'); // off the line
    m.rotate(3, 3, 1);
    m.rotate(8, 5, 1); // the Flat+ on the line, now facing the wrong way
    expect(m.compiled.recipes.length).toBe(0);
    m.autoOrient(8, 5);
    expect(m.cellAt(8, 5)!.rotation).toBe(0);
    expect(m.compiled.recipes.length).toBe(1);
    expect(m.cellAt(3, 3)!.rotation).toBe(90); // untouched
    m.autoOrient(3, 3); // no signal reaches it: nothing to face
    expect(m.cellAt(3, 3)!.rotation).toBe(90);
    // The Flat+ keeps its facing when the path later changes (no continuous auto).
    m.place(5, 9, 'turn_l');
    expect(m.cellAt(8, 5)!.rotation).toBe(0);
  });

  it('undo / redo restore orientations exactly', () => {
    const m = richModel(null);
    const a = rotations(m);
    m.place(6, 8, 'flat_plus');
    const b = rotations(m);
    m.place(5, 9, 'turn_l');
    m.undo(); expect(rotations(m)).toEqual(b);
    m.undo(); expect(rotations(m)).toEqual(a);
    m.redo(); m.redo();
    expect(m.cellAt(5, 9)!.rotation).toBe(0);
    expect(m.cellAt(6, 8)!.rotation).toBe(90);
  });

  it('copy / paste keeps stored orientations, including a deliberately wrong one', () => {
    const m = richModel(null);
    m.rotate(8, 5, 1);
    const clip = m.copyLayout();
    m.clearAll();
    expect(m.pasteLayout(clip).ok).toBe(true);
    expect(m.cellAt(8, 5)!.rotation).toBe(90);
  });

  it('the preview of a placement matches what placing gives', () => {
    const m = richModel(null);
    const p = m.previewPlace(6, 8, 'flat_plus')!;
    expect(p.grid.cells[8 * p.grid.w + 6].rotation).toBe(90);
    expect(p.compiled.stats.damagePerShot).toBe(3);
    m.place(6, 8, 'flat_plus');
    expect(m.compiled.stats.damagePerShot).toBe(3);
  });
});

describe('save migration: blocks that were in auto mode are oriented once, against the circuit as saved', () => {
  const v2 = (entries: object[]) => JSON.stringify({ version: 2, hulls: { shuttle: { active: 'A', slots: { A: entries, B: [] } } } });

  it('a version-2 default circuit (all auto, rotation 0) loads with the same working path and version 3', () => {
    const raw = v2([
      { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, manual: false },
      { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 0, manual: false },
      { x: 8, y: 5, blockId: 'flat_plus', level: 1, rotation: 0, manual: false },
    ]);
    const s = loadBuilder(raw);
    expect(s.version).toBe(3);
    expect(s.hulls.shuttle.slots.A.map(e => e.rotation)).toEqual([0, 90, 0]);
    expect(s.hulls.shuttle.slots.A.every(e => !('manual' in e))).toBe(true);
    const d: Record<string, string> = { 'mgbm.builder.v2': raw };
    const storage = { getItem: (k: string) => d[k] ?? null, setItem: (k: string, v: string) => { d[k] = v; } };
    const m = richModel(storage);
    expect(m.compiled.recipes.length).toBe(1);
    expect(m.compiled.stats.damagePerShot).toBe(2);
  });

  it('manual blocks keep their rotation; blocks that are never reached keep 0', () => {
    const s = loadBuilder(v2([
      { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, manual: false },
      { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 0, manual: false },
      { x: 8, y: 5, blockId: 'flat_plus', level: 1, rotation: 180, manual: true }, // facing down: the signal is stopped here
      { x: 8, y: 3, blockId: 'percent_mult', level: 1, rotation: 0, manual: false }, // never reached
    ]));
    expect(s.hulls.shuttle.slots.A.map(e => e.rotation)).toEqual([0, 90, 180, 0]);
  });

  it('a block is oriented by the line the block before it makes (a chain of two turns, listed in the wrong order)', () => {
    const g = buildShuttleGrid();
    for (const [x, y, id] of [[5, 8, 'turn_r'], [8, 8, 'turn_l']] as [number, number, string][]) g.cells[y * g.w + x].blockId = id;
    orientLegacyAuto(g, [8 * g.w + 8, 8 * g.w + 5]);
    expect(g.cells[8 * g.w + 5].rotation).toBe(0);
    expect(g.cells[8 * g.w + 8].rotation).toBe(90);
  });

  it('an old layout on the clipboard (v2, auto blocks) is oriented when pasted', () => {
    const clip = JSON.stringify({ mgbm: 'layout', v: 2, hull: 'shuttle', blocks: [
      { x: 5, y: 8, blockId: 'turn_r', level: 1, rotation: 0, manual: false },
      { x: 8, y: 8, blockId: 'turn_l', level: 1, rotation: 0, manual: false },
    ] });
    const r = decodeLayout(clip, 'shuttle');
    expect(r.ok && r.entries.map(e => e.rotation)).toEqual([0, 90]);
  });
});
