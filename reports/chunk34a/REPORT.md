# Chunk 34a: game feel pass

Visual only. Particles (one pool, 600 / 200), AoE rings and rectangle outlines, trauma shake, hit stop, merged and pop damage numbers, crash and boss-death moments, CLEARED / PASSED stamp, banner punch, Settings > Graphics (Screen shake, Particles, Hit stop) and an automatic drop to Low particles. See `docs/game-feel.md`, DECISIONS 616-626.

Checks: `npx tsc --noEmit`; `npx vitest run` (67 files, all pass; 27 new tests in `tests/gameFeel.test.ts`); e2e areas wall, freefly, settings, bosses, hud (a first run under load of other dev servers showed 8 scripts failing and 5 flaky, all passing alone on rerun except `legendaries`, which also passed alone, 19 s, same as origin/main); sheet `e2e/sheet-chunk34a.cjs` -> `reports/chunk34a/sheet_34a.png`.
Mutation checks (change made, tests run, change undone): shake trauma capped at 1 instead of the size ceiling (shake test fails); big-hit cool-down removed (hit stop test fails); damage-number merge ignores the target (merge test fails); particle cap removed (2 tests fail); muzzle rate limit removed (test fails). One mutant (deleting the early `return` before the ceiling) is equivalent: the `Math.min(ceil, ...)` on the next line caps anyway.
Performance: `reports/chunk34a/34a-*.md`, summary at the end of `docs/game-feel.md`: +0.1 ms a frame in play, +0.3-0.4 ms with 600 particles alive.
Suite time: not a full-suite chunk; the five-area run took 26 min under heavy load (other dev servers on the machine), the reruns 2.5 and 4.3 min.

## Not verified
- How any of it FEELS on a phone (shake strength, stop length, shard size, number pop). Only the owner can judge.
- Performance on a phone (numbers are headless Chromium software rendering).
- The AoE ring and the "big hit" stop on a player's own circuit in the browser: the sheet fed the engine's blast queue and a 1e9 shot by hand; the engine side is unit tested (`blastEvents`, `hitBig`), the screen side was seen in the sheet.
- The Rectangle AoE outline's exact placement against the blocks it hits (it follows `collectArea`'s maths, seen only as a drawn square).
- "Crits from chance blocks" are not separate: the engine has no crit flag, so only the x10-HP rule makes a number big.
- Hit stop and shake were not watched in motion (stills only); the 0.6 s big-hit cool-down is my addition.
- No full e2e suite run (small chunk by the rules): areas wall, freefly, settings, bosses, hud.
- Dev servers already running on ports 5173, 5190 and 5292 were not started by this session and were left alone.
