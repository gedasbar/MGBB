// Chunk 14a: headless damage benches on the real engine (Free Fly World), shared by scripts/balance-damage.ts.
//
// Three fixed scenarios, every target hovering (species speeds set to 0 while a bench runs) above a ship that tracks the
// lowest target, like the chunk 11a field pilot:
//   big     - one large body (radius 40) that does not split; respawns at once when it dies.
//   cluster - 8 small bodies (radius 14) packed in a 4 x 2 block, 32 px apart; the whole cluster respawns when it is gone.
//   split   - one Mitotic Rock that splits down to generation 4; a new one appears when the family is gone.
// Each scenario runs half its time with the targets 200 px above the ship and half with them 450 px above (Boomerang, Mine and
// the curving shots only reach the near ones), and the two rates are averaged.
// Target HP is scaled to the circuit's compile estimate (estDps), so a strong gun and a weak gun both spend the same few
// seconds per target and overkill costs them the same share: the score is HP removed per second, and its ratio to estDps
// is the engine's "efficiency" for that circuit in that scenario (what aiming, overkill, AoE, chains, statuses really do).
import { World } from '../../src/game/world';
import type { Grid } from '../../src/engine/compiler';
import { compile } from '../../src/engine/compiler';
import { rng } from '../../src/rng';
import { SPECIES } from '../../src/data/species';
import { ENEMIES } from '../../src/data/enemies';
import { CONFIG } from '../../src/config';
import type { RunModifiers } from '../../src/captains/modifiers';

/** 'spread' (chunk 16c-2) is not part of SCENARIOS / benchAll: a dense row of 30 small bodies, for the stacking area blocks (AoE) whose blast the tight cluster already covers. */
export type Scenario = 'big' | 'cluster' | 'split' | 'spread';
const SCENARIOS: Scenario[] = ['big', 'cluster', 'split'];

const DT = 1 / 60;
const TRACK_SPEED = 650;
const SHIP_Y = 768;
/** Distances from the ship to the targets: a near and a far one, half of the bench each (range-limited shots reach only the near one). */
const DISTANCES = [200, 450];
/** Seconds of the estimate each target is worth (big body; one cluster body; a split family's parent). */
const SECONDS_OF: Record<Scenario, number> = { big: 4, cluster: 0.75, split: 1.5, spread: 0.75 };
/** HP of a whole split family as a multiple of its parent (1 + 2 x 0.55 + 4 x 0.55^2 + 8 x 0.55^3). */
const SHARE = ENEMIES.mitotic_rock.split!.hpShare;
const FAMILY_HP = 1 + 2 * SHARE + 4 * SHARE ** 2 + 8 * SHARE ** 3;

/** `hpMul` scales the target HP (default 1): with small numbers a body dies after a whole number of hits, so a stacking check averages several. */
export interface BenchOpts {
  seconds?: number; seed?: number; modifiers?: RunModifiers; hpMul?: number;
  /** Chunk 17b: called with the finished World of every half-run (the interaction audit reads its effect counters). */
  onWorld?: (w: World) => void;
  /** Chunk 17b: filled while a run goes: most projectiles alive at once, and the slowest 0.1% of update steps in ms. */
  watch?: { maxAlive: number; stepMs: number[] };
}

function hover<T>(fn: () => T): T {
  const saved = Object.values(SPECIES).map(s => ({ s, speed: s.speed, sway: s.sway, zig: s.zig, aim: s.aim }));
  for (const { s } of saved) { s.speed = 0; s.sway = 0; s.zig = 0; s.aim = 0; }
  try { return fn(); } finally { for (const v of saved) Object.assign(v.s, { speed: v.speed, sway: v.sway, zig: v.zig, aim: v.aim }); }
}

/** HP removed per second in one scenario. `est` is the circuit's estimate used to size the targets (defaults to compile's). */
export function bench(grid: Grid, sc: Scenario, o: BenchOpts = {}, est?: number): number {
  const half = (o.seconds ?? 16) / 2;
  return DISTANCES.reduce((s, d) => s + benchAt(grid, sc, o, est, half, SHIP_Y - d), 0) / DISTANCES.length;
}

function benchAt(grid: Grid, sc: Scenario, o: BenchOpts, est: number | undefined, seconds: number, TARGET_Y: number): number {
  const base = Math.max(0.5, est ?? compile(grid, { baseDamage: o.modifiers?.baseDamage ?? 0 }).stats.estDps);
  const hp = base * SECONDS_OF[sc] * (o.hpMul ?? 1);
  return hover(() => {
    rng.reset(o.seed ?? 1);
    const w = new World({ grid, autoSpawn: false, seed: o.seed ?? 1, modifiers: o.modifiers });
    w.hull = 1e12;
    w.god = true;
    let removed = 0;
    let families = 0;
    const live = new Map<number, number>(); // id -> max HP (big / cluster)
    // New targets alternate 90 px left and right of the centre, so what a kill leaves behind (a Residue cloud) does not
    // sit on the next target as it would never in play.
    let spawns = 0;
    const spawn = () => {
      const X = CONFIG.VIEW.W / 2 + (spawns++ % 2 ? 90 : -90);
      if (sc === 'big') { const e = w.spawnSpecies('darter', X, TARGET_Y, { hp, radius: 40 }); if (e) live.set(e.id, e.maxHp); }
      else if (sc === 'cluster') {
        for (let k = 0; k < 8; k++) {
          const e = w.spawnSpecies('darter', X + ((k % 4) - 1.5) * 32, TARGET_Y + Math.floor(k / 4) * 32, { hp, radius: 14 });
          if (e) live.set(e.id, e.maxHp);
        }
      } else if (sc === 'spread') {
        // 30 small bodies in a row, about 12 px apart with a fixed jitter (a dense crowd about 360 px wide), so a bigger blast reaches more of it at every step.
        for (let k = 0; k < 30; k++) {
          const e = w.spawnSpecies('darter', CONFIG.VIEW.W / 2 + (k - 14.5) * 12 + (((k * 37) % 9) - 4), TARGET_Y, { hp, radius: 5 });
          if (e) live.set(e.id, e.maxHp);
        }
      } else w.spawnSpecies('mitotic_rock', X, TARGET_Y, { hp, radius: 20 });
    };
    spawn();
    const p = { x: CONFIG.VIEW.W / 2, y: SHIP_Y, active: false, type: 'mouse' as const, seen: true };
    const steps = Math.round(seconds / DT);
    for (let i = 0; i < steps; i++) {
      let aim = p.x, low = -Infinity;
      for (const e of w.mitosis.enemies) if (e.y < SHIP_Y - 30 && e.y > low) { low = e.y; aim = e.x; }
      if (sc === 'spread') aim = CONFIG.VIEW.W / 2; // the crowd is centred: aim at its middle, so a bigger blast reaches more of it on both sides
      p.x += Math.max(-TRACK_SPEED * DT, Math.min(TRACK_SPEED * DT, aim - p.x));
      const t0 = o.watch ? performance.now() : 0;
      w.update(DT, p);
      if (o.watch) { o.watch.stepMs.push(performance.now() - t0); o.watch.maxAlive = Math.max(o.watch.maxAlive, w.pool.count); }
      w.hits.length = 0; w.splits.length = 0; w.killEvents.length = 0; w.waveEvents.length = 0;
      if (sc !== 'split') {
        const alive = new Set(w.mitosis.enemies.map(e => e.id));
        for (const [id, mx] of live) if (!alive.has(id)) { removed += mx; live.delete(id); }
        if (live.size === 0) spawn();
      } else if (w.mitosis.enemies.length === 0) { families++; spawn(); }
    }
    if (sc !== 'split') {
      for (const e of w.mitosis.enemies) if (live.has(e.id)) removed += Math.max(0, e.maxHp - Math.max(0, e.hp));
    } else {
      // The family in progress counts by the HP it has lost so far (alive bodies' remaining HP against the family total).
      const left = w.mitosis.enemies.reduce((s, e) => s + Math.max(0, e.hp), 0);
      const partial = Math.max(0, Math.min(1, 1 - left / (hp * FAMILY_HP)));
      removed = (families + partial) * hp * FAMILY_HP;
    }
    o.onWorld?.(w);
    return removed / seconds;
  });
}

export interface BenchRow { est: number; big: number; cluster: number; split: number; mixed: number }

/** All three scenarios and their mean ("mixed"). */
export function benchAll(grid: Grid, o: BenchOpts = {}): BenchRow {
  const est = compile(grid, { baseDamage: o.modifiers?.baseDamage ?? 0 }).stats.estDps;
  const r = { est, big: bench(grid, 'big', o, est), cluster: bench(grid, 'cluster', o, est), split: bench(grid, 'split', o, est), mixed: 0 };
  r.mixed = (r.big + r.cluster + r.split) / 3;
  return r;
}
