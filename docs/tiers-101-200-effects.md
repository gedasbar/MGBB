# Tiers 101-200: the five effect types (chunk 27b)

The schedule of 27a (`docs/tiers-101-200.md` section 3) already gave 20 tiers to these types. Each tier keeps one type; the walls are ordinary hard walls (same builder as an ordinary
tier) plus an `effects` record on the `LevelDef`. Numbers are in `src/data/lateTiers.ts` (section "chunk 27b"), by rank (1 = first appearance, the last entry repeats).
Nothing here is bot-fitted except what section 6 says: the owner will playtest.

| type | first tier | what it does | by rank 1..5 |
|---|---|---|---|
| Strong Wind | 115 | every shot's launch direction is turned 180 degrees | shot speed x1, 1.1, 1.2, 1.3, 1.4 (a faster shot makes a wider U-turn) |
| Crosswind | 118 | a steady sideways acceleration on every shot in normal flight; side fixed per tier | 28b: 3x the first numbers: 600, 840, 1,080, 1,380 (1,740) px/s squared |
| Fog | 121 | blocks are drawn only within a radius of the ship, or once hit; damage and the crash test are unchanged | radius 420, 360, 310, 270, 240 px |
| Regrowth | 124 | a block not damaged for 1 s heals X% of its max HP a second | 4, 6, 9, 12, 16 % |
| Mitosis Wall | 127 | a destroyed block splits into two smaller blocks (40% HP each) in empty neighbouring cells, twice at most | parents have 60, 65, 70, 75, 80 % of the tier's block HP |

## 1. Strong Wind

`Gun.launchTurnDeg` (added to Angle and Scatter in `Gun.spawn`) and `gun.speedMul`. The table `docs/strong-wind-table.md` (`npx tsx scripts/strong-wind-table.ts`) holds every motion block, flown with the
ship still at four heights, as a share of the same build with no wind. Reading it:

- **Bring a shot back:** Upturn (1 copy needs the ship above about y 530, 2 copies about 650, 3 about 700), Curving x4 (a 180 degree U-turn, ship above about y 380; with Brake x3 it works at any height),
  Ship Magnet (pulls the shot to the ship and over it; works at any height, low damage), Extender (more life for the curve).
- **Orbit** hits what is within 60 px of the ship (the circle comes before the launch), so it works against a wall that hangs that close and does nothing against one further off.
- **Do not help:** Boomerang (out 250 px behind the ship, back to the ship, gone: it never passes above the ship), Mine (laid 220 px behind), Homing (its cone points away from the wall), Angle (60 degrees of 180), Scatter,
  Random Curve, Accelerator, Centreline, Align (nothing is hit, so it never acts).
- **The U-turn is sideways too.** A shot that turns round on a circle of radius v / rate lands up to two radii (about 570 px for Upturn x1 and Curving x4, 380 for Upturn x2, 310 for x3) to one side
  of the ship: the player aims by moving the ship. On a 21-column ring this is no problem; the audit bench in Free Fly (540 px wide, no wrap) could not see it.
- **Deviation from the prompt:** it named Orbit and Boomerang as ways back. Orbit is, in the short-range sense above; Boomerang is not, because the boomerang's way back ends at the ship. Changing the
  boomerang was out of scope. Builds that do beat it: Upturn x2-3, Curving x4 + Brake x3, Ship Magnet x3, Orbit (section 6).
- A wall that is passed through an open lane (tier 115, "Pillars", has one) is passed by every build, with or without wind: the effect only gates CLEARING (section 6).

## 2. Crosswind

`WallWorld.crossAccel` adds `accel x dt` to the x velocity of every shot whose phase is normal (a mine waiting, an orbit, a boomerang's way back are not pushed). A shot that flies d px drifts `a (d / 600)^2 / 2`:
100 px 3-8 px, 300 px 25-72 px, 600 px 100-290 px. So a ship carving at the wall is hardly touched; **long-range fire is what the wind ruins**. Counters: Angle into the wind, two or more Centreline copies (one copy holds a shot
about 30 px off the line at rank 3: borderline), Ship Magnet, Upturn. Align acts only after a hit, so it does not stop the first miss (the prompt listed it as a counter; it is one for shots that go on after a hit). The side is
`crosswindSide(tier)`, a hash of the tier number.

## 3. Fog

`WallWorld.fogAlpha(block)`: 1 for a block that was ever hit (`revealed`), else 1 inside `radius - FOG_EDGE` of the ship (nearest point of the block), fading to 0 at `radius`. `WallScreen.drawBlocks` skips blocks at 0 and sets the sprite alphas; a faint
ring at the radius marks the edge. **Fairness:** `fogRadiusFloor(tier)` = the tier's approach speed x BOOST_MAX (the fastest scroll, ship at the top edge) x 1.5 s + one cell; every fog tier is above it (unit test). Sideways the ship can move
faster than the wall, so a block there is seen only at the radius; the ship's own hit radius is 8-11 px against 240+ px of sight.

## 4. Regrowth

`WallWorld.regrow` each step: a living block with `hp < maxHp` and `time - lastDamaged >= 1 s` gains `maxHp x perSec x dt`. Any hit or burn / cloud tick sets `lastDamaged` (also a hit a shield absorbed). The shield has its own regeneration (unchanged).
A trickle of 5% every 2.5 s against 6% a second never gets a block down; a burst does.

## 5. Mitosis Wall

`WallWorld.split` runs in `destroyBlock`. Candidates in order: left, right, behind (the cell above, further from the ship, "behind" the block as the wall comes down). Two children at most; with fewer empty cells there are fewer (none when boxed in:
a full slab only splits at the lane's edge once neighbours are gone, so the type bites where holes already are). A child: 40% of its parent's max HP, the parent's armor, 40% of its shield, half side `CELL/2 x 0.75^generation`, `share` 0.4 of the parent's
credits (0.16 for a grandchild), generation 1 or 2; generation 2 does not split. The hit tests (`boxDistSq`, bounce) and the drawing read `half`, so a child is a hazard exactly as big as it looks. `total` counts the children too, so the destroyed share never passes 100%.

## 6. What the bots said (`scripts/effect-types-bots.ts`, build B = 3 Flat+ L10 + 10 Percent x L10, C = the same with 6 +1 Projectile, hero 21)

Carve bot / clear-all bot, first tier of each type (P passed, C cleared, x crashed, t timed out):

| tier | type | B carve / clear | C carve / clear |
|---|---|---|---|
| 115 | Strong Wind, no motion block | P (23 blocks) / x | P (46) / x |
| 115 | with Upturn x2 | P (309) / x | P (313) / x |
| 115 | with Brake x3 + Curving x4 | P (183) / x | P (184) / x |
| 115 | with Orbit | P (102) / **C** | P (159) / **C** |
| 118 | Crosswind | P / timeout 792 of 855 | P / timeout 831 |
| 121 | Fog | P / C | P / C |
| 124 | Regrowth | P / C | P / C |
| 127 | Mitosis Wall | P / x (305 of 1082) | P / C |

Reading it honestly: **every build passes these tiers** because the lane the carve bot takes is nearly open (tier 115 "Pillars" needs 23 blocks broken), so the effects mostly gate clearing. Under Strong Wind the number of blocks destroyed by the carve bot
(its hits, not the pass) goes from 23 to 309 with Upturn x2, 264 with x3, 183 with Curving + Brake, 102-159 with Orbit: three different build families that get damage through. Only Orbit clears (the clear-all bot flies at the bottom of the screen, where
the others' shots die). Build B cannot clear the Mitosis tier but cannot clear an ordinary tier 127 either (its limit is 123, docs/tiers-101-200.md). Neither bot weaves, aims a U-turn or flies high on purpose, so a human may do better or worse.

## 7. Interaction audit under the winds

`WIND=strong npm run interaction-audit` and `WIND=cross npm run interaction-audit` (about a minute each) write `docs/interaction-audit-wind-strong.md` / `-cross.md`: every block alone and every pair with a block that still works, calm and in the wind, on
the real wall engine (a tier-115 wall that never dies; Strong Wind: wall 100 px above a ship at y 380, total damage; Crosswind: wall 400 px above a ship at y 700, damage to the one column above the ship). Findings:

- Strong Wind: only Ship Magnet (87% kept) and Upturn (61%) carry a gun. Pairs that become useless next to them: **+1 Projectile** (x1.5 calm, x1.0 in the wind, with both), **Bouncing** and **Boomerang** next to Upturn (the boomerang's 29x
  gain calm comes from its fast returns through the ship; under the wind it is 0). Every other damage block does nothing in the wind because no shot reaches the wall; that is the type, not a pair problem.
- Crosswind (rank 3, 360 px/s squared): on the lane, a plain gun and nearly every block lose everything at 400 px range; AoE Circle / Rectangle, Homing and Boomerang keep it. Next to AoE, **Piercing, Chain Lightning, Mirror and +1 Projectile become useless** (the blast already
  reaches the lane, the extra shots drift off it); Homing and Boomerang make +1 Projectile useless. Angle into the wind, and Curving, bring a miss back (calm 0, wind 42).


## Chunk 28b changes

- **Crosswind is 3x** (`CROSSWIND_STRENGTH`): 600 / 840 / 1,080 / 1,380 px/s squared on tiers 118 / 136 / 172 / 189. A plain gun 400 px from a wall now misses its lane on every tier (`scripts/crosswind-check.ts`). Counters at 250 px: Angle into the wind x2-4, Upturn x3-4, Centreline x4 + Angle (every tier); at 400 px only tiers 118 and 136 have one. Point-blank bots are unaffected (DECISIONS 492).
- **Mitosis Wall** splits inside its own cell: a block into two halves (40% HP each), a half into two squares (40% of the half), squares do not split. No neighbour is touched (DECISIONS 491).
