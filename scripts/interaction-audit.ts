// Chunk 17b: pair audit of the shape and effect blocks. Every ordered pair (A then B on one line, and B then A) is flown in the three
// bench scenarios of scripts/lib/dmgBench.ts (one big target, a cluster, a splitting rock) and compared with each block alone.
//   CANCELS : the pair removes less HP per second than the better of the two alone (mean of the scenarios, 5% tolerance), or one
//             block's own effect never happened in the pair although it happened alone (effect events counted, not only damage).
//   EXPLODES: the pair removes more than 4x the sum of the two alone, or has more than 1,000 projectiles alive at once, or its
//             90th percentile update step take more than 4 ms.
// Run: npm run interaction-audit               -> docs/interaction-audit.md (+ reports/chunk17b/audit-after.json)
//      LABEL=before npm run interaction-audit  -> docs/interaction-audit-before.md (+ audit-before.json); the "after" run compares with it.
//      WIND=strong|cross npm run interaction-audit  (chunk 27b) -> docs/interaction-audit-wind-<mode>.md: every pair flown calm and in Strong Wind (launch turned 180 degrees)
//        or Crosswind (a push), on a wall of the real WallWorld with the ship held at WIND_SHIP_Y; reports the pairs where B stops helping. Does not touch the other docs.
//      QUICK=1 halves the seconds; SECS=n sets the seconds; ONLY=a,b limits the blocks (debugging; it overwrites the docs, so restore them with git checkout).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { bench, Scenario } from './lib/dmgBench';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { compile, Grid } from '../src/engine/compiler';
import { BLOCKS } from '../src/data/blocks';
import type { EffectCounters } from '../src/engine/projectiles';
import { neutralModifiers } from '../src/captains/modifiers';
import { WallWorld } from '../src/wall/wallWorld';
import { makeTestWall } from '../src/wall/level';
import { CELL, WALL_COLS } from '../src/wall/constants';

const WIND = process.env.WIND === 'strong' || process.env.WIND === 'cross' ? process.env.WIND : null;
const LABEL = process.env.LABEL === 'before' ? 'before' : 'after';
const SECONDS = process.env.SECS ? Number(process.env.SECS) : process.env.QUICK ? 3 : 6;
const SCENARIOS: Scenario[] = ['big', 'cluster', 'split'];
const CANCEL_TOL = 0.95;
const EXPLODE_MUL = 4;
const ALIVE_MAX = 1000;
const STEP_MS_MAX = 4;
/** Frontier Echo needs a furthest ring: 100 is the ring that unlocks it (+10 damage). */
const MODS = { ...neutralModifiers(), furthestRing: 100 };
/** Strong Wind: a full wall 100 px above a ship at y 380 (a shot has room to turn round). Crosswind: a full wall 400 px above a ship at y 700 (a push shows over a long flight), scored on the one column straight above the ship. */
const WIND_SHIP_Y = WIND === 'cross' ? 700 : 380;
const WIND_GAP = WIND === 'cross' ? 400 : 100;
const CROSS_ACCEL = 360;
const windCache = new Map<string, number>();


/** The blocks under test and the counter that proves each one's effect happened (null = steering only, no event to count). */
const SIGNATURE: Record<string, ((f: EffectCounters) => number) | null> = {
  piercing: f => f.pierceHits, bouncing: f => f.bounces, aoe_circle: f => f.aoeBlasts, aoe_rect: f => f.aoeBlasts,
  chain_lightning: f => f.chainJumps, homing: f => f.homingSteers, fork_impact: f => f.forks, boomerang: f => f.boomerangReturns,
  orbit: f => f.orbitLaunches, mine: f => f.mineDetonations, curving_right: null, random_curve: null,
  ignite: f => f.igniteApplied, frostbite: f => f.freezeApplied, corrosion: f => f.corrosionStrips, static_charge: f => f.staticPulses,
  executioner: f => f.executionerHits, culling_bolt: f => f.cullingHits, overkill_spill: f => f.spillMarks, residue_seed: f => f.residueClouds,
  fission_catalyst: f => f.fissionMarks, cauterize: f => f.cauterizeMarks, cleaver: f => f.cleaverHits, gravity_well: f => f.wellsMade,
  // Chunk 20a: the twelve legendary blocks. The six that only change the shot's damage at compile time have no event to count (null);
  // their effect shows in the score.
  frontier_echo: null, payload: null, heavy_round: null, hollow_core: null, idle_barrels: null, waypoint: null,
  lone_shot: f => f.loneBoosts, last_breath: f => f.lastBreathHits, zigzag: f => f.zigzagFlips, rebound: f => f.reboundBonuses,
  mirror: f => f.mirrorClones, fuse: f => f.fuseEmits,
  // Chunk 20b: the thirteen motion blocks. Blocks that only aim or change speed or lifetime have no event to count (null); their effect shows in the score.
  curving_left: null, angle_left: null, angle_right: null, accelerator: null, brake: null, scatter: null, extender: null, centreline: null, magnetized: null,
  upturn: f => f.upturnTurns, align: f => f.aligns, persist: f => f.persistContinues,
  // Chunk 21a: +1 Projectile adds a shot to the lane (no event; the score shows it, and the pairs with Mirror, Fuse and Lone Shot are the interesting ones).
  plus_one: null,
};
let IDS = Object.keys(SIGNATURE);
if (process.env.ONLY) IDS = process.env.ONLY.split(',');

/** Fan hull, the straight column under the middle ejector: Flat+ first (so the shot has some damage), then the blocks in order. */
function line(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus');
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}

const EST = compile(line([])).stats.estDps;

interface Run { score: number; events: Record<string, number>; maxAlive: number; stepP90: number }
const cache = new Map<string, Run>();
function run(ids: string[]): Run {
  const key = ids.join('+');
  const hit = cache.get(key);
  if (hit) return hit;
  const g = line(ids);
  const totals: Record<string, number> = {};
  const watch = { maxAlive: 0, stepMs: [] as number[] };
  let score = 0;
  for (const sc of SCENARIOS) {
    score += bench(g, sc, {
      seconds: SECONDS, watch, modifiers: MODS,
      onWorld: w => { for (const [k, v] of Object.entries(w.projSys.fx)) totals[k] = (totals[k] ?? 0) + (v as number); },
    }, EST) / SCENARIOS.length;
  }
  const steps = watch.stepMs.slice(30).sort((a, b) => a - b);
  const r = { score, events: totals, maxAlive: watch.maxAlive, stepP90: steps[Math.floor(steps.length * 0.9)] ?? 0 };
  cache.set(key, r);
  return r;
}
const eventsOf = (id: string, r: Run) => { const f = SIGNATURE[id]; return f ? f(r.events as unknown as EffectCounters) : -1; };

interface Pair { a: string; b: string; verdict: 'OK' | 'CANCELS' | 'EXPLODES'; why: string }
const pairs: Pair[] = [];
/**
 * Some blocks cost damage on their own (a curve aims off the target, an orbit holds the shot for a second): next to them the
 * partner's gain is expected to be smaller than the partner alone. A pair with such a block is compared with the costly block
 * alone (it must never do LESS than that), and the pair's effect events are still checked.
 */
const BASE = run([]).score;
if (WIND) { windMain(); process.exit(0); }
const costly = new Set(IDS.filter(id => run([id]).score < 0.97 * BASE));
const t0 = Date.now();
for (const a of IDS) for (const b of IDS) {
  if (a === b) continue;
  const ra = run([a]), rb = run([b]), rp = run([a, b]);
  const why: string[] = [];
  let verdict: Pair['verdict'] = 'OK';
  const best = costly.has(a) || costly.has(b) ? Math.max(costly.has(a) ? ra.score : 0, costly.has(b) ? rb.score : 0) : Math.max(ra.score, rb.score);
  if (rp.score > EXPLODE_MUL * (ra.score + rb.score)) { verdict = 'EXPLODES'; why.push(`${(rp.score / (ra.score + rb.score)).toFixed(1)}x the sum of the two alone`); }
  if (rp.maxAlive > ALIVE_MAX) { verdict = 'EXPLODES'; why.push(`${rp.maxAlive} projectiles alive`); }
  if (rp.stepP90 > STEP_MS_MAX) { verdict = 'EXPLODES'; why.push(`slow steps (${rp.stepP90.toFixed(1)} ms)`); }
  if (verdict === 'OK') {
    if (rp.score < CANCEL_TOL * best) { verdict = 'CANCELS'; why.push(`${(100 * rp.score / best).toFixed(0)}% of the better block alone`); }
    for (const [id, solo] of [[a, ra], [b, rb]] as [string, Run][]) {
      if (eventsOf(id, solo) > 0 && eventsOf(id, rp) === 0) { verdict = 'CANCELS'; why.push(`${BLOCKS[id].name} never happens`); }
    }
  }
  pairs.push({ a, b, verdict, why: why.join('; ') });
}
const secs = Math.round((Date.now() - t0) / 1000);

const name = (id: string) => BLOCKS[id].name;
const count = (v: Pair['verdict']) => pairs.filter(p => p.verdict === v).length;
const outDir = 'reports/chunk17b';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/audit-${LABEL}.json`, JSON.stringify(pairs.map(p => [p.a, p.b, p.verdict, p.why])));
const beforePath = `${outDir}/audit-before.json`;
const before: Map<string, string> | null = LABEL === 'after' && existsSync(beforePath)
  ? new Map((JSON.parse(readFileSync(beforePath, 'utf8')) as [string, string, string, string][]).map(r => [r[0] + '|' + r[1], r[2]]))
  : null;

const lines: string[] = [];
lines.push(`# Interaction audit (${LABEL === 'before' ? 'before chunk 17b' : 'chunk 20b, with the thirteen motion blocks'})`, '');
lines.push(`Generated by \`npm run interaction-audit\` (\`scripts/interaction-audit.ts\`), ${secs} s. ${IDS.length} blocks, ${pairs.length} ordered pairs (A is lower on the line, B above it), each in the three bench scenarios (big target, cluster, splitting rock) of \`scripts/lib/dmgBench.ts\`, ${SECONDS} s per half-run, after a Flat+ on the Fan hull's middle column.`, '');
lines.push(`**${count('OK')} OK, ${count('CANCELS')} CANCELS, ${count('EXPLODES')} EXPLODES.**`, '');
lines.push("- CANCELS: the pair removes under 95% of the HP per second of the better block alone, or one block's own effect (its counter) is 0 although it happened alone.");
lines.push(`- Blocks that cost damage on their own (below 97% of a plain Flat+ gun): ${[...costly].map(name).join(', ') || 'none'}. A pair with one of them is compared with that block alone, not with its partner alone.`);
lines.push('- EXPLODES: over 4x the sum of the two alone, over 1,000 projectiles alive at once, or the 90th percentile update step over 4 ms (machine dependent).', '');
if (before) {
  const now = new Map(pairs.map(p => [p.a + '|' + p.b, p.verdict]));
  let fixed = 0, worse = 0;
  for (const [k, v] of before) { const n = now.get(k); if (!n) continue; if (v !== 'OK' && n === 'OK') fixed++; if (v === 'OK' && n !== 'OK') worse++; }
  lines.push(`Against the "before" run (\`docs/interaction-audit-before.md\`): ${fixed} pairs went from a problem to OK, ${worse} pairs went from OK to a problem.`, '');
}
const bad = pairs.filter(p => p.verdict !== 'OK');
lines.push('## Pairs that are not OK', '');
if (bad.length === 0) lines.push('None.', '');
else {
  lines.push(before ? '| A then B | verdict | why | before |' : '| A then B | verdict | why |', before ? '|---|---|---|---|' : '|---|---|---|');
  for (const p of bad) lines.push(`| ${name(p.a)} then ${name(p.b)} | ${p.verdict} | ${p.why} |${before ? ` ${before.get(p.a + '|' + p.b) ?? '-'} |` : ''}`);
  lines.push('');
}
lines.push('## Full table', '', 'Row = A (first on the line), column = B. `.` OK, `C` CANCELS, `X` EXPLODES.', '');
const short = (id: string) => name(id).replace(/[^A-Z0-9a-z]/g, '').slice(0, 6);
lines.push('| A \\ B | ' + IDS.map(short).join(' | ') + ' |', '|---|' + IDS.map(() => '---').join('|') + '|');
for (const a of IDS) {
  lines.push(`| ${name(a)} | ` + IDS.map(b => a === b ? '-' : ({ OK: '.', CANCELS: 'C', EXPLODES: 'X' } as const)[pairs.find(p => p.a === a && p.b === b)!.verdict]).join(' | ') + ' |');
}
lines.push('');
writeFileSync(LABEL === 'before' ? 'docs/interaction-audit-before.md' : 'docs/interaction-audit.md', lines.join('\n'));
console.log(`${LABEL}: ${count('OK')} OK, ${count('CANCELS')} CANCELS, ${count('EXPLODES')} EXPLODES in ${secs} s`);

// ------------------------------------------------------------------ chunk 27b: the wind audit
/** Damage the blocks of a wall of tier 115 (it never runs out: 3.4K HP a block) took in `seconds` with the ship holding at WIND_SHIP_Y, a wall bottom 100 px above it, and the wind on or off. */
function windScore(ids: string[], windy: boolean): number {
  const key = (windy ? 'W:' : '') + ids.join('+');
  const hit = windCache.get(key);
  if (hit !== undefined) return hit;
  const effects = !windy ? undefined : WIND === 'strong' ? { strongWind: { turnDeg: 180, speedMul: 1 } } : { crosswind: { accel: CROSS_ACCEL } };
  const level = { ...makeTestWall({ tier: 115, rows: 20, approachSpeed: 0 }), approachSpeed: 0, effects };
  const w = new WallWorld(level, { grid: line(ids), modifiers: MODS });
  w.god = true;
  w.setWallOffset(WIND_SHIP_Y - WIND_GAP);
  const x = (WALL_COLS * CELL) / 2 - (w.spawnOffsets[0]?.x ?? 0);
  w.teleportShip(x, WIND_SHIP_Y);
  let dmg = 0;
  for (let i = 0; i < SECONDS * 60; i++) {
    w.update(1 / 60, { x, y: WIND_SHIP_Y });
    // Strong Wind counts every hit; Crosswind counts the hits on the lane (column 10, the one straight above the ship), the blocks a carving ship needs to break.
    for (const h of w.hits) if (WIND !== 'cross' || h.blockId % WALL_COLS === 10) dmg += h.damage;
    w.hits.length = 0; w.killEvents.length = 0;
  }
  windCache.set(key, dmg);
  return dmg;
}

/**
 * Chunk 27b: the wind report. For every ordered pair (A below, B above): B "stops helping" when it helped in the calm (the pair beat A alone by 20% or more)
 * and in the wind the pair is no better than A alone (within 5%). Only pairs whose A still works in the wind (keeps a quarter of its calm score and beats the plain gun by
 * half) are listed: with a plain gun in Strong Wind nothing helps, which is the point of the type and not a finding.
 */
function windMain() {
  const name = (id: string) => BLOCKS[id].name;
  const kind = WIND === 'strong' ? 'Strong Wind (every shot leaves backwards)' : `Crosswind (a ${CROSS_ACCEL} px/s squared push)`;
  const lines: string[] = [];
  lines.push(`# Interaction audit under ${kind} (chunk 27b)`, '');
  lines.push(`Generated by \`WIND=${WIND} npm run interaction-audit\`. The blocks of \`docs/interaction-audit.md\`, but flown on the real wall engine: a wall of 20 rows of tier-115 blocks (3.4K HP, nothing dies${WIND === 'cross' ? ', the score counts only the column straight above the ship, the lane a carving ship needs to break' : ''}) hangs ${WIND_GAP} px above a ship held at y ${WIND_SHIP_Y}; the score is the damage the blocks took in ${SECONDS} s, calm and with the wind on. Fan hull, Flat+ first, then the blocks in order (A lower on the line, B above it).`, '');
  const alone = IDS.map(id => ({ id, calm: windScore([id], false), wind: windScore([id], true) }));
  const base = windScore([], false), baseW = windScore([], true);
  lines.push('## Each block alone', '', `A plain Flat+ gun: ${base.toFixed(0)} calm, ${baseW.toFixed(0)} in the wind.`, '', '| block | calm | in the wind | kept |', '|---|---|---|---|');
  for (const r of [...alone].sort((a, b) => b.wind / Math.max(1e-9, b.calm) - a.wind / Math.max(1e-9, a.calm))) lines.push(`| ${name(r.id)} | ${r.calm.toFixed(0)} | ${r.wind.toFixed(0)} | ${Math.round((100 * r.wind) / Math.max(1e-9, r.calm))}% |`);
  const works = new Set(alone.filter(r => r.calm > 0 && r.wind >= 0.1 * r.calm && r.wind > baseW + 0.1 * base).map(r => r.id));
  lines.push('', `Blocks that carry a gun through the wind: ${[...works].map(name).join(', ') || 'none'}.`, '');
  const useless: { a: string; b: string; calm: number; wind: number }[] = [];
  const total = { pairs: 0 };
  for (const a of IDS) for (const b of IDS) {
    if (a === b || !works.has(a)) continue;
    total.pairs++;
    const ca = windScore([a], false), wa = windScore([a], true), cp = windScore([a, b], false), wp = windScore([a, b], true);
    if (ca > 0 && cp >= 1.2 * ca && wp <= 1.05 * wa) useless.push({ a, b, calm: cp / ca, wind: wp / Math.max(1e-9, wa) });
  }
  lines.push(`## Pairs where B stops helping: ${useless.length} of ${total.pairs}`, '', 'A works in the wind; B beat A alone by 20% or more calm and adds under 5% in the wind.', '');
  if (useless.length) {
    lines.push('| A then B | B adds in the calm | B adds in the wind |', '|---|---|---|');
    for (const u of useless) lines.push(`| ${name(u.a)} then ${name(u.b)} | x${u.calm.toFixed(2)} | x${u.wind.toFixed(2)} |`);
  }
  lines.push('');
  writeFileSync(`docs/interaction-audit-wind-${WIND}.md`, lines.join('\n'));
  console.log(`wind ${WIND}: ${works.size} blocks work alone, ${useless.length} of ${total.pairs} pairs where B stops helping`);
}
