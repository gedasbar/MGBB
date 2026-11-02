# Ship art (chunk 25b: concept sheet)

Status: **concepts only.** Nothing in the game uses them yet (`src/ui/shipArt.ts` still draws the real ships). The owner picks style **A**, **B**, **C** (or a mix, for example A for small hulls and C for huge ones) from `reports/chunk25b/concept-sheet.png`; the next chunk draws all 19 hulls in that style and replaces the in-game art.

## The three styles
- **A, hard-edge fighter:** a pointed nose, a fuselage split into a light and a mid half (a hard facet down the middle), swept wings with a light leading edge, small accent gun tips on the wings, engine blocks at the back.
- **B, industrial:** a blocky plated hull of boxes, dark panel lines across it, side pods, an accent bar for the cockpit, chunky engine blocks. Zenith is a stepped hull (wide gun deck, then narrower plates), echoing its grid.
- **C, silhouette from the layout:** one outline read from the hull's grid (row widths: wisp is a 1-wide needle, halberd a wide axe head on a narrow shaft, zenith a wide front tapering to the engine), drawn as four nested copies like the block plates. Cells are gone, the shape is kept.

## How a hull's art is described in code
File: `src/ui/shipConcepts.ts`. A `ConceptShip` is `{ hull, style, parts, flames }`:
- `parts`: flat polygons in the unit box (x right, y down, nose at the top, (0.5, 0.5) the centre; the same box as `ShipArtDef`, stretched to the hull's size class: small 26 x 34, medium 34 x 44, big 44 x 56, huge 56 x 70 px). Parts are drawn in order, later on top. Each has a `tone`: `edge` (#d4d4d8), `light`, `mid`, `dark`, `core` (the grey ramp of the block plates) or `accent` (one colour per hull, `conceptAccent`).
- You write the RIGHT half as `[dx, y]` points (dx = distance from the centre line) and mirror with the helpers: `full` (shape on the centre line), `right` / `left` (one half, for two-tone facets), `pair` (a wing or pod, drawn twice), `boxPair` / `boxMid` (rectangles), `gunsAlong` (accent gun tips spaced along an edge), `nested` (style C: the outline plus three insets).
- `flames`: `{ dx, y, width, length }`, flat two-tone triangles (orange, yellow) hanging under an engine. In the concept the flame is drawn below the hull box; in the game it would be a separate animated sprite, so the hull texture stays the box.
- Art language rules kept: flat fills, no gradients, no glow, greys with small coloured accents, sharp polygons.

Drawing: `drawConceptShip(graphics, ship, w, h)`. Sheet: `node e2e/sheet-chunk25b.cjs` (dev server running). To add a hull in a style: add a `ConceptShip` and put it in `SHIP_CONCEPTS`; `tests/shipConcepts.test.ts` checks every concept is well-formed.

## Open questions for the owner
1. Style A, B, C or a mix?
2. Flames: part of the ship texture, or a separate animated sprite (next chunk's decision)?
3. Zenith C reads as a shield; Zenith B is the widest silhouette. Is "ship looks like its grid" important, or only "looks like a good ship"?
