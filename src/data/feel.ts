/** Chunk 34a: every number of the game-feel pass (shake, hit stop, particles, damage numbers, big moments). Visual only: no gameplay number lives here. */

/** The three Settings > Graphics choices. */
export type ShakeMode = 'off' | 'low' | 'normal';
export const SHAKE_MODES: readonly ShakeMode[] = ['off', 'low', 'normal'];
export type ParticleMode = 'low' | 'high';
export const PARTICLE_MODES: readonly ParticleMode[] = ['low', 'high'];

export const FEEL = {
  /** Trauma shake: events add trauma (0..1), it decays by TRAUMA_DECAY a second, the offset is MAX_OFFSET x trauma^2. Each size has a ceiling the trauma cannot be pushed past by that size alone. */
  SHAKE: {
    TRAUMA_DECAY: 2.6,
    /** Largest offset in game pixels at full trauma (the view is 540 wide; kept small for a phone). */
    MAX_OFFSET: 9,
    /** "Low" scales the offset by this. */
    LOW_SCALE: 0.5,
    ADD: { small: 0.3, medium: 0.55, big: 0.95 },
    CEIL: { small: 0.4, medium: 0.7, big: 1 },
    /** A boss losing at least this share of its max HP inside BOSS_WINDOW seconds shakes the screen (small). */
    BOSS_HIT_SHARE: 0.04,
    BOSS_WINDOW: 1,
  },
  /** Hit stop in seconds. Big hits (one shot kills a block with BIG_HIT_MUL x its HP) wait BIG_COOLDOWN between two stops. */
  STOP: { BOSS_DEATH: 0.09, CRASH: 0.075, BIG_HIT: 0.03, BIG_COOLDOWN: 0.6 },
  BIG_HIT_MUL: 10,
  /** AoE blast events kept between two frames. */
  BLAST_QUEUE: 24,
  /** Particles: one shared pool. Low halves the pool and every burst. */
  PARTICLES: {
    CAP_HIGH: 600,
    CAP_LOW: 200,
    LOW_SCALE: 0.5,
    LIFE: 0.4,
    GRAVITY: 0,
    DRAG: 2.2,
    /** Wall block: shards. */
    BLOCK_SHARDS: [4, 8] as [number, number],
    BLOCK_SPEED: [90, 240] as [number, number],
    SHARD_SIZE: [7, 15] as [number, number],
    /** Rock: base shards plus per 10 px of radius; a split bursts SPLIT_SHARDS. */
    ROCK_SHARDS_BASE: 4,
    ROCK_SHARDS_PER_10PX: 2,
    ROCK_SHARDS_MAX: 18,
    SPLIT_SHARDS: 4,
    /** Shot impact sparks: 2-3 tiny ones, none past SPARK_FRAME_CAP in one frame. */
    SPARKS: [2, 3] as [number, number],
    SPARK_SIZE: [2, 4] as [number, number],
    SPARK_SPEED: [60, 150] as [number, number],
    SPARK_LIFE: 0.2,
    SPARK_FRAME_CAP: 6,
    /** Muzzle flash: only below this many pulses a second, one tiny flash per pulse of the first ejector. */
    MUZZLE_MAX_RATE: 7,
    MUZZLE_SIZE: 5,
    MUZZLE_LIFE: 0.08,
    /** Crash: shards of the ship's greys. */
    CRASH_SHARDS: 22,
    BOSS_SHARDS: 70,
    BOSS_BLASTS: 4,
    BOSS_BLAST_GAP: 0.18,
  },
  /** Flat expanding rings (AoE blast area, crash shockwave, boss blasts). At most RING_CAP alive. */
  RINGS: { CAP: 28, AOE_LIFE: 0.22, SHOCK_LIFE: 0.45, SHOCK_RADIUS: 70, WIDTH: 2 },
  /** Damage numbers: a hit on the same target inside MERGE_WINDOW adds to the number already showing. */
  NUMBERS: { MERGE_WINDOW: 0.14, POP_TIME: 0.12, POP_SCALE: 1.35, BIG_SCALE: 1.6, RISE: 40, BIG_RISE: 34, LIFE: 0.7, BIG_LIFE: 1.0, SIZE: 18, BIG_SIZE: 26, BIG_COLOR: 0xffd23c },
  /** Chunk 34b: Core pickups. The "+N" merges collections inside POP_MERGE seconds; sparks are teal; the crystal flashes once as it is absorbed; the HUD Cores number bumps. */
  PICKUPS: {
    POP_MERGE: 0.3, POP_LIFE: 0.8, POP_RISE: 46, POP_SIZE: 20, POP_COLOR: 0x3fd0c0, POP_Y: -26,
    SPARKS: [4, 6] as [number, number], SPARK_SPEED: [70, 190] as [number, number], SPARK_SIZE: [2, 4] as [number, number], SPARK_LIFE: 0.3, SPARK_FRAME_CAP: 6,
    FLASH_TIME: 0.14, FLASH_SCALE: 2, FLASH_MAX: 12,
    BUMP_TIME: 0.18, BUMP_SCALE: 1.3,
  },
  /** Auto-drop to Low particles: a frame slower than FRAME_BUDGET seconds for DROP_AFTER seconds in a row (an average over that time). */
  BUDGET: { FRAME_BUDGET: 0.038, DROP_AFTER: 3 },
  /** Stamp ("CLEARED" / "PASSED") and flash before the summary; extra seconds added to the result delay so it can be read. */
  STAMP: { CLEARED_EXTRA: 0.45, PASSED_EXTRA: 0.3, FLASH_TIME: 0.25, FLASH_ALPHA: 0.35, SIZE: 54 },
  /** Banner punch: slides in from this far above and overshoots, in seconds. */
  BANNER: { SLIDE_DIST: 60, SLIDE_TIME: 0.22, PUNCH_SCALE: 1.18 },
} as const;
