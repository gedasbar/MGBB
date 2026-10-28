# Chunk 20a report: legendary blocks

Branch `chunk-20a`, from the tip of `small-fix-19b` (see deviation 1). Design note: `docs/legendaries.md` (written and committed first). DECISIONS 323-337.

## What was built

- Twelve legendary blocks, category **Legendary** (lime `#a8e63d`), one copy, no upgrades, flat plate art, a short player line each (at most 60 characters) and the full text in `docs/blocks.md`:
  North Frontier Echo (100), Payload (200), Lone Shot (300); East Last Breath, Zigzag, Heavy Round; South Hollow Core, Idle Barrels, Waypoint; West Rebound, Mirror, Fuse.
- Unlock rings 10 / 25 / 50 / 100 / 200 / 300 per direction; the four ordinary blocks of the old ring 100 moved to ring 50 (nothing a save owns is lost).
- Price: Medals AND credits. **Final: 15 Medals + 8K (ring 100), 25 + 65K (ring 200), 40 + 300K (ring 300).** The brief's 50K / 200K / 800K were 30 / 15 / 13 runs of a Frontier wall at that ring in the economy model, not the 3-6 asked for; the final prices are 4.9 / 4.9 / 4.8 runs (`reports/chunk20a/prices.md`, `scripts/legendary-prices.ts`).
- Shop: locked tiles name the requirement, the info sheet shows both prices ("Buy +1 / 8K + 15 Medals"), Buy and the yellow dot need both, "Max" at the cap. Frontier Unlocks panel: 28 entries in four quadrants, legendary names in lime.
- Engine: `CompileContext` (furthest ring, empty cells, idle ejectors) and `packet.turns`; `lone` / `rebound` Gun ops; `last_breath` / `zigzag` / `mirror` modifiers; Fuse is the Capacitor stage (n=10, x2); `TRIGGERS.mirror`; new pool fields `zigN` / `zigT`; counters `lastBreathHits`, `zigzagFlips`, `loneBoosts`, `reboundBonuses`, `mirrorClones`, `fuseEmits`.
- Save: no shape change, version stays 9.

## Deviations from the prompt

1. **Branch base.** The prompt says "origin/main with 19b merged". 19b is not merged (`origin/main` is the 19a merge, `small-fix-19b` is a separate branch), so this branch starts from `small-fix-19b` and the PR also carries its two commits (short block texts, DECISIONS 322). If 19b is merged first, the PR diff shrinks to chunk 20a alone.
2. **Credit prices** 8K / 65K / 300K instead of the starting 50K / 200K / 800K (see above). Medals as asked.
3. **No save version bump or migration**: the shape did not change (the prompt said "if"); a test loads a v9 save and proves nothing is lost.
4. **Heavy Round** is applied as the last damage op of the line (the shot's speed is only known at the ejector), so an Add block after it is multiplied too.
5. **Lone Shot and Rebound** show x1 in the builder's estimate (their bonus depends on the state of the run).
6. **Fuse's charge count** on the block was skipped (allowed by the prompt).
7. **The Unlocks panel layout changed** to four quadrants to fit 28 rows; the debug cheat "Reach ring 100 everywhere" now reaches ring 300.
8. **Old e2e scripts edited** where the block count (41 to 53) or the Unlocks row count (16 to 28) or the category list was pinned.

## Tests

- Typecheck clean. Unit tests: **758 pass** (729 before; 29 new in `tests/legendaries.test.ts`; 8 existing tests were updated for the new counts and the unlock table).
- New unit tests: every formula with its edge cases (Lone Shot 0 / 1 / 5 / 9 / 10 / 12 shots; Heavy Round at 1, 1.3, 0.6, 0.2, 0.05 and in the compiler on the Dart, a slowed Dart and the Galleon; Rebound first, equal and rising shots; Fuse 9 vs 10 shots and 100 pulses; Hollow Core's cell count; Idle Barrels with all ejectors used; Waypoint with and without turns; Frontier Echo at 0 / 9 / 10 / 99 / 100 / 300), Mirror pairs and the pool limit, Last Breath's window edge, Zigzag's sides / speed / additive gain, unlock by direction and ring, dual price, the sheet and the dot, a v9 save.
- **Mutation checks: 14 made, 14 caught** (`legendaries.test.ts` fails each time, file restored after each): Rebound `<` to `>`; Rebound first shot also gets the bonus; Fuse x2 to x1; Lone Shot full at 12 instead of 10; Zigzag +5% compounding; Mirror missing from the stats; Mirror clone with double damage; Idle Barrels without the second compile pass; Last Breath window edge `>=` to `>`; Heavy Round x5 to x4; buying forgets to take the Medals; Fuse moved to ring 200 in the table; Waypoint turns not counted; Zigzag never flipping sides.
- **E2E:** see "E2E results" below.

## Audit (`npm run interaction-audit`, 36 blocks, 1,260 pairs, `docs/interaction-audit.md`)

**1,140 OK, 120 CANCELS, 0 EXPLODES.** The 44 older flags are the 19a ones, unchanged. 76 are new and none was fixed in the engine; each has a reason (details and the checks in `docs/legendaries.md` section 7):

- **Fuse (42 pairs):** one shot in ten with 20x the damage; the bench's small targets are overkilled and a half-run has few shots (a 40 s rerun of nine blocks removed the Fuse + Piercing and + Orbit flags and kept Fuse + Payload at 26%). Same trait as the Capacitor. Not a bug; the bench cannot show what the block is for.
- **Hollow Core (18):** each block placed next to it removes one empty cell (damage 16 to 15.8); the bench's targets die in whole numbers of hits and the one extra hit shows as "93%". Checked: at five target HPs the ratio is 0.933 at one and exactly 1.000 at the other four. Bench quantisation.
- **Zigzag (8):** with Homing 91%, Boomerang 60%, Orbit 94%, Payload 93%. Probably the weave costing hits; **not investigated further**.
- **Static Charge / Executioner with Frontier Echo, Payload, Idle Barrels (8):** the shot kills a bench target outright, so the effect has nothing to act on.
- Mirror, Last Breath, Rebound, Lone Shot, Heavy Round, Waypoint have no flagged pair. (Waypoint on the bench's straight line has no turns to count; it is tested in the unit tests.)

## Performance (`npm run perf-legendary`, `reports/chunk20a/perf.md`)

Fan hull, Mirror + Splitter 3 + Fork on Impact: 6 shots per pulse, **0.034 ms mean per `World.update` step (p99 0.098 ms), most 54 projectiles alive**; with Fork x2 + Piercing x3: 0.040 ms mean, most 115 alive; the same circuit without Mirror: 3 shots per pulse, 0.059 ms mean (includes warm-up). Pool limit 4,000. These are engine-update times, headless; drawing cost on a phone is not measured. In the browser (headless software rendering) the Mirror + Zigzag flight ran at 16-17 frames per second; I did not measure an ordinary flight for comparison, so that number says nothing about Mirror.

## Contact sheet: `reports/chunk20a/sheet_legendaries.png` (opened and looked at)

Five panels, 540 x 960 each:
1. **Shop, legendary tiles.** The list scrolled to its end: the last three rows hold the twelve green (lime) tiles (four after the last amber Mitosis tile, then five, then three); Frontier Echo is the one with the white selection outline and a brighter look, the other eleven have a padlock and are dimmed. Yellow dots are visible on several ordinary tiles above; I can confirm the Echo dot from the test view (`dot: true`), not from the pixels.
2. **Info sheet.** The list shortened, the sheet under it reads "Frontier Echo", "Adds 10% of your furthest Frontier ring as damage.", "Owned 0 / 1", and the button reads "Buy +1" over "8K + 15 Medals".
3. **Frontier Unlocks panel.** Four quadrants; North shows five rows "Unlocked" (the lavender ones) and Frontier Echo, Payload and Lone Shot in lime, with Payload and Lone Shot "Locked"; East, South and West all read "Locked". A toast listing the five unlocked names sits over the middle of the panel.
4. **Mirror in flight.** A black Free Fly screen with no rocks; short cyan bars fly up in a column in pairs side by side (each pair is one shot and its clone).
5. **Mirror + Zigzag in flight.** The same, but each pair is tilted and the tilt flips from one pair to the next (left-leaning, right-leaning), moving up the screen.

The art of the twelve glyphs is visible only as small lime symbols on dim tiles in this sheet; I did not look at them one by one at a larger size.

## E2E results

Baseline (unchanged branch point, before any edit): 29 of 30 scripts passed; `blocks-first-batch` failed 6 checks.
Full run on the new code (31 scripts, incl. the new `legendaries.e2e.cjs`: 20 checks): 28 passed, 3 failed in the first pass: `block-economy` (a TimeoutError), `blocks-first-batch` (Ignite 0 burn ticks) and `freefly` (kills did not rise). I was running a heavy bench and a second e2e at the same time during that pass, so load is the likely cause, not proven. Rerun one by one on an idle machine: `block-economy` 12/12, `blocks-first-batch` 32/32 (it now passes in full, which the baseline did not), `freefly` 19/19. `block-economy` has a frame-rate check that failed (13 fps) in my concurrent rerun, which is the same load effect. No new failure remains.

## Not verified

- **Nobody has played the prices or the blocks.** The credit prices follow the audit's buyer model (3 runs a wall at 50%, no Free Fly income, the model's Medals), which is an assumption, not a measurement. Ring 200 and 300 legendaries need a player to reach those rings; the bots reach about ring 550 (builder) and 350 (casual) in the 18b targets, which was not rerun.
- **Real phone**: touch, drawing cost of Mirror, the 28-row Unlocks panel at a small width (only checked at 540 x 960 and, for the Shop, 540 wide).
- **Zigzag's audit flags** (8 pairs) are unexplained beyond a guess.
- **Heavy Round beyond the Galleon**: today only the Bastion and Galleon (0.9x) and a captain slowing shots move it off x2; nothing in the game gives 0.2x yet, so x5 is only reached in a unit test.
- **Waypoint, Idle Barrels, Hollow Core, Frontier Echo in a real flight** were verified by the compiler tests (the damage number), not by flying them; Last Breath, Lone Shot, Rebound and Fuse were verified in the Gun and projectile unit tests, not in the browser. Only Mirror and Zigzag were flown in the browser.
- **Builder estimate** with Frontier Echo: the estimate reads the Frontier reach at the time of the last compile; whether it refreshes the moment a square is cleared was not checked.
- **Sound**: no new sounds.
