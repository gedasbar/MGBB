# Ship art (chunk 25c: style C for all 19 hulls)

The owner picked style **C, silhouette from the layout** on the 25b concept sheet. All 19 hulls are drawn in it; the old cell-generated art and the five hand-drawn ships are gone. Hit radius and size classes are unchanged.

## What a ship looks like
- An outline that follows the hull's layout idea (row widths, where the guns sit), smoothed into a ship with a nose, wings and engines.
- Flat fills only: light edge (#d4d4d8), mid grey, dark grey, dark core (the block plate ramp). Colour only in small pieces: the hull's own accent (cockpit diamond, a pair of gun tips), orange and yellow engine flames.
- **At most 4 accent pieces per ship** (`MAX_ACCENT_PIECES`), whatever the ejector count. They are decoration; shots leave from the simulation's own offsets.
- Neighbours in the ladder must not read the same: `tests/ships.test.ts` compares rasterised silhouettes.

## How a hull is described in code
`src/ui/shipShapes.ts`. One `Spec` per hull in `SPECS`:
- `pieces`: convex polygons in the unit box (x right, y down, nose at the top, (0.5, 0.5) the centre; stretched to the hull's size class: small 26 x 34, medium 34 x 44, big 44 x 56, huge 56 x 70 px). Each piece is drawn as four nested copies (edge, mid, dark, core); all edges first, so pieces that touch merge into one silhouette.
- Helpers: `sym(path)` makes a shape on the centre line from its RIGHT half (`[dx, y]`, dx = distance from the centre line, top to bottom); `duo(path)` makes a right and a mirrored left polygon (a wing or a pod); `box(dx0, dx1, y0, y1)` is an absolute rectangle.
- `details`: accent and extra pieces: `cockpit(y0, y1, w)`, `tips(dx, y, w, h)` (a pair of gun tips), or a plain `{ tone, points }`.
- `eng`: `{ dxs, y0, y1, w, flame }` engine blocks at the given offsets (0 = on the centre line, others in pairs) and the flame length (fraction of the hull height, at most `FLAME_MAX_LENGTH`).
- The hull's accent colour is in the `ACCENT` table.
To add or change a ship: edit its `Spec`, run `node e2e/sheet-chunk25c.cjs` (dev server running) and look at `reports/chunk25c/ship-sheet.png`.

## Drawing
`src/ui/shipArt.ts` draws a shape into a hull texture (cached per hull) and two flame textures (long and short). `ShipView` (the flight screens) swaps the flame texture every 0.07 s; `shipThumbnail` (the hull picker) shows the long flame. The hull texture is the unit box only, so the ship stays centred on its hit point.

## Zenith
The capstone has three drawings (`ZENITH_ART` in `src/config.ts`, 1 | 2 | 3): **1** a long spearhead with three layers of wings, **2** a split twin hull with a bridge and a cockpit between, **3** a crescent with a floating spear (in the game, the owner's pick). Change the number to switch.
