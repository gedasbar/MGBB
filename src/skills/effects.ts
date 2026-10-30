/**
 * What the owned skill nodes change, as plain numbers (chunk 22a, docs/skills.md). Every field is an ADDITIVE delta on a neutral zero:
 * the engine reads `BASE + skills.field`, so the neutral value changes nothing. The list below is the only place the keys are named;
 * data/skillTree.ts gives each node an `fx` with some of them.
 */
export const SKILL_FX_KEYS = [
  // Routing
  'turnLeftAdd', 'turnRightAdd', 'splitter2Mul', 'splitter3Mul', 'curveAdd', 'delayMul', 'routerBoth', 'waypointPer', 'hollowPerCell',
  // Flight
  'angleLeftBonus', 'angleRightBonus', 'scatterBonus', 'acceleratorBonus', 'brakeFloor', 'upturnDelay', 'extenderLife', 'zigzagGain', 'heavyTop',
  // Volley
  'plusOneBase', 'forkFrac', 'splitter3Cap', 'orbitPass', 'mineExtra', 'boomerangRange', 'plusOneCap', 'mirrorMul', 'fuseN',
  // Impact
  'pierceChance', 'bounceChance', 'bounceDamage', 'aoeRectPenalty', 'aoeCirclePenalty', 'chainFrac', 'persistSpend', 'lastBreathMul', 'reboundMul',
  // Firepower
  'flatPlusPer', 'percentCap', 'luckyChance', 'jackpotMul', 'gamblerChance', 'overclockCap', 'executionerBelow', 'payloadAdd', 'loneShotTop',
  // Salvage
  'replayCredits', 'recordCredits', 'freeFlyCredits', 'medalSquareExtra', 'respecDiscount', 'heroDiscount', 'legendaryCredits', 'echoShare', 'idleBarrels',
] as const;

export type SkillFxKey = (typeof SKILL_FX_KEYS)[number];
export type SkillEffects = Record<SkillFxKey, number>;
/** A node's own effect: some keys, each a delta. */
export type SkillFx = Partial<Record<SkillFxKey, number>>;

/** All zeros: the effects of a player with no node. */
export function neutralSkills(): SkillEffects {
  const e = {} as SkillEffects;
  for (const k of SKILL_FX_KEYS) e[k] = 0;
  return e;
}

/** Shared read-only neutral value for code that has no skills (tests, scripts). Never mutate it. */
export const NO_SKILLS: Readonly<SkillEffects> = Object.freeze(neutralSkills());

/** Sums the `fx` of the given nodes. */
export function sumSkillFx(list: Iterable<SkillFx>): SkillEffects {
  const e = neutralSkills();
  for (const fx of list) for (const k of Object.keys(fx) as SkillFxKey[]) e[k] += fx[k] ?? 0;
  return e;
}
