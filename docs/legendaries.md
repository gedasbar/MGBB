# Legendary blocks (chunk 20a): design note

Twelve one-of-a-kind blocks, three per Frontier direction, unlocked by reaching a ring and bought with Medals PLUS credits. They replace the ring-100 placeholder unlocks of chunk 15b and add rings 200 and 300. The Skills tree (next chunk) will upgrade them, so every number lives in one place (`src/engine/effects.ts`, section "Legendary") and each block has a fixed level 1 and a copy cap of 1.

Written before the code. Where the code later had to differ, the deviation is listed in section 6 and in `DECISIONS.md`.

## 1. The twelve blocks and the engine hook each one uses

The engine has three places where a number can change a shot, and every legendary uses exactly one of them:

- **A. Compile time (static).** `transform(packet, level, ctx)` in `compiler.ts`, with the new `CompileContext` (furthest Frontier ring, empty buildable cells of the hull, ejectors no signal reaches, turns the signal has passed). The result is a plain `add` / `mul` op, so the builder's damage estimate, the ledger tooltip and the stats strip are exact.
- **B. Fire time (`Gun`, `src/game/fire.ts`).** A new damage op that is evaluated stage by stage in path order, like Overclock and Capacitor. The estimate uses a stated average (see below).
- **C. Flight / hit time (`ProjectileSystem`).** A projectile modifier (`packet.mods`) read by `steer()` (movement) or `processField()` (the hit).

| block | ring | hook | what it does |
|---|---|---|---|
| **Frontier Echo** | N 100 | A | `+floor(10% x furthest ring)` flat damage. The furthest ring is the highest ring of any passed or cleared square in any direction (ring 300 = +30). Passed through `CompileOptions.furthestRing`, filled from `RunModifiers.furthestRing` in the worlds and from the Frontier reach in the builder. |
| **Payload** | N 200 | A | `+25` flat damage. |
| **Lone Shot** | N 300 | B (`lone` op) | Damage x(1 + (10 - n) / 9), n = the number of the player's shots alive when the shot leaves, clamped to 1..10: one shot alive = x2, ten or more = x1. n is `pool.count`, so Fork copies, Mirror clones, mines and orbiting shots all count. The estimate uses x1 (the common case for a fast gun). |
| **Last Breath** | E 100 | C (`last_breath` mod, hit) | x2 damage on a hit during the last 1.0 s of the shot's lifetime (`PROJECTILE_MAX_AGE` = 3 s, so from age 2 s). The age counter restarts after an Orbit launch and a Boomerang turn, and a waiting Mine is exempt from ageing: for them the window follows the leg, not the whole life. |
| **Zigzag** | E 200 | C (`zigzag` mod, steer + hit) | The shot turns every 0.2 s: it leaves 25 degrees to the left of its heading, then alternates +-50 degrees (so it weaves between 25 degrees left and 25 degrees right of the line), and every change adds +5% of the shot's damage (additive: after 5 changes x1.25, never compounded). Fork copies carry it (it is a movement block); a copy starts its own count. |
| **Heavy Round** | E 300 | A, at the end of the line | Damage x2 at normal shot speed up to x5 at 0.2x speed, linear in between, from the shot's real speed relative to normal: `packet.speedMul` (Turn blocks at level 2+) x the hull's `shotSpeed` x the captain's projectile speed. Speed above normal gives x2, below 0.2 gives x5. Today only a slow hull (Bastion, Galleon, 0.9x) moves the number: x2.3. See the deviation in section 6. |
| **Hollow Core** | S 100 | A | x(1 + 10% per empty buildable cell of the hull). "Empty" = a buildable cell with no block on it, whether or not a signal crosses it (straight line pieces are empty cells). Computed at compile time. |
| **Idle Barrels** | S 200 | A (two-pass compile) | `+3` flat damage per ejector that no signal reaches. The compiler first runs once to see which ejectors are reached, then again with the idle count. All ejectors used = +0. |
| **Waypoint** | S 300 | A (`packet.turns`) | x1.1 for every Turn Left / Turn Right / Curving Right / Random Curve the signal has passed before it gets here (the count travels in the packet, per branch). |
| **Rebound** | W 100 | B (`rebound` op) | x4 damage when the previous shot that passed THIS block instance arrived with less damage than this one. State per block instance, kept during the run (`Gun.reset()` clears it). The first shot has no previous shot and gets x1. The comparison is of the damage arriving at the block, before the x4. It needs damage that varies (chance blocks, Overclock, Lone Shot); the estimate uses x1. |
| **Mirror** | W 200 | B (`mirror` mod, `Gun.spawn`) | Every shot that leaves through this line is cloned: the clone has the same damage and the same modifiers and flies beside it, 16 px to the right of the heading. The clone is spawned with the shot (so a Delay Line holds both). The estimate counts two shots per pulse. |
| **Fuse** | W 300 | B (the Capacitor stage with n = 10, mul = 2) | Collects the shots that pass; the 10th leaves as ONE shot with double the sum of the damage of the 10, the other 9 are absorbed. It is the Capacitor mechanism (per recipe, in the same state array) with different numbers, so the estimate, the pulse rate in the stats strip and the "never more out than in" guarantee are the Capacitor's. The in-flight charge count is skipped (not cheap: the block is drawn once, the charge lives in the Gun). |

Category: a new **Legendary** category (`BlockCategory = 'legendary'`) with its own colour, lime `#a8e63d`, which no other category uses. The art is the usual block plate (nested squares, entry bar, exit triangle) with a flat geometric glyph per block. Palette order puts the category last.

## 2. Triggers (docs/interactions.md)

Two of the legendaries are on-hit or on-launch rules that belong in the trigger table, so `TRIGGERS` gets two rows:

| effect | fires | carried by fork copies | carried by chain arcs |
|---|---|---|---|
| Mirror | once, when the shot LEAVES the ejector (never on a hit) | no (a copy is made by a hit, not by the gun) | no |
| Last Breath, Zigzag, Heavy Round, Waypoint, ... | change the damage of a hit; no spawning, so no row | Last Breath and Zigzag yes (movement/damage of the shot), the others are baked into the damage | no |

**The clone rule (Mirror):** a Mirror clone is made by `Gun.spawn()` from a recipe, never from another projectile. Fork copies, Chain arcs, Mine extras and Boomerang/Orbit phases create their shots with `pool.spawn` directly, so they cannot be mirrored. A clone is therefore at most one generation deep, and there is only one Mirror (cap 1) and one way into it. The clone still obeys the pool limit (`CONFIG.CAPS.PROJECTILES`): when `pool.spawn` returns -1 the clone is simply not made. The clone is a full shot (it can fork, blast, chain), since "same modifiers" was the spec; the doubling is in the damage per pulse, and the audit watches it for EXPLODES.

**The Fuse rule:** the Capacitor stage adds the damage of each arriving shot to a bank and releases the bank times the multiplier on every n-th one, so it releases one shot for n absorbed ones and never creates a shot. A shot that arrives with NaN damage is dropped before it reaches the bank.

## 3. Unlock table

`UNLOCK_RINGS` becomes `[10, 25, 50, 100, 200, 300]`. Rings 10, 25 and 50 keep their placeholder block per direction. Ring 100 is now the legendary of that direction. The four ordinary blocks that used to be at ring 100 (Chain Lightning N, Fission Catalyst E, Executioner S, Alternator W) **move to ring 50 and sit next to the block that was already there** (a ring can unlock more than one block). Nothing a save owns can be lost: ownership is the `owned` count, an owned block stays buyable (the grandfather rule in `isBlockUnlocked`), and a player who reached ring 100 has reached ring 50.

| direction | 10 | 25 | 50 | 100 | 200 | 300 |
|---|---|---|---|---|---|---|
| North | Random Router | Cleaver | Frostbite, Chain Lightning | Frontier Echo | Payload | Lone Shot |
| East | Overkill Spill | Mine | Capacitor, Fission Catalyst | Last Breath | Zigzag | Heavy Round |
| South | Static Charge | Culling Bolt | Orbit, Executioner | Hollow Core | Idle Barrels | Waypoint |
| West | Corrosion | Gravity Well | Residue Seed, Alternator | Rebound | Mirror | Fuse |

Reaching = a passed or cleared square at that ring or beyond in that direction (unchanged: `reachBySector`).

## 4. Price

A legendary costs Medals AND credits: **15 Medals + 50K credits** (ring 100), **25 + 200K** (ring 200), **40 + 800K** (ring 300). Both must be affordable for the Buy button and for the yellow dot; the info sheet shows both. Buying takes both. The credit price was checked against the economy model: see the report (`reports/chunk20a/REPORT.md`) for the final numbers and the reasoning.

## 5. Save

The save shape does not change. Legendaries are ordinary entries of `owned` (cap 1); Medals are the existing spendable balance; the unlock state is derived from the Frontier squares. The version stays 9. A test loads a v9 save with progress at ring 100+ and checks that nothing is lost and the new blocks start at 0 copies.

## 6. Deviations from the prompt (more in DECISIONS.md)

- **Branch base.** The prompt says to start from `origin/main` "with 19b merged". 19b is not merged (`origin/main` is at the 19a merge), so this branch starts from the tip of `small-fix-19b`; the pull request therefore also carries the two 19b commits.
- **Heavy Round is applied at the end of the line.** The shot's final speed is only known at the ejector (a Turn block after Heavy Round changes it), so the multiplier is added as the last damage op of the packet. An Add block after Heavy Round is multiplied too (the spec said nothing about order).
- **Lone Shot, Rebound and the estimate.** Their bonuses depend on the state of the run, so the builder's estimate shows x1 for both. The real damage is in the Gun.
- **Waypoint counts blocks, not curved flight.** "Turn or curve block" is read as the four blocks Turn Left, Turn Right, Curving Right and Random Curve.
- **Fuse charge count** is skipped.
