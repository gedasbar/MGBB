import { CONFIG, shipHalfW } from '../config';
import { PointerState } from '../input';
import type { World } from '../game/world';
import { PROJECTILE_SPEED } from '../game/fire';
import { ENEMY_BULLET_RADIUS } from '../data/enemyBullets';

/** Tuning of the balance bot (it stands in for a decent player, not a perfect one). */
const BOT = {
  /** Height the ship flies at (px from the top). */
  Y: 840,
  /** Top speed of the ship in px/s (a finger, not a teleport). */
  SPEED: 650,
  /** Seconds ahead the bot looks for bodies that would touch the ship. */
  LOOKAHEAD: 0.7,
  /** Extra clearance around the ship's hit circle, px. */
  CLEARANCE: 16,
  /** Candidate positions every STEP px. */
  STEP: 6,
};

/** Chunk 32b: during a boss fight the bot only shoots at a plain rock once it is below this height (px from the top). */
const BOSS_ROCK_Y = 480;

/** Chunk 32a: whether the bot also steps around enemy bullets (the balance script switches it off to show what the bullets cost). */
export const BOT_OPTS = { dodgeBullets: true };

/**
 * A deterministic Free Fly pilot for the balance script and tests: it dodges whatever would touch the ship soon and
 * otherwise lines up under the body closest to leaking (leading it for the shot's travel time). The gun fires on its own.
 * No randomness: the same world gives the same moves.
 */
class FreeFlyBot {
  readonly pointer: PointerState = { x: CONFIG.VIEW.W / 2, y: BOT.Y, active: false, type: 'mouse', seen: true };

  step(w: World, dt: number) {
    const W = CONFIG.VIEW.W, m = shipHalfW(CONFIG.VIEW.W), hitR = w.hitR;
    const enemies = w.mitosis.enemies;
    // Target: the lowest body still above the ship, led by the shot's flight time. A boss's own bodies (core, plates, escorts) are not
    // part of this: the bot clears the plain rocks first (the Hive Mother's), and only when none is left aims at the boss (below).
    let aim = W / 2, lowest = -Infinity;
    for (const e of enemies) {
      if (e.bossRole) continue;
      if (w.boss && e.y < BOSS_ROCK_Y) continue; // with a boss up, a rock is let come until it is low (the boss is the target)
      if (e.y < BOT.Y - 60 && e.y > lowest && e.y > -e.radius) {
        lowest = e.y;
        aim = e.x + e.vx * Math.max(0, (BOT.Y - e.y) / PROJECTILE_SPEED);
      }
    }
    // Chunk 32b: against a boss with no plain rock left, aim at the body that takes the damage (the core, the Queen, the middle of the Colossus), and keep out of the
    // line of an invulnerable plate (a shot that hits a plate is lost).
    const boss = w.boss;
    if (boss && boss.conduits.length && lowest === -Infinity) aim = boss.conduits[Math.floor(boss.conduits.length / 2)].x;
    let bestX = w.shipX, bestCost = Infinity;
    for (let x = m; x <= W - m; x += BOT.STEP) {
      let cost = Math.abs(x - aim) * 0.01 + Math.abs(x - w.shipX) * 0.002;
      for (const e of enemies) {
        // Where the body will be over the look-ahead window (straight-line prediction), sampled at 4 points.
        for (let k = 0; k <= 4; k++) {
          const t = (BOT.LOOKAHEAD * k) / 4;
          const ex = e.x + e.vx * t, ey = e.y + e.vy * t;
          const reach = e.radius + hitR + BOT.CLEARANCE;
          const d = Math.hypot(x - ex, BOT.Y - ey);
          if (d < reach) cost += (100 * (reach - d)) / reach / (1 + k);
        }
      }
      if (boss) for (const p of boss.plates) if (p.hp > 0 && Math.abs(x - p.x) < p.radius + 4) { cost += 3; break; }
      // Enemy bullets fly straight (chunk 32a): the same look-ahead as for a body, with the bullet's own radius.
      const eb = w.enemyBullets;
      if (BOT_OPTS.dodgeBullets && eb && eb.count > 0) {
        for (let i = 0; i < eb.max; i++) {
          if (!eb.active[i]) continue;
          for (let k = 0; k <= 4; k++) {
            const t = (BOT.LOOKAHEAD * k) / 4;
            const reach = ENEMY_BULLET_RADIUS + hitR + BOT.CLEARANCE;
            const d = Math.hypot(x - (eb.x[i] + eb.vx[i] * t), BOT.Y - (eb.y[i] + eb.vy[i] * t));
            if (d < reach) cost += (100 * (reach - d)) / reach / (1 + k);
          }
        }
      }
      if (cost < bestCost) { bestCost = cost; bestX = x; }
    }
    const max = BOT.SPEED * dt;
    this.pointer.x = w.shipX + Math.max(-max, Math.min(max, bestX - w.shipX));
    this.pointer.y = BOT.Y;
  }
}

export interface BotRun {
  /** Seconds survived (capped at the limit) and whether the run ended. */
  time: number;
  died: boolean;
  wave: number;
  credits: number;
  kills: number;
  leaks: number;
  /** Wave and credits at each checkpoint in seconds (undefined if the run ended before it). */
  at: Record<number, { wave: number; credits: number } | undefined>;
}

/** Flies one deterministic Free Fly run with the bot until the hull is gone or `limit` seconds pass. */
export function botRun(w: World, limit: number, checkpoints: number[] = [60, 180, 300], dt = 1 / 60): BotRun {
  const bot = new FreeFlyBot();
  const at: BotRun['at'] = {};
  const marks = [...checkpoints].sort((a, b) => a - b);
  let next = 0;
  const steps = Math.round(limit / dt);
  for (let i = 0; i < steps && !w.gameOver; i++) {
    bot.step(w, dt);
    w.update(dt, bot.pointer);
    while (next < marks.length && w.time >= marks[next] - 1e-9) { at[marks[next]] = { wave: w.wave, credits: w.credits }; next++; }
  }
  return { time: w.time, died: w.gameOver, wave: w.wave, credits: w.credits, kills: w.kills, leaks: w.leaks, at };
}
