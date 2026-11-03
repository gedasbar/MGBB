import { Progress, isFrontierUnlocked, nextTier } from '../econ/progress';
import { UNLOCK_RINGS, furthestRing, reachBySector } from '../frontier/unlocks';
import { MAP_UNLOCK_TIER, FRONTIER_NAME } from '../frontier/constants';
import { generateLevel } from '../wall/generator';
import { MapMode } from './constants';
import { MapMemory } from './memory';
import { FLY_MEDAL_MILESTONES } from '../captains/data';

/** Chunk 29b: what each carousel card says. Pure functions of the save. */
export interface ModeStatus { line: string; locked: boolean; /** What opens a locked mode ("Pass tier 25"); empty when open. */ unlock: string }

/** The first legendary ring above `ring`, or null when all three are reached. */
export function nextLegendaryRing(ring: number): number | null {
  return UNLOCK_RINGS.find(r => r > ring) ?? null;
}

export function modeStatus(mode: MapMode, p: Progress): ModeStatus {
  if (mode === 'campaign') {
    const t = nextTier(p);
    return { line: `Tier ${t} · next: ${generateLevel(t).name}`, locked: false, unlock: '' };
  }
  if (mode === 'frontier') {
    if (!isFrontierUnlocked(p)) return { line: `Pass tier ${MAP_UNLOCK_TIER} to open`, locked: true, unlock: `Pass tier ${MAP_UNLOCK_TIER}` };
    const ring = furthestRing(reachBySector(p.frontier));
    const next = nextLegendaryRing(ring);
    return { line: next === null ? `Ring ${ring} · every legendary ring reached` : `Ring ${ring} · next legendary at ring ${next}`, locked: false, unlock: '' };
  }
  return { line: p.bestWave > 0 ? `Best wave ${p.bestWave}` : 'Not flown yet', locked: false, unlock: '' };
}

export const modeTitle = (mode: MapMode): string => (mode === 'frontier' ? FRONTIER_NAME.toUpperCase() : mode === 'campaign' ? 'CAMPAIGN' : 'FREE FLY');

/** Whether a mode can be opened at all. */
export const modeOpen = (mode: MapMode, p: Progress): boolean => mode !== 'frontier' || isFrontierUnlocked(p);

/** What the Map tab shows: the remembered mode screen, or null for the carousel (also when the remembered mode is no longer open, e.g. a reset save). */
export function tabTarget(memory: MapMemory, p: Progress): MapMode | null {
  return memory.open && modeOpen(memory.open, p) ? memory.open : null;
}

/** The Free Fly screen's rows: the wave milestones, done or not. A milestone is done when it was paid or the best wave has reached it. */
export function flyMilestones(p: Progress): { wave: number; medals: number; done: boolean }[] {
  return FLY_MEDAL_MILESTONES.map(m => ({ wave: m.wave, medals: m.medals, done: p.captains.milestones.includes(m.wave) || p.bestWave >= m.wave }));
}

/** Best Free Fly time as m:ss, or a dash when never flown. */
export function flyBestTime(p: Progress): string {
  if (p.bestTime <= 0) return '–';
  const s = Math.floor(p.bestTime);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
