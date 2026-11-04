# Shipyard, part 1 (chunk 31a)

Part 1 (chunk 31a) builds the rules and the data of the Shipyard: a new currency (Cores), 3x3 ship chunks, and custom hulls assembled from chunks. Part 2 (chunk 31b, section 7 below) adds the screen, the fixed custom ship art and a debug cell mode. A valid design flies in every mode through the hull picker.

## 1. Cores

- Display name is one constant, `CURRENCY_CORES_NAME` = "Cores" (`src/shipyard/constants.ts`). Code says `cores`.
- **Earned only in Free Fly and in Frontier Free Fly squares**, on top of the credits. Earned from the first minute of the game, so the bank is full when the Shipyard opens (ring 150).
- Free Fly: when wave `w` starts (w >= 2, so wave `w - 1` was survived) the run earns `round(2 x 1.08^(w-2))` Cores (wave 2: 2, wave 10: 4, wave 20: 8, wave 30: 17, wave 50: 80). Reaching a Medal-wave milestone (5, 10, 15, 20, 30, 40, 50) adds `2 x wave` more, EVERY time (the Medal itself is still once per save). The Core Magnet trait multiplies the run's earnings.
- Frontier Free Fly square: one `coresForWave(min(wave equivalent, 30))` for every full 40 s survived, no milestone bonus (a square has no waves; the cap keeps a late square from paying more than a good normal run).
- Quitting mid-run keeps what the run has earned so far, like credits.
- Shown in the Free Fly HUD (`Cores +N`), on the run summary (a line under the credits total) and on the Free Fly home screen ("Cores: used in the Shipyard, which opens at Frontier ring 150").

## 2. Chunks

A chunk is a 3x3 pattern (`_` buildable, `.` outside, `G` generator, `E` ejector, same legend as `data/hullLayouts.ts`), a Cores base price, a growth per copy owned (1.5) and optional effects. Data: `src/data/shipChunks.ts`, plain and commented. Price of the n-th copy = `base x growth^(owned)`.

| kind | chunks |
|---|---|
| Plain | Full, Corridor, Bar, Corner, T-junction, Cross, Ring |
| Guns | Front Gun (1 ejector, top), Twin Gun (2 ejectors, top corners), Side Gun (ejectors left and right, they fire sideways since 25a) |
| Traits | Wide Open (9 cells, -0.2 pulses/s, -30% damage), Overdrive (3 cells, +0.5 pulses/s), Extra Life (4 cells, one crash forgiven), Core Magnet (5 cells, +10% Cores), Long Barrel (4 cells, +20% shot speed) |

Trait effects add per copy placed (two Overdrives = +1.0 pulses/s; damage and shot speed multiply). Extra Life reuses the captains' Second Chance (the crash is forgiven and the ship is untouchable for 1.5 s; `RunModifiers.chanceInvuln`).

## 3. Designs and the hull rules

A design is a 4x4 grid of chunk slots (12 x 12 cells), row-major, `null` = empty slot = outside the hull. Rules (`src/shipyard/design.ts`, pure, every error a plain sentence with rows and columns counted from 1):

(Rules as of chunk 31c, section 8: the generator is fixed, not a chunk.)

1. The cell directly above the fixed generator is part of the ship ("The cell above the generator must be part of the ship").
2. At least one ejector (on the assembled, rotated grid).
3. Every buildable cell and every ejector is connected to the generator through buildable cells, also across chunk edges (a flood fill on the assembled grid; the message names the chunk: "Twin Gun at row 2, column 3 is not connected to the generator").

The design compiles into the same `ROWS` text layout as a normal hull (empty outer rows and columns trimmed, the bottom row kept), so the builder, compiler and flight need no special case; the compiled rows also pass `validateHullLayout`.

**Stats** (constants in `src/shipyard/constants.ts`): pulses/s = `5.0 - 0.025 x cells` (cells = buildable `_` cells), never below 1.5, then the traits; shot speed 1.0 then traits; size class from the occupied slots (1-2 small, 3-5 medium, 6-9 big, 10+ huge, the normal hit-radius table).

**Ownership.** Chunks are bought into an inventory (`chunks`: id -> count owned; Cores). A chunk placed in a design uses one copy. Designs are blueprints: each is checked alone against the inventory, so two designs may use the same copies (only one ship flies at a time; DECISIONS 520). Up to 3 saved designs. A design flies only when valid and every chunk in it is owned in the numbers it uses.

## 4. Unlock and flying

The Shipyard opens at furthest Frontier ring 150 in any direction (`SHIPYARD_UNLOCK_RING`, the ring Frontier Echo and the skill points read). Cores accumulate before that. A design that is valid, fully owned and unlocked shows up in the hull picker as "Custom 1 / 2 / 3" and can be chosen for any mode. Custom ids are `custom1`..`custom3`; the progress store keeps `ownedHulls` in step with the designs (add when flyable, remove when not), and a registry (`src/shipyard/registry.ts`) puts their layout and stats where the normal hulls' are looked up (`HULL_BUILDERS`, `hulls.ts` stats).

## 5. Save

Version 14 adds `cores` (number), `chunks` (id -> count) and `designs` (3 entries, a design or null). Older saves migrate to 0 Cores, no chunks, no designs (`sanitizeProgress`, tested). Export / Import carries them (it exports the whole progress).

## 6. Prices and income

The numbers and the income model are in `scripts/shipyard-model.ts` (prints the table) and in DECISIONS. Aim: the Cores of about 10-15 hours of Free Fly buy a full sensible ship; a maxed ship is much more.

## 7. Part 2 (chunk 31b): the screen, the art, the debug cell mode

**Where.** The hub's SHIPS tab has a pinned SHIPYARD entry above the hull list: locked (padlock, "Locked: Frontier ring 150") before the ring, with the Cores balance; after it a tap opens `ShipyardScreen`. A valid, fully owned design is "Custom 1 / 2 / 3" in the list with the custom ship's art.

**The screen** (540 x 960): header (back "<", Cores) / design buttons 1 2 3 and the name box (tap to rename) / 4 x 4 grid of chunk slots showing each chunk's pattern (grey buildable cells, orange ejectors, red generator) / status strip: VALID or the first plain-language problem, then the stats (cells, ejectors, pulses/s, shot speed, size class); a slot named in an error has a red outline / toolbar: Undo, Redo, Use this ship (greyed unless valid and fully owned; a tap says why) / the chunk palette.

**Placing.** Tap a slot: the palette opens (the block palette's tile component: pattern, free-copy badge, yellow dot when the next copy is affordable). Tap a tile to see its sheet (text, owned / free, Place, Buy +1 with the Cores price), tap it again to place. An owned-out chunk has Place greyed ("No X left") and Buy is the way. The Remove tile (first, when the slot is occupied) takes the chunk out; placing another chunk on an occupied slot replaces it. Every edit is saved at once.

**Art.** All custom ships share one drawing (`CUSTOM_SHIP_ART`, `src/ui/shipShapes.ts`): a broad solid rectangular hull, short nose, side plates, two engines with flames, flat greys, three accent pieces in one colour (`CUSTOM_ACCENT`). It is scaled by the design's size class like every hull.

**Debug cell mode** (`?debug=1` or a dev server only): the grid becomes single cells (up to 12 x 12, W- W+ H- H+). A tap cycles outside -> buildable -> generator -> ejector -> outside. The strip shows `validateHullLayout`'s sentences. Export shows and copies ROWS text for `src/data/hullLayouts.ts`; Fly test flies the layout in Free Fly without saving.

Pure parts: `editor.ts`, `cellMode.ts`, `viewLogic.ts`. Tests: `tests/shipyardScreen.test.ts`, `e2e/shipyard.e2e.cjs`, sheet `e2e/sheet-chunk31b.cjs` (`reports/chunk31b/`).

## 8. Chunk 31c: the fixed generator, rotation, a builder-like screen, the debug sandbox

**Fixed generator.** There is no Generator chunk any more. The generator is one cell in a 13th row under the 12 x 12 build area, in column 2 of 12 (`GENERATOR_COLUMN` = 1 from 0, the middle of the first bottom chunk; 31c follow-up, it was column 7 first). It fires up into the cell above it, which must belong to the ship. That cell is the bottom-middle cell of the first slot column's bottom slot, so that slot needs a chunk with a cell there (Full, Corridor, Cross, Ring, T-junction ... or any chunk turned so a cell lands there). The shipyard draws the generator with the builder's art under the grid. Saves that owned Generator chunks get their Cores back (60, then 90, 135, ... for the copies, `generatorRefund`) and the chunk leaves their designs.

**Validity.** For designs, official hulls and cell mode: one generator, a buildable cell above it, at least one ejector, every cell and ejector joined to the generator. Removed: "generator on the bottom row" and "nothing above an ejector" (an ejector fires out of the side opposite its entry since 25a, and a chunk can now be turned). Cell mode: the generator can sit on any row but needs a cell above it.

**Rotation.** Every placed chunk turns 0 / 90 / 180 / 270 degrees clockwise (`Design.rot`, `rotateRows`); cells and ejectors move together. Placed at 0, turned afterwards with Rotate left / right (toolbar, or Q / R / Shift+R). Saved with the design (save version 15; older designs have rotation 0).

**The screen** works like the circuit builder: the builder's grid drawing (the red line from the generator included), tap a slot to select it (yellow outline), tap the selected slot again to open the palette sheet, tap a chunk tile to select it, tap it again to place it, Buy in the sheet when no copy is free; Clear / Rotate left / Rotate right / Undo / Redo on the toolbar (D / Delete, Q, R, Ctrl+Z / Ctrl+Y); an error line and the stats strip (cells, ejectors, pulses/s, shot speed, size) under the grid; the bottom tab bar is there as in the builder; "Select" (use this ship) is in the top design row. The grid is drawn without the red path line.

**Debug sandbox** (`?debug=1`, cell mode, "Build & fly"): the drawn layout opens in the real circuit builder as the hull `celltest` with every block free and unlimited, an amber SANDBOX banner and an EXIT button. Fly it from the Map tab (Free Fly or any tier). Nothing is saved to the player's circuits, inventory or hulls (runs still pay the real credits and records). EXIT returns to cell mode with the layout intact. Export stays.

Tests: `tests/shipyard.test.ts` (rules, rotation, migration), `tests/shipyardScreen.test.ts` (editor, geometry), `tests/sandbox.test.ts` (isolation), `tests/hulls.test.ts` (official hulls under the looser validator), `e2e/shipyard.e2e.cjs`; sheet `e2e/sheet-chunk31c.cjs` (`reports/chunk31c/`).

Follow-up (31c, after review): no red path line in the Shipyard grid (cell mode too); a first tap on a slot only selects it, a tap on the selected slot opens / closes the palette; the builder's bottom tab bar is shown; "Use this ship" became a smaller "Select" button in the design row beside the name box; the generator moved to column 2 of 12 (middle of the first bottom chunk), so a Front Gun or Corridor straight over it fires with no block.
