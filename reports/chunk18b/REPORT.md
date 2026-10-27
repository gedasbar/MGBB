# Chunk 18b: difficulty curves, report

Owner decisions applied: blend player, campaign passing stays the safety net, HP first, Free Fly slowed after wave 20, coverage accepted, early game left alone; the Frontier deliberately differs from the audit's x1.001.

## What was done (one commit per step)
1. **Campaign HP:** `BLOCK_HP_SEGMENTS` (x1.06 to tier 40, x1.065 to 60, x1.0525 to 100), tiers 1-30 pinned by test, tier 100 = 3.4K.
2. **Free Fly:** total growth per wave x1.19 / x1.08 / x1.06 after wave 20 (`WAVE_SLOW_GROWTH`). Bot run today vs new (section 9.3 of the audit).
3. **Frontier:** HP on the campaign curve to ring 250 then x1.018 a ring; Frontier-only cheapest-column rule (share 1.0 of the median; campaign 0.3). Tuned with `scripts/frontier-reach.ts`.
4. **Hull trait lines** under the numbers of the info sheet (screenshots `hull-sheet-mantis.png`, `hull-sheet-halberd.png` in this folder: both opened and read; the line fits and overlaps nothing).
5. **Audit model:** builder buyer ranks by estimate x coverage weight; `FORCE=1` rerun; part F of the script and section 9 of `docs/difficulty-audit.md`.
6. **Tests:** `tests/difficultyCurves.test.ts` (7), additions in `wall.test.ts`, `frontierSquaresAndUnlocks.test.ts`, `difficultyModel.test.ts`; 5 mutations made and killed (Frontier late growth removed; Frontier lane share ignored; wide-coverage threshold changed; Free Fly tier-step compensation removed; campaign segment growth changed 1.06 -> 1.07). Typecheck clean, 712 unit tests pass.

## Targets and results

| target | result |
|---|---|
| tiers 1-30 unchanged | pinned in `wall.test.ts`; snapshot hashes of tiers 1, 10, 25 unchanged |
| Free Fly: best builder wave 40, 50 needs a top build; casual Leviathan 20-25 | casual 25 (on target); best model builder **45** (above target; wave 50 not reached) |
| Frontier builder passes 500-700, clears 250-300 | passes 550, clears 250 |
| Frontier casual passes ~300, clears 100-150 | passes **350**, clears 100 |
| nothing passes ring 1000 | builder 0 of 3 squares, casual 0 |

## Bot tables, today (18a walls) -> now

| hull | build | est. DPS | tier passed | tier cleared | ring passed | ring cleared | FF waves |
|---|---|---|---|---|---|---|---|
| Dart | sensible | 4.0 | 19 -> 19 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 5/5 -> 5/5 |
| Twin | sensible | 7.5 | 29 -> 29 | 5 -> 5 | 10 -> 5 | 0 -> 0 | 7/7 -> 7/7 |
| Twin | tuned | 5.0 | 22 -> 22 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 5/5 -> 5/5 |
| Prong | sensible | 16 | 34 -> 34 | 7 -> 7 | 75 -> 5 | 0 -> 0 | 8/8 -> 8/8 |
| Wisp | sensible | 33 | 53 -> 45 | 12 -> 12 | 100 -> 25 | 0 -> 0 | 9/9 -> 9/9 |
| Wisp | tuned | 39 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 10/9 -> 10/9 |
| Hornet | sensible | 44 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 10/10 -> 10/10 |
| Hornet | tuned | 23 | 34 -> 45 | 7 -> 7 | 75 -> 25 | 0 -> 0 | 8/9 -> 8/9 |
| Lancet | sensible | 102 | 53 -> 53 | 15 -> 15 | 100 -> 100 | 0 -> 0 | 11/12 -> 11/12 |
| Lancet | tuned | 188 | 100 -> 70 | 24 -> 24 | 100 -> 100 | 0 -> 0 | 13/13 -> 13/13 |
| Kestrel | sensible | 63 | 53 -> 53 | 13 -> 13 | 100 -> 100 | 0 -> 0 | 11/11 -> 11/11 |
| Kestrel | tuned | 56 | 53 -> 53 | 13 -> 13 | 100 -> 50 | 0 -> 0 | 11/11 -> 11/11 |
| Mantis | sensible | 451 | 100 -> 79 | 29 -> 29 | 150 -> 100 | 5 -> 5 | 14/14 -> 14/14 |
| Mantis | tuned | 1.38K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 | 17/17 -> 17/17 |
| Bastion | sensible | 40 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 9/9 -> 9/9 |
| Bastion | tuned | 48 | 53 -> 52 | 13 -> 13 | 100 -> 50 | 0 -> 0 | 10/11 -> 10/11 |
| Halberd | sensible | 1.3K | 100 -> 97 | 39 -> 46 | 300 -> 200 | 100 -> 50 | 17/17 -> 17/17 |
| Halberd | tuned | 5.26K | 100 -> 100 | 99 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Corvette | sensible | 309 | 100 -> 79 | 29 -> 29 | 150 -> 100 | 10 -> 5 | 14/14 -> 14/14 |
| Corvette | tuned | 491 | 100 -> 79 | 31 -> 31 | 250 -> 150 | 25 -> 5 | 15/15 -> 15/15 |
| Trident | sensible | 425 | 100 -> 79 | 31 -> 31 | 150 -> 100 | 10 -> 5 | 15/14 -> 15/14 |
| Trident | tuned | 1.11K | 100 -> 97 | 39 -> 46 | 300 -> 200 | 75 -> 50 | 17/17 -> 17/17 |
| Galleon | sensible | 348 | 100 -> 79 | 27 -> 27 | 150 -> 100 | 5 -> 5 | 13/14 -> 13/14 |
| Galleon | tuned | 946 | 100 -> 90 | 39 -> 36 | 250 -> 150 | 50 -> 25 | 15/17 -> 15/17 |
| Shuttle | sensible | 2.08K | 100 -> 100 | 53 -> 51 | 300 -> 200 | 100 -> 50 | 18/18 -> 18/18 |
| Shuttle | tuned | 86.1K | 100 -> 100 | 53 -> 53 | 500 -> 400 | 100 -> 100 | 26/27 -> 32/32 |
| Spire | sensible | 513 | 100 -> 80 | 31 -> 31 | 250 -> 150 | 25 -> 10 | 15/14 -> 15/14 |
| Spire | tuned | 1.03K | 100 -> 90 | 39 -> 36 | 300 -> 200 | 50 -> 25 | 16/17 -> 16/17 |
| Leviathan | sensible | 7.58K | 100 -> 100 | 53 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Leviathan | tuned | 574K | 100 -> 100 | 100 -> 90 | 700 -> 500 | 250 -> 250 | 31/32 -> 45/45 |
| Fan | sensible | 2.91K | 100 -> 100 | 63 -> 53 | 350 -> 250 | 100 -> 100 | 19/18 -> 19/18 |
| Fan | tuned | 5.94K | 100 -> 100 | 99 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Citadel | sensible | 2.78K | 100 -> 100 | 63 -> 53 | 350 -> 250 | 100 -> 100 | 19/18 -> 19/18 |
| Citadel | tuned | 4.46K | 100 -> 100 | 78 -> 53 | 350 -> 300 | 100 -> 100 | 20/20 -> 20/20 |
| Zenith | sensible | 5.12K | 100 -> 100 | 100 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Zenith | tuned | 10.6K | 100 -> 100 | 100 -> 69 | 400 -> 350 | 150 -> 100 | 22/22 -> 22/22 |

Career-matched builds:

| position | buyer | build | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|---|
| tier 10 | casual | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 25 | 0 -> 0 |
| tier 10 | builder | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 25 | 0 -> 0 |
| tier 20 | casual | Lancet, 5 dmg blocks L2 | 125 | 100 -> 53 | 21 -> 21 | 100 -> 100 | 0 -> 0 |
| tier 20 | builder | Hornet, 1 Flat+ L1 + 5 Percent x L2 | 121 | 100 -> 53 | 27 -> 18 | 150 -> 100 | 5 -> 0 |
| tier 30 | casual | Mantis, 8 dmg blocks L4 | 731 | 100 -> 90 | 31 -> 31 | 250 -> 150 | 5 -> 5 |
| tier 30 | builder | Mantis, 1 Flat+ L3 + 7 Percent x L4 | 3.27K | 100 -> 100 | 31 -> 31 | 350 -> 250 | 5 -> 5 |
| tier 40 | casual | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 |
| tier 40 | builder | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 -> 100 | 31 -> 63 | 400 -> 300 | 5 -> 100 |
| tier 50 | casual | Halberd, 10 dmg blocks L6 | 3.27K | 100 -> 100 | 53 -> 53 | 350 -> 250 | 100 -> 100 |
| tier 50 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L7 | 27.5K | 100 -> 100 | 100 -> 81 | 500 -> 350 | 250 -> 100 |
| tier 60 | casual | Halberd, 10 dmg blocks L8 | 6.77K | 100 -> 100 | 100 -> 53 | 150 -> 300 | 100 -> 100 |
| tier 60 | builder | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 67.5K | 100 -> 100 | 100 -> 99 | 500 -> 400 | 250 -> 250 |
| tier 75 | casual | Halberd, 10 dmg blocks L9 | 9.76K | 100 -> 100 | 100 -> 63 | 350 -> 350 | 150 -> 100 |
| tier 75 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L10 | 137K | 100 -> 100 | 53 -> 99 | 600 -> 450 | 100 -> 250 |
| tier 100 | casual | Leviathan, 12 dmg blocks L10 | 28.4K | 100 -> 100 | 100 -> 78 | 500 -> 350 | 150 -> 100 |
| tier 100 | builder | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 833K | 100 -> 100 | 100 -> 99 | 700 -> 500 | 250 -> 250 |
| ring 50 | casual | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 |
| ring 50 | builder | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 -> 100 | 31 -> 63 | 400 -> 300 | 5 -> 100 |
| ring 100 | casual | Halberd, 10 dmg blocks L7 | 4.78K | 100 -> 100 | 82 -> 53 | 350 -> 300 | 100 -> 100 |
| ring 100 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L8 | 47.6K | 100 -> 100 | 100 -> 87 | 500 -> 400 | 250 -> 200 |
| ring 200 | casual | Halberd, 10 dmg blocks L10 | 14K | 100 -> 100 | 100 -> 78 | 400 -> 350 | 150 -> 100 |
| ring 200 | builder | Halberd, 1 Flat+ L10 + 9 Percent x L10 | 219K | 100 -> 100 | 53 -> 100 | 600 -> 450 | 100 -> 250 |
| ring 400 | casual | Leviathan, 12 dmg blocks L10 | 28.9K | 100 -> 100 | 100 -> 78 | 500 -> 350 | 150 -> 100 |
| ring 400 | builder | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 847K | 100 -> 100 | 100 -> 99 | 700 -> 500 | 250 -> 250 |

Free Fly (waves, two seeds): casual Leviathan 24 -> 25, builder Leviathan 33/32 -> 45/45, builder Halberd (tier 75) 28 -> 35, others unchanged (see audit section 9.3).

## E2E
Full run (29 scripts): 27 passed. `campaign` and `mitosis-blocks` failed in the full run and passed when run alone; `campaign` fails intermittently on the untouched main source too (3 of 4 runs with `src/` checked out from origin/main, 2 of 4 with the new source), so it is not new. No baseline run was made before the change (see DECISIONS 313). The e2e scripts overwrote old report images; they were restored (`git checkout -- reports`) and new old-chunk images deleted.

## Deviations
- Frontier casual pass 350 (brief: about 300); Free Fly best builder 45 (brief: 40). The constants of the brief were kept for Free Fly; for the Frontier the constants are mine (1.018 and share 1.0).
- Tier 38 block HP fell from 184 to 110 (tiers about 31-46 are easier than before), as the audit proposed.
- The 18a `proposed` bot caches were removed from `reports/difficulty-audit/` (kept in `reports/chunk18b/cache-18a/`).
- Step 0 baseline e2e not completed (see above).

## Not verified
- Nobody played the new curves; everything above is bots, which only own Flat+ / Percent x lines (so every ceiling is a lower bound, and "the best builder" is the best the model knows).
- Bot results are single deterministic walls per tier, ring results use three axis squares and a coarse ladder (the exact Frontier numbers come from `frontier-reach`, three squares per ring, majority rule).
- Tier 100's Last Wall is cleared by no modelled build (99): is that the intended top?
- Frontier Free Fly squares were not flown by the bot (their wave equivalent is capped at 30, below the changed range).
- Saves: no save shape changed; the unit tests do not load an old save file with Frontier progress, they rely on squares being keyed by coordinates.
- The hull trait line was looked at in a 360 x 740 headless viewport only.
