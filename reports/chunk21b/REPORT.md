# Chunk 21b report

Branch `chunk-21b` from `origin/main` (21a merged). Numbers and method: `docs/performance.md`. Decisions: `DECISIONS.md` 372-384.

## What was built
| step | result |
|---|---|
| 1 | Profile before any change: `scripts/perf-profile.ts` (Node, per-system timers), `e2e/performance.e2e.cjs` (browser: sim, render), build in `scripts/lib/perfBuild.ts`. Wall tier 100: Homing was 21 of 22 ms at 4,000 shots. Free Fly: allocations in the hit test, 3.5 ms. |
| 2 | Homing keeps its target, searches at most every 0.1 s, staggered; radius queries on the field; allocation-free spatial hash; one hash and field per world; cached modifier facts; free-slot hint; shot sprites set only on change and culled. Wall at 4K shots 22.5 -> 2.95 ms, Free Fly 3.5 -> 2.28 ms (Node). Browser, wall at a full pool: 3 -> 26 fps. |
| 3 | Overload: refusal order fork fragments, Mirror clones, +1 extras, normal; stale off-screen shots expire first. Pool limit stays 4,000 (reasons in docs/performance.md section 4). |
| 4 | Run summary: all rows of one style incl. Best shot and Average DPS; total line, captain line, buttons at y 800. `reports/chunk21b/sheet_summary.png` (opened: Free Fly with 6 rows + Medals + captain line, wall crashed with 3 buttons, wall cleared; all fit 360 x 740, nothing crowds the buttons). |
| 5 | Five looks: cyan dash, pale-cyan bar, yellow diamond, orange bolt, magenta star. `reports/chunk21b/sheet_shots.png` (opened: all five clearly different, also at small size). |

## Tests
- Typecheck clean; unit tests: 24 new in `tests/chunk21b.test.ts` (spatial queries vs brute force on random layouts, homing timing and lock, refusal order, expiry rule, pool slots, looks, sprites); the rest pass.
- Mutation checks (7, all killed): homing retarget interval 0; stagger 1; hash query range shortened; fork refused last; expiry ignoring on-screen; expiry ignoring recent hits; homing lock ignored. One survived at first (the stagger test read the constant it checked) and was fixed.
- A unit test found a real bug in my free-slot hint (stale after `World.reset`); fixed.
- Full e2e: the whole suite passed in ONE run, 34 of 34, on a fresh server. Earlier runs failed on stale taps of the moved summary buttons (wall, campaign, fixed), a stale size check (chunk21a, fixed) and one freefly timing flake that passed on all later runs.

## Not verified
- All timings are from this desktop in headless Chromium / Node with a software renderer, not a phone. The browser frame time at a full pool (26-40 ms) is mostly rasterising sprites; I did not measure a real GPU.
- Homing now locks on: how it FEELS in play (and the balance of Homing builds) is not checked; the interaction audit was not rerun.
- The 8,000-pool figures are Node simulation only.
- Dev servers on ports 5174 and 5175 are still running (the environment refused to stop them); no worktrees were created.
