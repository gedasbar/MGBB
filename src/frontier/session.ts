import { ZOOM_DEFAULT } from './constants';

/**
 * The Frontier camera and selection for this browser session: a new Frontier screen (after a run, or from the Map)
 * opens where the last one was. Not saved.
 */
export const frontierSession = {
  cx: 0,
  cy: 0,
  zoom: ZOOM_DEFAULT,
  sel: { x: 0, y: 0 },
  /** Set by the open Frontier screen: called after a dev jump so it redraws at once. */
  onChange: null as null | (() => void),
};

/** Dev: moves the camera (and the selection) to a square. */
export function frontierJump(x: number, y: number, zoom?: number) {
  frontierSession.cx = x;
  frontierSession.cy = y;
  frontierSession.sel = { x, y };
  if (zoom !== undefined) frontierSession.zoom = zoom;
  frontierSession.onChange?.();
}
