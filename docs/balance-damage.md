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
