# Chunk 16b / 16b-fix: block tile palette (Shop) shared with the builder

Branch `chunk-16b` (own worktree `../MGBM-16b`). Design: `docs/palette-design.md`. Decisions 243-250.

## What was done
- **Where blocks are listed (before):** the Shop's Blocks section (cramped cards with name, "Owned n · Lv", Buy + Upgrade) and the builder's bottom-sheet picker (125 px tiles with names, `×n`, category headers; placing only). Nothing else. The first 16b try rewrote only the builder picker; that was the wrong screen and is superseded.
- **One shared component** `TilePalette` (`src/builder/tilePalette.ts`, pure math `paletteLogic.ts`): tabs (All + 5 categories), 4-column scrolling grid of plate tiles with a number badge, info sheet (name, level, rule text, owned, Upgrade / Buy with the unchanged prices, lock text and no buy for gated blocks), dim tiles at 0, padlock on gated tiles, last tab remembered, reused display objects.
- **Shop:** Blocks section is the palette; Hulls keep their rows. Same store calls, prices, toasts, sounds.
- **Builder:** the picker is the same component feeding the builder inventory; tap = preview, tap again (or the sheet's Place / Remove) = place, a tap on the circuit still closes it. No Buy / Upgrade there.

## Tests
- `tsc` clean. Unit: 507 pass (37 files); new `tests/palette.test.ts` (23): layout math at several widths, 44 css px targets at 360, scroll limits, reveal, culling, hit testing and tile -> block mapping, tab filtering / partition, remembered tab (bad values, blocked storage), badge text (0, 1, 15, 99, 100+, negative, NaN), sheet content (owned, unowned, locked, maxed, poor, Remove).
- **Mutation checks** (each broke the code, the named tests failed, then restored): scroll clamp +1 (failed: empty-tab and scroll-limit tests), badge cap `>=` (failed: badge text), locked block still offering Buy (failed: locked-block test), hit test `<=` on the far edge (failed: gaps / far edge test).
- **e2e:** new `e2e/shop16b.e2e.cjs` 24 / 24. Baseline on origin/main (third worktree, same machine) vs this branch, each script once: baseline failures were `campaign`, `damage14a`, `economy` (exit 2: no `?debug=1`, so it never reached the Shop), `freefly-waves`, `freefly`, `frontier15a` (perf). On this branch only `frontier15a` (perf, also fails on baseline) and the old `economy` setup error remain; `economy` run with `?debug=1` passes 35 / 35 on both. NEW failures I caused and fixed in the scripts: `builder` (list scroll amount), `blocks11a` (end-of-list check assumed old layout), `economy` (old badge text read). `builder`, `builder-extra`, `chunk1`, `blocks9a`, `blocks11a`, `frontier15b` pass after the updates. Tests that passed on baseline but failed under load on my first, parallel run were re-run alone.

## Contact sheet `reports/chunk16b/shop16b_contact.png` (opened and looked at)
Seven panels (360 x 740 phone window unless noted): 1 Shop default, All tab: tab row (All white, Pathing blue, Damage red, Modifiers purple, Status teal, Mitosis amber), four tiles per row of plate art with number badges top right, some dim tiles with 0 and a yellow padlock top left; 2 Damage tab: eight damage tiles, the Damage chip filled red; 3 Flat + selected: white outline, an info sheet at the bottom (name, "Level 1/10", one-line rule, "Owned 20", two buttons "Upgrade L1→L2 / 120" and "Buy +1 / 1.64K") and an empty gap between the two tile rows and the sheet; 4 Delay Line (0 owned): badge 0, sheet says Owned 0 with Buy; 5 Random Router (locked): padlock tile, sheet shows "Locked: Reach ring 10 North" and no buttons (a leftover "Locked: ... on the Frontier" toast from the test's forced press sits over the sheet text); 6 the same Shop in a 1600 x 900 window (canvas letterboxed, tiles bigger, still 4 columns); 7 builder: the new tab row, tiles, an info sheet for Turn Left with a single full-width "Place" button.

## Deviations
Builder keeps its two-tap place (the 16b text said a tap on the same tile closes; here it closes only in the Shop). Columns fixed at 4 (decision 245). Builder tile badge = free to place, Shop badge = owned. Builder lost the sheet's title/hint line and category headers.

## Not verified
- Touch feel on a real phone (tap accuracy, drag-vs-tap on tiles, scroll momentum): only mouse events in headless Chromium.
- 100+ blocks: tested with 41; smoothness on a real device unmeasured (tiles hidden off-screen, objects reused).
- Text legibility of the 12-13 px sheet text at 360 px width beyond the screenshots (the contact sheet is scaled to 55 %).
- Frontier lock shown for one block (Random Router); the others use the same code path.
- Merge with chunk 16a (it touches `model.ts` / `compiler.ts` / builder screen); `origin/main` itself had nothing new at merge time.
