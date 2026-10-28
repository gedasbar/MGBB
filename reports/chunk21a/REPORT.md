# Chunk 21a report

Branch `chunk-21a` from `origin/main` (20b merged). Design note first: `docs/chunk21a.md`. Numbers and reasons: `DECISIONS.md` 351-371.

## What was built

| step | result |
|---|---|
| 2 | **+1 Projectile** (`plus_one`, Damage, cap 10, 110 x 1.5^(n-1), pass tier 10). The new shot has base damage and nothing from earlier blocks; every later block works on both; each copy adds one shot; the lane's shots leave side by side (`LANE_GAP` 8 px, not 6: see deviations). Proj/pulse and the estimate count them. Unit tests with Mirror, Fuse, Lone Shot, Splitter, Capacitor and a full pool; audit row. |
| 3 | **Reverse removed**; save version 9 to 10; owned copies refunded by the price formula (3 copies = 19,152), placed copies leave the saved circuits, one-time notices. |
| 4 | **Curves stack**: Curving Left / Right 30 deg/s and 45 deg in all per copy (4 copies: 120 and 180), Random Curve weave 30 x copies; cap 4 each. |
| 5 | **Upturn overrides** Curving, Random Curve, Homing, Centreline, Ship Magnet and Zigzag after its delay (0.4 s, x0.75 per extra copy); not Orbit before launch, a waiting Mine, a Boomerang's way back. Rule and steering table: `docs/interactions.md` section 8. |
| 6 | **Brake icon** = the Accelerator's flipped. |
| 7 | **16 blocks repriced** (table: `reports/chunk21a/prices.md`). |
| 8 | **Builder keys** (`src/builder/keys.ts`, pure `keyAction`), listed in the help text. |
| 9 | **Run summary** shows Best shot and Average DPS (Free Fly, wall, Frontier encounter). |
| 10 | **Shot looks by damage** (bands 10 / 100 / 1K / 10K, bolts in the top two). |

## Deviations
- **Lane gap 8 px instead of about 6** (a bar is 6 px wide; at 6 the shots touch and look like one).
- **Best shot and Average DPS use the pipeline's nominal damage** (overkill included, burn ticks not counted).
- **Random Curve has no total angle** (a weave has no drift); its rate is 30 x copies.
- **The shot look is read from the shot's current damage each frame**, not once at spawn (cheaper, and it follows changes).
- Reverse refund uses the price formula, as asked, not the credits actually paid.

## Tests
- Typecheck clean. Unit tests: 839 pass (`tests/chunk21a.test.ts` has 42; older tests were updated for version 10, the new prices and caps, and the removal of Reverse).
- **Mutation checks (10, all killed):** blocks after +1 not applied to the extra (6 tests failed); the new shot inheriting earlier blocks (6); curve total cap removed (survived at first, because 0.5 degree steps divide 45 exactly, so I added a test with 0.07 s steps and then it fails); Upturn not overriding (4); Reverse refund growth changed (2); Shift+R mapping (1); a shot band edge moved (1); lane not centred (1); best shot keeping the smallest (1); Left curves counted as Right (2).
- **e2e:** one new script (`e2e/chunk21a.e2e.cjs`, 26 checks). The whole suite was run three times (DECISIONS 369-370). Last whole run on a fresh server: **31 of 33**; `polish` and `ring` failed there, passed in the whole run before it and in two single reruns each (timing). The suite was not all green on `origin/main` before this chunk; the stale scripts are fixed (DECISIONS 369). The suite was NOT run a fourth time after the last edit to `e2e/chunk21a.e2e.cjs` (captions and crop positions only; that script alone was run and passed 26 of 26).
- **Audit:** 2,077 OK / 275 CANCELS / 0 EXPLODES (DECISIONS 367).
- **Shot look cost:** 0.0075 ms against 0.0077 ms per frame for 256 sprites (DECISIONS 368).

## Contact sheet (`reports/chunk21a/sheet_chunk21a.png`, opened and looked at)
1. +1 Projectile: pairs of cyan bars side by side with a thin gap, repeated up the lane.
2. Curving Right x1 and 3. x4: shots along a curved path; the picture does not show the cap by itself (the numbers are in the check lines and the unit tests).
4. Ship Magnet x3 alone: 8 shots in a vertical line above and below the ship (a line along the lane, not a swarm all round the ship).
5. Ship Magnet x3 + Upturn: 3 shots left, one near the ship and two leaving at an angle; a weak picture, the proof is the shot count and the turn counter.
6. Shot looks: a tall hexagon bolt (50,000), a short bar (5) and a longer bar (500) side by side.
7. Brake above Accelerator: Brake's chevrons point down, Accelerator's up; Flat+ below.
8. Run summary: a band under the rows reads "Best shot 12.3K" and "Average DPS 80K".

## Not verified
- Real phone touch, and the keys on other keyboard layouts (only Playwright key events).
- The summary band and shot looks at 360 x 740 on a phone (checked on the game's own 540 x 960 canvas only; the band sits in the same column as the rows).
- Balance: +1 Projectile's price and cap against play (modelled, not played); the new curve numbers and Random Curve's rate; the repriced blocks against real income.
- The Overkill Spill / Residue Seed then +1 Projectile "never happens" flags (explained, not proven in a longer bench).
- The help panel with the key list (not looked at on screen; the panel grows with the text).
- Ten +1 Projectile copies on a big hull against the projectile pool limit in a real run (unit-tested with a pool of 5 only).
- Other dev servers from earlier sessions are still running on ports 5173 to 5181, and `../MGBM-base` is an old worktree that shares this folder's `node_modules` (never run `npm ci` in it).
