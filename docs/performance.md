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

## 2. What was changed (steps 2 and 3)

Only what the profile showed. Each item names the cost it removes.

| change | where | removes |
|---|---|---|
| Homing searches by radius instead of listing every target: `TargetField.nearestInCone` (spatial hash in Free Fly, a walk of the cells inside the range on the wall), no closure, no list, the cone tested by a dot product (one `atan2` only for the target that was picked) | `src/engine/targets.ts`, `src/wall/wallWorld.ts` | the wall's 400 px block list per shot per frame (7.6 of 22 ms at 4K) and the `atan2` over every block in it (about 13 ms) |
| Homing keeps its target while it is alive, in range and in the cone; with none it searches at most every `HOMING_RETARGET` = 0.1 s; the first search of a shot is staggered over `HOMING_STAGGER` = 6 frames by its pool slot | `ProjectileSystem.homingTurn`, `pools.homeId` / `homeT`, `effects.ts` | six of seven searches, and the spike when a volley of 60 shots all search on one frame |
| Spatial hash on flat typed arrays; `queryInto` fills a list the caller owns | `src/engine/spatialHash.ts` | an array per query (a spread of every cell) |
| The world keeps ONE spatial hash and ONE `EnemyField` (`refresh()` after each rebuild) | `src/game/world.ts` | a `Map`, a hash and a field made every frame |
| Modifier lists are read once: `ModInfo` per list (levels, stack counts, steering counts, the pierce / bounce / AoE / fork / Homing blocks, Armor-Piercer and Shield-Breaker) | `ProjectileSystem.use` | seven `mods.find(...)` and two `scan` passes per shot per frame |
| The wall's `hitCircle` and Homing search are written out as loops (no closure per call) | `wallWorld.ts` | a closure and a call per block |
| Shot sprites: one sprite per slot as before, but texture, size and colour are set only when the look changes, shots outside the view are hidden, one white texture per shape | `src/ui/shotSprites.ts`, `shotTextures.ts` | `width`, `height`, `tint` and `texture` writes for every shot every frame |
| Overload rule (see section 4) | `config.ts` `OVERLOAD`, `pools.ts`, `projectiles.ts`, `fire.ts` | a freeze when the pool is full |
| `ProjectilePool.spawn` starts looking for a free slot from the lowest slot that can be free (it still takes the lowest free one) | `pools.ts` | a scan from slot 0 for every shot of a volley |

Not changed because the profile did not ask for it: bounce retargeting (a reflection, not a search: under 0.1 ms), chain lightning (not
in the owner's build; at most 3 arcs a shot), fork spawning, `strike` (damage), AoE and clouds, the gun. The fast-shot sweep is still the
second cost of the hit pipeline (0.6 ms at 4K); it is what stops Accelerator shots from skipping over targets.

## 3. After (same builds, same seeds)

### Simulation only (Node, `reports/chunk21b/after-node.md`), mean ms per frame, before in brackets

Free Fly, wave 15:

| | circuit alone | held at 2.5K | held at 4K |
|---|---|---|---|
| shots alive (mean) | 1,779 (1,729) | 2,814 (2,942) | 3,758 (3,990) |
| whole `World.update` | 0.56 (0.91) | 1.05 (2.64) | 2.28 (3.50) |
| p99 | 0.93 (1.66) | 2.03 (4.51) | 4.26 (6.78) |

Tier 100 wall:

| | circuit alone | held at 1K | held at 2K | held at 4K |
|---|---|---|---|---|
| shots alive (mean) | 678 (620) | 1,190 (1,166) | 2,404 (2,375) | 3,725 (3,969) |
| whole `WallWorld.update` | 0.74 (3.41) | 1.11 (7.52) | 2.13 (14.47) | 2.95 (22.49) |
| p99 | 2.59 (5.81) | 2.46 (21.21) | 4.12 (35.67) | 6.55 (44.13) |
| steering, instrumented | 0.36 (3.06) | 0.60 (6.50) | 1.20 (13.24) | 1.61 (21.06) |

At 4K shots the wall is 7.6 times cheaper and Free Fly 1.5 times. The wall now costs what Free Fly costs: the remaining time is the hit test
(`hitCircle`, 0.7 to 1 ms), the sweep (0.6 to 0.7 ms) and the loop itself. "Shots alive" is a little lower after the change at the 4K
column because the overload rule now refuses fork fragments and Mirror clones above 80 % and 88 % of the pool.

### In the browser (`reports/chunk21b/after-browser.md`), before in brackets

| scene | shots alive | fps | frame ms | sim ms | render ms |
|---|---|---|---|---|---|
| Free Fly | 1.5K-2.5K (circuit alone) | 60 (52) | 16.8 (19.2) | 1.97 (3.56) | 1.96 (2.18) |
| Free Fly | 2.5K-3.5K | 50 (40) | 20.1 (25.1) | 3.13 (6.07) | 2.74 (2.85) |
| Free Fly | 3.5K+ (pool full) | 38 (29) | 26.1 (35.1) | 4.83 (10.2) | 3.22 (3.49) |
| Tier 100 | 250-750 (circuit alone) | 43 (38) | 23.2 (26.4) | 1.29 (4.55) | 0.93 (0.87) |
| Tier 100 | 1.5K-2.5K | 34 (14) | 29.4 (86.9) | 4.11 (54.0) | 2.01 (1.92) |
| Tier 100 | 3.5K+ (pool full) | 26 (3) | 39.5 (398) | 7.99 (268) | 2.79 (3.60) |

The simulation part of the wall at a full pool went from 268 ms (the catch-up spiral: the game cannot keep up, so it runs up to 15 steps a
tick) to 8 ms. The CPU cost the game itself adds (sim plus render) is now 8 ms at a full pool in Free Fly and 10.8 ms on the wall. The
rest of the frame time in this headless run (frame 26 to 40 ms against 8 to 11 ms of our own work) is the software renderer rasterising
thousands of overlapping sprites; I did not measure how a phone's GPU does with it.

## 4. Graceful overload (step 3)

All numbers are `CONFIG.OVERLOAD` in `src/config.ts`.

- **Refusing new shots as the pool fills** (`ProjectilePool.admits(kind)`, a refusal is counted in `pool.refused`): fork fragments from 80 %
  of the pool, Mirror clones from 88 %, the extra shots of +1 Projectile from 94 %, normal shots only when the pool is completely full.
  (So a full pool keeps the lane's own shot and loses the extras first: the gun keeps firing the circuit's backbone.)
- **Expiring what nobody can see.** From 85 % of the pool, plain shots that are OFF-SCREEN and have hit nothing for 1.5 s are removed first
  (at most 400 a frame, and it stops as soon as the pool is under 85 % again). "Off-screen" is: outside the camera's window on a ring wall
  (60 px margin) or above or below the view. Free Fly retires every shot that leaves the screen already, so there the rule finds nothing
  and the refusal order is what holds. Orbit, Boomerang and Mine shots are never expired.
- **Never freezes or crashes**: `spawn` returns -1 at a full pool and every caller handles it; `tests/chunk21b.test.ts` fires 40 pulses of a
  6-extra build into a pool of 150 and checks the count never passes it.

### The pool limit stays at 4,000

The rule was: raise it only if the owner's build stays at about 60 fps worth of work (sim plus render under about 8 ms) with it. At 4,000
shots the build is already at that line in the browser (Free Fly 4.8 + 3.2 = 8.0 ms, the wall 8.0 + 2.8 = 10.8 ms), and in Node an 8,000
pool costs 3.3 ms (Free Fly) and 6.2 ms (wall) for the simulation alone (`reports/chunk21b/pool8000-node.md`), double the 4,000 figures,
before the sprite sync and the draw call which also grow with the count. So the limit is kept; it is one constant, `CONFIG.CAPS.PROJECTILES`.
`POOL=8000 npm run perf-profile` repeats the measurement.

## 5. How to measure again

```bash
npm run perf-profile                                   # Node: Free Fly and tier 100, 0 / 2.5K / 4K shots
POOL=8000 FF_TARGETS=0,8000 WALL_TARGETS=0,8000 npm run perf-profile
node e2e/performance.e2e.cjs                           # browser (needs npm run dev); GAME_URL=http://localhost:PORT, SECS=n
```
