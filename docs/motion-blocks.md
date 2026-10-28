> **Chunk 21a changed this document: Reverse (block 13) was removed; Curving Left / Right and Random Curve stack to four copies; Upturn now takes over from the other steering after its delay. The hit order of section 1 starts at Persist. See `docs/chunk21a.md`.**

# Motion blocks (chunk 20b): design note

Thirteen Modifier blocks that change how a shot MOVES. Written before the code; the "Deviations" section at the end is updated when the code differs. Numbers live in one section of `src/engine/effects.ts` ("Chunk 20b"); the trigger rows are in `src/engine/triggers.ts`.

## 0. Where the engine can be hooked

| stage | place | what it can change |
|---|---|---|
| compile | `def.transform(packet)` in `compiler.ts` | packet fields: `speedMul`, `lifeMul` (existed, unused until now), and two new ones, `angle` (degrees, left < 0) and `scatter` (half-width, degrees); plus modifier tags in `packet.mods` |
| fire | `Gun.spawn` (`game/fire.ts`) | launch velocity (angle, scatter), launch speed, per-shot pool fields (`life`, `anchorX`) |
| flight | `ProjectileSystem.steer` (before the move) | velocity direction (curves, Upturn, Centreline, Ship Magnet) |
| hit | `ProjectileSystem.processField` step 2 and 4 | what happens to the shot after a hit: end, pass, bounce, **continue (Persist)**, **flip (Reverse)**, **snap up (Align)** |

New pool arrays: `life` (seconds the shot may live; default `PROJECTILE_MAX_AGE` = 3), `anchorX` (the ship's x when the shot was fired), `prevX/prevY` (position before this step's move, for the swept hit test), `flips` (reversals used).

Shot age/lifetime: the wall already retires a shot older than `PROJECTILE_MAX_AGE`; Free Fly only did that for Bouncing shots. Because Ship Magnet, Centreline and Reverse can keep a shot on screen for ever, **Free Fly now retires every shot older than its `life`** (a normal shot leaves the screen long before 3 s, so nothing existing changes). `life` replaces the constant in `retire` checks and in Last Breath (so Last Breath's window follows an Extender).

## 1. Hit-time order (what ends or continues a shot)

On a hit, in this order (first match wins; every effect with a trigger still fires as usual before this, see the table in section 3):

1. **Reverse**, if the shot has a reversal left and is a plain-flight shot (not orbiting, not a mine): the shot survives, its velocity flips, one reversal is used. It uses no pierce, bounce or damage budget.
2. **Persist**, the target was killed with damage to spare: the shot goes on with what is left (see Persist).
3. **Piercing**, a pass through the target while `pierced < copies` (19a, full damage).
4. **Bouncing**, a bounce if bounces are left (at the damage the shot carried into this hit).
5. otherwise the shot ends.

After a hit that did NOT end the shot and was not a Reverse flip (a pierce pass, a Persist continue or a bounce), **Align** snaps the heading to straight up. Order matters: Persist spends damage only on the targets it actually kills; Piercing is free passes for the targets that would have ended the shot (a Persist shot with a Piercing copy goes through one extra tough target at the damage it had).

## 2. The thirteen blocks

All: category Modifier, `maxLevel` 1 (not upgradable), a copy cap and price in `BLOCK_ECONOMY`. "Copy" below means a copy on the signal path of one shot.

### 1. Curving Left (cap 1)
Hook: flight. The `curve` modifier gets `dir: 'left'`; `steer` already sums turn rates, so it turns -90 degrees/s (anticlockwise). Mirror of Curving Right. **Cap 1** for the reason Curving Right has it (two copies add turn rates and loop the shot). A Left and a Right on one path cancel (they sum); that is the arithmetic, not a bug, and both count as turns for Waypoint.

### 2. Angle Left / 3. Angle Right (cap 4 each)
Hook: compile (`packet.angle`) + fire. The shot leaves 15 degrees left (right) of its ejector direction and then flies as it would anyway (no other steering is added). Each copy adds 15 degrees, **clamped at 60 degrees** (so 4 copies; a fifth does nothing, hence the cap). Left and Right on one path add (a Left and a Right = straight); they are separate blocks so a splitter can send one to each lane (the fan). Angles are NOT turns for Waypoint (recommendation taken: the signal does not turn in the circuit; the shot is simply aimed). Mirror's clone gets the same angle.

### 4. Accelerator (cap 3)
Hook: compile. `speedMul` x1.5 per copy. 3 copies = x3.375. **Cap 3**, and the packet's speed multiplier is clamped to `MAX_SPEED_MUL` = 4 (a Turn L3 + hull speed 1.3 on top is allowed to exceed it at the ship). Fast shots would tunnel: at 600 x 3.375 x 1.3 = 2630 px/s a shot moves 44 px in a 60 Hz step and 88 px at 30 Hz, more than a small rock's diameter (rock radius 8 + shot radius 10). **Swept hit test**: `steer` stores the position before the move; `processField` samples the segment from there to the current position every `max(6, hit radius)` px (only when the move is longer than `SWEEP_MIN` = 16 px, which no existing shot reaches at 60 Hz) and takes the first target touched along it. The shot is placed at that point, so AoE, bounce and fork happen where it hit. Not applied to orbit, mine and segments longer than 400 px (wrap, teleports).

### 5. Brake (cap 5)
Hook: compile. `speedMul` x0.7 per copy, **floor 0.2** (5 copies: 0.168 clamps to 0.2). Heavy Round (legendary) already reads `speedMul x hull shot speed` at the end of the line: a Dart (hull speed 1) with Brake to 0.2 gets x5. The floor is on the packet's `speedMul` (Turn-level speed bonuses and the hull's own speed multiply on top; with a fast hull the ratio can be a little above 0.2).

### 6. Scatter (cap 3)
Hook: compile (`packet.scatter`) + fire. Each shot leaves at `angle + uniform(-w, +w)`, w = 30 degrees for one copy, +15 per extra copy, **max 60** (3 copies). Random draw from the seeded combat stream. Straight flight afterwards. Mirror: the clone shares the shot's draw (it flies beside it; a second draw would be a second block's job). Scatter + Angle: the angle is the centre of the cone.

### 7. Upturn (cap 3)
Hook: flight (`steer`). After `UPTURN_DELAY` = 0.4 s of flight the heading turns toward straight up at `UPTURN_RATE_DEG` = 120 degrees/s (shortest way; a shot flying straight down turns clockwise). Applied after the other steering of the same step, so against Curving (90 degrees/s) it still comes out nearly straight up. **Extra copies** turn faster by the harmonic series (1, 1.5, 1.83 = x120), so the benefit falls off by itself. Cap 3 (a fourth would add 0.25 of one copy). Upturn is how Angle, Scatter, curves and bounces are brought back into a lane.

### 8. Align (cap 1)
Hook: hit (section 1). After every pierce pass, Persist continue or bounce the shot is set straight up again at its speed. **Cap 1**: a second copy would do the same snap. It does not undo a Reverse flip (otherwise Reverse + Align cancel; they combine: the flipped shot flies back down, its NEXT pass/bounce snaps it up).

### 9. Extender (cap 2)
Hook: compile (`lifeMul`) + fire (`pool.life = 3 s x lifeMul`). x2 per copy (cap 2: 6 s, 12 s). Used by the retire check in the wall (age) and Free Fly (new), by Last Breath's window (`lastBreathMul(age, life)`: the last second of the NEW life), Zigzag/Orbit/Boomerang are untouched. Without a block that keeps a shot in play (Ship Magnet, Reverse, Boomerang, Orbit, bounces, Centreline) an Extender does nothing visible, because a normal shot leaves the screen first; that is its natural pairing.

### 10. Centreline (cap 3)
Hook: flight. The vertical line through the ship's centre when the shot was fired (`anchorX`) pulls the shot sideways: lateral acceleration `CENTRE_ACCEL` = 500 px/s^2 x harmonic(copies), proportional to the distance inside `CENTRE_SOFT` = 40 px (no jitter on the line), then the speed is capped at the launch speed (a pull may slow a shot and turn it, never speed it up). Undamped, so a shot from a side ejector swings through the line and out the other side (a weave), and a flatter pull gathers a fan toward the middle. Extra copies pull harder (harmonic, so 3 copies = x1.83). Cap 3. With Angle blocks it narrows the fan instead of cancelling it (a 60 degree shot still travels well out first).

### 11. Ship Magnet (cap 3), reuses `magnetized`
The hidden `magnetized` block ("Projectiles are magnetised.", mod type `magnetized`, never consumed) is the right idea, so it is **reused**: same id and modifier type, renamed Ship Magnet, shown, with this behaviour. (`Magnetize Target`, the status block, stays hidden and separate.) Hook: flight. Acceleration toward the ship's CURRENT position (`projSys.shipX/Y`, set each step, the short way round on a ring wall) of `MAGNET_ACCEL` = 2400 px/s^2 x harmonic(copies), softened inside `MAGNET_SOFT` = 80 px. The speed is capped at the launch speed (`pool.vmax`), so a shot flying straight away from the ship slows, turns and comes back, and a shot never speeds up past where it started: a swarm of shots going in and out through the ship about 100-150 px each way at base speed. **Cannot stay for ever**: `life` still applies (3 s, longer only with an Extender). Boomerang and Orbit own the velocity in their phases (no effect there); after Orbit launches, the magnet works on the launched shot. Cap 3.

### 12. Persist (cap 1)
Hook: hit. Needs the damage the target "had left" as the damage code counts it: `damageToKill(target, pure, tier, armorPierce, shieldBreaker)` in `damage.ts` is the smallest hit that kills (shield first, then armor, then HP; the pure share goes straight to HP, exactly as `applyDamage` does). In `strike()` the hit's final damage `d` is known; if `need < d` the target dies and the shot keeps the fraction `1 - need/d` of its damage; if `need >= d` the shot is spent (0 left) and the target survives. Only the DIRECT hit counts: blast victims, chain arcs, status ticks and fork copies' hits spend nothing of the parent's budget (a fork copy has its own, smaller budget and persists too, because copies share the modifier list; `fragments: true`). **Piercing**: independent, see section 1: Persist continues through kills, Piercing gives free passes on targets that would end the shot. **AoE**: the blast fires on every hit (trigger table) with the hit's damage and does not touch the budget; a persisting AoE shot therefore blasts once per kill. Each continuing hit needs a kill, so the number of hits is bounded by the targets. **Cap 1**: a second copy would not change a rule that is already "until the damage is gone".

### 13. Reverse (cap 3)
Hook: hit (section 1, first). Once per copy: on a hit with a flip left the shot survives, its velocity is negated, `flips++`. It never ends the shot, so Reverse is useful on its own: the shot goes in, hits, and flies back down through the same lane (skipping the target it just hit until it hits something else, as bounces do). With more copies it flips again on the next target it touches. After the copies are used, normal rules. **What a copy adds**: one more flip (cap 3: in, out, in). **Triggers on the reversing hit fire as usual** (AoE, Fork on Impact, Chain, statuses, Gravity Well). Not applied while orbiting or as a mine; a Boomerang's legs are plain flight, so a Boomerang that hits on the way out flips toward the ship early and then continues its normal return.

## 3. The trigger table (`TRIGGERS`) and docs/interactions.md

| effect | fires | carried by fork copies | by chain arcs |
|---|---|---|---|
| Reverse (new) | every hit while a flip is left, max one per copy (`perCopy`) | no (a copy flipping back into the ship would be noise) | no |
| Align (new) | after every hit that does not end the shot and is not a flip | yes (it is movement) | no |
| Persist (new) | every direct hit | yes | no |

`docs/interactions.md` gets a section 7 with these rows and the resolution order of section 1.

## 4. Waypoint
Counts Curving Left too (`isTurn`). The Angle blocks do not count.

## 5. Unlocks (step 3)

New lock type "pass campaign tier N". Frontier unlocks become legendary-only (rings 100 / 200 / 300); the 16 ordinary blocks that sat at rings 10 / 25 / 50 move to tier locks. Full table, prices and the grandfather rules are in the report and `docs/blocks.md`.

## 6. Deviations (what the code does differently from the first draft above)

- Section 1 order: Persist is checked before Piercing (kills spend damage, pierce passes are kept for targets that would end the shot).
- Centreline and Ship Magnet cap the speed at the launch speed (`pool.vmax`) instead of renormalising it: renormalising cancelled a pull along the shot's own line.
- Reverse makes the shot survive the hit (needed for it to do anything on a plain shot); it also turns a Boomerang's outward leg into its way back.
- The lock is "Pass tier N" (see DECISIONS 339); the 16 moved blocks keep a legacy Frontier-ring unlock for saves that had reached it.
- Free Fly retires shots in normal flight at `pool.life` (decision 345).
