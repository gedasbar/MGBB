/** Radius of the ship's hit circle in px, in Free Fly and in the walls. The circle is invisible: any touch of the art reads as a hit. */
export const HIT_RADIUS = 8;

/** Half the ship art's width (13 px at the 540 reference viewport). The ship's centre stays this far inside the screen sides. */
const SHIP_HALF_W_REF = 13;
const VIEW_W_REF = 540;

/** Leftmost / rightmost ship-centre x so the whole ship stays on screen (scaled with the viewport). */
export const shipHalfW = (viewW: number): number => SHIP_HALF_W_REF * (viewW / VIEW_W_REF);

/**
 * Chunk 24a: the ship never jumps to the pointer. It flies toward its target at most this fast (px/s): the screen width in 0.2 s,
 * quick but not a teleport. The hit test sweeps the whole path moved in a step, so a fast ship cannot pass through a block.
 */
export const SHIP_MAX_SPEED = 540 / 0.2;
/** Touch, relative mode: the ship moves this many px for every px the finger moves (1 = the finger drags the ship 1:1). */
export const TOUCH_DRAG_GAIN = 1;
/** Touch, direct mode: the ship sits this many px above the finger (negative = above, so the finger does not hide it). */
export const TOUCH_DIRECT_OFFSET_Y = -40;

export const CONFIG = {
  GAME_TITLE: "Mitosis Gun Builder",
  VIEW: { W: 540, H: 960 },                 // logical 9:16, letterboxed to fit any screen
  SCROLL_SPEED: 60,                         // px/s background parallax, cosmetic only
  PLAYER: { MOVE_SMOOTHING: 0.22, KEYBOARD_SPEED: 420, HITBOX_R: HIT_RADIUS, MARGIN: 24 },
  CAPS: { PROJECTILES: 4000, ENEMIES: 400, PARTICLES: 6000, PICKUPS: 300, DAMAGE_NUMBERS: 120 },
  /**
   * Graceful overload (chunk 21b, docs/performance.md). As the shot pool fills, the cheapest shots are refused first: `REFUSE_FROM` is the
   * share of the pool above which a new shot of that kind is not made (fork fragments, then Mirror clones, then the extra shots of
   * +1 Projectile, then normal shots at a full pool). From `EXPIRE_FROM` of the pool on, shots that are off-screen and have hit
   * nothing for `STALE_AGE` seconds are removed before anything else (EXPIRE_PER_FRAME at most, so one frame never does the whole sweep). VIEW_MARGIN: how far outside the screen still counts as on it.
   */
  OVERLOAD: { EXPIRE_FROM: 0.85, STALE_AGE: 1.5, EXPIRE_PER_FRAME: 400, VIEW_MARGIN: 60, REFUSE_FROM: { fork: 0.8, mirror: 0.88, extra: 0.94, normal: 1 } },
  GRID: { CELL: 48, MAX_W: 11, MAX_H: 11 },
  PULSE: { BASE_RATE: 4 },                  // generator pulses per second at firerate stat = 4
  MITOSIS: { MAX_GENERATION: 4, GLOBAL_SPLIT_BUDGET_PER_SEC: 120, SWARM_MERGE_BONUS: 1.5 },
  ECON: { TIER_HP_GROWTH: 1.055, TIER_REWARD_GROWTH: 1.05 },
};
