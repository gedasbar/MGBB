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
/**
 * Block HP of a ring (chunk 18b, docs/difficulty-audit.md): the campaign curve at the ring's effective tier (MAP_BASE_TIER +
 * ring x MAP_TIER_PER_RING, so tier 100 at ring 250), then x FRONTIER_LATE_GROWTH per ring past FRONTIER_CURVE_RING, times
 * (1 +- MAP_HP_NOISE). The audit's x1.001 let a builder pass ring 2000, so the late growth is much steeper than the audit proposed.
 */
export const FRONTIER_CURVE_RING = 250;
export const FRONTIER_LATE_GROWTH = 1.018;
/**
 * Passing a Frontier wall must cost more than in the campaign (the audit's lane lever): the cheapest column of a Frontier wall is
 * at least this share of the median column (the campaign's is 0.3), so there is no cheap lane through the map.
 */
export const MAP_MIN_COLUMN_SHARE = 1.0;
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

/**
 * Square look (chunk 15a-fix): 'plate' = an outer plate with a dark inner square (the block-plate shape, greys only);
 * 'flat' = plain flat squares in the same state colours, no inner square.
 */
export type TileStyle = 'plate' | 'flat';
export const TILE_STYLE: TileStyle = 'plate';
/** The one progress colour of the Frontier (chunk 15b): passed = outline, cleared = fill, the panel's state text. */
export const PROGRESS_COLOR = 0xb9a6f0;

/** Screen: zoom in px per square. Below FAR_ZOOM a square is one flat sprite; the medal dot shows from MEDAL_DOT_ZOOM. */
export const ZOOM_DEFAULT = 44;
export const ZOOM_MIN = 5;
export const ZOOM_MAX = 110;
export const FAR_ZOOM = 16;
export const MEDAL_DOT_ZOOM = 8;
/** Wheel zoom: factor exp(-deltaY * WHEEL_ZOOM_RATE), the Build screen's rate. */
export const WHEEL_ZOOM_RATE = 0.0015;

/** Free Fly squares (chunk 15b): share of squares (seeded per square; never the origin or its four neighbours). */
export const FREEFLY_SHARE = 0.2;
/** Length of a Free Fly square's encounter; surviving half of it passes the square, all of it clears it. */
export const FREEFLY_SQUARE_SECONDS = 60;
export const FREEFLY_PASS_SHARE = 0.5;
/** Wave equivalent of an effective tier: round(FF_WAVE_AT_BASE + (tier - MAP_BASE_TIER) x FF_WAVES_PER_TIER), 1..FF_WAVE_CAP. */
export const FF_WAVE_AT_BASE = 6;
export const FF_WAVES_PER_TIER = 0.25;
export const FF_WAVE_CAP = 30;
/** Starting group: this share of the wave's point budget, spawned over the first FF_START_SPREAD seconds. */
export const FF_START_SHARE = 0.4;
export const FF_START_SPREAD = 3;
/** Trickle: the normal wave's point rate (budget / SPAWN_WINDOW) x a seeded factor, ramping linearly to x FF_RAMP_END at the end. */
export const FF_RAMP_END = 1.6;
/** Seeded per-square ranges [min, max]: trickle rate, starting group, species weights, Ironclad / Warden weights (armor / shield share). */
export const FF_TRICKLE_MUL: [number, number] = [0.8, 1.25];
export const FF_START_MUL: [number, number] = [0.7, 1.4];
export const FF_SPECIES_MUL: [number, number] = [0.6, 1.6];
export const FF_ARMOR_SHIELD_MUL: [number, number] = [0.2, 2.5];
