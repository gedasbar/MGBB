export type WeaponSound = 'off' | 'soft' | 'normal';
export const WEAPON_SOUNDS: readonly WeaponSound[] = ['off', 'soft', 'normal'];
export const MAX_SOUND_MULT = 3;

/** Chunk 24a: how a finger steers the ship. Relative: the ship moves by the finger's movement. Direct: the ship sits at the finger. */
export type TouchControl = 'relative' | 'direct';
export const TOUCH_CONTROLS: readonly TouchControl[] = ['relative', 'direct'];

export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
  /** Silences all sound without losing the volume settings. */
  muted: boolean;
  /** The per-projectile shot sound: off (default), a soft low thump, or the normal blip (all rate limited). */
  weaponSound: WeaponSound;
  /** Per-sound loudness multipliers set in the debug sound lab (absent = 1); applied on top of the global boost. */
  soundMult: Record<string, number>;
  screenShake: boolean;
  visualClarity: boolean;
  colorBlind: boolean;
  textScale: number;
  haptics: boolean;
  touchControl: TouchControl;
}

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 1.0,
  sfxVolume: 1.0,
  musicVolume: 1.0,
  muted: false,
  weaponSound: 'off',
  soundMult: {},
  screenShake: true,
  visualClarity: false, // if true, reduce trails / thinner projectiles / opaque-enemy outline
  colorBlind: false,
  textScale: 1.0,
  haptics: true,
  touchControl: 'relative',
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
    if (!data) return { ...DEFAULT_SETTINGS, soundMult: {} };
    const s = { ...DEFAULT_SETTINGS, ...JSON.parse(data) } as Settings;
    s.masterVolume = clamp01(s.masterVolume, DEFAULT_SETTINGS.masterVolume);
    s.sfxVolume = clamp01(s.sfxVolume, DEFAULT_SETTINGS.sfxVolume);
    s.muted = s.muted === true;
    if (!TOUCH_CONTROLS.includes(s.touchControl)) s.touchControl = 'relative';
    if (!WEAPON_SOUNDS.includes(s.weaponSound)) s.weaponSound = 'off';
    const m: Record<string, number> = {};
    if (s.soundMult && typeof s.soundMult === 'object') {
      for (const [k, v] of Object.entries(s.soundMult)) if (typeof v === 'number' && isFinite(v)) m[k] = Math.max(0, Math.min(MAX_SOUND_MULT, v));
    }
    s.soundMult = m;
    return s;
  } catch {
    return { ...DEFAULT_SETTINGS, soundMult: {} };
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = defaultStorage()) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked or full: the setting just does not persist */ }
}
