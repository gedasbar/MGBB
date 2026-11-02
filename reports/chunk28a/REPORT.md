# Chunk 28a report: achievements and challenges

**Built.** 44 achievements (`src/data/achievements.ts`) and 31 challenges (`src/data/challenges.ts`), both plain data. Save version 13 (`achievements`, `records`, `challengesDone`, `cosmetics`). Achievements are checked on every progress commit; a toast for a new one; ONE summary panel when a save is loaded that had already reached some. The Captain tab has a button to the new Achievements screen (achievements by group with progress bars; challenges with Start). A started challenge shows a rule banner in the builder, FLY is blocked with a plain message when the hull or circuit breaks a build rule, and flies the challenge tier; no-firing and the time limit are enforced in the run; the summary states the verdict; the reward is paid once. Design note: `docs/achievements.md`. Decisions 468-478.

**Medals.** All 44 achievements pay **158 Medals** in total (39 pay Medals, 5 pay a cosmetic id); the challenges pay 94 Medals in total (28 pay Medals, 3 a cosmetic id, tier first-clear Medals are separate).

**Numbers I changed from the brief:** skill points 3 / 6 / 10 (not 5 / 15 / 30: 30 points needs ring 1,250), hero level 10 / 20 / 30 (not 25 / 50: level 50 is about 45,000 Medals), "fill a hull" needs a hull with 12+ buildable cells. 31 challenges, not about 20, so that all 19 hulls have one.

**Tests.** `tests/achievements.test.ts` (82): every achievement's condition at goal-1 and at goal, hidden hints, grant once, grant on load as one summary and no toasts, records, migration and Export / Import, every challenge rule type allowed / blocked, verdict, no-firing and time limit in the world, rewards paid once. Existing tests changed: version 12 -> 13, and five that count Medals now set `achievements` first (achievements pay Medals themselves). **Mutation checks (10, all killed):** `>=` to `>` on "earned at goal"; the already-earned guard in grant (first survived: the test only used a cosmetic, strengthened, then killed); max blocks `>` to `>=`; time limit `>` to `>=`; no-fire silencing removed; challenge reward paid every time; ejectors counted as recipes; Dart-sized hulls count as filled; load grant also queuing toasts; "all four sides" min to max.

**e2e.** `e2e/achievements.e2e.cjs` (34 checks) and sheet `reports/chunk28a/sheet_achievements.png` (opened: six panels: the load summary for an old save "4 unlocked from your progress +12 Medals" with four names and OK; the toast "Achievement: Rock breaker / 1 Medal" at the top of the builder; the Achievements panel with green EARNED cards, progress bars and a "???" hidden card with its hint; the Challenges list with rule lines, rewards and Start buttons; the builder with the red rule banner "Not allowed in this challenge: AoE - Circle" and the same text as a toast after pressing FLY; the "Tier cleared" summary with "Challenge complete! +1 Medal" in green). Existing e2e scripts updated for save v13, the extra Medals, and the Captain tab's fifth button; `lib.openGame` closes the summary panel.

**Housekeeping.** Servers I started on port 5199 are stopped (an earlier one lingered after its task was stopped and was killed by pid). The user's own servers on 5173 and 5290 were not touched.

## Not verified
- Whether each challenge is FAIR: tiers came from the hull price ladder and time limits from wall length; no bot flew them. The Maze / Fortress / Strong Wind tiers are checked for being the right type only.
- Challenge success on tiers above 100 and the no-firing run in a browser (unit-tested in the world only; the browser test flies a tier-10 challenge and a time-limit failure).
- Cosmetic rewards: only the ids are stored; nothing shows a skin or trail yet.
- The toast and summary on a real phone screen; touch drag on the new lists (written with the same gesture tracker as the Captain tab).
- A challenge's `needBlocks` for blocks the player may not own or not have unlocked (the list says what is needed; unlock state is not checked).
- Medal totals and the load summary for a real old save beyond the e2e rich save (4 achievements).
