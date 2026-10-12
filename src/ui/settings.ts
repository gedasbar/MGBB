export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** Silences all sound without losing the volume settings. */
  muted: boolean;
  screenShake: boolean;
  visualClarity: boolean;
  colorBlind: boolean;
  textScale: number;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 1.0,
  muted: false,
  screenShake: true,
  visualClarity: false, // if true, reduce trails / thinner projectiles / opaque-enemy outline
  colorBlind: false,
  textScale: 1.0,
  haptics: true
};

export const SETTINGS_KEY = 'mgbm_settings';

/** The storage the settings use (null when the browser blocks it). */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): Settings {
  try {
    const data = storage?.getItem(SETTINGS_KEY);
    if (!data) return { ...DEFAULT_SETTINGS };
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(data) } as Settings;
    s.masterVolume = clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume);
    s.sfxVolume = clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
    s.muted = s.muted === true;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = defaultStorage()) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked or full: the setting just does not persist */ }
}
