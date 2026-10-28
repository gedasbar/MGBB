# Chunk 21a: +1 Projectile, stacking curves, Upturn override, keys, run stats, shot looks (design note)

Written before the code; "Deviations" at the end is updated when the code differs. Numbers live in `src/engine/effects.ts` ("Chunk 21a"), `src/data/blockEconomy.ts` and `src/data/tierLocks.ts`.

## 1. +1 Projectile (id `plus_one`, category Damage)

**Rule.** Where it sits on a line it adds ONE new shot to that lane. The new shot starts with base power: the damage that leaves the generator (1 + hero level + captain base bonuses) and no modifier, speed, angle or effect from any block BEFORE it. Every block AFTER it works on both shots (a splitter copies both, a multiplier multiplies both, a Capacitor collects for both). Each copy adds one more shot, so two copies make three. Placing it at the start of a route is the strong play; placing it late adds a weak shot.

**Compiler.** `Packet.extras: Packet[]` holds the extra shots a lane has gained so far. At a block the compiler first applies the block to every existing extra (and appends the keyed op, the turn count, the alternator/router op to them), then, if the block is `addsShot`, pushes `newPacket(base)` as a new extra, then applies the block to the main packet. An extra therefore only holds what came after its own +1 block. At the ejector each extra becomes a recipe of its own (the same direction, cell and `packet` with no extras); `EjectorRecipe.lane` is the sideways offset. This is the whole feature: the Gun, the pool, Mirror, Fuse, Lone Shot, splitters, the stats strip and the damage estimate already work per recipe, so they see the extra shots as ordinary lanes.

**Lane.** The shots of one ejector leave side by side, `LANE_GAP` = 6 px apart, centred on the ejector (offsets (k - (n-1)/2) x 6, sideways to the way the ejector fires). The main shot is the first of them.

**Stats.** "Proj/pulse" is the sum of the recipes' pulse shares, so one +1 Projectile on a plain line shows 2, two copies 3. The estimate sums the recipes' expected damage, so it counts the weak extra shot at its own (smaller) damage.

**Pool.** Shots per ejector are at most 1 + 10 (the cap), a Dart-class hull has one ejector and the biggest hulls ten, so at most 110 recipes; each recipe fires through `pool.spawn`, which returns -1 when the pool (`CONFIG.CAPS.PROJECTILES`) is full, exactly as for any other shot. The extra shot of a Mirror line is mirrored like any recipe (a clone is never cloned: the clone is made in `Gun.spawn`).

**Interactions chosen.**
- Stateful stages keep one state slot per recipe, so a Capacitor/Fuse/Overclock after the block gets one state per shot (each shot collects its own, the lane as a whole fires as many bigger shots as it has shots). Alternator and Random Router decide per pulse for the key, so both shots go the same way. Rebound compares successive shots through its block: with extra shots the previous shot through it is the other shot of the lane, so Rebound reads the base shot's damage against the main shot's; that is how two lanes through one Rebound already behave.
- Lone Shot reads the number of your shots alive at launch time: the lane's later shots see the earlier ones alive. By design (it makes +1 Projectile weaker with Lone Shot).

**Price and cap.** Cap 10, growth 1.5, first copy 110 credits, unlocked by passing tier 10. Economy model of `docs/difficulty-audit.md`: one "run" at tier 10 is 44 credits, so the first copy is 2.5 runs (the rule used for step 7). Copy n costs 110 x 1.5^(n-1): 110, 165, 248, 371, 557, 835, 1.25K, 1.88K, 2.82K, 4.23K; all ten cost 12.5K. The model player holds 735 on arriving at tier 10 and 8K at tier 30, so the first four copies (about 900) come in the tier 10-15 range and all ten by about tier 35. Each copy adds a whole shot, which is the strongest thing a single block does (at 11 shots the line has 11 times the shots of the Dart), so the curve is steep on purpose; the cap of 10 is the knob if a playtest says it is too strong.

## 2. Reverse is removed

The block, its trigger row (`TRIGGERS.reverse`), its text, art, economy line, tier lock and the pool/engine code (`flips`, `reverseFlips`, `mv.reverse`) are gone. **Save version 9 to 10** (`PROGRESS_VERSION`): a v9 save's owned copies of Reverse are refunded at the credits they cost by the price formula (copy n cost round(4800 x 1.3^(n-1)); `econ/migrate.ts`, `REMOVED_BLOCKS` keeps the frozen formula), with a one-time notice. Placed copies are dropped from saved circuits by the builder loader (it already ignores unknown blocks) and a notice says how many were taken off. The builder save format is unchanged (still version 3); the loader counts the removed entries and the model writes the notice into the progress notice, then rewrites the save so it is shown once.

## 3. Curves stack like angles

Curving Right, Curving Left and Random Curve now count copies. **Curving:** one copy turns 30 degrees per second until it has turned 45 degrees in all; each extra copy adds 30 degrees per second and 45 degrees of total (4 copies: 120 per second, 180 in all). `pool.curved` is the angle turned so far. Left and Right copies on one path cancel in the net count (3 Right + 1 Left = 2 copies of Right). **Random Curve:** the weave's largest turn rate is 30 x copies degrees per second (4 copies = 120, what one copy was before). Caps 4 each (they were 1), prices 300 with the normal growth 1.30.

## 4. Upturn overrides

After its delay Upturn takes the steering: Curving Left/Right, Random Curve, Homing, Centreline, Ship Magnet and Zigzag stop steering the shot, and it turns to straight up (at 120 degrees per second x harmonic(copies)) and stays straight. Scatter and Angle only set the launch direction, so there is no drift of theirs to stop (the shot is turned up from wherever they sent it). **Delay:** 0.4 s with one copy, x0.75 per extra copy (0.3 s, 0.225 s), cap stays 3. **Not affected** (the code does not reach the steering for them): Orbit before its launch, a waiting Mine, a Boomerang's return leg. After an Orbit launches, Upturn works on the launched shot. Hits still act: a bounce reflects the shot, Align snaps it up, and Upturn turns it back up afterwards. The rule is written in `docs/interactions.md` section 8.

## 5. Brake icon

The Accelerator's chevrons mirrored top to bottom (pointing down).

## 6. Repricing the 16 blocks that moved to campaign tiers

First copy about 2.5 runs at the unlock tier, 5 runs for Overkill Spill, Residue Seed and Chain Lightning. Stack blocks (Mine, Orbit, Chain Lightning) keep their growth 1.30. The table (run = credits of half a wall at that tier, from `reports/chunk20b/prices.md`) is in section "Prices" of the report and held by `tests/chunk21a.test.ts`.

## 7. Keyboard (Build screen)

R rotate right, Q or Shift+R rotate left, D / Delete / Backspace delete the selected block, A auto-orient it, Ctrl+Z undo, Ctrl+Y or Ctrl+Shift+Z redo, Esc close the sheet / deselect, F fly. Ignored while typing in an input. The mapping is a pure function `keyAction(event-like) -> action | null` in `src/builder/keys.ts`; touch is untouched. Listed in the Help (?) screen.

## 8. Run summary stats

The result screen shows "Best shot" (the highest damage of one hit this run) and "Average DPS" (total damage dealt / run time), K/M/B formatted. The world records both (`runStats`).

## 9. Shot looks by damage

Log bands of a shot's damage: under 10, 10-99, 100-999, 1K-9.9K, 10K+ (`SHOT_LOOK_BANDS`). Band 0 is today's look; each band is longer and thicker (`SHOT_LOOK_SCALE`), and the two top bands add a flat geometric head. Colour is kept; Boomerang, Orbit, Mine and other special looks stay. Decided at spawn.

## Deviations
(Filled in at the end of the chunk; see DECISIONS.md 351 onwards.)
