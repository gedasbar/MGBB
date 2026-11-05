# Chunk 32c: Free Fly chunks for the Shipyard

Branch `chunk-32c` from `origin/main` (32b merged). Five trait chunks, each with an upside and a downside, Free Fly only.

## What changed
- `src/data/shipChunks.ts`: Faster Waves, Longer Waves, Wave Skipper, Repair Bay, Boss Bounty (18 chunks; `duplicateShapes()` empty; 1-4 cells; `GROWTH_TRAIT`).
- `src/shipyard/flyTraits.ts` (new, pure) -> `DesignStats.fly` -> `RunModifiers.fly` -> `World.flyT` (neutral in a Frontier encounter; the wall never reads it).
- `WaveDirector(seed, waveTime, skipChance)`; skipped waves are wave events with `skipped: true` (banner "SKIPPED"); Repair Bay in `World.update`; boss HP and Cores in `startBoss` / `defeatBoss`.
- Docs: `docs/shipyard.md` section 9, DECISIONS 585-595, a paragraph in CLAUDE.md. Model output: `reports/chunk32c/shipyard-model.txt`.

## Checks
- `npx tsc --noEmit`: clean. `npx vitest run`: 65 files, 1312 tests, all pass (16 new in `tests/flyTraits.test.ts`; two chunk-count tests updated, 13 to 18 chunks and 5 to 10 traits).
- Mutation checks (DECISIONS 594): four, each made one test fail, then undone.
- E2E (origin/main's runner has no `--area`, so each script was run alone against a dev server): `shipyard` 51 pass, `freefly` 19, `freefly-waves` 10, `freefly-enemies` 19, `freefly-bosses` 43, no failures. Not a full suite run (small chunk). Suite time: not measured.
- Model (`scripts/shipyard-model.ts`), Cores an hour for a run to wave 25, plain 1,246: Faster Waves +23%, Boss Bounty +17%, Wave Skipper +4.5%, Longer Waves -27%, Repair Bay 0. A full ship with the five traits costs 13,809 Cores = 16.8 good Free Fly hours (older reference ship 18.1 h).

## Not verified
- No screenshot was taken: I did not look at the new tiles, their shapes or the info-sheet text in the Shipyard.
- The feel of the numbers in real play (Faster Waves at +10% HP, Repair Bay at 2% a second, how often a skip happens) comes from the model and unit tests, not from flying.
- The "SKIPPED" banner and a chain of skipped waves were checked as events in unit tests, not seen in the browser.
- A skipped milestone wave still pays its first-time Medal (DECISIONS 591): my reading, not the prompt's.
- The Shipyard stats strip does not show the Free Fly numbers.
- Walls and Frontier squares ignoring the traits is covered by a unit test (an encounter world, the damage multiplier), not by an e2e run.
- The dev server on port 5173 was started and stopped by me; nothing listens on it now.
