import { BossDef, BossPart, BOSSES } from '../data/bosses';
import { applyDamage } from './damage';

export interface ActiveBossPart extends BossPart {
  destroyed: boolean;
}

export class BossRuntime {
  def: BossDef;
  parts: ActiveBossPart[];
  y: number = 0; // descent
  timeActive: number = 0;
  dangerLineY: number = 800; // Example danger line

  constructor(defId: string, startY: number = 0) {
    this.def = BOSSES[defId];
    this.parts = this.def.parts.map(p => ({ ...p, destroyed: false }));
    this.y = startY;
  }

  update(dt: number) {
    let speed = this.def.descentSpeed;
    if (this.timeActive >= this.def.enrageAt) {
      speed *= 2;
    }
    this.timeActive += dt;
    this.y += speed * dt;
  }

  isPartVulnerable(partId: string): boolean {
    const part = this.parts.find(p => p.id === partId);
    if (!part || part.destroyed) return false;
    if (!part.invulnerableUntil || part.invulnerableUntil.length === 0) return true;
    
    // Check if all dependencies are destroyed
    for (const depId of part.invulnerableUntil) {
      const dep = this.parts.find(p => p.id === depId);
      if (dep && !dep.destroyed) return false;
    }
    return true;
  }

  hitPart(partId: string, damage: number, pureFrac: number, tier: number, isArmorPiercer: boolean, isShieldBreaker: boolean) {
    const part = this.parts.find(p => p.id === partId);
    if (!part || part.destroyed) return;

    const isVulnerable = this.isPartVulnerable(partId);
    
    let effectiveDamage = damage;
    if (!isVulnerable && part.role === 'core') {
      effectiveDamage *= 0.1; // Core takes 10% damage until exposed
    } else if (!isVulnerable) {
      return; // Other parts might be fully invulnerable, but spec says "core takes reduced damage until plate/turret destroyed"
    }

    const res = applyDamage(part as any, effectiveDamage, pureFrac, tier, isArmorPiercer, isShieldBreaker);
    
    if (res.killed) {
      part.destroyed = true;
      part.hp = 0;
    }
    return res;
  }

  isDefeated(): boolean {
    const core = this.parts.find(p => p.role === 'core');
    return core ? core.destroyed : false;
  }

  reachedDangerLine(): boolean {
    return this.y >= this.dangerLineY;
  }
}
