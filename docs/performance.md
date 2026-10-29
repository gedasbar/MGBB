# Performance (chunk 21b)

How a frame is spent when the shot count is high, what was done about it, and the numbers before and after. Measured with
`npm run perf-profile` (Node, simulation only) and `node e2e/performance.e2e.cjs` (headless Chromium: simulation, sprite sync and the
draw call). Headless Chromium draws with a software renderer and Node runs on one fast desktop core, so **these numbers show which part
grows and by how much; they do not say how a phone feels** (a phone is several times slower than this machine).

## The owner's slow build

`scripts/lib/perfBuild.ts`: a tall test hull with 3 ejectors and a Splitter 3, and in front of it 10 +1 Projectile, Mirror, Fork on Impact,
2 Extender, 2 Bouncing and 3 Homing (11 recipes per ejector, 66 shots a pulse with Mirror). The Fan hull is too short to hold that many
blocks in one line, so the test hull is 24 rows tall; the numbers do not depend on the hull's shape, only on how many shots are in the air.
Two places: Free Fly from wave 15 (`startWave: 15`) and tier 100, "The Last Wall" (855 blocks, held still 430 px in front of the guns so
every shot keeps meeting blocks).

The circuit alone reaches about 1,700 shots in Free Fly and 600 on the wall (shots die on blocks there). To compare 1K / 2K / 4K shots on
the same footing the benches also hold the pool at a minimum (`topUp` in `perfBuild.ts` fires the recipes round-robin through the gun's
own spawn, so Mirror clones, Extender life and lane offsets are the real ones). 4,000 is the pool limit.

## 1. Profile before any change (commit "Chunk 21b step 1")

### Simulation only (Node, `reports/chunk21b/before-node.md`), mean ms per frame

Free Fly, wave 15:

| | circuit alone (1.7K shots) | held at 2.5K | held at 4K |
|---|---|---|---|
| whole `World.update` | 0.91 | 2.64 | 3.50 |
| p99 | 1.66 | 4.51 | 6.78 |
| hit pipeline (`processField`), instrumented | 1.48 | 4.41 | 5.51 |
| of it: collision (`hitCircle`, spatial hash) | 0.54 | 1.59 | 1.90 |
| of it: `spatialHash.query` (allocates an array per call) | 0.30 | 0.86 | 0.97 |
| of it: modifier-list read (`scan`, twice per shot per frame) | 0.18 | 0.52 | 0.68 |
| of it: swept test for fast shots (`sweep`) | 0.17 | 0.51 | 0.66 |
| steering (`steer`, includes Homing), instrumented | 0.49 | 1.06 | 1.24 |
| bounce retarget, fork spawn, damage (`strike`), gun | < 0.05 each | | |

Tier 100 wall:

| | circuit alone (0.6K shots) | held at 1K | held at 2K | held at 4K |
|---|---|---|---|---|
| whole `WallWorld.update` | 3.41 | 7.52 | 14.47 | 22.49 |
| p99 | 5.81 | 21.21 | 35.67 | 44.13 |
| steering (`steer`), instrumented | 3.06 | 6.50 | 13.24 | 21.06 |
| of it: Homing target list (`collectNear`) | 0.80 | 2.32 | 4.74 | 7.62 |
| of it: the rest of the homing loop over that list | about 2 | about 4 | about 8 | about 13 |
| hit pipeline (`processField`), instrumented | 0.80 | 1.47 | 2.96 | 4.71 |
| collision, `scan`, `sweep` | 0.1 to 0.15 each | | | 0.7 to 0.85 each |

### In the browser (`reports/chunk21b/before-browser.md`)

"sim" is the whole simulation part of a tick (every `update` step in it plus the screen's sprite sync); "render" is the CPU time of the
draw call. When a tick is too slow the game runs several steps to catch up (up to 15), which is why the wall numbers explode.

| scene | shots alive | fps | frame ms | sim ms | render ms |
|---|---|---|---|---|---|
| Free Fly | 1.5K-2.5K (circuit alone) | 52 | 19.2 | 3.56 | 2.18 |
| Free Fly | 2.5K-3.5K | 40 | 25.1 | 6.07 | 2.85 |
| Free Fly | 3.5K+ (pool full) | 29 | 35.1 | 10.2 | 3.49 |
| Tier 100 | 250-750 (circuit alone) | 38 | 26.4 | 4.55 | 0.87 |
| Tier 100 | 1.5K-2.5K | 14 | 86.9 | 54.0 | 1.92 |
| Tier 100 | 3.5K+ (pool full) | 3 | 398 | 268 | 3.60 |

### What the numbers say

1. **On the wall, Homing is the whole problem.** `steer` is 21 of 22 ms at 4K shots. Every homing shot asks the wall for every block
   inside a 400 px square (a closure call per block, a push into a list), then runs `atan2` on each of them, EVERY frame. The cost is
   shots x blocks in range; it grows linearly with the shot count and is also paid by Mirror clones and Fork fragments (they carry Homing).
   At 4K shots it is 22 ms a frame before drawing, which in the browser is the death spiral (3 fps).
2. **In Free Fly the cost is the hit test and its small tax**: `spatialHash.query` builds a new array for every call (a spread of every
   cell), `scan` rereads the modifier list twice per shot per frame, `mods.find(...)` runs seven times per shot per frame, and the world
   rebuilds a `Map`, a `SpatialHash` and an `EnemyField` every frame. About 3.5 ms at 4K shots; not a freeze, but 3x the circuit alone.
3. **Drawing is not the hot spot.** The draw call is 1 to 3.6 ms of CPU, but the screens set position, size, tint and texture of every
   active sprite every frame, which is part of "sim" in the browser table.
4. **Bounce retargeting, fork spawn, damage and chain are negligible** (under 0.1 ms) in these builds; they are left alone.
