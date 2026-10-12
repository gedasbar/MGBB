// Chunk 11a balance: the 9 new blocks (and Bouncing) against a second Flat+, on fixed Free Fly fields, plus the Free Fly bot.
// Run: npm run balance-blocks
//
// Part 1, "fixed field". A Twin (Flat+ L1 next to the generator, the block under test next to the ejector), its ship kept under
// the lowest enemy (so nearly every shot lands and a block's effect is not lost in aiming noise), faces a field of enemies placed
// at wave 10's full strength (tier 25 numbers; the enemies hover instead of falling, so none leaks before the field is cleared). The
// score is the CLEAR SPEED (1 / seconds until none is left; mean over three seeds), except for the Swarm, whose Darters
// fly off the screen in 6 s: there it is the credits earned by then. Four fields: a Mother wave, Ironclads (armored), Wardens
// (shielded) and a Swarm (Darters and pebbles). Cell = the block's gain over the bare Twin + Flat+ as a share of what a SECOND
// Flat+ gains: 1.00 = as good as a second Flat+; 3.00 and up or 0.30 and down is flagged (a block that LOSES speed shows a
// negative number). The Random Router is a routing block: its score is the same measure against the same Fan with a Splitter 2.
// A second table gives credits per second of clearing: blocks like Cauterize and Fission clear faster but pay less.
// Part 2: the bot (src/debug/freeflyBot.ts) flies a Twin + Flat+ + each block for 3 minutes on a few seeds: wave and credits.
import { World } from '../src/game/world';
import { buildFanGrid, buildTwinGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import type { Grid } from '../src/engine/compiler';
import { rng } from '../src/rng';
import { rockHp } from '../src/econ/economy';
import { PEBBLE_GENERATION, PEBBLE_RADIUS, waveHpMul } from '../src/data/waves';
import { botRun } from '../src/debug/freeflyBot';
import { BLOCKS } from '../src/data/blocks';
import { SPECIES } from '../src/data/species';

const WAVE = 10;
const DT = 1 / 60;
/** Ship speed of the tracking pilot (px/s). */
const TRACK_SPEED = 650;
const FLAG_HI = 3;
const FLAG_LO = 0.3;
const SEEDS = [1, 2, 3];

const NEW = ['fission_catalyst', 'cauterize', 'cleaver', 'culling_bolt', 'residue_seed', 'overkill_spill', 'gravity_well', 'static_charge'];
const TWIN_BLOCKS = [...NEW, 'bouncing'];

const twinWith = (id: string | null, level = 1): Grid => {
  const g = buildTwinGrid();
  place(g, 1, 3, 'flat_plus');
  if (id) place(g, 1, 2, id, level);
  return g;
};
const fanWith = (center: string, level = 1): Grid => {
  const g = buildFanGrid();
  place(g, 5, 9, center, level);
  place(g, 2, 9, 'turn_r'); place(g, 8, 9, 'turn_l');
  place(g, 2, 5, 'flat_plus'); place(g, 8, 5, 'flat_plus');
  return g;
};

type Spawn = { id: string; x: number; generation?: number; radius?: number };
/** A field: what spawns and how much of wave 10's HP it carries. `horizon` > 0: score the credits by then instead of the clear time. */
interface Field { spawns: Spawn[]; hp: number; horizon: number }
const FIELDS: Record<string, Field> = {
  'Mother wave': { spawns: [{ id: 'mother', x: 270 }], hp: 1, horizon: 0 },
  Ironclad: { spawns: [{ id: 'ironclad', x: 200 }, { id: 'ironclad', x: 270 }, { id: 'ironclad', x: 340 }], hp: 1, horizon: 0 },
  Warden: { spawns: [{ id: 'warden', x: 200 }, { id: 'warden', x: 270 }, { id: 'warden', x: 340 }], hp: 1, horizon: 0 },
  Swarm: {
    spawns: [
      ...Array.from({ length: 8 }, (_, i) => ({ id: 'darter', x: 150 + i * 34 })),
      ...Array.from({ length: 12 }, (_, i) => ({ id: 'mitotic_rock', x: 140 + i * 24, generation: PEBBLE_GENERATION, radius: PEBBLE_RADIUS })),
    ],
    hp: 0.3, horizon: 6,
  },
};
const CAP = 400;
/** Fall speed of every species in the clear-time fields (px/s): they hover over the ship so none leaks. */
const HOVER = 3;

interface Result { speed: number; credits: number }
/** One field with one grid, mean over the seeds: speed (1 / s, or credits for the horizon fields) and credits per second. */
function run(grid: Grid, field: Field): Result {
  const speeds: number[] = [], rates: number[] = [];
  const saved = Object.values(SPECIES).map(sp => sp.speed);
  if (field.horizon === 0) for (const sp of Object.values(SPECIES)) sp.speed = HOVER;
  for (const seed of SEEDS) {
    rng.reset(seed);
    const w = new World({ grid, autoSpawn: false, seed, startWave: WAVE });
    w.hull = 1e9;
    const hpMul = waveHpMul(WAVE) * field.hp;
    for (const s of field.spawns) {
      const sp = SPECIES[s.id];
      const gen = s.generation ?? 1;
      const hp = rockHp(w.tier) * sp.hpMul * hpMul * (gen > 1 ? Math.pow(0.55, gen - 1) : 1);
      w.spawnSpecies(s.id, s.x, -(s.radius ?? sp.radius), { hp, radius: s.radius, generation: gen });
    }
    const p = { x: 270, y: 768, active: false, type: 'mouse' as const, seen: true };
    let t = 0;
    const end = field.horizon > 0 ? field.horizon : CAP;
    while (t < end && (field.horizon > 0 || w.mitosis.enemies.length > 0 || t < 0.5)) {
      // The pilot: under the lowest enemy that is still above the ship.
      let aim = p.x, low = -Infinity;
      for (const e of w.mitosis.enemies) if (e.y < 740 && e.y > low) { low = e.y; aim = e.x; }
      p.x += Math.max(-TRACK_SPEED * DT, Math.min(TRACK_SPEED * DT, aim - p.x));
      w.update(DT, p);
      t += DT;
    }
    speeds.push(field.horizon > 0 ? w.creditsExact : 1 / t);
    rates.push(w.creditsExact / t);
  }
  Object.values(SPECIES).forEach((sp, i) => { sp.speed = saved[i]; });
  return { speed: mean(speeds), credits: mean(rates) };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

const flag = (r: number) => (r > FLAG_HI ? 'HIGH' : r < FLAG_LO ? 'LOW' : '');
const f2 = (n: number) => n.toFixed(2).padStart(6);

export interface Row { id: string; level: number; score: Record<string, number>; credit: Record<string, number> }
export function fieldTable(level = 1): { rows: Row[]; ref: Record<string, { base: Result; flat2: Result }> } {
  const rows: Row[] = [];
  const names = Object.keys(FIELDS);
  const ref: Record<string, { base: Result; flat2: Result }> = {};
  const splitter: Record<string, Result> = {};
  for (const n of names) {
    ref[n] = { base: run(twinWith(null), FIELDS[n]), flat2: run(twinWith('flat_plus'), FIELDS[n]) };
    splitter[n] = run(fanWith('splitter_2'), FIELDS[n]);
  }
  for (const id of [...TWIN_BLOCKS, 'random_router']) {
    const row: Row = { id, level, score: {}, credit: {} };
    for (const n of names) {
      const r = run(id === 'random_router' ? fanWith(id, level) : twinWith(id, level), FIELDS[n]);
      if (id === 'random_router') { row.score[n] = r.speed / splitter[n].speed; row.credit[n] = r.credits / splitter[n].credits; }
      else {
        const { base, flat2 } = ref[n];
        row.score[n] = (r.speed / base.speed - 1) / Math.max(1e-9, flat2.speed / base.speed - 1);
        row.credit[n] = r.credits / base.credits;
      }
    }
    rows.push(row);
  }
  return { rows, ref };
}

function print(rows: Row[], title: string) {
  const names = Object.keys(FIELDS);
  console.log(`\n${title}`);
  console.log(`block               | ${names.map(n => n.padStart(11)).join(' | ')} | flags`);
  for (const r of rows) {
    const vals = names.map(n => r.score[n]);
    const flags = names.map((n, i) => (flag(vals[i]) ? `${n}:${flag(vals[i])}` : '')).filter(Boolean).join(' ');
    console.log(`${(BLOCKS[r.id].name + (r.level > 1 ? ' L' + r.level : '')).padEnd(19)} | ${vals.map(v => f2(v).padStart(11)).join(' | ')} | ${flags}`);
  }
}

{
  console.log(`Fixed fields (wave ${WAVE} mix, tier ${1 + Math.floor(((WAVE - 1) * 40) / 15)}); a Twin tracks the lowest enemy; clear speed (Swarm: credits by 6 s, falling at the normal speed); mean of ${SEEDS.length} seeds.`);
  console.log("Cell = the block's gain over a bare Twin + Flat+ as a share of the gain of a SECOND Flat+ (1.00 = as good as a Flat+; negative = slower than without it). Random Router: credits against the same Fan with a Splitter 2.");
  const l1 = fieldTable(1);
  console.log('Reference (bare Twin + Flat+ / with a second Flat+): ' + Object.entries(l1.ref).map(([n, r]) => FIELDS[n].horizon > 0 ? `${n} ${r.base.speed.toFixed(1)} / ${r.flat2.speed.toFixed(1)} credits` : `${n} ${(1 / r.base.speed).toFixed(1)} s / ${(1 / r.flat2.speed).toFixed(1)} s`).join(', '));
  print(l1.rows, 'FIELD SCORE, level 1');
  const l5 = fieldTable(5);
  print(l5.rows, 'FIELD SCORE, level 5');
  const names0 = Object.keys(FIELDS);
  console.log('\nCREDITS PER SECOND OF CLEARING, level 1, as a multiple of the bare Twin + Flat+ (Random Router: of the Splitter Fan)');
  console.log(`block               | ${names0.map(n => n.padStart(11)).join(' | ')}`);
  for (const r of l1.rows) console.log(`${BLOCKS[r.id].name.padEnd(19)} | ${names0.map(n => f2(r.credit[n]).padStart(11)).join(' | ')}`);

  // ---- Part 2: the bot, 3 minutes, Twin + Flat+ + the block.
  console.log(`\nFREE FLY BOT, Twin + Flat+ + block, 3 minutes, mean of ${SEEDS.length} seeds (a run that ends earlier counts its last wave and credits)`);
  console.log('circuit                       | wave @3 min | credits @3 min | survived');
  const circuits: [string, () => Grid][] = [['Twin + Flat+ (baseline)', () => twinWith(null)], ['Twin + 2 Flat+', () => twinWith('flat_plus')],
    ...TWIN_BLOCKS.map(id => [`Twin + Flat+ + ${BLOCKS[id].name}`, () => twinWith(id)] as [string, () => Grid]),
    ['Fan: Random Router, 2 Flat+', () => fanWith('random_router')], ['Fan: Splitter 2, 2 Flat+', () => fanWith('splitter_2')]];
  for (const [name, make] of circuits) {
    const runs = SEEDS.map(seed => { rng.reset(seed); return botRun(new World({ grid: make(), seed }), 180, [180]); });
    const at = runs.map(r => r.at[180] ?? { wave: r.wave, credits: r.credits });
    console.log(`${name.padEnd(29)} | ${mean(at.map(a => a.wave)).toFixed(1).padStart(11)} | ${mean(at.map(a => a.credits)).toFixed(0).padStart(14)} | ${mean(runs.map(r => r.time)).toFixed(0)} s`);
  }
}
