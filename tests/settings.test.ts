import { describe, it, expect } from 'vitest';
import { resetSave } from '../src/ui/overlays';
import { PROGRESS_KEY } from '../src/econ/progress';
import { STORAGE_KEY, LEGACY_KEY } from '../src/builder/persist';
import { SETTINGS_KEY, loadSettings, saveSettings, DEFAULT_SETTINGS } from '../src/ui/settings';

function store(init: Record<string, string>) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
}

describe('Settings', () => {
  it('Reset save erases progress and the saved circuit, keeps the volume settings, then reloads', () => {
    const s = store({ [PROGRESS_KEY]: '{"a":1}', [STORAGE_KEY]: '{"b":2}', [LEGACY_KEY]: 'x', [SETTINGS_KEY]: '{"masterVolume":0.3}', other: 'keep' });
    let reloaded = 0;
    resetSave(s, () => { reloaded++; });
    expect(s.m.has(PROGRESS_KEY)).toBe(false);
    expect(s.m.has(STORAGE_KEY)).toBe(false);
    expect(s.m.has(LEGACY_KEY)).toBe(false);
    expect(s.m.get(SETTINGS_KEY)).toBe('{"masterVolume":0.3}');
    expect(s.m.get('other')).toBe('keep');
    expect(reloaded).toBe(1);
  });

  it('settings round-trip through storage, and a blocked storage never throws', () => {
    const s = store({});
    saveSettings({ ...DEFAULT_SETTINGS, masterVolume: 0.2, muted: true }, s);
    expect(loadSettings(s)).toMatchObject({ masterVolume: 0.2, muted: true, sfxVolume: 1 });
    const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    expect(() => saveSettings(DEFAULT_SETTINGS, blocked)).not.toThrow();
    expect(loadSettings(blocked)).toEqual(DEFAULT_SETTINGS);
  });
});
