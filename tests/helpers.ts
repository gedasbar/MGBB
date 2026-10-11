import { BuilderModel, StorageLike } from '../src/builder/model';
import { ProgressStore, richProgress } from '../src/econ/progress';
import { STORAGE_KEY } from '../src/builder/persist';

/** A BuilderModel whose player owns 20 of every block and every hull (the pre-scarcity starting state). */
/** The older tests were written on the Shuttle: a model with nothing saved starts on it (a saved active hull is respected). */
export function richModel(storage: StorageLike | null = null, hullId?: string): BuilderModel {
  const saved = storage ? (() => { try { return storage.getItem(STORAGE_KEY); } catch { return null; } })() : null;
  return new BuilderModel(storage, hullId ?? (saved ? undefined : 'shuttle'), new ProgressStore(storage, richProgress()));
}
