import { makeTestWall } from '../src/wall/level';
import { simulateWall } from '../src/wall/sim';
import { buildStarterGrid } from '../src/game/starter';
for (const speed of [100, 150, 200, 300]) for (const rows of [6, 8, 10]) {
  const r = simulateWall(makeTestWall({ tier: 1, rows, approachSpeed: 25 }), buildStarterGrid(), { speed, y: 768, dwell: 0.5 }, { immortal: true });
  const r2 = simulateWall(makeTestWall({ tier: 1, rows, approachSpeed: 25 }), buildStarterGrid(), { speed, y: 768, dwell: 0.5 });
  console.log('speed', speed, 'rows', rows, 'immortal clear', r.state, r.time.toFixed(1), 'touch', r.firstTouch?.toFixed(1), '| mortal', r2.state, r2.time.toFixed(1), r2.destroyed + '/' + r2.total);
}
