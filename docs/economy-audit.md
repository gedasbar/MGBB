# Economy audit (chunk 16c-1)

Read-only for game code: nothing in `src/` changed, no number, price, save or UI. Everything below is measured by
`npm run economy-audit` (`scripts/economy-audit.ts`, ~1 minute, rerunnable; `PART=a,b,c,d,e,f`, `QUICK=1`). The script
writes every generated table to `docs/economy-audit-tables.md`; this file quotes the ones that matter and adds the
reading, the proposals and the open questions. Benches run on the real engine through `scripts/lib/dmgBench.ts` (the
chunk 14a bench). Owner decisions from the brief are treated as inputs.

Short names: "bench" = engine HP removed per second against (big) one big target, (cluster) 8 small bodies, (split) one
splitting rock. "Dart run" = one Free Fly bot run with the starter Dart (76 credits, 185 s). Numbers are rounded.

---

## A. Block classification

All 62 registered blocks are in the generated table (`docs/economy-audit-tables.md`, section A: category, class, levels,
what L1 and the top level do, base price, L1 to L2 price, flag, reason). The 41 shown ones, with the proposal, are here.
Today every block has copy growth x1.18 per copy owned and an upgrade price of base x 2.0 x 2.2^(L-1); the level is per
block and shared by every copy.

Rule applied: no upgrades for turns, splitters, Piercing, Bouncing, AoE, and every effect block (status, trigger,
special effect, the whole Mitosis category, Chain Lightning, Gravity Well, Static Charge). Upgrades stay for Flat+,
Percent x and the three chance boosters. Everything the rule does not clearly cover is **ambiguous** (`?`), with my
recommendation in brackets.

| block | category | class | max L today | base price | proposed upgrades | level kept | stack cap (part B) |
|---|---|---|---|---|---|---|---|
| Turn Left / Turn Right | pathing | pathing | 3 | 40 | no | L1 | 8 each |
| Splitter 2 | pathing | pathing | 5 | 200 | no | L1 | 2 |
| Splitter 3 | pathing | pathing | 5 | 350 | no | L1 | 1 |
| Alternator | pathing | pathing (also a x2 multiplier) | 5 | 800 | ? (no) | L3 | 1 |
| Random Router | pathing | pathing | 5 | 500 | ? (no) | L3 | 1 |
| Delay Line | pathing | pathing (timing only) | 5 | 500 | ? (no) | L1 | 1 |
| Flat + | damage | flat damage | 10 | 60 | yes | 1..10 | 10 |
| Percent x | damage | multiplier | 10 | 120 | yes | 1..10 | 10 |
| Lucky Strike | damage | chance-multiplier | 3 | 100 | yes | 1..3 | 6 |
| Jackpot | damage | chance-multiplier | 3 | 150 | yes | 1..3 | 6 |
| Gambler's Gate | damage | chance-multiplier | 3 | 180 | yes | 1..3 | 4 |
| Overclock | damage | pulse modifier | 5 | 500 | ? (no) | L1 | 3 |
| Capacitor | damage | pulse modifier | 5 | 800 | ? (no) | L3 | 1 |
| Executioner | damage | setup (conditional x3) | 5 | 800 | ? (no) | L3 | 1 |
| Fission Catalyst | mitosis | effect | 5 | 1200 | no | L1 | 1 |
| Cauterize | mitosis | effect | 5 | 500 | no | L1 | 1 |
| Cleaver | mitosis | effect | 5 | 500 | no | L3 | 1 |
| Culling Bolt | mitosis | effect | 5 | 800 | no | L3 | 1 |
| Residue Seed | mitosis | effect | 5 | 800 | no | L1 | 1 |
| Overkill Spill | mitosis | effect | 6 | 500 | no | L1 | 1 |
| Piercing | modifier | shape | 5 | 250 | no | L3 | 1 |
| Bouncing | modifier | shape | 5 | 250 | no | L1 | 1 |
| AoE - Circle | modifier | shape | 5 | 300 | no | L1 | 1 |
| AoE - Rectangle | modifier | shape | 5 | 300 | no | L3 | 1 |
| Shield-Breaker | modifier | setup | 3 | 220 | ? (yes) | 1..3 | 1 |
| Armor-Piercer Tip | modifier | setup | 3 | 220 | ? (yes) | 1..3 | 1 |
| Pure Converter | modifier | setup | 5 | 300 | ? (yes) | 1..5 | 1 |
| Boomerang | modifier | shape | 5 | 500 | ? (no) | L3 | 1 |
| Orbit | modifier | shape | 5 | 800 | ? (no) | L1 | 1 |
| Mine | modifier | shape | 5 | 500 | ? (no) | L1 | 1 |
| Curving Right | modifier | shape | 3 | 150 | ? (no) | L1 | 1 |
| Random Curve | modifier | shape | 3 | 150 | ? (no) | L1 | 1 |
| Homing | modifier | shape | 5 | 400 | ? (no) | L1 | 1 |
| Fork on Impact | modifier | shape | 3 | 450 | ? (no) | L1 | 1 |
| Chain Lightning | modifier | effect | 5 | 1200 | no | L3 | 1 |
| Gravity Well | modifier | effect | 5 | 800 | no | L1 | 1 |
| Ignite | status | effect | 5 | 500 | no | L1 | 1 |
| Frostbite | status | effect | 5 | 800 | no | L3 | 1 |
| Corrosion | status | effect | 5 | 800 | no | L1 | 1 |
| Static Charge | status | effect | 5 | 500 | no | L3 | 1 |

Counts: 5 yes, 20 no by the owner's rule, 16 ambiguous (13 recommended no, 3 recommended yes).

The 21 hidden blocks (Generator, Ejector, Straight, Crossover, Diode, Merger, Portal Pair, Reflector, Armored Plating,
Berserker Coil, Tithe, Magnetized, Magnetize Target, Vampiric and the seven passives) are `no` upgrades and not
offered; they have no price. The hidden single-level ones keep L1.

**Why each ambiguous block is ambiguous**
- Alternator: a router, but each emitted packet is x2 (x2.4 at L5), so on the Fan it doubles DPS (x2.06 measured, the same as a
  Splitter 2 at a quarter of the price). Random Router and Delay Line: routing and timing, not damage.
- Overclock, Capacitor, Executioner: damage-flavoured but stateful or conditional. Overclock **stacks** (see B), Capacitor is
  DPS-neutral, Executioner is a trigger (x3 below 25% HP).
- Shield-Breaker, Armor-Piercer, Pure Converter: numeric counters, not status or trigger effects. They are the
  only blocks where an upgrade is the only way to grow (a second copy adds nothing), so I recommend keeping upgrades
  with a cap of 1.
- Boomerang, Orbit, Mine, Curving Right, Random Curve, Homing, Fork on Impact: the same family as Piercing/Bouncing/AoE (shape of the
  shot) but not named; recommended `no` for consistency.

### A2. What the single level should equal, and what it does to power

Benched at L1, the middle level and the top level (Twin line for ordinary blocks, Fan for routing). "Gain" is relative to
that block at L1, in big / cluster / split. Rule used: keep the middle level when its best gain is at least 1.1x, else L1
(turns and splitters always L1: their higher levels are only a speed bonus or a x1.05 copy bonus per level).

| block | proposed level | mid gain b/c/s | top gain b/c/s | power change vs today's L1 | vs today's top level |
|---|---|---|---|---|---|
| Turn L / R | L1 | 1.00 / 1.00 / 1.00 | 1.02 / 1.06 / 1.42 (noise; it is a speed bonus) | none | -2% to -29% |
| Splitter 2 / 3 | L1 | 1.10 / 1.10 / 1.10 | 1.20 / 1.20 / 1.20 | none | -17% (the x1.2 per copy of L5 is gone) |
| Alternator | L3 | 1.10 | 1.20 | +10% | -8% |
| Random Router | L3 | 1.06 / 1.01 / 1.14 | 1.19 / 1.22 / 1.29 | +14% | -12% |
| Capacitor | L3 | 1.20 | 1.40 | +20% | -14% |
| Executioner | L3 | 1.00 / 1.00 / 1.40 | 1.00 / 1.00 / 2.07 | +40% vs splitting rocks | -32% |
| Cleaver | L3 | 1.08 / 1.32 / 0.97 | 1.17 / 1.32 / 0.98 | +32% on clusters | none |
| Culling Bolt | L3 | 1.08 / 1.00 / 1.94 | 1.27 / 1.00 / 1.39 | +94% vs splitting rocks | +40% (the bench is noisy here) |
| Piercing | L3 | 1.00 / 1.50 / 1.32 | 1.00 / 1.54 / 1.34 | +50% on clusters | -2% |
| Boomerang | L3 | 1.48 / 1.21 / 0.98 | 1.65 / 1.46 / 1.28 | +48% | -10% |
| Chain Lightning | L3 | 1.00 / 1.25 / 1.02 | 1.00 / 1.21 / 0.98 | +25% on clusters | +4% |
| AoE - Rectangle | L3 | 1.00 / 1.75 / 1.24 | 1.00 / 1.75 / 1.24 | +75% on clusters | none |
| Frostbite | L3 | 1.06 / 1.00 / 1.91 | 1.06 / 1.00 / 1.37 | +91% vs splitting rocks | +40% |
| Static Charge | L3 | 1.10 / 1.00 / 1.02 | 1.11 / 1.00 / 1.39 | +10% | -21% |
| every other no-upgrade block | L1 | about 1.00 (+-6%) | up to 1.09 | none | up to -9% (Orbit L5 -33%, which is a bench artefact: the orbit never launches) |

Reading: for most blocks the spread between L1 and the top level is small (under 10%), so dropping upgrades costs
almost nothing there. Splitter and Executioner lose the most. Raising a block to its middle level changes the
numbers of a block that exists today; CLAUDE.md rule 6 says level-1 numbers must keep working, so the safe
first step is **L1 everywhere** (nothing changes) and the middle-level list above is a follow-up tuning decision for the
owner (Question 2).

---

## B. Marginal value of the 1st to 5th copy

Circuit: one lane on the Fan (generator, Flat+, then k copies in a straight line, ejector; Flat+ itself has no Flat+ in
front). Each copy's DPS divided by the DPS with one fewer copy, in all three scenarios, L1 and (where it matters) the
proposed level. Full tables are in `docs/economy-audit-tables.md`, section B. The most important result is not a
number but a fact about the engine:

> **The engine reads one level per modifier type.** A second copy of any block that tags the shot with a modifier
> (every Mitosis, status, shape and setup block) adds exactly x1.00 in all three scenarios. Copy caps of 1 are
> already physical truth for about 25 of the 41 blocks; only the price and the UI have to say so.

| verdict (proposed cap) | blocks | evidence (copy 2 .. copy 5) |
|---|---|---|
| **1** (a 2nd copy does nothing) | Executioner, Fission Catalyst, Cauterize, Cleaver, Culling Bolt, Residue Seed, Overkill Spill, Piercing, Bouncing, AoE Circle, AoE Rectangle, Shield-Breaker, Boomerang, Chain Lightning, Gravity Well, Homing, Fork on Impact, Ignite, Frostbite, Static Charge | x1.00 exactly, every scenario |
| **1** (also nothing for copy 1 in this bench) | Armor-Piercer, Pure Converter, Corrosion | x1.00: bench targets have no armor or shield; they matter only on armored walls (tier 11+), not measured |
| **1** (the first copy already costs DPS here: trade-off or utility blocks) | Orbit (x0.79 / 0.00 / 0.84), Mine (x0.54 / 0.54 / 0.93), Curving Right, Random Curve, Delay Line (x0.98 each) | below the plain Flat+ circuit by design |
| **1, and stacking hurts** | Capacitor: 3 copies x0.64-0.77, 4 and 5 copies x0.00 (the chain waits 3^k pulses, nothing fires in the 8 s window). Curving Right: the 2nd copy turns the shot into x0.00. Random Curve: net negative | the "cap 2-3" the script prints for Capacitor is noise on a non-monotone curve; the cap is 1 |
| **1** (routing, lanes limited by ejectors) | Splitter 3, Alternator, Random Router | see B2 |
| **2** | Splitter 2 | Fan: one Splitter 2 = 2 lanes, a hand-routed second one = 3 lanes (x3.06); nothing more. Prong: a Splitter 2 gives no extra lane at all |
| **3** (my choice; it scales) | Overclock | x1.23-1.45 per copy up to copy 5 (stateful streak; on paper avg x1.58 each at L1). It is a hidden multiplier that no rule caps today |
| **scales** (owner's cap 10 / proposed 10, 6, 6, 4) | Flat+ (additive: x2, 1.5, 1.33, 1.25, 1.2 per copy, always +1 damage), Percent x (exactly x1.5 per copy), Lucky Strike, Jackpot, Gambler's Gate (each copy multiplies by its average; bench per-copy values scatter x1.0-2.2 because the gates are random, so ceilings below use the exact averages) | |
| **no DPS, count by routing** | Turn L / Turn R | the longest line on the Fan needs 8 + 8 turns, the Shuttle's 4 + 4; a 3-lane Fan circuit 2-5 |

First-copy gain (big / cluster / split) of the blocks worth buying, vs the bare Flat+ circuit, as a sanity table:
AoE Circle 1.00 / 3.04 / 2.06 · AoE Rectangle L3 1.00 / 3.60 / 2.55 · Chain Lightning L1 1.00 / 2.06 / 2.04 (L3 1.00 /
2.69 / 2.05) · Fork 1.00 / 1.58 / 2.00 · Homing 1.04 / 1.20 / 1.48 · Piercing L3 1.00 / 1.53 / 1.99 · Bouncing 1.09 /
1.14 / 1.93 · Boomerang L3 1.66 / 1.68 / 1.97 · Residue Seed 1.00 / 1.34 / 1.99 · Overkill Spill 1.00 / 1.00 / 3.08 ·
Culling Bolt L3 1.64 / 1.01 / 1.05 · Executioner 1.09 / 1.00 / 2.51 · **Shield-Breaker 1.36 / 1.56 / 1.48 on targets with no shield at
all** (see the surprises: its x1.5 is applied to every hit).

**B2. Splitters add lanes and lanes are limited by ejectors.** Compiled circuits on the Fan: Splitter 3 = 3 lanes
(x3.06 engine), a second Splitter 3 on the middle lane = still 3 lanes and an unchanged estimate (x3.06). Two Splitter 2
routed by hand = 3 lanes (x3.06). Prong: Splitter 3 = 2 lanes (x2.0), Splitter 2 = 1 lane (nothing). Dart, Twin and
Shuttle have one ejector: no splitter helps on them. Alternator = 2 lanes (x2.06), Random Router L1 = x1.57.
So: Splitter 3 cap 1, Splitter 2 cap 2 (an extra copy would only matter on a future hull with more ejectors; its cap
should be revisited then).

---

## C. Damage ceilings

### C1. Percent x ladder (assumed)

Owner: x1.5 at L1, x3 at the top level (L10, today's maxLevel), cap 10. Assumed ladder: **linear in log space**
(per-copy factor 1.5 x 2^((L-1)/9), x1.08 per level). Today's code is x(1 + 0.5 L), i.e. x6 at L10.

| level | per copy | 10 copies at this level |
|---|---|---|
| L1 | x1.50 | **x57.7** |
| L3 | x1.75 | x269 |
| L5 (mid) | x2.04 | **x1,256** |
| L7 | x2.38 | x5,858 |
| L10 (max) | x3.00 | **x59,049** |

(Today's ladder at L10: x60.5 million.) At 10 copies each upgrade level is worth x2.16, so one upgrade of the block (all
copies at once) is worth about x2 per level once the 10 copies are owned.

### C2. Chance boosters: proposed values and caps

They stack with Percent x. Per copy (expected value):

| block | avg x per copy L1 | at L3 | proposed cap | all copies L1 | all copies L3 | note |
|---|---|---|---|---|---|---|
| Lucky Strike | x1.33 | x1.43 | 6 | x5.5 | x8.5 | today's engine numbers (33% to 43% for x2) |
| Jackpot | x1.36 | x1.54 | 6 | x6.3 | x13.3 | today's numbers (4% to 6% for x10) |
| Gambler's Gate | x1.20 | x1.50 | 4 | x2.1 | x5.1 | **proposed** chance 40% to 50% for x3 (today 50% to 60% = x1.5 to x1.8: as strong as Percent x per copy and it also loses shots) |
| all three at the caps | | | 16 copies | **x72** | **x572** | |

Prices: all three below Percent x per copy value (family B in D: 70 / 75 / 45 against 100 for the Percent x).

### C3. Hull limits: how many multipliers fit in one line

A multiplier needs a straight cell on the signal's path. Searched with a randomised depth-first search and **built and compiled**
(Percent x on the straight cells, turns on the turn cells; the compiler returned one recipe with that many multipliers):

| hull | free cells | ejectors | pulses/s | multipliers in one line | turns L / R | lanes after the multipliers |
|---|---|---|---|---|---|---|
| Dart | 1 | 1 | 2 | 1 | 0 / 0 | 1 |
| Twin | 2 | 1 | 2.5 | 2 | 0 / 0 | 1 |
| Prong | 3 | 2 | 4 | 1 | 0 / 0 | 1 (a Splitter 3 takes the only cell before the multiplier) |
| Fan | 72 | 3 | 4 | **51** (hand-built snake, compiled) | 8 / 8 | 3 (Splitter 3 last in the line) |
| Shuttle | 47 | 1 | 5 | **31** (search, a lower bound) | 4 / 4 | 1 |

So the ownership cap of 10 binds only on Fan and Shuttle. On Dart, Twin and Prong the hull is the real limit: 1, 2 and 1
Percent x.

### C4. Ceiling per hull

Base damage 2 (generator 1 + one Flat+ L1, hero 0). Shot = base x Percent x chain x chance chain. DPS = shot x lanes x pulses/s.

| hull | multiplier slots (real) | real shot, all L1 | real shot, all L10 | cap-based shot, all L10 | cap-based, plus chance blocks (all L3, caps 6/6/4: x577) | real DPS, all L10 + the chance blocks that fit |
|---|---|---|---|---|---|---|
| Dart | 1 | 3 | 6 | 118,098 | 6.8e7 | 12 |
| Twin | 2 | 4.5 | 18 | 118,098 | 6.8e7 | 45 |
| Prong | 1 | 3 | 6 | 118,098 | 6.8e7 | 24 |
| Fan | 10 | 115 | 118,098 | 118,098 | 6.8e7 | 8.2e8 (3 lanes x 4 pulses/s x the shot; the chance blocks that fit on the line are included) |
| Shuttle | 10 | 115 | 118,098 | 118,098 | 6.8e7 | 3.4e8 (1 lane x 5/s) |

(The cap-based column assumes all 16 chance copies fit, which only the Fan and Shuttle lines allow: 10 + 16 = 26 straight cells.
Flat+ L10 copies and hero levels multiply every number again: 10 Flat+ L10 plus hero level 10 make the base 106, x53 on the
starter's 2.)

### C5 and C6. What the content needs, and the headroom

| content item | HP of the toughest block / Rock parent |
|---|---|
| Campaign tier 1 / 25 / 50 / 100, toughest block | 2 / 95 / 368 / 736 (whole wall 156 / 11.6k / 108k / 394k; clear DPS needed 3 / 323 / 3,036 / 11,015) |
| Frontier ring 10 / 25 / 50 / 100, toughest block | 105 / 135 / 193 / 433 (median of 5 squares; clear DPS 411 / 820 / 983 / 4,060) |
| Free Fly wave 10 / 20 / 30 / 50, basic Rock parent | 135 / 5,045 / 199,434 / 2.95e8 (Mother x3, a whole family x3.6) |

Headroom = ceiling shot / HP of one block (above 1 = one shot kills it). Fan or Shuttle, base 2:

| content | all L1 (115) | all L5 (2,511) | all L10 (118,098) | L10 + chance blocks (6.8e7) |
|---|---|---|---|---|
| Campaign tier 25 toughest block (95) | x1.2 | x26 | x1,243 | x717,835 |
| Campaign tier 50 (368) | x0.31 | x6.8 | x321 | x185,311 |
| Campaign tier 100 (736) | x0.16 (7 shots) | x3.4 | **x160** | x92,655 |
| Frontier ring 100 (700) | x0.16 | x3.6 | x169 | x97,420 |
| Free Fly wave 20 Rock (5,045) | x0.02 | x0.50 | x23 | x13,517 |
| Free Fly wave 30 Rock (199k) | 0 | x0.01 | x0.59 | x342 |
| Free Fly wave 50 Rock (2.95e8) | 0 | 0 | 0 | x0.23 (a few shots) |

**Reading.** The Percent x cap of 10 is far over what the walls and the Frontier need: all L1 (x57.7) already one-shots
every block until about tier 25 and a ring-10 Frontier square; the L5 ladder one-shots every wall block including tier
100; the L10 ladder is x160 over the hardest block in the game and about x1e5 with the chance blocks. Only Free Fly
waves 30 and beyond absorb the upper part of the ceiling (wave 30 needs about the L10 ladder, wave 50 is out of reach of
one shot even with every chance block: x0.23). The damage ceiling is therefore not what limits Free Fly progress after wave ~50; the walls stop mattering at a
mid-ladder build. Small hulls are limited by slots long before the cap (Dart 6, Twin 18, Prong 6 per shot at L10).

---

## D. Price and pacing

### D1. Income per run (bot, 3 seeds, cap 600 s)

| source | credits per run |
|---|---|
| Free Fly Dart + Flat+ | 76 (185 s) |
| Free Fly Twin + Flat+ | 86 (198 s) |
| Free Fly Twin + 2 Flat+ | 129 (257 s) |
| Free Fly Prong (Splitter 3, Flat+, Turn L) | 156 (285 s) |
| Campaign half-wall run, tier 5 / 10 / 25 / 50 / 100 | 24 / 44 / 172 / 996 / 21,416 |

The reward growth (1.05^tier) is x125 by tier 100: a late campaign run pays what hundreds of early runs paid.

### D2. Today's formulas (copy = base x 1.18^owned, upgrade = base x 2.0 x 2.2^(L-1), Percent x base 120)

| item | credits | Dart runs | Prong runs | tier-10 wall runs | tier-25 | tier-50 |
|---|---|---|---|---|---|---|
| 10 Percent x at L1 | 2,823 | 37 | 18 | 65 | 16 | 2.8 |
| upgrade ladder L1 to L10 (once, all copies) | 241,255 | 3,161 | 1,547 | 5,515 | 1,401 | 242 |
| 10 Percent x at L10 | 244,078 | 3,198 | 1,565 | 5,579 | 1,417 | 245 |

The 2.2 per-level growth matches the value growth of a level at 10 copies (x2.16), so with 10 copies a level costs about what it is
worth; with 3 copies it is a poor deal (x1.26 a level), which is the point of an upgrade being a late purchase.

### D3. Three candidate price families

Price of copy n = base x growth^(n-1). Upgrade ladder = normal base x 2 x 2.2^(L-1) in all three (kept: it tracks the value of a level).

| family | growth normal / cheap | bases cheap / normal / expensive |
|---|---|---|
| A Gentle (today's 1.18) | 1.18 / 1.18 | 40 / 120 / 400 |
| B Steady | 1.30 / 1.15 | 30 / 100 / 500 |
| C Steep | 1.45 / 1.20 | 20 / 80 / 600 |

| | first Percent x | 5 Percent x | 10 Percent x | full cheap set (4+4 turns, 2 Splitter 2) | expensive block, 1 copy | ladder L1 to L10 | all 10 at L10 |
|---|---|---|---|---|---|---|---|
| A | 120 (1.6 Dart runs) | 859 (11 runs) | 2,823 (37 Dart / 18 Prong runs) | 767 (10 runs) | 400 (5 runs) | 241k | 244k (3,198 Dart runs) |
| B | 100 (1.3) | 905 (12) | 4,262 (56 Dart / 27 Prong) | 560 (7) | 500 (7) | 201k | 205k (2,690) |
| C | 80 (1.0) | 962 (13) | 7,127 (93 Dart / 46 Prong) | 392 (5) | 600 (8) | 161k | 168k (2,200) |

Price of the Nth Percent x: A 120 / 142 / 167 / 233 / 324 / 532 (copies 1, 2, 3, 5, 7, 10), B 100 / 130 / 169 / 286 / 483 /
1,060, C 80 / 116 / 168 / 354 / 744 / 2,267.

**Recommendation: B.** The first five copies cost the same in all three families by design (about 11 to 13 Dart runs), so
the early game is the same; the families differ only in the tail. The 10th copy costs 532 / 1,060 / 2,267: against a
Prong run (156) that is 3.4 / 6.8 / 14.5 runs for ONE copy, against a tier-50 wall run (996) it is 0.5 / 1.1 / 2.3. A
(today) makes the last copies a one-evening purchase and leaves no chase; C turns the last three copies into a long
grind mid-game, when 14 runs of Prong income buy one copy; B keeps copies 8 to 10 a mid-game goal and a trivial purchase by
tier 50, with the chance boosters (cheaper, growth 1.25) as the "squeeze out more" sink. Because the reward growth makes any
price trivial late, keep the 2.2 upgrade growth at least (do not soften it); see Question 12.

### D4. Family B, block by block

Cap-1 blocks cost 2 x today's base (one copy, expensive; in Dart runs: 4 to 31). The generated table has the cost of
all copies and the ladder: `docs/economy-audit-tables.md`, D4. Highlights: Turn 30 x 1.15 cap 8 (412 for all 8, 5 Dart runs),
Splitter 2 120 x 1.15 cap 2 (258), Splitter 3 700 cap 1 (9 Dart runs), Flat+ 60 x 1.20 cap 10 (1,557), Percent x 100 x
1.30 cap 10 (4,262), Lucky 70 / Jackpot 75 / Gambler 45 x 1.25 (caps 6 / 6 / 4), Overclock 500 x 1.35 cap 3 (2,086),
AoE 600, Homing 800, Fork 900, Overkill Spill 1,000, Residue Seed 1,600, Chain Lightning 2,400, Alternator 1,600.

---

## E. Hero level cost

### E1. Medal supply

- Campaign: 1 Medal per tier's first full CLEAR (passing pays none): 100 over tiers 1 to 100.
- Free Fly milestones (waves 5 / 10 / 15 / 20 / 30 / 40 / 50): 1 + 2 + 2 + 3 + 4 + 5 + 6 = **23**, once per save.
- Frontier: a Medal on a seeded share of squares (8% at the origin falling to 2% far out, x2.5 in dead-end pockets), paid on the first CLEAR. Exact for the shipped seed:

| through ring | open squares | Medal squares | per 100 squares |
|---|---|---|---|
| 10 | 366 | 20 | 5.5 |
| 25 | 2,155 | **79** | 3.7 |
| 50 | 8,566 | **209** | 2.4 |
| 100 | 33,855 | 613 | 1.8 |

Totals available if everything is cleared: tier 25 = 34 (with 9 from Free Fly); tier 50 + ring 25 = 143; tier 100 + ring 25 = 199;
tier 100 + ring 50 = 332. Other Medal sinks: captains 85, options 96 (one per tier) to 192 (both). So the hero gets realistically
about 20 to 115 of the 199 at "tier 100 + ring 25".

### E2. Proposed geometric cost: base 1, ratio 1.2, no cap

cost(n) = round(1 x 1.2^(n-1)), at least 1. Cumulative: level 5 = 7, level 10 = 25 (today 30), level 15 = 71, **level 20 = 185**,
level 25 = 469. Reachable if every Medal goes to the hero: 7 at tier 10 (15 Medals), 11 at tier 25 (34), 18 at tier 50 + ring 25
(143), 20 at tier 100 + ring 25 (199), 23 at ring 50 (332). Level 20 is therefore nearly all Medals there are until the Frontier
is deep, a capstone. Alternatives (cumulative to level 10 / 15 / 20 / 25): ratio 1.15: 21 / 48 / 102 / 213; 1.25: 33 / 110 / 343 /
1,055; 1.3: 43 / 167 / 630 / 2,349.

Hero damage: today's constant is +0.5 base damage per level, added to the generator's 1 before every block. For a
multiplier build that is a multiplier of (1 + 0.5 L): level 10 = x6, level 20 = x11; for a Flat+ L1 build (base 2) it is
x3.5 and x6. Against the Percent x ceiling (x57 to x59,049) the hero is a small factor, and it is the only damage source that
does not depend on the block caps.

---

## F. Safety

Greps over `src/` for `|0`, `>>`, `<<`, `~~`, `Int32Array`, `Uint*Array`, `Float32Array`, `Math.imul`, `Math.trunc`.

**No bitwise or integer handling of damage or HP.** Every `|0`, `>>`, `Math.imul` hit is hashing, seeding or colour
maths: `frontier/world.ts:34-38` (square hash), `rng.ts:8-10`, `game/waves.ts:29`, `engine/sim.ts:14`, `ui/background.ts`,
`ui/blockArt.ts`, `ui/rockArt.ts`, `screens/WallScreen.ts:70-72`, `wall/generator.ts:55` (checkerboard parity),
`debug/cheatPanel.ts:67,113` (cheat inputs: `Math.floor(Number(...))`). HP and prices are rounded by `Math.round`
(`econ/economy.ts:44` `wholeRockHp`, `:61,63` prices, `wall/level.ts` `wholeHp`), which is exact to 2^53.

**Typed arrays that hold damage (the real limit, single precision):**
- `engine/pools.ts:14-15,50-51` `damage` and `pure` are `Float32Array`; written at `:81`, reduced at `engine/projectiles.ts:490` (Piercing cost),
  reset at `:493`, read at `:422` and `:841` (Fork). A damage above 3.4e38 becomes Infinity; above 16.7 million single
  precision cannot hold a whole number (the unit digit is lost), harmless for a 1e12 clamp.
- `game/fire.ts:75,144` `dqD` (Delay Line queue) `Float32Array` stores the damage of delayed shots.
- `engine/projectiles.ts:189,670,715` `cloudD` (Residue cloud damage) `Float32Array`.
- `Uint16Array modIndex` (`pools.ts:52`) indexes the modifier table (<= 65,535 entries), not damage; `Int32Array`/`Int16Array` in `fire.ts:62-92` are counters and ids.

**Where Infinity or NaN would come from (none reachable today, a clamp makes it impossible):**
- `game/fire.ts:139` and `:214`: `if (damage <= 0) continue` / `if (d <= 0 && op.t !== 'cap') return 0` are **false for NaN**, so a NaN packet fires. NaN needs
  `Infinity x 0` (Gambler's Gate else-branch with an infinite damage) or `Infinity - Infinity`.
- `engine/projectiles.ts:490-493`: Piercing does `damage[i] -= drop`; with Infinity (or NaN) the `<= 0` test never frees the shot: an immortal projectile.
- `engine/damage.ts:77-78` and `projectiles.ts:831` (`burn`), `game/world.ts:557` (Overkill Spill burst, `c.hp -= burst`): a NaN `hp` is never `<= 0`,
  so a target that took a NaN hit can never die (a wall that can never be cleared). `engine/sim.ts:72` is the test sim.
- All double arithmetic stays below 1e300 under the proposed caps (the ceiling shot is about 7e7, 1e10 with Flat+ L10 and hero 10), so Infinity needs more than the game allows; the
  hazard is NaN from a bad future block or cheat, and the `Float32` store at 3.4e38.

**Where the clamp belongs: one place, `game/fire.ts` right after the damage of a pulse is decided (lines 130-139).**
Static packets, gated packets and dynamic ones all pass there once, before the delay queue (`dqD`) and the pool
(`pools.ts:81`):

```ts
if (!(damage > 0)) continue;                         // also drops NaN
if (damage > MAX_HIT_DAMAGE) damage = MAX_HIT_DAMAGE; // constant in src/config.ts, 1e12
```

Everything downstream multiplies a clamped number by captain, Cleaver, Executioner, frost, Culling and Static factors that are
small (under about x100 together), so a clamped hit stays far below 3.4e38 and below 1e15. A second clamp in
`applyDamage` would protect the Boss (`engine/boss.ts:56`) and the clouds, but they derive from clamped hits too, so it is
optional.

**Clamp meets content.** The clamp is never reached by a player (the ceiling shot is 7e7, about 4e9 with ten Flat+ L10 and hero level 10), but Free Fly HP is: a basic Rock parent
is 2.95e8 at wave 50, 1.17e10 at wave 60, and a **Mother (x3) passes 1e12 at wave 70** (a basic Rock at wave 73). A clamp of 1e12 does not make those unkillable (a
Mother takes two shots at wave 70) but at wave 100 (8e16) it takes about 80,000 hits. Milestones stop at wave 50, so I
recommend keeping 1e12 as the owner said, and note that endless waves beyond 70 would need a larger value (Question 13).

---

## G. Summary and open questions

### Proposals in one page

1. **Upgrades:** only Flat+, Percent x, Lucky Strike, Jackpot, Gambler's Gate keep them (5). 20 blocks lose them by the owner's rule, 16 are ambiguous (13 no, 3 yes: Shield-Breaker, Armor-Piercer, Pure Converter). Single level: L1 for all first (no behaviour change); mid levels listed in A2 as a later decision.
2. **Copy caps from the engine:** about 25 blocks already gain nothing from a 2nd copy (the engine reads one level per modifier type): cap 1. Splitter 2 cap 2, Splitter 3 cap 1 (lanes = ejectors), Alternator and Random Router cap 1, Capacitor cap 1 (stacking breaks it), Overclock cap 3, Turns 8 each, Flat+ 10, Percent x 10, Lucky / Jackpot 6, Gambler 4.
3. **Percent x:** ladder x1.5 (L1) to x3 (L10), geometric in the level. Ten copies: x57.7 at L1, x1,256 at L5, x59,049 at L10.
4. **Chance boosters:** keep Lucky and Jackpot numbers (x1.33-1.43, x1.36-1.54 per copy), weaken Gambler's Gate to 40-50% (x1.2-1.5 per copy). Cheaper than Percent x per copy. All three at the caps: x72 (L1) to x572 (L3).
5. **Ceilings:** shot 115 (all L1), 2,511 (L5), 118,098 (L10), 6.8e7 with the chance blocks. Real hull limits: Dart 1, Twin 2, Prong 1 slot; Fan 51, Shuttle 31+. The walls need at most 736 per shot: the ceiling is x160 over at L10.
6. **Prices:** family B (growth 1.30 normal / 1.15 cheap, bases 30 / 100 / 500, upgrade growth stays 2.2); cap-1 blocks cost 2 x today's base.
7. **Hero levels:** base 1 Medal, ratio 1.2, no cap (level 10 = 25 Medals cumulative, level 20 = 185); keep +0.5 base damage a level.
8. **Safety:** one clamp (1e12) plus NaN guard at `game/fire.ts:139`, constant in `src/config.ts`.

### Open decisions for the owner (my recommendation first)

1. **Ambiguous upgrade flags.** Keep upgrades for Shield-Breaker, Armor-Piercer, Pure Converter (only way to grow a single copy); remove them from Alternator, Random Router, Delay Line, Overclock, Capacitor, Executioner, Boomerang, Orbit, Mine, Curving Right, Random Curve, Homing, Fork. Recommended: as listed.
2. **Level a no-upgrade block keeps.** L1 everywhere now (no change), then lift the A2 list to the middle level in a tuning chunk. Alternative: the A2 middle levels at once (changes current numbers).
3. **Overclock** is a hidden stacking multiplier (x1.3-1.6 per copy). Recommended: cap 3, no upgrades (or move it to the upgrade list and treat it as a booster).
4. **Percent x ladder shape:** geometric (x1.5 to x3) over L1 to L10, top level stays 10. Alternative: linear, or fewer levels.
5. **Percent x cap of 10:** keep 10; the real brake on small hulls is slots. The walls are one-shot by L5; consider whether a cap of 6 (L10 = x729) is closer to what the content needs.
6. **Chance boosters:** caps 6 / 6 / 4 and Gambler to 40-50%. Alternative: keep the engine as is and the caps lower (4 / 4 / 3).
7. **Flat+ cap:** 10 (the owner did not say; each copy +1 damage per level, so 10 copies at L10 add +100).
8. **Splitter caps** 2 and 1 (revisit when a hull with more ejectors exists).
9. **Turn caps** 8 each (a 51-multiplier Fan line needs 8 + 8).
10. **Price family:** B. Alternatives A (today) or C (steeper tail).
11. **Single-copy prices:** 2 x today's base. Alternative: keep today's base.
12. **Late economy:** reward growth makes prices trivial after tier ~50 (a tier-100 run pays 21k; the whole ladder is 201k). Recommended: do nothing now; if endgame credits feel worthless, add a second sink or steeper upgrade growth in a later chunk.
13. **Clamp value:** 1e12 as asked; if endless Free Fly beyond wave 70 should stay winnable, use 1e15 (no other effect).
14. **Capacitor** is DPS-neutral at best and breaks when stacked; it needs a redesign or a price that says "utility", not a damage block.
15. **Shield-Breaker** applies its x1.5 (x2.5 at L3) to every hit, shield or not (`engine/damage.ts`): effectively a cheap universal damage multiplier (220 credits). Decide whether that is intended before it becomes a capped single-copy block.

### Three most surprising findings

1. **Extra copies of almost every block do nothing.** The engine reads one level per modifier type, so ~25 blocks already gain exactly x1.00 from a 2nd copy; and stacking can even hurt (Capacitor chains stop firing at 4 copies, a 2nd Curving Right turns the shot into nothing). The caps the owner wants mostly describe what the engine already does.
2. **The damage ceiling is a hundred to a million times over the walls.** Ten Percent x at all L1 (x57.7) one-shots every wall block until tier ~25; at L10 (x59,049) it is x160 over the hardest block of tier 100; with the chance blocks about x1e5. Only Free Fly waves 30+ eat into it. (Real limits: small hulls hold 1 or 2 multipliers: Dart 6, Twin 18, Prong 6 per shot at L10.)
3. **Splitters are limited by ejectors, and damage lives in Float32.** A second Splitter 3 adds nothing (3 lanes on a Fan, 2 on a Prong, 1 on Dart, Twin, Shuttle), and projectile damage is stored in a `Float32Array` where NaN passes every `<= 0` guard (a NaN hit makes a target immortal), while a Mother's HP passes 1e12 at Free Fly wave 70, the clamp value.

### Not verified

- Chance blocks (Lucky, Jackpot, Gambler): bench per-copy values scatter between x0.75 and x3.4 (random rolls, one seed); the ceilings use their exact averages, not the bench.
- The bench has no armor or shields: Armor-Piercer, Pure Converter, Corrosion and the armor part of Shield-Breaker read x1.00; walls (armor from tier 11, shields from tier 21) were not benched. Piercing's line-through value on a wall was not measured (single bodies only).
- Blocks that stop splitting (Cauterize x4.66 and Overkill Spill x3.08 in the split scenario) partly measure the bench counting a dead parent as a cleared family; read them as "strong against splitters", not as x4.66.
- Orbit, Curving Right and Mine read x0.00-0.84 in some scenarios because the shots miss the hovering targets; that is how they behave on this bench, not proof they are useless in play.
- Alternator or Random Router copies in series were not benched (only one copy each); the caps of 1 are a design choice.
- The Shuttle's 31 multipliers is a lower bound from a randomised search (the Fan's 51 is a hand-built snake, compiled and verified; the true maximum may be higher). The Prong's slot count is by hand.
- Income per run is the Free Fly bot and a "half the wall once" assumption for the campaign, not a human; the Frontier Medal counts assume every Medal square is cleared and the Free Fly milestone timing in E1 is an assumption.
- Hero level reachability counts every Medal going to the hero; captain spending was not subtracted from the table.
- The upgrade value at 10 copies (x2.16 a level) is arithmetic, not benched.
- No game code changed, so there is no new gameplay logic to mutation-test; the audit script itself has no unit test. Typecheck and the unit tests were run (see the PR). No e2e script was run (docs and scripts only).
