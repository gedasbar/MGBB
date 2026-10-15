/** Every Frontier number (chunk 15a). Design: docs/frontier-design.md. */

/** Working name of the grid map, shown in the UI. */
export const FRONTIER_NAME = 'Frontier';

/** The world seed every new save starts with (stored in the save). */
export const FRONTIER_SEED = 15015;

/** The world is built in BLOCK_K x BLOCK_K blocks; every square with x or y a multiple of BLOCK_K (the lattice) is open. */
export const BLOCK_K = 7;
/** Share of a block's interior squares that are hole candidates (more become holes when the flood fill cannot reach them). */
export const HOLE_DENSITY = 0.22;
/** Squares with ring <= this are never holes. */
export const START_SAFE_RING = 2;

/** Medal chance of a square: MEDAL_MIN + (MEDAL_BASE - MEDAL_MIN) * exp(-ring / MEDAL_FALLOFF_RINGS), times the pocket bonus. */
export const MEDAL_BASE = 0.08;
export const MEDAL_MIN = 0.02;
export const MEDAL_FALLOFF_RINGS = 25;
/** Dead-end pockets (a single open neighbour) are this much more likely to hold a Medal. */
export const MEDAL_POCKET_MUL = 2.5;

/** The Frontier opens once this campaign tier is passed. */
export const MAP_UNLOCK_TIER = 25;
/** Effective tier of a square: MAP_BASE_TIER + ring * MAP_TIER_PER_RING, plus up to ±MAP_TIER_NOISE. */
export const MAP_BASE_TIER = 25;
export const MAP_TIER_PER_RING = 0.3;
export const MAP_TIER_NOISE = 2;
/** Block HP: blockHp(MAP_BASE_TIER) x MAP_HP_GROWTH^ring x (1 ± MAP_HP_NOISE). */
export const MAP_HP_GROWTH = 1.015;
export const MAP_HP_NOISE = 0.1;
/** Per-square multipliers [min, max] on the campaign value at the effective tier. */
export const MAP_ROWS_MUL: [number, number] = [0.7, 1.4];
export const MAP_ARMOR_MUL: [number, number] = [0.3, 1.8];
export const MAP_SHIELD_MUL: [number, number] = [0.3, 1.8];
export const MAP_SPEED_MUL: [number, number] = [0.85, 1.25];
/** Armor and shield shares never exceed this. Rows stay within these bounds. */
export const MAP_SHARE_MAX = 0.6;
export const MAP_ROWS_MIN = 4;
export const MAP_ROWS_MAX = 60;
/** Chance a square is a spike square (1.6x HP, Ember background, as campaign spikes). */
export const MAP_SPIKE_CHANCE = 1 / 8;

/** Screen: zoom in px per square. Below FAR_ZOOM a square is one flat sprite; the medal dot shows from MEDAL_DOT_ZOOM. */
export const ZOOM_DEFAULT = 44;
export const ZOOM_MIN = 5;
export const ZOOM_MAX = 110;
export const FAR_ZOOM = 16;
export const MEDAL_DOT_ZOOM = 8;
/** Wheel zoom: factor per 100 units of wheel delta. */
export const WHEEL_ZOOM_STEP = 1.15;
