import { BuilderModel, StorageLike } from '../src/builder/model';
import { ProgressStore, richProgress } from '../src/econ/progress';

/** A BuilderModel whose player owns 20 of every block and every hull (the pre-scarcity starting state). */
export function richModel(storage: StorageLike | null = null, hullId?: string): BuilderModel {
  return new BuilderModel(storage, hullId, new ProgressStore(storage, richProgress()));
}
