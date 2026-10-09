import { EjectorRecipe, Grid } from '../engine/compiler';
import { evalDamage } from '../engine/compilerTypes';
import { ProjectilePool } from '../engine/pools';
import { ProjectileSystem } from '../engine/projectiles';
import { rng } from '../rng';

export const PROJECTILE_SPEED = 600;
/** Ship-space pixels per hull cell: an ejector's offset from the hull centre is scaled by this when projectiles spawn. */
export const PX_PER_CELL = 14;

/** Where each recipe's projectiles leave, relative to the ship centre (from the ejector's cell). */
export function spawnOffsetsFor(recipes: EjectorRecipe[], hull: Grid): { x: number; y: number }[] {
  return recipes.map(r => ({
    x: (r.x - (hull.w - 1) / 2) * PX_PER_CELL,
    y: (r.y - (hull.h - 1) / 2) * PX_PER_CELL,
  }));
}

/** Fire one pulse from (shipX, shipY): one projectile per compiled ejector recipe (chance gates may drop or boost it). */
export function firePulse(
  pool: ProjectilePool, projSys: ProjectileSystem, recipes: EjectorRecipe[],
  offsets: { x: number; y: number }[], shipX: number, shipY: number,
) {
  for (let rIdx = 0; rIdx < recipes.length; rIdx++) {
    const r = recipes[rIdx];
    // Chance blocks (Lucky Strike, Jackpot, Gambler's Gate) are rolled per projectile.
    let damage = r.packet.damage;
    if (r.packet.gates.length > 0) {
      damage = evalDamage(r.packet, () => rng.combat.next());
      if (damage <= 0) continue;
    }
    const speed = PROJECTILE_SPEED * (r.packet.speedMul || 1);
    let vx = 0;
    let vy = 0;
    if (r.direction === 'N') vy = -speed;
    else if (r.direction === 'S') vy = speed;
    else if (r.direction === 'E') vx = speed;
    else vx = -speed;
    const off = offsets[rIdx];
    const i = pool.spawn(shipX + off.x, shipY + off.y, vx, vy, damage, r.packet.pure || 0, rIdx);
    if (i >= 0) projSys.init(i);
  }
}
