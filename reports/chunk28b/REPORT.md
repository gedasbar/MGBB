# Chunk 28b report: settings, cosmetics, hub tabs, Mitosis and Crosswind fixes

Branch `claude/quirky-pasteur-y0ctvb`, started from `origin/main` (28a merged). Gameplay, settings and UI change: full e2e in one run (result below). Decisions: `DECISIONS.md` 479-493. Contact sheet: `reports/chunk28b/sheet_28b.png` (single pictures next to it).

## What was built
1. **Hub** behind the builder's ship button: SHIPS / CUSTOMIZATION / ACHIEVEMENTS tabs. Achievements moved in (button removed from the Captain tab); Achievements / Challenges switch and a "Show completed" toggle (default off, remembered; finished ones go to the bottom of their group when shown).
2. **Settings** in five sections (Graphics, Controls, Audio, Data, About), scrolling list. Frame rate limit Auto / 30 / 60 (ticker `maxFPS`), trails Off / Short / Long, backgrounds, damage numbers, stats overlay, touch control and sensitivity (0.75-2.0), read-only key list, volume / mute / test sound, export / import (copy, file, share / paste, file: unchanged dialogs), reset with a double confirm, version and time played. Settings shape version 2 with `migrateSettings`.
3. **Cosmetics**: projectile skin Auto or a locked look (5 damage-band looks unlocked by best shot, 3 new reward skins), trail styles (Standard + 3 reward ramps) and flat fading trails with a capped segment pool and an automatic fallback.
4. **Mitosis Wall**: a destroyed block splits in its own cell into two halves; a half into two squares; squares do not.
5. **Crosswind** 3x (600 / 840 / 1,080 / 1,380 px/s squared).

## What I looked at (contact sheet, opened)
- Hub: the three tabs are drawn as a strip on top of the panel with the active tab highlighted; SHIPS shows the hull list, CUSTOMIZATION shows the "Auto" tile selected, band 0 unlocked and the other skins dimmed with a padlock and a line such as "LOCKED Land a hit of 100"; scrolled down it shows the trail tiles (Standard selected, Ember / Ace / Pacifist locked with the achievement that pays them).
- ACHIEVEMENTS with Show completed OFF lists only unfinished entries ("Wall breaker 0 / 25 ..."); ON adds the finished ones; the Challenges view lists Start buttons.
- Settings: Graphics (5 rows), Controls (touch control, the sensitivity track at 1.00x, the key list), Audio, Data / About (version `v550756b · 2026-11-02`, time played) and the Back button fixed at the bottom.
- Trails in Free Fly: thin fading teal tails behind the cyan dashes (Long clearly longer than Short). They are subtle at the small damage band's width; I did not change that.
- Mitosis: a close-up (x4) shows the block's cell holding two tall rectangles side by side with a gap, the neighbours untouched; after destroying both, four small squares in a 2 x 2 inside the cell (the sheet's last picture shows them small and blue).

## Tests
- Unit: `tests/chunk28b.test.ts` (14: settings v1 -> v2 migration and junk values, frame limit mapping, sensitivity applied, skin unlock by band and by cosmetic id, locked skin falls back to Auto, sprites use the skin, trail shape, segment cap incl. a cap that does not divide, automatic off) and `tests/lateEffects.test.ts` (Mitosis: 1 -> 2 -> 4 pieces, inside the cell, HP shares, credits, hazard at real size; Crosswind: 3x numbers, uncorrected miss at 400 px, a counter exists at 250 px on every tier). Whole unit suite: see below.
- **Mutation checks (7, all caught):** frame limit validation removed; sensitivity ignored; skin band threshold `>=` -> `>`; trail cap check removed (first survived: no test had a cap the trail size does not divide; added one, now caught); split axis swapped (2 tests fail); `CROSSWIND_STRENGTH` 3 -> 1; touch gain clamp removed.
- E2E: new `hub-settings` (36 checks), `trail-cost`, `achievements` rewritten for the hub (40), sheet script `sheet-chunk28b.cjs`; `late-effects` updated for halves.

## Numbers
- Trail cost, full 4,000-shot pool, headless Chromium (JS time of `ShotSprites.sync`): Off 0.15 ms, Short 0.35 ms (1,200 segments), Long 0.29 ms (1,200 segments). The automatic fallback (3 ms over 30 frames) never fired.
- Crosswind: uncorrected 0% of the no-wind lane damage at 400 px on all four tiers. Bots (point-blank) are not affected by the wind and cannot clear tiers 172 / 189 with or without it. Counters at 250 px exist on every tier; at 400 px only on tiers 118 and 136 (DECISIONS 492).

## Deviations / decisions to review
- Touch sensitivity is tap-on-track plus - / + (a drag on the track would scroll the list).
- Trails are drawn along the shot's current heading, not its past path (no history, cheap).
- Settings (including the cosmetic choice and "Show completed") are device settings, not part of the save or its export.
- Crosswind at 400 px range has no counter on the two later tiers (design intent, but your call).
- Only the first 240 (Long) / 400 (Short) visible shots have trails at a very full pool.
- `WIND=cross npm run interaction-audit` was re-run and `docs/interaction-audit-wind-cross.md` regenerated.

## Not verified
- **Trail cost on a real phone** (GPU, 120 Hz): only JS time in headless Chromium was measured.
- Touch sensitivity and the settings scrolling by finger on a real phone (only mouse wheel and taps were tested).
- Share button of the export dialog and clipboard paste (unchanged code, not exercised here).
- The frame rate limit's effect on a real display (only `ticker.maxFPS` was read back).
- Whether Crosswind is fun / fair at the new strength with real play.
- Visual appearance of the reward skins / trail styles in flight (their tiles were drawn; no reward was earned in flight screenshots).
