/**
 * Sound effects as data. Every sound is one or more synthesized parts (an oscillator or filtered noise with an envelope), so a
 * sound can be tuned by editing numbers here. Peaks stay at or below 0.15 so nothing is loud at the default volume; the
 * character is crisp and geometric (square / triangle / short noise), with no reverb.
 */
export type SoundWave = 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';

export interface SoundPart {
  wave: SoundWave;
  /** Start and end frequency in Hz (the pitch glides exponentially). Ignored by noise, which is shaped by `filter`. */
  f0: number;
  f1: number;
  /** Start of the part inside the sound (s), its length (s) and its peak gain (0..1; keep at or below MAX_PEAK). */
  at: number;
  dur: number;
  peak: number;
  /** Seconds of fade-in (default 0.004: a click-free but crisp start). */
  attack?: number;
  filter?: { type: BiquadFilterType; freq: number; freq1?: number; q?: number };
}

/** 0 = low (hit ticks, shots: dropped first), 1 = normal, 2 = protected (never rate limited, never dropped). */
export type SoundPriority = 0 | 1 | 2;

export interface SoundDef {
  parts: SoundPart[];
  priority: SoundPriority;
  /** Least seconds between two plays of this sound (0 = no limit). Ignored for priority 2. */
  minInterval: number;
  /** Random pitch variation, +/- as a share of the pitch (cosmetic, uses Math.random so combat randomness is untouched). */
  pitchVar?: number;
}

export const MAX_PEAK = 0.15;

export const SOUND_IDS = [
  'shot', 'tick', 'rockHit', 'rockPop', 'split', 'blockDestroyed', 'armorPing', 'shieldHit', 'shieldBreak', 'chain', 'well',
  'bounce', 'crash', 'cleared', 'medal', 'wave', 'uiTap', 'purchase', 'denied', 'pickerOpen', 'pickerClose',
] as const;
export type SfxId = (typeof SOUND_IDS)[number];
/** The ids as a plain array (the engine indexes its rate-limit table by position). */
export const SFX_ORDER: readonly SfxId[] = SOUND_IDS;

const P = (wave: SoundWave, f0: number, f1: number, at: number, dur: number, peak: number, extra: Partial<SoundPart> = {}): SoundPart =>
  ({ wave, f0, f1, at, dur, peak, ...extra });

export const SOUNDS: Record<SfxId, SoundDef> = {
  shot: { priority: 0, minInterval: 0.06, pitchVar: 0.08, parts: [P('square', 880, 520, 0, 0.05, 0.035)] },
  tick: { priority: 0, minInterval: 1 / 12, pitchVar: 0.05, parts: [P('triangle', 640, 420, 0, 0.04, 0.05)] },
  rockHit: { priority: 0, minInterval: 1 / 12, pitchVar: 0.06, parts: [P('square', 300, 170, 0, 0.06, 0.06, { filter: { type: 'lowpass', freq: 1800 } })] },
  rockPop: { priority: 1, minInterval: 0.1, pitchVar: 0.06, parts: [
    P('triangle', 260, 90, 0, 0.12, 0.11),
    P('noise', 0, 0, 0, 0.07, 0.06, { filter: { type: 'bandpass', freq: 1400, q: 0.8 } }),
  ] },
  split: { priority: 2, minInterval: 0, pitchVar: 0.04, parts: [
    P('sawtooth', 520, 180, 0, 0.09, 0.07, { filter: { type: 'lowpass', freq: 2400 } }),
    P('noise', 0, 0, 0, 0.05, 0.07, { filter: { type: 'highpass', freq: 2500 } }),
  ] },
  blockDestroyed: { priority: 1, minInterval: 0.08, pitchVar: 0.05, parts: [
    P('sine', 140, 55, 0, 0.14, 0.14),
    P('noise', 0, 0, 0, 0.05, 0.05, { filter: { type: 'lowpass', freq: 900 } }),
  ] },
  armorPing: { priority: 0, minInterval: 0.07, pitchVar: 0.04, parts: [P('triangle', 2100, 1900, 0, 0.07, 0.06)] },
  shieldHit: { priority: 0, minInterval: 0.07, pitchVar: 0.05, parts: [P('sawtooth', 900, 1500, 0, 0.06, 0.05, { filter: { type: 'bandpass', freq: 1600, q: 3 } })] },
  shieldBreak: { priority: 1, minInterval: 0.15, parts: [
    P('sawtooth', 1600, 200, 0, 0.18, 0.09, { filter: { type: 'lowpass', freq: 3000 } }),
    P('noise', 0, 0, 0, 0.12, 0.05, { filter: { type: 'highpass', freq: 3000 } }),
  ] },
  chain: { priority: 0, minInterval: 0.08, pitchVar: 0.08, parts: [P('noise', 0, 0, 0, 0.09, 0.06, { filter: { type: 'bandpass', freq: 3200, freq1: 1500, q: 2 } })] },
  well: { priority: 1, minInterval: 0.25, parts: [P('sine', 110, 70, 0, 0.35, 0.09, { attack: 0.06 })] },
  bounce: { priority: 0, minInterval: 0.06, pitchVar: 0.08, parts: [P('sine', 1100, 1400, 0, 0.05, 0.05)] },
  crash: { priority: 2, minInterval: 0, parts: [
    P('noise', 0, 0, 0, 0.45, 0.14, { filter: { type: 'lowpass', freq: 1800, freq1: 160 } }),
    P('sawtooth', 220, 40, 0, 0.5, 0.1, { filter: { type: 'lowpass', freq: 900 } }),
  ] },
  cleared: { priority: 2, minInterval: 0, parts: [
    P('triangle', 523, 523, 0, 0.12, 0.1), P('triangle', 659, 659, 0.1, 0.12, 0.1), P('triangle', 784, 784, 0.2, 0.22, 0.1),
  ] },
  medal: { priority: 2, minInterval: 0, parts: [
    P('triangle', 523, 523, 0, 0.14, 0.1), P('triangle', 659, 659, 0.12, 0.14, 0.1), P('triangle', 784, 784, 0.24, 0.14, 0.1),
    P('square', 1047, 1047, 0.36, 0.34, 0.07), P('triangle', 1319, 1319, 0.36, 0.34, 0.08),
  ] },
  wave: { priority: 1, minInterval: 0.3, parts: [P('sine', 440, 440, 0, 0.12, 0.09), P('sine', 587, 587, 0.12, 0.18, 0.09)] },
  uiTap: { priority: 1, minInterval: 0.03, parts: [P('square', 700, 600, 0, 0.03, 0.04)] },
  purchase: { priority: 1, minInterval: 0, parts: [P('triangle', 660, 660, 0, 0.07, 0.09), P('triangle', 990, 990, 0.07, 0.14, 0.09)] },
  denied: { priority: 1, minInterval: 0.1, parts: [P('square', 200, 150, 0, 0.14, 0.07, { filter: { type: 'lowpass', freq: 1200 } })] },
  pickerOpen: { priority: 1, minInterval: 0.05, parts: [P('triangle', 400, 700, 0, 0.07, 0.06)] },
  pickerClose: { priority: 1, minInterval: 0.05, parts: [P('triangle', 700, 400, 0, 0.07, 0.06)] },
};
