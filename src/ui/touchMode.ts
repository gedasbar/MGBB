import { sfx } from '../audio';
import type { TouchMode } from '../engine/steer';
import { TOUCH_DRAG_GAIN } from '../config';
import { FRAME_LIMITS, TOUCH_GAIN_MAX, TOUCH_GAIN_MIN } from './settings';

/** The saved "Touch control" setting (Settings panel), read by the fly screens every step. */
export function touchMode(): TouchMode {
  return sfx.settings.touchControl === 'direct' ? 'direct' : 'relative';
}

/** Chunk 28b: the touch sensitivity (Settings > Controls): TOUCH_DRAG_GAIN x the slider's factor, read by the fly screens every step. */
export function touchGain(): number {
  const g = sfx.settings.touchGain;
  return TOUCH_DRAG_GAIN * (typeof g === 'number' && isFinite(g) ? Math.max(TOUCH_GAIN_MIN, Math.min(TOUCH_GAIN_MAX, g)) : 1);
}

/** Chunk 28b: Graphics settings the fly screens read when they start. */
export const backgroundsOn = () => sfx.settings.backgrounds !== false;
export const damageNumbersOn = () => sfx.settings.damageNumbers !== false;

/** Chunk 28b: the render loop's cap in frames a second: 0 = none (Auto, the display's own rate), else 30 or 60. */
export function frameLimitFps(limit: number): number {
  return FRAME_LIMITS.includes(limit as 0 | 30 | 60) ? limit : 0;
}
