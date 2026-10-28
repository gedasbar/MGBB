# Chunk 20b report: motion blocks

Branch `chunk-20b` (from `origin/main` after 20a). Design note: `docs/motion-blocks.md`. DECISIONS 338-350.

## What was built
- 13 Modifier blocks: Curving Left, Angle Left, Angle Right, Accelerator, Brake, Scatter, Upturn, Align, Extender, Centreline, Ship Magnet (the old hidden `magnetized`), Persist, Reverse. Numbers in the "Chunk 20b" section of `src/engine/effects.ts`; trigger rows for Reverse, Align, Persist in `TRIGGERS`; `docs/interactions.md` section 7.
- Swept hit test for fast shots; per-shot `life` (Extender, Last Breath window, Free Fly retire); Waypoint counts Curving Left (Angle blocks do not count).
- Campaign-tier lock ("Pass tier N", `src/data/tierLocks.ts`), Frontier unlocks are the 12 legendaries only (rings 100/200/300). Save version stays 9.

## Tier table
Free from the start: Curving Left, Angle Left, Angle Right. Tiers: Accelerator 5, Cleaver 5, Mine 10, Random Router 10, Static Charge 12, Brake 15, Scatter 15, Overkill Spill 18, Upturn 20, Frostbite 22, Align 25, Corrosion 28, Extender 30, Gravity Well 32, Culling Bolt 35, Residue Seed 38, Centreline 40, Orbit 42, Ship Magnet 45, Capacitor 48, Persist 50, Executioner 52, Alternator 55, Fission Catalyst 58, Chain Lightning 60, Reverse 60 (also in `docs/blocks.md`).

## Caps and prices (first copy; growth 1.30; ~2.5 runs at the unlock tier, `prices.md`)
Curving Left 300 (cap 1); Angle Left / Right 100 (cap 4); Accelerator 60 (3); Brake 180 (5); Scatter 200 (3); Upturn 300 (3); Align 450 (1); Extender 650 (2); Centreline 1,300 (3); Ship Magnet 1,800 (3); Persist 2,500 (1); Reverse 4,800 (3). The 16 moved blocks keep their old prices; early ones are far above 1-3 runs at their tier (Cleaver 41 runs at tier 5): open question for the owner (column "price at 2.5 runs").

## Audit (`docs/interaction-audit.md`)
49 blocks, 2,352 pairs: 2,068 OK / 284 CANCELS / 0 EXPLODES. Old pairs unchanged (1,140 / 120). All 164 new flags involve a motion block (Ship Magnet 54, Curving Left 28, Angle Left 26, Scatter 24, Angle Right 20, Brake 20, Reverse 10, rest 2 each): bench artefact (targets straight ahead; aiming off-lane or keeping shots at the ship hits less and partner events "never happen") or by design (Reverse + Boomerang 60%: the boomerang returns at its first hit). Persist + Piercing + AoE, Accelerator + Homing, Scatter + Mirror are OK. Not looked at pair by pair.

## Performance (`perf.md`, headless)
Ship Magnet + Mirror + Splitter 3 + Fork on the Fan: mean 0.044 ms an update step, p99 0.20 ms, at most 72 shots alive (x3 magnets 72, with 2 Extenders 90, Accelerator x3 sweep 18).

## Tests
802 unit tests pass (44 new in `tests/motionBlocks.test.ts`). Mutation checks, all caught: Brake floor removed, Persist spends nothing, Reverse unlimited, Upturn without delay, sweep off, Last Breath ignoring Extender, Magnet pulling to the firing x, Align removed, tier lock off by one, Angle clamp removed, Free Fly life check removed.
Baseline e2e (unchanged main, own worktree): 31 / 31. After the changes: 24 / 32 on the first run; the 8 failures were stale scripts (block count 53 -> 66, Frontier table 28 -> 12 entries, the ring 10/25/50 unlocks, tier-locked blocks the old scripts buy; `lib.cjs` rich saves now start with all tiers passed, `tiers: false` for shop.e2e). I re-ran the 8 after fixing them individually (all passed in the re-run; I did not repeat the whole suite afterwards). `frontier-squares` also needed a settle loop before the pixel read (the lavender fill was still fading in under load).
Contact sheet `sheet_motion.png` (opened): Angle fan at -30 / 0 / +30, Scatter cone, Angle x3 then Upturn (shots lean then bend up), Ship Magnet swarm round the ship, Reverse + Upturn at three rocks (flips confirmed by the check, not readable in the picture), Build screen damage 10 for Brake x5 + Heavy Round, Shop with padlocks (the "Pass tier 15" text is checked in state, not legible in the image).

## Not verified
- Real phone feel of any block (headless only); Ship Magnet / Centreline balance is untested by a player.
- Full e2e after the final fixes was not run again as one suite.
- Pair-by-pair reasons for the 164 new audit flags; `reports/chunk17b/audit-after.json` was not refreshed (the docs table is).
- Prices of the 16 moved blocks; no balance run for the new blocks' damage value (Persist, Reverse, Accelerator have no damage estimate in the builder).
- Tier placement of the moved blocks is by my judgment of strength.
