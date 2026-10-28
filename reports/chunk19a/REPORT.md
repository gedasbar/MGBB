# Chunk 19a: best earnings, Homing nerf, Piercing by count, AoE shapes, report

## What was done (one commit per step)
0. **Baseline** on a worktree of `origin/main` (own dev server, port 5199): typecheck clean, 712 unit tests pass. Full e2e: 26 of 29 scripts passed; the 3 that failed (`blocks-first-batch`, `captains`, `hulls`) all passed when rerun alone, so they were load flakes (I was running unit tests and the audit at the same time), not main regressions.
1. **Best earnings:** `wallBestCredits` (per tier) and `squareBestCredits` (per Frontier square, wall or Free Fly, origin included), save version 9 with a tested migration (older saves start empty). Shown as "Best earned 1.23K" in the tier panel and on the Frontier panel's state row, and as a green "New best earnings!" on the run summary. Nothing is shown when never earned. (DECISIONS 314.)
2. **Homing nerf:** one copy 328 px / 33 degrees, three copies 399.8 px / 60.5 degrees (old single copy: 400 / 60). (315.)
3. **Piercing by count:** each copy = one more target, full damage, the shot ends after its last hit; AoE fires on every hit (trigger table), `docs/interactions.md` section 5, block text. (316, 317.)
4. **AoE shapes:** Rectangle in wall cells (1x3, 2x3, 2x5, 3x5, 3x7, ...), new `TargetField.collectArea`; Circle base radius one cell. (318.)
5. **Checks:** interaction audit, triple test, mutation checks, full e2e, contact sheet, campaign flake. (319-321.)

## Audit: CANCELS / EXPLODES before and after (`npm run interaction-audit`, 552 pairs of single copies)

| | OK | CANCELS | EXPLODES |
|---|---|---|---|
| before (main) | 494 | 58 | 0 |
| after | 508 | 44 | 0 |

14 pairs went from CANCELS to OK, none got worse: Piercing / Bouncing + AoE Circle / Rectangle (both orders, 8 pairs), AoE Rectangle + Boomerang and + Gravity Well (both orders, 4), Homing + Boomerang (both orders, 2). I do not know why Homing + Boomerang changed (probably the shorter seek range on the bench; it is a bench pair at 90%). **Piercing + AoE + Fork:** the pair audit only has pairs, so I ran Piercing x3 + AoE + Fork (and with the Rectangle, and a line of Piercing x2, Bouncing, AoE x2, Fork x2, Chain) in the same bench: score 17.5 to 24 against 9.6 for a plain gun, at most 52 shots alive, 0.05 ms p90 step: no EXPLODES. A unit test pins it (4 blasts, 1 fork, at most 3 shots alive).

## Tests
Typecheck clean. **725 unit tests pass** (712 before; new: `bestEarnings.test.ts` 8, homing values, pierce count and full damage, AoE on every hit (piercing and bouncing), Piercing + AoE + Fork, Rectangle cells for 1-5 copies in the engine and on a wall, Circle reaches the neighbours; 5 old tests rewritten for the new rules, `pierceCostMul` deleted). **Mutation checks (6, all killed):** earnings tie becomes a record (`<=` to `<`); pierce count `<` to `<=` (4 tests); AoE trigger back to `shot_end` (4 tests); Rectangle rows formula off by one (2 tests); Homing cone base 33 to 60 (1 test); earnings not floored on load (1 test).

**E2E.** One new script, `e2e/best-earnings.e2e.cjs` (11 checks: tier panel, Frontier panel, run summary with and without the flag, Rectangle 1x3 and 3x5, Circle, Piercing 2 blocks on a real wall world). Full run (30 scripts) on the branch: 26 passed, 4 failed; all four are explained and fixed:
- `block-economy` expected save version 8 (now 9; also `freefly-waves`); script fixed.
- `interactions` tested the old 17b rules (blast only at the end): rewritten for 3 Piercing copies + AoE (blast on every hit) and 5 copies + Chain.
- `campaign`: **the flaky script, cause found.** The crash step moves the ship onto a 2 HP block and waits 60 ms before cancelling the spawn grace. The ship's own gun fires at a random phase, and a shot fired from inside the block destroyed it before the grace ended about half the time (3 of 6 runs failed); the ship then sat in an empty cell and the wall passed it ("Tier passed"), and every later step played the wrong tier. Fix: the script turns auto-fire off for that step. 8 of 8 runs pass now.
- `basics` failed 4 checks in the full run (picker placement of the Turn Left) and passed on a rerun; it passed in the baseline run on main. I treat it as a load flake but did not find the cause.

After these fixes I reran only the four scripts (each passes), not the whole suite a second time.

## Contact sheet: `reports/chunk19a/sheet_19a.png` (opened and read)
Top row, real game screens (headless Chromium): the Map with tier 3 selected, its panel showing "Passed" and in yellow "Best earned 1.23K" (seeded 1234); the Frontier at the origin square, panel line "Cleared · Best earned 56.8K" (seeded); the run summary "Tier passed", green "New best earnings!" above "+4.32K credits earned". Bottom row, drawn by the script from a real `WallWorld` (grey = untouched, orange = took damage, white outline = hit block): the Rectangle with 1 copy damages the hit block and one each side (3); with 4 copies a 3-row by 5-column block that reaches UP from the hit block (away from the ship); the Circle with 1 copy damages a 3x3 (9 blocks, with the shot placed at the block's centre); a Piercing shot with 1 copy destroyed exactly the two lowest blocks of a column (yellow outlines). These are diagrams of engine output, not in-game screenshots of the effect.

## Deviations and things to know
- **Circle vs Rectangle (the brief wanted about the same blocks):** the Circle, centred on where the shot touches, hits a 3x3 around the hit block (7-9 blocks) against 3 for the 1-copy Rectangle. A radius that always reaches both neighbours also reaches the rows in front and behind. `AOE_CIRCLE_CELLS` (1.0) is the knob; a smaller radius would miss a neighbour when the shot touches the far edge.
- The Piercing info text keeps the "Each extra copy:" wording ("Each extra copy: passes through 1 more target.") because a test requires it on every stacking block; it does not say your exact sentence.
- Homing's turn RATE per copy is unchanged (only cone and range were asked), so three copies now turn 1.83x faster than one copy did before.
- Rectangle "behind the hit" means up the screen; that is also true for a shot that bounced sideways.
- `pierceHits` now counts passes only. The `shot_end` trigger, `aoePending` and `retire()` are unused but kept (switching the table back still works; DECISIONS 317).
- `docs/interaction-audit.md` has a "before" column from the 17b before-file; the 19a before/after is in `docs/interactions.md` section 5.

## Not verified
- Nobody played it: no real-hand test of the new Rectangle and Piercing feel, the Homing nerf on a real run, or the balance effect of AoE on every hit (damage per second of Piercing + AoE builds went up in the bench; no difficulty audit was rerun, `npm run difficulty-audit` / `balance-damage` were not run).
- The "New best earnings!" line was checked on a hand-built summary screen and through the store in unit tests, not on a real finished campaign / Frontier run in the browser (the flag path `WallWorld.bank` -> `WallScreen` / `FlyScreen` is covered by types and the store tests only).
- A real Free Fly Frontier encounter's best earnings (`recordFrontierFly`) is unit-tested but not seen in the UI.
- The Frontier panel line fits at the sizes I saw; I did not test it with a long Medal text and a large number (it should fit: about 380 of 540 px).
- Old saves were migrated in unit tests only, not with a real old browser save.
- Real phone, sound, frame rate: not checked.
- The `basics` e2e failure in the full run is unexplained (passes on rerun).
