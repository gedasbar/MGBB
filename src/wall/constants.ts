import { CONFIG, HIT_RADIUS } from '../config';

/** Columns of every wall and how many of them fit on screen. */
export const WALL_COLS = 21;
const VISIBLE_COLS = 10;

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
/**
 * The ship passes a wall once it is this many cells beyond the last row. Nothing is drawn for it (it was 1.5 and a drawn line;
 * 8 until chunk 16a, which at the boosted scroll speed was seconds of flying through empty space after the wall was done).
 */
export const PASS_MARGIN_CELLS = 1;
/**
 * Chunk 16a: seconds between a level ending and its result screen. A clear or a pass freezes the world and the ship at once and
 * waits this long (the last hit / the finish is seen, nothing keeps moving); a crash or a Free Fly death keep the pauses they had.
 */
export const RESULT_DELAY_CLEARED = 0.4;
export const RESULT_DELAY_PASSED = 0.4;
export const RESULT_DELAY_CRASHED = 0.3;
export const RESULT_DELAY_FAILED = 0.7;
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

/**
 * Block HP at tier T: BLOCK_HP_BASE x BLOCK_HP_GROWTH^(min(T, BLOCK_HP_GROWTH_END) - 1), a whole number. Chunk 14a: base 2
 * against the basic shot's 1 (it was 100 against Flat+'s 101), +13% a tier up to tier 38 and flat after it (it was +5.5% a
 * tier all the way). npm run balance-damage: the DPS a player can own climbs fast until the Fan / Shuttle and L3-L5 blocks
 * (about tier 35-45) and then stops (every block at L5); with +5.5% the middle tiers were 4-9x too easy and tier 100 needed
 * five times the best build. After tier 38 the walls still grow: more rows, more and heavier armor and shields.
 */
export const BLOCK_HP_BASE = 2;
export const BLOCK_HP_GROWTH = 1.13;
export const BLOCK_HP_GROWTH_END = 38;
/** Rows of a wall: WALL_ROWS_FIRST at tier 1 growing linearly to WALL_ROWS_LAST at tier 100 (chunk 14a: was 8 at tier 1). */
export const WALL_ROWS_FIRST = 4;
export const WALL_ROWS_LAST = 41;
/**
 * The first walls approach slower: EARLY_APPROACH_MUL x the default speed at tier 1, reaching the default at
 * EARLY_APPROACH_TIERS (chunk 14a: a Dart with a Flat+ can clear tier 1 slowly).
 */
const EARLY_APPROACH_MUL = 0.7;
const EARLY_APPROACH_TIERS = 10;
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
/** Approach speed of a campaign tier (slower for the first EARLY_APPROACH_TIERS tiers). */
export const approachSpeedFor = (tier: number) =>
  DEFAULT_APPROACH_SPEED * Math.min(1, EARLY_APPROACH_MUL + ((1 - EARLY_APPROACH_MUL) * (Math.max(1, tier) - 1)) / (EARLY_APPROACH_TIERS - 1));
export const PROJECTILE_MAX_AGE = 3;
