// Chunk 27b: do the strong builds beat the five effect types? (docs/tiers-101-200-effects.md). READ-ONLY for game code.
//   npx vite-node scripts/effect-types-bots.ts            first tier of each type (rank 1) with builds B and C of chunk 27a
//   RANKS=1,2,3,4,5 TYPES=fog,regrowth npx vite-node scripts/effect-types-bots.ts
//   WIND=1 npx vite-node scripts/effect-types-bots.ts     Strong Wind with the motion-block variants
// Builds are the tall-hull builds of chunk 27a (docs/tiers-101-200.md section 7): `plus` +1 Projectile, 3 Flat+ L10, 10 Percent x L10, hero level 21, then a
// Splitter 3 into the side ejectors. Motion blocks are placed right after the first Flat+, so every shot passes them. The pilots are the carve and clear-all bots
// of src/wall/sim.ts: blunt (they never weave, never dodge).
import { parseLayout } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { Grid } from '../src/engine/compiler';
import { generateLevel } from '../src/wall/generator';
import { simulateWall } from '../src/wall/sim';
import { LATE_TYPES, lateSlot, lateTypeTiers, LateType } from '../src/data/lateTiers';
import { neutralModifiers } from '../src/captains/modifiers';
import { heroDamage } from './lib/difficultyModel';

const TALL = 40;
const times = (id: string, n: number) => Array.from({ length: n }, () => id);

export function tallBuild(plus: number, flats: number, pcts: number, motion: string[] = []): Grid {
  const rows = ['.E..E..E.'];
  for (let r = 2; r < TALL; r++) rows.push('_________');
  rows.push('....G....');
  const g = parseLayout(rows);
  const pre: [string, number][] = [];
  place(g, 5, TALL - 1, 'flat_plus', 10);
  for (const id of motion) pre.push([id, 1]);
  for (let k = 0; k < plus; k++) pre.push(['plus_one', 1]);
  for (let k = 0; k < flats - 1; k++) pre.push(['flat_plus', 10]);
  for (let k = 0; k < pcts; k++) pre.push(['percent_mult', 10]);
  pre.forEach(([id, lv], k) => place(g, 5, TALL - 2 - k, id, lv));
  const row = TALL - 2 - pre.length;
  place(g, 5, row, 'splitter_3'); place(g, 2, row, 'turn_r'); place(g, 8, row, 'turn_l');
  return g;
}

const mods = { ...neutralModifiers(), baseDamage: 1 + heroDamage(21) };
const WIND_VARIANTS: [string, string[]][] = [
  ['none', []], ['Upturn x2', times('upturn', 2)], ['Upturn x3', times('upturn', 3)], ['Brake x3 + Curving x4', [...times('brake', 3), ...times('curving_left', 4)]],
  ['Ship Magnet x3', times('magnetized', 3)], ['Orbit', ['orbit']], ['Boomerang', ['boomerang']],
];
const typesArg = (process.env.TYPES ?? 'strong_wind,crosswind,fog,regrowth,mitosis_wall').split(',') as LateType[];
const ranks = (process.env.RANKS ?? '1').split(',').map(Number);
const state = (s: string) => (s === 'cleared' ? 'C' : s === 'passed' ? 'P' : s === 'crashed' ? 'x' : 't');

for (const type of typesArg) {
  for (const rank of ranks) {
    const tier = lateTypeTiers().find(t => lateSlot(t)!.type === type && lateSlot(t)!.rank === rank);
    if (!tier) continue;
    const l = generateLevel(tier);
    console.log(`\n${LATE_TYPES[type].name} rank ${rank}, tier ${tier} (${JSON.stringify(l.effects)})`);
    const variants = type === 'strong_wind' && process.env.WIND ? WIND_VARIANTS : [['plain', []] as [string, string[]]];
    for (const [vn, motion] of variants) {
      for (const [bn, plus] of [['B', 0], ['C', 6]] as const) {
        const carve = simulateWall(l, tallBuild(plus, 3, 10, motion), 'carve', { modifiers: mods, maxTime: 200 });
        const clear = simulateWall(l, tallBuild(plus, 3, 10, motion), 'clearAll', { modifiers: mods, maxTime: 200 });
        console.log(`  ${vn.padEnd(22)} build ${bn}: carve ${state(carve.state)} ${carve.destroyed}/${carve.total} (${carve.time.toFixed(0)}s)  clearAll ${state(clear.state)} ${clear.destroyed}/${clear.total} (${clear.time.toFixed(0)}s)`);
      }
    }
  }
}
