import { rockHp, wholeRockHp } from '../econ/economy';
import { waveBudget, waveHpMul } from './waves';

/**
 * Free Fly bosses (chunk 32b, docs/freefly-bosses.md). Every BOSS_EVERY-th wave is a boss wave: normal spawning stops, one boss
 * arrives, the wave ends when it dies. The four bosses rotate (10, 20, 30, 40, then again, stronger each round).
 * All numbers live here; `src/game/boss.ts` is the behaviour, `src/ui/bossArt.ts` the drawing.
 */
export type BossId = 'hive' | 'bastion' | 'queen' | 'colossus';

export interface BossDef {
  id: BossId;
  name: string;
  /** The banner's one line. */
  line: string;
  /**
   * HP in "wave equivalents": the boss has this many times the HP a plain wave of its number holds in total
   * (waveBudget / 4 basic rocks, each at the wave's rock HP). Tuned with `scripts/boss-bot.ts`.
   */
  hpWaves: number;
  /** Where the group's anchor rests once it has arrived (px from the top), and how far its lowest point reaches below the anchor. */
  homeY: number;
  extent: number;
  /** After the enrage the whole boss sinks this many px/s; reaching the bottom edge ends the run. */
  descent: number;
  /** Colours of the art (outer edge, middle, inner), flat fills. */
  shades: { edge: number; mid: number; inner: number };
}

/** Rotation order: the n-th boss wave (10 = first) uses entry (n - 1) mod 4. */
export const BOSSES: readonly BossDef[] = [
  { id: 'hive', name: 'HIVE MOTHER', line: 'Her core opens now and then', hpWaves: 1.4, homeY: 250, extent: 50, descent: 7, shades: { edge: 0x5a3c1a, mid: 0x8c6232, inner: 0xc08c4a } },
  { id: 'bastion', name: 'BASTION', line: 'Shoot through the gaps', hpWaves: 1.4, homeY: 290, extent: 112, descent: 7, shades: { edge: 0x2c3440, mid: 0x4a5a70, inner: 0x7288a6 } },
  { id: 'queen', name: 'SWARM QUEEN', line: 'Kill the escorts, they come back', hpWaves: 1.4, homeY: 250, extent: 70, descent: 7, shades: { edge: 0x4a1a46, mid: 0x7a2d6b, inner: 0xb05898 } },
  { id: 'colossus', name: 'COLOSSUS', line: 'A wall of HP. Pure damage', hpWaves: 5, homeY: 250, extent: 52, descent: 22, shades: { edge: 0x4a3a2c, mid: 0x6e5a46, inner: 0x95806a } },
];
export const BOSS_BY_ID: Record<BossId, BossDef> = Object.fromEntries(BOSSES.map(b => [b.id, b])) as Record<BossId, BossDef>;

// ---------------------------------------------------------------- schedule and rules
/** Every this-many-th wave is a boss wave. */
export const BOSS_EVERY = 10;
/** Seconds after the boss appears that it ENRAGES (attacks faster, moves faster, starts to sink). */
export const ENRAGE_AFTER = 90;
/** Enrage: attack intervals x this, movement x ENRAGE_SPEED_MUL, enemy bullets x ENRAGE_BULLET_MUL. */
export const ENRAGE_ATTACK_MUL = 0.5;
export const ENRAGE_SPEED_MUL = 1.5;
export const ENRAGE_BULLET_MUL = 1.2;
/** Each round (a full rotation of four bosses) multiplies the boss's HP by this and its attack intervals by BOSS_ROUND_ATTACK_MUL. */
export const BOSS_ROUND_HP_MUL = 1.5;
export const BOSS_ROUND_ATTACK_MUL = 0.92;
/** Seconds the boss takes to slide in from above the screen (px/s), before it attacks or can be hurt. */
export const BOSS_ENTRY_SPEED = 90;
/** Seconds between the boss's death and the next wave starting. */
export const BOSS_BREATHER = 4;
/** Reward of a kill: credits = rockReward(reward tier, 1) x BOSS_CREDIT_MUL; Cores = coresForWave(wave) x BOSS_CORES_MUL (both then x the usual multipliers). */
export const BOSS_CREDIT_MUL = 60;
export const BOSS_CORES_MUL = 5;

// ---------------------------------------------------------------- the four bosses' numbers
export const HIVE = {
  radius: 46,
  /** Her core: closed (armored) CLOSED_FOR s, then open OPEN_FOR s, repeating. Closed she takes only CLOSED_TAKEN of every hit. */
  closedFor: 6, openFor: 3.5, closedTaken: 0.1,
  swayPx: 140, swaySpeed: 0.55,
  /** A splitting rock every ROCK_EVERY s while fewer than MAX_ROCKS of her rocks are alive; its HP is ROCK_HP of a plain rock's. */
  rockEvery: 3.2, maxRocks: 6, rockHp: 0.6,
  /** A slow spread: SPREAD bullets, SPREAD_DEG apart, aimed at the ship, at SPEED x the usual bullet speed. */
  fireEvery: 2.4, spread: 5, spreadDeg: 14, speedMul: 0.75,
} as const;

export const BASTION = {
  coreRadius: 28,
  /** The ring: SLOTS places round the core at RING_R px, a plate of PLATE_R in each place that is not a gap. Gaps are runs of GAP_SLOTS empty places starting at each GAP_STARTS entry. */
  slots: 16, ringR: 92, plateR: 17, gapSlots: 2, gapStarts: [0, 5, 10],
  /** Turns slowly: radians a second. */
  turn: 0.45, swayPx: 110, swaySpeed: 0.35,
  /** A ring of bullets leaves through every gap (bullets at the gap's places and the middle between). */
  fireEvery: 2.8,
} as const;
/** Plates are invulnerable: shots that hit one are used up (their damage is multiplied by this, a hair above 0 so an Infinity hit stays a number). */
export const PLATE_TAKEN = 1e-9;

export const QUEEN = {
  radius: 32,
  /** She flies to a new point in the upper screen every WAYPOINT_EVERY s at SPEED px/s; the points lie between Y_MIN and Y_MAX. */
  speed: 170, waypointEvery: 2.2, yMin: 200, yMax: 340,
  /** ESCORTS small bodies orbit her at ORBIT_R px (ORBIT_SPEED rad/s); each has ESCORT_HP of a plain rock's HP and, once killed, comes back after ESCORT_RESPAWN s. */
  escorts: 6, orbitR: 66, orbitSpeed: 1.6, escortRadius: 11, escortHp: 0.7, escortRespawn: 9,
  /** An aimed burst: BURST bullets, BURST_DEG apart, SPEED x the usual speed. */
  fireEvery: 1.9, burst: 4, burstDeg: 7, speedMul: 1.3,
} as const;

export const COLOSSUS = {
  /** A row of COUNT hit circles of RADIUS, SPACING apart, stands for the rectangle (width about (COUNT - 1) x SPACING + 2 x RADIUS, height 2 x RADIUS). */
  count: 5, radius: 50, spacing: 35,
  /** It drifts sideways at SPEED px/s between SIDE_MARGIN and the other margin. */
  speed: 40, sideMargin: 20,
} as const;
/** Half the Colossus' drawn width and height (the art). */
export const COLOSSUS_HALF_W = ((COLOSSUS.count - 1) * COLOSSUS.spacing) / 2 + COLOSSUS.radius * 0.8;
export const COLOSSUS_HALF_H = COLOSSUS.radius * 0.9;

// ---------------------------------------------------------------- functions
export const isBossWave = (wave: number) => wave >= BOSS_EVERY && wave % BOSS_EVERY === 0;

/** The boss of a wave and its round (0 = first time round), or null on any other wave. */
export function bossAt(wave: number): { def: BossDef; round: number } | null {
  if (!isBossWave(wave)) return null;
  const n = wave / BOSS_EVERY - 1;
  return { def: BOSSES[n % BOSSES.length], round: Math.floor(n / BOSSES.length) };
}

/** Max HP of the boss of `wave` when it arrives at run tier `tier`: the plain wave's total HP x hpWaves x the round's multiplier. */
export function bossMaxHp(id: BossId, wave: number, tier: number): number {
  const b = bossAt(wave);
  const round = b && b.def.id === id ? b.round : Math.floor((wave / BOSS_EVERY - 1) / BOSSES.length);
  const rocks = waveBudget(wave) / 4;
  return wholeRockHp(rocks * rockHp(tier) * waveHpMul(wave) * BOSS_BY_ID[id].hpWaves * Math.pow(BOSS_ROUND_HP_MUL, round));
}
