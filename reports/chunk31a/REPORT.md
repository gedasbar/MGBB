# Chunk 31a: Shipyard, part 1

Branch `chunk-31a` (from `origin/main` 4f2211d). Design note: `docs/shipyard.md`. Decisions 513-526.

## What was built
- **Cores** (`src/shipyard/cores.ts`): earned only in Free Fly and Frontier Free Fly squares, from the first run. `round(2 x 1.08^(wave-2))` per wave started, `2 x wave` more at each Medal-wave milestone in every run, Core Magnet multiplies. Shown in the Free Fly HUD, the run summary and the Free Fly home screen (with the "opens at Frontier ring 150" line).
- **Save version 14**: `cores`, `chunks`, `designs`; older saves start with 0 / none / none (tested, also Export / Import).
- **Chunk data** (`src/data/shipChunks.ts`): 7 plain, Generator, 3 guns, 5 traits, with a plain-words validator.
- **Custom hull rules** (`src/shipyard/design.ts`): validity with per-chunk plain errors, compile to the normal ROWS layout, stats, ownership and prices; `state.ts` (buy, save design, sanitize) and `registry.ts` (flyable designs become `custom1..3`).
- **Unlock and flying**: ring 150; a valid, owned design is "Custom 1 / 2 / 3" in the hull picker and flies through the same builder / compiler / world code. Traits act in the run (Wide Open damage, Extra Life as a Second Chance with 1.5 s, Core Magnet).

## Income model and prices (`npx vite-node scripts/shipyard-model.ts`)
| run reaches wave | Cores a run | Cores an hour |
|---|---|---|
| 10 | 55 | 471 |
| 15 | 108 | 627 |
| 25 | 233 | 822 |
| 40 | 717 | 1,593 |

A starter ship (Generator, Corridor, Front Gun) costs 325 Cores (under an hour). The 9-chunk "sensible full ship" with two traits costs about 4,700 (6-10 hours of Free Fly); the 16-chunk maxed ship about 13,000 (16-29 hours); one of every chunk three times 48,000.

## Stats of three example designs next to the Zenith (printed by the unit test)
| ship | chunks | cells | ejectors | pulses/s | shot speed | size |
|---|---|---|---|---|---|---|
| small (Front Gun over Generator) | 2 | 8 | 1 | 4.8 | x1 | small |
| medium (9 chunks, 1 Overdrive) | 9 | 34 | 2 | 4.65 | x1 | big |
| maxed (16 chunks, 3 Overdrive) | 16 | 99 | 6 | 4.03 | x1 | huge |
| Zenith (hull ladder) | - | 80 | 10 | 4 | x1 | huge |

## Tests
- `npx tsc --noEmit` clean; `npx vitest run`: 60 files, 1,182 tests pass (50 new in `tests/shipyard.test.ts`; the version assertions of older tests moved 13 -> 14).
- **Mutation checks (10, all caught by the new tests):** dropped the 1.5 pulses/s floor; skipped the connected-to-generator rule; Cores per wave off by one wave; a v13 save keeping Shipyard fields; chunk price growth off by one; unlock at ring 151; Extra Life without its charge; no milestone bonus; skipped the nothing-above-an-ejector rule; Core Magnet multiplier ignored.
- **E2E (dev server, all pass):** `freefly` 19, `freefly-waves` 10, `hulls` 25, `save-transfer` 13. `block-economy` 12 and `production-build` 25 also pass. `freefly-waves`, `save-transfer`, `block-economy` and `production-build` had stale "version 13" checks that were updated to 14.
- Looked at in the browser: the Free Fly home screen (Cores row and hint line present, START visible) and the Free Fly HUD (a fifth line "Cores +0" inside the plate).

## Housekeeping
Dev server started for the e2e run and stopped (port 5173 free). No worktrees created. `git checkout -- reports` run; no new old-chunk images kept.

## Not verified
- **Balance of a maxed custom ship against the Zenith** (the brief's open item): only the stat table above; nobody flew a custom ship with the bots, and the custom ship's best circuit was not compared with the Zenith's. A maxed ship has 6 ejectors and 99 cells at 4.03 pulses/s against the Zenith's 10 ejectors, 80 cells, 4 pulses/s; the stronger traits (Overdrive, Long Barrel, Extra Life) stack with no cap, so a ship with many of them may outrun the ladder.
- **Cores prices and income** are a model, not a playtest: wave-reached assumptions (12 and 25), 60 s between runs, no captain or skill effects.
- The **run summary's "+N Cores" line** and the Free Fly home screen at a real phone size were not looked at (only the home screen and HUD in the desktop browser pane); the summary layout was only checked through its state hook (`cores`).
- A **custom hull flown in the browser** (picker row, ship art, a Free Fly run with Extra Life) was not played; the unit tests cover the registry, the compiler, the world's second chance and the Cores accrual. The picker row uses the Dart's art at the design's size class.
- The wall world's Extra Life (a crash on a wall) is covered only by the shared code path (`mods.chanceInvuln`), not by a new test; the Free Fly path is tested.
- Ship textures are cached per hull id: if a design changes size class while the page is open, the picker thumbnail may show the old size until a reload.
- Full e2e suite not run (not a big-chunk rule case beyond the named scripts: the brief named Free Fly, saves and the hull picker). - Quitting a Frontier encounter early pays Cores for the full 40 s blocks survived; that was not checked in the browser.
