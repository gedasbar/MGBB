import { buildCatalogue, campaignNeeds, scoreOf, budgetAt, medalsAt, heroLevelFor, bestOwned } from './lib/difficultyModel';
import { fmtBig } from '../src/ui/format';
const cat = buildCatalogue();
const top = [...cat].sort((a, b) => scoreOf(b) - scoreOf(a)).slice(0, 5);
for (const e of top) console.log(e.hull, e.fam, e.copies, 'L', e.level, 'cost', fmtBig(e.cost), 'est', fmtBig(e.est));
for (const t of [60, 80, 100]) { const n = campaignNeeds(t); console.log(t, 'pass', fmtBig(n.pass), 'clear', fmtBig(n.clear), 'tough', fmtBig(n.toughest), 'hp', n.hp, 'rows', n.rows, 'blocks', n.blocks); }
for (const e of [100, 150, 200]) { const b = budgetAt(e), m = medalsAt(e), h = heroLevelFor(m); const o = bestOwned(b, h); console.log('career', e, 'budget', fmtBig(b), 'medals', m, 'hero', h, o ? `${o.hull} ${o.fam} ${o.copies} L${o.level} est ${fmtBig(o.est)}` : '-'); }

import { simulateWall } from '../src/wall/sim';
import { generateLevel } from '../src/wall/generator';
import { gridOfEntry } from './lib/difficultyModel';
import { computeRunModifiers } from '../src/captains/modifiers';
const best = [...cat].sort((a, b) => scoreOf(b) - scoreOf(a))[0];
const grid = () => gridOfEntry(best)!;
for (const t of [60, 80, 100]) {
  const l = generateLevel(t);
  for (const bot of ['carve', 'clearAll'] as const) { const r = simulateWall(l, grid(), bot); console.log('bot', bot, 'tier', t, r.state, r.destroyed + '/' + r.total, r.time.toFixed(0) + 's'); }
}

// ---- real-engine ceiling: perf hull with 10 +1 Projectile, 3 Flat+ L10, 10 Percent x L10 (+ optional), HP-scaled tier-100 wall
import { parseLayout } from '../src/game/gridUtils';
const PERF_ROWS = 40;
const perfHull = () => { const rows = ['.E..E..E.']; for (let r = 2; r < PERF_ROWS; r++) rows.push('_________'); rows.push('....G....'); return parseLayout(rows); };
import { place } from '../src/game/starter';
import { wholeHp } from '../src/wall/level';
import type { LevelDef } from '../src/wall/level';
function realBuild(plus: number, flats: number, pcts: number, extra: string[] = []) {
  const g = perfHull();
  const pre: [string, number][] = [];
  place(g, 5, PERF_ROWS - 1, 'flat_plus', 10);
  for (let k = 0; k < plus; k++) pre.push(['plus_one', 1]);
  for (let k = 0; k < flats; k++) pre.push(['flat_plus', 10]);
  for (let k = 0; k < pcts; k++) pre.push(['percent_mult', 10]);
  for (const e of extra) pre.push([e, 1]);
  pre.forEach(([id, lv], k) => place(g, 5, PERF_ROWS - 2 - k, id, lv));
  const row = PERF_ROWS - 2 - pre.length;
  place(g, 5, row, 'splitter_3'); place(g, 2, row, 'turn_r'); place(g, 8, row, 'turn_l');
  return g;
}
const scaled = (l: LevelDef, k: number): LevelDef => ({ ...l, cells: l.cells.map(c => (c ? { hp: wholeHp(c.hp * k), armor: c.armor, shield: c.shield > 0 ? wholeHp(c.shield * k) : 0 } : null)) });
const BOT = (process.env.BOT ?? 'carve') as 'carve' | 'clearAll';
const SPECS: [string, number, number, number][] = [['plus10', 10, 3, 10], ['plus8', 8, 3, 10]];
for (const [name, plus, f, p] of SPECS) for (const k of [1, 10, 100]) { const r = simulateWall(scaled(generateLevel(100), k), realBuild(plus, f, p), 'carve', { maxTime: 200 }); console.log(name, k, r.state, r.destroyed, r.time.toFixed(0), 'pool', r.world.pool.refused, r.world.warnings.join('|')); }
import { compile } from '../src/engine/compiler';
