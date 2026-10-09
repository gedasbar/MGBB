// Prints the wall balance table: size, HP, credits and how long the sweeping bot needs with the DEFAULT circuit.
// The default circuit fires straight up from the ship (one 101-damage shot, 4 pulses a second), so late tiers are
// out of its reach on purpose: the "est." column is the ideal time (every shot lands, no overkill waste).
// Run: npm run balance-wall
import { buildStarterGrid } from '../src/game/starter';
import { compile } from '../src/engine/compiler';
import { CONFIG } from '../src/config';
import { DEFAULT_APPROACH_SPEED, STOP_LINE_Y } from '../src/wall/constants';
import { blockHp, makeTestWall, rewardPerBlock, totalHp } from '../src/wall/level';
import { DEFAULT_BOT, simulateWall } from '../src/wall/sim';

/** Placeholder size curve: 8 rows at tier 1 growing linearly to 41 rows at tier 100 (the real generator is chunk 6b). */
export const rowsForTier = (tier: number) => Math.round(8 + ((tier - 1) * (41 - 8)) / 99);

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
