import { BuilderModel } from './model';

let shared: BuilderModel | null = null;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** One builder model for the whole session, so undo history and the circuit survive a trip to the Fly screen. */
export function getBuilderModel(): BuilderModel {
  if (!shared) shared = new BuilderModel(safeStorage());
  return shared;
}

export function resetBuilderModel(): void {
  shared = null;
}
