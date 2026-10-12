import { CONFIG, shipHalfW } from '../config';
import { PointerState } from '../input';
import type { World } from '../game/world';
import { PROJECTILE_SPEED } from '../game/fire';

/** Tuning of the balance bot (it stands in for a decent player, not a perfect one). */
export const BOT = {
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

/**
 * A deterministic Free Fly pilot for the balance script and tests: it dodges whatever would touch the ship soon and
 * otherwise lines up under the body closest to leaking (leading it for the shot's travel time). The gun fires on its own.
 * No randomness: the same world gives the same moves.
 */
export class FreeFlyBot {
  readonly pointer: PointerState = { x: CONFIG.VIEW.W / 2, y: BOT.Y, active: false, type: 'mouse', seen: true };

  step(w: World, dt: number) {
    const W = CONFIG.VIEW.W, m = shipHalfW(CONFIG.VIEW.W), hitR = CONFIG.PLAYER.HITBOX_R;
    const enemies = w.mitosis.enemies;
    // Target: the lowest body still above the ship, led by the shot's flight time.
    let aim = W / 2, lowest = -Infinity;
    for (const e of enemies) {
      if (e.y < BOT.Y - 60 && e.y > lowest && e.y > -e.radius) {
        lowest = e.y;
        aim = e.x + e.vx * Math.max(0, (BOT.Y - e.y) / PROJECTILE_SPEED);
      }
    }
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
