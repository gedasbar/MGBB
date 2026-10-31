# Chunk 24a report: phone fixes (movement, pause, frame rate, unlock notices, small QoL)

Branch `chunk-24a` from `origin/main`. Gameplay and save change (save version 12), so the full e2e suite was run. Decisions: `DECISIONS.md` 403-415.

## What was built
1. **Ship movement.** The ship flies toward its target at most `SHIP_MAX_SPEED` (2,700 px/s, the screen width in 0.2 s). The hit test is swept: walls (in the wall's own frame, so a block scrolling onto the ship in one big step counts too) and Free Fly (segment against rock). Touch is a relative drag (`TOUCH_DRAG_GAIN` 1); mouse follows the cursor; Settings has "Touch control: Relative / Direct". The camera's edge push reads the ship's screen position. Cause of the bounce-back (read from code, see decision 406): the push stopped when the finger lifted but the camera kept coasting while the ship stayed fixed in world space, so it slid back on screen.
2. **Pause.** Button visible from the first frame; a press on the pause button or an open panel never steers the ship.
3. **Frame rate.** Steps of at most 1/60 s from the real frame time (`planSteps`), ticker `maxFPS = 0`, stats overlay shows `display N Hz`, `docs/DEPLOY.md` note on Safari's 60 fps flag.
4. **Time played.** Counted while the page is visible, in Settings next to the version. Save v12 with migration.
5. **Unlock notices.** "Unlocked: ..." line on the run summary; NEW tags on Shop and builder tiles; dots on the Shop and Skills tabs; toast burst removed.
6. **Captain tiers** 0 / 2,000 / 10,000 / 40,000 kills, grandfathered (`tiersOpened`), progress shown in K/M.
7. **HUD.** SPIKE badge inside the box, "Wall: <name>", Frontier square line; Free Fly plate and badge.

## A bug found by the e2e run, fixed
Saving the time played when the page hides would have written the old in-memory save back over an import or a reset right before its reload (the production-build script caught it: imported credits showed 0). `playTimeGuard` now blocks that save for a deliberate reload; unit-tested.

## Tests
- Unit: 933 -> 934 tests (`tests/chunk24a.test.ts`: 30 tests). About 30 calls in 6 older test files use `teleportShip` (`tests/helpers/jump.ts`) because the pointer can no longer teleport the ship; 3 tests were rewritten because they asserted the jump itself (`spawnSafety` x2, `starterLoadout`).
- **Mutation checks (10, all killed after one test was tightened):** speed cap removed; swept test replaced by a point test; relative drag jumping to the finger; edge push following nothing; `planSteps` floor instead of ceil (first SURVIVED, killed after adding 40 and 50 Hz); UI press not captured; no captain grandfathering; NEW mark never cleared; hidden time counted; wall ship jumping.
- e2e: new `e2e/phone-controls.e2e.cjs` (real touch events at 360 x 740). Older scripts changed: `browser` waits 700 ms for the ship to fly to the cursor (the check itself, ship under the cursor within 2 px, is unchanged); `captains` uses 2,000 / 10K; `frontier-map` reads the new `hud.square`; `production-build` and `freefly-waves` / `block-economy` expect version 12, the label regex allows the time-played text, and the import check no longer assumes the exact credits (the run before the export earns a few) or a byte-identical save (the game re-saves time played).
- Full suite in one run: see the end of this file.

## Contact sheet (`reports/chunk24a/sheet_24a.png`, opened and looked at)
Top row: campaign SPIKE tier 8 HUD (credits, tier, red SPIKE tag on the tier row inside the plate, "Wall: Towers", Destroyed 0%); Frontier wall HUD with "Frontier (2, 8)", "Wall: Pillars" and the badge inside the plate; Frontier Free Fly HUD with the badge beside "Tier 27 (wave 7 enemies)" inside a plate; run summary with the green line "Unlocked: Accelerator, Cleaver, +1 skill point" under the captain line, above the buttons. Second row: Shop with five green NEW tags at the bottom-left of tiles (the yellow affordability dots are still there) and small green dots on the tab bar; Build screen with green dots on the Shop and Skills tabs; Settings with "Touch control: Relative" and, at the bottom, version and "Time played 12h 34m"; tall-phone (390 x 844) campaign HUD. Last: 390 x 844 Frontier wall HUD. In the 390 x 844 shots the game is letterboxed (it is 9:16), so the HUD is the same as at 360 x 740 scaled.

## Not verified
- **The feel on a real iPhone**: the speed cap (2,700 px/s), the drag gain (1.0), and whether the bounce-back is gone. The cause was read from code, not reproduced; no phone was available.
- **120 Hz**: only the maths (unit tests at 30 to 144 Hz) and the headless browser were checked; no 120 Hz display. The `display N Hz` reading was not seen at 120.
- Safari's "Prefer Page Rendering Updates near 60fps" behaviour is from documentation, not tested.
- The very first e2e baseline (STEP 0) is not valid: it ran while I was editing source under the same dev server. Unit baseline was green (905 tests); I did not re-establish an e2e baseline on a clean `origin/main`.
- The NEW marks clear on a tap of the tile (opening its info); a block seen only through the Frontier unlocks panel keeps its mark.
- Unlocks made outside a run (cheats, import) appear on the next run summary.
- The run summary's "Unlocked" line for Free Fly with six rows was only checked on the wall summary.

## Full e2e, final run
37 of 37 scripts passed in one run on a freshly started dev server (earlier runs this chunk had failures that were fixed: version checks, old captain thresholds, ship flight time, the pagehide save bug, and one flaky wait in `blocks-first-batch` that now waits for the arcs instead of two fixed frames).
