# Free Fly v2: enemy bullets, three new enemies, wave themes (chunk 32a)

Builds on `docs/freefly-design.md` (waves, species, rewards). This chunk adds the first enemies that shoot and
two support enemies, and gives some waves a theme. Bosses (32b, waves 10, 20 ...) will use the same bullet system.
All numbers are constants in `src/data/enemyBullets.ts`, `src/data/species.ts` and `src/data/waveThemes.ts`.

## 1. Enemy bullets (a new system)

- **Own pool** (`src/engine/enemyBullets.ts`, typed arrays, no allocation per shot): cap `ENEMY_BULLET_CAP` = 240. Never
  shares anything with the player's `ProjectilePool`, so no block, skill or overload rule touches them.
- **Look:** a round bullet, bright lime fill (#c8f542) in a near-black outline with a dark core, 14 px across. No player
  shot is round or lime (player looks: dash, bar, diamond, bolt, star in cyan to magenta; skins: hex, cross, chevron), and
  the dark outline keeps it readable on every background. Small and **slow: 230 px/s** (player shots: 600 px/s).
- **Persistence:** a bullet lives until it leaves the screen. It does not know who fired it, so a dead Gunner's bullets keep
  flying. Player shots, Chain Lightning, AoE, Orbit and Mines only ever look at `mitosis.enemies`, so **a bullet cannot be shot down**.
- **Hit:** the bullet's circle (radius 5) against the ship's invisible hit circle, swept along the ship's path this step
  (as rocks are). A hit costs `ENEMY_BULLET_DAMAGE` = 8 hull (the hull is 100; contact is 10, a leak 5-20) and sets the usual
  0.5 s invulnerability; Second Chance charges are spent the way a contact is; never one-hit. A bullet that touches the ship
  while it is invulnerable (spawn safety of 1.5 s from the first frame, or after a hit) is **not** used up: it flies on through.
- **Pause** freezes the whole world, bullets included (nothing is stepped while paused).
- **Frontier Free Fly squares are unchanged**: the new enemies are Free Fly only (`SpeciesDef.freeFlyOnly`), because the
  squares' balance has not been measured with shooters.

## 2. Three new enemies (rock art language: faceted body, three nested shades, cracks)

`u` = HP of a basic rock at the tier. Wave points as in the director (Rock = 4).

| Enemy | Look | Size | HP | Behaviour | Reward x | Points | Weight | From wave |
|---|---|---|---|---|---|---|---|---|
| **Gunner** | squat gunmetal-blue octagon with a dark-red muzzle wedge underneath | 30 | 2.2 u | falls 22 px/s; walks `2.6 s`, **stops** `1.0 s`, and `0.6 s` into the stop fires an **aimed burst of 3** (a fan of -10, 0, +10 degrees around the line to the ship), then walks on. Only fires while on screen and above the ship. Splits into 2 plain rocks on death | 2.8 | 7 | 3 | 8 |
| **Shielder** | regular pale-cyan octagon with a cyan ring | 22 | 1.3 u | falls 30 px/s with sway. Links to the nearest 5 enemies within 150 px (not other Shielders): linked enemies take **25 % damage** (every source: shots, burn, clouds) | 1.8 | 5 | 3 | 12 |
| **Leech** | small rose-brown teardrop (narrow) | 14 | 0.45 u (fragile) | falls 34 px/s, sways fast. Links to the nearest 4 enemies within 130 px (not other Leeches) and heals each **5 % of its max HP a second** | 0.8 | 3 | 3 | 15 |

A link is a visible line from the support enemy to each linked enemy, redrawn every frame: **cyan** line plus a thin ring for a
Shielder (the shield colour of the wall and the rocks), **rose dashed thread** for a Leech. It disappears the moment either end dies.
Linked enemies show it, so "kill the Shielder first" is readable. Killing the support enemy at once restores full damage.

Rewards: `rockReward(freeFlyRewardTier(tier), generation) x rewardMul`, like every species. Leak damage: Gunner x1.2, others x1.

## 3. Wave themes

About every third wave gets a theme, announced by a banner above the "WAVE N" banner (name, one line, the Cores bonus).
Eligible waves (`themeAt(wave)` in `src/data/waveThemes.ts`): wave >= 9, a multiple of 3, **not a multiple of 5** (so never a
Swarm / Mother wave, and never a boss wave: bosses arrive at 10, 20 ...). That gives 9, 12, 18, 21, 24, 27, 33 ...
The n-th eligible wave takes theme n of the table, which repeats: **ARMORED** (9), **SWARM** (12), **GUNNERS** (18),
**SHIELD WALL** (21), **LEECHES** (24), ARMORED (27) ... so they start one by one. Waves 1-7 are unchanged.

| Theme | What the wave is |
|---|---|
| ARMORED | the normal draw, but each body (pebbles too) is armored (armor 10, the Ironclad's) with 70 % chance. Children of a split are not |
| SWARM | budget x1.1 spent on Darters (40 %) and pebbles (60 %), within 20 s: many tiny fast rocks that split once more |
| GUNNERS | 60 % of the budget on Gunners, the rest the normal draw |
| SHIELD WALL | groups of one Shielder with three cheap escorts (Rock, Drifter, Warden or Darter) born together within 60 px of it |
| LEECHES | 40 % of the budget on Leeches, the rest the normal draw (the Leeches find their patients on the field) |

A theme wave pays a **Cores bonus**: half of what the wave's start pays anyway (`coresForWave`, at least 1), times the Core
Magnet, added when the wave starts. Credits bonuses stay on multiples of 5.

## 4. What does not change

Waves 1-7, the Frontier squares, the campaign, player shots and blocks, the save (nothing is stored: still version 16),
the pool cap of the player's shots, rewards of the old species.

## 5. How it is checked

Unit tests (`tests/freeflyV2.test.ts`): bullets survive the shooter, ignore player shots, hull damage with invulnerability
and pass-through, spawn safety, Gunner burst aim, Shielder reduction and link, Leech healing, the theme schedule and the
theme plans. E2e `freefly-enemies.e2e.cjs` plays a Gunner wave in the real game and checks a hit, a Shielder and a Leech
alive with their links, and a theme banner; sheet `e2e/sheet-chunk32a.cjs` (`reports/chunk32a/`). Cost at the bullet cap:
`scripts/perf-enemy-bullets.ts`. Free Fly bot before / after: `scripts/freefly-v2-bot.ts` (the bot now also steps around bullets).
