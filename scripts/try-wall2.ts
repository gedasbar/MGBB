import { makeTestWall } from '../src/wall/level';
import { WallWorld } from '../src/wall/wallWorld';
import { sweepX } from '../src/wall/sim';
import { buildStarterGrid } from '../src/game/starter';
const w = new WallWorld(makeTestWall({ tier: 1, rows: 8, approachSpeed: 25 }), { grid: buildStarterGrid() });
console.log('recipes', w.recipes.length, w.recipes[0].packet.damage, w.spawnOffsets);
let shots = 0; const orig = w.fire.bind(w); w.fire = () => { shots++; orig(); };
for (let f = 0; f < 60 * 60; f++) {
  w.update(1 / 60, { x: sweepX(w.time, 200, 10, 1082), y: 768 }); w.hull = 100; w.state = 'playing';
  if (f % 300 === 0) console.log(w.time.toFixed(0), 'shots', shots, 'destroyed', w.destroyed, 'off', w.wallOffsetY.toFixed(0), 'proj', w.pool.count, 'bottom', w.bottomEdge().toFixed(0), 'ship', w.shipX.toFixed(0), w.shipY.toFixed(0));
}
console.log(w.all.filter(b => w.blocks[b.row * 21 + b.col] === b).map(b => `(${b.col},${b.row}) hp${b.hp.toFixed(0)}`).join(' '));
