/**
 * Captains (chunk 13a): data only. Every captain, tier option and effect is listed here; gameplay code never names one.
 * The numbers and the reasons for them are in docs/captains-design.md.
 */

// ---------------------------------------------------------------- effects

/** What an option can do. Each type has exactly one hook (see docs/captains-design.md, section 2). */
export type EffectType =
  | 'baseDamage' | 'damagePct' | 'fireRatePct' | 'projSpeedPct'
  | 'vsArmorPct' | 'vsShieldPct' | 'vsFragmentPct' | 'wallDamagePct'
  | 'creditPct' | 'wallCreditPct' | 'waveBonusPct' | 'passCreditsPct' | 'medalDoublePct'
  | 'secondChance' | 'spawnInvulnSec' | 'hullPct' | 'killHeal' | 'boostZonePct';

export interface Effect { type: EffectType; value: number }

// ---------------------------------------------------------------- shared constants

/**
 * Hero level: each level adds this much base damage (the generator's packet starts at 1). Chunk 14a: 0.5 (it was 1). With the
 * small numbers +1 a level made level 10 an 11x gun, ahead of the walls' HP growth until about tier 45; 0.5 makes it 6x
 * (docs/balance-damage.md, section 1c).
 */
export const HERO_LEVEL_BASE_DAMAGE = 0.5;
/** Hero levels have no cap (chunk 16c-2); a stored level above this is treated as damage to the save, not as progress. */
export const HERO_LEVEL_SANITY_MAX = 100_000;
/** Medals to go from level n to n + 1 (n = 0 is level 0 to 1): round(HERO_COST_BASE x HERO_COST_RATIO^n), at least 1. */
export const HERO_COST_BASE = 1;
export const HERO_COST_RATIO = 1.2;

/** Tiers per captain and the options in each. */
export const TIER_COUNT = 4;
/** Lifetime kills of a captain that unlock each option tier (rocks incl. fragments, and wall blocks, in every mode). */
export const TIER_KILLS = [0, 300, 1500, 6000];
/** Medals one option costs, by tier. */
export const TIER_COSTS = [2, 4, 7, 11];

/** The captain every save starts with and owns for free. */
export const STARTER_CAPTAIN = 'cadet';

/** Seconds of invulnerability after a Second Chance is spent (a wall block touched, or a Free Fly contact absorbed). */
export const SECOND_CHANCE_INVULN = 1;
/** Medal doubling is a chance, never above this. */
export const MEDAL_DOUBLE_MAX = 1;

/** Free Fly Medals for reaching a wave for the first time (per save). */
export const FLY_MEDAL_MILESTONES: { wave: number; medals: number }[] = [
  { wave: 5, medals: 1 }, { wave: 10, medals: 2 }, { wave: 15, medals: 2 }, { wave: 20, medals: 3 },
  { wave: 30, medals: 4 }, { wave: 40, medals: 5 }, { wave: 50, medals: 6 },
];

// ---------------------------------------------------------------- captains and options

export interface OptionDef {
  id: string;
  name: string;
  /** 1-based tier. */
  tier: number;
  effects: Effect[];
}

export type Emblem = 'cadet' | 'bulwark' | 'gunner' | 'pathfinder';

export interface CaptainDef {
  id: string;
  name: string;
  /** One line: the catch. */
  theme: string;
  /** Accent colour of the emblem and the card. */
  accent: number;
  emblem: Emblem;
  /** Medals to unlock (0 = owned from the start). */
  unlockCost: number;
  /** TIER_COUNT pairs. */
  tiers: [OptionDef, OptionDef][];
}

const o = (id: string, name: string, tier: number, ...effects: Effect[]): OptionDef => ({ id, name, tier, effects });
const e = (type: EffectType, value: number): Effect => ({ type, value });

export const CAPTAINS: CaptainDef[] = [
  {
    id: 'cadet', name: 'Cadet', theme: 'Economy: credits and Medals', accent: 0xf2c230, emblem: 'cadet', unlockCost: 0,
    tiers: [
      [o('cad_prospector', 'Prospector', 1, e('creditPct', 0.05)), o('cad_lucky', 'Lucky Charm', 1, e('medalDoublePct', 0.10))],
      [o('cad_dividend', 'Wave Dividend', 2, e('waveBonusPct', 0.5)), o('cad_toll', 'Toll Collector', 2, e('passCreditsPct', 0.15))],
      [o('cad_broker', 'Broker', 3, e('creditPct', 0.10)), o('cad_fortune', "Fortune's Favour", 3, e('medalDoublePct', 0.25))],
      [o('cad_tycoon', 'Tycoon', 4, e('creditPct', 0.20), e('waveBonusPct', 0.25)), o('cad_mint', 'Mint', 4, e('medalDoublePct', 0.40), e('creditPct', 0.05))],
    ],
  },
  {
    id: 'bulwark', name: 'Bulwark', theme: 'Survival: forgives mistakes', accent: 0x5fd4e8, emblem: 'bulwark', unlockCost: 10,
    tiers: [
      [o('bul_second', 'Second Chance', 1, e('secondChance', 1)), o('bul_steady', 'Steady Start', 1, e('spawnInvulnSec', 1))],
      [o('bul_plating', 'Plating', 2, e('hullPct', 0.30)), o('bul_salvage', 'Salvage', 2, e('killHeal', 0.5))],
      [o('bul_wind', 'Second Wind', 3, e('secondChance', 1)), o('bul_fortress', 'Fortress Start', 3, e('spawnInvulnSec', 2), e('hullPct', 0.15))],
      [o('bul_aegis', 'Aegis', 4, e('secondChance', 1), e('hullPct', 0.25)), o('bul_repair', 'Field Repair', 4, e('killHeal', 1), e('hullPct', 0.20))],
    ],
  },
  {
    id: 'gunner', name: 'Gunner', theme: 'Offence: raw output', accent: 0xe8836b, emblem: 'gunner', unlockCost: 25,
    tiers: [
      [o('gun_barrel', 'Hot Barrel', 1, e('damagePct', 0.08)), o('gun_trigger', 'Quick Trigger', 1, e('fireRatePct', 0.08))],
      [o('gun_breaker', 'Armor Breaker', 2, e('vsArmorPct', 0.30)), o('gun_cracker', 'Shield Cracker', 2, e('vsShieldPct', 0.30))],
      [o('gun_hunter', 'Fragment Hunter', 3, e('vsFragmentPct', 0.30)), o('gun_rounds', 'Heavy Rounds', 3, e('damagePct', 0.10))],
      [o('gun_overdrive', 'Overdrive', 4, e('fireRatePct', 0.15), e('projSpeedPct', 0.20)), o('gun_siege', 'Siege Rounds', 4, e('damagePct', 0.12), e('vsArmorPct', 0.12), e('vsShieldPct', 0.12))],
    ],
  },
  {
    id: 'pathfinder', name: 'Pathfinder', theme: 'Walls: fast passes, paid', accent: 0x6fbf73, emblem: 'pathfinder', unlockCost: 50,
    tiers: [
      [o('pth_slip', 'Slipstream', 1, e('boostZonePct', 0.30)), o('pth_reach', 'Long Reach', 1, e('projSpeedPct', 0.20))],
      [o('pth_breaker', 'Wall Breaker', 2, e('wallDamagePct', 0.12)), o('pth_toll', 'Toll Road', 2, e('passCreditsPct', 0.25))],
      [o('pth_current', 'Rip Current', 3, e('boostZonePct', 0.30)), o('pth_quarry', 'Quarry', 3, e('wallCreditPct', 0.20))],
      [o('pth_throttle', 'Full Throttle', 4, e('boostZonePct', 0.40), e('passCreditsPct', 0.25)), o('pth_demo', 'Demolition', 4, e('wallDamagePct', 0.20))],
    ],
  },
];

export const CAPTAIN_BY_ID: Record<string, CaptainDef> = Object.fromEntries(CAPTAINS.map(c => [c.id, c]));

/** Every option of every captain, by id. */
export const OPTION_BY_ID: Record<string, OptionDef & { captain: string }> = {};
for (const c of CAPTAINS) for (const pair of c.tiers) for (const opt of pair) OPTION_BY_ID[opt.id] = { ...opt, captain: c.id };

// ---------------------------------------------------------------- text

const PCT = (v: number) => `${Math.round(v * 100)}%`;
const SECONDS = (v: number) => `${v % 1 === 0 ? v : v.toFixed(1)} s`;

/** One effect as the player reads it. Exact numbers, no rounding beyond whole percent. */
export function describeEffect(ef: Effect): string {
  const v = ef.value;
  switch (ef.type) {
    case 'baseDamage': return `+${v} base damage`;
    case 'damagePct': return `+${PCT(v)} damage`;
    case 'fireRatePct': return `+${PCT(v)} fire rate`;
    case 'projSpeedPct': return `+${PCT(v)} projectile speed`;
    case 'vsArmorPct': return `+${PCT(v)} damage vs armor`;
    case 'vsShieldPct': return `+${PCT(v)} damage vs shields`;
    case 'vsFragmentPct': return `+${PCT(v)} damage vs fragments`;
    case 'wallDamagePct': return `+${PCT(v)} damage vs wall blocks`;
    case 'creditPct': return `+${PCT(v)} credits`;
    case 'wallCreditPct': return `+${PCT(v)} credits from wall blocks`;
    case 'waveBonusPct': return `+${PCT(v)} wave bonus credits`;
    case 'passCreditsPct': return `+${PCT(v)} credits when a wall is passed or cleared`;
    case 'medalDoublePct': return `${PCT(v)} chance to double a Medal`;
    case 'secondChance': return `+${v} Second Chance${v === 1 ? '' : 's'} (forgives a hit)`;
    case 'spawnInvulnSec': return `+${SECONDS(v)} spawn invulnerability`;
    case 'hullPct': return `+${PCT(v)} hull in Free Fly`;
    case 'killHeal': return `Each kill heals ${v} hull in Free Fly`;
    case 'boostZonePct': return `+${PCT(v)} top-edge boost zone in walls`;
  }
}

export function describeOption(opt: OptionDef): string {
  return opt.effects.map(describeEffect).join(', ');
}

/** Medals to take a hero from `level` to `level + 1` (Infinity at the max). */
export function heroLevelCost(level: number): number {
  return Math.max(1, Math.round(HERO_COST_BASE * Math.pow(HERO_COST_RATIO, Math.max(0, level))));
}
