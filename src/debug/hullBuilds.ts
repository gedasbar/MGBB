import type { Grid } from '../engine/compiler';
import { HULL_ORDER } from '../data/hulls';
import { HULL_BUILDERS } from '../game/gridUtils';
import { place } from '../game/starter';

/**
 * The "sensible build" of a hull, for the pricing script (scripts/hull-pricing.ts), the bot check and tests. Not a player's
 * best circuit: the plainest routing that feeds the ejectors, with damage blocks in the free straight cells, and a strength
 * that grows with the hull's place on the ladder (a player who can afford the 10th hull owns more and better blocks than one
 * who bought the 4th). Chunk 17a, docs/hull-ladder.md.
 */

type Cell = [number, number];
const DIRS: Cell[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N, E, S, W

/** Damage blocks of a hull by ladder index (0 = Dart): this many copies in all, alternating Flat+ and Percent x. */
export const buildCopies = (index: number) => Math.min(20, 1 + index);
/** Level of those blocks (both have levels): 1 at the Dart up to 10 at the top of the ladder. */
export const buildLevel = (index: number) => Math.min(10, 1 + Math.floor(index / 2));

interface Route { cells: Cell[] }

/** Shortest path from `start` (already entered heading `d0`) to an unclaimed ejector reached heading north; cells in `used` are off limits. */
function route(g: Grid, start: Cell, d0: number, used: Set<number>, claimed: Set<number>): Cell[] | null {
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= g.w || y >= g.h ? null : g.cells[y * g.w + x]);
  const first = at(start[0], start[1]);
  if (!first || used.has(start[1] * g.w + start[0])) return null;
  if (first.type === 'ejector') return first.facing === 'N' && d0 === 0 && !claimed.has(start[1] * g.w + start[0]) ? [start] : null;
  if (first.type !== 'empty') return null;
  interface St { x: number; y: number; d: number; path: Cell[] }
  const queue: St[] = [{ x: start[0], y: start[1], d: d0, path: [start] }];
  const seen = new Set<string>([`${start[0]},${start[1]},${d0}`]);
  while (queue.length) {
    const s = queue.shift()!;
    for (const nd of [s.d, (s.d + 1) % 4, (s.d + 3) % 4]) {
      const nx = s.x + DIRS[nd][0], ny = s.y + DIRS[nd][1];
      const c = at(nx, ny);
      if (!c || c.type === 'void' || c.type === 'generator' || used.has(ny * g.w + nx) || seen.has(`${nx},${ny},${nd}`)) continue;
      seen.add(`${nx},${ny},${nd}`);
      if (c.type === 'ejector') {
        if (nd === 0 && !claimed.has(ny * g.w + nx)) return [...s.path, [nx, ny]];
        continue;
      }
      queue.push({ x: nx, y: ny, d: nd, path: [...s.path, [nx, ny]] });
    }
  }
  return null;
}

/**
 * Hull `id` with a circuit: with two or more ejectors a Splitter 3 on the cell above the generator and one route from each
 * of its outputs to its own ejector (when at least two outputs find one), otherwise a single route; a Turn Left / Right at
 * every corner; and `copies` damage blocks (Flat+ first, then Percent x, alternating) at level `level` in the free straight
 * cells, spread over the routes in turn. Returns null if the hull cannot be routed at all.
 */
export function standardBuild(id: string, copies = buildCopies(HULL_ORDER.indexOf(id as (typeof HULL_ORDER)[number])), level = buildLevel(HULL_ORDER.indexOf(id as (typeof HULL_ORDER)[number]))): Grid | null {
  const g = HULL_BUILDERS[id]();
  const gen = g.cells.find(c => c.type === 'generator')!;
  const ejectors = g.cells.filter(c => c.type === 'ejector').length;
  const idx = (c: Cell) => c[1] * g.w + c[0];
  // The trunk: the straight run of free cells above the generator. A Splitter 3 goes on the lowest trunk cell whose three outputs
  // find routes to their own ejectors (else the lowest where two do); the trunk cells below it carry damage blocks for every branch.
  const trunk: Cell[] = [];
  for (let y = gen.y - 1; y >= 0 && g.cells[y * g.w + gen.x].type === 'empty'; y--) trunk.push([gen.x, y]);
  const routes: Route[] = [];
  let splitter = false;
  let above: Cell = trunk[0] ?? [gen.x, gen.y - 1];
  let trunkSlots: Cell[] = [];
  if (ejectors >= 2) {
    let best: { t: number; found: Route[] } | null = null;
    for (let t = 0; t < trunk.length; t++) {
      const sp = trunk[t];
      const used = new Set<number>(trunk.slice(0, t + 1).map(idx));
      const claimed = new Set<number>();
      const found: Route[] = [];
      // outputs of a Splitter 3 facing north: forward (north), left (west), right (east)
      for (const d of [0, 3, 1]) {
        const p = route(g, [sp[0] + DIRS[d][0], sp[1] + DIRS[d][1]], d, used, claimed);
        if (!p) continue;
        found.push({ cells: p });
        for (const c of p) used.add(idx(c));
        claimed.add(idx(p[p.length - 1]));
      }
      if (found.length >= 2 && (!best || found.length > best.found.length)) best = { t, found };
      if (found.length >= Math.min(3, ejectors)) break;
    }
    if (best) { splitter = true; routes.push(...best.found); above = trunk[best.t]; trunkSlots = trunk.slice(0, best.t); }
  }
  if (!routes.length) {
    const p = route(g, above, 0, new Set(), new Set());
    if (!p) return null;
    routes.push({ cells: p });
  }

  // heading into each cell of every route, to tell corners from straight cells
  const heading = (r: Route, i: number): number => {
    if (i === 0) return r.cells.length > 1 ? -1 : 0;
    const a = r.cells[i - 1], b = r.cells[i];
    return DIRS.findIndex(d => d[0] === b[0] - a[0] && d[1] === b[1] - a[1]);
  };
  if (splitter) place(g, above[0] + 1, above[1] + 1, 'splitter_3');
  const slots: Cell[][] = routes.map(() => []);
  routes.forEach((r, ri) => {
    // The first cell of a splitter branch is entered from the splitter, heading d (west / east / north).
    const firstD = splitter ? DIRS.findIndex(d => d[0] === r.cells[0][0] - above[0] && d[1] === r.cells[0][1] - above[1]) : 0;
    let inD = firstD;
    for (let i = 0; i < r.cells.length - 1; i++) {
      const outD = heading(r, i + 1);
      const [x, y] = r.cells[i];
      if (outD !== inD) place(g, x + 1, y + 1, ((outD - inD + 4) % 4) === 1 ? 'turn_r' : 'turn_l');
      else slots[ri].push([x, y]);
      inD = outD;
    }
  });
  // damage blocks: round robin over the routes, earliest free cell of each first; placed in path order per route
  const chosen: Set<string> = new Set();
  let left = copies;
  for (const c of trunkSlots) if (left > 0) { chosen.add(`${c[0]},${c[1]}`); left--; }
  const pending = slots.map(s => [...s]);
  for (let n = 0, ri = 0, guard = 0; n < left && guard < 1000; guard++, ri = (ri + 1) % routes.length) {
    const s = pending[ri].shift();
    if (s) { chosen.add(`${s[0]},${s[1]}`); n++; }
    else if (pending.every(p => p.length === 0)) break;
  }
  let n = 0;
  for (const [x, y] of [...trunkSlots, ...routes.flatMap(r => r.cells)]) {
    if (!chosen.has(`${x},${y}`)) continue;
    place(g, x + 1, y + 1, n % 2 === 0 ? 'flat_plus' : 'percent_mult', level);
    n++;
  }
  return g;
}
