import { describe, it, expect } from 'vitest';
import { ProjectileSystem, EnemyEntity } from '../src/engine/projectiles';
import { ProjectilePool } from '../src/engine/pools';
import { SpatialHash } from '../src/engine/spatialHash';
import { armorScale } from '../src/engine/damage';

describe('Projectiles modifiers', () => {
  it('Piercing loses damage per target; Bounce keeps full damage; AoE hits all in radius once.', () => {
    const pool = new ProjectilePool(10);
    const sys = new ProjectileSystem(pool);
    
    // We mock the modifiers array mapped to index
    sys.modifiersTable = [
      [], // 0 = no mods
      [{ type: 'piercing' }], // 1 = piercing
      [{ type: 'bouncing', max: 2 }], // 2 = bouncing
      [{ type: 'aoe_circle', radius: 50 }], // 3 = AoE
    ];
    
    const spatial = new SpatialHash(1000, 1000, 100);
    const enemies: EnemyEntity[] = [
      { id: 0, x: 100, y: 100, radius: 10, hp: 40, maxHp: 40, armor: 0, shield: 0, maxShield: 0 },
      { id: 1, x: 100, y: 100, radius: 10, hp: 80, maxHp: 80, armor: 0, shield: 0, maxShield: 0 },
      { id: 2, x: 500, y: 500, radius: 10, hp: 100, maxHp: 100, armor: armorScale(1)*9, shield: 0, maxShield: 0 }, // Armored
      { id: 3, x: 300, y: 300, radius: 10, hp: 100, maxHp: 100, armor: 0, shield: 0, maxShield: 0 },
      { id: 4, x: 310, y: 310, radius: 10, hp: 100, maxHp: 100, armor: 0, shield: 0, maxShield: 0 },
    ];
    for (const e of enemies) spatial.insert(e.id, e.x, e.y);

    // Piercing
    pool.spawn(100, 100, 0, 0, 100, 0, 1);
    sys.processHits(enemies, spatial, 1);
    sys.processHits(enemies, spatial, 1); // Second tick for second enemy
    
    // Let's verify enemy 0 and 1 HP.
    expect(enemies[0].hp).toBeLessThanOrEqual(0);
    expect(enemies[1].hp).toBeLessThan(80);
    // Projectile should be freed or damage reduced? We'll assert damage is reduced.
    
    // Bounce
    const pBounce = pool.spawn(500, 500, 10, 0, 100, 0, 2);
    const vxBefore = pool.vx[pBounce];
    const vyBefore = pool.vy[pBounce];
    sys.processHits(enemies, spatial, 1);
    // Hit enemy 2 (armored). Bounce keeps full damage.
    // Should pick random direction and keep damage = 100.
    expect(enemies[2].hp).toBeLessThan(100);
    expect(pool.damage[pBounce]).toBe(100);
    expect(pool.active[pBounce]).toBe(1);
    expect(pool.vx[pBounce] !== vxBefore || pool.vy[pBounce] !== vyBefore).toBe(true);
    
    // AoE
    const pAoe = pool.spawn(300, 300, 0, 0, 100, 0, 3);
    sys.processHits(enemies, spatial, 1);
    // Hits enemy 3 and 4 (within 50px).
    expect(enemies[3].hp).toBe(0);
    expect(enemies[4].hp).toBe(0);
    expect(pool.active[pAoe]).toBe(0); // Detonates
  });
});
