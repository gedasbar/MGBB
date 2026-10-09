import { CONFIG } from '../config';

/** Columns of every wall and how many of them fit on screen. */
export const WALL_COLS = 21;
export const VISIBLE_COLS = 10;

/** One block cell in px: exactly 10 columns span the viewport width (54 px). */
export const CELL = CONFIG.VIEW.W / VISIBLE_COLS;
export const WORLD_WIDTH = WALL_COLS * CELL;
export const VIEW_W = CONFIG.VIEW.W;
export const VIEW_H = CONFIG.VIEW.H;
/** Largest camera x: the viewport's left edge when it shows the last 10 columns. */
export const CAMERA_MAX_X = WORLD_WIDTH - VIEW_W;

/** The wall stops when a living block's bottom edge reaches this screen y. */
export const STOP_LINE_Y = 0.78 * VIEW_H;
/** Share of max hull drained per second while a living block touches the stop line. */
export const DRAIN_PER_SEC = 0.12;

/** Edge-push camera: the outer share of the screen width that scrolls, and its top speed in px/s. */
export const EDGE_ZONE = 0.18;
export const MAX_CAMERA_SPEED = 420;
/** How fast the camera speed follows its target (1/s); smooths starts and stops so the view never jitters. */
export const CAMERA_EASE = 14;

/** Block stats at tier T. */
export const BLOCK_HP_BASE = 100;
export const BLOCK_HP_GROWTH = 1.055;
/** A shield pool absorbs damage before HP; it regenerates after SHIELD_REGEN_DELAY seconds without a hit. */
export const SHIELD_REGEN_DELAY = 2;
/** Share of the maximum shield restored per second while regenerating. */
export const SHIELD_REGEN_PER_SEC = 0.25;

/** Credits per destroyed block: REWARD_BASE * REWARD_GROWTH^(tier-1). */
export const REWARD_BASE = 0.4;
export const REWARD_GROWTH = 1.05;

/** Test walls (makeTestWall): an armored block halves direct damage (armor 10 against the engine's armor scale 10) and a shield is half the block's HP. */
export const TEST_ARMOR = 10;
export const TEST_SHIELD_OF_HP = 0.5;

/** Default approach speed in px/s and the max projectile age (seconds) after which a shot is dropped. */
export const DEFAULT_APPROACH_SPEED = 26;
export const PROJECTILE_MAX_AGE = 3;
