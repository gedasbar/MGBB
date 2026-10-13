# Damage balance (chunk 14a): small numbers

Owner's fixed rules: every hull's basic shot deals **1**; Flat+ adds **+1**; power comes from more shots, multipliers,
status effects and chaining, not from big base numbers. Numbers only: no mechanic is added or removed.

## 1. Design (step 1)

### a) How the rescale works

The engine was already almost scale-free. The generator's packet has always started at 1 damage; every other block is a
multiplier or a share of the hit (Percent ×, chance gates, Splitter, Overclock, Capacitor, Executioner, Pierce cost,
chain, ignite, residue, spill, culling ...), and armor and shields are ratios (armor 10 against the engine's armor scale
10 halves direct damage; shields are a share of HP). Only two things carried the inflated scale:

| what | before | after | factor |
|---|---|---|---|
| Flat+ | +100 x level | **+1 x level** | /100 |
| wall block HP at tier 1 (`BLOCK_HP_BASE`) | 100 | **2** | /50 |
| rock HP at tier 1 (`TIER1_ROCK_HP`) | 250 | **5** | /50 |

Why /50 for HP and /100 for Flat+: the average early build is "generator + one Flat+", which dealt 101 and now deals 2
(a factor of 50.5). Dividing HP by 50 keeps that build's time-to-kill exactly where it was (tier-1 wall block: 1 shot
then and now; tier-1 rock: 3 shots then and now). Builds with more Flat+ lose a little (two Flat+: 201 -> 3, a factor of
67), builds with no Flat+ gain a lot (1 -> 1). That is the owner's intent: Flat+ is an early block, multipliers take over.

- **Pulse rate is the main hull stat.** The damage of the basic shot is 1 on every hull; hulls differ by pulses per
  second (`HULL_FIRE_RATE_MUL` x `CONFIG.PULSE.BASE_RATE`), slots and ejectors. The rates are tuned in step 4.
- **Fractional damage.** Kept as floats internally (Percent × 1.5 on 2 = 3, a 70% chain jump on 2 = 1.4, an ignite tick
  of 0.3). Integer-only damage would round a 1.5x multiplier on a base of 1 to nothing (1.5 -> 1 or 2), so every
  multiplier below x2 would be either useless or doubled: floats are the only way small numbers stay meaningful.
  Displays show **at most one decimal** (2, 1.5, 0.3); a value that is a whole number shows no decimal.
- **HP are integers** at their source: a wall block's HP (and its spike x1.6 and its shield) and a director-spawned
  rock's HP are rounded to a whole number, at least 1. Split children keep their exact share of the parent (2.75 for a
  5 HP rock); nobody sees a rock's HP (cracks show it), and rounding children would change the family totals the
  economy is built on.

### b) Damage-related blocks, old vs new (rescale only; step 4 changes are in section 4)

Base 1. "Packet" = damage of one shot of Generator -> block -> ejector, or of the stated circuit.

| block | rule | old L1 | old L5 | new L1 | new L5 |
|---|---|---|---|---|---|
| Flat + | adds | +100 (packet 101) | +500 (501) | **+1 (packet 2)** | **+5 (6)** |
| Percent × | multiplies | x1.5 | x3.5 | x1.5 | x3.5 |
| Lucky Strike (max L3) | 33% x2 | avg x1.33 | L3 avg x1.43 | same | same |
| Jackpot (max L3) | 4% x10 | avg x1.36 | L3 avg x1.54 | same | same |
| Gambler's Gate (max L3) | 50% x3 else lost | avg x1.5 | L3 avg x1.8 | same | same |
| Splitter 2 / 3 | copies | x1 each | x1.2 each | same | same |
| Alternator | one of two, x | x2 | x2.4 | same | same |
| Overclock | streak avg (60 packets) | x1.58 | x1.78 | same | same |
| Capacitor | 3 in 1 | x3 per 3 pulses | x4.2 | same | same |
| Executioner | under 25% HP | x3 | x4 | same | same |
| Culling Bolt | % of max HP | 4%, cap 6x shot | 8% | same | same |
| Shield-Breaker (max L3) | direct x | x1.5 | L3 x2.5 | same | same |
| Armor-Piercer (max L3) | vs armor | x2 | L3 x4 | same | same |
| Chain Lightning | jumps x70% | 2 jumps | 4 jumps | same | same |
| Ignite | burn % of hit /s, 3 s | 30% | 70% | same | same |
| Static Charge | 3 hits -> pulse | 150% | 250% | same | same |
| Residue Seed | cloud % of kill hit | 40% | 80% | same | same |
| Overkill Spill (max L6) | children take % | 300% | 500% | same | same |
| Cleaver | vs fragments | x2 | x2.4 | same | same |
| Frostbite | taken bonus | +25% | +45% | same | same |
| Piercing, Bouncing, AoE, Fork, Homing, Curve, Boomerang, Orbit, Mine | shape of the shot | ratios | ratios | same | same |

Only Flat+ changes in the rescale itself: with base 1, the old "+100" is "+1" at the same proportion of a 1-Flat+
build. Everything else already reads as multiples of the base and keeps its number; whether those numbers are good is
step 2's question.

### c) Captain hero levels

`HERO_LEVEL_BASE_DAMAGE = 1` adds +1 to the generator's 1. Before this chunk that was +1 on a 101 packet (1% a level,
nothing). Now it is +100% a level on the base: level 10 = base 11 = **11x** for a multiplier build (6x for a Flat+ build,
2 -> 12).

Medal pace: hero level 5 costs 9 Medals, level 10 costs 30 in all, and the same Medals also buy captains (10/25/50) and
options (2/4/7/11). One Medal per first clear plus 23 from Free Fly milestones puts level 5 at about tier 10-15 and level
10 at about tier 35-50 for a player who buys levels first. Wall HP grows 1.055^tier: x2.1 at tier 15, x6.2 at tier 35,
x10.6 at tier 45. So +1 per level alone outruns the walls until about tier 45: the hero level would substitute for every
block and hull purchase, and the multiplier blocks would multiply it on top.

**Proposal: `HERO_LEVEL_BASE_DAMAGE = 0.5`** (level 5 = base 3.5, level 10 = base 6). Level 10 is then x6, about the HP
growth of tier 35 where a buyer reaches it, so heroes keep pace instead of outrunning. Flat+ still fades as the owner wants:
+1 on base 3.5 is +29% at level 5 (+17% with the old constant), against +100% on a fresh save. Applied in step 4 and
flagged in the report (DECISIONS lists it).

### d) What changes on screen

- **Free Fly damage popups** (white hit numbers, orange burn ticks, amber residue ticks) used `Math.round`, which would
  show 0 for a 0.3 burn tick and 2 for a 1.5 hit. They use a shared `fmtDamage` (at most one decimal, no ".0").
- **Builder stat lines / inspector** already format with at most one decimal (`fmtNum`); unchanged.
- **Wall blocks** show HP as the size of the inner square (a share of max HP), no number; unchanged, it is scale-free.
- **Credits and prices** (`fmtBig`, K/M suffixes) are not damage numbers; unchanged.
- **Block texts**: Flat+'s text reads "+1 damage" from the same function as the engine.
- **Hit sound pitch** (`damagePitch`, log10 of the damage) now sits at its low end for nearly every hit; it is cosmetic
  and left alone (noted, not tuned).

## 2. Measurement (step 2: after the rescale, before any tuning)

Script: `npm run balance-damage` (`scripts/balance-damage.ts`, benches in `scripts/lib/dmgBench.ts`; `PART=a,b,c,d`,
`QUICK=1` for a short run). Full output of this run: `reports/balance-damage-before.md`. Everything here is measured by
script and bot on the real engine, not by a person playing.

**How it measures.** Part A benches each visible block on a reference circuit (Twin: generator -> [Flat+] -> block ->
ejector; routing blocks on a Fan) in the real Free Fly engine against (i) one big target, (ii) a cluster of 8, (iii) a
splitting rock. Targets hover 200 px and 450 px above a tracking ship (half the time each). Their HP is sized to the
circuit's estimate, so overkill costs every gun the same share. Part B is a seeded hill-climb (6 restarts x 900
mutations) per hull and level. It scores circuits by the compile estimate x the engine factors from part A (strongest
trick in full, the next at the square root ...), then benches its best 20 on the engine. "Reference" = at most 2 copies
of a block; "free" = up to 8 copies. Part C prices every circuit the searches met (hull + copies + upgrades), assumes 3
runs per tier destroying 50% of the wall each, and compares the best affordable wall DPS with what a wall needs. Part D
flies the existing Free Fly bot.

### Top outliers (before tuning)

| # | what | size | cause |
|---|---|---|---|
| 1 | Shuttle L5 free search: Percent × L5 piled on one line | 164x the reference median | Percent × multiplies (x3.5 at L5) and copies compound without limit |
| 2 | Shuttle L5 free 2-5: the same with Capacitor | 60x | same stacking |
| 3 | Fan L5 free 1-5: nested Splitter 3 L5 + Piercing L5 + Percent × | 10.4x | Splitter L5 (x1.2 per copy) compounds; Piercing re-hit (below) |
| 4 | Piercing L5 on one big target | 4.4x the reference (L5/L1 = 4.4) | a piercing shot never skipped the body it just hit: it hit it again every frame, each hit costing only 1/5 |
| 5 | Progress: owned / needed wall DPS at tier 30 / 50 / 75 | 156x / 361x / 2555x | the stacking above, bought cheaply (copies cost 1.18^n) |
| 6 | Fan L1 free: Jackpot / Gambler's Gate repeated | 2.2x | chance gates compound like Percent × |
| 7 | Cauterize / Overkill Spill L5 vs a splitting rock | 5.7x the reference | by design (the family never splits / dies at once): their niche, rocks only |
| 8 | AoE - Rectangle / Circle L5 vs a cluster | 4.6x | by design (area); single target 1.0 |
| 9 | Culling Bolt L1 single target | 1.61x (category limit 1.6) | % of max HP on top of the hit; borderline |
| 10 | Gambler's Gate L1 single target | 1.80x (1.26 of the damage median) | x3 at 50%; inside the band |

### Bottom blocks (before tuning)

| block | L1 single target (x ref) | best niche | why |
|---|---|---|---|
| Orbit L5 | 0.00 | 0.00 | orbits 3 s, the shot's max age is 3 s: it never launches. L5 is worse than L1 (0.83) |
| Random Router L1 | 0.50 | 0.49 | one lane per pulse: the same as a Turn, at an uncommon price; a Splitter 2 is 2x |
| Curving Right | 0.50 | cluster 0.23 | curves away from what is ahead (a maze-wall tool; no maze in the bench) |
| Mine | 0.52 | 0.60 | waits for targets to touch it (setup block; walls run into it) |
| Random Curve | 0.57 | 0.60 | weaving shots miss |
| Turn Left / Right | 0.50 | - | routing only (expected, not a damage block) |
| Capacitor L1 | 0.88 | split 1.45 | same DPS in bigger, slower shots (its point) |
| Cleaver L1 | 0.89 | split 1.45 | x0.9 to parents, x2 to fragments (rocks only) |
| Delay Line | 0.97 | - | timing only (by design) |
| Pure Converter, Armor-Piercer Tip, Corrosion | 1.00 | not benched | armor tools; the bench has no armored target (not verified here) |

### Where progress breaks (before tuning)

- **Tier 1**: needs 9.1 DPS to clear, the Dart + Flat+ has 2 (ratio 0.22): the Dart can pass tier 1 but not clear it.
  The old numbers were the same (balance-wall: clear ratio 4.5x the starter).
- **Tiers 5-10**: owned / needed 1.6-2.0 without hero levels: about right (clears in one or two runs).
- **Tier 20 on**: far too easy for a buyer who stacks multipliers: 12x at tier 20, 156x at 30, 2555x at 75, still 406x
  at tier 100. Hero levels at +1 a level multiply that by another 2-6x (tier 30: 546x).
- **Free Fly bot**, best reference circuit per hull (target for a strong build in brackets): Dart L5 7.3 (5), Twin L5
  14.7 (8), Prong L5 12.0 (12), Fan L5 38.0 (16), Shuttle L5 34.3 (20). By credits: 0 -> wave 5, 500 -> 11, 8000 -> 31.
  Free Fly is too easy for strong builds, and the Prong is no stronger than the Twin.
