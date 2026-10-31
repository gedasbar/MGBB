import { sfx } from '../audio';
import type { TouchMode } from '../engine/steer';

/** The saved "Touch control" setting (Settings panel), read by the fly screens every step. */
export function touchMode(): TouchMode {
  return sfx.settings.touchControl === 'direct' ? 'direct' : 'relative';
}
