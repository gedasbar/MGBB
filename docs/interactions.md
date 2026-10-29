# Block interactions: when does each effect fire? (chunk 17b)

> **Chunk 19a changed two rules below: AoE now fires on every hit and Piercing is a count. Section 5 is current; sections 1-4 describe 17b.**

Principle: **every effect says WHEN it fires.** Local and cheap effects fire on every hit; big-area or spawning effects fire once. The rules live in one table in code, `TRIGGERS` in `src/engine/triggers.ts`; the owner can change a rule there. `npm run interaction-audit` tests every pair of blocks against the rules (`docs/interaction-audit.md`).

Words: a **hit** is a projectile touching a target. The **shot** is one projectile from the ejector (plus the copies it makes). The shot **ends** on the hit that uses it up: a plain shot on its first hit; a Piercing shot when its damage runs out (and no Bouncing block turns that into a bounce); a Bouncing shot when it has no bounces left.

## 1. How it works TODAY (code read in `src/engine/projectiles.ts` `processField`, `effects.ts`)

| effect | fires today | what it stops or does |
|---|---|---|
| AoE Circle / Rectangle | on the FIRST hit | the blast replaces the direct hit and **frees the projectile**. Piercing, Bouncing and Fork on Impact in the same line are never reached. |
| Piercing | every hit | the shot passes through; each hit costs `1/level` of the damage dealt; when damage is gone the shot is freed |
| Bouncing | every hit (until the bounces are gone) | reflects, keeps full damage |
| Fork on Impact | EVERY hit of a non-AoE shot | two copies per pair at 50% damage. A piercing or bouncing shot forks again on each hit (cascade); an AoE shot never forks |
| Fork copies | | carry the whole modifier list (AoE, Chain, Piercing, ...); they only cannot fork again |
| Chain Lightning | every hit, no limit per shot | up to `chainJumps` jumps per hit at 70% damage. On an AoE shot it fires once from the first target |
| Chain arcs | | strike with the same statuses/Mitosis effects; they do not blast, fork or chain again (already so) |
| Ignite, Frostbite, Corrosion, Static Charge | every hit (also on blast victims, arcs, copies) | local statuses |
| Executioner, Cleaver, Culling Bolt | every strike | damage change on that strike |
| Cauterize, Fission Catalyst, Overkill Spill | every strike | marks on the target |
| Residue Seed | every kill (not by cloud or burn) | leaves a cloud worth the killing hit |
| Gravity Well | EVERY hit | a pulling spot at the hit; Orbit made one every 0.3 s |
| Boomerang, Orbit | no end by hit | the shot keeps flying through what it hits (with AoE on the line it exploded and ended on the first hit) |
| Mine | the touch that detonates it | a normal hit, then the mine is used up |

Problems: AoE cancels Piercing, Bouncing and Fork; Fork cascades; Chain has no limit per shot; fork copies can blast and chain (a Fork + AoE shot would flood the screen if AoE ever stopped ending the shot).

## 2. New rules (the TRIGGERS table)

| effect | fires | carried by fork copies | carried by chain arcs |
|---|---|---|---|
| Status and Mitosis effects (Ignite, Frostbite, Corrosion, Static Charge, Executioner, Cleaver, Culling Bolt, Cauterize, Fission Catalyst, Overkill Spill, Residue Seed) | every hit | yes | yes |
| AoE Circle, AoE Rectangle | **once, when the shot ends** | no | no |
| Fork on Impact | **the first hit only** (the main shot goes on if it can pierce or bounce) | no (copies cannot fork) | no |
| Chain Lightning | every hit, at most `CHAIN_ARCS_PER_SHOT` = 3 chains per shot (each Chain copy still adds one jump per chain) | no | no |
| Gravity Well | the first hit only (a spawned object: one per shot) | yes | no |

Rules in words:

- A piercing or bouncing shot with AoE travels and makes ONE blast on the hit where it ends. Fork on Impact and AoE on the same shot both happen (the fork on hit 1, the blast on the last hit; for a plain shot both on hit 1).
- The blast goes to every target in the area EXCEPT the one the shot hit last, which already took the direct hit at full damage. (Before, the blast replaced the direct hit.)
- Fork copies are plain: they keep the movement blocks (Piercing, Bouncing, Homing, curves) and every status/Mitosis effect, but no AoE, no Fork, no Chain. Nothing cascades.
- Chain arcs carry statuses/Mitosis effects only (as before).

## 3. Deviations and choices (what the code does)

- **Boomerang and Orbit with AoE:** these shots do not end by hitting (they come back to the ship or circle it), so "when the shot ends" would never happen. They explode on the first hit and end (as today). In the code this is the `keepsFlying` case in `processField`.
- **A shot that flies off the screen** (or gets too old) after piercing or bouncing without being used up: the blast it still owes goes off where the shot LAST HIT, in the next hit step (`ProjectileSystem.retire`, called by `World` and `WallWorld` where they used to free the shot). So a Piercing shot always makes its blast. The blast uses the damage the shot had at its first hit (piercing only pays for the direct hits).
- **The AoE penalty is the whole shot's:** `x0.95` per extra AoE copy applies to the direct hit and the blast alike (the old rule: the blast replaced the direct hit and had the factor). The target of the last hit takes the direct hit (with the factor), the blast goes to everything else in the area. The builder's estimate counts the factor (`aoeEstimateMul`).
- **Gravity Well:** changed from every hit to the first hit (principle: spawning = once). Residue Seed stays per kill: the kill is a one-time event and the cloud is capped by the target's HP.
- **Fork copies keep the movement blocks** (Piercing, Bouncing, Homing, curves) and every status/Mitosis effect; only AoE, Fork and Chain are dropped (`fragments: false` in the table).
- **Chain arcs:** `maxPerShot` counts chains (one chain = up to `chainJumps` jumps from one hit), not single jumps.
- **Stacking blocks' copies (step 5):**
  - Homing: besides the sharper turn and wider cone it already had, each copy stretches the seek range by `stackGrowth` (400 px for one copy).
  - Orbit: each extra copy adds one full pass round the ship (`2 pi r / speed` seconds, about 0.63 s at the usual shot speed) before the launch; the re-hit speed-up stays.
  - Mine: each extra copy lays one more mine beside the first when it stops, 36 px apart, up to 3 extra (`MINE_EXTRA_MAX`); the bigger trigger stays. The cap of 3 keeps the pool safe (a mine waits 12 s). Extra mines are full shots (they carry the line's effects).
  - No stacking block's cap changed.
- **Not changed:** statuses, Executioner, Cleaver, Culling Bolt, the Mitosis marks and Residue Seed fire on every hit exactly as before.

## 4. The audit (docs/interaction-audit.md, before: docs/interaction-audit-before.md)

24 blocks, 552 ordered pairs. A pair is compared with the better block alone; blocks that cost damage on their own (Orbit, Mine, the curves, Cleaver) are compared with themselves alone. Before and after both read 494 OK, 58 CANCELS, 0 EXPLODES, but they are not the same 58:

- **Fixed:** AoE + Fork on Impact (both orders, Circle and Rectangle): Fork never happened, now it does.
- **Improved, still flagged:** Piercing + AoE and Bouncing + AoE no longer lose an effect ("Piercing never happens" is gone) but come out at 80-92% of AoE alone: the blast now waits for the end of the line instead of the first hit, which is the best place in a tight cluster. By design of the rule.
- **New in the list:** Bouncing + AoE Circle (84%) and Fork + Boomerang (85%) crossed the 95% line.
- **Remaining by design:** Boomerang with Piercing, Bouncing (it already passes through everything), Mine (both replace the flight path), AoE (the blast ends the boomerang on its first hit), Homing, Fork.
- **Remaining, bench artefacts:** pairs with Orbit or the curves. An Orbit shot always leaves from the same point 33 px beside the ship's axis, so in the tight cluster bench it never hits and nothing it carries can happen; curved shots miss low-HP targets so Executioner never fires. Overkill Spill + Residue Seed (83%) and Fork + Spill (90%) are kill-timing noise of the splitting-rock bench.

## 5. Chunk 19a: pierce and bounce are counts, so AoE fires on every hit

Piercing used to spend the shot's damage, so how long a shot lived depended on the targets' HP; it was hard to say when "the end" was and AoE had to wait for it (section 2). Now **each Piercing copy on the path lets the shot through ONE more target** (1 copy: 2 targets, 3 copies: 4), at full damage (`PIERCE_DAMAGE_KEEP = 1.0` in `effects.ts`; below 1 each pass multiplies the damage, so it can be tuned). The shot ends after its last allowed hit. A Bouncing block still turns the end of the pierce into a bounce (and the pierce count starts again after it). Both counts are finite, so the table changes:

| effect | fires (19a) | carried by fork copies | carried by chain arcs |
|---|---|---|---|
| Status and Mitosis effects | every hit | yes | yes |
| AoE Circle, AoE Rectangle | **every hit** (was: once, when the shot ends) | no | no |
| Fork on Impact | the first hit only | no | no |
| Chain Lightning | every hit, at most `CHAIN_ARCS_PER_SHOT` = 3 chains per shot | no | no |
| Gravity Well | the first hit only | yes | no |

- The blast of a hit goes to everything in the area except the target of that hit (it took the direct hit), at the damage of that hit times the AoE factor (x0.95 per extra copy). A piercing shot with AoE through a line therefore blasts at every target; neighbours of two targets in a row can be blasted twice. That is the point of the rule.
- Boomerang and Orbit shots never end by a hit, so with AoE they still explode on their first hit and end (section 3).
- The `shot_end` trigger and `retire()` (the blast owed when a shot leaves the screen) are kept in the code and still work if the table is switched back; with `every_hit` nothing is owed (`aoePending` is never set).
- Fork copies and chain arcs carry no AoE, so Piercing + AoE + Fork cannot cascade: the main shot makes at most (copies + 1) blasts and one fork. `tests/interactions.test.ts` has the cluster test (4 blasts, 1 fork, at most 3 shots alive); the bench of `scripts/lib/dmgBench.ts` for Piercing x3 + AoE + Fork, and a longer line with Bouncing, Fork x2 and Chain, stayed under 52 shots alive and 0.05 ms per step (no EXPLODES).

### AoE shapes (19a)

- **Rectangle**, in wall cells (`CELL` = 54 px; Free Fly uses the same size in pixels), centred sideways on the hit block and reaching **behind** it (up the screen, away from the ship). Copies alternate one row deeper and two cells wider: 1 copy 1 x 3, 2: 2 x 3, 3: 2 x 5, 4: 3 x 5, 5: 3 x 7, 6: 4 x 7 (`aoeRectCells`). The `level` of the block no longer matters.
- **Circle**: the base radius is one cell (`AOE_CIRCLE_CELLS` = 1, 54 px; it was 50 px, so +4) from the point where the shot touches the block, which reaches the blocks beside the hit one. The per-copy growth (`stackGrowth`) and the -5% per extra copy are unchanged, for both shapes. On a wall, one Circle hits the 1 x 3 of one Rectangle and may also touch the row behind and in front.
- Free Fly: the Rectangle is a box of the same cells around the hit rock's centre, hitting every rock it overlaps.

### Audit before and after (`npm run interaction-audit`, 24 blocks, 552 pairs, one copy of each block)

Before (main, after 17b): 494 OK, 58 CANCELS, 0 EXPLODES. After: **508 OK, 44 CANCELS, 0 EXPLODES.** 14 pairs went from CANCELS to OK, no pair got worse:

- Piercing + AoE Circle (80%), Piercing + AoE Rectangle (92%), Bouncing + AoE Circle (84%), Bouncing + AoE Rectangle (81%) and the same four with the blocks in the other order: now OK.
- AoE Rectangle + Boomerang (85%), AoE Rectangle + Gravity Well (91%) (both orders) and Homing + Boomerang (90%, both orders): now OK. The Rectangle pairs are from the new shape; Homing + Boomerang is a side effect of the shorter Homing range in the bench (noise level, not understood in detail).
- AoE Circle + Boomerang is still flagged, 91% -> 94%.
- The 44 that remain are the old by-design and bench-artefact pairs (Boomerang, Orbit, Mine, Fork + Spill, ...); see section 4.

## 6. Chunk 20a: the legendary blocks

Design and numbers: `docs/legendaries.md`. What matters for the trigger table:

- `TRIGGERS.mirror` (`fires: 'launch'`): the Mirror clone is made when the shot LEAVES the gun (`Gun.spawn`), never on a hit, and only for shots that come from a recipe. Fork copies, Chain arcs, extra mines and everything else that calls `pool.spawn` directly are not mirrored, so a clone is never cloned (one generation, by construction). A full pool (`CONFIG.CAPS.PROJECTILES`) skips the clone.
- Fuse is the Capacitor stage with n = 10 and a x2 on the summed damage: one shot out for ten in, never more out than in.
- Last Breath (x2 on a hit in the last second of the shot's life) and Zigzag (the shot turns every 0.2 s, +5% a change) are read in `processField` / `steer` from the shot's own age and counters, so they are carried by Fork copies (which share the modifier list) and not by Chain arcs.
- The audit with the twelve legendaries: 1,140 OK, 120 CANCELS, 0 EXPLODES (the 44 older flags unchanged, 76 new ones that are the blocks' own design: `docs/legendaries.md` section 7).

## 7. Chunk 20b: the motion blocks

Design and numbers: `docs/motion-blocks.md`. Three new rows in `TRIGGERS` (`src/engine/triggers.ts`):

| effect | fires | carried by fork copies | carried by chain arcs |
|---|---|---|---|
| Reverse | every hit while a flip is left, at most one per copy of the block (`perCopy`) | no | no |
| Align | after every hit the shot survives by passing, bouncing or persisting (not after a Reverse flip) | yes | no |
| Persist | every direct hit | yes | no |

**What happens to a shot on a hit** (first match wins; every triggered effect of section 3 and 5 still fires first, on the hit that flips or continues the shot):

2. **Persist** (the target was killed with damage to spare): the shot goes on with the damage it did not need (`damageToKill`, in the units the damage code counts: shield, armor, HP).
3. **Piercing**: a free pass while passes are left (section 5).
4. **Bouncing**: a bounce while bounces are left.
5. otherwise the shot ends.

After 2, 3 or 4, **Align** snaps the heading straight up.

- Persist + Piercing: Persist spends damage on kills, Piercing's passes carry the shot through the targets Persist cannot kill (a tough target ends a Persist-only shot).
- Persist + AoE: the blast is a trigger of the hit and takes the hit's damage; it spends nothing of the shot's budget. A persisting AoE shot blasts once per kill.
- Reverse + Align: the flip is not undone by Align; the next pass, bounce or persist after the flip snaps it up.
- Reverse + Boomerang: the first hit turns the boomerang back. Reverse + Orbit / Mine: nothing (those phases own the velocity and a mine must detonate); no flip is used up.
- Fast shots (Accelerator) are checked along the whole path they flew in a step (`ProjectileSystem.sweep`), so AoE, bounce and fork happen where the shot actually touched the target.

## 8. Chunk 21a: +1 Projectile, Reverse removed, stacking curves, Upturn

**Reverse is gone** (section 7's Reverse row and step 1 no longer apply; the hit order is Persist, Piercing, Bouncing, end; Align still snaps up after a pass, a bounce or a Persist continue).

**+1 Projectile** is a compile-time block (no trigger): it makes the lane's shot count, not a hit effect. A shot it makes has no modifier from before the block. So Fork copies, Chain arcs and Mirror clones are unchanged: they are made from a shot, and an extra shot of a lane is a shot like any other (it can be mirrored, it can fork). Fuse / Capacitor / Overclock / Rebound keep one state per recipe, so each shot of a lane has its own. Lone Shot counts the lane's earlier shots as alive.

**The steering table** (`ProjectileSystem.steer`; first match wins per step, only for a shot in plain flight):

| order | who steers | rule |
|---|---|---|
| 0 | Orbit before launch, a waiting Mine, a Boomerang's way back | own the velocity; nothing below runs (unchanged) |
| 1 | **Upturn**, once the shot is older than its delay (0.4 s, x0.75 per extra copy) | turns toward straight up at 120 degrees a second x harmonic(copies) and **nothing below runs**: the shot stays straight |
| 2 | Zigzag | launch angle, then a turn of 2 x 25 degrees every 0.2 s |
| 3 | Curving Left / Right, Random Curve | net copies of Right minus Left set the rate (30 degrees a second per copy) and the total angle (45 degrees per copy, `pool.curved`); Random Curve adds its weave (30 x copies) |
| 4 | Homing | turns toward the nearest target in its cone; since 21b it locks on and keeps that target until it dies or leaves the cone or the range, and searches again at most every 0.1 s (DECISIONS 373) |
| 5 | Centreline, Ship Magnet | add an acceleration; the speed is capped at the launch speed |

Before Upturn's delay everything in rows 2-5 works as before, so Upturn is how a build with Homing or a magnet gives the shot a straight finish. Hits still act on an Upturn shot (a bounce reflects it, Align snaps it up); Upturn turns it back up on the next step.
