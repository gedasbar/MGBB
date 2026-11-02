# Chunk 27b report: tiers 101-200, the five effect types

Branch `chunk-27b` from `origin/main` (27a merged). Gameplay change: full e2e run in one go on a freshly started server: **41 of 41 scripts passed** (the new `late-effects` included, 22 checks). Unit tests: 1,009 + the new file, `tsc` clean.

## What was built
Strong Wind (115 first), Crosswind (118), Fog (121), Regrowth (124), Mitosis Wall (127), on the 20 tiers 27a scheduled, harder on every return. One-line panel text and a small icon in the Map list (all nine types now have icons).
Design, numbers and findings: `docs/tiers-101-200-effects.md`; decisions 458-467; motion-block table `docs/strong-wind-table.md`; wind audits `docs/interaction-audit-wind-strong.md` / `-cross.md`.

## Tests
- `tests/lateEffects.test.ts`: 24 tests (schedule/effects, each type's rules, rank growth, Fog fairness floor, child hazard box, credits shares).
- Mutation checks (break, see a test fail, restore): launch turn removed (6 tests fail), Crosswind sign flipped (2), Regrowth wait removed (4), third Mitosis generation (2), Fog "hit block stays drawn" removed (4), children hit like full blocks (2), behind-before-sides (4), child pays full credits (2), damage not restarting Regrowth (4), Fog radius data cut below the floor (1). Weakening the floor function itself survived, as it must (it only makes the test easier).
- `e2e/late-effects.e2e.cjs` (waitFor throughout). Contact sheet `reports/chunk27b/sheet_27b.png`, opened: Map list with the new icons and the Fog panel line; Strong Wind with cyan shots running down from the ship; Crosswind with slanted shots; Fog nearly dark with a faint ring and a sliver of blocks at the left edge; Regrowth showing only the checker wall (the healing block is not marked, so the picture does not show the effect); Mitosis Wall, and a 3x close-up with two small child blocks and a "+86" popup.

## Deviations from the prompt
- Boomerang (and Mine) are not ways back under Strong Wind (verified in the table); Orbit only works close to the wall. Working builds: Upturn x2-3, Curving x4 + Brake x3, Ship Magnet, Orbit.
- Align does not counter Crosswind (acts after a hit only); Angle and 2+ Centreline do.
- "Behind" = the cell above.

## Not verified
- Difficulty: only the carve / clear-all bots were flown, on the first tier of each type; every build passes those tiers (open lane), so the by-rank numbers (speed, push, radius, heal rate, parent HP) are guesses, not fitted. No human playtest.
- Later ranks (2-5) of every type were not flown by bots or in the browser; only unit-tested and read from the data.
- Fog fairness is a computed floor plus a unit test, not played; sideways dodging at ship speed is not covered.
- Regrowth and the Mitosis rules were not checked by bots on later tiers; Mitosis credit totals (2.44 blocks per family) were not balance-tested.
- The wind audits use one wall, one ship height and 6 s runs; the Crosswind audit uses rank-3 strength only.
- Phone feel and frame rate of the Fog drawing were not measured.
- Production build (`npm run build`) not run.
