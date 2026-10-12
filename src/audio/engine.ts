import { loadSettings, saveSettings, Settings } from '../ui/settings';
import { MAX_PEAK, SFX_ORDER, SfxId, SoundDef, SOUNDS } from './sounds';

/** At most this many sounds sound at once; the lowest-priority, oldest one is stolen for a newer one. */
export const VOICE_CAP = 16;
/** Seconds of the shared noise buffer (looped; every noise part plays it from its start). */
const NOISE_SECONDS = 1;
/** Floor of the exponential envelopes (they cannot reach 0). */
const SILENT = 0.0001;

export interface PlayOpts {
  /** Multiplies every frequency of the sound (1 = as defined). */
  pitch?: number;
  /** Multiplies the loudness (1 = as defined). */
  gain?: number;
}

interface Voice {
  live: boolean;
  id: number;
  priority: number;
  start: number;
  end: number;
  sources: AudioScheduledSourceNode[];
  nodes: AudioNode[];
}

export interface SfxEngineOptions {
  /** Makes the AudioContext (tests pass a mock). Called on the first unlock only. */
  createContext?: () => AudioContext | null;
  /** Seconds, monotonic. Defaults to the context's own clock. */
  clock?: () => number;
  /** Where volume and mute persist (defaults to localStorage); pass null to disable. */
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
}

/**
 * Sound effects on one AudioContext (sfx gain -> master gain -> speakers), all synthesized from data (sounds.ts).
 * Safe to call before the first user gesture: play() is a no-op until unlock() has made the context.
 * Cheap with hundreds of shots: a global voice cap, a per-sound rate limit and protected sounds that always play.
 */
export class SfxEngine {
  settings: Settings;
  /** Counters for tests and the stats panel. */
  readonly stats = { played: 0, rateLimited: 0, dropped: 0, stolen: 0 };

  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfx: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly voices: Voice[] = [];
  private readonly last: Float64Array;
  private readonly index = new Map<string, number>();
  private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null | undefined;
  private readonly clockFn: (() => number) | null;
  private readonly makeCtx: () => AudioContext | null;

  constructor(opts: SfxEngineOptions = {}) {
    this.storage = opts.storage;
    this.settings = opts.storage === undefined ? loadSettings() : loadSettings(opts.storage);
    this.clockFn = opts.clock ?? null;
    this.makeCtx = opts.createContext ?? defaultContext;
    SFX_ORDER.forEach((id, i) => this.index.set(id, i));
    this.last = new Float64Array(SFX_ORDER.length).fill(-1e9);
    for (let i = 0; i < VOICE_CAP; i++) this.voices.push({ live: false, id: -1, priority: 0, start: 0, end: 0, sources: [], nodes: [] });
  }

  /** True once the context exists (after the first gesture). */
  get ready(): boolean { return this.ctx !== null; }

  /** Voices that have not finished by the current clock. */
  get activeVoices(): number {
    const t = this.now();
    let n = 0;
    for (const v of this.voices) if (v.live && v.end > t) n++;
    return n;
  }

  /** Call from a user gesture (pointer or key): makes the context the first time, resumes it when suspended. */
  unlock(): void {
    if (!this.ctx) {
      let c: AudioContext | null = null;
      try { c = this.makeCtx(); } catch { c = null; }
      if (!c) return;
      this.ctx = c;
      this.master = c.createGain();
      this.sfx = c.createGain();
      this.sfx.connect(this.master);
      this.master.connect(c.destination);
      const len = Math.max(1, Math.floor(c.sampleRate * NOISE_SECONDS));
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    }
    this.resume();
  }

  /** Resumes a suspended context (tab focus). */
  resume(): void {
    const c = this.ctx;
    if (c && c.state === 'suspended') { try { void c.resume(); } catch { /* ignore */ } }
  }

  setMasterVolume(v: number) { this.settings.masterVolume = clamp01(v); this.changed(); }
  setSfxVolume(v: number) { this.settings.sfxVolume = clamp01(v); this.changed(); }
  setMuted(m: boolean) { this.settings.muted = m; this.changed(); }

  private changed() {
    this.applyVolumes();
    if (this.storage === undefined) saveSettings(this.settings); else saveSettings(this.settings, this.storage);
  }

  private applyVolumes() {
    if (!this.master || !this.sfx || !this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setValueAtTime(this.settings.muted ? 0 : this.settings.masterVolume, t);
    this.sfx.gain.setValueAtTime(this.settings.sfxVolume, t);
  }

  private now(): number { return this.clockFn ? this.clockFn() : (this.ctx ? this.ctx.currentTime : 0); }

  /** Plays a sound; returns whether it was started (false: not ready, muted, rate limited or dropped). */
  play(id: SfxId, opts?: PlayOpts): boolean {
    const ctx = this.ctx;
    if (!ctx || !this.sfx || this.settings.muted || this.settings.masterVolume <= 0 || this.settings.sfxVolume <= 0) return false;
    const k = this.index.get(id);
    if (k === undefined) return false;
    const def: SoundDef = SOUNDS[id];
    const t = this.now();
    if (def.priority < 2 && t - this.last[k] < def.minInterval) { this.stats.rateLimited++; return false; }
    const v = this.acquire(def.priority, t);
    if (!v) { this.stats.dropped++; return false; }
    this.last[k] = t;

    const pitch = (opts?.pitch ?? 1) * (def.pitchVar ? 1 + (Math.random() * 2 - 1) * def.pitchVar : 1);
    const gain = opts?.gain ?? 1;
    let end = 0;
    const t0 = ctx.currentTime;
    for (const p of def.parts) {
      const at = t0 + p.at;
      const g = ctx.createGain();
      const peak = Math.max(SILENT * 2, Math.min(MAX_PEAK, p.peak * gain));
      g.gain.setValueAtTime(SILENT, at);
      g.gain.linearRampToValueAtTime(peak, at + (p.attack ?? 0.004));
      g.gain.exponentialRampToValueAtTime(SILENT, at + p.dur);
      let src: AudioScheduledSourceNode;
      if (p.wave === 'noise') {
        const n = ctx.createBufferSource();
        n.buffer = this.noise;
        n.loop = true;
        src = n;
      } else {
        const o = ctx.createOscillator();
        o.type = p.wave;
        o.frequency.setValueAtTime(p.f0 * pitch, at);
        o.frequency.exponentialRampToValueAtTime(Math.max(1, p.f1 * pitch), at + p.dur);
        src = o;
      }
      let tail: AudioNode = src;
      if (p.filter) {
        const f = ctx.createBiquadFilter();
        f.type = p.filter.type;
        f.frequency.setValueAtTime(p.filter.freq * pitch, at);
        if (p.filter.freq1) f.frequency.exponentialRampToValueAtTime(p.filter.freq1 * pitch, at + p.dur);
        if (p.filter.q) f.Q.setValueAtTime(p.filter.q, at);
        tail.connect(f);
        tail = f;
        v.nodes.push(f);
      }
      tail.connect(g);
      g.connect(this.sfx);
      v.nodes.push(g);
      v.sources.push(src);
      src.start(at);
      src.stop(at + p.dur + 0.02);
      end = Math.max(end, p.at + p.dur + 0.02);
    }
    v.live = true;
    v.id = k;
    v.priority = def.priority;
    v.start = t;
    v.end = t + end;
    this.stats.played++;
    return true;
  }

  /** A free voice, else the lowest-priority oldest one if it is not more important than the new sound; null = drop. */
  private acquire(priority: number, t: number): Voice | null {
    let victim: Voice | null = null;
    for (const v of this.voices) {
      if (v.live && v.end <= t) this.release(v);
      if (!v.live) return v;
      if (!victim || v.priority < victim.priority || (v.priority === victim.priority && v.start < victim.start)) victim = v;
    }
    if (!victim || victim.priority > priority) return null;
    this.release(victim, true);
    this.stats.stolen++;
    return victim;
  }

  private release(v: Voice, stop = false) {
    if (stop) for (const s of v.sources) { try { s.stop(); } catch { /* already stopped */ } }
    for (const n of v.nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    v.sources.length = 0;
    v.nodes.length = 0;
    v.live = false;
  }
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function defaultContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return C ? new C() : null;
}
