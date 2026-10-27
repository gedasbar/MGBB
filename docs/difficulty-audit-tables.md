## A. Progress model: what a buyer owns

Career tier e: the campaign tier itself; a Frontier ring r is e = 25 + 0.3 r; a Free Fly wave w is the e whose Frontier Free Fly square has wave equivalent w (e = 25 + 4 (w - 6)). Credits banked on arriving at e = 3 runs x 50% of the full-clear credits of every tier before it (campaign up to 100, Frontier walls of the matching ring beyond), nothing wasted, Free Fly income not counted. Two buyers with the same credits: the **casual** buyer owns the best "sensible build" (hull + k damage blocks, Flat+ and Percent x alternating, one level; src/debug/hullBuilds.ts, the build every 17a bot used); the **builder** owns the best of that family and of the multiplier family (1-3 Flat+ next to the generator, every other block a Percent x, the Percent x line a player who understands the game builds). Prices are the real ones (hull + copies + upgrades). Hero level = all Medals (campaign first clears + Free Fly milestone Medals + Frontier Medals) spent on hero levels, +0.5 base damage each.

| point | career tier | credits banked | Medals | hero lvl | casual build | DPS | DPS + hero | builder build | DPS | DPS + hero |
|---|---|---|---|---|---|---|---|---|---|---|
| tier 1 | 1.0 | 0.0 | 0 | 0 | Dart, 1 dmg blocks L1 | 4.0 | 4.0 | Dart, 1 dmg blocks L1 | 4.0 | 4.0 |
| tier 5 | 5.0 | 230 | 4 | 3 | Twin, 2 dmg blocks L1 | 7.5 | 13 | Twin, 2 dmg blocks L1 | 7.5 | 13 |
| tier 10 | 10 | 735 | 10 | 6 | Twin, 2 dmg blocks L2 | 12 | 24 | Twin, 2 dmg blocks L2 | 12 | 24 |
| tier 15 | 15 | 1.57K | 16 | 8 | Wisp, 5 dmg blocks L2 | 39 | 71 | Wisp, 2 Flat+ L2 + 3 Percent x L2 | 64 | 124 |
| tier 20 | 20 | 2.92K | 21 | 9 | Lancet, 5 dmg blocks L2 | 66 | 125 | Wisp, 2 Flat+ L3 + 3 Percent x L3 | 113 | 258 |
| tier 25 | 25 | 4.95K | 27 | 10 | Lancet, 5 dmg blocks L4 | 147 | 236 | Lancet, 1 Flat+ L4 + 4 Percent x L4 | 319 | 638 |
| tier 30 | 30 | 7.95K | 37 | 11 | Mantis, 8 dmg blocks L4 | 451 | 731 | Mantis, 2 Flat+ L4 + 6 Percent x L4 | 1.64K | 3.27K |
| tier 40 | 40 | 18.6K | 56 | 13 | Mantis, 8 dmg blocks L6 | 1.09K | 1.7K | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 4.05K | 10.6K |
| tier 50 | 50 | 40K | 76 | 15 | Halberd, 10 dmg blocks L6 | 1.96K | 3.27K | Mantis, 1 Flat+ L7 + 7 Percent x L7 | 13.9K | 27.5K |
| tier 60 | 60 | 81.4K | 95 | 16 | Halberd, 10 dmg blocks L8 | 4.26K | 6.77K | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 35.7K | 67.5K |
| tier 75 | 75 | 220K | 122 | 17 | Halberd, 10 dmg blocks L9 | 6.17K | 9.76K | Shuttle, 1 Flat+ L8 + 8 Percent x L8 | 86.1K | 221K |
| tier 100 | 100 | 1.04M | 168 | 19 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.4K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 833K |
| ring 10 | 28 | 6.63K | 33 | 11 | Mantis, 8 dmg blocks L3 | 272 | 478 | Mantis, 2 Flat+ L3 + 6 Percent x L3 | 804 | 1.51K |
| ring 25 | 33 | 10.4K | 42 | 12 | Mantis, 8 dmg blocks L4 | 451 | 757 | Mantis, 1 Flat+ L3 + 7 Percent x L5 | 2.36K | 5.91K |
| ring 50 | 40 | 18.6K | 56 | 13 | Mantis, 8 dmg blocks L6 | 1.09K | 1.7K | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 4.05K | 10.6K |
| ring 100 | 55 | 57.3K | 86 | 16 | Halberd, 10 dmg blocks L7 | 2.91K | 4.78K | Halberd, 1 Flat+ L7 + 9 Percent x L7 | 19.2K | 47.6K |
| ring 200 | 85 | 415K | 141 | 18 | Halberd, 10 dmg blocks L10 | 8.88K | 14K | Shuttle, 1 Flat+ L9 + 8 Percent x L9 | 177K | 426K |
| ring 400 | 145 | 14.2M | 207 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 5 | 21 | 3.26K | 23 | 9 | Lancet, 5 dmg blocks L3 | 102 | 171 | Lancet, 2 Flat+ L3 + 3 Percent x L3 | 188 | 308 |
| FF wave 10 | 41 | 20.2K | 58 | 14 | Halberd, 10 dmg blocks L5 | 1.3K | 2.21K | Mantis, 1 Flat+ L6 + 7 Percent x L6 | 7.09K | 14.2K |
| FF wave 15 | 61 | 87.1K | 97 | 16 | Halberd, 10 dmg blocks L8 | 4.26K | 6.77K | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 35.7K | 67.5K |
| FF wave 20 | 81 | 323K | 133 | 18 | Halberd, 10 dmg blocks L9 | 6.17K | 9.97K | Shuttle, 1 Flat+ L9 + 8 Percent x L9 | 177K | 426K |
| FF wave 25 | 101 | 1.1M | 170 | 19 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.4K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 833K |
| FF wave 30 | 121 | 3.79M | 187 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 35 | 141 | 11.4M | 203 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 40 | 161 | 33.6M | 220 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 45 | 181 | 92.7M | 237 | 21 | Leviathan, 12 dmg blocks L10 | 17.8K | 29.5K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 861K |
| FF wave 50 | 201 | 254M | 253 | 21 | Leviathan, 12 dmg blocks L10 | 17.8K | 29.5K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 861K |

Model ceilings (hero 0): casual Leviathan, 12 dmg blocks L10 = 17.8K DPS for 654K credits; builder Leviathan, 2 Flat+ L10 + 10 Percent x L10 = 574K DPS for 657K. More credits buy nothing in this model: it only knows Flat+ and Percent x lines (see Not verified), so the real ceiling with all 41 blocks is higher.

## B. Needed vs owned

Pass = DPS to carve the cheapest column while the wall crosses at max boost (x4, ship at the top; flying low needs a quarter of it). Clear = DPS to destroy every block before the wall reaches a ship at the bottom. Toughest = effective HP (shield + HP x armor weight) of the toughest single block. Free Fly rows: both columns are the keep-up DPS (all HP of the wave, splits included, over one 40 s wave; every body assumed to split like a rock; the toughest column is raw HP of the first body). Ratio = owned DPS / needed, T = trivial (above 5x), X = impossible (below 0.5x).

| point | pass DPS | pass (7-tier median) | clear DPS | toughest block | clear / pass |
|---|---|---|---|---|---|
| tier 1 | 0.8 | 1.4 | 3.1 | 2.0 | 4 |
| tier 5 | 1.0 | 1.6 | 6.9 | 3.0 | 7 |
| tier 10 | 3.7 | 3.7 | 24 | 6.0 | 6 |
| tier 15 | 1.1 | 5.3 | 60 | 22 | 52 |
| tier 20 | 27 | 9.6 | 137 | 40 | 5 |
| tier 25 | 6.9 | 6.9 | 323 | 95 | 47 |
| tier 30 | 44 | 24 | 699 | 138 | 16 |
| tier 40 | 109 | 109 | 2.49K | 460 | 23 |
| tier 50 | 42 | 43 | 3.04K | 368 | 73 |
| tier 60 | 86 | 105 | 4.75K | 552 | 55 |
| tier 75 | 74 | 106 | 6.49K | 736 | 87 |
| tier 100 | 342 | 235 | 11K | 736 | 32 |
| ring 10 | 35 | 35 | 514 | 96 | 15 |
| ring 25 | 51 | 51 | 470 | 111 | 9 |
| ring 50 | 72 | 72 | 1.43K | 245 | 20 |
| ring 100 | 93 | 93 | 3.07K | 392 | 33 |
| ring 200 | 1.09K | 1.09K | 40.9K | 2.87K | 37 |
| ring 400 | 14.3K | 14.3K | 1.24M | 57.2K | 87 |
| FF wave 5 | 13 | 13 | 13 | 7.0 | - |
| FF wave 10 | 187 | 187 | 187 | 404 | - |
| FF wave 15 | 1.46K | 1.46K | 1.46K | 288 | - |
| FF wave 20 | 14K | 14K | 14K | 15.1K | - |
| FF wave 25 | 87.2K | 87.2K | 87.2K | 11.4K | - |
| FF wave 30 | 833K | 833K | 833K | 598K | - |
| FF wave 35 | 4.7M | 4.7M | 4.7M | 427K | - |
| FF wave 40 | 46.6M | 46.6M | 46.6M | 23.7M | - |
| FF wave 45 | 242M | 242M | 242M | 16.9M | - |
| FF wave 50 | 2.16B | 2.16B | 2.16B | 886M | - |

Owned / needed. "no hero" and "hero" = without and with the hero level of that point.

| point | casual pass | casual pass +hero | builder pass | builder pass +hero | casual clear | casual clear +hero | builder clear | builder clear +hero |
|---|---|---|---|---|---|---|---|---|
| tier 1 | 4.78 | 4.78 | 4.78 | 4.78 | 1.31 | 1.31 | 1.31 | 1.31 |
| tier 5 | 7.36 T | 12.9 T | 7.36 T | 12.9 T | 1.08 | 1.89 | 1.08 | 1.89 |
| tier 10 | 3.31 | 6.62 T | 3.31 | 6.62 T | 0.51 | 1.03 | 0.51 | 1.03 |
| tier 15 | 34.3 T | 61.7 T | 55.5 T | 108 T | 0.66 | 1.18 | 1.06 | 2.07 |
| tier 20 | 2.46 | 4.67 | 4.22 | 9.69 T | 0.48 X | 0.91 | 0.82 | 1.89 |
| tier 25 | 21.3 T | 34.2 T | 46.1 T | 92.2 T | 0.45 X | 0.73 | 0.99 | 1.97 |
| tier 30 | 10.3 T | 16.8 T | 37.6 T | 75.0 T | 0.64 | 1.05 | 2.35 | 4.68 |
| tier 40 | 9.96 T | 15.6 T | 37.1 T | 97.3 T | 0.44 X | 0.68 | 1.63 | 4.27 |
| tier 50 | 47.0 T | 78.3 T | 333 T | 660 T | 0.65 | 1.08 | 4.57 | 9.07 T |
| tier 60 | 49.7 T | 78.9 T | 416 T | 786 T | 0.90 | 1.43 | 7.52 T | 14.2 T |
| tier 75 | 83.1 T | 131 T | 1158 T | 2979 T | 0.95 | 1.50 | 13.3 T | 34.1 T |
| tier 100 | 51.9 T | 82.8 T | 1676 T | 2435 T | 1.61 | 2.57 | 52.1 T | 75.7 T |
| ring 10 | 7.82 T | 13.7 T | 23.1 T | 43.3 T | 0.53 | 0.93 | 1.56 | 2.93 |
| ring 25 | 8.89 T | 14.9 T | 46.6 T | 116 T | 0.96 | 1.61 | 5.03 T | 12.6 T |
| ring 50 | 15.2 T | 23.8 T | 56.6 T | 149 T | 0.76 | 1.19 | 2.83 | 7.44 T |
| ring 100 | 31.3 T | 51.4 T | 206 T | 512 T | 0.95 | 1.56 | 6.24 T | 15.5 T |
| ring 200 | 8.12 T | 12.8 T | 162 T | 390 T | 0.22 X | 0.34 X | 4.34 | 10.4 T |
| ring 400 | 1.24 | 2.02 | 40.0 T | 59.1 T | 0.01 X | 0.02 X | 0.46 X | 0.68 |
| FF wave 5 | 7.95 T | 13.3 T | 14.5 T | 23.9 T | 7.95 T | 13.3 T | 14.5 T | 23.9 T |
| FF wave 10 | 6.92 T | 11.8 T | 37.8 T | 75.6 T | 6.92 T | 11.8 T | 37.8 T | 75.6 T |
| FF wave 15 | 2.93 | 4.65 | 24.5 T | 46.3 T | 2.93 | 4.65 | 24.5 T | 46.3 T |
| FF wave 20 | 0.44 X | 0.71 | 12.6 T | 30.4 T | 0.44 X | 0.71 | 12.6 T | 30.4 T |
| FF wave 25 | 0.20 X | 0.33 X | 6.58 T | 9.55 T | 0.20 X | 0.33 X | 6.58 T | 9.55 T |
| FF wave 30 | 0.02 X | 0.03 X | 0.69 | 1.02 | 0.02 X | 0.03 X | 0.69 | 1.02 |
| FF wave 35 | 0.00 X | 0.01 X | 0.12 X | 0.18 X | 0.00 X | 0.01 X | 0.12 X | 0.18 X |
| FF wave 40 | 0.00 X | 0.00 X | 0.01 X | 0.02 X | 0.00 X | 0.00 X | 0.01 X | 0.02 X |
| FF wave 45 | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X |
| FF wave 50 | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X | 0.00 X |

Sensitivity of the credit model: the clear ratio with the hero level (casual / builder) when the budget is x0.5 (a buyer who wastes half on hulls they leave behind), x1, and x4 (a grinder who replays walls).

| point | x0.5 | x1 | x4 |
|---|---|---|---|
| tier 1 | 1.31 / 1.31 | 1.31 / 1.31 | 1.31 / 1.31 |
| tier 5 | 1.26 / 1.26 | 1.89 / 1.89 | 2.71 / 2.92 |
| tier 10 | 0.79 / 0.79 | 1.03 / 1.03 | 4.43 / 8.73 T |
| tier 15 | 0.47 X / 0.47 X | 1.18 / 2.07 | 7.03 T / 21.0 T |
| tier 20 | 0.55 / 0.72 | 0.91 / 1.89 | 7.49 T / 45.4 T |
| tier 25 | 0.41 X / 0.78 | 0.73 / 1.97 | 6.02 T / 37.6 T |
| tier 30 | 0.27 X / 0.68 | 1.05 / 4.68 | 4.17 / 25.9 T |
| tier 40 | 0.31 X / 1.59 | 0.68 / 4.27 | 1.78 / 18.5 T |
| tier 50 | 0.75 / 4.84 | 1.08 / 9.07 T | 3.07 / 36.2 T |
| tier 60 | 0.71 / 6.05 T | 1.43 / 14.2 T | 2.01 / 82.9 T |
| tier 75 | 1.07 / 12.7 T | 1.50 / 34.1 T | 4.20 / 124 T |
| tier 100 | 1.73 / 61.1 T | 2.57 / 75.7 T | 2.57 / 75.7 T |
| ring 10 | 0.36 X / 0.71 | 0.93 / 2.93 | 5.68 T / 32.1 T |
| ring 25 | 0.67 / 1.49 | 1.61 / 12.6 T | 6.40 T / 51.7 T |
| ring 50 | 0.55 / 2.77 | 1.19 / 7.44 T | 3.10 / 32.3 T |
| ring 100 | 1.09 / 7.07 T | 1.56 / 15.5 T | 3.11 / 69.2 T |
| ring 200 | 0.24 X / 5.64 T | 0.34 X / 10.4 T | 0.68 / 20.1 T |
| ring 400 | 0.02 X / 0.68 | 0.02 X / 0.68 | 0.02 X / 0.68 |
| FF wave 5 | 5.80 T / 10.4 T | 13.3 T / 23.9 T | 79.4 T / 481 T |
| FF wave 10 | 4.31 / 34.6 T | 11.8 T / 75.6 T | 34.4 T / 254 T |
| FF wave 15 | 3.28 / 19.7 T | 4.65 / 46.3 T | 9.21 T / 270 T |
| FF wave 20 | 0.71 / 8.90 T | 0.71 / 30.4 T | 1.98 / 58.3 T |
| FF wave 25 | 0.22 X / 7.71 T | 0.33 X / 9.55 T | 0.33 X / 9.55 T |
| FF wave 30 | 0.03 X / 1.02 | 0.03 X / 1.02 | 0.03 X / 1.02 |
| FF wave 35 | 0.01 X / 0.18 X | 0.01 X / 0.18 X | 0.01 X / 0.18 X |
| FF wave 40 | 0.00 X / 0.02 X | 0.00 X / 0.02 X | 0.00 X / 0.02 X |
| FF wave 45 | 0.00 X / 0.00 X | 0.00 X / 0.00 X | 0.00 X / 0.00 X |
| FF wave 50 | 0.00 X / 0.00 X | 0.00 X / 0.00 X | 0.00 X / 0.00 X |

## C. How far a build gets (bots)

Bots: the carve bot and the clear-all bot of src/wall/sim.ts, the Free Fly bot of src/debug/freeflyBot.ts (2 seeds, cap 2400 s). Highest tier passed: pass = the carve bot passes or the clear-all bot passes or clears; found by galloping and bisecting, then every spike and milestone tier up to it is checked, so it is the highest tier of the strict order up to rare template luck (a bot is not a human). Frontier rings: a ring counts when more than half of its (up to 3) wall squares on the axes are won, tested on the ring ladder 5, 10, 25, 50, 75, 100, 150 ... 2000. "sensible" = src/debug/hullBuilds.ts as 17a uses it; "price point" = the best Flat+ / Percent x build the hull's price x 2 buys (half hull, half blocks). Dart = the starter: one Flat+ and nothing else.

| hull | build | dmg blocks | credits | est. DPS | tier passed | first tier not passed | tier cleared | ring passed | ring cleared | FF waves | FF end |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dart | sensible | 1 Flat+ L1 | 0.0 | 4.0 | 19 | 20 Bands | 2 | 0 | 0 | 5/5 | died |
| Twin | sensible | 2 dmg blocks L1 | 170 | 7.5 | 29 | 30 Diamond | 5 | 10 | 0 | 7/7 | died |
| Twin | tuned | 1 dmg blocks L1 | 70 | 5.0 | 22 | 23 Slab | 2 | 0 | 0 | 5/5 | died |
| Prong | sensible | 1 dmg blocks L2 | 1.17K | 16 | 34 | 35 Arrow | 7 | 75 | 0 | 8/8 | died |
| Wisp | sensible | 4 dmg blocks L2 | 1.32K | 33 | 53 | 54 Slab | 12 | 100 | 0 | 9/9 | died |
| Wisp | tuned | 2 Flat+ L2 + 2 Percent x L2 | 1.32K | 39 | 53 | 54 Slab | 12 | 100 | 0 | 10/9 | died |
| Hornet | sensible | 5 dmg blocks L3 | 3.21K | 44 | 53 | 54 Slab | 12 | 100 | 0 | 10/10 | died |
| Hornet | tuned | 3 Flat+ L1 + 2 Percent x L1 | 2.19K | 23 | 34 | 35 Arrow | 7 | 75 | 0 | 8/9 | died |
| Lancet | sensible | 5 dmg blocks L3 | 3.11K | 102 | 53 | 54 Slab | 15 | 100 | 0 | 11/12 | died |
| Lancet | tuned | 2 Flat+ L3 + 3 Percent x L3 | 3.19K | 188 | 100 | none | 24 | 100 | 0 | 13/13 | died |
| Kestrel | sensible | 7 dmg blocks L4 | 6.53K | 63 | 53 | 54 Slab | 13 | 100 | 0 | 11/11 | died |
| Kestrel | tuned | 3 Flat+ L3 + 4 Percent x L3 | 5.1K | 56 | 53 | 54 Slab | 13 | 100 | 0 | 11/11 | died |
| Mantis | sensible | 8 dmg blocks L4 | 7.35K | 451 | 100 | none | 29 | 150 | 5 | 14/14 | died |
| Mantis | tuned | 1 Flat+ L3 + 7 Percent x L4 | 7.65K | 1.38K | 100 | none | 31 | 300 | 5 | 17/17 | died |
| Bastion | sensible | 5 dmg blocks L5 | 13.4K | 40 | 53 | 54 Slab | 12 | 100 | 0 | 9/9 | died |
| Bastion | tuned | 3 Flat+ L4 + 2 Percent x L4 | 9.95K | 48 | 53 | 54 Slab | 13 | 100 | 0 | 10/11 | died |
| Halberd | sensible | 10 dmg blocks L5 | 19K | 1.3K | 100 | none | 39 | 300 | 100 | 17/17 | died |
| Halberd | tuned | 1 Flat+ L5 + 9 Percent x L5 | 20.9K | 5.26K | 100 | none | 99 | 350 | 100 | 21/21 | died |
| Corvette | sensible | 6 dmg blocks L6 | 33.7K | 309 | 100 | none | 29 | 150 | 10 | 14/14 | died |
| Corvette | tuned | 1 Flat+ L6 + 5 Percent x L6 | 34.1K | 491 | 100 | none | 31 | 250 | 25 | 15/15 | died |
| Trident | sensible | 12 dmg blocks L6 | 49K | 425 | 100 | none | 31 | 150 | 10 | 15/14 | died |
| Trident | tuned | 20 dmg blocks L6 | 52.9K | 1.11K | 100 | none | 39 | 300 | 75 | 17/17 | died |
| Galleon | sensible | 11 dmg blocks L7 | 90.2K | 348 | 100 | none | 27 | 150 | 5 | 13/14 | died |
| Galleon | tuned | 1 Flat+ L7 + 10 Percent x L7 | 93K | 946 | 100 | none | 39 | 250 | 50 | 15/17 | died |
| Shuttle | sensible | 9 dmg blocks L7 | 127K | 2.08K | 100 | none | 53 | 300 | 100 | 18/18 | died |
| Shuttle | tuned | 1 Flat+ L8 + 8 Percent x L8 | 165K | 86.1K | 100 | none | 53 | 500 | 100 | 26/27 | died |
| Spire | sensible | 11 dmg blocks L8 | 259K | 513 | 100 | none | 31 | 250 | 25 | 15/14 | died |
| Spire | tuned | 1 Flat+ L9 + 10 Percent x L9 | 341K | 1.03K | 100 | none | 39 | 300 | 50 | 16/17 | died |
| Leviathan | sensible | 12 dmg blocks L8 | 399K | 7.58K | 100 | none | 53 | 350 | 100 | 21/21 | died |
| Leviathan | tuned | 2 Flat+ L10 + 10 Percent x L10 | 657K | 574K | 100 | none | 100 | 700 | 250 | 31/32 | died |
| Fan | sensible | 17 dmg blocks L9 | 650K | 2.91K | 100 | none | 63 | 350 | 100 | 19/18 | died |
| Fan | tuned | 3 Flat+ L10 + 10 Percent x L10 | 827K | 5.94K | 100 | none | 99 | 350 | 100 | 21/21 | died |
| Citadel | sensible | 18 dmg blocks L9 | 971K | 2.78K | 100 | none | 63 | 350 | 100 | 19/18 | died |
| Citadel | tuned | 3 Flat+ L10 + 10 Percent x L10 | 1.15M | 4.46K | 100 | none | 78 | 350 | 100 | 20/20 | died |
| Zenith | sensible | 19 dmg blocks L10 | 1.63M | 5.12K | 100 | none | 100 | 350 | 100 | 21/21 | died |
| Zenith | tuned | 20 dmg blocks L10 | 1.63M | 10.6K | 100 | none | 100 | 400 | 150 | 22/22 | died |

Career-matched: the build each buyer of section A owns at a position (casual = the sensible family, builder = the multiplier family; both with the hero level as base damage), flown on the walls as they are. This is the check of the model: does a player at tier t clear tier t?

| position | buyer | hero lvl | build the model gives | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|---|---|
| tier 10 | casual | 6 | Twin, 2 dmg blocks L2 | 24 | 34 | 9 | 75 | 0 |
| tier 10 | builder | 6 | Twin, 2 dmg blocks L2 | 24 | 34 | 9 | 75 | 0 |
| tier 20 | casual | 9 | Lancet, 5 dmg blocks L2 | 125 | 100 | 21 | 100 | 0 |
| tier 20 | builder | 9 | Lancet, 1 Flat+ L2 + 4 Percent x L2 | 258 | 100 | 27 | 150 | 5 |
| tier 30 | casual | 11 | Mantis, 8 dmg blocks L4 | 731 | 100 | 31 | 250 | 5 |
| tier 30 | builder | 11 | Mantis, 1 Flat+ L3 + 7 Percent x L4 | 3.27K | 100 | 31 | 350 | 5 |
| tier 40 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 | 31 | 300 | 5 |
| tier 40 | builder | 13 | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 10.6K | 100 | 31 | 400 | 5 |
| tier 50 | casual | 15 | Halberd, 10 dmg blocks L6 | 3.27K | 100 | 53 | 350 | 100 |
| tier 50 | builder | 15 | Halberd, 1 Flat+ L3 + 9 Percent x L7 | 27.5K | 100 | 100 | 500 | 250 |
| tier 60 | casual | 16 | Halberd, 10 dmg blocks L8 | 6.77K | 100 | 100 | 150 | 100 |
| tier 60 | builder | 16 | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 67.5K | 100 | 100 | 500 | 250 |
| tier 75 | casual | 17 | Halberd, 10 dmg blocks L9 | 9.76K | 100 | 100 | 350 | 150 |
| tier 75 | builder | 17 | Shuttle, 1 Flat+ L3 + 8 Percent x L9 | 221K | 100 | 53 | 600 | 100 |
| tier 100 | casual | 19 | Leviathan, 12 dmg blocks L10 | 28.4K | 100 | 100 | 500 | 150 |
| tier 100 | builder | 19 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 833K | 100 | 100 | 700 | 250 |
| ring 50 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 | 31 | 300 | 5 |
| ring 50 | builder | 13 | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 10.6K | 100 | 31 | 400 | 5 |
| ring 100 | casual | 16 | Halberd, 10 dmg blocks L7 | 4.78K | 100 | 82 | 350 | 100 |
| ring 100 | builder | 16 | Halberd, 1 Flat+ L3 + 9 Percent x L8 | 47.6K | 100 | 100 | 500 | 250 |
| ring 200 | casual | 18 | Halberd, 10 dmg blocks L10 | 14K | 100 | 100 | 400 | 150 |
| ring 200 | builder | 18 | Shuttle, 1 Flat+ L3 + 8 Percent x L10 | 426K | 100 | 53 | 600 | 100 |
| ring 400 | casual | 20 | Leviathan, 12 dmg blocks L10 | 28.9K | 100 | 100 | 500 | 150 |
| ring 400 | builder | 20 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 847K | 100 | 100 | 700 | 250 |

## D. Levers other than HP (a slab wall at the campaign tier, each lever changed alone; the cell is needed pass DPS / clear DPS as a multiple of the unchanged wall)

| lever | tier 10 | tier 20 | tier 30 | tier 40 | tier 60 | tier 80 | tier 100 |
|---|---|---|---|---|---|---|---|
| no armor | 1.00 / 1.00 | 1.00 / 0.92 | 1.00 / 0.89 | 0.82 / 0.87 | 1.00 / 0.72 | 1.00 / 0.67 | 1.00 / 0.64 |
| armor share x2 | 1.00 / 1.00 | 1.00 / 1.08 | 1.00 / 1.10 | 1.12 / 1.13 | 1.00 / 1.28 | 1.00 / 1.28 | 1.00 / 1.18 |
| no shields | 1.00 / 1.00 | 1.00 / 1.00 | 0.96 / 0.96 | 1.00 / 0.95 | 1.00 / 0.87 | 1.00 / 0.84 | 1.00 / 0.82 |
| shield share x2 | 1.00 / 1.00 | 1.00 / 1.00 | 1.04 / 1.04 | 1.00 / 1.05 | 1.00 / 1.13 | 1.00 / 1.15 | 1.00 / 1.09 |
| wall speed x0.7 | 0.70 / 0.70 | 0.70 / 0.70 | 0.70 / 0.70 | 0.70 / 0.70 | 0.70 / 0.70 | 0.70 / 0.70 | 0.70 / 0.70 |
| wall speed x1.4 | 1.40 / 1.40 | 1.40 / 1.40 | 1.40 / 1.40 | 1.40 / 1.40 | 1.40 / 1.40 | 1.40 / 1.40 | 1.40 / 1.40 |
| rows x0.5 | 1.16 / 0.55 | 0.71 / 0.53 | 0.74 / 0.52 | 0.95 / 0.52 | 0.99 / 0.49 | 0.95 / 0.50 | 0.83 / 0.51 |
| rows x2 | 1.72 / 2.04 | 1.12 / 2.03 | 1.12 / 2.02 | 1.18 / 2.02 | 1.16 / 2.01 | 1.18 / 2.01 | 1.00 / 2.01 |
| spike (HP x1.6) | 1.67 / 1.67 | 1.60 / 1.60 | 1.59 / 1.59 | 1.60 / 1.60 | 1.60 / 1.60 | 1.60 / 1.60 | 1.60 / 1.60 |
| HP x2 | 2.00 / 2.00 | 2.00 / 2.00 | 2.00 / 2.00 | 2.00 / 2.00 | 2.00 / 2.00 | 2.00 / 2.00 | 2.00 / 2.00 |

Wall width (21 columns): needed clear DPS is proportional to the columns, needed pass DPS does not depend on it (one lane); a 31-column wall would need 1.48x the clear DPS and the same pass DPS.

The lane: pass needs the cheapest column. How much dearer the median column is, what passing costs at the base wall speed (flying low, no boost) and the structural gap between clearing and passing:

| tier | pass DPS (cheapest column, boost x4) | pass if lane = median column | median / cheapest | pass at base speed (no boost) | clear / pass |
|---|---|---|---|---|---|
| 1 | 0.8 | 1.7 | 2.00 | 0.2 | 4 |
| 5 | 1.0 | 2.5 | 2.50 | 0.3 | 7 |
| 10 | 3.7 | 8.6 | 2.33 | 0.9 | 6 |
| 20 | 27 | 32 | 1.20 | 6.7 | 5 |
| 30 | 44 | 65 | 1.50 | 11 | 16 |
| 40 | 109 | 328 | 3.00 | 27 | 23 |
| 60 | 86 | 289 | 3.36 | 21 | 55 |
| 80 | 358 | 402 | 1.12 | 90 | 20 |
| 100 | 342 | 635 | 1.85 | 86 | 32 |

How much armor and shields already inflate a wall (total effective HP / sum of raw HP) and the base wall speed:

| tier | armored share | shielded share | effective HP / raw HP | rows | wall speed px/s | seconds to clear (screen height / speed) | toughest block eff. HP / raw HP |
|---|---|---|---|---|---|---|---|
| 10 | 0.00 | 0.00 | 1.00 | 8 | 26 | 29 | 1.00 |
| 20 | 0.09 | 0.00 | 1.08 | 13 | 26 | 29 | 2.00 |
| 30 | 0.12 | 0.09 | 1.17 | 29 | 26 | 29 | 2.00 |
| 40 | 0.16 | 0.13 | 1.23 | 31 | 26 | 29 | 2.50 |
| 60 | 0.24 | 0.22 | 1.71 | 44 | 26 | 29 | 3.00 |
| 80 | 0.32 | 0.31 | 1.95 | 47 | 26 | 29 | 4.00 |
| 100 | 0.40 | 0.40 | 2.50 | 41 | 26 | 29 | 4.00 |

## E. Proposed curves and the ratio tables with them

Proposed numbers (nothing is wired into the game; the needs of section B are scaled by proposed HP / today's HP):

- Campaign block HP: as today (x1.13 a tier) up to tier 30; then x1.06 a tier to tier 40, x1.065 a tier to tier 60, x1.0525 a tier to tier 100 (today: flat from tier 38).
- Frontier block HP: the campaign curve at the ring's effective tier (25 + 0.3 x ring) up to ring 250 (tier 100), then x1.001 a ring (today x1.015 a ring from ring 0).
- Free Fly body HP: as today to wave 20; then total growth per wave x1.19 (to wave 30), x1.08 (to wave 40), x1.06 (to wave 50) (today about x1.44 a wave: wave multiplier 1.25 times the tier step 1.055 every 15 s).

Curves (HP of one block; rows, armor and shield shares, speed and spike tiers unchanged):

| tier | today HP | proposed HP | factor |
|---|---|---|---|
| 1 | 2 | 2 | 1.00 |
| 5 | 3 | 3 | 1.00 |
| 10 | 6 | 6 | 1.00 |
| 20 | 20 | 20 | 1.00 |
| 30 | 69 | 69 | 1.00 |
| 38 | 184 | 110 | 0.60 |
| 40 | 184 | 124 | 0.67 |
| 50 | 184 | 233 | 1.27 |
| 60 | 184 | 437 | 2.38 |
| 75 | 184 | 941 | 5.11 |
| 100 | 184 | 3.38K | 18.39 |

| ring (effective tier) | today HP | proposed HP | factor |
|---|---|---|---|
| 10 (28) | 44 | 54 | 1.22 |
| 25 (33) | 55 | 82 | 1.49 |
| 50 (40) | 80 | 124 | 1.55 |
| 100 (55) | 168 | 319 | 1.89 |
| 150 (70) | 355 | 729 | 2.06 |
| 200 (85) | 746 | 1.57K | 2.10 |
| 250 (100) | 1.57K | 3.38K | 2.15 |
| 300 (115) | 3.31K | 3.56K | 1.08 |
| 400 (145) | 14.7K | 3.93K | 0.27 |

| wave | today body HP | proposed body HP | factor | today growth that wave | proposed growth |
|---|---|---|---|---|---|
| 5 | 21 | 21 | 1.000 | 1.39 | 1.39 |
| 10 | 135 | 135 | 1.000 | 1.47 | 1.47 |
| 15 | 824 | 824 | 1.000 | 1.47 | 1.47 |
| 20 | 5.04K | 5.04K | 1.000 | 1.39 | 1.39 |
| 25 | 32.6K | 12K | 0.370 | 1.47 | 1.19 |
| 30 | 199K | 28.7K | 0.144 | 1.47 | 1.19 |
| 35 | 1.22M | 42.2K | 0.035 | 1.39 | 1.08 |
| 40 | 7.88M | 62K | 0.008 | 1.47 | 1.08 |
| 45 | 48.3M | 83K | 0.002 | 1.47 | 1.06 |
| 50 | 295M | 111K | 0.000 | 1.39 | 1.06 |

Owned / needed with the proposed curves (hero levels included, casual and builder as in section B). "ref" = reference DPS / proposed clear need, target 0.7 to 1.5: the reference is the casual build up to tier 40, the builder build from tier 100, a geometric blend between.

| point | proposed pass DPS | proposed clear DPS | toughest block | casual pass | builder pass | casual clear | builder clear | ref clear |
|---|---|---|---|---|---|---|---|---|
| tier 1 | 0.8 | 3.1 | 2.0 | 4.78 | 4.78 | 1.31 | 1.31 | 1.31 |
| tier 5 | 1.0 | 6.9 | 3.0 | 12.9 T | 12.9 T | 1.89 | 1.89 | 1.89 |
| tier 10 | 3.7 | 24 | 6.0 | 6.62 T | 6.62 T | 1.03 | 1.03 | 1.03 |
| tier 15 | 1.1 | 60 | 22 | 61.7 T | 108 T | 1.18 | 2.07 | 1.18 |
| tier 20 | 27 | 137 | 40 | 4.67 | 9.69 T | 0.91 | 1.89 | 0.91 |
| tier 25 | 6.9 | 323 | 95 | 34.2 T | 92.2 T | 0.73 | 1.97 | 0.73 |
| tier 30 | 44 | 699 | 138 | 16.8 T | 75.0 T | 1.05 | 4.68 | 1.05 |
| tier 40 | 74 | 1.68K | 310 | 23.1 T | 144 T | 1.01 | 6.34 T | 1.01 |
| tier 50 | 53 | 3.84K | 466 | 61.8 T | 521 T | 0.85 | 7.17 T | 1.21 |
| tier 60 | 204 | 11.3K | 1.31K | 33.2 T | 331 T | 0.60 | 5.98 T | 1.29 |
| tier 75 | 380 | 33.2K | 3.76K | 25.7 T | 583 T | 0.29 X | 6.67 T | 1.82 |
| tier 100 | 6.29K | 203K | 13.5K | 4.51 | 132 T | 0.14 X | 4.12 | 4.12 |
| ring 10 | 43 | 630 | 118 | 11.2 T | 35.4 T | 0.76 | 2.39 | 0.76 |
| ring 25 | 75 | 699 | 165 | 10.0 T | 78.3 T | 1.08 | 8.45 T | 1.08 |
| ring 50 | 111 | 2.21K | 380 | 15.3 T | 95.8 T | 0.77 | 4.80 | 0.77 |
| ring 100 | 176 | 5.82K | 742 | 27.1 T | 270 T | 0.82 | 8.19 T | 1.46 |
| ring 200 | 2.3K | 85.9K | 6.04K | 6.08 T | 185 T | 0.16 X | 4.96 | 2.11 |
| ring 400 | 3.84K | 332K | 15.3K | 7.52 T | 220 T | 0.09 X | 2.55 | 2.55 |
| FF wave 5 | 13 | 13 | 7.0 | 13.3 T | 23.9 T | 13.3 T | 23.9 T | 13.3 T |
| FF wave 10 | 187 | 187 | 404 | 11.8 T | 75.6 T | 11.8 T | 75.6 T | 12.1 T |
| FF wave 15 | 1.46K | 1.46K | 288 | 4.65 | 46.3 T | 4.65 | 46.3 T | 10.4 T |
| FF wave 20 | 14K | 14K | 15.1K | 0.71 | 30.4 T | 0.71 | 30.4 T | 9.24 T |
| FF wave 25 | 32.2K | 32.2K | 4.21K | 0.88 | 25.8 T | 0.88 | 25.8 T | 25.8 T |
| FF wave 30 | 120K | 120K | 86.2K | 0.24 X | 7.06 T | 0.24 X | 7.06 T | 7.06 T |
| FF wave 35 | 163K | 163K | 14.8K | 0.18 X | 5.21 T | 0.18 X | 5.21 T | 5.21 T |
| FF wave 40 | 367K | 367K | 186K | 0.08 X | 2.31 | 0.08 X | 2.31 | 2.31 |
| FF wave 45 | 416K | 416K | 29.1K | 0.07 X | 2.07 | 0.07 X | 2.07 | 2.07 |
| FF wave 50 | 812K | 812K | 333K | 0.04 X | 1.06 | 0.04 X | 1.06 | 1.06 |

Small-numbers check: the proposal changes nothing before tier 30 (HP 2 at tier 1, whole numbers, 70 at tier 30). Late HP is read through the K / M / B format of src/ui/format.ts: tier 100 block HP is 3.38K, the toughest block (armor and shields included) 13.5K, ring 400 block HP 3.93K, wave 50 body HP 111K.

Career-matched bots (as in section C): today -> on the proposed walls.

| position | buyer | hero lvl | build the model gives | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|---|---|
| tier 10 | casual | 6 | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 50 | 0 -> 0 |
| tier 10 | builder | 6 | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 50 | 0 -> 0 |
| tier 20 | casual | 9 | Lancet, 5 dmg blocks L2 | 125 | 100 -> 53 | 21 -> 21 | 100 -> 100 | 0 -> 0 |
| tier 20 | builder | 9 | Lancet, 1 Flat+ L2 + 4 Percent x L2 | 258 | 100 -> 79 | 27 -> 27 | 150 -> 100 | 5 -> 5 |
| tier 30 | casual | 11 | Mantis, 8 dmg blocks L4 | 731 | 100 -> 90 | 31 -> 31 | 250 -> 150 | 5 -> 5 |
| tier 30 | builder | 11 | Mantis, 1 Flat+ L3 + 7 Percent x L4 | 3.27K | 100 -> 100 | 31 -> 31 | 350 -> 1000 | 5 -> 5 |
| tier 40 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 350 | 5 -> 5 |
| tier 40 | builder | 13 | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 10.6K | 100 -> 100 | 31 -> 31 | 400 -> 2000 | 5 -> 5 |
| tier 50 | casual | 15 | Halberd, 10 dmg blocks L6 | 3.27K | 100 -> 100 | 53 -> 53 | 350 -> 1000 | 100 -> 100 |
| tier 50 | builder | 15 | Halberd, 1 Flat+ L3 + 9 Percent x L7 | 27.5K | 100 -> 100 | 100 -> 81 | 500 -> 2000 | 250 -> 150 |
| tier 60 | casual | 16 | Halberd, 10 dmg blocks L8 | 6.77K | 100 -> 100 | 100 -> 53 | 150 -> 1000 | 100 -> 100 |
| tier 60 | builder | 16 | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 67.5K | 100 -> 100 | 100 -> 99 | 500 -> 2000 | 250 -> 250 |
| tier 75 | casual | 17 | Halberd, 10 dmg blocks L9 | 9.76K | 100 -> 100 | 100 -> 63 | 350 -> 2000 | 150 -> 100 |
| tier 75 | builder | 17 | Shuttle, 1 Flat+ L3 + 8 Percent x L9 | 221K | 100 -> 100 | 53 -> 53 | 600 -> 2000 | 100 -> 100 |
| tier 100 | casual | 19 | Leviathan, 12 dmg blocks L10 | 28.4K | 100 -> 100 | 100 -> 78 | 500 -> 2000 | 150 -> 100 |
| tier 100 | builder | 19 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 833K | 100 -> 100 | 100 -> 99 | 700 -> 2000 | 250 -> 250 |
| ring 50 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 350 | 5 -> 5 |
| ring 50 | builder | 13 | Mantis, 1 Flat+ L3 + 7 Percent x L6 | 10.6K | 100 -> 100 | 31 -> 31 | 400 -> 2000 | 5 -> 5 |
| ring 100 | casual | 16 | Halberd, 10 dmg blocks L7 | 4.78K | 100 -> 100 | 82 -> 53 | 350 -> 1000 | 100 -> 100 |
| ring 100 | builder | 16 | Halberd, 1 Flat+ L3 + 9 Percent x L8 | 47.6K | 100 -> 100 | 100 -> 87 | 500 -> 2000 | 250 -> 200 |
| ring 200 | casual | 18 | Halberd, 10 dmg blocks L10 | 14K | 100 -> 100 | 100 -> 78 | 400 -> 150 | 150 -> 100 |
| ring 200 | builder | 18 | Shuttle, 1 Flat+ L3 + 8 Percent x L10 | 426K | 100 -> 100 | 53 -> 53 | 600 -> 2000 | 100 -> 100 |
| ring 400 | casual | 20 | Leviathan, 12 dmg blocks L10 | 28.9K | 100 -> 100 | 100 -> 78 | 500 -> 2000 | 150 -> 100 |
| ring 400 | builder | 20 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 847K | 100 -> 100 | 100 -> 99 | 700 -> 2000 | 250 -> 250 |

The bots on the proposed walls (same builds, same walls, only block HP and shields scaled by the proposed curve; Free Fly is not flown). Cells read today -> proposed.

| hull | build | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|
| Dart | sensible | 4.0 | 19 -> 19 | 2 -> 2 | 0 -> 0 | 0 -> 0 |
| Twin | sensible | 7.5 | 29 -> 29 | 5 -> 5 | 10 -> 5 | 0 -> 0 |
| Twin | tuned | 5.0 | 22 -> 22 | 2 -> 2 | 0 -> 0 | 0 -> 0 |
| Prong | sensible | 16 | 34 -> 34 | 7 -> 7 | 75 -> 50 | 0 -> 0 |
| Wisp | sensible | 33 | 53 -> 45 | 12 -> 12 | 100 -> 75 | 0 -> 0 |
| Wisp | tuned | 39 | 53 -> 52 | 12 -> 12 | 100 -> 75 | 0 -> 0 |
| Hornet | sensible | 44 | 53 -> 52 | 12 -> 12 | 100 -> 75 | 0 -> 0 |
| Hornet | tuned | 23 | 34 -> 45 | 7 -> 7 | 75 -> 50 | 0 -> 0 |
| Lancet | sensible | 102 | 53 -> 53 | 15 -> 15 | 100 -> 100 | 0 -> 0 |
| Lancet | tuned | 188 | 100 -> 70 | 24 -> 24 | 100 -> 100 | 0 -> 0 |
| Kestrel | sensible | 63 | 53 -> 53 | 13 -> 13 | 100 -> 100 | 0 -> 0 |
| Kestrel | tuned | 56 | 53 -> 53 | 13 -> 13 | 100 -> 100 | 0 -> 0 |
| Mantis | sensible | 451 | 100 -> 79 | 29 -> 29 | 150 -> 150 | 5 -> 5 |
| Mantis | tuned | 1.38K | 100 -> 100 | 31 -> 31 | 300 -> 350 | 5 -> 5 |
| Bastion | sensible | 40 | 53 -> 52 | 12 -> 12 | 100 -> 75 | 0 -> 0 |
| Bastion | tuned | 48 | 53 -> 52 | 13 -> 13 | 100 -> 75 | 0 -> 0 |
| Halberd | sensible | 1.3K | 100 -> 97 | 39 -> 46 | 300 -> 350 | 100 -> 50 |
| Halberd | tuned | 5.26K | 100 -> 100 | 99 -> 53 | 350 -> 1000 | 100 -> 100 |
| Corvette | sensible | 309 | 100 -> 79 | 29 -> 29 | 150 -> 100 | 10 -> 5 |
| Corvette | tuned | 491 | 100 -> 79 | 31 -> 31 | 250 -> 150 | 25 -> 10 |
| Trident | sensible | 425 | 100 -> 79 | 31 -> 31 | 150 -> 100 | 10 -> 10 |
| Trident | tuned | 1.11K | 100 -> 97 | 39 -> 46 | 300 -> 300 | 75 -> 50 |
| Galleon | sensible | 348 | 100 -> 79 | 27 -> 27 | 150 -> 100 | 5 -> 5 |
| Galleon | tuned | 946 | 100 -> 90 | 39 -> 36 | 250 -> 150 | 50 -> 25 |
| Shuttle | sensible | 2.08K | 100 -> 100 | 53 -> 51 | 300 -> 1000 | 100 -> 75 |
| Shuttle | tuned | 86.1K | 100 -> 100 | 53 -> 53 | 500 -> 2000 | 100 -> 100 |
| Spire | sensible | 513 | 100 -> 80 | 31 -> 31 | 250 -> 150 | 25 -> 10 |
| Spire | tuned | 1.03K | 100 -> 90 | 39 -> 36 | 300 -> 200 | 50 -> 25 |
| Leviathan | sensible | 7.58K | 100 -> 100 | 53 -> 53 | 350 -> 1000 | 100 -> 100 |
| Leviathan | tuned | 574K | 100 -> 100 | 100 -> 90 | 700 -> 2000 | 250 -> 250 |
| Fan | sensible | 2.91K | 100 -> 100 | 63 -> 53 | 350 -> 1000 | 100 -> 100 |
| Fan | tuned | 5.94K | 100 -> 100 | 99 -> 53 | 350 -> 1000 | 100 -> 100 |
| Citadel | sensible | 2.78K | 100 -> 100 | 63 -> 53 | 350 -> 1000 | 100 -> 100 |
| Citadel | tuned | 4.46K | 100 -> 100 | 78 -> 53 | 350 -> 1000 | 100 -> 100 |
| Zenith | sensible | 5.12K | 100 -> 100 | 100 -> 53 | 350 -> 1000 | 100 -> 100 |
| Zenith | tuned | 10.6K | 100 -> 100 | 100 -> 69 | 400 -> 2000 | 150 -> 100 |

