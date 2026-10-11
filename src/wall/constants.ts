import { CONFIG, HIT_RADIUS } from '../config';

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

/**
 * Top-edge speed boost: with the ship at TOP_ZONE x viewport height or lower the wall scrolls at its base speed; the
 * nearer the ship is to the top of the screen, the faster, up to BOOST_MAX x base at y = 0.
 */
export const TOP_ZONE = 0.35;
export const BOOST_MAX = 4;

/** The ship's hit point (a crash happens when it touches a live block). */
export const SHIP_HIT_R = HIT_RADIUS;
/** The ship passes a wall once it is this many cells beyond the last row. Nothing is drawn for it (it was 1.5 and a drawn line). */
export const PASS_MARGIN_CELLS = 8;
/** Where the ship starts, and the nearest the first block row may start to it. */
export const SHIP_START_Y = 0.8 * VIEW_H;
export const MIN_START_GAP_CELLS = 6;

/**
 * Every ejector's offset from the ship centre is multiplied by this, in Free Fly and in the walls, so a gun built to the
 * side of the hull still carves a lane the ship fits in. (The brief asked for 0.35; with the 7 px hit point that leaves
 * 5 px to the lane edge instead of the required 8, so it is 0.25.)
 */
export const FIRE_OFFSET_SCALE = 0.25;

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
