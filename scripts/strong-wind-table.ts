// Chunk 27b: how every motion block behaves under Strong Wind (docs/strong-wind.md). READ-ONLY for game code.
//   npx tsx scripts/strong-wind-table.ts          prints the table and writes docs/strong-wind-table.md
// Method: the Fan hull (one ejector fires up the middle column) with Flat+ and the blocks under test, a wall of 20 rows of tier-115 blocks
// that does not move, hanging just above the ship, a ship that holds still at height Y for 5 seconds with its gun on. The number is the total damage the
// blocks took in those 5 seconds, as a share of the same build with the wind OFF (so 100% = the wind costs nothing, 0% = no shot reached the wall).
// The ship's height matters: a shot that leaves backwards has to turn round before it flies off the bottom of the screen.
import { writeFileSync } from 'node:fs';
import { buildFanGrid } from '../src/game/gridUtils';
import { place } from '../src/game/starter';
import { Grid } from '../src/engine/compiler';
import { WallWorld } from '../src/wall/wallWorld';
import { makeTestWall } from '../src/wall/level';
import { CELL, WALL_COLS } from '../src/wall/constants';
import { STRONG_WIND_TURN_DEG } from '../src/data/lateTiers';

export interface WindBuild { name: string; ids: string[]; note: string }
const times = (id: string, n: number) => Array.from({ length: n }, () => id);

export const WIND_BUILDS: WindBuild[] = [
  { name: 'Plain Flat+', ids: [], note: 'no motion block' },
  { name: 'Upturn x1', ids: times('upturn', 1), note: 'after 0.4 s turns back to straight up (120 degrees/s)' },
  { name: 'Upturn x2', ids: times('upturn', 2), note: '0.3 s, 180 degrees/s' },
  { name: 'Upturn x3', ids: times('upturn', 3), note: '0.225 s, 220 degrees/s' },
  { name: 'Curving x2', ids: times('curving_left', 2), note: '60 degrees/s, 90 degrees in all: not enough to come back' },
  { name: 'Curving x4', ids: times('curving_left', 4), note: '120 degrees/s, 180 degrees in all: a U-turn of 574 px' },
  { name: 'Brake x3 + Curving x4', ids: [...times('brake', 3), ...times('curving_left', 4)], note: 'speed x0.34: the same U-turn in 195 px' },
  { name: 'Ship Magnet x1', ids: times('magnetized', 1), note: 'pulled back to the ship, overshoots upward' },
  { name: 'Ship Magnet x3', ids: times('magnetized', 3), note: 'pulled back to the ship, harder' },
  { name: 'Orbit', ids: ['orbit'], note: 'circles the ship first (60 px), then leaves backwards' },
  { name: 'Boomerang', ids: ['boomerang'], note: 'out 250 px backwards, back to the ship, gone' },
  { name: 'Mine', ids: ['mine'], note: 'lays a mine 220 px behind the ship' },
  { name: 'Homing x3', ids: times('homing', 3), note: 'cone opens 60 degrees round a heading that points away from the wall' },
  { name: 'Angle x4 (60 degrees)', ids: times('angle_left', 4), note: '60 degrees off straight back is still backwards' },
  { name: 'Scatter x3', ids: times('scatter', 3), note: 'random cone of 60 degrees round straight back' },
  { name: 'Random Curve x3', ids: times('random_curve', 3), note: 'a weave of up to 90 degrees/s' },
  { name: 'Accelerator x2', ids: times('accelerator', 2), note: 'faster, still backwards' },
  { name: 'Centreline x3', ids: times('centreline', 3), note: 'pulls sideways only' },
  { name: 'Align', ids: ['align'], note: 'acts after a hit only; nothing is hit' },
  { name: 'Extender x2 + Curving x4', ids: [...times('extender', 2), ...times('curving_left', 4)], note: 'life x4: the U-turn has the time' },
  { name: 'Brake x3 + Upturn x1', ids: [...times('brake', 3), ...times('upturn', 1)], note: 'slow shots turn in a tight circle' },
];

export const WIND_HEIGHTS = [250, 450, 650, 850];

export function windGrid(ids: string[]): Grid {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus', 10);
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  return g;
}

/** Total damage the wall took in `seconds` with the ship holding still at height y. `turn` = the launch turn in degrees (0 = no wind). */
export function windDamage(ids: string[], y: number, turn: number, seconds = 5): number {
  const level = { ...makeTestWall({ tier: 115, rows: 20, approachSpeed: 0 }), approachSpeed: 0, effects: turn ? { strongWind: { turnDeg: turn, speedMul: 1 } } : undefined };
  const w = new WallWorld(level, { grid: windGrid(ids) });
  w.god = true;
  w.setWallOffset(y - 40);
  const x = (WALL_COLS * CELL) / 2 - (w.spawnOffsets[0]?.x ?? 0);
  w.teleportShip(x, y);
  let dmg = 0;
  const dt = 1 / 60;
  for (let i = 0; i < seconds * 60; i++) {
    w.update(dt, { x, y });
    for (const h of w.hits) dmg += h.damage;
    w.hits.length = 0;
    w.killEvents.length = 0;
  }
  return dmg;
}

if (process.argv[1]?.includes('strong-wind-table')) {
  const rows: string[] = [];
  rows.push(`| build | ${WIND_HEIGHTS.map(h => `ship y ${h}`).join(' | ')} | why |`);
  rows.push(`|---|${WIND_HEIGHTS.map(() => '---').join('|')}|---|`);
  for (const b of WIND_BUILDS) {
    const cells = WIND_HEIGHTS.map(y => {
      const off = windDamage(b.ids, y, 0);
      const on = windDamage(b.ids, y, STRONG_WIND_TURN_DEG);
      return off > 0 ? `${Math.round((100 * on) / off)}%` : 'n/a';
    });
    rows.push(`| ${b.name} | ${cells.join(' | ')} | ${b.note} |`);
  }
  const text = rows.join('\n');
  console.log(text);
  writeFileSync('docs/strong-wind-table.md', `# Strong Wind: every motion block (chunk 27b)\n\nGenerated by \`scripts/strong-wind-table.ts\`. Damage the wall took in 5 s with the ship holding still at screen height y (screen is 960 px tall), as a share of the same build with the wind off.\n\n${text}\n`);
}
