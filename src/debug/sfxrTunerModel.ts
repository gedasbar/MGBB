import { defaultParams, mutate, preset, PresetName, randomize, SfxrKey, SfxrParams, SfxrWave, sanitizeParams } from '../audio/sfxr';
import type { SfxrBank } from '../audio/sfxrBank';
import { SfxId, SOUND_IDS } from '../audio/sounds';

/** The label of every sound slot in the tuner, in the order they are listed (grouped by what they are for). */
export const SLOT_LABELS: Record<SfxId, string> = {
  shot: 'Shot (normal)', shotSoft: 'Shot (soft)', tick: 'Hit tick', rockHit: 'Rock hit', rockPop: 'Rock break', split: 'Rock split',
  blockDestroyed: 'Block break', armorPing: 'Armor ping', shieldHit: 'Shield hit', shieldBreak: 'Shield break', chain: 'Chain lightning',
  well: 'Gravity well', bounce: 'Bounce', aoe: 'AoE blast', hurt: 'Ship hurt', crash: 'Crash', crystal: 'Crystal pickup',
  wave: 'Wave start', bossArrive: 'Boss arrival', bossDeath: 'Boss death', cleared: 'Cleared', passed: 'Passed', medal: 'Medal',
  uiTap: 'UI click', purchase: 'UI buy', denied: 'UI error', pickerOpen: 'Sheet open', pickerClose: 'Sheet close',
};

/** Slot ids in the order the tuner lists them. */
export const SLOT_ORDER: readonly SfxId[] = Object.keys(SLOT_LABELS) as SfxId[];

/**
 * The tuner's logic without any DOM: the slot being designed, its current numbers and an undo list.
 * Every change plays the sound (`play`), so the owner hears what each slider does.
 */
export class TunerModel {
  slot: SfxId = SLOT_ORDER[0];
  params: SfxrParams;
  private history: SfxrParams[] = [];

  constructor(
    private readonly bank: SfxrBank,
    private readonly play: (p: SfxrParams) => void,
    private readonly rng: () => number = Math.random,
  ) {
    this.params = bank.get(this.slot) ?? defaultParams();
  }

  /** Picks a slot; starts from the slot's design when it has one, else from a plain default. Undo history restarts. */
  select(slot: SfxId): void {
    if (!(SOUND_IDS as readonly string[]).includes(slot)) return;
    this.slot = slot;
    this.params = this.bank.get(slot) ?? defaultParams();
    this.history = [];
  }

  /** Replaces the numbers (remembering the old ones for Undo) and plays. */
  private set(next: SfxrParams): void {
    this.history.push(this.params);
    if (this.history.length > 100) this.history.shift();
    this.params = sanitizeParams(next);
    this.play(this.params);
  }

  setParam(key: SfxrKey, value: number): void { this.set({ ...this.params, [key]: value }); }
  setWave(wave: SfxrWave): void { this.set({ ...this.params, wave }); }
  applyPreset(name: PresetName): void { this.set(preset(name, this.rng)); }
  randomize(): void { this.set(randomize(this.rng)); }
  mutate(): void { this.set(mutate(this.params, this.rng)); }
  replay(): void { this.play(this.params); }

  get canUndo(): boolean { return this.history.length > 0; }
  undo(): boolean {
    const prev = this.history.pop();
    if (!prev) return false;
    this.params = prev;
    this.play(this.params);
    return true;
  }

  /** "Use in game": the slot plays these numbers from now on (kept in localStorage). */
  useInGame(): boolean { return this.bank.assign(this.slot, this.params); }
  /** Back to the slot's hand-made sound. */
  removeDesign(): void { this.bank.clear(this.slot); }
  get designed(): boolean { return this.bank.has(this.slot); }
}
