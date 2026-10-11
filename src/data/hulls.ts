/**
 * The hull ladder: Dart (free, 1 slot) < Twin < Prong < Fan < Shuttle. Layouts live in game/gridUtils.ts, silhouettes in
 * ui/shipArt.ts; this file holds the numbers: prices, firing stats and the ladder order.
 */
export const HULL_ORDER = ['dart', 'twin', 'prong', 'fan', 'shuttle'] as const;
export type HullId = (typeof HULL_ORDER)[number];

/** The hull a fresh save starts with and owns for free. */
export const STARTER_HULL: HullId = 'dart';

/**
 * Shop prices in credits (see DECISIONS.md for what they mean in campaign passes). Fan and Shuttle used to cost 600 and 0;
 * a save that already owns them keeps them.
 */
export const TWIN_PRICE = 250;
export const PRONG_PRICE = 900;
export const FAN_PRICE = 2400;
export const SHUTTLE_PRICE = 6000;

export const HULL_PRICES: Record<HullId, number> = {
  dart: 0, twin: TWIN_PRICE, prong: PRONG_PRICE, fan: FAN_PRICE, shuttle: SHUTTLE_PRICE,
};

/**
 * Firing stat of the starter: its pulse rate as a share of CONFIG.PULSE.BASE_RATE (4 per second). With one Flat+ in its slot
 * the Dart does 101 damage per shot, so 0.35 x 4 x 101 = 141 DPS against the Shuttle starter's 404 (35%). Every other hull
 * fires at the full rate.
 */
export const DART_FIRE_RATE_MUL = 0.35;

export const HULL_FIRE_RATE_MUL: Record<HullId, number> = {
  dart: DART_FIRE_RATE_MUL, twin: 1, prong: 1, fan: 1, shuttle: 1,
};

/** Pulse-rate multiplier of a hull (1 for an unknown id or no id: tests and the debug starter circuit). */
export function fireRateMul(hullId?: string): number {
  return (hullId && (HULL_FIRE_RATE_MUL as Record<string, number>)[hullId]) || 1;
}
