import { describe, it, expect } from 'vitest';
import { SfxEngine, VOICE_CAP } from '../src/audio/engine';
import { MAX_PEAK, PEAK_CAP, PEAK_CAP_PROTECTED, SFX_BOOST, SOUND_IDS, SOUNDS } from '../src/audio/sounds';
import { loadSettings } from '../src/ui/settings';
import { tuningJson } from '../src/debug/soundLab';

/** A context that records what is made and started; nothing is heard. */
function mockContext() {
  const log = { oscillators: 0, sources: 0, stopped: 0, peaks: [] as number[], created: 0, limiters: 0 };
  const param = () => ({
    value: 0,
    setValueAtTime() {}, exponentialRampToValueAtTime() {},
    linearRampToValueAtTime(v: number) { log.peaks.push(v); },
  });
  const node = () => ({ connect() {}, disconnect() {} });
  const ctx = {
    currentTime: 0, sampleRate: 8000, state: 'suspended', destination: node(),
    resumed: 0,
    resume() { this.resumed++; this.state = 'running'; return Promise.resolve(); },
    createGain() { return { ...node(), gain: param() }; },
    createBuffer(_c: number, len: number) { return { getChannelData: () => new Float32Array(len) }; },
    createOscillator() { log.oscillators++; return { ...node(), type: 'sine', frequency: param(), start() {}, stop() { log.stopped++; } }; },
    createBufferSource() { log.sources++; return { ...node(), buffer: null, loop: false, start() {}, stop() { log.stopped++; } }; },
    createDynamicsCompressor() { log.limiters++; return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; },
    createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; },
  };
  return { ctx, log };
}

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

function engine(over: { storage?: ReturnType<typeof memStore> } = {}) {
  const { ctx, log } = mockContext();
  let t = 0;
  const e = new SfxEngine({ createContext: () => ctx as unknown as AudioContext, clock: () => t, storage: over.storage ?? memStore() });
  return { e, ctx, log, setTime: (v: number) => { t = v; ctx.currentTime = v; } };
}

describe('Sound data', () => {
  it('every sound is defined, quiet (peak <= 0.15) and has at least one part', () => {
    for (const id of SOUND_IDS) {
      const d = SOUNDS[id];
      expect(d.parts.length).toBeGreaterThan(0);
      for (const p of d.parts) { expect(p.peak).toBeLessThanOrEqual(MAX_PEAK); expect(p.dur).toBeGreaterThan(0); }
    }
    for (const id of ['crash', 'medal', 'split'] as const) expect(SOUNDS[id].priority).toBe(2);
  });
});

describe('SfxEngine', () => {
  it('play() before the first gesture is a safe no-op that makes no nodes', () => {
    const { e, log } = engine();
    expect(e.ready).toBe(false);
    expect(e.play('crash')).toBe(false);
    expect(log.oscillators + log.sources).toBe(0);
    e.unlock();
    expect(e.ready).toBe(true);
    expect(e.play('crash')).toBe(true);
  });

  it('survives a browser without Web Audio', () => {
    const e = new SfxEngine({ createContext: () => null, storage: memStore() });
    e.unlock();
    expect(e.ready).toBe(false);
    expect(e.play('uiTap')).toBe(false);
  });

  it('the voice cap holds: 100 distinct sounds in one instant never exceed VOICE_CAP voices', () => {
    const { e } = engine();
    e.unlock();
    const normals = ['rockPop', 'blockDestroyed', 'wave', 'uiTap', 'purchase', 'denied', 'pickerOpen', 'pickerClose', 'shieldBreak', 'well'] as const;
    for (let i = 0; i < 100; i++) e.play(normals[i % normals.length]);
    expect(e.activeVoices).toBeLessThanOrEqual(VOICE_CAP);
    expect(e.activeVoices).toBe(VOICE_CAP);
  });

  it('rate limiting drops excess calls of a limited sound but never the protected ones', () => {
    const { e, setTime } = engine();
    e.unlock();
    let played = 0;
    for (let i = 0; i < 100; i++) { setTime(i * 0.001); if (e.play('tick')) played++; } // 100 calls in 0.1 s, limit 12/s
    expect(played).toBeLessThanOrEqual(2);
    expect(e.stats.rateLimited).toBeGreaterThanOrEqual(98);
    // Protected: every call plays, even when the pool is full of other sounds, by stealing a lower-priority voice.
    const before = e.stats.played;
    for (let i = 0; i < 40; i++) { setTime(1 + i * 0.001); expect(e.play('split')).toBe(true); }
    expect(e.stats.played - before).toBe(40);
    for (let i = 0; i < 5; i++) { setTime(2); expect(e.play('crash')).toBe(true); expect(e.play('medal')).toBe(true); }
  });

  it('a protected sound steals a low-priority voice; a low-priority sound cannot steal a protected one', () => {
    const { e, setTime } = engine();
    e.unlock();
    setTime(0);
    for (let i = 0; i < VOICE_CAP; i++) expect(e.play('split')).toBe(true); // pool full of protected voices
    setTime(0.1);
    expect(e.play('rockPop')).toBe(false);                                   // normal priority: dropped
    expect(e.stats.dropped).toBe(1);
    expect(e.play('crash')).toBe(true);                                      // protected: steals the oldest
    expect(e.activeVoices).toBe(VOICE_CAP);
  });

  it('finished voices free their slots', () => {
    const { e, setTime } = engine();
    e.unlock();
    setTime(0);
    for (let i = 0; i < VOICE_CAP; i++) e.play('split');
    expect(e.activeVoices).toBe(VOICE_CAP);
    setTime(5);
    expect(e.activeVoices).toBe(0);
    expect(e.play('rockPop')).toBe(true);
  });

  it('mute and volumes persist and are restored by a new engine; muted play() is silent', () => {
    const store = memStore();
    const a = engine({ storage: store });
    a.e.unlock();
    a.e.setMasterVolume(0.4);
    a.e.setSfxVolume(0.7);
    a.e.setMuted(true);
    expect(a.e.play('uiTap')).toBe(false);
    const b = engine({ storage: store });
    expect(b.e.settings.masterVolume).toBeCloseTo(0.4);
    expect(b.e.settings.sfxVolume).toBeCloseTo(0.7);
    expect(b.e.settings.muted).toBe(true);
    b.e.unlock();
    b.e.setMuted(false);
    expect(b.e.play('uiTap')).toBe(true);
    expect(engine({ storage: store }).e.settings.muted).toBe(false);
  });

  it('survives corrupt stored settings and clamps volumes into 0..1', () => {
    const store = memStore();
    store.m.set('mgbm_settings', '{"masterVolume": 7, "sfxVolume": -2, "muted": "yes"}');
    const { e } = engine({ storage: store });
    expect(e.settings.masterVolume).toBe(1);
    expect(e.settings.sfxVolume).toBe(0);
    expect(e.settings.muted).toBe(false);
    store.m.set('mgbm_settings', '{not json');
    expect(engine({ storage: store }).e.settings.masterVolume).toBe(1);
  });

  it('a huge gain option is still capped at the peak limit', () => {
    const { e, log } = engine();
    e.unlock();
    e.play('medal', { gain: 50 });
    expect(Math.max(...log.peaks)).toBeLessThanOrEqual(PEAK_CAP_PROTECTED);
  });
});

describe('12b loudness, weapon sound and tuning', () => {
  it('every sound is boosted by SFX_BOOST (and capped), and a limiter sits on the master bus', () => {
    const { e, log } = engine();
    e.unlock();
    expect(log.limiters).toBe(1);
    e.play('uiTap');
    const def = SOUNDS.uiTap.parts[0].peak;
    expect(Math.max(...log.peaks)).toBeCloseTo(def * SFX_BOOST, 6);
    log.peaks.length = 0;
    e.play('rockHit', { gain: 100 });
    expect(Math.max(...log.peaks)).toBeCloseTo(PEAK_CAP, 6);
    log.peaks.length = 0;
    e.play('medal', { gain: 100 });
    expect(Math.max(...log.peaks)).toBeCloseTo(PEAK_CAP_PROTECTED, 6);
    expect(PEAK_CAP).toBeCloseTo(MAX_PEAK * SFX_BOOST, 6);
  });

  it('Weapon sound Off (the default) plays nothing for shots', () => {
    const { e, setTime } = engine();
    e.unlock();
    expect(e.settings.weaponSound).toBe('off');
    let n = 0;
    for (let i = 0; i < 100; i++) { setTime(i * 0.01); if (e.playShot()) n++; }
    expect(n).toBe(0);
    expect(e.stats.played).toBe(0);
  });

  it('Soft plays at most 4 shots a second and Normal at most 6, however many projectiles', () => {
    for (const [mode, cap] of [['soft', 4], ['normal', 6]] as const) {
      const { e, setTime } = engine();
      e.unlock();
      e.setWeaponSound(mode);
      let n = 0;
      for (let i = 0; i < 100; i++) { setTime(i * 0.01); if (e.playShot()) n++; } // 100 shots in one second
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThanOrEqual(cap);
    }
  });

  it('the soft thump has no highs and is much quieter than a rock pop', () => {
    const soft = SOUNDS.shotSoft.parts[0];
    expect(soft.wave).toBe('sine');
    expect(Math.max(soft.f0, soft.f1)).toBeLessThanOrEqual(180);
    expect(soft.dur).toBeLessThanOrEqual(0.05);
    expect(soft.peak).toBeLessThan(SOUNDS.rockPop.parts[0].peak * 0.5);
  });

  it('hit sounds share one limit: 100 mixed hits in a second play at most 8', () => {
    const { e, setTime } = engine();
    e.unlock();
    const ids = ['tick', 'rockHit', 'armorPing', 'shieldHit'] as const;
    let n = 0;
    for (let i = 0; i < 100; i++) { setTime(i * 0.01); if (e.play(ids[i % 4])) n++; }
    expect(n).toBeLessThanOrEqual(8);
    expect(n).toBeGreaterThanOrEqual(6);
  });

  it('the weapon setting and per-sound multipliers persist, apply on top of the boost, and reset', () => {
    const store = memStore();
    const a = engine({ storage: store });
    a.e.unlock();
    a.e.setWeaponSound('soft');
    a.e.setSoundMult('uiTap', 2);
    a.e.setSoundMult('denied', 0.5);
    a.log.peaks.length = 0;
    a.e.play('uiTap');
    expect(Math.max(...a.log.peaks)).toBeCloseTo(SOUNDS.uiTap.parts[0].peak * SFX_BOOST * 2, 6);
    const b = engine({ storage: store });
    expect(b.e.settings.weaponSound).toBe('soft');
    expect(b.e.soundMult('uiTap')).toBe(2);
    expect(b.e.soundMult('denied')).toBe(0.5);
    expect(b.e.soundMult('crash')).toBe(1);
    b.e.setSoundMult('uiTap', 9);               // clamped to 3
    expect(b.e.soundMult('uiTap')).toBe(3);
    b.e.resetSoundMult();
    expect(loadSettings(store).soundMult).toEqual({});
  });

  it('junk stored multipliers are cleaned up (clamped 0..3, non-numbers dropped) and an unknown weapon value falls back to off', () => {
    const store = memStore();
    store.m.set('mgbm_settings', '{"weaponSound":"loud","soundMult":{"a":"x","b":99,"c":-1,"d":1.5}}');
    const { e } = engine({ storage: store });
    expect(e.settings.weaponSound).toBe('off');
    expect(e.settings.soundMult).toEqual({ b: 3, c: 0, d: 1.5 });
  });
});

describe('Sound lab', () => {
  it('Copy tuning lists only the changed multipliers, rounded to 0.1, and Reset empties it', () => {
    const { e } = engine();
    expect(tuningJson(e)).toBe('{}');
    e.setSoundMult('rockPop', 1.5);
    e.setSoundMult('shot', 0.3);
    e.setSoundMult('crash', 1);
    expect(JSON.parse(tuningJson(e))).toEqual({ shot: 0.3, rockPop: 1.5 });
    e.resetSoundMult();
    expect(tuningJson(e)).toBe('{}');
  });
});
