# Chunk 25a report: ejectors from any side, ejector art, tighter shot spacing

## What changed
1. **Ejector rule** (`src/engine/compiler.ts`): an ejector accepts a signal from any side; the recipe's direction is the signal's travel direction (entered from below fires up, from the left fires right, from above fires down, from the right fires left). The "ejector wrong side" dead end is gone. Angle / Scatter / curves turn the launch vector, so they work relative to the firing direction; Upturn / Align are unchanged ("straight up").
2. **Ejector art** (`drawEjector`, `src/builder/gridView.ts`): inlet slot on all four sides, round bore, white arrow on the exit side of each distinct entry direction (none when no signal reaches it).
3. **Spacing:** `FIRE_OFFSET_SCALE` 0.25 -> **0.125**, `LANE_GAP` 8 -> **4 px**.
4. **No ejector marks on the ship in flight:** `ShipView(renderer, hullId)` no longer takes muzzles or draws ticks.
5. **hullTrait:** three or more ejectors now read "Several guns: more shots a pulse, packed in a tight spread" ("Wide coverage" is no longer true).

## Bots (Halberd and Zenith, standard builds, `scripts/hull-botcheck.ts`, Free Fly capped at 600 s)
| hull | highest campaign tier passed, before | after | Free Fly wave before / after |
|---|---|---|---|
| Halberd | 80 (first fail 81 Spike Slab) | 80 | 15 / 15 |
| Zenith | 100 | 100 | 15 / 15 |
Both standard builds reach only 3 recipes, so this does not test a many-ejector hull.

## Tests
- `tests/ejectorSides.test.ts` (new, 5 tests): left / above / right / below entries; Angle relative to a sideways shot; fingerprint of every hull's standard-build recipes (`157ff3e4`, recorded on the old compiler, equal on the new one); constants.
- Changed on purpose: `compiler.test.ts` (wrong-side test replaced), `chunk21a.test.ts` (gap 4; a lane of 2 is -2 / +2), `frontierSquaresAndUnlocks.test.ts` (hash of rock stats changed because shots land elsewhere).
- **Mutation check:** forcing the recipe direction back to 'N' made 3 of the 5 new tests fail; restored.
- Typecheck clean; vitest 954 passed.
- **Full e2e: 39 of 39 pass in one run on a freshly started server** (port 5180). Stale scripts fixed: `basics` (control pixel is now the ejector bore), `chunk21a` (4 px), `sheets-ships` / `sheets-bg` (new ShipView signature). A first full run on a long-running server had best-earnings, polish, legendaries failing on empty panels; they passed on the fresh server (the "stale server" case in CLAUDE.md).

## Contact sheet (`reports/chunk25a/sheet_25a.png`, `builder.png`, `flight.png`, `flight_before.png`)
I opened them. Builder: a hand-made 11 x 9 board with five ejector cells, each a light-grey square frame with dark inlet slots on its four sides and a round light bore. Fed from the left it has a white arrow on its right side; fed from above, an arrow on its bottom; fed from below, an arrow on top; fed from the right, an arrow on its left. The fifth, with no line, has no arrow. Flight: a Fan with 3 x +1 Projectile; the ship art has no marks beside it. The four shots of the lane now overlap into one solid cyan block about 16 px wide (before: four separate bars 8 px apart, see `flight_before.png`).

## Not verified
- On a phone: the inlet slots are small and I did not check they read at phone size (the sheet is 540 px wide).
- Nothing was flown on a hull that really has a side-fed ejector (no such hull exists); only the unit test and the builder sheet exercise it.
- The bots only reach 3 recipes on Halberd / Zenith, so "wide coverage" was not measured on a many-gun build.
- Curve / Zigzag / Centreline behaviour for a sideways or downward shot is by reading the code (they rotate or pull the velocity); only Angle has a test.
- Dev server on port 5173, started early in this session, could not be stopped (stop was refused); the one on 5180 was stopped.
