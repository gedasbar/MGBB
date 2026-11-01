# Chunk 24c: spike walls and background wrap

## What changed
1. **Spike walls are full slabs.** In `buildWall` a spike spec uses `SPIKE_SLAB` (every cell filled, no `WALL_GAPS`), campaign and Frontier alike. Armor / shield shares are unchanged. `SPIKE_HP_MUL` 1.6 -> 2.0 (Free Fly spike squares use the same constant). Screen texts say "2x HP".
2. **Background wrap.** The background now follows `WallCamera.unwrappedX` (start + travel) instead of the wrapped x, so it scrolls on across the seam. Pure maths in `layerTileOffset`.
3. **Difficulty audit:** NOT refreshed (`FORCE=1` is about 40 min). A "stale for spike content" note is at the top of `docs/difficulty-audit.md`.

## Spike tiers (campaign): 11
8, 14, 16, 35, 47, 54, 59, 64, 71, 81, 83. Tiers 1-5 are never spikes, so they needed no exception.

## Wall bots (`npm run spike-botcheck`, carve bot, tiers 1-40)
| Build | highest tier passed in a row, before | after |
|---|---|---|
| Dart + Flat+ | 19 | 15 (spike tier 16 now crashes) |
| Twin + 2 Flat+ | 29 | 29 (spike 35 crashed before and after) |

## Tests
- Typecheck clean; unit tests: all pass (new: spike tiers are full slabs, ordinary tiers still have gaps, HP x2.0, camera unwrapped x and `layerTileOffset` across the seam).
- Mutation checks: making `unwrappedX` return the wrapped x fails both seam tests; removing the slab rule fails the slab test. Restored afterwards.
- New e2e `e2e/background-wrap.e2e.cjs`: holds the pointer at the right edge until the camera wraps; every background step equals the camera's own travel step (largest difference 0.00 px). With the old wrapped x the same script failed (step of 1,056 px backwards).

## Full e2e suite (`npm run test:e2e:all`, 39 scripts incl. the new one)
**Not green in one run.** Five full runs on a freshly started dev server (the first one and the last two; one run had a stale server after a branch switch, its result is disregarded): 38/39, 37/39 (twice) and 38/39. Failing scripts changed every run: `best-earnings` (tier-tile tap), `phone-controls` (a "ship has not arrived yet" timing check), `builder-extra` (crossing-line pixel check, twice), `legendaries` (shop sheet taps), `freefly` (kill count while sweeping). Every one passed when run alone (`builder-extra` 3x, `freefly` 3x, `phone-controls` 4x, `best-earnings`, `legendaries`). None of them touches spike walls or the background. I could not show these failing on `origin/main` (a comparison run was invalid, see below). I made the one clearly racy check robust: `phone-controls` now asserts the ship moved no more than the 2,700 px/s cap allows for the elapsed time, instead of "has not arrived yet".

## Not verified
- One whole e2e suite run passing at once (see above); the PR is opened anyway because the failures look like timing flakes, the owner should decide.
- That those flakes also happen on `origin/main` (my attempt ran with my files on disk under the dev server, so it proves nothing).
- Spike slabs on a real phone / by eye: no screenshot of a spike tier was taken or opened; only unit tests and bots cover it.
- Bot results beyond tier 40, and the Frontier spike squares with a bot.
- The seam fix on a phone with real touch; the e2e uses the mouse in headless Chromium with the galaxy background.
- Difficulty audit numbers are stale for spike content (not rerun).
- Free Fly spike squares at HP x2.0 were not balance-tested.
