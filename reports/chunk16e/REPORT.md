# Chunk 16e: block list and Shop cleanup (UI only)

Branch `chunk-16e` (own worktree `../MGBM-16e`). Decisions 266-277. Design: `docs/palette-design.md`.

## What was done
- Shared tile component (`TilePalette`): icon on one flat plate, name under it, small plain count, one white selection frame, dimmed unowned/locked blocks (padlock on locked). No tabs, one list ordered by category.
- Builder: palette is the bottom 384 px, compact info sheet only while a tile is selected, small Place button, block info in the sheet only, stats strip in K/M/B. Unowned/locked blocks cannot be placed (the sheet says where to get them).
- Shop: blocks only (no toggle, no repeated info line). Prices unchanged.
- Hulls: all listed in the builder hull picker; unowned ones dimmed with price, tap shows slots/ejectors/pulse rate and Buy, buying selects. Old hull shop removed.
- Fixed `fmtBig` (140K printed as 14K).

## Tests
- `tsc` clean. Unit: 558 passed (39 files), full suite re-run after the final tweak.
- Mutation checks (broke code, named tests failed, restored): unowned not dimmed; hull purchase not selecting; unowned placeable; gap taps hitting a tile (all caught).
- e2e: new `tiles16e` 46/46. `builder`, `builder-extra`, `chunk1`, `economy` (`?debug=1`) match the baseline. `blocks9a`, `blocks11a`, `browser` passed in the full run before it was stopped. **The full e2e run was stopped on request**, so `freefly`, `frontier15b`, `polish16a` and the rest were not re-run on this branch.
- Baseline failures on `origin/main` (not new): `builder` 1, `campaign` 4, `chunk1` 2, `frontier15a` 1, `economy` without `?debug=1`.

## Contact sheet `sheet_tiles16e.png` (opened)
Four panels at 360 px wide, 2x scale: builder with palette and one tile selected, Shop default, Shop with a sheet, hull picker with the unowned Twin open. Tiles are clean, 4 per row, gaps even; a 3x crop shows frame and plate edges even. No uneven line seen. At 1x the browser downscale softens edges slightly.

## Deviations
No close button in the builder palette any more (tap the circuit above to close). Place button kept, but small.

## Not verified
- Touch feel and looks on a real phone.
- Full e2e on this branch (see above).
