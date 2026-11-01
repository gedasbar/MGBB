# Chunk 24d: spawn invulnerability and flaky e2e

## 1. Spawn invulnerability
- `SPAWN_INVULN_SECONDS = 1.5` (`src/engine/control.ts`). `World` (Free Fly, Frontier Free Fly) and `WallWorld` (campaign, Frontier walls) start with it in the constructor when `safeStart` is on, so it runs from the first frame whether or not the player touched the screen. The captain bonus still adds to it. Worlds without `safeStart` start at 0.
- Kept: the ship waits at bottom-centre until the first touch and eases in over 0.25 s. An early tap does not change the timer. The existing blink cue now shows from the first frame. (DECISIONS 423-424.)
- Unit tests (`tests/spawnSafety.test.ts`): invulnerable at t=0 with no input; not invulnerable at t=1.6 with no input; the same with an early tap; wall and Free Fly. Mutation check: made the timer start only at the first move again, and setting 1.5 to 1.0 -> the new tests failed; restored.
- The `captains` e2e had to clear `invuln` before its Second Chance touch (DECISIONS 425).

## 2. Flaky e2e
Baseline on a fresh `origin/main` server, each script 5 times alone (before):

| script | main, alone (5 runs) | cause | fix |
|---|---|---|---|
| best-earnings | 5/5 | tier list still gliding when tapped (failed in suite) | select retries until the sheet shows the tier |
| phone-controls | 5/5 | "has not arrived yet" depended on speed (fixed in 24c) | bound by the speed cap |
| legendaries | 4/5 | Shop sheet read before it had content | waitFor the content |
| freefly | 5/5 | sweep killed nothing when rocks were elsewhere (failed in suite) | sweep until a kill, capped |
| builder-extra | 5/5 | pixels / `picker.tiles[0]` read before drawn (failed in suite) | waitFor |
| blocks-first-batch | 4/5 | fixed flight time; Ignite burn tick not yet seen | `fly(..., until)` |
| hulls | not in the list; failed in the suite | tapped while list / Hornet sheet still moving | stable-rect wait, retry until right sheet |
| mitosis-blocks | failed in the suite once | taps lost while picker moved | `place` retries until the block is on the cell |
| skills | failed in the suite once | panel read before redraw | waitFor |
| captains | failed in the suite | real effect of the new invulnerability | script clears `invuln` |

Also: `lib.waitFor`, `lib.seedRandom`, and a 1.5 s pause between scripts in the runner (it already ran one script per process, each in its own browser, so each has a fresh page). Details: DECISIONS 426-428.

Full-suite results on this branch while fixing (before -> after): runs 1-4 had 1-2 failures each (37-38 of 39, one run 39); after the hulls / builder-extra / mitosis-blocks fix, run 5 and 6 green, run 7 failed `skills` (fixed), then runs 8, 9, 10 all 39 of 39. Typecheck and 950 unit tests pass.

## Not verified
- I did NOT run the six named scripts 5 times each on this branch; the "after" evidence is the 10 full-suite runs, not a per-script 5x table. The main column is per script alone, and the other failures only showed up inside the suite.
- Flakes are timing-dependent: three green runs on this machine do not prove none remain on a slower one.
- `seedRandom` was added but no script uses it; `freefly` and `blocks-first-batch` use capped "until" loops instead.
- The blink while invulnerable was not looked at in a screenshot; it is the existing cue, unchanged.
- Production build and the real phone were not tested.
