# Chunk 27a report: tiers 101-200, frame and layout types

Branch `chunk-27a` (from `origin/main` after 26a). Gameplay, save-adjacent and content change: the full e2e suite was run (see "Tests").

## What was built

- **Unlock and list.** Tiers 101-200 open when every tier 1-100 is CLEARED. Before that the Map list ends with one locked entry "What happens after 100?" and `N / 100 cleared`. After it the hundred tiles follow tier 100 (type name under the number, teal corner mark; name + one line in the panel; "(not active yet)" for the five chunk 27b types). "Next tier" on the run summary is only offered when the next tier is open. No save version bump (tier lists now accept 1..200; tested).
- **Curves** (`LATE_HP_SEGMENTS`, `LATE_REWARD_GROWTH`, `LATE_CLEAR_MEDALS`): block HP x1.10 a tier to 130, x1.075 to 165, x1.06 to 200 (3.4K at tier 100, 5.7M at 200); credits per block x1.02 a tier (the Frontier keeps its own curve); the first clear pays 2 Medals; 41 rows; armor / shield share 40% to 60%.
- **Schedule** (38 type tiers, gaps 2 or 3, none on a milestone, one type at a time): the nine types are introduced at 103, 106, ... 127; each returns 3-5 times, harder each time. Ten named milestone walls (110 ... 200). The five 27b types are in the data, built as ordinary hard walls.
- **Monolith, Maze, Fortress, Drift** (`src/wall/lateWalls.ts`; `WallWorld.rowShift` for the sliding rows; a zero-damage `flyer` bot in `sim.ts`). Two new backgrounds (`galaxy_teal`, `cave_ash`).
- `npm run late-tiers` (the table `docs/tiers-101-200-table.md`; `PART=bots`, `PART=reach`, `PART=ratios`), `e2e/late-tiers.e2e.cjs`, debug panel button "Clear tiers 1-100".
- Docs: `docs/tiers-101-200.md` (design note, committed first, final numbers and the bot report in section 7), DECISIONS 444-457, CLAUDE.md, `docs/PLAN.md`.

## Deviations from the prompt (details in the design note, section 5, and DECISIONS)

1. The HP curve is a fit that starts at x1.10 (a flat x1.10 would be x13,800 over the hundred tiers, several times what the strongest build tried passes).
2. Monolith HP is x45..x25 the tier's, not x500 (x500 asked 16 x the HP in DPS of its neighbours and more than the strongest build can do from tier 134).
3. Drift's blocks are x0.12..x0.06 the ordinary HP and it holds 450 blocks, because a lane cannot be carved through sliding rows; Fortress HP is x0.65.
4. "The model" = the real engine flown by bots, not the audit's Flat+ / Percent x catalogue (whose best build cannot clear tier 101).

## Bot report

Full tables in `docs/tiers-101-200.md` section 7. Strict-order reach (every tier on the way passed): build B (13 damage blocks, est. 504K DPS) **175** (clears ordinary tiers up to 123), build C (6 extra +1 Projectile, 2.8M) **193** (clears up to 140), the model's own best (A, 25K) about 140 and clears nothing past 100. Nobody passes tier 200. Gates: Drift 176 and Fortress 179 for B, Monolith 194 for C.

## Tests

- `npx tsc --noEmit` clean; unit 985 passed (25 new in `tests/lateTiers.test.ts`: unlock rule, save, schedule, curves, Medals, Monolith, Maze with a zero-damage bot, Fortress, Drift positions / collision / shots, backgrounds).
- Mutation checks (all failed the tests, then restored): unlock rule 99 instead of 100; a gap of 4 in the schedule; maze path width 1; Drift ignoring the row shift in the hit distance; late reward 1.05 (first survived because the test read the constant, test fixed, then failed); late Medals 1.
- Full e2e on a fresh server: **40 of 40 scripts passed** in one run (new `late-tiers.e2e.cjs`, 25 checks). Baseline on a pristine `origin/main`: 37 of 39; `browser` failed for real (ship pixel sampled in the spawn blink; fixed: waits for `invuln` 0) and `legendaries` failed only while my bots loaded the CPU (passes in the final run).
- Contact sheets: `reports/chunk27a/sheet_27a.png` (locked entry 99 / 100; list past 100 with type tags; Monolith, Maze, Fortress, Drift in flight) and `backgrounds.png` (tier 120 teal star field, tier 160 ash cave).

## Not verified

- Nobody played any of it: every number is fitted to two blunt bots (they never weave, dodge or lead shots). Drift in particular: the carve bot cannot play it at all and its HP was fitted with the clear-all bot only.
- Maze is passed by a zero-damage pilot written here, not by a person with a thumb on a phone (path 2-3 cells = 108-162 px).
- The type tags on the Map are 10 px; not checked on a real phone.
- Performance of Drift (per-row column walk in the hit test and the drawing) at a full 4,000-shot pool was not measured; `perf-profile` not rerun.
- The ordinary-tier limits of the reach table are good to about 10 tiers (template costs differ 100x).
- The five chunk 27b types are untouched; the Frontier was only covered by the existing tests.
- A paler block in the Monolith picture is a hit flash I did not trace (autofire was off).
