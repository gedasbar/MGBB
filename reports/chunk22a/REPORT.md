# Chunk 22a report: the Skill tree

Branch `chunk-22a` (from `origin/main` after 21b). Design note first: `docs/skills.md`. Decisions: `DECISIONS.md` 385-395.

## What was built
- **Rules** (`src/skills/`): points from the furthest Frontier ring (1 per 25 rings to ring 250, then 1 per 50: ring 250 = 10, 500 = 15, 1000 = 25), 1 point per node, a node must touch an owned node (start is free), respec for 10 Medals (5 with the Salvage node) behind a confirm dialog. Save version 11 (`skills`), old saves start with none.
- **Tree** (`src/data/skillTree.ts`): 55 nodes = start + 6 paths x (7 normal + 2 capstones), exactly the list in the brief. Texts are generated from the numbers (`{key%}` placeholders).
- **Effects**: one additive record `SkillEffects`. Compile time (in the block transforms: Turn L/R, Splitters, Curves, Delay Line, Router, Waypoint, Hollow Core, Flat+, Lucky, Jackpot, Gambler, Overclock, Payload, Echo, Idle Barrels, Fuse, Rebound, Brake; at the end of the line: angle, Scatter, Accelerator, Extender, Heavy Round; +1 Projectile start damage), run time (pierce / bounce chance, damage per bounce, AoE penalty, Chain, Persist, Executioner, Fork, Orbit, Mine, Boomerang, Upturn, Last Breath, Zigzag, Lone Shot, Mirror), economy (copy caps, replay / best credits, Free Fly credits, legendary credits, medal-square extra Medal, hero level cost, respec cost). The builder estimate includes the compile-time effects.
- **Screen** (`src/screens/SkillsScreen.ts`): pan / zoom hex map (the Frontier map's `GestureTracker`), owned = lavender fill, buyable = outlined + yellow dot while a point is free, locked = dim, capstones 1.28x larger; top bar with points and Respec; progress bar "next point at ring N"; node panel with name, one line, state and Buy; respec dialog. All five tab bars open it.

## Tests
- `tests/skills.test.ts`: 34 tests (points schedule, adjacency, respec cost and refund, save v11, tree integrity, one or more per path for the effect numbers, the capstones).
- **Mutation checks** (break, see the test fail, restore): points slow step 50 -> 25 (2 tests failed); angle bonus without the angle factor (1 failed); AoE penalty sign (1); adjacency check removed (1); respec cost without the discount (1); replay bonus without the "cleared" condition (1); Persist spend ignored (1); bonus pierce ignored (1).
- 10 old tests asserted `version` 10; they now assert 11. Typecheck clean, 897 unit tests pass.
- `e2e/skills.e2e.cjs`: 18 checks (tab, points, bar, panel, buy chain, locked node, capstone text, pan, zoom, respec cancel / confirm, builder estimate 1 -> 2 after Turn Left).
- Full e2e suite: 35 of 35 scripts passed in one run (fifth run; earlier runs hit stale scripts, a stale server, a machine sleep and a flaky toast check, all fixed or explained).

## Contact sheet (`sheet_skills.png`, opened and described)
Seven frames: builder before the skill (Hornet, damage per shot 1, Turn Left and Turn Right on the red line); Skills tab zoomed out with no points (centre star, six arms of hexagons with block icons, all dim except the first node of each path outlined, "Points 0 / 0", "next point at ring 25", Respec greyed); one path zoomed in (selected Left Edge, panel "Turn Left: +1 damage", Buy enabled, yellow dots on buyable nodes); owned (lavender) / buyable / locked nodes along the Routing arm; the whole tree with three owned nodes joined by lavender links; the respec dialog ("Cost: 10 Medals (you have 25)", Respec / Cancel); builder after the skill (Drop/shot 2).

## Deviations
See docs/skills.md section 6 and DECISIONS 389-394. Short: per-copy bonuses add; Extender +50% is once per shot; "beats the best" needs an earlier best; extra Medal is the captain's double roll; block info texts not changed; Heavy Round does not follow the lower Brake floor.

## Not verified
- Real phone touch (pinch zoom was not exercised; wheel and drag were). The screen was only seen at the 540 x 960 logical view in a 540 x 960 window, not at 360 x 740.
- Balance: nobody played with the skills; the numbers are the brief's. No balance script (`balance-damage`, `difficulty-audit`) was rerun with skills.
- Effects without a direct test: Corner cases of Orbit / Boomerang / Mine are tested by timing in the unit rig only; Zigzag in flight, Last Breath in a real shot, the Upturn in the wall, the Free Fly credit bonus and the "+5% per legendary block" bonus in a real run, and the "skill bonus" line on the wall run summary were not watched in the browser.
- Old saves with a lowered Frontier ring cannot happen; a hand-edited skills list is trimmed (unit-tested, not played).
- Stale dev servers on ports 5173 and 5174 could not be stopped (see DECISIONS 395).
