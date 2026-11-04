import { BuilderModel } from './model';
import { getProgressStore, ProgressStore } from '../econ/progress';
import { CELL_TEST_HULL } from '../shipyard/constants';
import { registerCellTest, sandboxProgress, unregisterCellTest } from '../shipyard/sandbox';

let shared: BuilderModel | null = null;
/** Chunk 31c (debug): the sandbox builder, while one is open. It replaces the shared model for every screen that asks, and is never saved. */
let sandbox: BuilderModel | null = null;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** One builder model for the whole session, so undo history and the circuit survive a trip to the Fly screen. In the sandbox: the sandbox model. */
export function getBuilderModel(): BuilderModel {
  if (sandbox) return sandbox;
  if (!shared) shared = new BuilderModel(safeStorage(), undefined, getProgressStore());
  return shared;
}

export const inSandbox = (): boolean => sandbox !== null;

/**
 * Chunk 31c: opens the sandbox for a hull layout (ROWS text): a throw-away hull, a builder with no storage, and an in-memory copy of the progress that owns every block.
 * The real builder model and the real progress are not touched (the real model is simply set aside until `leaveSandbox`).
 */
export function enterSandbox(rows: string[]): BuilderModel {
  registerCellTest(rows);
  const store = new ProgressStore(null, sandboxProgress(getProgressStore().data));
  sandbox = new BuilderModel(null, CELL_TEST_HULL, store);
  return sandbox;
}

/** Closes the sandbox: the real builder model is the shared one again. */
export function leaveSandbox() {
  if (!sandbox) return;
  sandbox = null;
  unregisterCellTest();
}
