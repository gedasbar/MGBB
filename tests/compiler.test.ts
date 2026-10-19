import { describe, it, expect } from 'vitest';
import { compile as compileStored, CompileOptions, Grid, GridCell, Segment } from '../src/engine/compiler';
import { entryDirection, orientCell, orientLegacyAuto } from '../src/engine/orient';
import { Dir, Rotation } from '../src/engine/compilerTypes';
import { buildFanGrid, buildShuttleGrid, parseLayout } from '../src/game/gridUtils';
import { buildStarterGrid } from '../src/game/starter';
import '../src/data/blocks';

// All coordinates in this file are 1-indexed (col,row), as in the hull diagram.
const idx = (g: Grid, col: number, row: number) => (row - 1) * g.w + (col - 1);
const ref = (col: number, row: number) => ({ x: col - 1, y: row - 1 });

/**
 * Chunk 16a: the compiler only reads stored rotations. A block put WITHOUT a rotation here is oriented against the finished
 * circuit just before compiling (orientLegacyAuto, the same walk an old save gets once on load); one put WITH a rotation keeps it.
 */
const toOrient = new WeakMap<Grid, Set<number>>();
function put(g: Grid, col: number, row: number, blockId: string, opts: { level?: number; rotation?: Rotation } = {}) {
  const i = idx(g, col, row);
  const c = g.cells[i];
  c.blockId = blockId;
  c.level = opts.level ?? 1;
  c.rotation = opts.rotation ?? 0;
  const set = toOrient.get(g) ?? new Set<number>();
  toOrient.set(g, set);
  if (opts.rotation === undefined) set.add(i); else set.delete(i);
}
function compile(g: Grid, o?: CompileOptions) {
  const set = toOrient.get(g);
  if (set && set.size > 0) orientLegacyAuto(g, [...set]);
  return compileStored(g, o);
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
  it('empty Shuttle: one live run from G up to (6,2) and a dead-end cap at the void cell (6,1)', () => {
    const res = compile(buildShuttleGrid());
    expect(res.segments.map(seg)).toEqual(['live:6,11->6,2', 'dead-end:6,2->6,1']);
    expect(res.segments[1].reason).toBe('void');
    expect(res.warnings[0]).toContain('outside the hull');
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
      put(m, 6, 9, 'turn_l', { rotation });
      expect(compile(m).recipes.length).toBe(0);
    }
    const right = routedShuttle();
    put(right, 6, 9, 'turn_r', { rotation: 0 });
    expect(compile(right).recipes.length).toBe(1);
  });

  it('orientation at placement: a Flat+ placed on the line faces the way the signal enters it', () => {
    const g = routedShuttle();
    put(g, 6, 10, 'flat_plus'); // vertical part before the first turn
    put(g, 7, 9, 'flat_plus'); // horizontal part
    put(g, 9, 6, 'flat_plus'); // vertical part after the second turn
    const res = compile(g);
    const info = (c: number, r: number) => res.cellInfo[idx(g, c, r)];
    expect(info(6, 10)).toMatchObject({ onPath: true, inDirs: ['N'], effectiveRotation: 0 });
    expect(info(7, 9)).toMatchObject({ onPath: true, inDirs: ['E'], effectiveRotation: 90 });
    expect(info(9, 6)).toMatchObject({ onPath: true, inDirs: ['N'], effectiveRotation: 0 });
    expect(res.recipes[0].packet.damage).toBe(4);
  });

  it('the compiler uses the stored rotation as it is: a block facing away from the line blocks it, an off-path block keeps its rotation', () => {
    const g = routedShuttle();
    put(g, 9, 6, 'flat_plus', { rotation: 180 });
    put(g, 4, 4, 'flat_plus', { rotation: 270 }); // not on the line
    const res = compile(g);
    expect(res.recipes.length).toBe(0);
    expect(res.cellInfo[idx(g, 9, 6)].effectiveRotation).toBe(180);
    expect(res.cellInfo[idx(g, 4, 4)]).toMatchObject({ onPath: false, effectiveRotation: 270 });
  });

  it('stored rotation: wrong side blocks the signal, the right side lets it through, Auto-orient (orientCell) restores it', () => {
    const east = routedShuttle();
    put(east, 9, 6, 'flat_plus', { rotation: 90 });
    const blocked = compile(east);
    expect(blocked.recipes.length).toBe(0);
    expect(blocked.segments.some(s => s.kind === 'dead-end' && s.reason === 'wrong side')).toBe(true);
    expect(blocked.cellInfo[idx(east, 9, 6)].warning).toMatch(/wrong side/i);
    expect(blocked.warnings.some(w => /wrong side/i.test(w))).toBe(true);

    const north = routedShuttle();
    put(north, 9, 6, 'flat_plus', { rotation: 0 });
    const pass = compile(north);
    expect(pass.recipes.length).toBe(1);
    expect(pass.recipes[0].packet.damage).toBe(2);
    expect(pass.cellInfo[idx(north, 9, 6)]).toMatchObject({ effectiveRotation: 0 });

    toOrient.get(east)!.delete(idx(east, 9, 6));
    expect(entryDirection(east, 8, 5)).toBe('N');
    orientCell(east, 8, 5); // Auto-orient
    const restored = compile(east);
    expect(restored.recipes.length).toBe(1);
    expect(restored.cellInfo[idx(east, 9, 6)].effectiveRotation).toBe(0);
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
    expect(north.packet.damage).toBe(2);
    expect(east.packet.damage).toBe(2);
    // Both lines run through the shared cell (6,6): one vertically, one horizontally.
    expect(res.cellInfo[idx(g, 6, 6)].inDirs.sort()).toEqual(['E', 'N']);
  });

  it('two lines crossing on a shared Flat+ cell: the one entering from the side the block faces passes, the other dead-ends (wrong side)', () => {
    const g = open();
    fixed(g, 6, 10, 'generator', 'N');
    fixed(g, 2, 6, 'generator', 'E');
    fixed(g, 6, 2, 'ejector', 'N');
    fixed(g, 10, 6, 'ejector', 'E');
    put(g, 6, 6, 'flat_plus');
    const res = compile(g);
    // Placement oriented the block against the first signal in traversal order (the upper generator, travelling east) and it keeps that.
    expect(res.cellInfo[idx(g, 6, 6)]).toMatchObject({ effectiveRotation: 90 });
    expect(res.recipes.map(r => [r.direction, r.packet.damage])).toEqual([['E', 2]]);
    expect(res.segments.some(s => s.kind === 'dead-end' && s.reason === 'wrong side')).toBe(true);
    // Rotating nothing else: with the block facing north the OTHER line passes instead.
    put(g, 6, 6, 'flat_plus', { rotation: 0 });
    expect(compile(g).recipes.map(r => [r.direction, r.packet.damage])).toEqual([['N', 2]]);
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

  it('a loop of turns is never infinite: with stored orientations the returning signal meets a wrong side (or a loop-cut)', () => {
    const g = open();
    fixed(g, 2, 6, 'generator', 'E');
    put(g, 3, 6, 'splitter_3'); // A: entered heading E, later heading N
    put(g, 4, 6, 'turn_r'); // B: E -> S
    put(g, 4, 7, 'turn_r'); // C: S -> W
    put(g, 3, 7, 'turn_r'); // D: W -> N, back into A
    const res = compile(g);
    expect(res.segments.some(s => s.kind === 'loop-cut' || (s.kind === 'dead-end' && s.reason === 'wrong side'))).toBe(true);
    expect(res.segments.length).toBeLessThan(40);
  });

  it('order matters: Flat+ then x2 is not x2 then Flat+', () => {
    const a = routedShuttle();
    put(a, 9, 6, 'flat_plus');
    put(a, 9, 5, 'percent_mult', { level: 2 });
    expect(compile(a).recipes[0].packet.damage).toBe((1 + 1) * 2);

    const b = routedShuttle();
    put(b, 9, 6, 'percent_mult', { level: 2 });
    put(b, 9, 5, 'flat_plus');
    expect(compile(b).recipes[0].packet.damage).toBe(1 * 2 + 1);
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
    expect(a.recipes[0].packet.damage).toBe(2); // gates are not part of the deterministic damage
    expect(a.recipes[0].packet.gates.length).toBe(1);
    expect(a.stats.estDps).toBeCloseTo(2 * 1.33 * a.stats.pulsesPerSecond, 6);
    expect(b.stats.estDps).toBeCloseTo((1 * 1.33 + 1) * b.stats.pulsesPerSecond, 6);
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
    compile(g); // the helper orients the blocks once; compiling itself changes nothing
    const before = JSON.stringify(g);
    const a = compile(g);
    const b = compile(g);
    expect(JSON.stringify(g)).toBe(before);
    expect(JSON.stringify(a.segments)).toBe(JSON.stringify(b.segments));
    expect(a.recipes.map(r => r.packet.damage)).toEqual(b.recipes.map(r => r.packet.damage));
  });

  it('default circuit reaches the ejector with at least 2 damage per shot', () => {
    const res = compile(buildStarterGrid());
    expect(res.recipes.length).toBe(1);
    expect(res.stats.damagePerShot).toBeGreaterThanOrEqual(2);
    expect(res.stats.projectilesPerPulse).toBe(1);
    expect(res.stats.estDps).toBeCloseTo(2 * res.stats.pulsesPerSecond, 6);
  });

  it('compile of a fully built 11x11 board (splitters everywhere) takes < 5 ms on average (100 runs)', () => {
    const g = open();
    fixed(g, 6, 11, 'generator', 'N');
    for (let col = 1; col <= 11; col++) fixed(g, col, 1, 'ejector', 'N');
    for (let row = 2; row <= 10; row++) {
      for (let col = 1; col <= 11; col++) put(g, col, row, (col + row) % 2 === 0 ? 'splitter_3' : 'splitter_2');
    }
    const res = compile(g);
    expect(res.segments.length).toBeGreaterThan(40); // the signal really does fan out across the board
    for (let i = 0; i < 10; i++) compile(g);
    const t0 = performance.now();
    for (let i = 0; i < 100; i++) compile(g);
    const avg = (performance.now() - t0) / 100;
    expect(avg).toBeLessThan(5);
  });
});

describe('compiler: ledger (packet after each cell)', () => {
  it('records the packet after every cell on the path, in path order', () => {
    const g = routedShuttle();
    put(g, 9, 6, 'flat_plus');
    put(g, 9, 4, 'percent_mult', { level: 2 });
    put(g, 9, 3, 'piercing');
    const info = (c: number, r: number) => compile(g).cellInfo[idx(g, c, r)];
    expect(info(6, 10).ledger).toMatchObject({ damage: 1, pure: 0, count: 1, mods: [] });
    expect(info(9, 7).ledger?.damage).toBe(1); // before Flat+
    expect(info(9, 6).ledger?.damage).toBe(2); // after Flat+
    expect(info(9, 5).ledger?.damage).toBe(2);
    expect(info(9, 4).ledger?.damage).toBe(4); // after x2
    expect(info(9, 3).ledger?.mods).toEqual(['piercing']);
    expect(info(9, 2).ledger).toMatchObject({ damage: 4, mods: ['piercing'] }); // arriving at the ejector
    expect(info(3, 3).ledger).toBeUndefined(); // off the path
  });

  it('reports expected damage for chance blocks and the pure share', () => {
    const g = routedShuttle();
    put(g, 9, 6, 'lucky_strike');
    put(g, 9, 5, 'pure_converter');
    const l = compile(g).cellInfo[idx(g, 9, 4)].ledger!;
    expect(l.damage).toBe(1);
    expect(l.expectedDamage).toBeCloseTo(1.33, 6);
    expect(l.chanceBlocks).toBe(1);
    expect(l.pure).toBeCloseTo(0.15, 10);
  });
});

describe('compiler: a crossing made by one generator and plain blocks', () => {
  it('Splitter 3 + turns on the Fan hull: the west branch curls back and crosses the forward branch', () => {
    const g = buildFanGrid(); // generator (5,10); ejectors (2,1) (5,1) (8,1)
    put(g, 5, 8, 'splitter_3');
    put(g, 2, 8, 'turn_r'); // heading W, right = N
    put(g, 2, 5, 'turn_r'); // heading N, right = E: runs east along row 5, across column 5
    put(g, 8, 5, 'turn_l'); // heading E, left = N: up to the right-hand ejector
    const res = compile(g);
    expect(res.recipes.map(r => r.x + 1).sort()).toEqual([5, 8]);
    // The crossing cell (5,5) carries one vertical and one horizontal line, and nothing was cut.
    expect(res.cellInfo[idx(g, 5, 5)].inDirs.sort()).toEqual(['E', 'N']);
    expect(res.segments.some(s => s.kind === 'overlap' || s.kind === 'loop-cut')).toBe(false);
    expect(res.warnings.length).toBe(1); // only the east branch dead-ends at the hull edge
    expect(res.warnings[0]).toContain("doesn't reach an ejector");
  });
});
