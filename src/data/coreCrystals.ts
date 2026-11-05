/**
 * Core crystals (chunk 32e, docs/core-pickups.md). Killed enemies drop small teal hexagons; flying through one banks its Cores.
 * Every number of the pickups lives here.
 */

/** Crystals together are worth this share of the Cores the automatic income pays (+50%: a player who collects everything earns 1.5x an AFK player). */
export const CRYSTAL_SHARE = 0.5;
/** Seconds a crystal lives; it blinks in the last CRYSTAL_BLINK seconds. */
export const CRYSTAL_LIFE = 6;
export const CRYSTAL_BLINK = 1.5;
/** Blink rate in full on/off cycles a second. */
export const CRYSTAL_BLINK_HZ = 4;
/** The ship collects a crystal when its path comes within this many px of it (the Core Magnet chunk multiplies it). */
export const CRYSTAL_PICKUP_RADIUS = 28;
/** Most crystals alive at once; when full the new value merges into the nearest crystal. */
export const CRYSTAL_CAP = 60;
/** Slow drift: speed in px/s (direction chosen at the drop), and the share of it kept every second (it slows down). */
export const CRYSTAL_DRIFT = 22;
export const CRYSTAL_DRAG = 0.6;
/** Drawn size in px (a flat hexagon, the Cores icon look). */
export const CRYSTAL_SIZE = 12;
/** Core Magnet chunk: +60% pickup radius per copy placed. */
export const CORE_MAGNET_RADIUS_PER_COPY = 0.6;
