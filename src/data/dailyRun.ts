// Chunk 35a: the daily run's twists and reward tiers. EDIT THIS FILE to change them (docs/daily.md). The day's twist is picked by the date's seed.
// A twist is a set of numbers the Free Fly world reads (`TwistEffects`); a number that is absent changes nothing.

export type TwistId = 'swarm_day' | 'gunner_day' | 'boss_rush' | 'fast_waves' | 'glass_cannon' | 'fog';

export interface TwistEffects {
  /** x the length of a wave (0.7 = 30% shorter). */
  waveTimeMul?: number;
  /** x the damage of every shot, and x the max hull. */
  damageMul?: number;
  hullMul?: number;
  /** A boss every this many waves (the normal game: 10). */
  bossEvery?: number;
  /** Every this-many-th wave is a Swarm wave (Darters and pebbles); the normal game has one every 10 waves, from wave 5. */
  swarmEvery?: number;
  /** Gunner waves: from wave `from`, every `every` waves is a GUNNERS wave (the normal game: none before wave 9). */
  gunners?: { from: number; every: number };
  /** Enemies are only drawn within this many px of the ship (a pure drawing rule; the simulation is unchanged). */
  fogRadius?: number;
}

export interface TwistDef { id: TwistId; name: string; line: string; effects: TwistEffects }

export const TWISTS: readonly TwistDef[] = [
  { id: 'swarm_day', name: 'SWARM DAY', line: 'A swarm of fast rocks every 3rd wave', effects: { swarmEvery: 3 } },
  { id: 'gunner_day', name: 'GUNNER DAY', line: 'Gunners from wave 3: dodge the bullets', effects: { gunners: { from: 3, every: 2 } } },
  { id: 'boss_rush', name: 'BOSS RUSH', line: 'A boss every 5 waves', effects: { bossEvery: 5 } },
  { id: 'fast_waves', name: 'FAST WAVES', line: 'Waves are 30% shorter', effects: { waveTimeMul: 0.7 } },
  { id: 'glass_cannon', name: 'GLASS CANNON', line: 'x2 damage, but only 25% hull', effects: { damageMul: 2, hullMul: 0.25 } },
  { id: 'fog', name: 'FOG', line: 'Enemies show only near your ship', effects: { fogRadius: 190 } },
];
export const TWIST_BY_ID: Record<TwistId, TwistDef> = Object.fromEntries(TWISTS.map(t => [t.id, t])) as Record<TwistId, TwistDef>;

/** Reward tiers of the daily run: reach `wave` once a day for the Cores (and Medals) of the tier. Each tier is paid once per day. */
export interface RunTier { wave: number; cores: number; medals?: number }
export const RUN_TIERS: readonly RunTier[] = [
  { wave: 5, cores: 6 },
  { wave: 10, cores: 12 },
  { wave: 15, cores: 20 },
  { wave: 20, cores: 30 },
  { wave: 30, cores: 50, medals: 1 },
];

/** Days of history kept (the best wave of each day, today included). */
export const HISTORY_DAYS = 7;
