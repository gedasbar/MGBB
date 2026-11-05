# Chunk 33a report: faster e2e suite and a rerun limit

Tooling only: no file under `src/` changed. Docs: `docs/e2e-suite.md`, CLAUDE.md, DECISIONS 578-584.

## Times (43 scripts)
| | time |
|---|---|
| Before: sequential runner | about 40 min (the owner's figure; NOT re-measured here) |
| Run 1, 3 workers | 15 min 55 s (script times add up to 46 min) |
| Run 2, 3 workers | 15 min 28 s (script times add up to 45 min) |

Machine: 16 logical cores, Windows. Slowest scripts: mitosis-blocks, blocks-first-batch, economy, builder, late-effects (3-4 min each), so more than 3 workers would help little until those are split.

## What was done
1. Moved to `npm run test:e2e:sheets`: sheets-bg, sheets-rocks, sheets-ships, performance, trail-cost (now `e2e/sheet-*.cjs`). `production-build` is `// slow`, runs last.
2. `// area:` tag on all 43 scripts; `--area`, `--only`, `--list`.
3. Parallel runner with its own server, retry once, FLAKY verdict, summary. One shared server was enough.
4. New rules in CLAUDE.md (two full runs at most).
5. map-nav and chunk21a failed (on the code this branch started from); I fixed them, then origin/main received its own fixes for the same causes while I worked, so the merge keeps main's versions of map-nav, chunk21a and late-tiers (DECISIONS 583). After the merge those three pass together.

## Results
Run 1: 39 passed, 2 flaky (background-wrap, legendaries), 2 failed (chunk21a, late-tiers). Fixes made, then run 2: 40 passed, 2 flaky (motion-blocks, economy), 1 failed (late-tiers: my own typo, `waitFor` not imported). After the typo fix, late-tiers, motion-blocks and economy were rerun together: all pass. map-nav and chunk21a passed in run 2 and in repeated single runs (map-nav 3 of 3, chunk21a 3 of 3 after the last fix).

## Not verified
- The full suite was not rerun after merging origin/main (the two-run limit); only map-nav, chunk21a and late-tiers were rerun, together: pass.
- The "before" time is the owner's ~40 min, not a measurement.
- No single run of the whole suite had zero failures: the clean state is run 2 plus a rerun of the 3 scripts that needed it (the two-run rule).
- The FLAKY scripts (legendaries Mirror, motion-blocks Scatter, economy toast) were not diagnosed; they passed on retry.
- Ctrl+C cleanup was not tried by hand; the end-of-run stop was checked only by the runner finishing (no leftover server looked for on Windows beyond that).
- `tsc` and unit tests not run (no game or test code touched).
- Per-worker servers were not measured, only reasoned about.
