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
  /** true = x1.5 (level 1); a number is the direct-damage multiplier of a higher Shield-Breaker level. */
  shieldBreaker: boolean | number = false
): DamageResult {
  const isShieldBreaker = !!shieldBreaker;
  const sbMul = shieldBreaker === true ? 1.5 : typeof shieldBreaker === 'number' ? shieldBreaker : 1;
  let pureDmg = damage * pureFrac;
  let directDmg = damage - pureDmg;
  
  if (isShieldBreaker) {
    directDmg *= sbMul; // Example shield breaker logic? "Bonus x damage vs shields only". Let's say x2?
    // Wait, the spec says "Shield-Breaker: Bonus xdamage vs shields only"
    // I'll assume directDmg is multiplied for the shield portion. 
    // Let's do it carefully.
  }

  let shieldDamage = 0;
  if (enemy.shield > 0) {
    let effectiveDirect = directDmg;
    if (isShieldBreaker) effectiveDirect *= 2; 
    
    if (enemy.shield >= effectiveDirect) {
      shieldDamage = effectiveDirect;
      enemy.shield -= effectiveDirect;
      directDmg = 0;
    } else {
      shieldDamage = enemy.shield;
      let usedDirect = enemy.shield / (isShieldBreaker ? 2 : 1);
      enemy.shield = 0;
      directDmg -= usedDirect;
    }
  }

  const pierceMul = armorPierce === true ? 2 : armorPierce === false ? 1 : armorPierce;
  if (pierceMul > 1 && enemy.armor > 0) {
    directDmg *= pierceMul; // Armor-Piercer Tip: bonus damage against armored enemies only
  }

  const armorReduction = 1 / (1 + enemy.armor / armorScale(tier));
  let afterArmor = directDmg * armorReduction;

  let hpDamage = afterArmor + pureDmg;
  
  const actualHpTaken = Math.min(enemy.hp, hpDamage);
  enemy.hp -= hpDamage; // Can go negative
  const killed = enemy.hp <= 0;
  
  return { hpDamage: actualHpTaken, shieldDamage, armorDamage: 0, killed };
}
