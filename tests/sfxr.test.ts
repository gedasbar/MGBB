import { describe, it, expect } from 'vitest';
import { defaultParams, generateSamples, mutate, PRESET_NAMES, preset, randomize, sanitizeParams, seededRng, SfxrParams } from '../src/audio/sfxr';
import { SfxrBank, SFXR_DRAFT_KEY } from '../src/audio/sfxrBank';
import { SfxEngine } from '../src/audio/engine';
import { TunerModel } from '../src/debug/sfxrTunerModel';

function memStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, m };
}

const hash = (a: Float32Array) => { let h = 0; for (let i = 0; i < a.length; i += 7) h = (Math.imul(h, 31) + Math.round(a[i] * 1e4)) | 0; return h; };

describe('sfxr generator', () => {
  it('is deterministic: the same numbers give the same samples, noise included', () => {
    for (const wave of [0, 1, 2, 3] as const) {
      const p: SfxrParams = { ...defaultParams(), wave, startFreq: 0.5, slide: -0.3, lpfFreq: 0.6, hpfFreq: 0.1 };
      const a = generateSamples(p, 22050);
      const b = generateSamples({ ...p }, 22050);
      expect(a.length).toBeGreaterThan(100);
      expect(hash(a)).toBe(hash(b));
      expect(Array.from(a.slice(0, 300))).toEqual(Array.from(b.slice(0, 300)));
    }
  });

  it('different numbers give different samples, in range, and a quiet sound is quieter', () => {
    const a = generateSamples({ ...defaultParams(), startFreq: 0.4 }, 22050);
    const b = generateSamples({ ...defaultParams(), startFreq: 0.6 }, 22050);
    expect(hash(a)).not.toBe(hash(b));
    const peak = (s: Float32Array) => s.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    expect(peak(a)).toBeLessThanOrEqual(1);
    expect(peak(a)).toBeGreaterThan(0.05);
    expect(peak(generateSamples({ ...defaultParams(), volume: 0.1 }, 22050))).toBeLessThan(peak(a));
  });

  it('envelope sets the length; a min frequency stops a falling sound early', () => {
    const short = generateSamples({ ...defaultParams(), sustain: 0.1, decay: 0.1 }, 22050).length;
    const long = generateSamples({ ...defaultParams(), sustain: 0.5, decay: 0.5 }, 22050).length;
    expect(long).toBeGreaterThan(short * 4);
    const free = generateSamples({ ...defaultParams(), slide: -0.5, sustain: 0.5, decay: 0.5 }, 22050).length;
    const cut = generateSamples({ ...defaultParams(), slide: -0.5, minFreq: 0.3, sustain: 0.5, decay: 0.5 }, 22050).length;
    expect(cut).toBeLessThan(free);
  });

  it('sanitize clamps, fills defaults and drops junk; every preset, random and mutate is valid and makes sound', () => {
    const p = sanitizeParams({ wave: 9, volume: 5, slide: -9, bogus: 1, sustain: 'x' });
    expect(p.wave).toBe(0); expect(p.volume).toBe(1); expect(p.slide).toBe(-1); expect(p.sustain).toBe(defaultParams().sustain);
    expect(sanitizeParams(null)).toEqual(defaultParams());
    const rng = seededRng(7);
    const all = [...PRESET_NAMES.map(n => preset(n, rng)), randomize(rng), mutate(randomize(rng), rng)];
    for (const q of all) {
      expect(sanitizeParams(q)).toEqual(q);
      const s = generateSamples(q, 22050);
      expect(s.length).toBeGreaterThan(0);
      expect(s.every(v => Number.isFinite(v))).toBe(true);
    }
    expect(randomize(seededRng(3))).toEqual(randomize(seededRng(3)));
    const base = randomize(seededRng(5));
    expect(mutate(base, seededRng(1))).not.toEqual(base);
    expect(mutate(base, seededRng(1), 0)).toEqual(base);
  });
});

describe('sfxr bank', () => {
  it('export / import round trip keeps every slot and number', () => {
    const a = new SfxrBank({}, null);
    const p1 = randomize(seededRng(11));
    const p2 = preset('Laser', seededRng(12));
    expect(a.assign('shot', p1)).toBe(true);
    expect(a.assign('crash', p2)).toBe(true);
    const text = a.exportJson();
    const b = new SfxrBank({}, null);
    const r = b.importJson(text);
    expect(r).toMatchObject({ ok: true, count: 2, ignored: [] });
    expect(b.exportJson()).toBe(text);
    // numbers survive to the rounding of the file (4 decimals)
    for (const [id, p] of [['shot', p1], ['crash', p2]] as const) {
      for (const k of Object.keys(p) as (keyof SfxrParams)[]) expect(Math.abs((b.get(id) as any)[k] - (p as any)[k])).toBeLessThan(1e-4);
    }
  });

  it('import ignores unknown slots, refuses bad text and newer versions, and changes nothing then', () => {
    const b = new SfxrBank({}, null);
    b.assign('tick', defaultParams());
    expect(b.importJson('not json').ok).toBe(false);
    expect(b.importJson('{"version":99,"sounds":{}}').ok).toBe(false);
    expect(b.has('tick')).toBe(true);
    const r = b.importJson(JSON.stringify({ version: 1, sounds: { nope: defaultParams(), uiTap: defaultParams() } }));
    expect(r.ignored).toEqual(['nope']);
    expect(b.ids()).toEqual(['uiTap']);
  });

  it('slot assignment: assign / clear, unknown slot refused, shipped file loads, a draft replaces it and persists', () => {
    const store = memStore();
    const shipped = { version: 1, sounds: { wave: defaultParams() } };
    const b = new SfxrBank(shipped, store);
    expect(b.has('wave')).toBe(true);
    expect(b.assign('nonsense', defaultParams())).toBe(false);
    b.assign('hurt', defaultParams());
    b.clear('wave');
    expect(store.m.has(SFXR_DRAFT_KEY)).toBe(true);
    const again = new SfxrBank(shipped, store);
    expect(again.ids().sort()).toEqual(['hurt']);
    let n = 0;
    again.onChange(() => n++);
    again.clear('hurt');
    expect(n).toBe(1);
  });
});

describe('tuner model and engine slot', () => {
  it('every change plays, undo restores, Use in game assigns the slot', () => {
    const bank = new SfxrBank({}, null);
    const played: SfxrParams[] = [];
    const m = new TunerModel(bank, p => played.push(p), seededRng(2));
    m.select('blockDestroyed');
    m.randomize();
    const rolled = m.params;
    m.setParam('decay', 0.9);
    expect(m.params.decay).toBe(0.9);
    m.undo();
    expect(m.params).toEqual(rolled);
    expect(played.length).toBe(3);
    expect(bank.has('blockDestroyed')).toBe(false);
    expect(m.useInGame()).toBe(true);
    expect(bank.get('blockDestroyed')).toEqual(rolled);
    m.select('uiTap');
    m.select('blockDestroyed');
    expect(m.params).toEqual(rolled); // picking a designed slot starts from its design
    m.removeDesign();
    expect(bank.has('blockDestroyed')).toBe(false);
  });

  it('the engine plays a designed slot from a buffer and every other slot as before; preview needs no slot', () => {
    const log = { oscillators: 0, sources: 0, buffers: 0 };
    const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} });
    const node = () => ({ connect() {}, disconnect() {} });
    const ctx = {
      currentTime: 0, sampleRate: 8000, state: 'running', destination: node(),
      resume() { return Promise.resolve(); },
      createGain() { return { ...node(), gain: param() }; },
      createBuffer(_c: number, len: number, sr: number) { log.buffers++; return { length: len, sampleRate: sr, getChannelData: () => new Float32Array(len) }; },
      createOscillator() { log.oscillators++; return { ...node(), type: 'sine', frequency: param(), start() {}, stop() {} }; },
      createBufferSource() { log.sources++; return { ...node(), buffer: null, loop: false, playbackRate: param(), start() {}, stop() {} }; },
      createDynamicsCompressor() { return { ...node(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param() }; },
      createBiquadFilter() { return { ...node(), type: 'lowpass', frequency: param(), Q: param() }; },
    };
    let t = 0;
    const bank = new SfxrBank({}, null);
    const e = new SfxEngine({ createContext: () => ctx as unknown as AudioContext, clock: () => t, storage: memStore(), bank });
    e.unlock();
    const noiseBuffers = log.buffers; // the shared noise buffer
    t = 10;
    expect(e.play('uiTap')).toBe(true);
    expect(log.oscillators).toBe(1);
    bank.assign('uiTap', preset('Blip', seededRng(1)));
    t = 20;
    expect(e.play('uiTap')).toBe(true);
    expect(log.oscillators).toBe(1); // no new oscillator: played the designed buffer
    expect(log.buffers).toBe(noiseBuffers + 1);
    t = 30;
    e.play('uiTap');
    expect(log.buffers).toBe(noiseBuffers + 1); // rendered once, cached
    expect(e.preview(randomize(seededRng(4)))).toBe(true);
    expect(log.buffers).toBe(noiseBuffers + 2);
    // volume and mute still apply
    e.setMuted(true);
    expect(e.play('uiTap')).toBe(false);
    expect(e.preview(defaultParams())).toBe(false);
  });
});
