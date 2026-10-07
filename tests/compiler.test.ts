import { describe, it, expect } from 'vitest';
import { compile, Grid, GridCell, Segment } from '../src/engine/compiler';
import { Dir, Rotation } from '../src/engine/compilerTypes';
import { buildFanGrid, buildShuttleGrid, parseLayout } from '../src/game/gridUtils';
import { buildStarterGrid } from '../src/game/starter';
import '../src/data/blocks';

// All coordinates in this file are 1-indexed (col,row), as in the hull diagram.
const idx = (g: Grid, col: number, row: number) => (row - 1) * g.w + (col - 1);
const ref = (col: number, row: number) => ({ x: col - 1, y: row - 1 });

function put(g: Grid, col: number, row: number, blockId: string, opts: { level?: number; rotation?: Rotation; manual?: boolean } = {}) {
  const c = g.cells[idx(g, col, row)];
  c.blockId = blockId;
  c.level = opts.level ?? 1;
  c.rotation = opts.rotation ?? 0;
  c.manual = opts.manual ?? false;
}

function fixed(g: Grid, col: number, row: number, type: 'generator' | 'ejector', facing: Dir) {
  const c: GridCell = g.cells[idx(g, col, row)];
  c.type = type;
  c.facing = facing;
}

/** A fully buildable board with no generator or ejector. */
function open(w = 11, h = 11): Grid {
  return parseLayout(new Array(h).fill('_'.repeat(w)));
}

/** Shuttle with the two turns that carry the line to the ejector. */
function routedShuttle(): Grid {
  const g = buildShuttleGrid();
  put(g, 6, 9, 'turn_r');
  put(g, 9, 9, 'turn_l');
  return g;
}

const seg = (s: Segment) => `${s.kind}:${s.fromCell.x + 1},${s.fromCell.y + 1}->${s.toCell.x + 1},${s.toCell.y + 1}`;

describe('compiler: the automatic red line', () => {
  it('empty Shuttle: one live run from G up to (6,2) and a dead-end cap at the blocked cell (6,1)', () => {
    const res = compile(buildShuttleGrid());
    expect(res.segments.map(seg)).toEqual(['live:6,11->6,2', 'dead-end:6,2->6,1']);
    expect(res.segments[1].reason).toBe('blocked');
    expect(res.recipes.length).toBe(0);
    expect(res.warnings.length).toBeGreaterThan(0);
    expect(res.warnings[0]).toContain("doesn't reach an ejector");
    expect(res.stats.projectilesPerPulse).toBe(0);
  });

  it('Turn Right at (6,9) (+ Turn Left at (9,9)): up col 6, right along row 9, up col 9 into the ejector', () => {
    const res = compile(routedShuttle());
    expect(res.segments.map(seg)).toEqual(['live:6,11->6,9', 'live:6,9->9,9', 'live:9,9->9,2']);
    expect(res.recipes.length).toBe(1);
    expect(res.recipes[0]).toMatchObject({ direction: 'N', ...ref(9, 2) });
    expect(res.warnings).toEqual([]);
  });

  it('Turn Right alone runs into void at col 10: dead end, no recipe', () => {
    const g = buildShuttleGrid();
    put(g, 6, 9, 'turn_r');
    const res = compile(g);
    expect(res.recipes.length).toBe(0);
    expect(res.segments.map(seg)).toEqual(['live:6,11->6,9', 'live:6,9->9,9', 'dead-end:9,9->10,9']);
  });

  it('Turn Left at (6,9) sends the line left where it dead-ends; rotating it never makes it a Turn Right', () => {
    const g = routedShuttle();
    put(g, 6, 9, 'turn_l');
    const res = compile(g);
    expect(res.recipes.length).toBe(0);
    expect(res.segments.map(seg)).toEqual(['live:6,11->6,9', 'live:6,9->3,9', 'dead-end:3,9->2,9']);

    // Every manual rotation of a Turn Left: only the north-facing one is entered, and it still turns left.
    for (const rotation of [0, 90, 180, 270] as Rotation[]) {
      const m = routedShuttle();
      put(m, 6, 9, 'turn_l', { rotation, manual: true });
      expect(compile(m).recipes.length).toBe(0);
    }
    const right = routedShuttle();
    put(right, 6, 9, 'turn_r', { rotation: 0, manual: true });
    expect(compile(right).recipes.length).toBe(1);
  });

  it('auto orientation: a Flat+ follows the direction the signal enters it', () => {
    const g = routedShuttle();
    put(g, 6, 10, 'flat_plus'); // vertical part before the first turn
    put(g, 7, 9, 'flat_plus'); // horizontal part
    put(g, 9, 6, 'flat_plus'); // vertical part after the second turn
    const res = compile(g);
    const info = (c: number, r: number) => res.cellInfo[idx(g, c, r)];
    expect(info(6, 10)).toMatchObject({ onPath: true, inDirs: ['N'], effectiveRotation: 0, orientationMode: 'auto' });
    expect(info(7, 9)).toMatchObject({ onPath: true, inDirs: ['E'], effectiveRotation: 90, orientationMode: 'auto' });
    expect(info(9, 6)).toMatchObject({ onPath: true, inDirs: ['N'], effectiveRotation: 0, orientationMode: 'auto' });
    expect(res.recipes[0].packet.damage).toBe(301);
  });

  it('auto orientation ignores the stored rotation; an off-path block keeps its stored rotation', () => {
    const g = routedShuttle();
    put(g, 9, 6, 'flat_plus', { rotation: 180 }); // stored rotation, but still auto
    put(g, 4, 4, 'flat_plus', { rotation: 270 }); // not on the line
    const res = compile(g);
    expect(res.recipes[0].packet.damage).toBe(101);
    expect(res.cellInfo[idx(g, 9, 6)].effectiveRotation).toBe(0);
    expect(res.cellInfo[idx(g, 4, 4)]).toMatchObject({ onPath: false, effectiveRotation: 270 });
    expect(res.stats.wastedBlocks).toBe(1);
  });

  it('manual rotation: wrong side blocks the signal, the right side lets it through, auto restores it', () => {
    const east = routedShuttle();
    put(east, 9, 6, 'flat_plus', { rotation: 90, manual: true });
    const blocked = compile(east);
    expect(blocked.recipes.length).toBe(0);
    expect(blocked.segments.some(s => s.kind === 'dead-end' && s.reason === 'wrong side')).toBe(true);
    expect(blocked.cellInfo[idx(east, 9, 6)].warning).toMatch(/wrong side/i);
    expect(blocked.cellInfo[idx(east, 9, 6)].orientationMode).toBe('manual');
    expect(blocked.warnings.some(w => /wrong side/i.test(w))).toBe(true);

    const north = routedShuttle();
    put(north, 9, 6, 'flat_plus', { rotation: 0, manual: true });
    const pass = compile(north);
    expect(pass.recipes.length).toBe(1);
    expect(pass.recipes[0].packet.damage).toBe(101);
    expect(pass.cellInfo[idx(north, 9, 6)]).toMatchObject({ effectiveRotation: 0, orientationMode: 'manual' });

    east.cells[idx(east, 9, 6)].manual = false; // Auto-orient
    const restored = compile(east);
    expect(restored.recipes.length).toBe(1);
    expect(restored.cellInfo[idx(east, 9, 6)].orientationMode).toBe('auto');
  });

  it('Splitter 3 on a clear column makes three branches walked in the order L, F, R', () => {
    const g = buildFanGrid(); // generator (5,10), ejectors (2,1) (5,1) (8,1)
    put(g, 5, 6, 'splitter_3');
    put(g, 2, 6, 'turn_r'); // heading W, right = N
    put(g, 8, 6, 'turn_l'); // heading E, left = N
    const res = compile(g);
    const fromSplitter = res.segments.filter(s => s.fromCell.x === 4 && s.fromCell.y === 5);
    expect(fromSplitter.map(s => s.dir)).toEqual(['W', 'N', 'E']);
    expect(res.recipes.map(r => r.x + 1)).toEqual([2, 5, 8]);
    expect(res.recipes.every(r => r.packet.damage === 1)).toBe(true);
  });

  it('Splitter 2 has no forward output', () => {
    const g = buildFanGrid();
    put(g, 5, 6, 'splitter_2');
    const res = compile(g);
    const dirs = res.segments.filter(s => s.fromCell.x === 4 && s.fromCell.y === 5).map(s => s.dir);
    expect(dirs).toEqual(['W', 'E']);
  });

  it('crossing lines pass through each other in a plain empty cell with unmixed packets and no Crossover', () => {
    const g = open();
    fixed(g, 6, 10, 'generator', 'N'); // line 1 runs up column 6
    fixed(g, 2, 6, 'generator', 'E'); // line 2 runs along row 6
    fixed(g, 6, 2, 'ejector', 'N');
    fixed(g, 10, 6, 'ejector', 'E');
    put(g, 6, 9, 'flat_plus'); // only line 1 sees this
    put(g, 3, 6, 'percent_mult', { level: 2 }); // only line 2 sees this (x2)
    const res = compile(g);
    expect(res.warnings).toEqual([]);
    expect(res.recipes.length).toBe(2);
    const north = res.recipes.find(r => r.direction === 'N')!;
    const east = res.recipes.find(r => r.direction === 'E')!;
    expect(north.packet.damage).toBe(101);
    expect(east.packet.damage).toBe(2);
    // Both lines run through the shared cell (6,6): one vertically, one horizontally.
    expect(res.cellInfo[idx(g, 6, 6)].inDirs.sort()).toEqual(['E', 'N']);
  });

  it('two lines crossing on a shared Flat+ cell each receive the damage independently', () => {
    const g = open();
    fixed(g, 6, 10, 'generator', 'N');
    fixed(g, 2, 6, 'generator', 'E');
    fixed(g, 6, 2, 'ejector', 'N');
    fixed(g, 10, 6, 'ejector', 'E');
    put(g, 6, 6, 'flat_plus');
    const res = compile(g);
    expect(res.recipes.length).toBe(2);
    expect(res.recipes.map(r => r.packet.damage)).toEqual([101, 101]);
    // The displayed orientation follows the first signal in traversal order (the upper generator, travelling east).
    expect(res.cellInfo[idx(g, 6, 6)]).toMatchObject({ effectiveRotation: 90, orientationMode: 'auto' });
  });

  it('two lines on the same axis through one cell: the later one is cut and flagged "lines overlap"', () => {
    const g = open();
    fixed(g, 2, 6, 'generator', 'E');
    fixed(g, 10, 6, 'generator', 'W');
    const res = compile(g);
    expect(res.segments.some(s => s.kind === 'overlap' && s.reason === 'lines overlap')).toBe(true);
    expect(res.warnings.some(w => w.toLowerCase().includes('lines overlap'))).toBe(true);
    // The first line owns the row up to the second generator; the second is cut right next to it.
    expect(res.segments.map(seg)).toContain('live:2,6->9,6');
  });

  it('a feedback loop is cut and flagged, never infinite', () => {
    const g = open();
    fixed(g, 2, 6, 'generator', 'E');
    put(g, 3, 6, 'splitter_3'); // A: entered heading E, later heading N
    put(g, 4, 6, 'turn_r'); // B: E -> S
    put(g, 4, 7, 'turn_r'); // C: S -> W
    put(g, 3, 7, 'turn_r'); // D: W -> N, back into A
    const res = compile(g);
    expect(res.segments.some(s => s.kind === 'loop-cut')).toBe(true);
    expect(res.warnings.some(w => w.includes('Feedback loop'))).toBe(true);
    expect(res.segments.length).toBeLessThan(40);
  });

  it('order matters: Flat+ then x2 is not x2 then Flat+', () => {
    const a = routedShuttle();
    put(a, 9, 6, 'flat_plus');
    put(a, 9, 5, 'percent_mult', { level: 2 });
    expect(compile(a).recipes[0].packet.damage).toBe((1 + 100) * 2);

    const b = routedShuttle();
    put(b, 9, 6, 'percent_mult', { level: 2 });
    put(b, 9, 5, 'flat_plus');
    expect(compile(b).recipes[0].packet.damage).toBe(1 * 2 + 100);
  });

  it('chance blocks keep their position in the damage order and count towards the expected DPS', () => {
    const after = routedShuttle();
    put(after, 9, 6, 'flat_plus');
    put(after, 9, 5, 'lucky_strike');
    const before = routedShuttle();
    put(before, 9, 6, 'lucky_strike');
    put(before, 9, 5, 'flat_plus');
    const a = compile(after);
    const b = compile(before);
    expect(a.recipes[0].packet.damage).toBe(101); // gates are not part of the deterministic damage
    expect(a.recipes[0].packet.gates.length).toBe(1);
    expect(a.stats.estDps).toBeCloseTo(101 * 1.33 * a.stats.pulsesPerSecond, 6);
    expect(b.stats.estDps).toBeCloseTo((1 * 1.33 + 100) * b.stats.pulsesPerSecond, 6);
  });

  it('an ejector entered from the wrong side is a dead end', () => {
    const g = open();
    fixed(g, 2, 6, 'generator', 'E');
    fixed(g, 6, 6, 'ejector', 'N'); // faces north, but the signal arrives heading east
    const res = compile(g);
    expect(res.recipes.length).toBe(0);
    expect(res.segments.some(s => s.kind === 'dead-end' && s.reason === 'ejector wrong side')).toBe(true);
    expect(res.cellInfo[idx(g, 6, 6)].warning).toMatch(/wrong side/i);
  });

  it('a signal entering a generator, void or the hull edge dead-ends with a reason', () => {
    const g = open();
    fixed(g, 2, 6, 'generator', 'N');
    const res = compile(g);
    expect(res.segments.map(seg)).toEqual(['live:2,6->2,1', 'dead-end:2,1->2,0']);
    expect(res.segments[1].reason).toBe('edge');
  });

  it('is deterministic and pure', () => {
    const g = routedShuttle();
    put(g, 9, 6, 'flat_plus');
    const before = JSON.stringify(g);
    const a = compile(g);
    const b = compile(g);
    expect(JSON.stringify(g)).toBe(before);
    expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
    expect(a.recipes.map(r => r.packet.damage)).toEqual(b.recipes.map(r => r.packet.damage));
  });

  it('default circuit reaches the ejector with at least 100 damage per shot', () => {
    const res = compile(buildStarterGrid());
    expect(res.recipes.length).toBe(1);
    expect(res.stats.damagePerShot).toBeGreaterThanOrEqual(100);
    expect(res.stats.projectilesPerPulse).toBe(1);
    expect(res.stats.estDps).toBeCloseTo(101 * res.stats.pulsesPerSecond, 6);
  });

  it('compile of a busy 11x11 board takes < 5 ms on average (100 runs)', () => {
    const g = open();
    fixed(g, 6, 11, 'generator', 'N');
    for (let col = 1; col <= 11; col++) fixed(g, col, 1, 'ejector', 'N');
    const kinds = ['splitter_3', 'turn_r', 'turn_l', 'flat_plus', 'splitter_2', 'percent_mult'];
    let n = 0;
    for (let row = 2; row <= 10; row++) {
      for (let col = 1; col <= 11; col++) {
        if (n++ % 2 === 0) put(g, col, row, kinds[(col * 7 + row * 3) % kinds.length]);
      }
    }
    for (let i = 0; i < 10; i++) compile(g);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) compile(g);
    const avg = (performance.now() - t0) / 100;
    expect(avg).toBeLessThan(5);
  });
});
