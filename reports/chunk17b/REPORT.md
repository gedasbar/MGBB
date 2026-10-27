# Chunk 17b: block interactions

Branch `chunk-17b`. This chunk changes gameplay (shot rules) and the economy (caps and prices). Design note: `docs/interactions.md`. Audit: `docs/interaction-audit.md` (after) and `docs/interaction-audit-before.md`.

## What was built
- **One trigger table**, `TRIGGERS` in `src/engine/triggers.ts`: AoE once where the shot ends, Fork on Impact and Gravity Well on the first hit, Chain Lightning every hit with at most 3 chains per shot, status/Mitosis effects every hit, fork copies carry statuses and movement blocks only. The hit pipeline (`processField`) reads it.
- **Fork + AoE both happen.** A piercing or bouncing shot with AoE travels and blasts once at its last hit, also when it leaves the screen (`ProjectileSystem.retire`). Boomerang and Orbit shots blast on their first hit.
- **AoE penalty visible:** the estimate multiplies by `0.95^(copies-1)`; the AoE texts say "once, where the shot ends" and "Each extra copy: bigger area, -5% damage."; every stacking block (Piercing, Bouncing, AoE x2, Chain, Homing, Fork, Boomerang, Orbit, Mine) ends with an "Each extra copy: ..." line (tested).
- **Homing, Orbit, Mine:** a copy now does something: Homing a longer seek range, Orbit one more full pass before launch, Mine one more mine beside the first (up to 3 extra). No caps.
- **Caps and prices:** Splitter 2 and 3 cap 15, growth 1.35 and 1.45 (bases kept); Turn Left and Right cap 20, growth 1.20. No save change.
- **Pair audit:** `npm run interaction-audit` (24 blocks, 552 ordered pairs, the three bench scenarios, effect counters).

## Audit before and after
| | OK | CANCELS | EXPLODES |
|---|---|---|---|
| before (clean `origin/main` + counters) | 494 | 58 | 0 |
| after | 494 | 58 | 0 |

The counts match but the pairs differ. Fixed: AoE + Fork on Impact (4 ordered pairs): Fork never happened before, now it does. "Piercing never happens" with AoE is gone. New in the list: Bouncing + AoE Circle (84%) and Fork + Boomerang (85%). 29 unordered pairs remain flagged, each with a reason in `docs/interactions.md` section 4: the blast now comes at the end of a piercing/bouncing line (80 to 92% of AoE alone in a tight cluster, by design); Boomerang with Piercing, Bouncing, Mine, AoE (it already passes through everything or replaces the flight); Orbit and curve pairs (an Orbit shot always leaves from the same point beside the ship's axis, so the cluster bench never hits; curves miss low-HP targets); Overkill Spill + Residue Seed (kill-timing noise). Nothing EXPLODES, so no cascade was found; the CANCELS rule is the one in the brief except that blocks that cost damage on their own (Orbit, Mine, the curves, Cleaver) are compared with themselves alone, and the step-time limit uses the 90th percentile (the first try with the 99.9th percentile flagged 254 pairs because of machine stalls).

## Tests
- `tests/interactions.test.ts` (28 tests): table values, AoE once at the end of a piercing shot (not per hit, bystander at the first hit untouched), a plain shot blasts on its first hit, the owed blast of a shot that leaves play, Fork + AoE both, Fork once per piercing shot, fragments keep ignite but never blast, fork or chain, chain capped at 3 chains (and 2 hits make 2 chains), one Gravity Well per shot, the estimate with the penalty (Circle and Rectangle), the "Each extra copy" lines, Homing range, Orbit extra pass, Mine extra mines (and one detonates), caps and prices.
- Old tests updated for the new caps and prices (`economy.test.ts`, `blockEconomy.test.ts`, incl. the v7 refund tests).
- **Mutation checks (6), each made the named tests fail, then restored:** AoE trigger set to `every_hit` (table, AoE-once and retire tests); Fork set to `every_hit` (forks once per piercing shot); `CHAIN_ARCS_PER_SHOT` 3 to 99 (chain cap); AoE `fragments: true` (Fork + AoE and the fragments test); `aoeEstimateMul` returning 1 (estimate test); `mineExtra` returning 0 (both Mine tests).
- 657 + 28 unit tests pass (typecheck clean).

## e2e
Baseline on clean `main` (step 0): 27 of 28 passed; `blocks-first-batch` failed 2 checks (it passed in the cleanup run; the audit was running at the same time). Full run on the branch: all pass except `campaign`, which also fails on clean `main` in about 2 of 3 runs now (a race in "touching a block": the ship passes the wall instead of crashing; it passed 23/23 on other runs on both trees, not caused by this chunk), and two scripts (`mitosis-blocks`, `pause`) that failed while the computer was asleep (their timings show 14,520 s and 20,108 s) and passed 22/22 and 21/21 when rerun. `block-economy` needed an update (Turn Left cap 20) and passes. New script `e2e/interactions.e2e.cjs` (6 checks) makes the contact sheet.

## Contact sheet (`reports/chunk17b/sheet_interactions.png`), what is really on it
Five Free Fly / builder frames at half size. Frame 1 (Piercing + AoE, shot after two pierce hits): a few brown rocks and floating damage numbers ("30", "+3"); no blast. Frame 2 (the shot used up): the rocks gone or cracked, small numbers ("11.5", "30"), one blast counted by the counters (the game draws no blast ring: the proof is the counter, the numbers on the bystanders and the check `aoeBlasts === 1`). Frame 3 (AoE + Fork): rocks round the point of impact with "50", "100" numbers and small cyan strokes (fragments); the counters say 1 fork, 1 blast, the fragments in flight. Frame 4 (Piercing + Chain): white arcs from a rock and numbers 31.1, 46.7, 66.7, 70, 100; the counters say 6 jumps in all (3 chains of 2) for 5 pierce hits. Frame 5: the builder with the AoE Circle tile selected; the bottom sheet reads "... Each extra copy: bigger area, -5% damage." (the top strip cuts the same text after "-5%"). The frames are staged (rocks and shot placed by the script, real engine code), and the mid-frame effects are small at this size; the counters, not the picture, are the evidence.

## Deviations (also in DECISIONS 296 to 302)
- The AoE penalty applies to the whole shot (direct hit and blast), not only the blast; the last-hit target is left out of the blast.
- A shot that leaves the screen with a blast still owed blasts at its last hit (needed so Piercing + AoE keeps its blast).
- Gravity Well changed to once per shot (first hit); Fork on Impact used to fire on every hit of non-AoE shots, now once.
- Mine extra copies capped at 3 extra mines; no cap was put on Homing, Orbit or Mine in the Shop.

## Not verified
- How the new rules feel in play: no human playtest. Piercing + AoE now blasts at the end of the line (in a tight cluster the first hit was better); this is the owner's rule but worth a feel check.
- The audit measures pairs only, not three or more blocks on one line.
- Wall behaviour of `retire`: unit-tested and covered by the existing wall e2e, but there is no wall-specific interaction test.
- The flaky `campaign` e2e was not fixed.
- The effects in the contact sheet cannot be seen as blasts; only counters prove them.
- Extra Mine copies could still crowd the pool in long Wall runs (a mine waits 12 s): bounded by 3 extra per shot but not stress-tested.
