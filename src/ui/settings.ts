export interface Settings {
  masterVolume: number;
  sfxVolume: number;
  musicVolume: number;
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
  screenShake: true,
  visualClarity: false, // if true, reduce trails / thinner projectiles / opaque-enemy outline
  colorBlind: false,
  textScale: 1.0,
  haptics: true
};

export function loadSettings(): Settings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const data = localStorage.getItem('mgbm_settings');
    if (!data) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('mgbm_settings', JSON.stringify(settings));
}
