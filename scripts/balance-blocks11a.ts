// Chunk 11a balance: the 9 new blocks (and Bouncing) against a second Flat+, on fixed Free Fly fields, plus the Free Fly bot.
// Run: npm run balance-blocks
//
// Part 1, "fixed field". A Twin (Flat+ L1 next to the generator, the block under test next to the ejector) sweeps left and
// right over a field of enemies placed at wave 10's strength (tier 25, x1.08^9 HP) and the run ends when none is left (cap
// FIELD_CAP s). Four fields: a Mother wave (2 Mothers), Ironclads (armored), Wardens (shielded) and a Swarm (Darters and
// pebbles). For each: how much faster than the bare Twin + Flat+ the block clears it, as a share of what a SECOND Flat+ gains:
// 1.00 = as good as a second Flat+, 3.00 and up or 0.30 and down is flagged. The same for credits per second of clearing.
// The Random Router is a routing block: it is compared on a Fan against the same circuit with a Splitter 2 (as balance-econ does).
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
const FIELD_CAP = 90;
const DT = 1 / 60;
const SWEEP = { amp: 150, period: 6 };
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
const FIELDS: Record<string, Spawn[]> = {
  'Mother wave': [{ id: 'mother', x: 235 }, { id: 'mother', x: 305 }],
  Ironclad: [{ id: 'ironclad', x: 200 }, { id: 'ironclad', x: 270 }, { id: 'ironclad', x: 340 }],
  Warden: [{ id: 'warden', x: 200 }, { id: 'warden', x: 270 }, { id: 'warden', x: 340 }],
  Swarm: [
    ...Array.from({ length: 8 }, (_, i) => ({ id: 'darter', x: 150 + i * 34 })),
    ...Array.from({ length: 12 }, (_, i) => ({ id: 'mitotic_rock', x: 140 + i * 24, generation: PEBBLE_GENERATION, radius: PEBBLE_RADIUS })),
  ],
};

interface Clear { time: number; credits: number }
/** Runs one field to the end: seconds until no enemy is left (FIELD_CAP at most) and the credits earned. */
function clearField(grid: Grid, field: Spawn[], seed: number): Clear {
  rng.reset(seed);
  const w = new World({ grid, autoSpawn: false, seed, startWave: WAVE });
  w.hull = 1e9;
  const tier = w.tier;
  const hpMul = waveHpMul(WAVE);
  for (const s of field) {
    const sp = SPECIES[s.id];
    const gen = s.generation ?? 1;
    const hp = rockHp(tier) * sp.hpMul * hpMul * (gen > 1 ? Math.pow(0.55, gen - 1) : 1);
    w.spawnSpecies(s.id, s.x, -(s.radius ?? sp.radius), { hp, radius: s.radius, generation: gen });
  }
  const p = { x: 270, y: 768, active: false, type: 'mouse' as const, seen: true };
  let t = 0;
  while (t < FIELD_CAP && (w.mitosis.enemies.length > 0 || t < 0.5)) {
    p.x = 270 + SWEEP.amp * Math.sin((2 * Math.PI * t) / SWEEP.period);
    w.update(DT, p);
    t += DT;
  }
  return { time: t, credits: w.creditsExact };
}
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** Mean over the seeds. */
const cleared = (grid: Grid, field: Spawn[]): Clear => {
  const rs = SEEDS.map(s => clearField(grid, field, s));
  return { time: mean(rs.map(r => r.time)), credits: mean(rs.map(r => r.credits)) };
};

const flag = (r: number) => (r > FLAG_HI ? 'HIGH' : r < FLAG_LO ? 'LOW' : '');
const f2 = (n: number) => n.toFixed(2).padStart(6);

export interface Row { id: string; level: number; speed: Record<string, number>; credit: Record<string, number> }
export function fieldTable(level = 1): Row[] {
  const rows: Row[] = [];
  const names = Object.keys(FIELDS);
  const base: Record<string, Clear> = {}, flat2: Record<string, Clear> = {}, splitter: Record<string, Clear> = {};
  for (const n of names) {
    base[n] = cleared(twinWith(null), FIELDS[n]);
    const g = twinWith('flat_plus'); flat2[n] = cleared(g, FIELDS[n]);
    splitter[n] = cleared(fanWith('splitter_2'), FIELDS[n]);
  }
  for (const id of [...TWIN_BLOCKS, 'random_router']) {
    const row: Row = { id, level, speed: {}, credit: {} };
    for (const n of names) {
      const router = id === 'random_router';
      const c = cleared(router ? fanWith(id, level) : twinWith(id, level), FIELDS[n]);
      const rate = (x: Clear) => x.credits / x.time;
      if (router) {
        // Against the same Fan with a Splitter 2.
        row.speed[n] = splitter[n].time / c.time;
        row.credit[n] = rate(c) / rate(splitter[n]);
      } else {
        // The block's gain over the bare Twin + Flat+, as a share of a second Flat+'s gain.
        const gain = (x: Clear) => base[n].time / x.time - 1;
        row.speed[n] = gain(c) / Math.max(1e-9, gain(flat2[n]));
        row.credit[n] = (rate(c) - rate(base[n])) / Math.max(1e-9, rate(flat2[n]) - rate(base[n]));
      }
    }
    rows.push(row);
  }
  return rows;
}

function print(rows: Row[], title: string) {
  const names = Object.keys(FIELDS);
  console.log(`\n${title}`);
  console.log(`block              | ${names.map(n => n.padStart(11)).join(' | ')} | flags`);
  for (const r of rows) {
    const vals = names.map(n => r.speed[n]);
    const flags = names.map((n, i) => (flag(vals[i]) ? `${n}:${flag(vals[i])}` : '')).filter(Boolean).join(' ');
    console.log(`${(BLOCKS[r.id].name + (r.level > 1 ? ' L' + r.level : '')).padEnd(18)} | ${vals.map(v => f2(v).padStart(11)).join(' | ')} | ${flags}`);
  }
}

if (process.argv[1]?.includes('balance-blocks11a')) {
  console.log(`Fixed fields at wave ${WAVE} strength (tier ${1 + Math.floor(((WAVE - 1) * 40) / 15)}, HP x${waveHpMul(WAVE).toFixed(2)}); Twin sweeping +-${SWEEP.amp} px; mean of ${SEEDS.length} seeds; cap ${FIELD_CAP} s.`);
  console.log('Cell = the block\'s speed-up in clearing the field, as a share of the speed-up of a SECOND Flat+ (1.00 = as good as a Flat+). Random Router: clear speed against the same Fan with a Splitter 2.');
  const l1 = fieldTable(1);
  print(l1, 'CLEAR SPEED, level 1');
  const l5 = fieldTable(5);
  print(l5, 'CLEAR SPEED, level 5');
  const names = Object.keys(FIELDS);
  console.log('\nCREDITS PER SECOND OF CLEARING, level 1 (same convention)');
  console.log(`block              | ${names.map(n => n.padStart(11)).join(' | ')}`);
  for (const r of l1) console.log(`${BLOCKS[r.id].name.padEnd(18)} | ${names.map(n => f2(r.credit[n]).padStart(11)).join(' | ')}`);

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
