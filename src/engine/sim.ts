import { Mulberry32 } from '../rng';
import { ProjectilePool } from './pools';
import { MitosisSystem } from './mitosis';
import { CONFIG } from '../config';

export interface SimResult {
  kills: number;
  damage: number;
  splits: number;
}

function stringToSeed(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = Math.imul(31, hash) + str.charCodeAt(i) | 0;
  return hash;
}

export function simulate(seconds: number, seed: string): SimResult {
  // Set the seeds
  const rng = new Mulberry32(stringToSeed(seed));
  
  const pool = new ProjectilePool(CONFIG.CAPS.PROJECTILES);
  const mitosis = new MitosisSystem();
  
  let kills = 0;
  let damageDealt = 0;
  let splits = 0;
  
  // Dummy headless simulation of what a run would do deterministically.
  // We'll spawn a few enemies, fire some shots, and step the loop.
  // The goal is just to prove deterministic output based on the seed.
  
  // Initial enemies
  for (let i = 0; i < 10; i++) {
    // Math.random -> rng.next()
    mitosis.spawn('mitotic_rock', 0, 100, rng.next() * 500, rng.next() * 500, 10);
  }
  
  const dt = 1/60;
  const frames = Math.floor(seconds * 60);
  
  for (let f = 0; f < frames; f++) {
    // Every 0.5s, player fires a shot forward
    if (f % 30 === 0) {
      // x, y, vx, vy, damage, pure, modIndex
      pool.spawn(250, 800, (rng.next() - 0.5) * 50, -300, 50, 0, 0);
    }
    
    // Move projectiles
    for (let i = 0; i < pool.max; i++) {
      if (pool.active[i]) {
        pool.x[i] += pool.vx[i] * dt;
        pool.y[i] += pool.vy[i] * dt;
        
        // Out of bounds check
        if (pool.y[i] < -100) pool.free(i);
      }
    }
    
    // Very naive collision check for simulation logic testing
    for (let i = 0; i < pool.max; i++) {
      if (!pool.active[i]) continue;
      
      for (let j = 0; j < mitosis.enemies.length; j++) {
        const e = mitosis.enemies[j];
        if (e.hp <= 0) continue;
        
        const dx = e.x - pool.x[i];
        const dy = e.y - pool.y[i];
        if (dx*dx + dy*dy < e.radius * e.radius) {
          // Hit!
          e.hp -= pool.damage[i];
          damageDealt += pool.damage[i];
          pool.free(i);
          
          if (e.hp <= 0) {
            kills++;
            // Splitting logic
            const prevLen = mitosis.enemies.length;
            mitosis.handleDeath(e, 0, false, false);
            splits += (mitosis.enemies.length - prevLen);
          }
          break; // only hit one
        }
      }
    }
  }
  
  return { kills, damage: damageDealt, splits }; // We track damageDealt as the main output
}
