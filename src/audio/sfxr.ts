/**
 * sfxr-style sound generator (chunk 35b). A sound is a small set of numbers (`SfxrParams`); `generateSamples` turns it into mono
 * samples, deterministically (the noise comes from a seeded generator, never Math.random). Based on the classic sfxr tool.
 * Pure: no Web Audio, no DOM, so it is unit-tested; `sfxrBank.ts` stores sounds and the engine plays the samples.
 */

export type SfxrWave = 0 | 1 | 2 | 3; // 0 square, 1 saw, 2 sine, 3 noise
export const WAVE_NAMES = ['square', 'saw', 'sine', 'noise'] as const;

export interface SfxrParams {
  wave: SfxrWave;
  /** Envelope times (0..1 each; the sound is at most about 3 s long). */
  attack: number;
  sustain: number;
  /** Extra loudness at the start of the sustain (0..1). */
  punch: number;
  decay: number;
  /** Start frequency and the frequency below which the sound stops (0..1; minFreq 0 = never). */
  startFreq: number;
  minFreq: number;
  /** Pitch slide (-1..1) and its change (-1..1). */
  slide: number;
  deltaSlide: number;
  vibratoDepth: number;
  vibratoSpeed: number;
  /** Arpeggio: pitch jump (-1..1) after a delay (0..1). */
  arpMod: number;
  arpSpeed: number;
  /** Square duty (0..1) and its sweep (-1..1). */
  duty: number;
  dutySweep: number;
  /** Retrigger rate (0 = none). */
  repeatSpeed: number;
  lpfFreq: number;
  lpfResonance: number;
  lpfSweep: number;
  hpfFreq: number;
  hpfSweep: number;
  volume: number;
}

export type SfxrKey = Exclude<keyof SfxrParams, 'wave'>;

/** Every parameter with its range and the label the tuner shows. `wave` is a choice, the rest are sliders. */
export const PARAM_SPECS: readonly { key: SfxrKey; label: string; min: number; max: number }[] = [
  { key: 'attack', label: 'Attack', min: 0, max: 1 },
  { key: 'sustain', label: 'Sustain', min: 0, max: 1 },
  { key: 'punch', label: 'Punch', min: 0, max: 1 },
  { key: 'decay', label: 'Decay', min: 0, max: 1 },
  { key: 'startFreq', label: 'Start frequency', min: 0, max: 1 },
  { key: 'minFreq', label: 'Min frequency', min: 0, max: 1 },
  { key: 'slide', label: 'Slide', min: -1, max: 1 },
  { key: 'deltaSlide', label: 'Delta slide', min: -1, max: 1 },
  { key: 'vibratoDepth', label: 'Vibrato depth', min: 0, max: 1 },
  { key: 'vibratoSpeed', label: 'Vibrato speed', min: 0, max: 1 },
  { key: 'arpMod', label: 'Arpeggio change', min: -1, max: 1 },
  { key: 'arpSpeed', label: 'Arpeggio speed', min: 0, max: 1 },
  { key: 'duty', label: 'Duty', min: 0, max: 1 },
  { key: 'dutySweep', label: 'Duty sweep', min: -1, max: 1 },
  { key: 'repeatSpeed', label: 'Repeat speed', min: 0, max: 1 },
  { key: 'lpfFreq', label: 'Low-pass cutoff', min: 0, max: 1 },
  { key: 'lpfResonance', label: 'Low-pass resonance', min: 0, max: 1 },
  { key: 'lpfSweep', label: 'Low-pass sweep', min: -1, max: 1 },
  { key: 'hpfFreq', label: 'High-pass cutoff', min: 0, max: 1 },
  { key: 'hpfSweep', label: 'High-pass sweep', min: -1, max: 1 },
  { key: 'volume', label: 'Volume', min: 0, max: 1 },
];

export const SAMPLE_RATE = 44100;
/** The sound stops after this many seconds whatever the envelope says. */
export const MAX_SECONDS = 4;

export function defaultParams(): SfxrParams {
  return {
    wave: 0, attack: 0, sustain: 0.3, punch: 0, decay: 0.4, startFreq: 0.3, minFreq: 0, slide: 0, deltaSlide: 0,
    vibratoDepth: 0, vibratoSpeed: 0, arpMod: 0, arpSpeed: 0, duty: 0, dutySweep: 0, repeatSpeed: 0,
    lpfFreq: 1, lpfResonance: 0, lpfSweep: 0, hpfFreq: 0, hpfSweep: 0, volume: 0.5,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Any object -> valid params: unknown keys dropped, missing ones default, numbers clamped to their range. */
export function sanitizeParams(raw: unknown): SfxrParams {
  const out = defaultParams();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  const w = Number(r.wave);
  if (Number.isInteger(w) && w >= 0 && w <= 3) out.wave = w as SfxrWave;
  for (const s of PARAM_SPECS) {
    const v = Number(r[s.key]);
    if (r[s.key] !== undefined && Number.isFinite(v)) out[s.key] = clamp(v, s.min, s.max);
  }
  return out;
}

/** mulberry32: a tiny seeded generator. */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable seed from the numbers, so the same params always give the same noise. */
function paramSeed(p: SfxrParams): number {
  let h = 2166136261;
  const mix = (v: number) => { h = Math.imul(h ^ Math.round(v * 100000), 16777619) >>> 0; };
  mix(p.wave);
  for (const s of PARAM_SPECS) mix(p[s.key]);
  return h;
}

/**
 * Mono samples in -1..1. Follows sfxr: the oscillator period comes from `startFreq`, slides and vibrato change it per sample,
 * the envelope has attack / sustain (with punch) / decay, then a resonant low-pass and a high-pass.
 */
export function generateSamples(input: SfxrParams, sampleRate = SAMPLE_RATE): Float32Array {
  const p = sanitizeParams(input);
  const rng = seededRng(paramSeed(p));
  const sq = (v: number) => v * v;
  const cube = (v: number) => v * v * v;
  // Scale the classic 44.1 kHz constants so other sample rates sound the same.
  const k = SAMPLE_RATE / sampleRate;

  let fperiod = 100 / (sq(p.startFreq) + 0.001);
  let period = Math.floor(fperiod);
  const fmaxperiod = 100 / (sq(p.minFreq) + 0.001);
  let fslide = 1 - cube(p.slide) * 0.01 * k;
  const fdslide = -cube(p.deltaSlide) * 0.000001 * sq(k);
  let squareDuty = 0.5 - p.duty * 0.5;
  const squareSlide = -p.dutySweep * 0.00005 * k;
  const arpMod = p.arpMod >= 0 ? 1 - sq(p.arpMod) * 0.9 : 1 + sq(p.arpMod) * 10;
  let arpTime = 0;
  const arpLimit = p.arpSpeed === 1 ? 0 : Math.floor(sq(1 - p.arpSpeed) * 20000 / k + 32);
  let arpFactor = arpMod;
  const rngNoise = () => rng() * 2 - 1;

  const envLen = [
    Math.floor(sq(p.attack) * 100000 / k),
    Math.floor(sq(p.sustain) * 100000 / k),
    Math.floor(sq(p.decay) * 100000 / k),
  ];
  const total = Math.min(Math.floor(MAX_SECONDS * sampleRate), envLen[0] + envLen[1] + envLen[2]);

  let fltp = 0, fltdp = 0, fltphp = 0;
  let fltw = cube(p.lpfFreq) * 0.1;
  const fltwD = 1 + p.lpfSweep * 0.0001;
  const lpfOn = p.lpfFreq < 1;
  const fltdmp = clamp(5 / (1 + sq(p.lpfResonance) * 20) * (0.01 + fltw), 0, 0.8);
  let flthp = sq(p.hpfFreq) * 0.1;
  const flthpD = 1 + p.hpfSweep * 0.0003;
  const vibSpeed = sq(p.vibratoSpeed) * 0.01 * k;
  const vibAmp = p.vibratoDepth * 0.5;
  let vibPhase = 0;
  const repeatLimit = p.repeatSpeed === 0 ? 0 : Math.floor(sq(1 - p.repeatSpeed) * 20000 / k) + 32;

  let phase = 0;
  let repeatTime = 0;
  let envStage = 0;
  let envTime = 0;
  const noiseBuf = new Float32Array(32);
  for (let i = 0; i < 32; i++) noiseBuf[i] = rngNoise();
  let out = new Float32Array(total);
  let written = 0;
  const vol = sq(p.volume);
  let stopped = false;

  for (let n = 0; n < total && !stopped; n++) {
    repeatTime++;
    if (repeatLimit !== 0 && repeatTime >= repeatLimit) {
      repeatTime = 0;
      fperiod = 100 / (sq(p.startFreq) + 0.001);
      fslide = 1 - cube(p.slide) * 0.01 * k;
      arpTime = 0;
      arpFactor = arpMod;
    }
    if (arpLimit !== 0 && ++arpTime >= arpLimit) { arpTime = 0; fperiod *= arpFactor; arpFactor = 1; }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) {
      fperiod = fmaxperiod;
      if (p.minFreq > 0) stopped = true;
    }
    let rfperiod = fperiod;
    if (vibAmp > 0) { vibPhase += vibSpeed; rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp); }
    period = Math.max(8, Math.floor(rfperiod));
    squareDuty = clamp(squareDuty + squareSlide, 0, 0.5);

    envTime++;
    while (envStage < 2 && envTime > envLen[envStage]) { envTime = 0; envStage++; }
    let env: number;
    if (envStage === 0) env = envLen[0] === 0 ? 1 : envTime / envLen[0];
    else if (envStage === 1) env = 1 + (1 - envTime / Math.max(1, envLen[1])) * 2 * p.punch;
    else env = 1 - envTime / Math.max(1, envLen[2]);
    env = Math.max(0, env);

    flthp = clamp(flthp * flthpD, 0.00001, 0.1);
    if (lpfOn) fltw = clamp(fltw * fltwD, 0.0001, 0.1);

    // Oscillator (supersampled 8x like sfxr to keep the square clean).
    let ssample = 0;
    for (let si = 0; si < 8; si++) {
      phase++;
      if (phase >= period) {
        phase %= period;
        if (p.wave === 3) for (let i = 0; i < 32; i++) noiseBuf[i] = rngNoise();
      }
      const fp = phase / period;
      let s: number;
      switch (p.wave) {
        case 0: s = fp < squareDuty ? 0.5 : -0.5; break;
        case 1: s = 1 - fp * 2; break;
        case 2: s = Math.sin(fp * 2 * Math.PI); break;
        default: s = noiseBuf[Math.floor(phase * 32 / period) % 32]; break;
      }
      const pp = fltp;
      if (lpfOn) { fltdp += (s - fltp) * fltw; fltdp -= fltdp * fltdmp; } else { fltp = s; fltdp = 0; }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      ssample += fltphp;
    }
    ssample = (ssample / 8) * env * vol * 2;
    out[n] = clamp(ssample, -1, 1);
    written = n + 1;
  }
  out = out.slice(0, written);
  // Fade the last few samples so a hard stop never clicks.
  const fade = Math.min(out.length, Math.floor(sampleRate * 0.004));
  for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

/** Seconds a sound lasts (before the filters; equal to the generated length unless a min frequency cuts it short). */
export function nominalSeconds(p: SfxrParams, sampleRate = SAMPLE_RATE): number {
  return generateSamples(p, sampleRate).length / sampleRate;
}

// --- Presets, randomize, mutate (all take a generator so they are testable) -------------------------------------------------

export const PRESET_NAMES = ['Pickup', 'Laser', 'Explosion', 'Power-up', 'Hit', 'Blip', 'Jump'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

const r = (rng: () => number) => rng();
const rr = (rng: () => number, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = (rng: () => number, n: number) => Math.floor(rng() * n);

export function preset(name: PresetName, rng: () => number = Math.random): SfxrParams {
  const p = defaultParams();
  switch (name) {
    case 'Pickup':
      p.startFreq = rr(rng, 0.4, 0.5); p.sustain = rr(rng, 0, 0.1); p.decay = rr(rng, 0.1, 0.5); p.punch = rr(rng, 0.3, 0.6);
      if (r(rng) < 0.5) { p.arpSpeed = rr(rng, 0.5, 0.7); p.arpMod = rr(rng, 0.2, 0.6); }
      break;
    case 'Laser':
      p.wave = pick(rng, 3) as SfxrWave;
      if (p.wave === 2 && r(rng) < 0.5) p.wave = 0;
      p.startFreq = rr(rng, 0.5, 1); p.minFreq = Math.max(0.2, p.startFreq - rr(rng, 0.2, 0.8)); p.slide = rr(rng, -0.65, -0.35);
      if (r(rng) < 0.33) { p.startFreq = rr(rng, 0.3, 0.9); p.minFreq = rr(rng, 0, 0.1); p.slide = rr(rng, -0.8, -0.1); }
      p.duty = rr(rng, 0, 0.5); p.dutySweep = rr(rng, 0, 0.2);
      p.sustain = rr(rng, 0.1, 0.3); p.decay = rr(rng, 0, 0.4); if (r(rng) < 0.5) p.punch = rr(rng, 0, 0.3);
      if (r(rng) < 0.33) { p.hpfFreq = rr(rng, 0, 0.3); p.hpfSweep = -rr(rng, 0, 0.2); }
      break;
    case 'Explosion':
      p.wave = 3;
      if (r(rng) < 0.5) { p.startFreq = rr(rng, 0.1, 0.4); p.slide = rr(rng, -0.1, 0.3); } else { p.startFreq = rr(rng, 0.2, 0.7); p.slide = rr(rng, -0.4, -0.2); }
      if (r(rng) < 0.2) p.slide = 0;
      if (r(rng) < 0.33) p.repeatSpeed = rr(rng, 0.3, 0.8);
      p.sustain = rr(rng, 0.1, 0.4); p.decay = rr(rng, 0, 0.5); p.punch = rr(rng, 0.2, 0.8);
      break;
    case 'Power-up':
      if (r(rng) < 0.5) p.wave = 1; else p.duty = rr(rng, 0, 0.6);
      if (r(rng) < 0.5) { p.startFreq = rr(rng, 0.2, 0.5); p.slide = rr(rng, 0.1, 0.5); p.repeatSpeed = rr(rng, 0.4, 0.8); }
      else { p.startFreq = rr(rng, 0.2, 0.5); p.slide = rr(rng, 0.05, 0.25); if (r(rng) < 0.5) { p.vibratoDepth = rr(rng, 0, 0.7); p.vibratoSpeed = rr(rng, 0, 0.6); } }
      p.sustain = rr(rng, 0, 0.4); p.decay = rr(rng, 0.1, 0.5);
      break;
    case 'Hit':
      p.wave = pick(rng, 3) as SfxrWave;
      if (p.wave === 2) p.wave = 3;
      if (p.wave === 0) p.duty = rr(rng, 0, 0.6);
      p.startFreq = rr(rng, 0.2, 0.8); p.slide = -rr(rng, 0.3, 0.7);
      p.sustain = rr(rng, 0, 0.1); p.decay = rr(rng, 0.1, 0.3); if (r(rng) < 0.5) p.hpfFreq = rr(rng, 0, 0.3);
      break;
    case 'Blip':
      p.wave = pick(rng, 2) as SfxrWave;
      if (p.wave === 0) p.duty = rr(rng, 0, 0.6);
      p.startFreq = rr(rng, 0.2, 0.6); p.sustain = rr(rng, 0.1, 0.2); p.decay = rr(rng, 0, 0.2); p.hpfFreq = 0.1;
      break;
    case 'Jump':
      p.wave = 0; p.duty = rr(rng, 0, 0.6);
      p.startFreq = rr(rng, 0.3, 0.6); p.slide = rr(rng, 0.1, 0.3); p.sustain = rr(rng, 0.1, 0.4); p.decay = rr(rng, 0.1, 0.3);
      if (r(rng) < 0.5) p.hpfFreq = rr(rng, 0, 0.3);
      if (r(rng) < 0.5) p.lpfFreq = rr(rng, 0.5, 1);
      break;
  }
  p.volume = 0.5;
  return sanitizeParams(p);
}

/** A fully random sound (anything goes). */
export function randomize(rng: () => number = Math.random): SfxrParams {
  const p = defaultParams();
  p.wave = pick(rng, 4) as SfxrWave;
  p.startFreq = Math.pow(rng(), 2) * (rng() < 0.5 ? 1 : 0.5) + 0.1;
  p.slide = Math.pow(rng() * 2 - 1, 3);
  p.deltaSlide = rr(rng, -0.3, 0.3) * (rng() < 0.5 ? 0 : 1);
  p.minFreq = rng() < 0.4 ? rr(rng, 0, 0.3) : 0;
  p.duty = rng(); p.dutySweep = Math.pow(rng() * 2 - 1, 3) * (rng() < 0.5 ? 0 : 1);
  p.vibratoDepth = rng() < 0.3 ? rng() : 0; p.vibratoSpeed = rng();
  p.attack = Math.pow(rng(), 3) * 0.5;
  p.sustain = Math.pow(rng(), 2) * 0.35 + 0.05;
  p.decay = rng() * 0.45 + 0.05;
  p.punch = Math.pow(rng(), 2) * 0.6;
  if (rng() < 0.4) { p.lpfFreq = 1 - Math.pow(rng(), 3); p.lpfResonance = rng(); p.lpfSweep = Math.pow(rng() * 2 - 1, 3); }
  if (rng() < 0.3) { p.hpfFreq = Math.pow(rng(), 5); p.hpfSweep = Math.pow(rng() * 2 - 1, 5); }
  if (rng() < 0.4) { p.arpSpeed = rng(); p.arpMod = rng() * 2 - 1; }
  if (rng() < 0.3) p.repeatSpeed = rng();
  p.volume = 0.5;
  return sanitizeParams(p);
}

/** A small random change: each parameter moves with 50% chance by up to +/- `amount` of its range. */
export function mutate(from: SfxrParams, rng: () => number = Math.random, amount = 0.05): SfxrParams {
  const p = { ...sanitizeParams(from) };
  for (const s of PARAM_SPECS) {
    if (s.key === 'volume') continue;
    if (rng() < 0.5) p[s.key] = clamp(p[s.key] + (rng() * 2 - 1) * amount * (s.max - s.min), s.min, s.max);
  }
  if (rng() < 0.05) p.wave = pick(rng, 4) as SfxrWave;
  return sanitizeParams(p);
}
