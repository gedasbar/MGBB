import {
  CAPTAIN_BY_ID, CAPTAINS, FLY_MEDAL_MILESTONES, HERO_MAX_LEVEL, heroLevelCost, OPTION_BY_ID, STARTER_CAPTAIN, TIER_COSTS, TIER_COUNT,
  TIER_KILLS, OptionDef,
} from './data';

/** What the save keeps about one captain. */
export interface HeroState {
  level: number;
  /** Lifetime kills made while this captain was active (rocks incl. fragments, wall blocks). */
  kills: number;
  /** Ids of the options bought, forever. */
  owned: string[];
  /** The option in use per tier (key "1".."4"); at most one per tier, always an owned option of that tier. */
  active: Record<string, string>;
}

export interface CaptainsState {
  selected: string;
  /** Captains unlocked (the starter always). */
  owned: string[];
  heroes: Record<string, HeroState>;
  /** Free Fly milestone waves already paid. */
  milestones: number[];
}

/** The slice of the progress object the captain rules read and write. */
export interface CaptainHolder { medals: number; captains: CaptainsState }

export type CaptainResult = { ok: true; cost: number } | { ok: false; error: string };

export function defaultHero(): HeroState {
  return { level: 0, kills: 0, owned: [], active: {} };
}

export function defaultCaptains(): CaptainsState {
  const heroes: Record<string, HeroState> = {};
  for (const c of CAPTAINS) heroes[c.id] = defaultHero();
  return { selected: STARTER_CAPTAIN, owned: [STARTER_CAPTAIN], heroes, milestones: [] };
}

const isInt = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/**
 * Validates untrusted data into a CaptainsState. Never throws. Old saves (no `captains`) become: Cadet owned and selected,
 * level 0, no kills. Unknown captains and options are dropped; an active option must be an owned option of its tier.
 */
export function sanitizeCaptains(raw: unknown): CaptainsState {
  const out = defaultCaptains();
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, any>;
  const owned = Array.isArray(r.owned) ? r.owned.filter((id: unknown) => typeof id === 'string' && id in CAPTAIN_BY_ID) : [];
  out.owned = Array.from(new Set([STARTER_CAPTAIN, ...owned]));
  out.selected = typeof r.selected === 'string' && out.owned.includes(r.selected) ? r.selected : STARTER_CAPTAIN;
  for (const c of CAPTAINS) {
    const h = r.heroes?.[c.id];
    if (!h || typeof h !== 'object') continue;
    const hero = out.heroes[c.id];
    hero.level = isInt(h.level, 0, HERO_MAX_LEVEL) ? h.level : 0;
    hero.kills = isInt(h.kills, 0, Number.MAX_SAFE_INTEGER) ? h.kills : 0;
    const mine = new Set(c.tiers.flat().map(opt => opt.id));
    hero.owned = Array.from(new Set((Array.isArray(h.owned) ? h.owned : []).filter((id: unknown) => typeof id === 'string' && mine.has(id)))) as string[];
    for (const [k, id] of Object.entries(h.active ?? {})) {
      const opt = typeof id === 'string' ? OPTION_BY_ID[id] : undefined;
      if (opt && opt.captain === c.id && String(opt.tier) === k && hero.owned.includes(opt.id)) hero.active[k] = opt.id;
    }
  }
  const waves = new Set(FLY_MEDAL_MILESTONES.map(m => m.wave));
  out.milestones = Array.from(new Set((Array.isArray(r.milestones) ? r.milestones : []).filter((w: unknown) => typeof w === 'number' && waves.has(w)))) as number[];
  out.milestones.sort((a, b) => a - b);
  return out;
}

// ---------------------------------------------------------------- queries

export const isCaptainOwned = (c: CaptainsState, id: string) => c.owned.includes(id);

/** Kills the hero needs for a tier (1-based). */
export const tierKillsNeeded = (tier: number) => TIER_KILLS[tier - 1] ?? Infinity;
export const isTierUnlocked = (hero: HeroState, tier: number) => hero.kills >= tierKillsNeeded(tier);

/** The next tier still locked for this hero (null when all four are open) and the kills it needs. */
export function nextTierGoal(hero: HeroState): { tier: number; kills: number } | null {
  for (let t = 1; t <= TIER_COUNT; t++) if (!isTierUnlocked(hero, t)) return { tier: t, kills: tierKillsNeeded(t) };
  return null;
}

export type OptionState = 'locked' | 'available' | 'owned' | 'active';

export function optionState(hero: HeroState, opt: OptionDef): OptionState {
  if (hero.active[String(opt.tier)] === opt.id) return 'active';
  if (hero.owned.includes(opt.id)) return 'owned';
  return isTierUnlocked(hero, opt.tier) ? 'available' : 'locked';
}

export const optionCost = (opt: OptionDef) => TIER_COSTS[opt.tier - 1];

// ---------------------------------------------------------------- actions (each mutates `p` only when it succeeds)

export function unlockCaptain(p: CaptainHolder, id: string): CaptainResult {
  const def = CAPTAIN_BY_ID[id];
  if (!def) return { ok: false, error: 'Unknown captain' };
  if (isCaptainOwned(p.captains, id)) return { ok: false, error: 'Already owned' };
  if (p.medals < def.unlockCost) return { ok: false, error: 'Not enough Medals' };
  p.medals -= def.unlockCost;
  p.captains.owned.push(id);
  return { ok: true, cost: def.unlockCost };
}

export function selectCaptain(p: CaptainHolder, id: string): CaptainResult {
  if (!CAPTAIN_BY_ID[id]) return { ok: false, error: 'Unknown captain' };
  if (!isCaptainOwned(p.captains, id)) return { ok: false, error: 'Unlock this captain first' };
  p.captains.selected = id;
  return { ok: true, cost: 0 };
}

export function upgradeHero(p: CaptainHolder, id: string): CaptainResult {
  if (!CAPTAIN_BY_ID[id]) return { ok: false, error: 'Unknown captain' };
  if (!isCaptainOwned(p.captains, id)) return { ok: false, error: 'Unlock this captain first' };
  const hero = p.captains.heroes[id];
  if (hero.level >= HERO_MAX_LEVEL) return { ok: false, error: 'Already at max level' };
  const cost = heroLevelCost(hero.level);
  if (p.medals < cost) return { ok: false, error: 'Not enough Medals' };
  p.medals -= cost;
  hero.level++;
  return { ok: true, cost };
}

/** Buys an option (owned forever) and makes it the active one of its tier. */
export function buyOption(p: CaptainHolder, optionId: string): CaptainResult {
  const opt = OPTION_BY_ID[optionId];
  if (!opt) return { ok: false, error: 'Unknown option' };
  if (!isCaptainOwned(p.captains, opt.captain)) return { ok: false, error: 'Unlock this captain first' };
  const hero = p.captains.heroes[opt.captain];
  if (hero.owned.includes(optionId)) return { ok: false, error: 'Already owned' };
  if (!isTierUnlocked(hero, opt.tier)) return { ok: false, error: `Needs ${tierKillsNeeded(opt.tier)} kills (have ${hero.kills})` };
  const cost = optionCost(opt);
  if (p.medals < cost) return { ok: false, error: 'Not enough Medals' };
  p.medals -= cost;
  hero.owned.push(optionId);
  hero.active[String(opt.tier)] = optionId;
  return { ok: true, cost };
}

/** Free: makes an owned option the active one of its tier (the other option of the pair goes inactive). */
export function activateOption(p: CaptainHolder, optionId: string): CaptainResult {
  const opt = OPTION_BY_ID[optionId];
  if (!opt) return { ok: false, error: 'Unknown option' };
  const hero = p.captains.heroes[opt.captain];
  if (!hero || !hero.owned.includes(optionId)) return { ok: false, error: 'Buy it first' };
  hero.active[String(opt.tier)] = optionId;
  return { ok: true, cost: 0 };
}

/** Adds lifetime kills to a captain (the one that was active during the run). */
export function addCaptainKills(p: CaptainHolder, id: string, n: number) {
  const hero = p.captains.heroes[id];
  if (!hero || !(n > 0)) return;
  hero.kills += Math.floor(n);
}

// ---------------------------------------------------------------- Medals

/** What one Medal award came to. */
export interface MedalAward { medals: number; doubled: boolean }

/** `base` Medals, doubled with probability `chance` (one roll from the injected RNG, only when chance > 0). */
export function rollMedals(base: number, chance: number, rand: () => number): MedalAward {
  if (base <= 0) return { medals: 0, doubled: false };
  const doubled = chance > 0 && rand() < chance;
  return { medals: doubled ? base * 2 : base, doubled };
}

/** Pays the Free Fly milestone of `wave`, once per save. Returns null when the wave is not a milestone or was already paid. */
export function claimFlyMilestone(p: CaptainHolder, wave: number, chance: number, rand: () => number): MedalAward | null {
  const m = FLY_MEDAL_MILESTONES.find(x => x.wave === wave);
  if (!m || p.captains.milestones.includes(wave)) return null;
  p.captains.milestones.push(wave);
  p.captains.milestones.sort((a, b) => a - b);
  const award = rollMedals(m.medals, chance, rand);
  p.medals += award.medals;
  return award;
}

// ---------------------------------------------------------------- kill banking

/**
 * Hands a run's kills to the captain that was active at run start, in instalments (on pause, when the tab is hidden, at the
 * end). `flush(total)` adds only what has not been added yet, so calling it any number of times counts each kill once.
 */
export class KillBanker {
  private flushed = 0;
  constructor(private sink: { addCaptainKills(id: string, n: number): void }, readonly captainId: string) {}
  get added(): number { return this.flushed; }
  flush(total: number): number {
    const d = Math.floor(total) - this.flushed;
    if (d <= 0) return 0;
    this.sink.addCaptainKills(this.captainId, d);
    this.flushed += d;
    return d;
  }
}
