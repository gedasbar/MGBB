# Core pickups (chunk 32e)

Cores still arrive automatically (wave start, milestones, theme and boss bonuses, a Frontier square's per-40-s block; tuned in 32d to about 500 an hour).
On top of that, killed enemies drop **Core crystals**: small flat teal hexagons (the Cores icon look, 12 px). Together they are worth **+50 %** of the
automatic pay, so a player who collects everything earns about 1.5x an AFK player (about 750 an hour). All numbers: `src/data/coreCrystals.ts`.
Engine: `src/engine/coreCrystals.ts` (`CrystalField`, no Pixi). Drawing: `src/ui/crystalSprites.ts`. Tests: `tests/coreCrystals.test.ts`,
`e2e/core-pickups.e2e.cjs` (sheet `reports/chunk32e/sheet_crystals.png`).

## Value
- A **pool** (`World.crystalPool`) gets `CRYSTAL_SHARE` (0.5) of every automatic Cores payment: a wave start (with its milestone and theme bonus), or in a
  Frontier square half a block per 40 s as time passes. Boss, wave, milestone and theme bonuses themselves stay automatic.
- A kill takes `reward / (reward + everything still to kill)` of the pool (`killShare`; "everything" = live bodies and queued spawns, by credit reward),
  so the pool is spent in proportion to the kills and the last kill of a wave takes the rest. The crystal appears where the body died.
- A crystal is worth a fraction of a Core. The run's Cores are the whole part of automatic + collected, so the HUD number ticks up as the sum crosses a whole number.

## Behaviour
- **Life** 6 s, drifting slowly (22 px/s, slowing down); it **blinks** in the last 1.5 s (`crystalVisible`), then is gone (value lost, still counted as dropped).
- **Pickup:** the ship collects a crystal when its path in that step comes within 28 px (swept: the ship flies up to 2,700 px/s). A soft chime (`crystal`).
- **Cap:** 60 alive. When full, a new drop's value joins the nearest crystal, which gets a fresh 6 s. Nothing is lost.
- Free Fly and Frontier Free Fly squares both drop crystals. Walls do not.
- **Core Magnet chunk:** +60 % pickup radius per copy (1 copy 44.8 px, 2 copies 61.6 px). It no longer changes how many Cores a run pays.
- **Run summary:** "Cores collected 4 / 5 (71%)" under Total credits (collected and dropped rounded, the percentage exact).

## Frontier squares and the 32d wave table
`scripts/frontier-vs-wall.ts` compares a Free Fly square with a wall square at the same ring (DECISIONS 612). The steeper wave HP of 32d (x1.45 a wave
to 30) made Free Fly squares harder than walls from ring 250; above wave 20 the wave equivalent now climbs 0.4 of a wave per wave of the old formula
(`FF_LATE_FROM`, `FF_LATE_SLOPE` in `src/frontier/constants.ts`; the cap of 30 becomes 24).
