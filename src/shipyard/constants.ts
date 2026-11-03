/** Shipyard constants (chunk 31a, docs/shipyard.md). Every number of the Cores income and of the custom hull rules lives here. */

/** The display name of the new currency. Code says `cores`; change this one word to rename it everywhere the player reads it. */
export const CURRENCY_CORES_NAME = 'Cores';

// ---------------------------------------------------------------- earning Cores (Free Fly only)

/** Cores for the wave that has just started (wave 2 on): round(CORES_WAVE_BASE x CORES_WAVE_GROWTH^(wave - 2)). Wave 1 pays nothing (nothing is survived yet). */
export const CORES_WAVE_BASE = 2;
export const CORES_WAVE_GROWTH = 1.08;
/** Reaching a Medal-wave milestone (captains/data.ts FLY_MEDAL_MILESTONES) pays this many Cores per wave number on top, every run (the Medal itself stays once per save). */
export const CORES_MILESTONE_PER_WAVE = 2;
/** Frontier Free Fly squares pay one wave's Cores for every full WAVE_TIME seconds survived, at the square's wave equivalent capped here (no milestone bonus). */
export const ENCOUNTER_CORES_WAVE_CAP = 30;

// ---------------------------------------------------------------- unlock

/** The Shipyard opens at this furthest Frontier ring in any direction (the ring Frontier Echo and the skill points read). Cores accumulate before it. */
export const SHIPYARD_UNLOCK_RING = 150;
/** What the Free Fly home screen says about Cores. */
export const CORES_HINT = `${CURRENCY_CORES_NAME}: used in the Shipyard, which opens at Frontier ring ${SHIPYARD_UNLOCK_RING}`;

// ---------------------------------------------------------------- designs

/** A chunk is CHUNK_CELLS x CHUNK_CELLS cells; a design is DESIGN_SLOTS x DESIGN_SLOTS chunk slots. */
export const CHUNK_CELLS = 3;
export const DESIGN_SLOTS = 4;
/** Saved designs, and the ids they fly under ("custom1" ...). */
export const MAX_DESIGNS = 3;
export const CUSTOM_HULL_PREFIX = 'custom';
export const customHullId = (slot: number) => `${CUSTOM_HULL_PREFIX}${slot + 1}`;
export const customHullName = (slot: number) => `Custom ${slot + 1}`;
/** Slot index (0..MAX_DESIGNS-1) of a custom hull id, or -1. */
export function customSlotOf(id: string): number {
  const m = /^custom([1-9])$/.exec(id);
  const n = m ? Number(m[1]) - 1 : -1;
  return n >= 0 && n < MAX_DESIGNS ? n : -1;
}

// ---------------------------------------------------------------- stats

/** pulses/s = max(PULSE_MIN, PULSE_BASE - PULSE_PER_CELL x buildable cells), then the traits. */
export const PULSE_BASE = 5.0;
export const PULSE_PER_CELL = 0.025;
export const PULSE_MIN = 1.5;
/** The traits cannot push the rate below this (a pile of Wide Open chunks must not stop the gun). */
export const TRAIT_PULSE_FLOOR = 0.5;
/** Shot speed before the traits. */
export const SHOT_SPEED_BASE = 1.0;
/** Size class by occupied slots: at most this many slots -> that class; more than the last -> 'huge'. */
export const SIZE_BY_SLOTS: readonly { maxSlots: number; size: 'small' | 'medium' | 'big' }[] = [
  { maxSlots: 2, size: 'small' }, { maxSlots: 5, size: 'medium' }, { maxSlots: 9, size: 'big' },
];

// ---------------------------------------------------------------- Extra Life

/** Seconds untouchable after an Extra Life saves the ship (the captains' Second Chance gives 1 s). */
export const EXTRA_LIFE_INVULN = 1.5;
