# The e2e suite (chunk 33a)

Tooling only. `scripts/run-e2e.cjs` is the runner; the scripts are `e2e/*.e2e.cjs`.

## Commands

| Command | What it runs |
|---|---|
| `npm run test:e2e` | the `smoke` scripts (browser, basics, cheats, pause, shop, hulls) |
| `npm run test:e2e -- --area shipyard,freefly` | every script that has one of those tags |
| `npm run test:e2e -- --only map-nav,chunk21a` | those scripts by name (rerun the failures) |
| `npm run test:e2e:all` | every `e2e/*.e2e.cjs`: parallel ones, then `// serial` ones alone, then `// slow` ones |
| `npm run test:e2e:sheets` | the picture and timing scripts `e2e/sheet-*.cjs` (not part of `all`) |
| `node scripts/run-e2e.cjs all --list` | the selection with each script's tags, runs nothing |

Options: `--workers N` (default 3). `GAME_URL=http://...` uses a server you started instead of the runner's own.

## How it works

* The runner starts ONE fresh Vite dev server on a free port and kills it (and its children) when it ends, also after a failure or Ctrl+C. No `npm run dev` is needed.
* Scripts run in a pool of workers; the ones that took longest last time start first (`e2e/out/run-times.json`, not in git).
* A script that fails is run once more. Passing the second time = **FLAKY** (listed with its first error, not counted as failed). Failing twice = **FAILED**, exit code 1.
* The summary: passed / flaky / failed, each script's time, total time.
* `// serial` in the first four lines: runs alone after the parallel ones. `// slow`: runs alone, last (production-build builds the game and has its own server on port 5191).

## Tags

First line of a script: `// area: tag, tag`. Tags: achievements, audio, background, basics, blocks, bosses, builder, campaign, captains, challenges, controls, cosmetics, debug, economy, enemies, freefly, frontier, hub, hud, hulls, late-tiers, map, pause, production, save, settings, shipyard, shop, skills, smoke, wall, waves.

## Moved out of the suite (now `e2e/sheet-*.cjs`)

`sheets-bg.e2e.cjs` -> `sheet-backgrounds.cjs`, `sheets-rocks.e2e.cjs` -> `sheet-rocks.cjs`, `sheets-ships.e2e.cjs` -> `sheet-ships.cjs` (contact sheets, no checks), `performance.e2e.cjs` -> `sheet-performance.cjs` and `trail-cost.e2e.cjs` -> `sheet-trail-cost.cjs` (frame-time numbers in headless software rendering: they print INFO figures and their checks are sanity limits that wall-clock load can disturb). The older `sheet-chunk*.cjs` and `sheet.cjs` were never in the suite.
