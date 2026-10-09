// Prints the block audit table (Markdown) from the real block data.
// Run: npx vite-node scripts/block-audit.ts > reports/block-audit.md
import { BLOCKS } from '../src/data/blocks';

/** Test names in tests/blockAudit.test.ts that cover each visible block. */
const COMPILES: Record<string, string> = {
  turn_l: 'compiles: turn_l sends the line left',
  turn_r: 'compiles: turn_r sends the line right',
  splitter_2: 'compiles: splitter_2 makes a left and a right branch only',
  splitter_3: 'compiles: splitter_3 makes left, forward and right branches',
  flat_plus: 'compiles: flat_plus adds 100',
  percent_mult: 'compiles: percent_mult multiplies by 1.5 in path order',
  lucky_strike: 'compiles: lucky_strike adds a 33% x2 gate without changing the deterministic damage',
  jackpot: 'compiles: jackpot adds a 4% x10 gate',
  gamblers_gate: 'compiles: gamblers_gate adds a 50% x3-or-lose gate',
  piercing: 'compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet',
  bouncing: 'compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet',
  aoe_circle: 'compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet',
  shield_breaker: 'compiles: piercing, bouncing, aoe_circle and shield_breaker tag the packet',
  pure_converter: 'compiles: pure_converter makes 15% of the damage pure',
  armor_piercer: 'hiddenBlocks: armor_piercer: compile',
  curving_right: 'hiddenBlocks: curving_right: compile',
  homing: 'hiddenBlocks: homing: compile',
  random_curve: 'hiddenBlocks: random_curve: compile',
  aoe_rect: 'hiddenBlocks: aoe_rect: compile',
  fork_impact: 'hiddenBlocks: fork_impact: compile',
};
const FLY: Record<string, string> = {
  turn_l: 'fly: turn_l and turn_r change whether the ship fires at all',
  turn_r: 'fly: turn_l and turn_r change whether the ship fires at all',
  splitter_2: 'fly: splitter_2 and splitter_3 change the number of projectiles per pulse',
  splitter_3: 'fly: splitter_2 and splitter_3 change the number of projectiles per pulse (+ e2e: 3 projectiles in every pulse)',
  flat_plus: 'fly: flat_plus and percent_mult change the damage of the fired projectile',
  percent_mult: 'fly: flat_plus and percent_mult change the damage of the fired projectile',
  lucky_strike: 'fly: lucky_strike doubles the damage of about 33% of the shots',
  jackpot: 'fly: jackpot multiplies the damage of about 4% of the shots by ten',
  gamblers_gate: 'fly: gamblers_gate loses about half the projectiles and triples the rest',
  piercing: 'fly: piercing lets the projectile survive a hit (baseline: it is destroyed)',
  bouncing: 'fly: bouncing ricochets off an armored enemy (baseline: destroyed)',
  aoe_circle: 'fly: aoe_circle also damages a neighbouring enemy (baseline: only the one hit)',
  shield_breaker: 'fly: shield_breaker strips more shield and deals more damage than the same shot without it',
  pure_converter: 'fly: pure_converter ignores armor, so an armored enemy takes more damage',
  armor_piercer: 'hiddenBlocks: armor_piercer: fly (x2 vs armored, unchanged vs unarmored)',
  curving_right: 'hiddenBlocks: curving_right: fly (heading turns 45 deg in 0.5 s, baseline straight)',
  homing: 'hiddenBlocks: homing: fly (hits an enemy 20 deg off-axis, baseline misses)',
  random_curve: 'hiddenBlocks: random_curve: fly (seeded, deterministic, max 120 deg/s)',
  aoe_rect: 'hiddenBlocks: aoe_rect: fly (hits neighbours inside the bar only)',
  fork_impact: 'hiddenBlocks: fork_impact: fly (2 copies at 50% / 0.6x, +/-35 deg, no second fork)',
};

const esc = (s: string) => s.replace(/\|/g, '\\|');
const rows: string[] = ['| id | compiles correctly (test) | changes projectiles in Fly (test) | shown in picker |', '|---|---|---|---|'];
for (const b of Object.values(BLOCKS)) {
  if (b.shown) {
    rows.push(`| \`${b.id}\` | ${esc(COMPILES[b.id] ?? '**MISSING**')} | ${esc(FLY[b.id] ?? '**MISSING**')} | **Y** |`);
  } else {
    rows.push(`| \`${b.id}\` | - | - | N: ${esc(b.hideReason ?? 'no reason recorded')} |`);
  }
}
const shown = Object.values(BLOCKS).filter(b => b.shown).length;
rows.push('', `${shown} of ${Object.keys(BLOCKS).length} blocks are shown in the picker; the rest stay in the data and are hidden.`);
console.log(rows.join('\n'));
