import { CAPTAIN_BY_ID, Effect, HERO_LEVEL_BASE_DAMAGE, MEDAL_DOUBLE_MAX, OPTION_BY_ID } from './data';

/**
 * What the active captain changes in a run, as plain numbers. Built once at run start by computeRunModifiers() and handed to
 * the world; the neutral value changes nothing (the default captain with no purchases produces exactly that).
 */
export interface RunModifiers {
  /** Added to the generator's base damage of 1 (hero level x HERO_LEVEL_BASE_DAMAGE). */
  baseDamage: number;
  /** Multipliers (1 = none). */
  damageMul: number;
  fireRateMul: number;
  projSpeedMul: number;
  /** Extra damage fractions against armor, shield and fragments (0 = none). */
  vsArmor: number;
  vsShield: number;
  vsFragment: number;
  /** Extra damage multiplier in walls only (1 = none), on top of damageMul. */
  wallDamageMul: number;
  /** Credit multipliers: every kill / block, and wall blocks only. */
  creditMul: number;
  wallCreditMul: number;
  /** Multiplier on the credits paid at wave 5, 10, 15 ... */
  waveBonusMul: number;
  /** Share of the credits a wall run earned that is paid again when the level ends PASSED or CLEARED (0 = none). */
  passCredits: number;
  /** Chance a Medal award is doubled, 0..1. */
  medalDouble: number;
  /** Second Chance charges per run. */
  secondChances: number;
  /** Seconds added to the spawn invulnerability. */
  spawnInvuln: number;
  /** Free Fly hull multiplier, and hull healed per kill. */
  hullMul: number;
  killHeal: number;
  /** Multiplier on the wall's top-edge boost zone height. */
  boostZone: number;
}

export function neutralModifiers(): RunModifiers {
  return {
    baseDamage: 0, damageMul: 1, fireRateMul: 1, projSpeedMul: 1, vsArmor: 0, vsShield: 0, vsFragment: 0, wallDamageMul: 1,
    creditMul: 1, wallCreditMul: 1, waveBonusMul: 1, passCredits: 0, medalDouble: 0, secondChances: 0, spawnInvuln: 0,
    hullMul: 1, killHeal: 0, boostZone: 1,
  };
}

/** The per-captain slice of the save that modifiers need. */
export interface HeroSlice { level: number; active: Record<string, string> }

/**
 * Pure: (hero level, active option ids) -> modifiers. Values of one type add; unknown option ids are ignored (a save
 * written by a build with other options never breaks a run).
 */
export function computeRunModifiers(heroLevel: number, activeOptionIds: string[]): RunModifiers {
  const m = neutralModifiers();
  m.baseDamage = Math.max(0, Math.floor(heroLevel)) * HERO_LEVEL_BASE_DAMAGE;
  const apply = (ef: Effect) => {
    const v = ef.value;
    switch (ef.type) {
      case 'baseDamage': m.baseDamage += v; break;
      case 'damagePct': m.damageMul += v; break;
      case 'fireRatePct': m.fireRateMul += v; break;
      case 'projSpeedPct': m.projSpeedMul += v; break;
      case 'vsArmorPct': m.vsArmor += v; break;
      case 'vsShieldPct': m.vsShield += v; break;
      case 'vsFragmentPct': m.vsFragment += v; break;
      case 'wallDamagePct': m.wallDamageMul += v; break;
      case 'creditPct': m.creditMul += v; break;
      case 'wallCreditPct': m.wallCreditMul += v; break;
      case 'waveBonusPct': m.waveBonusMul += v; break;
      case 'passCreditsPct': m.passCredits += v; break;
      case 'medalDoublePct': m.medalDouble = Math.min(MEDAL_DOUBLE_MAX, m.medalDouble + v); break;
      case 'secondChance': m.secondChances += v; break;
      case 'spawnInvulnSec': m.spawnInvuln += v; break;
      case 'hullPct': m.hullMul += v; break;
      case 'killHeal': m.killHeal += v; break;
      case 'boostZonePct': m.boostZone += v; break;
    }
  };
  for (const id of activeOptionIds) {
    const opt = OPTION_BY_ID[id];
    if (opt) for (const ef of opt.effects) apply(ef);
  }
  return m;
}

/** Modifiers of one captain from its saved slice. Only options of that captain count. */
export function modifiersFor(captainId: string, hero: HeroSlice | undefined): RunModifiers {
  if (!hero || !CAPTAIN_BY_ID[captainId]) return neutralModifiers();
  const ids = Object.values(hero.active).filter(id => OPTION_BY_ID[id]?.captain === captainId);
  return computeRunModifiers(hero.level, ids);
}
