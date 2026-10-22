export function armorScale(tier: number): number {
  return 10; // Simple scale for now, maybe dependent on tier later.
  // Actually, wait, the spec says "armor is a ratio, never a flat wall"
  // Let's check spec:
  // tierArmor(t) = 0.8 * tierHP(t)
  // afterArmor  = remainder * (1 / (1 + armor / armorScale(tier)))
  // "armorScale(tier)" needs to be defined. Let's make it 12 * 1.055^t just like base HP so 1 armor = 50% reduction? 
  // Let's use 100 as base armorScale or derive from tier.
  return 100 * Math.pow(1.055, tier); 
}

export interface EnemyStats {
  hp: number;
  maxHp: number;
  armor: number;
  shield: number;
  maxShield: number;
}

export interface DamageResult {
  hpDamage: number;
  shieldDamage: number;
  armorDamage: number;
  killed: boolean;
}

export function applyDamage(
  enemy: EnemyStats,
  damage: number,
  pureFrac: number,
  tier: number,
  /** Multiplier on direct damage against armored enemies (true = 2); 0 or false = none. */
  armorPierce: number | boolean = false,
  /** true = x1.5 (level 1); a number is the shield multiplier of a higher Shield-Breaker level. */
  shieldBreaker: boolean | number = false
): DamageResult {
  // Chunk 16c-2: a NaN or empty hit does nothing (HP can never become NaN); Infinity kills the target.
  if (!(damage > 0)) return { hpDamage: 0, shieldDamage: 0, armorDamage: 0, killed: enemy.hp <= 0 };
  const isShieldBreaker = !!shieldBreaker;
  const sbMul = shieldBreaker === true ? 1.5 : typeof shieldBreaker === 'number' ? shieldBreaker : 1;
  // `pureFrac > 0` first: Infinity x 0 would be NaN.
  const pureDmg = pureFrac > 0 ? damage * pureFrac : 0;
  let directDmg = damage - pureDmg;

  // A shield takes the direct damage; Shield-Breaker makes it take sbMul x 2 per point (and only the shield: the part of the hit
  // that gets through to armor and HP is plain direct damage).
  let shieldDamage = 0;
  if (enemy.shield > 0) {
    const perPoint = isShieldBreaker ? sbMul * 2 : 1;
    const need = enemy.shield / perPoint; // direct damage that empties the shield
    if (directDmg <= need) {
      shieldDamage = directDmg * perPoint;
      enemy.shield -= shieldDamage;
      directDmg = 0;
    } else {
      shieldDamage = enemy.shield;
      enemy.shield = 0;
      directDmg -= need;
    }
  }

  const pierceMul = armorPierce === true ? 2 : armorPierce === false ? 1 : armorPierce;
  if (pierceMul > 1 && enemy.armor > 0) {
    directDmg *= pierceMul; // Armor-Piercer Tip: bonus damage against armored enemies only
  }

  const armorReduction = 1 / (1 + enemy.armor / armorScale(tier));
  const afterArmor = directDmg * armorReduction;

  let hpDamage = afterArmor + pureDmg;
  if (Number.isNaN(hpDamage) || hpDamage < 0) hpDamage = 0;

  const actualHpTaken = Math.min(Math.max(0, enemy.hp), hpDamage);
  // Infinity - Infinity would be NaN: an infinite hit simply kills.
  enemy.hp = hpDamage === Infinity ? Math.min(enemy.hp, 0) - 1 : enemy.hp - hpDamage; // can go negative
  const killed = enemy.hp <= 0;

  return { hpDamage: actualHpTaken, shieldDamage, armorDamage: 0, killed };
}
