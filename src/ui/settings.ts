import { ParticleMode, PARTICLE_MODES, ShakeMode, SHAKE_MODES } from '../data/feel';
export type WeaponSound = 'off' | 'soft' | 'normal';
export const WEAPON_SOUNDS: readonly WeaponSound[] = ['off', 'soft', 'normal'];
export const MAX_SOUND_MULT = 3;

/** Chunk 24a: how a finger steers the ship. Relative: the ship moves by the finger's movement. Direct: the ship sits at the finger. */
export type TouchControl = 'relative' | 'direct';
export const TOUCH_CONTROLS: readonly TouchControl[] = ['relative', 'direct'];

/** Chunk 28b: frame-rate limit. 0 = Auto (the display's own rate); 30 and 60 cap the render loop. */
export type FrameLimit = 0 | 30 | 60;
export const FRAME_LIMITS: readonly FrameLimit[] = [0, 30, 60];
/** Chunk 28b: how long a shot's trail is (Graphics > Trails). */
export type TrailMode = 'off' | 'short' | 'long';
export const TRAIL_MODES: readonly TrailMode[] = ['off', 'short', 'long'];
/** Chunk 28b: the touch sensitivity slider (the finger's movement x this = the ship's movement, in relative mode). */
export const TOUCH_GAIN_MIN = 0.75;
export const TOUCH_GAIN_MAX = 2;
export const TOUCH_GAIN_STEP = 0.25;
/** Chunk 28b: the stored value of "Auto" for the projectile skin and "the shot's own colour" for the trail. */
export const SKIN_AUTO = 'auto';
export const TRAIL_STYLE_DEFAULT = 'default';
/** The settings shape version: 1 = before 28b (no field; the shape of 12a-24a), 2 = 28b (graphics, controls, cosmetics, hub preferences). */
export const SETTINGS_VERSION = 2;

export interface Settings {
  version: number;
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
  /** Chunk 28b: Graphics. */
  frameLimit: FrameLimit;
  trails: TrailMode;
  backgrounds: boolean;
  damageNumbers: boolean;
  /** Chunk 34a: Graphics. Screen shake Off / Low / Normal, particles Low / High, hit stop On / Off. */
  shake: ShakeMode;
  particles: ParticleMode;
  hitStop: boolean;
  /** Chunk 28b: Controls. Relative touch control moves the ship by the finger's movement x touchGain. */
  touchGain: number;
  /** Chunk 28b: Customization: the projectile skin ('auto' = the look follows damage, a damage-band look id, or an achievement skin id) and the trail style. */
  shotSkin: string;
  trailStyle: string;
  /** Chunk 28b: the Achievements tab's "Show completed" switch (default off, remembered). */
  showCompleted: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
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
  frameLimit: 0,
  trails: 'short',
  backgrounds: true,
  damageNumbers: true,
  shake: 'normal',
  particles: 'high',
  hitStop: true,
  touchGain: 1,
  shotSkin: SKIN_AUTO,
  trailStyle: TRAIL_STYLE_DEFAULT,
  showCompleted: false,
};

export const SETTINGS_KEY = 'mgbm_settings';

/** The storage the settings use (null when the browser blocks it). */
function defaultStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

const clamp01 = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(1, v)) : fallback);

const snap = (v: number, step: number) => Math.round(v / step) * step;

/**
 * Turns whatever was stored into a valid Settings of the current version (chunk 28b). A version 1 blob (no `version`, the shape of 12a-24a) gets the new
 * fields' defaults; every field is checked, so a hand-edited or damaged value falls back to its default instead of breaking the game. Never throws.
 */
export function migrateSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>;
  const s = { ...d, ...(r as object), soundMult: {} } as Settings;
  s.version = SETTINGS_VERSION;
  s.masterVolume = clamp01(r.masterVolume, d.masterVolume);
  s.sfxVolume = clamp01(r.sfxVolume, d.sfxVolume);
  s.muted = r.muted === true;
  s.touchControl = TOUCH_CONTROLS.includes(r.touchControl as TouchControl) ? (r.touchControl as TouchControl) : d.touchControl;
  s.weaponSound = WEAPON_SOUNDS.includes(r.weaponSound as WeaponSound) ? (r.weaponSound as WeaponSound) : d.weaponSound;
  s.frameLimit = FRAME_LIMITS.includes(r.frameLimit as FrameLimit) ? (r.frameLimit as FrameLimit) : d.frameLimit;
  s.trails = TRAIL_MODES.includes(r.trails as TrailMode) ? (r.trails as TrailMode) : d.trails;
  s.backgrounds = typeof r.backgrounds === 'boolean' ? r.backgrounds : d.backgrounds;
  s.damageNumbers = typeof r.damageNumbers === 'boolean' ? r.damageNumbers : d.damageNumbers;
  s.shake = SHAKE_MODES.includes(r.shake as ShakeMode) ? (r.shake as ShakeMode) : d.shake;
  s.particles = PARTICLE_MODES.includes(r.particles as ParticleMode) ? (r.particles as ParticleMode) : d.particles;
  s.hitStop = typeof r.hitStop === 'boolean' ? r.hitStop : d.hitStop;
  s.showCompleted = r.showCompleted === true;
  s.touchGain = typeof r.touchGain === 'number' && isFinite(r.touchGain) ? Math.max(TOUCH_GAIN_MIN, Math.min(TOUCH_GAIN_MAX, snap(r.touchGain, TOUCH_GAIN_STEP))) : d.touchGain;
  s.shotSkin = typeof r.shotSkin === 'string' && r.shotSkin.length > 0 && r.shotSkin.length <= 40 ? r.shotSkin : d.shotSkin;
  s.trailStyle = typeof r.trailStyle === 'string' && r.trailStyle.length > 0 && r.trailStyle.length <= 40 ? r.trailStyle : d.trailStyle;
  const m: Record<string, number> = {};
  if (r.soundMult && typeof r.soundMult === 'object') {
    for (const [k, v] of Object.entries(r.soundMult as Record<string, unknown>)) if (typeof v === 'number' && isFinite(v)) m[k] = Math.max(0, Math.min(MAX_SOUND_MULT, v));
  }
  s.soundMult = m;
  return s;
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): Settings {
  try {
    const data = storage?.getItem(SETTINGS_KEY);
    if (!data) return { ...DEFAULT_SETTINGS, soundMult: {} };
    return migrateSettings(JSON.parse(data));
  } catch {
    return { ...DEFAULT_SETTINGS, soundMult: {} };
  }
}

export function saveSettings(settings: Settings, storage: Pick<Storage, 'setItem'> | null = defaultStorage()) {
  try { storage?.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* storage blocked or full: the setting just does not persist */ }
}
