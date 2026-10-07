import { CONFIG } from '../config';
import { ENEMIES, SplitRule } from '../data/enemies';

export interface MitosisEnemy {
  id: number;
  defId: string;
  generation: number;
  hp: number;
  maxHp: number;
  armor: number;
  shield: number;
  maxShield: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  cauterizedTimer: number;
}

export class MitosisSystem {
  enemies: MitosisEnemy[] = [];
  nextId: number = 1;

  spawn(defId: string, generation: number, hp: number, x: number, y: number, radius: number): MitosisEnemy | null {
    if (this.enemies.length >= CONFIG.CAPS.ENEMIES) return null;
    
    // Fallback def
    const def = ENEMIES[defId] || { armorMul: 0, shieldMul: 0 };
    
    const enemy: MitosisEnemy = {
      id: this.nextId++,
      defId,
      generation,
      hp,
      maxHp: hp,
      armor: (def as any).armorMul ? 10 * (def as any).armorMul : 0,
      shield: (def as any).shieldMul ? 10 * (def as any).shieldMul : 0,
      maxShield: (def as any).shieldMul ? 10 * (def as any).shieldMul : 0,
      x,
      y,
      vx: 0,
      vy: 0,
      radius,
      cauterizedTimer: 0
    };

    this.enemies.push(enemy);
    return enemy;
  }

  handleDeath(parent: MitosisEnemy, excessDamage: number = 0, forceSplit: boolean = false, isFissionCatalyst: boolean = false) {
    // Remove parent
    const idx = this.enemies.indexOf(parent);
    if (idx !== -1) this.enemies.splice(idx, 1);

    // Cauterize check
    if (parent.cauterizedTimer > 0 && !forceSplit) {
      return; // No children if cauterized and not forced
    }

    const def = ENEMIES[parent.defId];
    if (!def || !def.split) return;

    // Fission catalyst can force split even if it wasn't onDeath.
    // If not forced and trigger isn't onDeath, we ignore. 
    // Wait, onHitEvery triggers during hits, onDeath triggers here.
    if (!forceSplit && def.split.trigger !== 'onDeath') return;

    this.executeSplit(parent, def.split, excessDamage, isFissionCatalyst);
  }

  executeSplit(parent: MitosisEnemy, rule: SplitRule, excessDamage: number = 0, isFissionCatalyst: boolean = false) {
    if (parent.generation >= CONFIG.MITOSIS.MAX_GENERATION) return;

    let numChildren = 0;
    if (typeof rule.children === 'number') {
      numChildren = rule.children;
    } else {
      // random between min and max
      numChildren = rule.children[0] + Math.floor(Math.random() * (rule.children[1] - rule.children[0] + 1));
    }
    
    // "Over-budget splits spawn one aggregated child with the merge bonus"
    // If spawning these would exceed the cap
    const budgetSpace = CONFIG.CAPS.ENEMIES - this.enemies.length;
    let spawnCount = numChildren;
    let mergeMultiplier = 1;
    
    if (spawnCount > budgetSpace) {
      // We must aggregate
      spawnCount = 1;
      mergeMultiplier = numChildren * CONFIG.MITOSIS.SWARM_MERGE_BONUS; // e.g. 1.5 per child
    }

    // children inherit remaining HP divided by number of children (if fission catalyst)
    // otherwise they get hpShare * parent's MAX HP.
    let childHpBase = rule.hpShare * parent.maxHp;
    if (isFissionCatalyst) {
      childHpBase = parent.hp / numChildren;
    }

    // Overkill spill: excess damage is spread evenly among newly spawned children
    let childHp = (childHpBase * mergeMultiplier);
    if (excessDamage > 0) {
      childHp -= (excessDamage / spawnCount);
    }
    
    if (childHp <= 0) return; // Excess damage killed the children too!

    const childDef = ENEMIES[rule.childDefId];
    const childRadius = childDef ? (childDef.size === 'S' ? 12 : 15) : 10; // rough mapping

    for (let i = 0; i < spawnCount; i++) {
      // simple radial spread
      const angle = (Math.PI * 2 / spawnCount) * i;
      const offset = parent.radius * 0.5;
      const cx = parent.x + Math.cos(angle) * offset;
      const cy = parent.y + Math.sin(angle) * offset;
      
      this.spawn(rule.childDefId, parent.generation + 1, childHp, cx, cy, childRadius);
    }
  }
}
