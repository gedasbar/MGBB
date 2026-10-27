## A. Progress model: what a buyer owns

Career tier e: the campaign tier itself; a Frontier ring r is e = 25 + 0.3 r; a Free Fly wave w is the e whose Frontier Free Fly square has wave equivalent w (e = 25 + 4 (w - 6)). Credits banked on arriving at e = 3 runs x 50% of the full-clear credits of every tier before it (campaign up to 100, Frontier walls of the matching ring beyond), nothing wasted, Free Fly income not counted. Two buyers with the same credits: the **casual** buyer owns the best "sensible build" (hull + k damage blocks, Flat+ and Percent x alternating, one level; src/debug/hullBuilds.ts, the build every 17a bot used); the **builder** owns the best of that family and of the multiplier family (1-3 Flat+ next to the generator, every other block a Percent x, the Percent x line a player who understands the game builds). Prices are the real ones (hull + copies + upgrades). Hero level = all Medals (campaign first clears + Free Fly milestone Medals + Frontier Medals) spent on hero levels, +0.5 base damage each.

| point | career tier | credits banked | Medals | hero lvl | casual build | DPS | DPS + hero | builder build | DPS | DPS + hero |
|---|---|---|---|---|---|---|---|---|---|---|
| tier 1 | 1.0 | 0.0 | 0 | 0 | Dart, 1 dmg blocks L1 | 4.0 | 4.0 | Dart, 1 dmg blocks L1 | 4.0 | 4.0 |
| tier 5 | 5.0 | 230 | 4 | 3 | Twin, 2 dmg blocks L1 | 7.5 | 13 | Twin, 2 dmg blocks L1 | 7.5 | 13 |
| tier 10 | 10 | 735 | 10 | 6 | Twin, 2 dmg blocks L2 | 12 | 24 | Twin, 2 dmg blocks L2 | 12 | 24 |
| tier 15 | 15 | 1.57K | 16 | 8 | Wisp, 5 dmg blocks L2 | 39 | 71 | Prong, 1 dmg blocks L3 | 20 | 52 |
| tier 20 | 20 | 2.92K | 21 | 9 | Lancet, 5 dmg blocks L2 | 66 | 125 | Hornet, 3 Flat+ L2 + 3 Percent x L2 | 48 | 121 |
| tier 25 | 25 | 4.95K | 27 | 10 | Lancet, 5 dmg blocks L4 | 147 | 236 | Kestrel, 6 dmg blocks L3 | 52 | 142 |
| tier 30 | 30 | 7.95K | 37 | 11 | Mantis, 8 dmg blocks L4 | 451 | 731 | Mantis, 2 Flat+ L4 + 6 Percent x L4 | 1.64K | 3.27K |
| tier 40 | 40 | 18.6K | 56 | 13 | Mantis, 8 dmg blocks L6 | 1.09K | 1.7K | Halberd, 2 Flat+ L3 + 8 Percent x L5 | 3.01K | 6.83K |
| tier 50 | 50 | 40K | 76 | 15 | Halberd, 10 dmg blocks L6 | 1.96K | 3.27K | Halberd, 1 Flat+ L6 + 9 Percent x L6 | 10.1K | 27.5K |
| tier 60 | 60 | 81.4K | 95 | 16 | Halberd, 10 dmg blocks L8 | 4.26K | 6.77K | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 35.7K | 67.5K |
| tier 75 | 75 | 220K | 122 | 17 | Halberd, 10 dmg blocks L9 | 6.17K | 9.76K | Halberd, 1 Flat+ L9 + 9 Percent x L9 | 65.8K | 137K |
| tier 100 | 100 | 1.04M | 168 | 19 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.4K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 833K |
| ring 10 | 28 | 6.63K | 33 | 11 | Mantis, 8 dmg blocks L3 | 272 | 478 | Mantis, 2 Flat+ L3 + 6 Percent x L3 | 804 | 232 |
| ring 25 | 33 | 10.4K | 42 | 12 | Mantis, 8 dmg blocks L4 | 451 | 757 | Mantis, 1 Flat+ L3 + 7 Percent x L5 | 2.36K | 5.91K |
| ring 50 | 40 | 18.6K | 56 | 13 | Mantis, 8 dmg blocks L6 | 1.09K | 1.7K | Halberd, 2 Flat+ L3 + 8 Percent x L5 | 3.01K | 6.83K |
| ring 100 | 55 | 57.3K | 86 | 16 | Halberd, 10 dmg blocks L7 | 2.91K | 4.78K | Halberd, 1 Flat+ L7 + 9 Percent x L7 | 19.2K | 47.6K |
| ring 200 | 85 | 415K | 141 | 18 | Halberd, 10 dmg blocks L10 | 8.88K | 14K | Leviathan, 2 Flat+ L8 + 10 Percent x L8 | 139K | 219K |
| ring 400 | 145 | 16.4M | 207 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 5 | 21 | 3.26K | 23 | 9 | Lancet, 5 dmg blocks L3 | 102 | 171 | Hornet, 3 Flat+ L3 + 2 Percent x L3 | 58 | 129 |
| FF wave 10 | 41 | 20.2K | 58 | 14 | Halberd, 10 dmg blocks L5 | 1.3K | 2.21K | Halberd, 2 Flat+ L5 + 8 Percent x L5 | 4.72K | 9.64K |
| FF wave 15 | 61 | 87.1K | 97 | 16 | Halberd, 10 dmg blocks L8 | 4.26K | 6.77K | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 35.7K | 67.5K |
| FF wave 20 | 81 | 323K | 133 | 18 | Halberd, 10 dmg blocks L9 | 6.17K | 9.97K | Halberd, 1 Flat+ L9 + 9 Percent x L9 | 65.8K | 142K |
| FF wave 25 | 101 | 1.1M | 170 | 19 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.4K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 833K |
| FF wave 30 | 121 | 4.31M | 187 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 35 | 141 | 13.2M | 203 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 40 | 161 | 39.6M | 220 | 20 | Leviathan, 12 dmg blocks L10 | 17.8K | 28.9K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 847K |
| FF wave 45 | 181 | 109M | 237 | 21 | Leviathan, 12 dmg blocks L10 | 17.8K | 29.5K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 861K |
| FF wave 50 | 201 | 297M | 253 | 21 | Leviathan, 12 dmg blocks L10 | 17.8K | 29.5K | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 574K | 861K |

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
| tier 40 | 74 | 74 | 1.68K | 310 | 23 |
| tier 50 | 53 | 64 | 3.85K | 466 | 73 |
| tier 60 | 204 | 219 | 11.3K | 1.31K | 55 |
| tier 75 | 380 | 535 | 33.2K | 3.76K | 87 |
| tier 100 | 6.29K | 3.7K | 203K | 13.5K | 32 |
| ring 10 | 85 | 85 | 699 | 118 | 8 |
| ring 25 | 110 | 110 | 712 | 161 | 6 |
| ring 50 | 180 | 180 | 2.34K | 379 | 13 |
| ring 100 | 396 | 396 | 7.71K | 743 | 19 |
| ring 200 | 2.98K | 2.98K | 101K | 6.04K | 34 |
| ring 400 | 79.2K | 79.2K | 4.47M | 176K | 56 |
| FF wave 5 | 13 | 13 | 13 | 7.0 | - |
| FF wave 10 | 187 | 187 | 187 | 404 | - |
| FF wave 15 | 1.46K | 1.46K | 1.46K | 288 | - |
| FF wave 20 | 14K | 14K | 14K | 15.1K | - |
| FF wave 25 | 33.4K | 33.4K | 33.4K | 4.37K | - |
| FF wave 30 | 122K | 122K | 122K | 87.7K | - |
| FF wave 35 | 163K | 163K | 163K | 14.8K | - |
| FF wave 40 | 380K | 380K | 380K | 193K | - |
| FF wave 45 | 423K | 423K | 423K | 29.6K | - |
| FF wave 50 | 812K | 812K | 812K | 333K | - |

Owned / needed. "no hero" and "hero" = without and with the hero level of that point.

| point | casual pass | casual pass +hero | builder pass | builder pass +hero | casual clear | casual clear +hero | builder clear | builder clear +hero |
|---|---|---|---|---|---|---|---|---|
| tier 1 | 4.78 | 4.78 | 4.78 | 4.78 | 1.31 | 1.31 | 1.31 | 1.31 |
| tier 5 | 7.36 T | 12.9 T | 7.36 T | 12.9 T | 1.08 | 1.89 | 1.08 | 1.89 |
| tier 10 | 3.31 | 6.62 T | 3.31 | 6.62 T | 0.51 | 1.03 | 0.51 | 1.03 |
| tier 15 | 34.3 T | 61.7 T | 17.4 T | 45.3 T | 0.66 | 1.18 | 0.33 X | 0.87 |
| tier 20 | 2.46 | 4.67 | 1.80 | 4.55 | 0.48 X | 0.91 | 0.35 X | 0.89 |
| tier 25 | 21.3 T | 34.2 T | 7.59 T | 20.5 T | 0.45 X | 0.73 | 0.16 X | 0.44 X |
| tier 30 | 10.3 T | 16.8 T | 37.6 T | 75.0 T | 0.64 | 1.05 | 2.35 | 4.68 |
| tier 40 | 14.8 T | 23.1 T | 40.9 T | 92.9 T | 0.65 | 1.01 | 1.79 | 4.07 |
| tier 50 | 37.1 T | 61.8 T | 192 T | 521 T | 0.51 | 0.85 | 2.64 | 7.16 T |
| tier 60 | 20.9 T | 33.2 T | 175 T | 331 T | 0.38 X | 0.60 | 3.17 | 5.98 T |
| tier 75 | 16.2 T | 25.7 T | 173 T | 360 T | 0.19 X | 0.29 X | 1.98 | 4.12 |
| tier 100 | 2.82 | 4.51 | 91.2 T | 132 T | 0.09 X | 0.14 X | 2.83 | 4.12 |
| ring 10 | 3.20 | 5.63 T | 9.46 T | 2.73 | 0.39 X | 0.68 | 1.15 | 0.33 X |
| ring 25 | 4.09 | 6.88 T | 21.5 T | 53.7 T | 0.63 | 1.06 | 3.32 | 8.29 T |
| ring 50 | 6.04 T | 9.45 T | 16.7 T | 37.9 T | 0.46 X | 0.73 | 1.28 | 2.92 |
| ring 100 | 7.35 T | 12.1 T | 48.4 T | 120 T | 0.38 X | 0.62 | 2.49 | 6.18 T |
| ring 200 | 2.98 | 4.70 | 46.7 T | 73.5 T | 0.09 X | 0.14 X | 1.38 | 2.17 |
| ring 400 | 0.22 X | 0.37 X | 7.24 T | 10.7 T | 0.00 X | 0.01 X | 0.13 X | 0.19 X |
| FF wave 5 | 7.95 T | 13.3 T | 4.48 | 10.0 T | 7.95 T | 13.3 T | 4.48 | 10.0 T |
| FF wave 10 | 6.92 T | 11.8 T | 25.2 T | 51.4 T | 6.92 T | 11.8 T | 25.2 T | 51.4 T |
| FF wave 15 | 2.93 | 4.65 | 24.5 T | 46.3 T | 2.93 | 4.65 | 24.5 T | 46.3 T |
| FF wave 20 | 0.44 X | 0.71 | 4.69 | 10.1 T | 0.44 X | 0.71 | 4.69 | 10.1 T |
| FF wave 25 | 0.53 | 0.85 | 17.2 T | 24.9 T | 0.53 | 0.85 | 17.2 T | 24.9 T |
| FF wave 30 | 0.15 X | 0.24 X | 4.70 | 6.93 T | 0.15 X | 0.24 X | 4.70 | 6.93 T |
| FF wave 35 | 0.11 X | 0.18 X | 3.53 | 5.21 T | 0.11 X | 0.18 X | 3.53 | 5.21 T |
| FF wave 40 | 0.05 X | 0.08 X | 1.51 | 2.23 | 0.05 X | 0.08 X | 1.51 | 2.23 |
| FF wave 45 | 0.04 X | 0.07 X | 1.36 | 2.03 | 0.04 X | 0.07 X | 1.36 | 2.03 |
| FF wave 50 | 0.02 X | 0.04 X | 0.71 | 1.06 | 0.02 X | 0.04 X | 0.71 | 1.06 |

Sensitivity of the credit model: the clear ratio with the hero level (casual / builder) when the budget is x0.5 (a buyer who wastes half on hulls they leave behind), x1, and x4 (a grinder who replays walls).

| point | x0.5 | x1 | x4 |
|---|---|---|---|
| tier 1 | 1.31 / 1.31 | 1.31 / 1.31 | 1.31 / 1.31 |
| tier 5 | 1.26 / 1.26 | 1.89 / 1.89 | 2.71 / 2.92 |
| tier 10 | 0.79 / 0.79 | 1.03 / 1.03 | 4.43 / 3.99 |
| tier 15 | 0.47 X / 0.47 X | 1.18 / 0.87 | 7.03 T / 3.03 |
| tier 20 | 0.55 / 0.41 X | 0.91 / 0.89 | 7.49 T / 45.4 T |
| tier 25 | 0.41 X / 0.28 X | 0.73 / 0.44 X | 6.02 T / 24.4 T |
| tier 30 | 0.27 X / 0.13 X | 1.05 / 4.68 | 4.17 / 25.9 T |
| tier 40 | 0.47 X / 2.36 | 1.01 / 4.07 | 2.64 / 24.8 T |
| tier 50 | 0.59 / 2.62 | 0.85 / 7.16 T | 2.43 / 19.7 T |
| tier 60 | 0.30 X / 2.55 | 0.60 / 5.98 T | 0.85 / 11.6 T |
| tier 75 | 0.21 X / 2.48 | 0.29 X / 4.12 | 0.82 / 24.3 T |
| tier 100 | 0.09 X / 2.10 | 0.14 X / 4.12 | 0.14 X / 4.12 |
| ring 10 | 0.27 X / 0.21 X | 0.68 / 0.33 X | 4.17 / 19.7 T |
| ring 25 | 0.44 X / 0.25 X | 1.06 / 8.29 T | 4.22 / 33.6 T |
| ring 50 | 0.33 X / 1.69 | 0.73 / 2.92 | 1.89 / 17.8 T |
| ring 100 | 0.44 X / 2.82 | 0.62 / 6.18 T | 1.24 / 17.0 T |
| ring 200 | 0.10 X / 1.24 | 0.14 X / 2.17 | 0.28 X / 8.12 T |
| ring 400 | 0.01 X / 0.19 X | 0.01 X / 0.19 X | 0.01 X / 0.19 X |
| FF wave 5 | 5.80 T / 4.34 | 13.3 T / 10.0 T | 79.4 T / 58.4 T |
| FF wave 10 | 4.31 / 34.6 T | 11.8 T / 51.4 T | 34.4 T / 233 T |
| FF wave 15 | 3.28 / 19.7 T | 4.65 / 46.3 T | 9.21 T / 143 T |
| FF wave 20 | 0.71 / 8.90 T | 0.71 / 10.1 T | 1.98 / 58.3 T |
| FF wave 25 | 0.57 / 13.5 T | 0.85 / 24.9 T | 0.85 / 24.9 T |
| FF wave 30 | 0.24 X / 6.93 T | 0.24 X / 6.93 T | 0.24 X / 6.93 T |
| FF wave 35 | 0.18 X / 5.21 T | 0.18 X / 5.21 T | 0.18 X / 5.21 T |
| FF wave 40 | 0.08 X / 2.23 | 0.08 X / 2.23 | 0.08 X / 2.23 |
| FF wave 45 | 0.07 X / 2.03 | 0.07 X / 2.03 | 0.07 X / 2.03 |
| FF wave 50 | 0.04 X / 1.06 | 0.04 X / 1.06 | 0.04 X / 1.06 |

## C. How far a build gets (bots)

Bots: the carve bot and the clear-all bot of src/wall/sim.ts, the Free Fly bot of src/debug/freeflyBot.ts (2 seeds, cap 2400 s). Highest tier passed: pass = the carve bot passes or the clear-all bot passes or clears; found by galloping and bisecting, then every spike and milestone tier up to it is checked, so it is the highest tier of the strict order up to rare template luck (a bot is not a human). Frontier rings: a ring counts when more than half of its (up to 3) wall squares on the axes are won, tested on the ring ladder 5, 10, 25, 50, 75, 100, 150 ... 2000. "sensible" = src/debug/hullBuilds.ts as 17a uses it; "price point" = the best Flat+ / Percent x build the hull's price x 2 buys (half hull, half blocks). Dart = the starter: one Flat+ and nothing else.

| hull | build | dmg blocks | credits | est. DPS | tier passed | first tier not passed | tier cleared | ring passed | ring cleared | FF waves | FF end |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Dart | sensible | 1 Flat+ L1 | 0.0 | 4.0 | 19 | 20 Bands | 2 | 0 | 0 | 5/5 | died |
| Twin | sensible | 2 dmg blocks L1 | 170 | 7.5 | 29 | 30 Diamond | 5 | 5 | 0 | 7/7 | died |
| Twin | tuned | 1 dmg blocks L1 | 70 | 5.0 | 22 | 23 Slab | 2 | 0 | 0 | 5/5 | died |
| Prong | sensible | 1 dmg blocks L2 | 1.17K | 16 | 34 | 35 Arrow | 7 | 5 | 0 | 8/8 | died |
| Wisp | sensible | 4 dmg blocks L2 | 1.32K | 33 | 45 | 46 Arrow | 12 | 25 | 0 | 9/9 | died |
| Wisp | tuned | 2 Flat+ L2 + 2 Percent x L2 | 1.32K | 39 | 52 | 53 Arrow | 12 | 50 | 0 | 10/9 | died |
| Hornet | sensible | 5 dmg blocks L3 | 3.21K | 44 | 52 | 53 Arrow | 12 | 50 | 0 | 10/10 | died |
| Hornet | tuned | 3 Flat+ L1 + 2 Percent x L1 | 2.19K | 23 | 45 | 46 Arrow | 7 | 25 | 0 | 8/9 | died |
| Lancet | sensible | 5 dmg blocks L3 | 3.11K | 102 | 53 | 54 Slab | 15 | 100 | 0 | 11/12 | died |
| Lancet | tuned | 2 Flat+ L3 + 3 Percent x L3 | 3.19K | 188 | 70 | 71 Checker | 24 | 100 | 0 | 13/13 | died |
| Kestrel | sensible | 7 dmg blocks L4 | 6.53K | 63 | 53 | 54 Slab | 13 | 100 | 0 | 11/11 | died |
| Kestrel | tuned | 3 Flat+ L3 + 4 Percent x L3 | 5.1K | 56 | 53 | 54 Slab | 13 | 50 | 0 | 11/11 | died |
| Mantis | sensible | 8 dmg blocks L4 | 7.35K | 451 | 79 | 80 The Funnel | 29 | 100 | 5 | 14/14 | died |
| Mantis | tuned | 1 Flat+ L3 + 7 Percent x L4 | 7.65K | 1.38K | 100 | none | 31 | 200 | 5 | 17/17 | died |
| Bastion | sensible | 5 dmg blocks L5 | 13.4K | 40 | 52 | 53 Arrow | 12 | 50 | 0 | 9/9 | died |
| Bastion | tuned | 3 Flat+ L4 + 2 Percent x L4 | 9.95K | 48 | 52 | 53 Arrow | 13 | 50 | 0 | 10/11 | died |
| Halberd | sensible | 10 dmg blocks L5 | 19K | 1.3K | 97 | 98 Stairs | 46 | 200 | 50 | 17/17 | died |
| Halberd | tuned | 1 Flat+ L5 + 9 Percent x L5 | 20.9K | 5.26K | 100 | none | 53 | 300 | 100 | 21/21 | died |
| Corvette | sensible | 6 dmg blocks L6 | 33.7K | 309 | 79 | 80 The Funnel | 29 | 100 | 5 | 14/14 | died |
| Corvette | tuned | 1 Flat+ L6 + 5 Percent x L6 | 34.1K | 491 | 79 | 80 The Funnel | 31 | 150 | 5 | 15/15 | died |
| Trident | sensible | 12 dmg blocks L6 | 49K | 425 | 79 | 80 The Funnel | 31 | 100 | 5 | 15/14 | died |
| Trident | tuned | 20 dmg blocks L6 | 52.9K | 1.11K | 97 | 98 Stairs | 46 | 200 | 50 | 17/17 | died |
| Galleon | sensible | 11 dmg blocks L7 | 90.2K | 348 | 79 | 80 The Funnel | 27 | 100 | 5 | 13/14 | died |
| Galleon | tuned | 1 Flat+ L7 + 10 Percent x L7 | 93K | 946 | 90 | 91 Slab | 36 | 150 | 25 | 15/17 | died |
| Shuttle | sensible | 9 dmg blocks L7 | 127K | 2.08K | 100 | none | 51 | 200 | 50 | 18/18 | died |
| Shuttle | tuned | 1 Flat+ L8 + 8 Percent x L8 | 165K | 86.1K | 100 | none | 53 | 400 | 100 | 32/32 | died |
| Spire | sensible | 11 dmg blocks L8 | 259K | 513 | 80 | 81 Stairs | 31 | 150 | 10 | 15/14 | died |
| Spire | tuned | 1 Flat+ L9 + 10 Percent x L9 | 341K | 1.03K | 90 | 91 Slab | 36 | 200 | 25 | 16/17 | died |
| Leviathan | sensible | 12 dmg blocks L8 | 399K | 7.58K | 100 | none | 53 | 300 | 100 | 21/21 | died |
| Leviathan | tuned | 2 Flat+ L10 + 10 Percent x L10 | 657K | 574K | 100 | none | 90 | 500 | 250 | 45/45 | died |
| Fan | sensible | 17 dmg blocks L9 | 650K | 2.91K | 100 | none | 53 | 250 | 100 | 19/18 | died |
| Fan | tuned | 3 Flat+ L10 + 10 Percent x L10 | 827K | 5.94K | 100 | none | 53 | 300 | 100 | 21/21 | died |
| Citadel | sensible | 18 dmg blocks L9 | 971K | 2.78K | 100 | none | 53 | 250 | 100 | 19/18 | died |
| Citadel | tuned | 3 Flat+ L10 + 10 Percent x L10 | 1.15M | 4.46K | 100 | none | 53 | 300 | 100 | 20/20 | died |
| Zenith | sensible | 19 dmg blocks L10 | 1.63M | 5.12K | 100 | none | 53 | 300 | 100 | 21/21 | died |
| Zenith | tuned | 20 dmg blocks L10 | 1.63M | 10.6K | 100 | none | 69 | 350 | 100 | 22/22 | died |

Career-matched: the build each buyer of section A owns at a position (casual = the sensible family, builder = the multiplier family; both with the hero level as base damage), flown on the walls as they are. This is the check of the model: does a player at tier t clear tier t?

| position | buyer | hero lvl | build the model gives | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|---|---|
| tier 10 | casual | 6 | Twin, 2 dmg blocks L2 | 24 | 45 | 9 | 25 | 0 |
| tier 10 | builder | 6 | Twin, 2 dmg blocks L2 | 24 | 45 | 9 | 25 | 0 |
| tier 20 | casual | 9 | Lancet, 5 dmg blocks L2 | 125 | 53 | 21 | 100 | 0 |
| tier 20 | builder | 9 | Hornet, 1 Flat+ L1 + 5 Percent x L2 | 121 | 53 | 18 | 100 | 0 |
| tier 30 | casual | 11 | Mantis, 8 dmg blocks L4 | 731 | 90 | 31 | 150 | 5 |
| tier 30 | builder | 11 | Mantis, 1 Flat+ L3 + 7 Percent x L4 | 3.27K | 100 | 31 | 250 | 5 |
| tier 40 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 | 31 | 200 | 5 |
| tier 40 | builder | 13 | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 | 63 | 300 | 100 |
| tier 50 | casual | 15 | Halberd, 10 dmg blocks L6 | 3.27K | 100 | 53 | 250 | 100 |
| tier 50 | builder | 15 | Halberd, 1 Flat+ L3 + 9 Percent x L7 | 27.5K | 100 | 81 | 350 | 100 |
| tier 60 | casual | 16 | Halberd, 10 dmg blocks L8 | 6.77K | 100 | 53 | 300 | 100 |
| tier 60 | builder | 16 | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 67.5K | 100 | 99 | 400 | 250 |
| tier 75 | casual | 17 | Halberd, 10 dmg blocks L9 | 9.76K | 100 | 63 | 350 | 100 |
| tier 75 | builder | 17 | Halberd, 1 Flat+ L3 + 9 Percent x L10 | 137K | 100 | 99 | 450 | 250 |
| tier 100 | casual | 19 | Leviathan, 12 dmg blocks L10 | 28.4K | 100 | 78 | 350 | 100 |
| tier 100 | builder | 19 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 833K | 100 | 99 | 500 | 250 |
| ring 50 | casual | 13 | Mantis, 8 dmg blocks L6 | 1.7K | 100 | 31 | 200 | 5 |
| ring 50 | builder | 13 | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 | 63 | 300 | 100 |
| ring 100 | casual | 16 | Halberd, 10 dmg blocks L7 | 4.78K | 100 | 53 | 300 | 100 |
| ring 100 | builder | 16 | Halberd, 1 Flat+ L3 + 9 Percent x L8 | 47.6K | 100 | 87 | 400 | 200 |
| ring 200 | casual | 18 | Halberd, 10 dmg blocks L10 | 14K | 100 | 78 | 350 | 100 |
| ring 200 | builder | 18 | Halberd, 1 Flat+ L10 + 9 Percent x L10 | 219K | 100 | 100 | 450 | 250 |
| ring 400 | casual | 20 | Leviathan, 12 dmg blocks L10 | 28.9K | 100 | 78 | 350 | 100 |
| ring 400 | builder | 20 | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 847K | 100 | 99 | 500 | 250 |

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
| 40 | 74 | 221 | 3.00 | 18 | 23 |
| 60 | 204 | 685 | 3.36 | 51 | 55 |
| 80 | 2.37K | 2.66K | 1.12 | 592 | 20 |
| 100 | 6.29K | 11.7K | 1.85 | 1.57K | 32 |

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

## F. After 18b: bots on the 18a walls -> on the walls as they are now

Block HP curve of the campaign (flat from tier 38 -> growing to tier 100), the Frontier (x1.015 a ring -> the campaign curve to ring 250, then x1.018 a ring, plus the cheapest-column rule), Free Fly after wave 20. Cells read 18a -> now. The builder buyer now ranks hulls with the coverage weight, so its career builds can differ from 18a.

| hull | build | est. DPS | tier passed | tier cleared | ring passed | ring cleared | FF waves |
|---|---|---|---|---|---|---|---|
| Dart | sensible | 4.0 | 19 -> 19 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 5/5 -> 5/5 |
| Twin | sensible | 7.5 | 29 -> 29 | 5 -> 5 | 10 -> 5 | 0 -> 0 | 7/7 -> 7/7 |
| Twin | tuned | 5.0 | 22 -> 22 | 2 -> 2 | 0 -> 0 | 0 -> 0 | 5/5 -> 5/5 |
| Prong | sensible | 16 | 34 -> 34 | 7 -> 7 | 75 -> 5 | 0 -> 0 | 8/8 -> 8/8 |
| Wisp | sensible | 33 | 53 -> 45 | 12 -> 12 | 100 -> 25 | 0 -> 0 | 9/9 -> 9/9 |
| Wisp | tuned | 39 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 10/9 -> 10/9 |
| Hornet | sensible | 44 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 10/10 -> 10/10 |
| Hornet | tuned | 23 | 34 -> 45 | 7 -> 7 | 75 -> 25 | 0 -> 0 | 8/9 -> 8/9 |
| Lancet | sensible | 102 | 53 -> 53 | 15 -> 15 | 100 -> 100 | 0 -> 0 | 11/12 -> 11/12 |
| Lancet | tuned | 188 | 100 -> 70 | 24 -> 24 | 100 -> 100 | 0 -> 0 | 13/13 -> 13/13 |
| Kestrel | sensible | 63 | 53 -> 53 | 13 -> 13 | 100 -> 100 | 0 -> 0 | 11/11 -> 11/11 |
| Kestrel | tuned | 56 | 53 -> 53 | 13 -> 13 | 100 -> 50 | 0 -> 0 | 11/11 -> 11/11 |
| Mantis | sensible | 451 | 100 -> 79 | 29 -> 29 | 150 -> 100 | 5 -> 5 | 14/14 -> 14/14 |
| Mantis | tuned | 1.38K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 | 17/17 -> 17/17 |
| Bastion | sensible | 40 | 53 -> 52 | 12 -> 12 | 100 -> 50 | 0 -> 0 | 9/9 -> 9/9 |
| Bastion | tuned | 48 | 53 -> 52 | 13 -> 13 | 100 -> 50 | 0 -> 0 | 10/11 -> 10/11 |
| Halberd | sensible | 1.3K | 100 -> 97 | 39 -> 46 | 300 -> 200 | 100 -> 50 | 17/17 -> 17/17 |
| Halberd | tuned | 5.26K | 100 -> 100 | 99 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Corvette | sensible | 309 | 100 -> 79 | 29 -> 29 | 150 -> 100 | 10 -> 5 | 14/14 -> 14/14 |
| Corvette | tuned | 491 | 100 -> 79 | 31 -> 31 | 250 -> 150 | 25 -> 5 | 15/15 -> 15/15 |
| Trident | sensible | 425 | 100 -> 79 | 31 -> 31 | 150 -> 100 | 10 -> 5 | 15/14 -> 15/14 |
| Trident | tuned | 1.11K | 100 -> 97 | 39 -> 46 | 300 -> 200 | 75 -> 50 | 17/17 -> 17/17 |
| Galleon | sensible | 348 | 100 -> 79 | 27 -> 27 | 150 -> 100 | 5 -> 5 | 13/14 -> 13/14 |
| Galleon | tuned | 946 | 100 -> 90 | 39 -> 36 | 250 -> 150 | 50 -> 25 | 15/17 -> 15/17 |
| Shuttle | sensible | 2.08K | 100 -> 100 | 53 -> 51 | 300 -> 200 | 100 -> 50 | 18/18 -> 18/18 |
| Shuttle | tuned | 86.1K | 100 -> 100 | 53 -> 53 | 500 -> 400 | 100 -> 100 | 26/27 -> 32/32 |
| Spire | sensible | 513 | 100 -> 80 | 31 -> 31 | 250 -> 150 | 25 -> 10 | 15/14 -> 15/14 |
| Spire | tuned | 1.03K | 100 -> 90 | 39 -> 36 | 300 -> 200 | 50 -> 25 | 16/17 -> 16/17 |
| Leviathan | sensible | 7.58K | 100 -> 100 | 53 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Leviathan | tuned | 574K | 100 -> 100 | 100 -> 90 | 700 -> 500 | 250 -> 250 | 31/32 -> 45/45 |
| Fan | sensible | 2.91K | 100 -> 100 | 63 -> 53 | 350 -> 250 | 100 -> 100 | 19/18 -> 19/18 |
| Fan | tuned | 5.94K | 100 -> 100 | 99 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Citadel | sensible | 2.78K | 100 -> 100 | 63 -> 53 | 350 -> 250 | 100 -> 100 | 19/18 -> 19/18 |
| Citadel | tuned | 4.46K | 100 -> 100 | 78 -> 53 | 350 -> 300 | 100 -> 100 | 20/20 -> 20/20 |
| Zenith | sensible | 5.12K | 100 -> 100 | 100 -> 53 | 350 -> 300 | 100 -> 100 | 21/21 -> 21/21 |
| Zenith | tuned | 10.6K | 100 -> 100 | 100 -> 69 | 400 -> 350 | 150 -> 100 | 22/22 -> 22/22 |

Career-matched builds (hero level included):

| position | buyer | build | est. DPS | tier passed | tier cleared | ring passed | ring cleared |
|---|---|---|---|---|---|---|---|
| tier 10 | casual | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 25 | 0 -> 0 |
| tier 10 | builder | Twin, 2 dmg blocks L2 | 24 | 34 -> 45 | 9 -> 9 | 75 -> 25 | 0 -> 0 |
| tier 20 | casual | Lancet, 5 dmg blocks L2 | 125 | 100 -> 53 | 21 -> 21 | 100 -> 100 | 0 -> 0 |
| tier 20 | builder | Hornet, 1 Flat+ L1 + 5 Percent x L2 | 121 | 100 -> 53 | 27 -> 18 | 150 -> 100 | 5 -> 0 |
| tier 30 | casual | Mantis, 8 dmg blocks L4 | 731 | 100 -> 90 | 31 -> 31 | 250 -> 150 | 5 -> 5 |
| tier 30 | builder | Mantis, 1 Flat+ L3 + 7 Percent x L4 | 3.27K | 100 -> 100 | 31 -> 31 | 350 -> 250 | 5 -> 5 |
| tier 40 | casual | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 |
| tier 40 | builder | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 -> 100 | 31 -> 63 | 400 -> 300 | 5 -> 100 |
| tier 50 | casual | Halberd, 10 dmg blocks L6 | 3.27K | 100 -> 100 | 53 -> 53 | 350 -> 250 | 100 -> 100 |
| tier 50 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L7 | 27.5K | 100 -> 100 | 100 -> 81 | 500 -> 350 | 250 -> 100 |
| tier 60 | casual | Halberd, 10 dmg blocks L8 | 6.77K | 100 -> 100 | 100 -> 53 | 150 -> 300 | 100 -> 100 |
| tier 60 | builder | Halberd, 1 Flat+ L8 + 9 Percent x L8 | 67.5K | 100 -> 100 | 100 -> 99 | 500 -> 400 | 250 -> 250 |
| tier 75 | casual | Halberd, 10 dmg blocks L9 | 9.76K | 100 -> 100 | 100 -> 63 | 350 -> 350 | 150 -> 100 |
| tier 75 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L10 | 137K | 100 -> 100 | 53 -> 99 | 600 -> 450 | 100 -> 250 |
| tier 100 | casual | Leviathan, 12 dmg blocks L10 | 28.4K | 100 -> 100 | 100 -> 78 | 500 -> 350 | 150 -> 100 |
| tier 100 | builder | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 833K | 100 -> 100 | 100 -> 99 | 700 -> 500 | 250 -> 250 |
| ring 50 | casual | Mantis, 8 dmg blocks L6 | 1.7K | 100 -> 100 | 31 -> 31 | 300 -> 200 | 5 -> 5 |
| ring 50 | builder | Halberd, 1 Flat+ L3 + 8 Percent x L5 | 6.83K | 100 -> 100 | 31 -> 63 | 400 -> 300 | 5 -> 100 |
| ring 100 | casual | Halberd, 10 dmg blocks L7 | 4.78K | 100 -> 100 | 82 -> 53 | 350 -> 300 | 100 -> 100 |
| ring 100 | builder | Halberd, 1 Flat+ L3 + 9 Percent x L8 | 47.6K | 100 -> 100 | 100 -> 87 | 500 -> 400 | 250 -> 200 |
| ring 200 | casual | Halberd, 10 dmg blocks L10 | 14K | 100 -> 100 | 100 -> 78 | 400 -> 350 | 150 -> 100 |
| ring 200 | builder | Halberd, 1 Flat+ L10 + 9 Percent x L10 | 219K | 100 -> 100 | 53 -> 100 | 600 -> 450 | 100 -> 250 |
| ring 400 | casual | Leviathan, 12 dmg blocks L10 | 28.9K | 100 -> 100 | 100 -> 78 | 500 -> 350 | 150 -> 100 |
| ring 400 | builder | Leviathan, 2 Flat+ L10 + 10 Percent x L10 | 847K | 100 -> 100 | 100 -> 99 | 700 -> 500 | 250 -> 250 |

Owned / needed on the new curves (hero level included; the tables of section B above are the same arithmetic on the new walls).

