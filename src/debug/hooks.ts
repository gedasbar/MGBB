import type { World } from '../game/world';
import type { WallWorld } from '../wall/wallWorld';

export interface DebugWallOpts { tier: number; armorFraction: number; shieldFraction: number; rows?: number }

/** Live objects for the ?debug=1 panel. Set by the screens (and main.ts) while they are on screen. */
export const debugHooks: {
  /** The running Free Fly world. */
  world: World | null;
  /** The running wall level. */
  wall: WallWorld | null;
  /** Simulation steps per frame (1 = real time). Used by the debug panel and the e2e scripts to skip waiting. */
  timeScale: number;
  /** Starts a test wall with the current circuit. Set by main.ts. */
  startWall: ((o: DebugWallOpts) => void) | null;
  /** Dev only (cheat panel, set by main.ts): Free Fly from wave N, and a real campaign tier whether or not it is unlocked. */
  startFly: ((wave: number) => void) | null;
  startTier: ((tier: number) => void) | null;
  /** Dev only: no hull damage in Free Fly and no crash in a wall. The screens copy it into their world every frame. */
  god: boolean;
} = { world: null, wall: null, timeScale: 1, startWall: null, startFly: null, startTier: null, god: false };
