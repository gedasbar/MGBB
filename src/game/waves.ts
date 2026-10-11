import { Mulberry32 } from '../rng';
import { CONFIG } from '../config';
import { ROSTER, SPECIES, SpeciesDef } from '../data/species';
import { ENEMIES } from '../data/enemies';
import {
  ALIVE_HOLD, MOTHER_EVENT_MIN, MOTHER_EVENT_SECOND_GROUP, PEBBLE_COST, PEBBLE_GENERATION, PEBBLE_RADIUS, SPAWN_EDGE, SPAWN_JITTER,
  SPAWN_WINDOW, SPECIAL_BUDGET_MUL, specialKind, SWARM_WINDOW, WAVE_TIME, waveBudget,
} from '../data/waves';

/** One body the director will send: `at` seconds into its wave, entering from just above the top edge at `x`. */
export interface PlannedSpawn {
  at: number;
  defId: string;
  x: number;
  generation: number;
  radius: number;
  /** HP as a multiple of the tier's basic rock HP (before the wave's HP growth). */
  hpMul: number;
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
  const rnd = waveRng(seed, wave);
  const kind = specialKind(wave);
  let budget = waveBudget(wave) * (kind ? SPECIAL_BUDGET_MUL : 1);
  const picks: { defId: string; generation: number; radius: number; hpMul: number }[] = [];
  const add = (s: SpeciesDef) => { picks.push({ defId: s.id, generation: 1, radius: s.radius, hpMul: s.hpMul }); budget -= s.cost; };
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
    for (;;) {
      const afford = open.filter(s => s.cost <= budget && s.weight > 0);
      if (!afford.length) break;
      add(pickWeighted(afford, rnd));
    }
  }
  // What no species fits into is spent on pebbles, so a wave always uses its whole budget (wave 1: a Rock and 2 pebbles).
  if (kind !== 'swarm') while (budget >= PEBBLE_COST) addPebble();

  const n = picks.length;
  const out = picks.map((p, k) => {
    const at = Math.max(0, Math.min(window, ((k + 0.5) / n) * window + (rnd.next() * 2 - 1) * SPAWN_JITTER));
    return { at, x: spawnX(p.radius, rnd), ...p };
  });
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

  constructor(readonly seed: number) {}

  /** Dev: start the run at wave `wave` (its spawns begin on the next update; earlier waves are skipped, not caught up). */
  jumpTo(wave: number) {
    if (wave <= 1) return;
    this.wave = wave - 1;
    this.start = (wave - 2) * WAVE_TIME;
    this.queue = [];
    this.next = 0;
  }

  /** Seconds left until the next wave starts. */
  timeToNext(time: number): number { return Math.max(0, this.start + WAVE_TIME - time); }

  /**
   * Advances to `time` (seconds since the run began). Returns the wave that started on this call (0 if none) and
   * pushes the spawns now due into `out`; nothing is spawned while more than ALIVE_HOLD bodies are alive.
   */
  update(time: number, alive: number, out: PlannedSpawn[]): number {
    let started = 0;
    while (time >= (this.wave === 0 ? 0 : this.start + WAVE_TIME)) {
      // Spawns of the old wave not yet out (held back) are carried into the new one at its start.
      const rest = this.queue.slice(this.next).map(s => ({ ...s, at: 0 }));
      this.start = this.wave === 0 ? 0 : this.start + WAVE_TIME;
      this.wave++;
      started = this.wave;
      this.queue = [...rest, ...planWave(this.seed, this.wave)];
      this.next = 0;
    }
    while (this.next < this.queue.length && this.start + this.queue[this.next].at <= time) {
      if (alive >= ALIVE_HOLD) { this.held++; break; }
      out.push(this.queue[this.next++]);
      alive++;
    }
    return started;
  }
}
