# Block palette (chunk 16b, reworked in 16e)

One component, `TilePalette` (`src/builder/tilePalette.ts`, pure maths in `paletteLogic.ts`), feeds two screens: the builder's bottom
sheet (`picker.ts`, opened by tapping a selected buildable cell) and the Shop tab (`ShopScreen.ts`, blocks only). The builder lists
every block but only places owned ones; the Shop buys and upgrades. Hulls are bought in the builder's hull picker
(`hullPicker.ts`, drawn by `BuildScreen`).

## Layout (game px, the 540 x 960 canvas; a 360 px phone shows it at 0.667x)
- **No tabs.** One scrolling list, ordered Pathing, Damage, Modifiers, Status, Mitosis, then the data file's order. No headings.
- **Tile** = the block's glyph on one flat plate (78 x 78) with its name under it (16 px, quiet grey, one line, ellipsis) in a
  102 x 108 hit box. No connector art, no coloured frame, no badge box. 4 columns: x from 30, 24 px between tiles, 18 px between
  rows, 15 px above the first row. Every layout number is a multiple of 3 so it lands on whole CSS pixels at 360 px wide.
- **Count**: a small plain grey number in the plate's top right: builder = free to place, Shop = owned. Hidden when the player
  owns none; a very dim 0 when owned but all placed (builder).
- **Dimming**: unowned and locked blocks at alpha 0.35 (locked ones also get a small padlock top left), owned-but-none-free at 0.7.
- **Selected tile**: one 3 px white frame 3 px outside the plate (four filled bars, not a stroke).
- **Info sheet**, only while a tile is selected, as tall as its text: name, level, description, one status line (owned / free,
  "Not owned · buy it in the Shop", "Locked: <requirement>", or a preview warning). Builder: compact, one small Place (or Remove)
  button on the right. Shop: Upgrade and Buy in a row under the text; a locked block has no button row.
- Builder: the palette is the bottom 384 px (three tile rows); with the sheet open the list shrinks to about two rows plus a peek of
  the third. The circuit keeps the rest. There is no close button: a tap on the circuit above closes the palette.
- Shop: the list fills the space between the title bar and the tab bar; the sheet sits above the tab bar.

## Selecting and placing
- Builder: tap a tile = preview on the circuit and open its sheet; tap the same tile again (or Place) = place and close. An unowned or
  locked block cannot be placed: its sheet says where to get it and a second tap only shows that as a message.
- Shop: tap a tile = select and open the sheet; tap it again = close it. Buy and Upgrade call `ProgressStore.buyCopy` / `buyUpgrade`
  (upgrades also `model.refreshLevels()`), same prices as before.
- A tap in a gap between tiles does nothing.
- The preview warning "No ejector reached" is shown in the sheet's status line (for blocks that can be placed); the top line of the
  builder keeps describing the selected cell, so a block's info is in one place only.

## Hull picker
`BuildScreen.openHullPanel` lists all five hulls. Owned ones switch on a tap (as before); an unowned one is dimmed with its price,
a tap selects it and shows slots, ejectors, pulse rate (all read from the hull grid and tables, `hullFacts`) and a Buy button;
buying (`buyAndSelectHull`: `ProgressStore.buyHull` then `model.switchHull`) selects the hull. A tap outside the panel closes it.

## Testing hooks
`window.__mgbm.buildScreen.picker` and `window.__mgbm.shopScreen.palette` expose `tiles`, `tileScreenRect(id)`, `reveal(id)`,
`listRect`, `scrollY`, `maxScrollValue`, `selected`, `sheetOpen`, `sheetRect`, `sheetButtonRect(id)`, `countOf(id)`, `alphaOf(id)`,
`padlockOf(id)`, `nameOfTile(id)`. The builder's `state()` adds `sheet` and `hullPanel` (rows with state and rect, the Buy rect);
the Shop's adds `sheet`.
