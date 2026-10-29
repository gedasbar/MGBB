// Chunk 21b: where does a frame go? Flies the owner's slow build (scripts/lib/perfBuild.ts) headless in Free Fly (wave 15) and on the
// tier-100 wall, once with no instruments (the true cost of World.update) and once with every system wrapped in a timer, and prints
// milliseconds per frame by number of shots alive. Drawing is not in this script (no renderer in Node): see e2e/performance.e2e.cjs.
//   npm run perf-profile      (SECS=n seconds flown per run, default 40; MODE=ff|wall|both; BUILD=owner|light picks the circuit; OUT=name)
// Times of the wrapped methods are INCLUSIVE (steer includes the target search it calls) and carry about 0.1 us of timer cost per call,
// so read them as shares, not as exact milliseconds.
import { mkdirSync, writeFileSync } from 'fs';
import { World } from '../src/game/world';
import { WallWorld } from '../src/wall/wallWorld';
import { generateLevel } from '../src/wall/generator';
import { ProjectileSystem } from '../src/engine/projectiles';
import { EnemyField } from '../src/engine/targets';
import { SpatialHash } from '../src/engine/spatialHash';
import { Gun } from '../src/game/fire';
import { MitosisSystem } from '../src/engine/mitosis';
import { rng } from '../src/rng';
import { CONFIG } from '../src/config';
import { neutralModifiers } from '../src/captains/modifiers';
import { OWNER_BUILD, perfGrid, PerfBuild, topUp } from './lib/perfBuild';

const SECONDS = Number(process.env.SECS ?? 40);
const MODE = process.env.MODE ?? 'both';
const BUILD: PerfBuild = process.env.BUILD === 'light' ? { plusOne: 3, mirror: false, fork: false, bouncing: 2, homing: 3, extender: 2 } : OWNER_BUILD;
const DT = 1 / 60;
const BUCKETS = [0, 250, 750, 1500, 2500, 3500, 3900];
const bucketOf = (n: number) => { let b = 0; for (let k = 0; k < BUCKETS.length; k++) if (n >= BUCKETS[k]) b = k; return b; };
const bucketName = (k: number) => (k === BUCKETS.length - 1 ? `${BUCKETS[k]}+` : `${BUCKETS[k]}-${BUCKETS[k + 1]}`);

// ---- timers
const acc = new Map<string, number>();
const restore: (() => void)[] = [];
function wrap(obj: any, name: string, label: string) {
  const orig = obj[name];
  if (typeof orig !== 'function') return; // a method this version of the engine does not have
  obj[name] = function (this: any, ...args: any[]) {
    const t = performance.now();
    const r = orig.apply(this, args);
    acc.set(label, (acc.get(label) ?? 0) + performance.now() - t);
    return r;
  };
  restore.push(() => { obj[name] = orig; });
}
function instrument(fieldProto: any) {
  const P = ProjectileSystem.prototype as any;
  wrap(P, 'steer', 'steer (all steering + homing)');
  wrap(P, 'processField', 'processField (hit pipeline)');
  wrap(P, 'updateStatus', 'updateStatus');
  wrap(P, 'updateClouds', 'updateClouds');
  wrap(P, 'bounce', '  bounce (retarget)');
  wrap(P, 'sweep', '  sweep (fast shots)');
  wrap(P, 'chain', '  chain lightning');
  wrap(P, 'fork', '  fork spawn');
  wrap(P, 'stepPhase', '  orbit/boomerang/mine');
  wrap(P, 'scan', '  scan (modifier list read)');
  wrap(P, 'retire', 'retire');
  wrap(P, 'strike', '  strike (damage)');
  wrap(Gun.prototype, 'update', 'gun.update');
  wrap(Gun.prototype, 'fire', 'gun.fire (spawn)');
  wrap(fieldProto, 'hitCircle', '  field.hitCircle (collision)');
  wrap(fieldProto, 'collectNear', '  field.collectNear (homing search)');
  wrap(fieldProto, 'collectCircle', '  field.collectCircle (AoE, chain, orbit)');
  wrap(fieldProto, 'collectRect', '  field.collectRect');
  wrap(fieldProto, 'bounceInfo', '  field.bounceInfo');
  wrap(SpatialHash.prototype, 'query', '  spatialHash.query');
  wrap(SpatialHash.prototype, 'insert', '  spatialHash.insert');
  wrap(MitosisSystem.prototype, 'handleDeath', 'mitosis.handleDeath');
}

interface Frame { total: number; alive: number; targets: number; parts: Map<string, number> }
interface RunResult { frames: Frame[]; maxAlive: number }

function run(make: () => { step: () => void; alive: () => number; targets: () => number }, instrumented: boolean, fieldProto: any): RunResult {
  rng.reset(1);
  const sim = make();
  if (instrumented) instrument(fieldProto);
  const frames: Frame[] = [];
  let maxAlive = 0;
  const n = Math.round(SECONDS / DT);
  let prev = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    sim.step();
    const total = performance.now() - t;
    const parts = new Map<string, number>();
    if (instrumented) for (const [k, v] of acc) parts.set(k, v - (prev.get(k) ?? 0));
    prev = new Map(acc);
    const alive = sim.alive();
    maxAlive = Math.max(maxAlive, alive);
    frames.push({ total, alive, targets: sim.targets(), parts });
  }
  while (restore.length) restore.pop()!();
  acc.clear();
  return { frames, maxAlive };
}

const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * q))] : 0; };

/** One table: rows are the systems, columns the number of shots held in the air. */
function report(title: string, cols: { target: number; plain: RunResult; inst: RunResult }[]): string[] {
  const out: string[] = [`### ${title}`, ''];
  const mf = (r: RunResult) => r.frames.slice(60); // the first second is JIT warm-up
  out.push(`| | ${cols.map(c => c.target === 0 ? 'the circuit alone' : `pool held at >= ${c.target}`).join(' | ')} |`, `|---|${cols.map(() => '---').join('|')}|`);
  out.push(`| shots alive (mean) | ${cols.map(c => Math.round(mean(mf(c.plain).map(f => f.alive)))).join(' | ')} |`);
  out.push(`| targets alive (mean) | ${cols.map(c => Math.round(mean(mf(c.plain).map(f => f.targets)))).join(' | ')} |`);
  out.push(`| **whole update, no instruments: mean ms** | ${cols.map(c => mean(mf(c.plain).map(f => f.total)).toFixed(2)).join(' | ')} |`);
  out.push(`| whole update, p99 ms | ${cols.map(c => pct(mf(c.plain).map(f => f.total), 0.99).toFixed(2)).join(' | ')} |`);
  out.push(`| whole update, instrumented | ${cols.map(c => mean(mf(c.inst).map(f => f.total)).toFixed(2)).join(' | ')} |`);
  const labels = [...new Set(cols.flatMap(c => mf(c.inst).flatMap(f => [...f.parts.keys()])))];
  const rows = labels.map(l => ({ l, v: cols.map(c => mean(mf(c.inst).map(f => f.parts.get(l) ?? 0))) }));
  rows.sort((a, b) => Math.max(...b.v) - Math.max(...a.v));
  for (const r of rows) if (Math.max(...r.v) >= 0.01) out.push(`| ${r.l.replace(/^ +/, m => '&nbsp;'.repeat(m.length))} | ${r.v.map(v => v.toFixed(2)).join(' | ')} |`);
  out.push('');
  return out;
}

const FF_TARGETS = (process.env.FF_TARGETS ?? '0,2500,4000').split(',').map(Number);
const WALL_TARGETS = (process.env.WALL_TARGETS ?? '0,1000,2000,4000').split(',').map(Number);
const lines: string[] = [`## Profile (${SECONDS} s flown per column, headless Node, one thread; a phone is several times slower)`, '', `Build: ${JSON.stringify(BUILD)}. Mean milliseconds per frame (one \`update\` step); indented rows are inside the row above them (inclusive times).`, ''];

if (MODE === 'ff' || MODE === 'both') {
  const pointer = { x: CONFIG.VIEW.W / 2, y: CONFIG.VIEW.H * 0.85, active: false, type: 'mouse', seen: true };
  const makeFor = (target: number) => () => {
    const w = new World({ grid: perfGrid(BUILD), seed: 1, startWave: 15 });
    w.god = true; w.hull = 1e12;
    return {
      step: () => { if (target > 0) topUp(w, target); w.update(DT, pointer); w.hits.length = 0; w.splits.length = 0; w.killEvents.length = 0; w.waveEvents.length = 0; },
      alive: () => w.pool.count, targets: () => w.mitosis.enemies.length,
    };
  };
  const cols = FF_TARGETS.map(t => ({ target: t, plain: run(makeFor(t), false, EnemyField.prototype), inst: run(makeFor(t), true, EnemyField.prototype) }));
  lines.push(...report('Free Fly, wave 15 start', cols));
}

if (MODE === 'wall' || MODE === 'both') {
  let proto: any = null;
  const makeFor = (target: number) => () => {
    const level = { ...generateLevel(100), approachSpeed: 0 };
    const w = new WallWorld(level, { grid: perfGrid(BUILD) });
    w.god = true;
    w.setWallOffset(430); // the wall's lower edge sits 430 px down the screen, in front of the guns
    proto = Object.getPrototypeOf(w.field);
    const ship = { x: w.worldW / 2, y: 780 };
    return {
      step: () => { if (target > 0) topUp(w, target); w.update(DT, ship); w.hits.length = 0; w.killEvents.length = 0; },
      alive: () => w.pool.count, targets: () => w.alive,
    };
  };
  makeFor(0)();
  const cols = WALL_TARGETS.map(t => ({ target: t, plain: run(makeFor(t), false, proto), inst: run(makeFor(t), true, proto) }));
  lines.push(...report(`Wall tier 100 (${generateLevel(100).cells.filter(Boolean).length} blocks, held still in front of the guns)`, cols));
}

const text = lines.join('\n');
mkdirSync('reports/chunk21b', { recursive: true });
writeFileSync(`reports/chunk21b/${process.env.OUT ?? 'profile'}.md`, text);
console.log(text);
