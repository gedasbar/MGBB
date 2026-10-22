# Chunk 17a: ship ladder and Shop affordability mark

Branch `chunk-17a` (from `origin/main` at 559d74b). Design note: `docs/hull-ladder.md`. Decisions 273 to 287 in `DECISIONS.md`.

## What changed

- **19 hulls** (`src/data/hulls.ts`, layouts in `src/data/hullLayouts.ts` and `src/game/gridUtils.ts`): Dart, Twin, Prong unchanged; 14 new hulls; Fan and Shuttle keep their layout and get new prices and the "big" size class. Every new layout is drawn in the design note (committed before the code) and checked by script and unit test (valid, G on the bottom edge, everything connected, every ejector routable with a plain straight-and-turn path).
- **Size classes**: small 26 x 34 / hit radius 8, medium 34 x 44 / 9, big 44 x 56 / 10, huge 56 x 70 / 11. The radius is read by Free Fly, the walls and the wall bot. **Shot speed** is a per-hull multiplier on projectile speed.
- **Ship art**: the 14 new hulls are generated from their layout (plated cells, ejector tips with a coloured square, engine bar). The five old hulls keep their art (scaled to their class).
- **Hull picker** in the builder (ship button): all 19 by price, scrollable, unowned dimmed with price, info sheet (cells, ejectors, pulses/s, shot speed, size, layout preview, price) with Buy; after buying the hull is selected. The Shop is blocks only (no Hulls tab, no info line).
- **Shop marks**: brightness no longer means "owned" (only locked tiles are dimmed); a small yellow dot on a tile when the next copy is affordable and below the cap; the same dot on affordable unowned hulls in the picker.
- **Saves**: no shape change, no version bump (8). Owned Fan / Shuttle are kept; unknown hull ids are ignored.

## Final prices (`scripts/hull-pricing.ts`, `scripts/hull-pricing-fit.ts`)

Model: the player saving for hull n stands at an effective tier (campaign tier 10 at the Wisp, +9 per hull, then Frontier tier 25 + 0.3 x ring, the Zenith at ring 400). Income per run = the larger of the bot's Free Fly run with the previous hull's sensible build and a half-clear of the content there. Price = 4.5 runs, growth clamped to 1.5 to 2.0, two significant digits. Dart, Twin and Prong are unchanged.

| # | hull | price | where a player can afford it | income / run there | runs |
|---|---|---|---|---|---|
| 1 | Dart | free | - | - | - |
| 2 | Twin | 70 | Free Fly (any) | 76 | 0.9 |
| 3 | Prong | 350 | Free Fly (any) | 129 | 2.7 |
| 4 | Wisp | 700 | campaign tier 10 | 182 (Free Fly) | 3.8 |
| 5 | Hornet | 1.1K | campaign tier 19 | 246 (Free Fly) | 4.5 |
| 6 | Lancet | 1.7K | campaign tier 28 | 321 (Free Fly) | 5.3 |
| 7 | Kestrel | 2.6K | campaign tier 37 | 462 (Free Fly) | 5.6 |
| 8 | Mantis | 3.9K | campaign tier 46 | 782 (half-clear) | 5.0 |
| 9 | Bastion | 6.2K | campaign tier 55 | 1.4K | 4.5 |
| 10 | Halberd | 11K | campaign tier 64 | 2.5K | 4.4 |
| 11 | Corvette | 19K | campaign tier 73 | 4.3K | 4.4 |
| 12 | Trident | 33K | campaign tier 82 | 7.4K | 4.5 |
| 13 | Galleon | 58K | campaign tier 91 | 13K | 4.5 |
| 14 | Shuttle | 96K | campaign tier 100 | 21K | 4.5 |
| 15 | Spire | 190K | Frontier ring 280 | 44K | 4.3 |
| 16 | Leviathan | 330K | Frontier ring 310 | 73K | 4.5 |
| 17 | Fan | 500K | Frontier ring 340 | 94K | 5.3 |
| 18 | Citadel | 820K | Frontier ring 370 | 182K | 4.5 |
| 19 | Zenith | 1.3M | Frontier ring 400 | 284K | 4.6 |

Growth per hull from the Wisp: 2.00, 1.57, 1.55, 1.53, 1.50, 1.59, 1.77, 1.73, 1.74, 1.76, 1.66, 1.98, 1.74, 1.52, 1.64, 1.59 (the brief asked for roughly 1.6 to 2; the economy's own growth over a 9-tier step is 1.55). The brief's starting prices were kept for the Wisp (700) and lowered from the Hornet on (1.5K to 1.1K ... Zenith 2.5M to 1.3M).

Caveats (also in the design note): the Free Fly income is the bot's with a 600 s cap; the sensible build feeds at most three ejectors (the Citadel and Zenith are better than measured); the "previous build passes it" column of `hull-prices-raw.md` uses a sparse tier scan, not strict unlock order: in strict order the Wisp build stops at tier 36 and the Kestrel build at 53 (below), and the Fan and Citadel builds pass Frontier ring 350 but not the next scanned ring (400) where the Citadel / Zenith are priced.

## Bot check (sensible builds, `scripts/hull-botcheck.ts`)

| hull | recipes | est. DPS | highest campaign tier passed (strict order) | first tier not passed | Free Fly waves (3 seeds) |
|---|---|---|---|---|---|
| Wisp | 1 | 33 | 36 | 37 Slab (crashed, 3% destroyed) | 9, 9, 9 |
| Kestrel | 3 | 63 | 53 | 54 Slab (crashed, 1% destroyed) | 11, 11, 11 |
| Trident | 3 | 425 | 100 | none | 15, 14, 15 |
| Spire | 3 | 513 | 100 | none | 15, 14, 15 |
| Zenith | 3 | 5,124 | 100 | none | 21, 21, 20 |

Every Free Fly run ended by dying before the 40 minute cap. These are bots, not people.

## Verification

- `npx tsc --noEmit`: clean. `npx vitest run`: 657 passed (568 before; 75 new in `tests/hullLadder17a.test.ts`, the rest are updated tests of the old ladder).
- Mutation checks (each made a test fail, then restored): wall hit radius ignoring the hull; shot speed not applied; yellow dot shown at the cap; Kestrel `EEE` -> `EE.`; buying without selecting; Free Fly contact radius back to `HIT_RADIUS`. One mutation (select before paying) was equivalent (the model refuses an unowned hull).
- E2E: the full suite once on the branch and once on a clean `git archive` of `origin/main`. Failing on both and untouched: `blocks11a` (2), `blocks9a`, `builder` (1), `campaign` (4), `chunk1` (2), `economy` ('sheet closes', then a timeout). New failures were only scripts that drove the old Shop Hulls section or hull panel (`builder-extra`, `cheats`, `freefly`, `shop16b`, `economy`); they now use the picker and pass, except the Fan part of `economy.e2e`, which sits behind that script's pre-existing failure. `frontier15a`'s frame-rate check is flaky (failed on the baseline and on the last branch run, passed on the first branch run). `builder-extra` failed one pixel check in the last full run and passed three standalone runs. New `e2e/hulls17a.e2e.cjs`: 25 checks pass.
- Contact sheets at 360 x 740 (`reports/chunk17a/contact_17a.png`): the picker with the Hornet's info sheet open (stats, a U-shaped layout preview, a dimmed Buy button reading 1.1K with 800 credits), the builder after buying the Wisp (a 1 x 5 column, "Bought the Wisp"), the picker with 5K credits (yellow dots on the unowned hulls it can pay, none on the owned Wisp), the Shop with yellow dots and padlocked tiles dimmed, and two flight frames. `flight_hulls_17a.png` (3x crops): the Dart is a small grey arrowhead; the Galleon a plated broad hull with five purple ejector tips and a tapering stem; the Citadel a plated ring with a dark hole and eight tips, with cyan shots above it. `sheet_hulls.png`: all 19 silhouettes at 1x and 2x.

## Deviations from the brief

- Hornet: the generator emits upward only, so the U has its generator in the middle of the base and equal arms (my first draft, G at the end of the base, left half of it unreachable). Corvette has a one-cell notch to hit 26 cells exactly.
- Prices from the Hornet up are lower than the starting points (above).
- Shuttle and Fan are drawn bigger and have hit radius 10 now (they are "big").
- Old five hulls keep their hand-made art (a different look from the generated plated hulls).
- The Shop's tile list starts higher (the info line and section buttons are gone), `state()` of the Shop lost `section` and `inspector`.
- The edge margin of the ship centre (13 px) is unchanged, so a huge ship's art can overhang a screen side by up to 15 px.

## Not verified

- How bigger hit circles feel on a phone (big about 25% wider than small to dodge, huge about 40%).
- The art on a real phone screen (generated plated grids next to the smooth old five).
- That the prices feel right for a human (the model is bot Free Fly plus half-clear of walls; Free Fly bot capped at 600 s in the income table).
- A huge hull's overhang at the screen sides.
- The Fan buying path of `economy.e2e` (blocked by that script's existing failure; the same flow is covered by `hulls17a`).
- Sound of the Buy button on a device; nothing here can be heard in headless runs.
