# Chunk 17-cleanup: tidy the code (no behaviour change)

Branch `chunk-17-cleanup`, one commit per step. Nothing in the game, numbers, saves or look was changed on purpose.

## Baseline (step 0)
Typecheck clean, 657 unit tests pass. The first e2e baseline was spoiled by my own edits (the dev server served the working folder), so it was repeated on a clean worktree of `origin/main`. Failing on `main`: `blocks11a` (2 checks), `blocks9a` (1), `builder` (1), `chunk1` (2), `economy` (1, then a script error), `frontier15a` (frame rate), `ring` (1). `campaign` passed on the clean run.

## What moved
- All 19 hull layouts: `src/data/hullLayouts.ts`, price order, legend and `idea: TODO` per hull. `HULL_ROWS` is built there; `gridUtils.ts` imports it.
- `src/data/hullValidate.ts`: plain-language layout validator, used by `tests/hulls.test.ts`. Mutation check: Kestrel with its top row `E_E` printed "Kestrel: needs 3 ejectors, found 2" and "Kestrel: needs 12 buildable cells (_), found 13"; disabling the unreachable-cell loop failed the validator test.
- `docs/EDITING.md` (new); `BLOCK_ECONOMY` has a column comment header.
- Unit tests renamed to topics (`hulls`, `blockEconomy`, `orientationAndWallResult`, `newBlocksPathingDamage`, `mitosisBlocks`, `frontierSquaresAndUnlocks`, `starterLoadout`); `phase1` + `system` merged into `engine.test.ts`. No test deleted. e2e scripts renamed (`basics`, `blocks-first-batch`, `mitosis-blocks`, `block-economy`, `wall-edges`, `frontier-map`, `frontier-map-fix`, `frontier-squares`, and the chunk suffix dropped elsewhere).
- `SPEC.md` and the old `REPORT.md` are in `docs/archive/`. README rewritten.

## What was deleted
- Modules: `src/data/captains.ts`, `worldMap.ts`, `quests.ts`, `skillTree.ts`, `src/ui/tutorial.ts`, `src/gen/backgrounds.ts`, `src/debug/autoplay.ts`. Nothing imported them.
- Bosses: `src/engine/boss.ts`, `src/data/bosses.ts`, `tests/boss.test.ts` (only the test used them).
- Dead code found with `npx knip` (not installed as a dependency): 152 unused exports/types lost their `export`; the ones `tsc` then showed as unused were deleted: `drawChevron`, `SLOTS`, `resetBuilderModel`, `CATEGORY_LABEL`, `waveAt`, `DIR_OPPOSITE`, `reachedEntries`, `firePulse`, `ENEMY_SPEED`, `cellIndex`, and the unused `warnings` list of `InfoPanel`. Unused re-exports removed: `VOICE_CAP`, `SOUNDS`, `PlayOpts`, `SfxId`, `PROJECTILE_SPEED` (from world), `UPGRADE_MUL`/`UPGRADE_GROWTH` (from economy), `REMOVE_TILE` (from tilePalette). No leftovers of the old hull shop, category tabs, auto-orient modes or the 14a stacking rule were found in `src/`.
- `reports/chunk1` to `chunk13a`: 70 screenshots (11 kept because a markdown file names them). All `.md`/`.txt`/`.json` kept.

## e2e verdicts
| script | before | verdict |
|---|---|---|
| `economy` | sheet-close tap, then script error | **fixed**: `debug=1` set before `lib` loads, sheet closed by tapping the circuit, Shop part rewritten for tile sheets (Splitter 2 = 120, no levels) |
| `blocks-first-batch` (was blocks9a) | "sheet closes" | **fixed** (sheet-close tap) |
| `mitosis-blocks` (was blocks11a) | 2 fails | **fixed** (same cause) |
| `builder` | strip warnings count | **check deleted** (no warnings cell since 16a) |
| `basics` (was chunk1) | 2 fails | **fixed** (block string no longer ends `:false`) |
| `frontier-map` (was frontier15a) | fps check | **made report-only** (`INFO` line) |
| `ring` | screenshot windows | **fixed** (timing windows widened; two checks) |
| `campaign` | known failing | passes on clean `main` and now; **no change** |

Final run (`npm run test:e2e:all`): 27 of 28 passed, `ring` failed once (seam at x 11), was fixed and then passed 3 of 3 reruns. The other 27 were not rerun after the `ring` fix, which only touches that script. `npm run test:e2e` (smoke: browser, basics, cheats, pause, shop, hulls) passes. Typecheck clean, 656 unit tests pass.

## Files I would split (not done)
- `src/engine/projectiles.ts` (888 lines): by the section markers already in it: bouncing + edge bounce, orbit ring, damage and status (`applyDamage`, ignite/freeze/corrode), Residue clouds and Gravity Wells, steering/homing; constants and the `EffectCounters` types into their own file.
- `src/screens/BuildScreen.ts` (672): toolbar and gestures, picker/hull picker wiring, stats strip and help text, selection/placement logic.
- `src/screens/FrontierScreen.ts` (585): map rendering/pan-zoom vs. square selection and run launch.
- `src/game/world.ts` (577) and `src/wall/wallWorld.ts` (521): the shared run loop, hit handling and result logic.

## Not verified
- Behaviour on a phone; nothing about gameplay was touched, but only the e2e/unit suites were run.
- The 27 e2e scripts that passed in the full run were not rerun after the `ring` fix; the later changes were limited to `ring.e2e.cjs` and docs.
- `npm run balance-*` and `scripts/*` were not run (only typechecked); removing exports could not break them at runtime unless something imports a removed name dynamically, which a search did not find.
- Some deleted screenshots might be referenced from places other than markdown files (e.g. commit messages).
- The `idea:` lines in `hullLayouts.ts` are all "TODO" (owner fills in).
- The e2e frame-rate numbers are headless software rendering, not a phone.
