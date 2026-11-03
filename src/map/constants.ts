/** Chunk 29b: numbers of the Map tab's mode carousel (all of them in one place). */
export const CAROUSEL = {
  /** Distance between the centres of two neighbouring cards, in game px. The centre card is 300 wide, so the neighbours (scaled) peek in about 90 px at each side. */
  spacing: 310,
  card: { w: 300, h: 430 },
  /** A card one step away from the centre: smaller and dimmer. Further away it stays at this look. */
  sideScale: 0.8,
  sideAlpha: 0.45,
  /** How much of a drag past the first / last card shows (the rest is resisted). */
  rubber: 0.3,
  /** A release flicks the carousel as far as the finger would have gone in this many seconds. */
  flickSeconds: 0.14,
  /** Easing speed (1 / s) of the carousel toward the card it snaps to. */
  ease: 14,
  /** Closer than this (in card steps) to the target counts as arrived. */
  arrive: 0.002,
  /** Only the last this-many seconds of finger movement decide the release speed. */
  velocityWindow: 0.1,
} as const;

/** The three modes, in carousel order. */
export const MAP_MODES = ['campaign', 'frontier', 'freefly'] as const;
export type MapMode = (typeof MAP_MODES)[number];

export const MODE_TITLE: Record<MapMode, string> = { campaign: 'CAMPAIGN', frontier: 'FRONTIER', freefly: 'FREE FLY' };
/** The mode a fresh save opens the carousel on. */
export const DEFAULT_MODE: MapMode = 'campaign';
/** localStorage key of the remembered mode (UI state, not part of the save). */
export const MAP_MEMORY_KEY = 'mgbm_mapnav';
