import { Mulberry32 } from '../rng';
import { CONFIG } from '../config';
import { ROSTER, SPECIES, SpeciesDef } from '../data/species';
import { ENEMIES } from '../data/enemies';
import {
  ALIVE_HOLD, MOTHER_EVENT_MIN, MOTHER_EVENT_SECOND_GROUP, PEBBLE_COST, PEBBLE_GENERATION, PEBBLE_RADIUS, SPAWN_EDGE, SPAWN_JITTER,
  SPAWN_WINDOW, SPECIAL_BUDGET_MUL, specialKind, SWARM_WINDOW, WAVE_TIME, waveBudget,
} from '../data/waves';
import { BOSS_BREATHER, isBossWave } from '../data/bosses';
import { ARMORED_ARMOR, ARMORED_SHARE, GUNNER_THEME_SHARE, LEECH_THEME_SHARE, SHIELD_WALL_ESCORTS, SHIELD_WALL_SPREAD, SWARM_DARTER_SHARE, themeAt } from '../data/waveThemes';

/** One body the director will send: `at` seconds into its wave, entering from just above the top edge at `x`. */
export interface PlannedSpawn {
  at: number;
  defId: string;
  x: number;
  generation: number;
  radius: number;
  /** HP as a multiple of the tier's basic rock HP (before the wave's HP growth). */
  hpMul: number;
  /** Armor the body is born with (the ARMORED theme); absent = the species' own. */
  armor?: number;
}

/** HP share of a basic rock at a generation (its split rule's share per split). */
const genShare = (g: number) => Math.pow(ENEMIES.mitotic_rock.split!.hpShare, g - 1);

/** Species the director may draw in a wave (unlocked by then). */
export const unlockedAt = (wave: number): SpeciesDef[] => ROSTER.filter(s => s.firstWave <= wave);

/** The RNG of one wave: a pure function of the run seed and the wave number, so a wave never depends on earlier play. */
function waveRng(seed: number, wave: number): Mulberry32 {
  return new Mulberry32((Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(wave, 0x85ebca6b)) | 0);
}

function pickWeighted(list: SpeciesDef[], rnd: Mulberry32): SpeciesDef {
  let total = 0;
  for (const s of list) total += s.weight;
  let r = rnd.next() * total;
  for (const s of list) { r -= s.weight; if (r < 0) return s; }
  return list[list.length - 1];
}

const spawnX = (radius: number, rnd: Mulberry32) => {
  const lo = radius + SPAWN_EDGE, hi = CONFIG.VIEW.W - radius - SPAWN_EDGE;
  return lo + rnd.next() * (hi - lo);
};

/**
 * Plans one wave: what spawns, when and where. Deterministic: the same (seed, wave) gives the same list.
 * Normal waves draw unlocked species by weight until the budget is spent (a species' first wave always has it, first)
 * and spread them over SPAWN_WINDOW; a leftover below the cheapest pick becomes pebbles. Every 5th wave is special: a Swarm (Darters and pebbles) or a Mother event.
 */
export function planWave(seed: number, wave: number): PlannedSpawn[] {
  if (isBossWave(wave)) return []; // chunk 32b: a boss wave has no normal spawns; the boss is the wave
  const rnd = waveRng(seed, wave);
  const kind = specialKind(wave);
  const theme = kind ? null : themeAt(wave);
  let budget = waveBudget(wave) * (kind ? SPECIAL_BUDGET_MUL : theme ? theme.budgetMul : 1);
  const total = budget;
  const picks: { defId: string; generation: number; radius: number; hpMul: number; armor?: number; group?: number; leader?: boolean }[] = [];
  const add = (s: SpeciesDef, extra: { group?: number; leader?: boolean } = {}) => { picks.push({ defId: s.id, generation: 1, radius: s.radius, hpMul: s.hpMul, ...extra }); budget -= s.cost; };
  const addPebble = () => {
    picks.push({ defId: 'mitotic_rock', generation: PEBBLE_GENERATION, radius: PEBBLE_RADIUS, hpMul: genShare(PEBBLE_GENERATION) });
    budget -= PEBBLE_COST;
  };
  let window = SPAWN_WINDOW;

  if (kind === 'swarm') {
    window = SWARM_WINDOW;
    while (budget >= Math.min(PEBBLE_COST, SPECIES.darter.cost)) {
      if (rnd.next() < 0.5 && budget >= SPECIES.darter.cost) add(SPECIES.darter);
      else addPebble();
    }
  } else if (kind === 'mothers') {
    const n = Math.max(MOTHER_EVENT_MIN, Math.floor(budget / SPECIES.mother.cost));
    const out: PlannedSpawn[] = [];
    for (let i = 0; i < n; i++) {
      const second = i >= Math.ceil(n / 2);
      const k = second ? i - Math.ceil(n / 2) : i;
      out.push({ at: (second ? MOTHER_EVENT_SECOND_GROUP : 0) + k * 0.8 + rnd.next() * 0.3, defId: 'mother', x: spawnX(SPECIES.mother.radius, rnd), generation: 1, radius: SPECIES.mother.radius, hpMul: SPECIES.mother.hpMul });
    }
    return out.sort((a, b) => a.at - b.at);
  } else {
    const open = unlockedAt(wave);
    for (const s of open) if (s.firstWave === wave) add(s); // the newcomer comes first
    if (theme?.id === 'swarm') {
      window = SWARM_WINDOW;
      while (budget >= PEBBLE_COST) { if (rnd.next() < SWARM_DARTER_SHARE) add(SPECIES.darter); else addPebble(); }
    } else if (theme?.id === 'gunners' || theme?.id === 'leeches') {
      const s = theme.id === 'gunners' ? SPECIES.gunner : SPECIES.leech;
      const share = theme.id === 'gunners' ? GUNNER_THEME_SHARE : LEECH_THEME_SHARE;
      while (budget >= s.cost && total - budget < total * share) add(s);
    } else if (theme?.id === 'shield_wall') {
      const escorts = open.filter(s => s.weight > 0 && s.cost <= 4 && !s.shield && !s.heal && !s.gun);
      for (let g = 0; budget >= SPECIES.shielder.cost + SHIELD_WALL_ESCORTS; g++) {
        add(SPECIES.shielder, { group: g, leader: true });
        for (let k = 0; k < SHIELD_WALL_ESCORTS && budget >= 1; k++) {
          const e = escorts.filter(s => s.cost <= budget);
          if (!e.length) break;
          add(e[Math.floor(rnd.next() * e.length)], { group: g });
        }
      }
    }
    for (;;) {
      const afford = open.filter(s => s.cost <= budget && s.weight > 0);
      if (!afford.length) break;
      add(pickWeighted(afford, rnd));
    }
  }
  // What no species fits into is spent on pebbles, so a wave always uses its whole budget (wave 1: a Rock and 2 pebbles).
  if (kind !== 'swarm') while (budget >= PEBBLE_COST) addPebble();

  // ARMORED theme: most bodies are born armored (drawn after the picks, so the picks themselves are the plain wave's).
  if (theme?.id === 'armored') for (const p of picks) if (rnd.next() < ARMORED_SHARE) p.armor = ARMORED_ARMOR;

  const n = picks.length;
  const out: PlannedSpawn[] = picks.map((p, k) => {
    const at = Math.max(0, Math.min(window, ((k + 0.5) / n) * window + (rnd.next() * 2 - 1) * SPAWN_JITTER));
    const { group, leader, ...rest } = p;
    return { at, x: spawnX(p.radius, rnd), ...rest };
  });
  // SHIELD WALL: an escort is born with its Shielder, within SHIELD_WALL_SPREAD px of it.
  if (theme?.id === 'shield_wall') {
    const lead = new Map<number, PlannedSpawn>();
    picks.forEach((p, k) => { if (p.leader) lead.set(p.group!, out[k]); });
    picks.forEach((p, k) => {
      const l = p.group !== undefined && !p.leader ? lead.get(p.group) : undefined;
      if (!l) return;
      const lo = p.radius + SPAWN_EDGE, hi = CONFIG.VIEW.W - p.radius - SPAWN_EDGE;
      out[k].at = l.at + 0.15;
      out[k].x = Math.max(lo, Math.min(hi, l.x + (rnd.next() * 2 - 1) * SHIELD_WALL_SPREAD));
    });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Wave director of a Free Fly run: starts a wave every WAVE_TIME seconds and hands out its spawns when they are due. */
export class WaveDirector {
  /** Current wave (0 before the first update). */
  wave = 0;
  private start = 0;
  private queue: PlannedSpawn[] = [];
  private next = 0;
  /** Updates on which a due spawn was held back because too many bodies were alive (debug and tests). */
  held = 0;
  /** Chunk 32b: true during a boss wave: the clock does not start the next wave until `releaseBoss` (the boss died). */
  holding = false;
  /** Chunk 32c: waves skipped by the last `update` call (a Wave Skipper chunk; cleared at the start of each call). */
  skipped: number[] = [];

  /**
   * @param waveTime seconds a wave lasts (WAVE_TIME; the Faster / Longer Waves chunks change it)
   * @param skipChance chance a normal wave is skipped (Wave Skipper): its wave number comes and the next wave starts at once, nothing is sent
   */
  constructor(readonly seed: number, readonly waveTime: number = WAVE_TIME, readonly skipChance: number = 0) {}

  /** Dev: start the run at wave `wave` (its spawns begin on the next update; earlier waves are skipped, not caught up). */
  jumpTo(wave: number) {
    if (wave <= 1) return;
    this.wave = wave - 1;
    this.start = (wave - 2) * this.waveTime;
    this.queue = [];
    this.next = 0;
    this.holding = false;
  }

  /** True when `wave` is skipped: never wave 1, never a boss wave; otherwise a fixed pseudo-random draw per (seed, wave) below `skipChance`. */
  skipsWave(wave: number): boolean {
    if (!(this.skipChance > 0) || wave <= 1 || isBossWave(wave)) return false;
    return waveRng(this.seed ^ 0x5b1b, wave).next() < this.skipChance;
  }

  /** Spawns planned but not yet sent (chunk 32e: the crystal pool is shared with them). */
  get pending(): readonly PlannedSpawn[] { return this.queue.slice(this.next); }

  /** Seconds left until the next wave starts (a boss wave has no timer: it ends when the boss dies). */
  timeToNext(time: number): number { return this.holding ? 0 : Math.max(0, this.start + this.waveTime - time); }

  /** The boss of the current wave died at `time`: the next wave starts BOSS_BREATHER seconds later. */
  releaseBoss(time: number) {
    this.holding = false;
    this.start = time + BOSS_BREATHER - this.waveTime;
  }

  /**
   * Advances to `time` (seconds since the run began). Returns the wave that started on this call (0 if none) and
   * pushes the spawns now due into `out`; nothing is spawned while more than ALIVE_HOLD bodies are alive.
   */
  update(time: number, alive: number, out: PlannedSpawn[]): number {
    let started = 0;
    this.skipped.length = 0;
    while (!this.holding && time >= (this.wave === 0 ? 0 : this.start + this.waveTime)) {
      // Spawns of the old wave not yet out (held back) are carried into the new one at its start (not into a boss wave).
      const rest = this.queue.slice(this.next).map(s => ({ ...s, at: 0 }));
      this.start = this.wave === 0 ? 0 : this.start + this.waveTime;
      this.wave++;
      if (this.skipsWave(this.wave)) {
        // Skipped (chunk 32c): no spawns, no pay; the clock moves on, so the next wave starts on the next loop turn.
        this.skipped.push(this.wave);
        this.start -= this.waveTime; // the wave took no time: the next one starts where this one would have
        this.queue = [...rest];
        this.next = 0;
        continue;
      }
      started = this.wave;
      this.queue = isBossWave(this.wave) ? [] : [...rest, ...planWave(this.seed, this.wave)];
      this.next = 0;
      if (isBossWave(this.wave)) this.holding = true;
    }
    while (this.next < this.queue.length && this.start + this.queue[this.next].at <= time) {
      if (alive >= ALIVE_HOLD) { this.held++; break; }
      out.push(this.queue[this.next++]);
      alive++;
    }
    return started;
  }
}
