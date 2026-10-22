# Block palette (chunk 16b)

The "palette" is the builder's bottom sheet (`src/builder/picker.ts`), opened by tapping a selected buildable cell. Buying and
upgrading used to live only in the Shop tab; the new info sheet brings both into the palette (same store calls, same prices).

## Layout (game px, the 540 x 960 canvas; a 360 px phone shows it at 0.667x)
```
y 470  chip row 66:  [All][Pathing][Damage][Modifiers][Status][Mitosis][X]
y 536  tile list  (scrolls)        4 columns, 125 x 113 tiles, 8 px gaps
y 760  info sheet (only when a tile is selected, 200 high)  name, level, description,
       owned/free, buttons  [Place] [Upgrade L1>L2  price] [Buy +1  price]
```
- Without the info sheet the list is 424 high (3.5 rows); with it 224 (about 2 rows) and the selected tile is scrolled into view.
- Touch targets: chips 66 high, tiles 125 x 113, sheet buttons 66 high. At 360 px wide that is 44 px for chips and buttons and
  83 x 75 px for tiles, so every target is at least 44 px.
- Columns are always 4. The canvas has a fixed 540 logical width and is scaled as a whole, so a wide window makes the tiles
  bigger, never more numerous (a "very wide" window just letterboxes). `tileMetrics(width)` still takes the width so the
  math is unit-tested at several widths.

## Tiles
Only the block's plate art (`drawPlate`) and a number badge (top right: what is still free to place = owned minus placed in the
active circuit, `99+` above 99). The tile is a grey square (no category-colour outline); only the selected (white) or current tile has an outline. A block you cannot place is dim (badge 0). A block gated
by a Frontier ring shows a small padlock in the top left. The "Remove" tile (an X) comes first in every view when the cell holds a block.
Display objects are created once per block and reused (position, visibility and style change, nothing is rebuilt on a
scroll); tiles outside the visible window are hidden.

## No tabs
One scrolling list ordered by category (pathing, damage, modifier, status, mitosis), then data order (`paletteIds`). The
builder panel has no header or X: a tap on the circuit closes it. Tiles are 5 per row (98 x 88 game px, about 65 x 59 css px at 360 wide). The old `mgbm_palette_tab` value is never read.

## Selecting and placing
- Tap a tile: it is selected and previewed on the circuit (as before) and the info sheet opens.
- Tap the same tile again, or the circuit grid: the sheet closes (the grid tap closes only the sheet; the next grid
  tap closes the palette as before). Tapping the tile again deliberately no longer places: the sheet's `Place` button does.
- The builder's info sheet has no Place button (it is shorter, `INFO_SHEET_NO_BUTTONS_H`): the second tap on the selected tile places it (or removes, for the Remove tile). `Buy` and `Upgrade` call
  `ProgressStore.buyCopy` / `buyUpgrade`, and upgrades call `model.refreshLevels()` like the Shop does.
- A block locked by a Frontier ring shows the requirement text and no Buy / Upgrade buttons.

## Testing hooks
`window.__mgbm.buildScreen.picker` keeps `tiles`, `tileScreenRect(id)`, `reveal(id)`, `listRect`, `scrollY`, `maxScrollValue`,
`selected`, `armed`, `isOpen`, `target`. New: `sheetOpen`, `sheetButtonRect('place'|'buy'|'upgrade')`.
