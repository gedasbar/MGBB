import { SfxEngine } from './engine';

export { SfxEngine } from './engine';
export { SOUND_IDS } from './sounds';

/** The game's one sound engine. Silent until installAudioUnlock() has seen the first user gesture. */
export const sfx = new SfxEngine();

/** Starts the audio context on the first pointer press or key press and resumes it whenever the tab gets focus back. */
export function installAudioUnlock(target: Window = window): void {
  const unlock = () => sfx.unlock();
  target.addEventListener('pointerdown', unlock, { capture: true });
  target.addEventListener('keydown', unlock, { capture: true });
  target.addEventListener('focus', () => sfx.resume());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sfx.resume(); });
}
