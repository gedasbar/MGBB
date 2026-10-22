# Economy and stacking (chunk 16c-2)

Built on `docs/economy-audit.md` (16c-1). This note says how each step is done and lists every deviation. The
before/after numbers are added at the end of the chunk.

## Baseline (step 0)
Measured on `origin/main` (d82156d) in a separate worktree before any change: typecheck clean, 526 unit tests pass. Full e2e failures that already existed: `builder` (2: warning counted in the strip; list scroll reveals pure_converter), `campaign` (4: tier passed / medals), `chunk1` (2: second tap on a tile), `frontier15a` (1: panning 31 fps), `economy` (script error, exit 2). Everything else passed.

## Step 2 - upgrades and single levels
- One data file, `src/data/blockEconomy.ts`: `UPGRADABLE` (Flat+, Percent x, Lucky Strike, Jackpot, Gambler's Gate, Shield-Breaker,
  Armor-Piercer Tip, Pure Converter), `FIXED_LEVEL` (the audit's A2 list), and the per-block copy table (step 4).
- Every other block gets `maxLevel = 1` and a `fixedLevel` on its `BlockDef`. The compiler and `describeBlock` run the block at
  `fixedLevel` (`powerLevel(def, cell.level)`), so a placed cell and a save keep level 1 and nothing has to be rewritten.
  The A2 list is: Alternator, Random Router, Capacitor, Executioner, Cleaver, Culling Bolt, Piercing, Boomerang, Chain Lightning, AoE Rectangle,
  Frostbite, Static Charge at L3; every other block at L1. This deliberately changes some level-1 numbers (override of rule 6).
- UI: a block with `maxLevel` 1 shows no "Level x/y" line and no Upgrade button (builder sheet and Shop).

## Step 3 - Percent x and the boosters
- `percentMul(L) = 1.5 * 2^((L-1)/9)` (x1.5 at L1, x3 at L10). Gambler's Gate chance `0.40 + 0.05 (L-1)`. Lucky Strike and Jackpot untouched.

## Step 4 - caps and prices
- `BLOCK_ECONOMY[id] = { cap, base, growth }` (`cap: null` = no cap, for the shape blocks that stack). Copy price of the n-th copy
  = `round(base * growth^(n-1))` (n-1 = copies owned). Upgrade price = `round(base * 2.0 * 2.2^(L-1))` (unchanged formula, new base).
- Values are the audit's family B / D4 table: turns 30 x1.15 cap 8, Splitter 2 120 x1.15 cap 2, Splitter 3 700 cap 1, Flat+ 60 x1.20 cap 10,
  Percent x 100 x1.30 cap 10, Lucky 70 / Jackpot 75 / Gambler 45 x1.25 (caps 6 / 6 / 4), Overclock 500 x1.35 cap 3, every other
  single-copy block 2 x today's base.
- **Deviation:** the stacking shape blocks (Piercing, Bouncing, AoE x2, Chain, Homing, Fork, Boomerang, Orbit, Mine) have no cap, so they need a
  growth: they use 2 x today's base and growth 1.30 (the normal band).
- Shop and builder sheet show `owned / cap` and the Buy button reads "Max" and is disabled at the cap.

## Step 5 - shape blocks stack
Every copy on the signal's path is one entry in the packet's modifier list, so the engine counts entries (`k` copies, `e = k - 1` extra):
| block | what extra copies add | natural drop-off |
|---|---|---|
| Piercing | +1 pierce per copy: the per-hit cost is `1 / (L + e)` of the damage dealt | each hit still costs damage; the shot lives about `L + e` equal hits |
| Bouncing | +1 bounce per copy | a bounce still needs a target within reach |
| AoE Circle / Rectangle | radius (width and height) x `(1 + 0.25/j)` for the j-th copy; damage x0.95 per extra copy | growth `1 + 0.25/j` shrinks; the damage factor compounds |
| Chain Lightning | +1 jump per copy | each jump still pays 70% and needs a target in 150 px |
| Homing | turn rate and cone angle x `H(k)` (harmonic sum 1 + 1/2 + ... + 1/k) | logarithmic |
| Fork on Impact | +1 pair of forks per copy (angles +-35 deg x j); pair j deals `0.8^(j-1)` of the first pair | fragments never fork; pool limit stops spawns |
| Boomerang | range x `(1 + 0.25/j)` for the j-th copy | same shrinking growth |
| Orbit | the same target can be hit again after `0.3 / H(k)` s | logarithmic; orbit time unchanged |
| Mine | trigger size x `(1 + 0.25/j)` for the j-th copy | same |
| Curving Right, Random Curve | **cap 1**: their turn rates add, so a 2nd copy makes the shot circle or weave out of the fight (audit B: x0.00) | n/a |
| Status and Mitosis effects, Delay Line, Capacitor, Executioner, Gravity Well, Shield-Breaker, Armor-Piercer, Pure Converter | cap 1 (the engine reads one level) | n/a |

## Step 6 - hero levels
Cost of level n is `max(1, round(1.2^(n-1)))` Medals, no cap; `HERO_MAX_LEVEL` is removed. +0.5 base damage per level stays. The captain screen prints the level
with no "/ max" and long names scale down with the card text.

## Step 7 - bugs and safety (no clamp)
- Shield-Breaker multiplies only the damage dealt to a shield (the hit's overflow to HP is not boosted).
- Projectile damage, the Delay Line queue and the Residue cloud damage are `Float64Array`.
- `!(damage > 0)` drops a packet where a pulse's damage is decided and in `applyDamage`. Infinity kills a target; `x * 0` is written so Infinity x 0 is 0, never NaN; HP can never become NaN (guarded in `applyDamage`, burn, spill and cloud ticks).
- `fmtBig`: plain below 1000, then K, M, B, T, then scientific (`1.2e45`); non-finite input prints `0` (NaN) or an infinity sign, never the words.

## Step 8 - save version 8
Upgrade levels of blocks that lost them are reset to level 1 and refunded at the old upgrade price; copies above a new cap are refunded at the old
copy price and `owned` is set to the cap; placed copies above what is now owned are removed by the existing inventory trim (last in reading order first), counted and reported once.
Old prices are frozen in `src/econ/legacyPrices.ts` for this. Hero levels are kept.

## Deviations from the prompt (all of them)
1. **Stacking shape blocks need a price growth.** They have no cap, so a copy price curve is needed: 2 x today's base and growth 1.30 (the normal band).
2. **Piercing.** There is no hard pierce count in the engine: a shot already pierces until its damage is used up, and each hit costs `1/L` of the damage it has (so the damage decays geometrically). "+1 pierce per copy" is built as one more in that divisor (`1 / (L + extra)`): the shot carries one more hit's worth of damage per copy, and the loss per hit stays the existing rule.
3. **Chain Lightning.** The jumps of one block already deal a flat 70% each (not falling), so "damage falling per jump as now" is made true for the jumps that copies add: the e-th extra jump deals 0.85^e of a normal jump (`CHAIN_STACK_FALL`).
4. **AoE** uses the owner's numbers (radius x (1 + 0.25/j) for the j-th copy, damage x0.95 per extra copy). An AoE shot detonates on its first hit, so a Fork, Piercing or Bouncing block on the same path does nothing for that shot (existing behaviour, not changed).
5. **Cap 1 beyond the owner's list:** Delay Line (a copy only adds delay), Executioner (the engine reads one level), Gravity Well, Shield-Breaker, Armor-Piercer Tip, Pure Converter, Curving Right and Random Curve (turn rates add: a 2nd copy makes the shot circle).
6. **Level-1 numbers change** (override of rule 6) for the twelve blocks fixed at level 3: Alternator, Random Router, Capacitor, Executioner, Cleaver, Culling Bolt, Piercing, Boomerang, Chain Lightning, AoE Rectangle, Frostbite, Static Charge (and Percent x / Gambler's Gate by the owner's step 3).
7. **Shield-Breaker text** was rewritten: "Damage dealt to a shield x1.5 (L1), and shields take double on top of that. Hits on armor and HP are unchanged." The shield still takes `mult x 2` per point of direct damage, as before; only the HP-side multiplier (which the old text did not promise) is gone.
8. **`fmtBig` had a pre-existing bug** (its zero-stripping ran on whole numbers: 100K printed as 1K, 950K as 95K); fixed with the rewrite.
9. **Infinity prints as an infinity sign** (`∞`), NaN as `0`; the words never appear.
10. **Bounces** are capped at 127 (the pool stores them in an Int8Array); one block gives 2, so 126 copies would be needed.
11. **Saves:** pre-v8 levels are read with a ceiling of 10 so the migration can refund them; v8 data is trusted as is (the cheat panel may exceed caps, and the e2e scripts' "rich" save of 20 copies of everything is written as version 8).
12. **Hero levels** have a sanity ceiling of 100,000 when loading a save (anything above is treated as a damaged save).
13. **Audit bench:** `scripts/lib/dmgBench.ts` gained an optional fourth scenario "spread" (a dense row of 30 small bodies, ship aimed at its middle) and an `hpMul` option; they are not part of `benchAll`, so every older table is unchanged. The stacking check averages four target HPs (x3 to x4.5) on a 48 s bench, because with small numbers a body dies after a whole number of hits and a x0.95 can cost a whole hit at one HP and nothing at another.
14. **e2e:** `e2e/lib.cjs` writes the rich save as version 8, `freefly-waves` expects saved version 8, and `economy16c.e2e.cjs` is new.


## Results

### Tests
Typecheck clean; 568 unit tests pass (526 before, 42 new in `tests/economy16c.test.ts`, about 25 old ones adapted because they hard-coded the old numbers). Full e2e on the new code: the same five scripts fail in the same way as at baseline (`builder` 2, `campaign` 4, `chunk1` 2, `frontier15a` 1 at 34 fps, `economy` exit 2); the only NEW failure was `shop16b` (it assumed Flat+ has no cap and bought a 21st copy), fixed in the script (it starts from 5 copies). New `economy16c` passes 12 of 12. After merging `origin/main` (the 5-column palette) `shop16b`, `economy16c`, `builder-extra`, `builder` and `chunk1` were rerun with the same results.

Mutation checks (broken on a scratch copy, tests run, restored; log in `reports/chunk16c2/mutation-check.txt`): Percent x top x3 to x4, buyCopy ignoring the cap, Piercing copies not adding to the divisor, Shield-Breaker boosting nothing on a shield, `mulSafe` as a plain multiply, migration refunding one level short, AoE growth not shrinking, the `fmtBig` zero-stripping bug back, Fork pairs all equal, Gambler staying 50%: **all 10 killed** by at least one test.

### Before / after
`docs/economy-audit-tables.md` is the 16c-1 audit (before), `docs/economy-audit-tables-16c2.md` is the shipped game (after).

| thing | before | after |
|---|---|---|
| Percent x per copy L1 / L5 / L10 | x1.5 / x3.5 / x6 | x1.5 / x2.04 / x3 |
| 10 Percent x, all L10 | x6.05e7 | x59,049 |
| Gambler's Gate chance L1 to L3 | 50% to 60% | 40% to 50% |
| 10 Percent x at L1, credits (Dart runs) | 2,823 (37) | 4,262 (56) |
| Percent x upgrade ladder L1 to L10 | 241,255 | 201,045 |
| 10th Percent x | 532 | 1,060 |
| Turn Left base / cap | 40 / none | 30 / 8 |
| Splitter 3 | 350 / none | 700 / 1 |
| blocks with upgrades | 41 | 8 |
| 2nd copy of a shape block | x1.00 (nothing) | stacks, see below |
| hero level cost, cumulative to level 10 / 20 | 30 / no level 20 | 25 / 185 |
| projectile damage storage | Float32 | Float64 |

Shape blocks stacking, HP/s in the block's own scenario with 0 to 6 copies (48 s bench averaged over four target HPs; every row passes the audit's "never falls" and "flattens" checks):

- Piercing 7.3 / 10.9 / 11.7 / 12.2 / 12.6 / 12.7 / 12.8
- Bouncing 7.3 / 8.0 / 8.7 / 8.8 / 8.9 / 9.0 / 9.0
- AoE Circle (crowd) 1.9 / 8.4 / 9.4 / 10.3 / 11.3 / 11.3 / 11.3
- AoE Rectangle (crowd) 1.9 / 18.8 / 22.5 / 23.4 / 25.3 / 26.3 / 27.2
- Chain Lightning 7.3 / 20.4 / 21.1 / 23.5 / 25.6 / 29.8 / 29.8
- Fork on Impact 7.3 / 11.5 / 13.9 / 15.2 / 16.2 / 17.3 / 18.1
- Boomerang 7.3 / 15.3 / 23.8 / 23.8 / 23.3 / 24.3 / 23.9 (worst step -2%)
- Homing 7.7 / 7.8 / 7.8 / ... (nothing to gain against targets that do not move)
- Orbit 7.7 / 7.2 / 7.2 / ... and Mine 7.7 / 3.9 / 3.9 / ...: the first copy costs DPS on this bench and copies 2 to 6 change nothing. Orbit's gain is shown by a unit test on a target the shot keeps overlapping, and Mine's size by another unit test.

Honest notes: Homing, Orbit and Mine are flat on the bench because its targets hover and have no armor. AoE copies beyond about the 8th would start to lose DPS (x0.95 per copy against a radius gain that keeps shrinking). Chain Lightning gains stay positive until the targets run out.

### Frame rate and engine cost with a heavy stacked build
Browser (headless Chromium, software renderer, `e2e/economy16c.e2e.cjs`, Free Fly wave 3, the 51 straight cells of the Fan snake filled with 17 Fork, 17 Piercing and 17 Bouncing): **60.3 fps, p95 frame 16.7 ms, peak 182 projectiles in the air**, against 60.3 fps, p95 16.8 ms and peak 6 for the plain build (Flat+, Percent x). The headless page is capped at 60 fps, so this shows the load does not pull it below 60, not how much headroom there is.

Engine only (`scripts/perf-stack.ts`, wave 25, 30 s, pool limit 4000): plain 0.04 ms per update; Fork x7 0.04 ms (peak 59 projectiles); the absurd Fork x51 line 0.12 ms mean, 0.27 ms p99, 0.62 ms max, peak 407 projectiles (a tenth of the pool); Piercing, Chain and AoE x51 0.04 ms. Full table: `reports/chunk16c2/perf-stack.md`.

### Contact sheet
`reports/chunk16c2/sheet_economy.png`: Shop with Turn Left "Owned 8 / 8" and a greyed "Max" button, no level line and no Upgrade button; Shop with Piercing (no cap, only a Buy button, rule text "1/3 of the damage it dealt"); Free Fly wave 3 with the heavy stacked build (cyan shots over the screen); Captain tab with "Hero level 26", "+13 base damage now" and the grey button "Upgrade +0.5 - 114 Medals" with the toast "Cadet is now level 26".
