import type { World } from '../game/world';

/** The running Fly world, for the ?debug=1 panel. Set by FlyScreen while it is on screen. */
export const debugHooks: { world: World | null } = { world: null };
