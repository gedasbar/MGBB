// Prints the wall balance table: size, HP, credits and how long the sweeping bot needs with the DEFAULT circuit.
// The default circuit fires straight up from the ship (one 101-damage shot, 4 pulses a second), so late tiers are
// out of its reach on purpose: the "est." column is the ideal time (every shot lands, no overkill waste).
// Run: npm run balance-wall
import { buildStarterGrid } from '../src/game/starter';
import { compile } from '../src/engine/compiler';
import { CONFIG } from '../src/config';
import { DEFAULT_APPROACH_SPEED, STOP_LINE_Y } from '../src/wall/constants';
import { blockHp, makeTestWall, rewardPerBlock, rowsForTier, totalHp } from '../src/wall/level';
import { DEFAULT_BOT, simulateWall } from '../src/wall/sim';


const grid = buildStarterGrid();
const stats = compile(grid).stats;
const shotDmg = stats.damagePerShot;
const shotsPerSec = CONFIG.PULSE.BASE_RATE * stats.projectilesPerPulse;
const MAX_SIM = 300;

console.log(`Default circuit: ${shotDmg} damage per shot, ${shotsPerSec} shots/s (straight up from the ship). Bot: sweeps at ${DEFAULT_BOT.speed} px/s, `
  + `dwell ${DEFAULT_BOT.dwell}s at each end. Approach speed ${DEFAULT_APPROACH_SPEED} px/s, stop line y ${STOP_LINE_Y.toFixed(1)}, `
  + `so an idle wall touches the line after ${(STOP_LINE_Y / DEFAULT_APPROACH_SPEED).toFixed(1)} s.\n`);
console.log('Tier | rows | blocks | block HP | total HP | credits (full clear) | est. ideal time | bot clear, hull kept full | bot, drain on');
for (const tier of [1, 10, 25, 50, 100]) {
  const rows = rowsForTier(tier);
  const level = makeTestWall({ tier, rows, approachSpeed: DEFAULT_APPROACH_SPEED });
  const blocks = rows * 21;
  const hp = blockHp(tier);
  const shotsPerBlock = Math.ceil(hp / shotDmg);
  const est = (blocks * shotsPerBlock) / shotsPerSec;
  const keep = simulateWall(level, grid, DEFAULT_BOT, { immortal: true, maxTime: MAX_SIM });
  const mortal = simulateWall(level, grid, DEFAULT_BOT, { maxTime: MAX_SIM });
  const fmt = (r: ReturnType<typeof simulateWall>) =>
    r.state === 'won' ? `${r.time.toFixed(1)} s` : `not within ${MAX_SIM} s (${((r.destroyed / r.total) * 100).toFixed(0)}% destroyed)`;
  const mort = mortal.state === 'won' ? `won in ${mortal.time.toFixed(1)} s`
    : mortal.state === 'lost' ? `lost at ${mortal.time.toFixed(1)} s (${((mortal.destroyed / mortal.total) * 100).toFixed(0)}% destroyed)` : `alive at ${MAX_SIM} s`;
  console.log(`${String(tier).padStart(4)} | ${String(rows).padStart(4)} | ${String(blocks).padStart(6)} | ${hp.toFixed(0).padStart(8)} | ${totalHp(level).toFixed(0).padStart(8)} | `
    + `${(blocks * rewardPerBlock(tier)).toFixed(1).padStart(20)} | ${(est.toFixed(0) + ' s').padStart(14)} | ${fmt(keep).padEnd(34)} | ${mort}`);
}

// ---- Campaign pacing (chunk 6b): the real generated levels.
import { generateLevel } from '../src/wall/generator';

const starterDps = stats.estDps;
const effHp = (l: ReturnType<typeof generateLevel>) =>
  l.cells.reduce((s, c) => s + (c ? c.shield + c.hp * (1 + c.armor / 10) : 0), 0); // armor 10 halves direct damage
const clearCredits = (t: number) => generateLevel(t).cells.filter(Boolean).length * rewardPerBlock(t);
let cumulative = 0;
const cum: number[] = [0];
for (let t = 1; t <= 100; t++) { cumulative += clearCredits(t); cum[t] = cumulative; }

console.log(`\nCampaign pacing. Starter gun: est. ${starterDps.toFixed(0)} DPS. "Needed DPS" = effective wall HP (armor counts double, shields added) / 60 s.`);
console.log('Tier | name            | spike | blocks | wall HP  | effective HP | idle line | needed DPS | ratio  | credits from tiers before');
const show = (t: number) => {
  const l = generateLevel(t);
  const eff = effHp(l);
  const needed = eff / 60;
  console.log(`${String(t).padStart(4)} | ${String(l.name).padEnd(15)} | ${l.spike ? ' yes ' : '  -  '} | ${String(l.cells.filter(Boolean).length).padStart(6)} | ${totalHp(l).toFixed(0).padStart(8)} | ${eff.toFixed(0).padStart(12)} | ${(STOP_LINE_Y / l.approachSpeed).toFixed(1).padStart(8)}s | ${needed.toFixed(0).padStart(10)} | ${(needed / starterDps).toFixed(2).padStart(6)} | ${cum[t - 1].toFixed(0).padStart(10)}`);
};
for (const t of [1, 5, 10, 20, 30, 50, 75, 100]) show(t);
console.log('\nRatio (needed DPS / starter DPS) for every tier 1-30, spikes marked *:');
console.log(Array.from({ length: 30 }, (_, i) => { const l = generateLevel(i + 1); return `${i + 1}${l.spike ? '*' : ''}:${(effHp(l) / 60 / starterDps).toFixed(2)}`; }).join('  '));
