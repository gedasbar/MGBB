// Chunk 28b: the long-range lane check used by scripts/crosswind-check.ts and tests/lateEffects.test.ts.
import { buildFanGrid } from '../../src/game/gridUtils';
import { place } from '../../src/game/starter';
import { WallWorld } from '../../src/wall/wallWorld';
import { makeTestWall } from '../../src/wall/level';
import { WALL_COLS, CELL } from '../../src/wall/constants';

const times = (id: string, n: number) => Array.from({ length: n }, () => id);
const COL = 10;
const laneX = () => COL * CELL + CELL / 2;

export function laneDamage(ids: string[], accel: number, range = 400, seconds = 3): number {
  const g = buildFanGrid();
  place(g, 5, 9, 'flat_plus', 10);
  ids.forEach((id, k) => place(g, 5, 8 - k, id));
  const level = { ...makeTestWall({ tier: 115, rows: 20, approachSpeed: 0 }), approachSpeed: 0, effects: accel ? { crosswind: { accel } } : undefined };
  const w = new WallWorld(level, { grid: g });
  w.god = true;
  w.setWallOffset(700 - range);
  // The ship's x is where the ejector is over the lane (the Fan's centre ejector sits at spawnOffsets[0]).
  const sx = laneX() - (w.spawnOffsets[0]?.x ?? 0);
  w.teleportShip(sx, 700);
  let dmg = 0;
  for (let i = 0; i < seconds * 60; i++) {
    w.update(1 / 60, { x: sx, y: 700 });
    for (const h of w.hits) if (h.blockId % WALL_COLS === COL) dmg += h.damage;
    w.hits.length = 0;
  }
  return dmg;
}

export const COUNTERS: [string, string[]][] = [
  ['none', []], ['Centreline x1', times('centreline', 1)], ['Centreline x2', times('centreline', 2)], ['Centreline x4', times('centreline', 4)],
  ['Angle left x2', times('angle_left', 2)], ['Angle left x4', times('angle_left', 4)], ['Angle right x2', times('angle_right', 2)], ['Angle right x4', times('angle_right', 4)],
  ['Align', ['align']], ['Upturn x2', times('upturn', 2)],
];

