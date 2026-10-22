import { CONFIG, HIT_RADIUS } from '../config';

/**
 * The hull ladder (chunk 17a, design in docs/hull-ladder.md): 19 hulls from the free Dart to the Zenith. Layouts live in
 * game/gridUtils.ts and data/hullLayouts.ts, silhouettes are generated from them in ui/shipArt.ts; this file holds the
 * numbers: price, pulse rate, shot speed and size class. Order = price order = the order of the hull picker.
 */
export const HULL_ORDER = [
  'dart', 'twin', 'prong', 'wisp', 'hornet', 'lancet', 'kestrel', 'mantis', 'bastion', 'halberd',
  'corvette', 'trident', 'galleon', 'shuttle', 'spire', 'leviathan', 'fan', 'citadel', 'zenith',
] as const;
export type HullId = (typeof HULL_ORDER)[number];

/** The hull a fresh save starts with and owns for free. */
export const STARTER_HULL: HullId = 'dart';

/**
 * Size classes. The ship art and the invisible hit circle scale together: a bigger hull is harder to dodge, which is a real
 * cost on a one-hit wall. `small` is the old ship (about 26 x 34 px, HIT_RADIUS 8); art sizes are px at the 540 px viewport.
 */
export type SizeClass = 'small' | 'medium' | 'big' | 'huge';
export const SIZE_CLASSES: Record<SizeClass, { artW: number; artH: number; hitRadius: number }> = {
  small: { artW: 26, artH: 34, hitRadius: HIT_RADIUS },
  medium: { artW: 34, artH: 44, hitRadius: 9 },
  big: { artW: 44, artH: 56, hitRadius: 10 },
  huge: { artW: 56, artH: 70, hitRadius: 11 },
};

export interface HullStats {
  name: string;
  /** Credits in the hull picker. */
  price: number;
  /** Generator pulses per second. Every basic shot deals 1, so this is the hull's main damage stat. */
  pulsesPerSec: number;
  /** Multiplier on projectile speed (1 = the speed every hull had before 17a). */
  shotSpeed: number;
  size: SizeClass;
}

/**
 * Prices in credits (final fit: docs/hull-ladder.md, scripts/hull-pricing.ts). The first three are the old hulls, unchanged:
 * the Twin is about four tier-1 passes of a bare Dart, and every hull after it costs about 1.6 to 2 times the one before.
 * The Fan and the Shuttle used to cost 1,200 and 3,000: a save that already owns them keeps them.
 */
export const HULLS: Record<HullId, HullStats> = {
  dart: { name: 'Dart', price: 0, pulsesPerSec: 2, shotSpeed: 1, size: 'small' },
  twin: { name: 'Twin', price: 70, pulsesPerSec: 2.5, shotSpeed: 1, size: 'small' },
  prong: { name: 'Prong', price: 350, pulsesPerSec: 4, shotSpeed: 1, size: 'small' },
  wisp: { name: 'Wisp', price: 700, pulsesPerSec: 3, shotSpeed: 1.2, size: 'small' },
  hornet: { name: 'Hornet', price: 1500, pulsesPerSec: 3, shotSpeed: 1, size: 'small' },
  lancet: { name: 'Lancet', price: 2500, pulsesPerSec: 5, shotSpeed: 1.3, size: 'small' },
  kestrel: { name: 'Kestrel', price: 4000, pulsesPerSec: 2.5, shotSpeed: 1, size: 'medium' },
  mantis: { name: 'Mantis', price: 7000, pulsesPerSec: 4, shotSpeed: 1.2, size: 'medium' },
  bastion: { name: 'Bastion', price: 12000, pulsesPerSec: 2, shotSpeed: 0.9, size: 'medium' },
  halberd: { name: 'Halberd', price: 20000, pulsesPerSec: 3, shotSpeed: 1, size: 'medium' },
  corvette: { name: 'Corvette', price: 35000, pulsesPerSec: 4.5, shotSpeed: 1.1, size: 'medium' },
  trident: { name: 'Trident', price: 60000, pulsesPerSec: 3, shotSpeed: 1.1, size: 'medium' },
  galleon: { name: 'Galleon', price: 100000, pulsesPerSec: 2, shotSpeed: 0.9, size: 'big' },
  shuttle: { name: 'Shuttle', price: 160000, pulsesPerSec: 5, shotSpeed: 1, size: 'big' },
  spire: { name: 'Spire', price: 260000, pulsesPerSec: 3.5, shotSpeed: 1, size: 'big' },
  leviathan: { name: 'Leviathan', price: 420000, pulsesPerSec: 4, shotSpeed: 1, size: 'big' },
  fan: { name: 'Fan', price: 700000, pulsesPerSec: 4, shotSpeed: 1, size: 'big' },
  citadel: { name: 'Citadel', price: 1200000, pulsesPerSec: 3, shotSpeed: 1, size: 'huge' },
  zenith: { name: 'Zenith', price: 2500000, pulsesPerSec: 4, shotSpeed: 1, size: 'huge' },
};

export const HULL_PRICES: Record<HullId, number> = Object.fromEntries(HULL_ORDER.map(id => [id, HULLS[id].price])) as Record<HullId, number>;

const stats = (hullId?: string): HullStats | undefined => (hullId ? (HULLS as Record<string, HullStats>)[hullId] : undefined);

/** Pulse-rate multiplier of a hull as a share of CONFIG.PULSE.BASE_RATE (1 for an unknown id or no id: tests, the debug starter circuit). */
export function fireRateMul(hullId?: string): number {
  const s = stats(hullId);
  return s ? s.pulsesPerSec / CONFIG.PULSE.BASE_RATE : 1;
}

/** Projectile-speed multiplier of a hull (1 for an unknown id or no id). */
export function shotSpeedMul(hullId?: string): number {
  return stats(hullId)?.shotSpeed ?? 1;
}

/** Size class of a hull (small for an unknown id). */
export function sizeClassOf(hullId?: string): SizeClass {
  return stats(hullId)?.size ?? 'small';
}

/** Radius of the invisible hit circle of a hull, px at the 540 px viewport. */
export function hitRadiusOf(hullId?: string): number {
  return SIZE_CLASSES[sizeClassOf(hullId)].hitRadius;
}
