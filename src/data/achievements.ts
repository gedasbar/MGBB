// Chunk 28a: the achievements (docs/achievements.md). Plain data you can edit by hand: each entry names a METRIC (a number the game
// can read from the save, see METRICS in src/achievements/metrics.ts) and a GOAL; it is earned the moment the metric reaches the goal.
// Rewards: `medals` (paid once) or `cosmetic` (an id stored as earned; skins and trails come in a later chunk, so the game only says
// "coming soon"). `hidden: true` shows only the `hint` until it is earned. Order here = order in the panel inside each group.

/** What the game measures. The goal of 'all' metrics is the size of the whole set (every hull, every ordinary block, all twelve legendary blocks). */
export type AchievementMetric =
  | 'passedTier'      // highest campaign tier passed (1..200)
  | 'clearedTiers'    // campaign tiers cleared, any tier
  | 'clearedClassic'  // of tiers 1-100, how many are cleared
  | 'clearedMaze'     // Maze tiers (101-200) cleared
  | 'ring'            // furthest Frontier ring in any direction
  | 'ringAllSides'    // the SHORTEST of the four directions' furthest ring (all four reach it)
  | 'legendaryOwned'  // legendary blocks owned (of 12)
  | 'heroLevel'       // highest hero level of any captain
  | 'skillsSpent'     // skill points spent (nodes owned)
  | 'bestShot'        // largest single hit in one run
  | 'bestAvgDps'      // best average DPS of one run
  | 'circuitBlocks'   // most blocks placed in one circuit
  | 'hullFilled'      // 1 once a circuit filled every buildable cell of a hull with at least FILL_MIN_CELLS cells
  | 'hullsOwned'      // hulls owned (of 19)
  | 'ordinaryOwned'   // ordinary (non-legendary) blocks owned at least once
  | 'flyWave';        // best Free Fly wave

export type AchievementGroup = 'Campaign' | 'Frontier' | 'Hero and skills' | 'Builder' | 'Collection' | 'Free Fly';

export interface Cosmetic { id: string; kind: 'skin' | 'trail'; name: string }

export interface AchievementDef {
  id: string;
  name: string;
  /** One plain line saying what to do (the progress bar shows the numbers). */
  text: string;
  group: AchievementGroup;
  metric: AchievementMetric;
  /** A number, or 'all' = the whole set of the metric. */
  goal: number | 'all';
  reward: { medals: number } | { cosmetic: Cosmetic };
  hidden?: boolean;
  /** What a hidden achievement shows until it is earned. */
  hint?: string;
}

/** A circuit only counts as "filled" on a hull with at least this many buildable cells (the Dart has 1, so it would be free). */
export const FILL_MIN_CELLS = 12;

const m = (medals: number) => ({ medals });
const skin = (id: string, name: string) => ({ cosmetic: { id, kind: 'skin' as const, name } });
const trail = (id: string, name: string) => ({ cosmetic: { id, kind: 'trail' as const, name } });

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // ---- Campaign
  { id: 'pass_10', name: 'First steps', text: 'Pass tier 10.', group: 'Campaign', metric: 'passedTier', goal: 10, reward: m(1) },
  { id: 'pass_25', name: 'Getting somewhere', text: 'Pass tier 25.', group: 'Campaign', metric: 'passedTier', goal: 25, reward: m(2) },
  { id: 'pass_50', name: 'Halfway', text: 'Pass tier 50.', group: 'Campaign', metric: 'passedTier', goal: 50, reward: m(3) },
  { id: 'pass_100', name: 'The Last Wall', text: 'Pass tier 100.', group: 'Campaign', metric: 'passedTier', goal: 100, reward: m(6) },
  { id: 'clear_25', name: 'Wall breaker', text: 'Clear 25 tiers (destroy every block).', group: 'Campaign', metric: 'clearedTiers', goal: 25, reward: m(2) },
  { id: 'clear_50', name: 'Demolition crew', text: 'Clear 50 tiers.', group: 'Campaign', metric: 'clearedTiers', goal: 50, reward: m(3) },
  { id: 'clear_100', name: 'Nothing left standing', text: 'Clear 100 tiers.', group: 'Campaign', metric: 'clearedTiers', goal: 100, reward: m(5) },
  { id: 'after_100', name: 'What happens after 100?', text: 'Clear every tier from 1 to 100.', group: 'Campaign', metric: 'clearedClassic', goal: 100, reward: m(8), hidden: true, hint: 'Something waits behind the last wall.' },
  { id: 'pass_125', name: 'Past the hundred', text: 'Pass tier 125.', group: 'Campaign', metric: 'passedTier', goal: 125, reward: m(4) },
  { id: 'pass_150', name: 'Deep in', text: 'Pass tier 150.', group: 'Campaign', metric: 'passedTier', goal: 150, reward: m(6) },
  { id: 'pass_200', name: 'The end of the road', text: 'Pass tier 200.', group: 'Campaign', metric: 'passedTier', goal: 200, reward: trail('trail_ember', 'Ember trail') },
  { id: 'clear_maze', name: 'Lost and found', text: 'Clear a Maze tier.', group: 'Campaign', metric: 'clearedMaze', goal: 1, reward: m(3) },
  // ---- Frontier
  { id: 'ring_10', name: 'Out the door', text: 'Reach ring 10 of the Frontier.', group: 'Frontier', metric: 'ring', goal: 10, reward: m(1) },
  { id: 'ring_25', name: 'Explorer', text: 'Reach ring 25.', group: 'Frontier', metric: 'ring', goal: 25, reward: m(2) },
  { id: 'ring_50', name: 'Pathfinder', text: 'Reach ring 50.', group: 'Frontier', metric: 'ring', goal: 50, reward: m(3) },
  { id: 'ring_100', name: 'A hundred rings out', text: 'Reach ring 100.', group: 'Frontier', metric: 'ring', goal: 100, reward: m(6) },
  { id: 'ring_200', name: 'Far country', text: 'Reach ring 200.', group: 'Frontier', metric: 'ring', goal: 200, reward: m(8) },
  { id: 'ring_300', name: 'The edge of the map', text: 'Reach ring 300.', group: 'Frontier', metric: 'ring', goal: 300, reward: m(10) },
  { id: 'ring_100_all', name: 'All four winds', text: 'Reach ring 100 in all four directions.', group: 'Frontier', metric: 'ringAllSides', goal: 100, reward: m(8) },
  { id: 'legend_1', name: 'Legend in hand', text: 'Own a legendary block.', group: 'Frontier', metric: 'legendaryOwned', goal: 1, reward: m(2) },
  { id: 'legend_all', name: 'Hall of legends', text: 'Own all 12 legendary blocks.', group: 'Frontier', metric: 'legendaryOwned', goal: 'all', reward: skin('skin_legend', 'Legend projectile skin') },
  // ---- Hero and skills
  { id: 'hero_10', name: 'Seasoned', text: 'Take a captain to hero level 10.', group: 'Hero and skills', metric: 'heroLevel', goal: 10, reward: m(2) },
  { id: 'hero_20', name: 'Veteran', text: 'Hero level 20.', group: 'Hero and skills', metric: 'heroLevel', goal: 20, reward: m(4) },
  { id: 'hero_30', name: 'Ace', text: 'Hero level 30.', group: 'Hero and skills', metric: 'heroLevel', goal: 30, reward: trail('trail_ace', 'Ace trail') },
  { id: 'skills_3', name: 'Branching out', text: 'Spend 3 skill points.', group: 'Hero and skills', metric: 'skillsSpent', goal: 3, reward: m(1) },
  { id: 'skills_6', name: 'Specialist', text: 'Spend 6 skill points.', group: 'Hero and skills', metric: 'skillsSpent', goal: 6, reward: m(3) },
  { id: 'skills_10', name: 'Master of the tree', text: 'Spend 10 skill points.', group: 'Hero and skills', metric: 'skillsSpent', goal: 10, reward: m(5) },
  // ---- Builder
  { id: 'shot_100', name: 'Hit hard', text: 'Land a single hit of 100 in one run.', group: 'Builder', metric: 'bestShot', goal: 100, reward: m(1) },
  { id: 'shot_10k', name: 'Big hitter', text: 'Land a single hit of 10K.', group: 'Builder', metric: 'bestShot', goal: 10_000, reward: m(2) },
  { id: 'shot_1m', name: 'Heavy artillery', text: 'Land a single hit of 1M.', group: 'Builder', metric: 'bestShot', goal: 1_000_000, reward: m(4) },
  { id: 'shot_1b', name: 'One shot, one wall', text: 'Land a single hit of 1B.', group: 'Builder', metric: 'bestShot', goal: 1_000_000_000, reward: skin('skin_star', 'Star projectile skin') },
  { id: 'dps_1k', name: 'Steady fire', text: 'Average 1K damage a second over one run.', group: 'Builder', metric: 'bestAvgDps', goal: 1_000, reward: m(2) },
  { id: 'dps_1m', name: 'Firestorm', text: 'Average 1M damage a second over one run.', group: 'Builder', metric: 'bestAvgDps', goal: 1_000_000, reward: m(4) },
  { id: 'dps_1b', name: 'Wall of lead', text: 'Average 1B damage a second over one run.', group: 'Builder', metric: 'bestAvgDps', goal: 1_000_000_000, reward: m(6) },
  { id: 'circuit_50', name: 'Spaghetti', text: 'Place 50 blocks in one circuit.', group: 'Builder', metric: 'circuitBlocks', goal: 50, reward: m(3) },
  { id: 'fill_hull', name: 'Not an inch spare', text: `Fill every cell of a hull (one with ${FILL_MIN_CELLS} or more buildable cells).`, group: 'Builder', metric: 'hullFilled', goal: 1, reward: m(3) },
  // ---- Collection
  { id: 'hulls_5', name: 'A small fleet', text: 'Own 5 hulls.', group: 'Collection', metric: 'hullsOwned', goal: 5, reward: m(1) },
  { id: 'hulls_10', name: 'A real fleet', text: 'Own 10 hulls.', group: 'Collection', metric: 'hullsOwned', goal: 10, reward: m(3) },
  { id: 'hulls_all', name: 'The whole hangar', text: 'Own all 19 hulls.', group: 'Collection', metric: 'hullsOwned', goal: 'all', reward: m(10) },
  { id: 'blocks_all', name: 'One of everything', text: 'Own every ordinary block at least once.', group: 'Collection', metric: 'ordinaryOwned', goal: 'all', reward: m(8) },
  // ---- Free Fly
  { id: 'wave_10', name: 'Rock breaker', text: 'Reach wave 10 in Free Fly.', group: 'Free Fly', metric: 'flyWave', goal: 10, reward: m(1) },
  { id: 'wave_20', name: 'Rock crusher', text: 'Reach wave 20.', group: 'Free Fly', metric: 'flyWave', goal: 20, reward: m(2) },
  { id: 'wave_30', name: 'Rock reaper', text: 'Reach wave 30.', group: 'Free Fly', metric: 'flyWave', goal: 30, reward: m(4) },
  { id: 'wave_50', name: 'Endless', text: 'Reach wave 50.', group: 'Free Fly', metric: 'flyWave', goal: 50, reward: m(6) },
];

export const ACHIEVEMENT_GROUPS: readonly AchievementGroup[] = ['Campaign', 'Frontier', 'Hero and skills', 'Builder', 'Collection', 'Free Fly'];
export const ACHIEVEMENT_BY_ID: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));
