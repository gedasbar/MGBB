/**
 * Enemy bullets (chunk 32a, docs/freefly-v2.md section 1). Used by the Gunner now and by the bosses in 32b.
 * They are their own pool: nothing a player shot does reaches them, and they cannot be shot down.
 */

/** Most enemy bullets alive at once; a shooter that fires into a full pool simply loses the shot. */
export const ENEMY_BULLET_CAP = 240;
/** Speed in px/s: clearly slower than a player shot (PROJECTILE_SPEED 600). */
export const ENEMY_BULLET_SPEED = 230;
/** Hit radius in px (against the ship's own hit circle). */
export const ENEMY_BULLET_RADIUS = 5;
/** Hull damage of one hit (the hull is 100; a rock contact is 10). */
export const ENEMY_BULLET_DAMAGE = 8;
/** Seconds of invulnerability after a bullet hit (the same short window as after a rock contact). */
export const ENEMY_BULLET_INVULN = 0.5;
/** A bullet is removed once it is this many px outside the screen. */
export const ENEMY_BULLET_MARGIN = 24;

/** Look: a round lime bullet in a near-black outline with a dark core (no player shot is round or lime). */
export const ENEMY_BULLET_LOOK = { fill: 0xc8f542, outline: 0x10180a, core: 0x10180a, size: 14 } as const;
