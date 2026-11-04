import { describe, it, expect, vi, beforeAll } from 'vitest';
import { CELL_TEST_HULL, SANDBOX_COPIES } from '../src/shipyard/constants';
import { sandboxProgress, rememberCells, takeRememberedCells } from '../src/shipyard/sandbox';
import { defaultProgress } from '../src/econ/progress';
import { BLOCKS } from '../src/data/blocks';
import { HULL_BUILDERS } from '../src/game/gridUtils';
import { customHullInfo } from '../src/data/hulls';
import { compile } from '../src/engine/compiler';

/** A storage that remembers every write, to prove the sandbox writes nothing. */
function recordingStorage() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data, writes,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { writes.push(k); data.set(k, v); },
    removeItem: (k: string) => { writes.push(`-${k}`); data.delete(k); },
  };
}

const ROWS = ['E.E', '___', '_._', 'G..'.replace('G..', '.G.')]; // two ejectors over a row, a stem, the generator under it

describe('debug sandbox (cell mode: Build & fly)', () => {
  const store = recordingStorage();
  let session: typeof import('../src/builder/session');
  let progress: typeof import('../src/econ/progress');

  beforeAll(async () => {
    vi.stubGlobal('localStorage', store);
    session = await import('../src/builder/session');
    progress = await import('../src/econ/progress');
  });

  it('the sandbox copy of the progress owns every block at its highest level and the test hull, without touching the original', () => {
    const real = defaultProgress();
    const before = JSON.stringify(real);
    const sb = sandboxProgress(real);
    expect(JSON.stringify(real)).toBe(before);
    for (const id of Object.keys(BLOCKS)) expect(sb.owned[id]).toBe(SANDBOX_COPIES);
    expect(sb.ownedHulls).toContain(CELL_TEST_HULL);
    expect(real.ownedHulls).not.toContain(CELL_TEST_HULL);
    expect(real.owned.splitter ?? 0).toBeLessThan(SANDBOX_COPIES);
  });

  it('enters a sandbox: a temporary hull, blocks free and unlimited, nothing written, the real builder and save untouched; leaving restores them', () => {
    const real = session.getBuilderModel();
    const realStore = progress.getProgressStore();
    real.store.data.credits = 1234;
    const realGridBefore = JSON.stringify(real.grid.cells.map(c => c.blockId));
    const realSave = JSON.stringify(realStore.data);
    const writesBefore = store.writes.length;
    expect(session.inSandbox()).toBe(false);

    const sb = session.enterSandbox(ROWS);
    expect(session.inSandbox()).toBe(true);
    expect(session.getBuilderModel()).toBe(sb);
    expect(sb.hullId).toBe(CELL_TEST_HULL);
    expect(HULL_BUILDERS[CELL_TEST_HULL]).toBeTypeOf('function');
    expect(customHullInfo(CELL_TEST_HULL)?.rows).toEqual(ROWS);

    // Blocks the real save does not own are free here, in numbers no real save reaches.
    expect(real.owned['splitter_2'] ?? 0).toBeLessThan(SANDBOX_COPIES);
    const empties = sb.grid.cells.filter(c => c.type === 'empty');
    let placed = 0;
    for (const c of empties) if (sb.place(c.x, c.y, 'splitter_2').ok) placed++;
    expect(placed).toBe(empties.length);
    expect(sb.available('splitter_2')).toBe(SANDBOX_COPIES - empties.length);
    expect(compile(sb.gridForFlight()).stats).toBeDefined();
    expect(sb.gridForFlight().hullId).toBe(CELL_TEST_HULL);

    // Nothing reached the real circuits, the real progress or the storage.
    expect(store.writes.length).toBe(writesBefore);
    expect(JSON.stringify(realStore.data)).toBe(realSave);
    expect(JSON.stringify(real.grid.cells.map(c => c.blockId))).toBe(realGridBefore);
    sb.store.data.credits = 5; // the sandbox store is its own object
    expect(realStore.data.credits).toBe(1234);

    session.leaveSandbox();
    expect(session.inSandbox()).toBe(false);
    expect(session.getBuilderModel()).toBe(real);
    expect(HULL_BUILDERS[CELL_TEST_HULL]).toBeUndefined();
    expect(customHullInfo(CELL_TEST_HULL)).toBeUndefined();
    expect(store.writes.length).toBe(writesBefore);
    expect(JSON.stringify(realStore.data)).toBe(realSave);
  });

  it('the cell layout is remembered for the way back, once', () => {
    expect(takeRememberedCells()).toBeNull();
    rememberCells({ w: 3, h: 4, rows: ['E..', '...', '...', '.G.'] });
    expect(takeRememberedCells()).toEqual({ w: 3, h: 4, rows: ['E..', '...', '...', '.G.'] });
    expect(takeRememberedCells()).toBeNull();
  });
});
