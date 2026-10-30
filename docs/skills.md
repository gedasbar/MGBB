# Skill tree (chunk 22a)

The Skills tab holds a tree of 55 hexagonal nodes (a free start node in the middle and six paths of nine). Points come from the furthest Frontier ring; every node costs one point and must touch a node the player owns. There are more nodes than points, so the player picks a path.

## 1. Rules (`src/skills/rules.ts`, constants in `src/skills/constants.ts`)

- **Points from the ring.** `skillPointsFor(ring)` = `floor(min(ring, 250) / 25) + floor(max(0, ring - 250) / 50)`: one point per 25 rings up to ring 250 (10 points), then one per 50 (ring 500 = 15, ring 1000 = 25). The ring is the same number Frontier Echo uses (`furthestRing(reach)`: the furthest passed or cleared square in any direction). Constants: `SKILL_RING_STEP` 25, `SKILL_RING_SLOW_FROM` 250, `SKILL_RING_STEP_SLOW` 50.
- **Free points** = total - owned nodes. Points are never stored: they follow from the ring and the owned list, so a respec "refunds" them by clearing the list.
- **Buying** a node: it must exist, not be owned, touch an owned node (the start node counts as owned) and a point must be free.
- **Respec** clears every owned node and costs `RESPEC_MEDALS` = 10 Medals (5 with the Salvage node "Cheaper respec", `respecCost`), behind a confirm dialog. With no node owned it does nothing and costs nothing.
- Copies a player bought through a skill-raised cap (Percent x, Splitter 3, +1 Projectile) stay owned after a respec; they only block buying more (decision in DECISIONS.md).

## 2. Save

Progress version 10 -> **11**: new field `skills: string[]` (owned node ids, the start node is implicit and never stored). `sanitizeProgress` keeps only ids that exist in the tree, drops duplicates, and drops nodes that no longer touch an owned chain (so a hand-edited or old list can never hold a floating node). Saves older than 11 load with an empty list. Nodes above the free points (a ring that shrank) cannot happen; the sanitiser also trims the list to the points the ring pays for, in tree order.

## 3. Data (`src/data/skillTree.ts`)

Plain, commented data the owner can edit. A node:

```ts
{ id: 'turn_left_1', path: 'routing', name: 'Left Edge', text: 'Turn Left: +1 damage', glyph: 'turn_l', at: [q, r], links: ['routing_1'], fx: { turnLeftAdd: 1 }, capstone?: true, needsBlock?: 'waypoint' }
```

- `fx` is a map from an effect key to a number. Every effect is an ADDITIVE delta on a neutral zero, so `skillEffects(owned)` is the sum of the `fx` of the owned nodes. A multiplier like "Waypoint x1.1 -> x1.15" is stored as `waypointPer: 0.05`; the engine reads `WAYPOINT_PER_TURN + fx.waypointPer`.
- `SKILL_FX_KEYS` (in `src/skills/effects.ts`) is the list of keys; a unit test checks every `fx` key exists and every key is used by some node.
- Layout: axial hex coordinates `at: [q, r]`. Each path is a spine of five normal nodes along one of the six hex directions, a side branch (one normal node) off the 2nd spine node and one off the 4th, then the two capstones touching the 5th spine node. Total per path 5 + 2 normal = 7, + 2 capstones. The links are explicit (`links`), not derived from the grid, so the owner can add a cross-link later. A test checks all positions are distinct and every link is two-way.
- Texts: one line, at most 60 characters (19b rule), checked by a test.

## 4. Where each effect hooks in

`SkillEffects` (a record of all keys, neutral = zeros) reaches the game by three routes:

| route | what | how it arrives |
|---|---|---|
| **Compile** | damage per block, packet fields, the estimate | `CompileOptions.skills` -> `CompileContext.skills`; `RunModifiers.skills` for the worlds, `BuilderModel.compileOpts()` for the builder |
| **Run** | chances and timings in the hit pipeline | `ProjectileSystem.skills` and `Gun.skills`, set by `World` / `WallWorld` from `mods.skills` |
| **Economy** | credits, Medals, caps, costs | read from `Progress.skills` in `econ/progress.ts`, `captains/state.ts`, `econ/economy.ts` |

Compile-time effects (in the block's own `transform`, so path order is kept and the builder's estimate includes them): Turn L/R add, Splitter 2/3 multiplier, Curving/Random Curve add, Delay Line multiplier, Random Router both-chance, Waypoint per turn, Hollow Core per cell, Flat+ per copy, Lucky/Gambler chance, Jackpot multiplier, Overclock cap, Payload, Frontier Echo share, Idle Barrels per ejector, Fuse n, Rebound multiplier, Brake floor. Compile-time effects at the end of the line (like Heavy Round, in `compile()`): angle-left/right bonus, Scatter bonus, Accelerator per copy, Extender life, Heavy Round top. Plus +1 Projectile starting damage (the extra's base). Chance effects (Lucky, ...) stay chance gates, so the estimate counts them at their average like before.

Run-time effects (read in `ProjectileSystem` / `Gun`): pierce +1 and bounce +1 chances (rolled once at spawn, stored per shot), damage per bounce made, AoE Rectangle/Circle penalty, Chain jump share, Persist spend share, Executioner threshold, Fork pair share, Orbit passes, Mine count, Boomerang range, Upturn delay, Last Breath multiplier, Zigzag gain, Lone Shot top, Mirror clone multiplier.

Economy effects: caps (`capWithSkills`), replay credits and "beats the best" credits (applied by `ProgressStore.recordWallRun` / `recordFrontierFly` to the credits of the run, so the summary and the banked amount agree), Free Fly credits and legendary-count credits (`RunModifiers`), extra Medal on a medal square, respec cost, hero level Medal cost.

## 5. Screen

`src/screens/SkillsScreen.ts` reuses the Frontier map's `GestureTracker` (drag pans, wheel and pinch zoom), the shared tab buttons, `CreditsBadge`, `textButton` and `Toast`. Hexes are drawn with `Graphics` (the tree is only 55 nodes, no sprite pool needed). Pure layout and hit-test maths are in `src/skills/layout.ts` so they are unit tested. Colours: owned = filled lavender (`PROGRESS_COLOR`), buyable = outlined (light line) plus the yellow dot when a point is free, locked = dim. Capstones are drawn 1.25 times larger. The icon of a node is the block's glyph where there is one (`drawBlockGlyph`-style art of `ui/blockArt.ts`), a small symbol otherwise.

## 6. Deviations and readings of the brief

(Also recorded as numbered decisions in `DECISIONS.md`.)

1. **Per-copy bonuses add** (Accelerator +10% per copy, Hollow Core, Zigzag), as the existing Zigzag does.
2. **Extender "+50% lifetime"**: a shot that passed at least one Extender lives 1.5 times longer on top of the Extender's own doubling (once, not per copy).
3. **Replay credits** count a tier/square that was already CLEARED before the run; **"beats the best"** needs an earlier best (a first run has nothing to beat) and compares the run's credits BEFORE the skill bonus with the stored best (which already holds earlier bonuses, so the test is slightly strict). The two bonuses add. The bonus is applied in `WallWorld.bank`, so the summary shows it ("skill bonus +N").
4. **Medal square extra Medal**: implemented as the captain's "Medal doubled" roll (for a one-Medal award a double is exactly +1), added to the captain's chance, squares only.
5. **Brake floor 0.15** lets a shot go slower than Heavy Round's full-bonus speed (0.2); Heavy Round's bonus stays at its maximum below 0.2.
6. **Angle bonus** reads the launch angle the compiler computes (Angle blocks), not Scatter's random draw; Scatter has its own +15%.
7. **Pierce / bounce chances** are rolled once when the shot is spawned (a shot either has the bonus or not), using the combat RNG so replays stay deterministic.
8. **Capstone of a legendary block the player does not own**: can be bought; its panel line says "Needs <block>" while the block is missing.
9. **Hero level cost**: `max(1, round(cost * 0.9))`.
10. **Block info texts are not changed**: the second line is the stacking rule and is full on most blocks (DECISIONS 392).
11. **The tree layout is derived**: a node's map position and links follow from its path and role (`spot`, `TOUCHES` in the data file), not from hand-written coordinates (the spec asked for plain editable data).
12. **Not built**: a debug cheat for skill points (the e2e hook `setRing` does it), icons per effect other than the block glyph or one of five symbols.
