# Chunk 32a report: Free Fly v2 (enemy bullets, Gunner / Shielder / Leech, wave themes)

Design: `docs/freefly-v2.md`. Decisions: `DECISIONS.md` 547-561.

## What was built
1. **Design note** (committed first).
2. **Enemy bullets:** their own pool (cap 240), slow (230 px/s) lime rings in a dark outline, 8 hull damage + 0.5 s invulnerability, they outlive the shooter and cannot be shot, the spawn invulnerability and a Second Chance / the god cheat let them through, pause freezes them.
3. **Gunner** (wave 8), **Shielder** (wave 12), **Leech** (wave 15): species data in `src/data/species.ts`, split rules in `src/data/enemies.ts`, art in `src/ui/rockArt.ts`, pure rules in `src/game/support.ts`, links listed in `World.links` and drawn by `src/ui/supportLinks.ts`. Normal Free Fly only.
4. **Wave themes** (`src/data/waveThemes.ts`): ARMORED, SWARM, GUNNERS, SHIELD WALL, LEECHES on waves 9, 12, 18, 21, 24, 27 ... (>= 9, multiples of 3, not of 5), a banner above "WAVE N", a Cores bonus.
5. **Tests, bot, cost:** see below.

Commits: steps 2 and 3 were written together (the world code is shared) and committed as one ("steps 2-3"); everything else has its own commit.

## Tests
- `npx tsc --noEmit` clean. `npx vitest run`: 63 files, 1266 tests pass (33 new in `tests/freeflyV2.test.ts`).
- **Mutation checks (12, all caught; every file restored with `git checkout`):** shield reduction removed (`damage.ts`); no invulnerability after a bullet hit; bullets hurt while invulnerable; bullets cleared when their shooter dies; burst not aimed at the ship; Leech heals above max HP; theme allowed on multiples of 5; Gunner clock runs while off screen; Shielder link ignores range (the last four and the first were run through a script, `git status` clean afterwards). Two further mutations (Leech healing stacking, a dying Shielder still linking) were found by the tests as real bugs while writing them and fixed.
- Waves 1-7 unchanged: hashes of `planWave` and of a real world 10 s into each wave, on `origin/main` and on this branch (same hash function) are equal. The old hash tests in `tests/frontierSquaresAndUnlocks.test.ts` were narrowed to waves 1-7 (the draws from wave 8 legitimately changed); the species / enemy data hash of every older entry is the old value.
- **E2e** (fresh dev server on port 5292): `freefly` 19, `freefly-waves` 10 (after fixing its stale "save version 15"), **`freefly-enemies` (new) 19**, `frontier-squares` 22, `pause` 21, `mitosis-blocks` 22, `captains` 30, `cheats` 16, `performance` 14, `polish` 23, `block-economy` 12, `save-transfer` 13, `production-build` 25: all pass. `economy` 34 (it timed out in my first loop and was rerun alone: pass). The full e2e suite was NOT run.
- The new e2e checks, in the real game: a Gunner stops and fires 3 bullets, each bullet has a sprite, the bullets keep flying after the Gunner dies and one reaches the ship down the ship's own firing lane (so shots do not stop it): hull 100 -> 92 with the invulnerability running, pause freezes them (positions equal after 0.5 s) and resume moves them, a Shielder links 3 bodies at 25 %, a Leech heals its patient, killing the Shielder removes the link, wave 9 shows the ARMORED banner with "+2 Cores" and armored bodies, 240 bullets all drawn.

## Contact sheets (I opened both)
- `reports/chunk32a/sheet_enemies.png`: Rock, Warden, Ironclad, then the Gunner (a large blue-grey octagon with a dark-red wedge under it), the Shielder (a regular pale-cyan octagon with a cyan ring) and the Leech (a small narrow rose teardrop), whole and 60 % damaged with cracks; a Shielder with cyan lines and rings to two rocks, a Leech with a rose dashed thread to a rock; the bullet at real size and 4x beside the five player looks (the bullet is a lime ring, the player looks are cyan/pale cyan bars, a yellow diamond, an orange bolt, a magenta star); the bullet over all eight backgrounds (readable on each; the dark outline hardly shows on the dark backgrounds, the lime ring does the work). The 4x enlargement is blocky because the 14 px texture is scaled up; in the game it is shown at 1x.
- `reports/chunk32a/sheet_ingame.png` (four frames from the real game): (1) a Gunner near the top with three small lime rings spread out half way down, the ship's cyan shots in its lane; (2) the Shielder with three linked rocks inside cyan rings, the Leech to the right with its thread; (3) the "ARMORED / Most enemies wear armor +2 Cores" banner above "WAVE 9", HUD "Cores +6"; (4) a few seconds into wave 9, a few rocks. **At this scale I could not see the armor frames in frame 4** (the e2e checks armor values, not the picture), and the bullets in frame 1 are small.

## Bot (before = origin/main, after = this branch; 3 seeds; `scripts/freefly-v2-bot.ts`)
| Build | Before (wave / s) | After |
|---|---|---|
| Twin | 5.7 / 208 | 5.7 / 208 |
| Hornet | 9.0 / 355 | 9.7 / 374 |
| Mantis | 12.7 / 480 | 12.0 / 464 |
| Halberd | 14.7 / 567 | 15.0 / 574 |
| Corvette | 13.0 / 493 | 12.0 / 468 |
| Shuttle | 15.0 / 573 | 15.0 / 584 |
| Fan | 17.0 / 666 | 17.0 / 664 |
| Zenith | 18.0 / 694 | 17.7 / 687 |

About one wave either way; the bullets rarely hit the bot (0-2 hits a run when it dodges, up to 5 when it ignores them). No tuning.

## Cost at the bullet cap (240)
Node: pool update 0.0012 ms + hit test 0.0042 ms a frame; a whole world frame differs by less than the noise (about 0.01 ms). Headless Chromium: a Fly-screen update 0.07 ms with no bullets, 0.06 ms with 240; 60 fps either way (the cap). The numbers are small because these frames had few other objects; a phone was not measured.

## Housekeeping
Dev server on port 5292 stopped at the end. No worktrees created. Fixed four e2e scripts that still expected save version 15.

## Not verified
- **How dodging feels on a phone** (bullet speed 230 px/s, 14 px size, 8 damage, burst spread of 10 degrees, the Gunner's 2.6 s / 1 s rhythm): only a bot and desktop headless runs were used.
- Whether the new enemies' rewards (Gunner x2.8, Shielder x1.8, Leech x0.8), point costs and weights are balanced; the bot says nothing about a person.
- Performance on a real phone and with a big player pool at the same time as 240 bullets.
- That armored rocks read as armored in the theme wave (checked by values, not by eye), and the look of the Gunner's muzzle wedge in play.
- The SWARM, GUNNERS, SHIELD WALL and LEECHES theme waves were checked only as plans (unit tests) and the ARMORED wave in the browser; I did not watch a full SHIELD WALL or LEECHES wave play out.
- The whole e2e suite (only the Free Fly and related scripts above were run) and sound (no sound for bullets).
- Wave 8-14 balance for players with mid builds beyond the bot's eight builds.
