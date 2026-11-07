# Chunk 35a report: daily quests and the daily run

Built: DAILY carousel card + `DailyScreen` (countdown, 3 quests with bars / rewards / one reroll, all-three bonus, twist card, reward tiers, 7-day history, START), daily run (Free Fly with the date's seed + one of six twists), save v19 with migration, debug "Next day". See `docs/daily.md`, DECISIONS 639-650.

Tests: `npx tsc --noEmit` clean; unit 1,375 + 29 new (`tests/daily.test.ts`) pass. Mutation checks (7, all caught after replacing one equivalent mutant): reroll limit removed, reward tiers paid every run, day never "same", Frontier quest before tier 25, reset at 1 am, wave quest summing waves, done flag never set. E2E: new `daily` (37 checks), `map-nav` updated for 4 cards, three scripts' expected save version 18 -> 19, `frontier-map` Medal count `>=` (a daily quest can pay a Medal). Areas freefly, map, hub, economy: first parallel run overloaded the machine (timeouts); rerun with 1 worker: all pass except flaky `mitosis-blocks` and `blocks-first-batch` (pass on retry). Suite time ~22 min at 1 worker (11 scripts) after a ~25 min parallel attempt. Sheet: `reports/chunk35a/sheet_35a.png`.

## Not verified
- Real phone feel; no one played a daily run through to the reward tiers (tiers 6/12/20/30/50 Cores are guesses, DECISIONS 647).
- Each twist's difficulty: only Fast Waves, Fog (visually), Boss Rush (unit) and Glass Cannon (unit numbers) were exercised; Swarm / Gunner Day were checked as wave plans, not flown. Glass Cannon's 25% hull with base leak damage may be near-impossible.
- Fog radius 190 px may be too harsh; bosses, bullets stay visible.
- A real midnight rollover on a live page (only the debug "Next day" and unit tests on dayKey / nextMidnight); DST days.
- Daily runs do not count toward Free Fly best wave / Medal milestones (my decision, 644).
- The full e2e suite was not run (areas only, per the small-chunk rule).
