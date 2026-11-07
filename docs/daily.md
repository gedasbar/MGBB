# Daily quests and the daily run (chunk 35a)

Map tab > DAILY (4th carousel card). Resets at the player's local midnight; the date seeds everything.

**Edit by hand:** `src/data/dailyQuests.ts` (the quest pool: kind, weight, `available`, `goal`, `reward`, text; quests a day, the all-three bonus) and `src/data/dailyRun.ts` (twists and their numbers, reward tiers by wave, days of history). Rules are in `src/daily/rules.ts`, the clock in `src/daily/clock.ts`, the Fog drawing rule in `src/daily/fog.ts`.

**Quests:** 3 a day, different kinds, only content the player has unlocked, goals scaled to progress. Pay once when done. One reroll a day. **Daily run:** Free Fly with the day's seed and twist, unlimited attempts, best wave of the day kept, reward tiers once a day each; it does not change Free Fly best wave / Medal milestones (DECISIONS 644).

**Testing:** debug panel > Daily > "Next day" / "Back to today" (or `__mgbmNav.nextDay()`); the clock offset is never saved. Tests `tests/daily.test.ts`, `e2e/daily.e2e.cjs`, sheet `e2e/sheet-chunk35a.cjs` (`reports/chunk35a/`).
