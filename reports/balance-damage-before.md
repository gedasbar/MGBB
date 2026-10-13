# balance-damage, step 2 run (after the rescale, before tuning)

Raw output of `npm run balance-damage` at commit after the rescale (7 min). Summary and reading in docs/balance-damage.md, section 2.

## A. Blocks on the reference circuit (engine HP removed per second)

Twin (4 pulses/s): generator -> [Flat+] -> block -> ejector. Routing blocks: Fan, block above [Flat+], Turn R / Turn L to the side ejectors.
Reference Twin + Flat+ (no block): big 7.5, cluster 6.5, split 6.6 (estimate 8.0). Fan Splitter 2 + Flat+: big 15.0, cluster 14.0, split 13.7.
Targets sized to the circuit (big 4 s, cluster body 0.75 s, split parent 1.5 s of its estimate). "x ref" = big with Flat+ / the reference's big (Fan reference for routing blocks). Factor = engine efficiency (engine / estimate) over the reference's, per scenario (big / cluster / split), used by the search.

| block | cat | L | alone big | +Flat+ big | +Flat+ cluster | +Flat+ split | x ref (big) | x ref (cluster) | factor b/c/s |
|---|---|---|---|---|---|---|---|---|---|
| Piercing | modifier | 5 | 16.4 | 32.8 | 18.9 | 12.8 | 4.37 | 2.90 | 4.37 / 2.90 / 1.95 |
| Splitter 3 | pathing | 5 | 13.5 | 27.0 | 24.8 | 23.8 | 1.80 | 1.77 | 1.00 / 0.98 / 0.96 |
| Flat + | damage | 5 | 22.5 | 26.3 | 22.8 | 23.0 | 3.50 | 3.50 | 1.00 / 1.00 / 1.00 |
| Percent × | damage | 5 | 13.1 | 26.3 | 22.8 | 23.0 | 3.50 | 3.50 | 1.00 / 1.00 / 1.00 |
| Splitter 3 | pathing | 1 | 11.3 | 22.5 | 20.6 | 19.8 | 1.50 | 1.47 | 1.00 / 0.98 / 0.96 |
| Splitter 2 | pathing | 5 | 9.0 | 18.0 | 16.8 | 16.4 | 1.20 | 1.20 | 1.00 / 1.00 / 1.00 |
| Alternator | pathing | 5 | 9.0 | 18.0 | 16.8 | 16.2 | 1.20 | 1.20 | 1.00 / 1.00 / 0.99 |
| Culling Bolt | mitosis | 5 | 7.7 | 15.4 | 6.5 | 9.6 | 2.06 | 1.00 | 2.06 / 1.00 / 1.47 |
| Boomerang | modifier | 5 | 7.7 | 15.4 | 19.3 | 17.1 | 2.05 | 2.96 | 2.05 / 2.96 / 2.60 |
| Splitter 2 | pathing | 1 | 7.5 | 15.0 | 14.0 | 13.7 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Alternator | pathing | 1 | 7.5 | 15.0 | 14.0 | 13.5 | 1.00 | 1.00 | 1.00 / 1.00 / 0.99 |
| Gambler’s Gate | damage | 1 | 6.8 | 13.5 | 9.4 | 9.7 | 1.80 | 1.44 | 1.20 / 0.96 / 0.99 |
| Static Charge | status | 5 | 6.5 | 13.1 | 6.5 | 13.4 | 1.74 | 1.00 | 1.74 / 1.00 / 2.04 |
| Culling Bolt | mitosis | 1 | 6.0 | 12.1 | 6.5 | 6.5 | 1.61 | 1.00 | 1.61 / 1.00 / 0.99 |
| Overclock | damage | 5 | 5.8 | 11.5 | 9.5 | 11.4 | 1.54 | 1.47 | 0.86 / 0.82 / 0.98 |
| Flat + | damage | 1 | 7.5 | 11.3 | 9.8 | 9.9 | 1.50 | 1.50 | 1.00 / 1.00 / 1.00 |
| Percent × | damage | 1 | 5.6 | 11.3 | 9.8 | 9.9 | 1.50 | 1.50 | 1.00 / 1.00 / 1.00 |
| Shield-Breaker | modifier | 1 | 5.5 | 11.0 | 10.5 | 9.6 | 1.47 | 1.62 | 1.47 / 1.62 / 1.47 |
| Random Router | pathing | 5 | 5.1 | 10.2 | 8.2 | 9.3 | 0.68 | 0.59 | 0.97 / 0.84 / 0.97 |
| Lucky Strike | damage | 1 | 5.0 | 10.1 | 8.5 | 9.0 | 1.34 | 1.30 | 1.01 / 0.98 / 1.03 |
| Frostbite | status | 5 | 5.0 | 10.1 | 6.5 | 12.5 | 1.34 | 1.00 | 1.34 / 1.00 / 1.90 |
| Static Charge | status | 1 | 5.0 | 10.1 | 6.5 | 9.6 | 1.34 | 1.00 | 1.34 / 1.00 / 1.47 |
| Jackpot | damage | 1 | 4.8 | 9.7 | 6.6 | 13.1 | 1.29 | 1.02 | 0.95 / 0.75 / 1.46 |
| Overclock | damage | 1 | 4.7 | 9.3 | 8.1 | 9.7 | 1.24 | 1.24 | 0.79 / 0.79 / 0.93 |
| Capacitor | damage | 5 | 4.6 | 9.3 | 5.2 | 14.0 | 1.24 | 0.81 | 0.88 / 0.58 / 1.53 |
| Frostbite | status | 1 | 4.6 | 9.2 | 6.5 | 6.5 | 1.23 | 1.00 | 1.23 / 1.00 / 1.00 |
| Bouncing | modifier | 5 | 4.4 | 8.8 | 9.1 | 12.7 | 1.17 | 1.40 | 1.17 / 1.40 / 1.93 |
| Residue Seed | mitosis | 5 | 4.3 | 8.6 | 17.5 | 13.3 | 1.15 | 2.69 | 1.15 / 2.69 / 2.03 |
| Ignite | status | 5 | 4.3 | 8.5 | 7.6 | 9.4 | 1.14 | 1.17 | 1.14 / 1.17 / 1.43 |
| Executioner | damage | 1 | 4.3 | 8.5 | 6.5 | 16.6 | 1.13 | 1.00 | 1.13 / 1.00 / 2.53 |
| Executioner | damage | 5 | 4.3 | 8.5 | 6.5 | 9.6 | 1.13 | 1.00 | 1.13 / 1.00 / 1.47 |
| Boomerang | modifier | 1 | 4.3 | 8.5 | 12.3 | 12.6 | 1.13 | 1.88 | 1.13 / 1.88 / 1.92 |
| Bouncing | modifier | 1 | 4.2 | 8.4 | 8.6 | 12.3 | 1.12 | 1.33 | 1.12 / 1.33 / 1.88 |
| Residue Seed | mitosis | 1 | 4.0 | 8.0 | 14.1 | 13.4 | 1.07 | 2.17 | 1.07 / 2.17 / 2.05 |
| Ignite | status | 1 | 4.0 | 8.0 | 6.5 | 6.7 | 1.07 | 1.00 | 1.07 / 1.00 / 1.03 |
| Fork on Impact | modifier | 1 | 3.9 | 7.8 | 11.1 | 12.5 | 1.03 | 1.70 | 1.03 / 1.70 / 1.90 |
| Gravity Well | modifier | 1 | 3.8 | 7.6 | 7.5 | 12.4 | 1.02 | 1.15 | 1.02 / 1.15 / 1.89 |
| Gravity Well | modifier | 5 | 3.8 | 7.6 | 7.6 | 12.4 | 1.02 | 1.17 | 1.02 / 1.17 / 1.89 |
| Turn Left | pathing | 1 | 3.8 | 7.5 | 6.4 | 6.7 | 0.50 | 0.46 | 1.00 / 1.00 / 1.00 |
| Turn Right | pathing | 1 | 3.8 | 7.5 | 7.5 | 6.5 | 0.50 | 0.54 | 1.00 / 1.00 / 1.00 |
| Random Router | pathing | 1 | 3.8 | 7.5 | 6.5 | 6.6 | 0.50 | 0.46 | 1.00 / 0.93 / 0.96 |
| Fission Catalyst | mitosis | 1 | 3.8 | 7.5 | 6.5 | 12.8 | 1.00 | 1.00 | 1.00 / 1.00 / 1.95 |
| Fission Catalyst | mitosis | 5 | 3.8 | 7.5 | 6.5 | 13.4 | 1.00 | 1.00 | 1.00 / 1.00 / 2.05 |
| Cauterize | mitosis | 1 | 3.8 | 7.5 | 6.5 | 37.4 | 1.00 | 1.00 | 1.00 / 1.00 / 5.70 |
| Cauterize | mitosis | 5 | 3.8 | 7.5 | 6.5 | 37.4 | 1.00 | 1.00 | 1.00 / 1.00 / 5.70 |
| Cleaver | mitosis | 5 | 3.8 | 7.5 | 6.5 | 13.3 | 1.00 | 1.00 | 1.00 / 1.00 / 2.02 |
| Overkill Spill | mitosis | 1 | 3.8 | 7.5 | 6.5 | 23.5 | 1.00 | 1.00 | 1.00 / 1.00 / 3.58 |
| Overkill Spill | mitosis | 5 | 3.8 | 7.5 | 6.5 | 37.4 | 1.00 | 1.00 | 1.00 / 1.00 / 5.70 |
| Piercing | modifier | 1 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.01 |
| AoE - Circle | modifier | 1 | 3.8 | 7.5 | 25.0 | 13.4 | 1.00 | 3.85 | 1.00 / 3.85 / 2.05 |
| AoE - Circle | modifier | 5 | 3.8 | 7.5 | 29.5 | 16.4 | 1.00 | 4.54 | 1.00 / 4.54 / 2.49 |
| Pure Converter | modifier | 1 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Pure Converter | modifier | 5 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Chain Lightning | modifier | 1 | 3.8 | 7.5 | 14.6 | 13.6 | 1.00 | 2.24 | 1.00 / 2.24 / 2.07 |
| Chain Lightning | modifier | 5 | 3.8 | 7.5 | 19.7 | 13.1 | 1.00 | 3.03 | 1.00 / 3.03 / 1.99 |
| Homing | modifier | 1 | 3.8 | 7.5 | 7.5 | 9.6 | 1.00 | 1.15 | 1.00 / 1.15 / 1.47 |
| Homing | modifier | 5 | 3.8 | 7.5 | 7.5 | 9.6 | 1.00 | 1.15 | 1.00 / 1.15 / 1.47 |
| AoE - Rectangle | modifier | 1 | 3.8 | 7.5 | 17.5 | 12.6 | 1.00 | 2.69 | 1.00 / 2.69 / 1.91 |
| AoE - Rectangle | modifier | 5 | 3.8 | 7.5 | 30.0 | 16.4 | 1.00 | 4.62 | 1.00 / 4.62 / 2.49 |
| Armor-Piercer Tip | modifier | 1 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Corrosion | status | 1 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Corrosion | status | 5 | 3.8 | 7.5 | 6.5 | 6.6 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Delay Line | pathing | 1 | 3.6 | 7.3 | 6.3 | 6.6 | 0.97 | 0.96 | 0.97 / 0.96 / 1.00 |
| Delay Line | pathing | 5 | 3.4 | 6.9 | 6.1 | 6.5 | 0.92 | 0.94 | 0.92 / 0.94 / 0.99 |
| Cleaver | mitosis | 1 | 3.4 | 6.7 | 5.3 | 9.6 | 0.89 | 0.81 | 0.89 / 0.81 / 1.47 |
| Capacitor | damage | 1 | 3.3 | 6.6 | 6.8 | 9.6 | 0.88 | 1.04 | 0.88 / 1.04 / 1.47 |
| Orbit | modifier | 1 | 3.1 | 6.3 | 0.0 | 5.5 | 0.83 | 0.00 | 0.83 / 0.00 / 0.83 |
| Random Curve | modifier | 1 | 2.1 | 4.3 | 3.9 | 6.0 | 0.57 | 0.60 | 0.57 / 0.60 / 0.91 |
| Mine | modifier | 1 | 1.9 | 3.9 | 3.9 | 6.1 | 0.52 | 0.60 | 0.52 / 0.60 / 0.94 |
| Mine | modifier | 5 | 1.9 | 3.9 | 3.5 | 6.1 | 0.52 | 0.54 | 0.52 / 0.54 / 0.93 |
| Curving Right | modifier | 1 | 1.9 | 3.8 | 1.5 | 5.5 | 0.50 | 0.23 | 0.50 / 0.23 / 0.83 |
| Orbit | modifier | 5 | 0.0 | 0.0 | 0.0 | 5.5 | 0.00 | 0.00 | 0.00 / 0.00 / 0.83 |

Category check, L1 big-target "x ref" against the category median (target 0.6-1.6; specialists may be lower if they win their niche), and L5 / L1 (target <= 4):

| block | cat | L1 x ref | / cat median | best niche (x ref) | L5/L1 big | flag |
|---|---|---|---|---|---|---|
| Turn Left | pathing | 0.50 | 0.50 | 0.49 | 1.00 | LOW (no niche) |
| Turn Right | pathing | 0.50 | 0.50 | 0.54 | 1.00 | LOW (no niche) |
| Splitter 2 | pathing | 1.00 | 1.00 | 1.00 | 1.20 |  |
| Splitter 3 | pathing | 1.50 | 1.50 | 1.47 | 1.20 |  |
| Alternator | pathing | 1.00 | 1.00 | 1.00 | 1.20 |  |
| Random Router | pathing | 0.50 | 0.50 | 0.48 | 1.36 | LOW (no niche) |
| Delay Line | pathing | 0.97 | 0.97 | 1.00 | 0.95 |  |
| Flat + | damage | 1.50 | 1.14 | 1.50 | 2.33 |  |
| Percent × | damage | 1.50 | 1.14 | 1.50 | 2.33 |  |
| Lucky Strike | damage | 1.34 | 1.02 | 1.37 | 1.00 |  |
| Jackpot | damage | 1.29 | 0.98 | 1.99 | 1.00 |  |
| Gambler’s Gate | damage | 1.80 | 1.37 | 1.48 | 1.00 |  |
| Overclock | damage | 1.24 | 0.94 | 1.47 | 1.24 |  |
| Capacitor | damage | 0.88 | 0.67 | 1.47 | 1.40 |  |
| Executioner | damage | 1.13 | 0.86 | 2.53 | 1.00 |  |
| Fission Catalyst | mitosis | 1.00 | 1.00 | 1.95 | 1.00 |  |
| Cauterize | mitosis | 1.00 | 1.00 | 5.70 | 1.00 |  |
| Cleaver | mitosis | 0.89 | 0.89 | 1.47 | 1.12 |  |
| Culling Bolt | mitosis | 1.61 | 1.61 | 1.00 | 1.28 | HIGH |
| Residue Seed | mitosis | 1.07 | 1.07 | 2.17 | 1.07 |  |
| Overkill Spill | mitosis | 1.00 | 1.00 | 3.58 | 1.00 |  |
| Piercing | modifier | 1.00 | 1.00 | 1.01 | 4.37 | L5 STEEP |
| Bouncing | modifier | 1.12 | 1.12 | 1.88 | 1.04 |  |
| AoE - Circle | modifier | 1.00 | 1.00 | 3.85 | 1.00 |  |
| Shield-Breaker | modifier | 1.47 | 1.47 | 1.62 | 1.00 |  |
| Pure Converter | modifier | 1.00 | 1.00 | 1.00 | 1.00 |  |
| Boomerang | modifier | 1.13 | 1.13 | 1.92 | 1.81 |  |
| Orbit | modifier | 0.83 | 0.83 | 0.83 | 0.00 |  |
| Chain Lightning | modifier | 1.00 | 1.00 | 2.24 | 1.00 |  |
| Mine | modifier | 0.52 | 0.52 | 0.94 | 1.00 | LOW (no niche) |
| Gravity Well | modifier | 1.02 | 1.02 | 1.89 | 1.00 |  |
| Curving Right | modifier | 0.50 | 0.50 | 0.83 | 1.00 | LOW (no niche) |
| Random Curve | modifier | 0.57 | 0.57 | 0.91 | 1.00 | LOW (no niche) |
| Homing | modifier | 1.00 | 1.00 | 1.47 | 1.00 |  |
| AoE - Rectangle | modifier | 1.00 | 1.00 | 2.69 | 1.00 |  |
| Fork on Impact | modifier | 1.03 | 1.03 | 1.90 | 1.00 |  |
| Armor-Piercer Tip | modifier | 1.00 | 1.00 | 1.00 | 1.00 |  |
| Ignite | status | 1.07 | 0.93 | 1.03 | 1.07 |  |
| Frostbite | status | 1.23 | 1.07 | 1.00 | 1.10 |  |
| Corrosion | status | 1.00 | 0.87 | 1.00 | 1.00 |  |
| Static Charge | status | 1.34 | 1.17 | 1.47 | 1.30 |  |

## B. Best circuits per hull (seeded hill-climb, 6 restarts x 900 mutations per search)

Reference search: every block at the level, at most 2 copies of any block. Free search: up to 8 copies. Each search's best 20 (by its score: estimate x engine factors, diminishing) are benched on the engine and the top 5 by the engine are shown. Engine = mixed HP/s (mean of big, cluster, split).

### dart L1: reference median 1.6 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 2.3 | 1.7 | 0.9 | 2.6 | 1.6 | 1.03 | 300 | G > AoE - Circle > E |
| ref 2 | 2.6 | 1.6 | 0.9 | 0.7 | 3.4 | 1.00 | 500 | G > Cauterize > E |
| ref 3 | 1.8 | 1.6 | 1.1 | 2.2 | 1.7 | 1.00 | 800 | G > Residue Seed > E |
| ref 4 | 2.0 | 1.6 | 1.8 | 1.3 | 1.7 | 0.97 | 0 | G > Flat + > E |
| ref 5 | 1.9 | 1.3 | 0.9 | 1.4 | 1.7 | 0.80 | 300 | G > AoE - Rectangle > E |
| free 1 | 2.3 | 1.7 | 0.9 | 2.6 | 1.6 | 1.03 | 300 | G > AoE - Circle > E |
| free 2 | 2.6 | 1.6 | 0.9 | 0.7 | 3.4 | 1.00 | 500 | G > Cauterize > E |
| free 3 | 1.9 | 1.6 | 0.9 | 0.7 | 3.4 | 1.00 | 500 | G > Overkill Spill > E |
| free 4 | 1.8 | 1.6 | 1.1 | 2.2 | 1.7 | 1.00 | 800 | G > Residue Seed > E |
| free 5 | 2.0 | 1.6 | 1.8 | 1.3 | 1.7 | 0.97 | 0 | G > Flat + > E |

### dart L5: reference median 2.3 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 6.0 | 4.8 | 5.3 | 3.9 | 5.1 | 2.07 | 2243 | G > Flat + L5 > E |
| ref 2 | 3.5 | 2.8 | 3.1 | 2.3 | 3.0 | 1.21 | 4606 | G > Percent × L5 > E |
| ref 3 | 3.1 | 2.3 | 3.9 | 1.4 | 1.7 | 1.00 | 9594 | G > Piercing L5 > E |
| ref 4 | 2.5 | 2.2 | 2.2 | 2.3 | 2.1 | 0.95 | 19188 | G > Boomerang L5 > E |
| ref 5 | 2.7 | 1.8 | 0.9 | 2.9 | 1.7 | 0.79 | 11513 | G > AoE - Circle L5 > E |
| free 1 | 6.0 | 4.8 | 5.3 | 3.9 | 5.1 | 2.07 | 2243 | G > Flat + L5 > E |
| free 2 | 3.5 | 2.8 | 3.1 | 2.3 | 3.0 | 1.21 | 4606 | G > Percent × L5 > E |
| free 3 | 2.0 | 2.8 | 1.4 | 3.6 | 3.4 | 1.21 | 30701 | G > Residue Seed L5 > E |
| free 4 | 3.1 | 2.3 | 3.9 | 1.4 | 1.7 | 1.00 | 9594 | G > Piercing L5 > E |
| free 5 | 2.5 | 2.2 | 2.2 | 2.3 | 2.1 | 0.95 | 19188 | G > Boomerang L5 > E |

### twin L1: reference median 15.6 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 20.5 | 17.1 | 7.5 | 6.5 | 37.4 | 1.10 | 570 | G > Flat + > Cauterize > E |
| ref 2 | 20.5 | 17.1 | 7.5 | 6.5 | 37.4 | 1.10 | 570 | G > Cauterize > Flat + > E |
| ref 3 | 15.4 | 15.6 | 6.8 | 4.7 | 35.4 | 1.00 | 750 | G > Cauterize > Gambler’s Gate > E |
| ref 4 | 15.4 | 15.6 | 6.8 | 4.7 | 35.4 | 1.00 | 750 | G > Gambler’s Gate > Cauterize > E |
| ref 5 | 18.4 | 15.3 | 7.5 | 25.0 | 13.4 | 0.98 | 370 | G > Flat + > AoE - Circle > E |
| free 1 | 20.5 | 17.1 | 7.5 | 6.5 | 37.4 | 1.10 | 570 | G > Flat + > Cauterize > E |
| free 2 | 20.5 | 17.1 | 7.5 | 6.5 | 37.4 | 1.10 | 570 | G > Cauterize > Flat + > E |
| free 3 | 18.4 | 15.3 | 7.5 | 25.0 | 13.4 | 0.98 | 370 | G > Flat + > AoE - Circle > E |
| free 4 | 18.4 | 15.3 | 7.5 | 25.0 | 13.4 | 0.98 | 370 | G > AoE - Circle > Flat + > E |
| free 5 | 15.4 | 12.9 | 5.6 | 4.9 | 28.1 | 0.82 | 690 | G > Percent × > Cauterize > E |

### twin L5: reference median 64.5 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 84.0 | 72.0 | 78.8 | 68.3 | 69.0 | 1.12 | 6919 | G > Flat + L5 > Percent × L5 > E |
| ref 2 | 73.8 | 64.5 | 98.4 | 56.6 | 38.4 | 1.00 | 11907 | G > Flat + L5 > Piercing L5 > E |
| ref 3 | 73.8 | 64.5 | 98.4 | 56.6 | 38.4 | 1.00 | 11907 | G > Piercing L5 > Flat + L5 > E |
| ref 4 | 64.9 | 53.9 | 22.5 | 90.0 | 49.1 | 0.84 | 13826 | G > Flat + L5 > AoE - Rectangle L5 > E |
| ref 5 | 64.2 | 53.4 | 22.5 | 88.5 | 49.1 | 0.83 | 13826 | G > AoE - Circle L5 > Flat + L5 > E |
| free 1 | 84.0 | 72.0 | 78.8 | 68.3 | 69.0 | 1.12 | 6919 | G > Flat + L5 > Percent × L5 > E |
| free 2 | 73.8 | 64.5 | 98.4 | 56.6 | 38.4 | 1.00 | 11907 | G > Piercing L5 > Flat + L5 > E |
| free 3 | 73.8 | 64.5 | 98.4 | 56.6 | 38.4 | 1.00 | 11907 | G > Flat + L5 > Piercing L5 > E |
| free 4 | 64.9 | 53.9 | 22.5 | 90.0 | 49.1 | 0.84 | 13826 | G > AoE - Rectangle L5 > Flat + L5 > E |
| free 5 | 64.2 | 53.4 | 22.5 | 88.5 | 49.1 | 0.83 | 13826 | G > AoE - Circle L5 > Flat + L5 > E |

### prong L1: reference median 17.1 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1200 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| ref 2 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1400 | G > Splitter 3 > { E | Cauterize > Splitter 2 > E } |
| ref 3 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1613 | G > Splitter 3 > { E | Cauterize > Splitter 3 > E } |
| ref 4 | 13.2 | 11.7 | 7.5 | 14.9 | 12.7 | 0.68 | 1200 | G > Splitter 3 > { E | AoE - Circle > Splitter 2 > E } |
| ref 5 | 13.2 | 11.7 | 7.5 | 14.9 | 12.7 | 0.68 | 1000 | G > Splitter 3 > { E | AoE - Circle > Turn Left > E } |
| free 1 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1200 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| free 2 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1613 | G > Splitter 3 > { E | Cauterize > Splitter 3 > E } |
| free 3 | 14.3 | 17.1 | 7.5 | 6.4 | 37.4 | 1.00 | 1400 | G > Splitter 3 > { E | Cauterize > Splitter 2 > E } |
| free 4 | 13.2 | 11.7 | 7.5 | 14.9 | 12.7 | 0.68 | 1000 | G > Splitter 3 > { E | AoE - Circle > Turn Left > E } |
| free 5 | 13.2 | 11.7 | 7.5 | 14.9 | 12.7 | 0.68 | 1413 | G > Splitter 3 > { E | AoE - Circle > Splitter 3 > E } |

### prong L5: reference median 24.6 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 34.6 | 29.6 | 32.4 | 28.0 | 28.4 | 1.20 | 16438 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| ref 2 | 34.6 | 29.6 | 32.4 | 28.0 | 28.4 | 1.20 | 23700 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 2 L5 > E } |
| ref 3 | 29.6 | 24.6 | 27.0 | 21.4 | 25.4 | 1.00 | 16281 | G > Splitter 3 L5 > { E | Flat + L5 > Turn Left L3 > E } |
| ref 4 | 17.1 | 20.6 | 9.0 | 7.8 | 45.0 | 0.84 | 33226 | G > Splitter 3 L5 > { E | Cauterize L5 > Turn Left L3 > E } |
| ref 5 | 24.0 | 20.6 | 22.5 | 19.5 | 19.7 | 0.84 | 2593 | G > Flat + L5 > E |
| free 1 | 34.6 | 29.6 | 32.4 | 28.0 | 28.4 | 1.20 | 23700 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 2 L5 > E } |
| free 2 | 34.6 | 29.6 | 32.4 | 28.0 | 28.4 | 1.20 | 16438 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| free 3 | 29.6 | 24.6 | 27.0 | 21.4 | 25.4 | 1.00 | 16281 | G > Splitter 3 L5 > { E | Flat + L5 > Turn Left L3 > E } |
| free 4 | 22.5 | 21.6 | 28.1 | 19.2 | 17.6 | 0.88 | 23789 | G > Splitter 3 L5 > { E | Piercing L5 > Splitter 3 L5 > E } |
| free 5 | 22.5 | 21.6 | 28.1 | 19.2 | 17.6 | 0.88 | 31051 | G > Splitter 3 L5 > { E | Piercing L5 > Splitter 2 L5 > E } |

### fan L1: reference median 261 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 263 | 286 | 135 | 288 | 435 | 1.09 | 12706 | G > Jackpot > Splitter 3 > { Executioner > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Fission Catalyst > E | Bouncing > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Shield-Breaker > Splitter 2 > { Static Charge > AoE - Circle > Flat + > Culling Bolt > Flat + > Percent × > E | Frostbite } } |
| ref 2 | 263 | 286 | 135 | 288 | 435 | 1.09 | 11906 | G > Jackpot > Splitter 3 > { Executioner > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Fission Catalyst > E | Bouncing > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Shield-Breaker > Splitter 2 > { Static Charge > AoE - Circle > Flat + > Culling Bolt > Flat + > Percent × > E | ? } } |
| ref 3 | 234 | 261 | 65.8 | 442 | 275 | 1.00 | 13087 | G > Overkill Spill > Splitter 3 > { Cauterize > Culling Bolt > Turn Right > Jackpot > Chain Lightning > Percent × > Fork on Impact > AoE - Rectangle > Flat + > E | Lucky Strike > Residue Seed > AoE - Circle > Gambler’s Gate > Executioner > Percent × > E | Gravity Well > Overclock > Turn Left > Fission Catalyst > Flat + > Executioner > Boomerang > Overclock > Cauterize > E } |
| ref 4 | 309 | 208 | 73.7 | 234 | 315 | 0.80 | 10896 | G > Jackpot > Splitter 3 > { Executioner > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Lucky Strike > E | Bouncing > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Shield-Breaker > Splitter 2 > { Static Charge > AoE - Circle > Flat + > AoE - Rectangle > Flat + > Percent × > E | Static Charge } } |
| ref 5 | 309 | 208 | 73.7 | 234 | 315 | 0.80 | 10660 | G > Jackpot > Splitter 3 > { Executioner > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Lucky Strike > E | Bouncing > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Shield-Breaker > Splitter 2 > { Static Charge > AoE - Circle > Flat + > AoE - Rectangle > Flat + > Percent × > E | AoE - Rectangle } } |
| free 1 | 1962 | 584 | 131 | 804 | 819 | 2.24 | 20171 | G > AoE - Circle > Splitter 3 > { Jackpot > Bouncing > { Splitter 2 > { Mine | Jackpot > Cauterize > { Percent × > Residue Seed > { Jackpot > Turn Right > Shield-Breaker > Fission Catalyst > Gambler’s Gate > { Gambler’s Gate > Boomerang > Splitter 3 > { E | Splitter 2 > Capacitor > AoE - Circle > Turn Right > Overkill Spill > { Fork on Impact > Delay Line > Gambler’s Gate > { Orbit > { Cauterize > { ... | Gravity Well } | Bouncing > { ... | Curving Right } } | Flat + > Splitter 3 > { Boomerang > Chain Lightning > { Residue Seed > { ... | ? } | Curving Right > Orbit > { ... | ... } } | Percent × > { Gambler’s Gate > { ... | E } | Fork on Impact > Turn Left > Chain Lightning > { ... | ... } } | Turn Left > Splitter 3 > { Percent × > { ... | ... } | Gambler’s Gate > ... | Flat + > Ignite > { Percent × > Executioner > Overkill Spill > { ... | Flat + > Splitter 2 > { Shield-Breaker | Residue Seed > Gravity Well > Splitter 3 > { ... | Flat + > Gambler’s Gate > { ... | ... } } } } | Capacitor > ... } } } } | ... } | Ignite > { ... | ... } } | ... } | ... } | ... } } | ... } | ... } |
| free 2 | 1484 | 521 | 121 | 742 | 699 | 1.99 | 19958 | G > AoE - Circle > Splitter 3 > { Jackpot > Bouncing > { Splitter 2 > { Mine | Jackpot > Cauterize > { Percent × > Residue Seed > { Jackpot > Turn Right > Shield-Breaker > Fission Catalyst > Gambler’s Gate > { Gambler’s Gate > Boomerang > Splitter 3 > { E | Splitter 2 > Capacitor > AoE - Circle > AoE - Circle > Turn Right > Overkill Spill > { Fork on Impact > Delay Line > Gambler’s Gate > { Orbit > { Cauterize > { ... | Armor-Piercer Tip } | Bouncing > { ... | Curving Right } } | Flat + > Splitter 3 > { Boomerang > Chain Lightning > { Residue Seed > { ... | ? } | Curving Right > Orbit > { ... | ... } } | Percent × > { Gambler’s Gate > { ... | E } | Fork on Impact > Turn Left > Chain Lightning > { ... | ... } } | Turn Left > Splitter 3 > { Percent × > { ... | ... } | Gambler’s Gate > ... | Flat + > Ignite > { Armor-Piercer Tip > Executioner > Overkill Spill > { ... | Flat + > Splitter 2 > { Shield-Breaker | Residue Seed > Gravity Well > Splitter 3 > { ... | Flat + > ... } } } | Capacitor > ... } } } } | ... } | Ignite > { ... | ... } } | ... } | ... } | ... } } | ... } | ... } |
| free 3 | 1484 | 521 | 121 | 742 | 699 | 1.99 | 19540 | G > AoE - Circle > Splitter 3 > { Jackpot > Bouncing > { Splitter 2 > { Mine | Jackpot > Cauterize > { Percent × > Residue Seed > { Jackpot > Turn Right > Shield-Breaker > Fission Catalyst > Gambler’s Gate > { Gambler’s Gate > Boomerang > Splitter 3 > { E | Splitter 2 > Capacitor > AoE - Circle > Turn Right > Overkill Spill > { Fork on Impact > Delay Line > Gambler’s Gate > { Orbit > { Cauterize > { ... | Armor-Piercer Tip } | Bouncing > { ... | Curving Right } } | Flat + > Splitter 3 > { Boomerang > Chain Lightning > { Residue Seed > { ... | ? } | Curving Right > Orbit > { ... | ... } } | Percent × > { Gambler’s Gate > { ... | E } | Fork on Impact > Turn Left > Chain Lightning > { ... | ... } } | Turn Left > Splitter 3 > { Percent × > { ... | ... } | Gambler’s Gate > ... | Flat + > Ignite > { Armor-Piercer Tip > Executioner > Overkill Spill > { ... | Flat + > Splitter 2 > { Shield-Breaker | Residue Seed > Gravity Well > Splitter 3 > { ... | Flat + > Gambler’s Gate > { ... | ... } } } } | Capacitor > ... } } } } | ... } | Ignite > { ... | ... } } | ... } | ... } | ... } } | ... } | ... } |
| free 4 | 1484 | 521 | 121 | 742 | 699 | 1.99 | 20224 | G > AoE - Circle > Splitter 3 > { Jackpot > Bouncing > { Splitter 2 > { Mine | Jackpot > Cauterize > { Percent × > Residue Seed > { Jackpot > Turn Right > Shield-Breaker > Fission Catalyst > Gambler’s Gate > { Gambler’s Gate > Boomerang > Splitter 3 > { E | Splitter 2 > Capacitor > AoE - Circle > Turn Right > Overkill Spill > { Fork on Impact > Delay Line > Gambler’s Gate > { Orbit > { Cauterize > { ... | Gravity Well } | Bouncing > { ... | Curving Right } } | Flat + > Splitter 3 > { Boomerang > Chain Lightning > { Residue Seed > { ... | ? } | Curving Right > Orbit > { ... | ... } } | Percent × > { Gambler’s Gate > { ... | E } | Fork on Impact > Turn Left > Chain Lightning > { ... | ... } } | Turn Left > Splitter 3 > { Percent × > { ... | ... } | Gambler’s Gate > ... | Flat + > Ignite > { Armor-Piercer Tip > Executioner > Overkill Spill > { ... | Flat + > Splitter 2 > { Shield-Breaker | Residue Seed > Gravity Well > Splitter 3 > { ... | Flat + > Gambler’s Gate > { ... | ... } } } } | Capacitor > ... } } } } | ... } | Ignite > { ... | ... } } | ... } | ... } | ... } } | ... } | ... } |
| free 5 | 1099 | 215 | 50.6 | 264 | 329 | 0.82 | 15582 | G > AoE - Circle > Splitter 3 > { Jackpot > Bouncing > Splitter 2 > { Cleaver | Jackpot > Cauterize > Percent × > Residue Seed > Jackpot > Turn Right > Shield-Breaker > Fission Catalyst > Gambler’s Gate > { Fork on Impact > Boomerang > Splitter 3 > { E | Splitter 2 > Capacitor > AoE - Circle > AoE - Circle > Static Charge > Shield-Breaker > Gambler’s Gate | Ignite > Armor-Piercer Tip > Executioner > Overkill Spill > Flat + > Splitter 2 > { Shield-Breaker > ... | Residue Seed > Gravity Well > Splitter 3 > { ... | Flat + > Gambler’s Gate > Flat + > AoE - Circle > Percent × > Gambler’s Gate > { ... | E } } } } | ... } } | ... } |

### fan L5: reference median 3757 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 1915 | 4543 | 2247 | 5123 | 6260 | 1.21 | 273023 | G > Cauterize L5 > Splitter 3 L5 > { Gambler’s Gate L3 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > Overclock L5 > Overkill Spill L5 > AoE - Circle L5 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Bouncing L5 > Overclock L5 > E | Culling Bolt L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Gravity Well L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| ref 2 | 1806 | 4543 | 2247 | 5123 | 6260 | 1.21 | 280698 | G > Cauterize L5 > Splitter 3 L5 > { Gambler’s Gate L3 > Cleaver L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > Overclock L5 > Overkill Spill L5 > AoE - Circle L5 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Bouncing L5 > Overclock L5 > E | Culling Bolt L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Gravity Well L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| ref 3 | 2143 | 3757 | 1651 | 5323 | 4296 | 1.00 | 263783 | G > Cauterize L5 > Splitter 3 L5 > { Gambler’s Gate L3 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > Overclock L5 > Overkill Spill L5 > AoE - Circle L5 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Percent × L5 > AoE - Rectangle L5 > Overclock L5 > E | Culling Bolt L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Gravity Well L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| ref 4 | 2449 | 3390 | 1641 | 1619 | 6911 | 0.90 | 253379 | G > Bouncing L5 > Splitter 3 L5 > { Static Charge L5 > Armor-Piercer Tip L3 > Turn Right L3 > Flat + L5 > Gambler’s Gate L3 > Piercing L5 > AoE - Rectangle L5 > Percent × L5 > E | Ignite L5 > Chain Lightning L5 > AoE - Circle L5 > Cauterize L5 > Overclock L5 > Frostbite L5 > E | Executioner L5 > Piercing L5 > Turn Left L3 > Flat + L5 > Jackpot L3 > Percent × L5 > Gambler’s Gate L3 > Jackpot L3 > E } |
| ref 5 | 2148 | 3331 | 2482 | 3107 | 4405 | 0.89 | 252270 | G > Cauterize L5 > Splitter 3 L5 > { Gambler’s Gate L3 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > Overclock L5 > Overkill Spill L5 > AoE - Circle L5 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Percent × L5 > AoE - Rectangle L5 > Overclock L5 > E | Culling Bolt L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Static Charge L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| free 1 | 40207 | 38881 | 39181 | 43648 | 33814 | 10.35 **OUTLIER** | 337864 | G > Splitter 3 L5 > { Cauterize L5 > Piercing L5 > Cauterize L5 | Splitter 3 L5 > { Percent × L5 > Shield-Breaker L3 > Splitter 2 L5 > { Piercing L5 > ... | Splitter 3 L5 > { Gambler’s Gate L3 | Overkill Spill L5 > Gambler’s Gate L3 > Overclock L5 > Percent × L5 > Percent × L5 > E | AoE - Rectangle L5 > Gambler’s Gate L3 > Culling Bolt L5 > { Splitter 2 L5 > { Boomerang L5 > Residue Seed L5 > AoE - Rectangle L5 > Gambler’s Gate L3 | Splitter 2 L5 > { Overclock L5 > Turn Left L3 > Percent × L5 > { Percent × L5 > Boomerang L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Overclock L5 > E | Delay Line L5 } | Splitter 3 L5 > { ... | Culling Bolt L5 > { ... | Percent × L5 > Frostbite L5 > AoE - Circle L5 > Jackpot L3 > Percent × L5 > E } | Splitter 2 L5 > { ... | ... | Splitter 2 L5 > { ... | ... | Overkill Spill L5 > Percent × L5 > { ... | ... } } | Corrosion L5 > Gambler’s Gate L3 > Random Curve L3 > Fission Catalyst L5 } } | ... | ... } | ... } | ... } } } | ... | ... } | Corrosion L5 > ... } |
| free 2 | 40207 | 38881 | 39181 | 43648 | 33814 | 10.35 **OUTLIER** | 339053 | G > Splitter 3 L5 > { Cauterize L5 > Piercing L5 > Cauterize L5 | Splitter 3 L5 > { Percent × L5 > Shield-Breaker L3 > Splitter 2 L5 > { Piercing L5 > ... | Splitter 3 L5 > { Gambler’s Gate L3 | Overkill Spill L5 > Gambler’s Gate L3 > Overclock L5 > Percent × L5 > Percent × L5 > E | AoE - Rectangle L5 > Gambler’s Gate L3 > Culling Bolt L5 > { Splitter 2 L5 > { Boomerang L5 > Residue Seed L5 > AoE - Rectangle L5 > Gambler’s Gate L3 | Splitter 2 L5 > { Overclock L5 > Turn Left L3 > Percent × L5 > { Percent × L5 > Boomerang L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Overclock L5 > E | Random Router L5 > { Boomerang L5 > AoE - Rectangle L5 | Fission Catalyst L5 } } | Splitter 3 L5 > { ... | Culling Bolt L5 > { ... | Percent × L5 > Frostbite L5 > AoE - Circle L5 > Jackpot L3 > Percent × L5 > E } | Splitter 2 L5 > { ... | ... | Splitter 2 L5 > { ... | ... | Overkill Spill L5 > Percent × L5 > { ... | ... } } | Corrosion L5 > Gambler’s Gate L3 > Random Curve L3 > Fission Catalyst L5 } } | ... | ... } | ... } | ... } } } | ... | ... } | Corrosion L5 > ... } |
| free 3 | 40207 | 38881 | 39181 | 43648 | 33814 | 10.35 **OUTLIER** | 338357 | G > Splitter 3 L5 > { Cauterize L5 > Piercing L5 > Cauterize L5 | Splitter 3 L5 > { Percent × L5 > Shield-Breaker L3 > Splitter 2 L5 > { Piercing L5 > ... | Splitter 3 L5 > { Gambler’s Gate L3 | Overkill Spill L5 > Gambler’s Gate L3 > Overclock L5 > Percent × L5 > Percent × L5 > E | AoE - Rectangle L5 > Gambler’s Gate L3 > Culling Bolt L5 > { Splitter 2 L5 > { Boomerang L5 > Residue Seed L5 > AoE - Rectangle L5 > Gambler’s Gate L3 | Splitter 2 L5 > { Overclock L5 > Turn Left L3 > Percent × L5 > { Percent × L5 > Boomerang L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Overclock L5 > E | Random Router L5 > { AoE - Rectangle L5 | Fission Catalyst L5 } } | Splitter 3 L5 > { ... | Culling Bolt L5 > { ... | Percent × L5 > Frostbite L5 > AoE - Circle L5 > Jackpot L3 > Percent × L5 > E } | Splitter 2 L5 > { ... | ... | Splitter 2 L5 > { ... | ... | Overkill Spill L5 > Percent × L5 > { ... | ... } } | Corrosion L5 > Gambler’s Gate L3 > Random Curve L3 > Fission Catalyst L5 } } | ... | ... } | ... } | ... } } } | ... | ... } | Corrosion L5 > ... } |
| free 4 | 40207 | 38881 | 39181 | 43648 | 33814 | 10.35 **OUTLIER** | 337904 | G > Splitter 3 L5 > { Cauterize L5 > Piercing L5 > Cauterize L5 | Splitter 3 L5 > { Percent × L5 > Shield-Breaker L3 > Splitter 2 L5 > { Piercing L5 > ... | Splitter 3 L5 > { Gambler’s Gate L3 | Overkill Spill L5 > Gambler’s Gate L3 > Overclock L5 > Percent × L5 > Percent × L5 > E | AoE - Rectangle L5 > Gambler’s Gate L3 > Culling Bolt L5 > { Splitter 2 L5 > { Boomerang L5 > Residue Seed L5 > AoE - Rectangle L5 > Gambler’s Gate L3 | Splitter 2 L5 > { Overclock L5 > { Turn Left L3 > Percent × L5 > { Percent × L5 > Boomerang L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Overclock L5 > E | Random Router L5 > { AoE - Rectangle L5 | Fission Catalyst L5 } } | Overkill Spill L5 > { Percent × L5 > { ... | ... } | AoE - Circle L5 > Jackpot L3 > Jackpot L3 > ? } } | Splitter 3 L5 > { ... | Culling Bolt L5 > { ... | Percent × L5 > Frostbite L5 > AoE - Circle L5 > Jackpot L3 > Percent × L5 > E } | Splitter 2 L5 > { ... | ... | Splitter 2 L5 > { ... | ... | Overkill Spill L5 > { ... | ... } } | Corrosion L5 > Splitter 2 L5 > Overclock L5 > { ... | ... } } } | ... | ... } | ... } | ... } } } | ... | ... } | Corrosion L5 > ... } |
| free 5 | 40207 | 38881 | 39181 | 43648 | 33814 | 10.35 **OUTLIER** | 307203 | G > Splitter 3 L5 > { Cauterize L5 > Piercing L5 > Cauterize L5 | Splitter 3 L5 > { Percent × L5 > Shield-Breaker L3 > Splitter 2 L5 > { Piercing L5 > ... | Splitter 3 L5 > { Gambler’s Gate L3 | Overkill Spill L5 > Gambler’s Gate L3 > Overclock L5 > Percent × L5 > Percent × L5 > E | AoE - Rectangle L5 > Gambler’s Gate L3 > Culling Bolt L5 > { Splitter 2 L5 > { Boomerang L5 > AoE - Rectangle L5 > Gambler’s Gate L3 | Splitter 2 L5 > { Overclock L5 > { Turn Left L3 > Percent × L5 > { Percent × L5 > Boomerang L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Overclock L5 > E | Random Router L5 > { AoE - Rectangle L5 | Fission Catalyst L5 } } | Overkill Spill L5 > { Percent × L5 > { ... | ... } | AoE - Circle L5 > Jackpot L3 > Jackpot L3 > ? } } | Splitter 3 L5 > { ... | Culling Bolt L5 > { ... | Percent × L5 > Frostbite L5 > AoE - Circle L5 > Jackpot L3 > Percent × L5 > E } | Splitter 2 L5 > { ... | ... | Splitter 2 L5 > { ... | ... | Overkill Spill L5 > { ... | ... } } | Corrosion L5 > Splitter 2 L5 > Overclock L5 > { ... | ... } } } | ... | ... } | ... } | ... } } } | ... | ... } | Corrosion L5 > ... } |

### shuttle L1: reference median 142 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 322 | 169 | 42.8 | 238 | 228 | 1.20 | 6023 | G > Flat + > Turn Right > Residue Seed > Cauterize > Turn Left > Flat + > AoE - Circle > Percent × > Overclock > Overclock > Percent × > E |
| ref 2 | 322 | 169 | 42.8 | 238 | 228 | 1.20 | 6373 | G > Flat + > Turn Right > Residue Seed > Cauterize > Splitter 3 > Flat + > AoE - Circle > Percent × > Overclock > Overclock > Percent × > E |
| ref 3 | 329 | 142 | 47.1 | 151 | 228 | 1.00 | 5902 | G > Overkill Spill > Turn Right > AoE - Rectangle > Flat + > Turn Left > Overclock > Gambler’s Gate > Overclock > Cauterize > Percent × > Gambler’s Gate > E |
| ref 4 | 327 | 120 | 47.1 | 85.7 | 228 | 0.85 | 6802 | G > Overkill Spill > Turn Right > Chain Lightning > Flat + > Turn Left > Overclock > Gambler’s Gate > Overclock > Cauterize > Percent × > Gambler’s Gate > E |
| ref 5 | 321 | 109 | 55.2 | 41.2 | 232 | 0.77 | 6532 | G > Flat + > Turn Right > Overclock > Percent × > Splitter 2 > Executioner > Overkill Spill > Percent × > Overclock > Cauterize > Gambler’s Gate > E |
| free 1 | 395 | 175 | 137 | 89.7 | 300 | 1.24 | 5201 | G > AoE - Circle > Turn Right > Flat + > Cauterize > Splitter 2 > Percent × > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Percent × > E |
| free 2 | 395 | 175 | 137 | 89.7 | 300 | 1.24 | 9472 | G > AoE - Circle > Splitter 3 > { Flat + > Bouncing > Turn Right > AoE - Rectangle > Fission Catalyst > ? | Frostbite > Gravity Well > Ignite > ? | Flat + > Cauterize > Splitter 2 > Percent × > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Percent × > E } |
| free 3 | 395 | 175 | 137 | 89.7 | 300 | 1.24 | 9222 | G > AoE - Circle > Splitter 3 > { Flat + > Turn Right > AoE - Rectangle > Fission Catalyst > ? | Frostbite > Gravity Well > Ignite > ? | Flat + > Cauterize > Splitter 2 > Percent × > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Percent × > E } |
| free 4 | 395 | 175 | 137 | 89.7 | 300 | 1.24 | 9472 | G > AoE - Circle > Splitter 3 > { Flat + > Turn Right > AoE - Rectangle > Fission Catalyst > Piercing | Frostbite > Gravity Well > Ignite > ? | Flat + > Cauterize > Splitter 2 > Percent × > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Percent × > E } |
| free 5 | 395 | 175 | 137 | 89.7 | 300 | 1.24 | 9422 | G > AoE - Circle > Splitter 3 > { Flat + > Turn Right > Mine > Fission Catalyst > ? | Frostbite > Gravity Well > Ignite > ? | Flat + > Cauterize > Splitter 2 > Percent × > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Percent × > E } |

### shuttle L5: reference median 10809 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 15147 | 10809 | 6201 | 4474 | 21751 | 1.00 | 152826 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > Cleaver L5 > ? | Random Curve L3 > Capacitor L5 > Overkill Spill L5 > ? | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| ref 2 | 15147 | 10809 | 6201 | 4474 | 21751 | 1.00 | 168176 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > Cleaver L5 > ? | Random Curve L3 > Capacitor L5 > Overkill Spill L5 > Homing L5 | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| ref 3 | 15147 | 10809 | 6201 | 4474 | 21751 | 1.00 | 167066 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > Cleaver L5 > ? | Capacitor L5 > Overkill Spill L5 > Homing L5 | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| ref 4 | 15147 | 10809 | 6201 | 4474 | 21751 | 1.00 | 147878 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > ? | Capacitor L5 > Overkill Spill L5 > Homing L5 | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| ref 5 | 15147 | 10809 | 6201 | 4474 | 21751 | 1.00 | 151716 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > ? | Capacitor L5 > Overkill Spill L5 > Cleaver L5 | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| free 1 | 8663332 | 1777581 | 895988 | 1444962 | 2991794 | 164.45 **OUTLIER** | 189506 | G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Piercing L5 > ? | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Alternator L5 > { Gambler’s Gate L3 > Splitter 2 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Percent × L5 > Fission Catalyst L5 > Overclock L5 > { ... | Homing L5 } | Alternator L5 > { ... | ... } } } | ... } } } | ... | ... } |
| free 2 | 8663332 | 651039 | 63784 | 510271 | 1379061 | 60.23 **OUTLIER** | 294156 | G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Delay Line L5 > Turn Right L3 > Ignite L5 > Fork on Impact L3 > Residue Seed L5 > Percent × L5 > Capacitor L5 > Delay Line L5 | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 3 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Delay Line L5 > Gambler’s Gate L3 > Orbit L5 > AoE - Rectangle L5 > Boomerang L5 > Overclock L5 > { ... | Static Charge L5 } | Splitter 3 L5 > { ... | ... } } } | ... } } } | ... | ... } |
| free 3 | 8663332 | 651039 | 63784 | 510271 | 1379061 | 60.23 **OUTLIER** | 305669 | G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Delay Line L5 > Turn Right L3 > Culling Bolt L5 > Fork on Impact L3 > Residue Seed L5 > Percent × L5 > Capacitor L5 > Delay Line L5 | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 3 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Delay Line L5 > Gambler’s Gate L3 > Orbit L5 > AoE - Rectangle L5 > Boomerang L5 > Overclock L5 > { ... | Static Charge L5 } | Splitter 3 L5 > { ... | ... } } } | ... } } } | ... | ... } |
| free 4 | 8663332 | 651039 | 63784 | 510271 | 1379061 | 60.23 **OUTLIER** | 304973 | G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Turn Right L3 > Culling Bolt L5 > Fork on Impact L3 > Residue Seed L5 > Percent × L5 > Capacitor L5 > Delay Line L5 | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 3 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Delay Line L5 > Gambler’s Gate L3 > Orbit L5 > AoE - Rectangle L5 > Boomerang L5 > Overclock L5 > { ... | Static Charge L5 } | Splitter 3 L5 > { ... | ... } } } | ... } } } | ... | ... } |
| free 5 | 8663332 | 651039 | 63784 | 510271 | 1379061 | 60.23 **OUTLIER** | 274272 | G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Turn Right L3 > Culling Bolt L5 > Fork on Impact L3 > Residue Seed L5 > Percent × L5 > Capacitor L5 > Delay Line L5 | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 3 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Delay Line L5 > Gambler’s Gate L3 > AoE - Rectangle L5 > Boomerang L5 > Overclock L5 > { ... | Static Charge L5 } | Splitter 3 L5 > { ... | ... } } } | ... } } } | ... | ... } |


## C. Progress: DPS a wall needs against the DPS a player could own

Income model: before tier N the player has played every tier t < N 3 times, destroying 50% of the wall per run (credits = 1.5 x the full-clear credits of each earlier tier; Free Fly income not counted). Owned DPS = the best circuit the searches met that the credits buy (hull + copies + upgrades), its wall score (estimate x the big/cluster engine factors; levels 1, 2, 3 and 5 searched). Hero level from 3 Free Fly Medals + one per earlier tier, all spent on hero levels, base +1 a level.
Pass DPS: the cheapest column carved while the wall crosses at max boost. Clear DPS: every block before the wall reaches a ship at the bottom. Target: owned / clear about 0.5-1 (clear in 2-4 runs), 2 = clears in one run.

| tier | pass DPS | clear DPS | credits so far | owned DPS (hero 0) | owned / clear | hero lvl | owned DPS with hero | with hero / clear | best affordable circuit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 1.1 | 9.1 | 0 | 2.0 | 0.22 | 0 | 2.0 | 0.22 | dart: G > Flat + > E |
| 5 | 0.5 | 10.2 | 447 | 20.0 | 1.95 | 3 | 48.5 | 4.73 | twin: G > Flat + > AoE - Circle > E |
| 10 | 1.1 | 18.9 | 1273 | 30.1 | 1.59 | 5 | 150 | 7.94 | twin: G > Percent × L3 > Percent × L3 > E |
| 20 | 6.6 | 52.6 | 4310 | 638 | 12.14 | 8 | 3880 | 73.82 | fan: G > Gambler’s Gate L2 > Percent × L2 > Percent × L2 > Percent × L2 > Percent × L2 > AoE - Rectangle L2 > Lucky Strike L2 > Jackpot L2 > E |
| 30 | 4.8 | 110 | 10575 | 17132 | 155.88 | 10 | 59962 | 545.57 | shuttle: G > Flat + L3 > Turn Right L3 > Percent × L3 > Percent × L3 > Splitter 2 L3 > Percent × L3 > Percent × L3 > Percent × L3 > Percent × L3 > AoE - Circle L3 > Jackpot L3 > E |
| 50 | 5.2 | 504 | 46751 | 182018 | 360.95 | 10 | 806070 | 1598.48 | fan: G > Shield-Breaker L2 > { Splitter 3 L2 > { Overclock L2 > { Flat + L2 > Splitter 2 L2 > { Frostbite L2 > Flat + L2 > Splitter 3 L2 > { Overclock L2 > { ... | Shield-Breaker L2 > { Shield-Breaker L2 > Ignite L2 > Splitter 3 L2 > { Cleaver L2 > Turn Left L2 > Alternator L2 > Flat + L2 > Percent × L2 > Armor-Piercer Tip L2 > Gambler’s Gate L2 > Lucky Strike L2 > Percent × L2 > Splitter 2 L2 > Frostbite L2 > ... | Percent × L2 > { Boomerang L2 > { ? | E } | E } } | Random Curve L2 > Gambler’s Gate L2 > { Flat + L2 > Percent × L2 > Overclock L2 > Chain Lightning L2 > Turn Left L2 > ... | Lucky Strike L2 > ... } } } | Shield-Breaker L2 > { ... | Bouncing L2 > Splitter 2 L2 > Overclock L2 > { Splitter 3 L2 > { Alternator L2 > { Splitter 3 L2 > { Overclock L2 > { ... | Turn Left L2 > Percent × L2 > { Gambler’s Gate L2 > Gambler’s Gate L2 > AoE - Circle L2 > Gambler’s Gate L2 > Boomerang L2 > { ... | ... } | Alternator L2 > { Overclock L2 > Jackpot L2 > Gambler’s Gate L2 > ? | AoE - Rectangle L2 > Executioner L2 } } } | Bouncing L2 > ... | Splitter 3 L2 > { ... | Homing L2 > { Percent × L2 > Gravity Well L2 > Overclock L2 > Percent × L2 > { ... | ... } | Shield-Breaker L2 > { ... | ... } } | Splitter 3 L2 > { ... | ... | ... | Alternator L2 > { ... | Lucky Strike L2 > Curving Right L2 > Armor-Piercer Tip L2 > ? | Homing L2 > { ... | ... } | Splitter 3 L2 > { ... | Static Charge L2 > Mine L2 > ? | Percent × L2 > { ... | ... } } } } } | ... } | ... | ... | ... } | ... | ... } | ... } } } | Gambler’s Gate L2 > { ... | ... } } | ... } | ... | ... } | ... } |
| 75 | 36.2 | 3820 | 236264 | 9759180 | 2554.60 | 10 | 107350985 | 28100.61 | shuttle: G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { ? | Percent × L5 > { Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > { Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 2 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Random Router L5 > { Percent × L5 > { ... | Culling Bolt L5 } | Jackpot L3 > { ... | AoE - Circle L5 > Piercing L5 > ... } } | Splitter 3 L5 > { ... | ... } } } | ... } } | ... } } | ... | ... } |
| 100 | 640 | 24006 | 1064027 | 9759180 | 406.54 | 10 | 107350985 | 4471.91 | shuttle: G > Percent × L5 > Splitter 3 L5 > { Splitter 3 L5 > { Delay Line L5 > Turn Right L3 > Ignite L5 > Fork on Impact L3 > Residue Seed L5 > Percent × L5 > Capacitor L5 > Delay Line L5 | Percent × L5 > Percent × L5 > AoE - Circle L5 > Gambler’s Gate L3 > Percent × L5 > Alternator L5 > { Jackpot L3 > Delay Line L5 | Overclock L5 > { Splitter 2 L5 > Overclock L5 > Gambler’s Gate L3 > Gambler’s Gate L3 > Jackpot L3 > Jackpot L3 > Splitter 3 L5 > { Gambler’s Gate L3 > Splitter 3 L5 > Piercing L5 > Gambler’s Gate L3 > Overclock L5 > Overclock L5 > Jackpot L3 > Jackpot L3 > E | Splitter 3 L5 > { ... | Delay Line L5 > Gambler’s Gate L3 > Orbit L5 > AoE - Rectangle L5 > Boomerang L5 > Overclock L5 > { ... | Static Charge L5 } | Splitter 3 L5 > { ... | ... } } } | ... } } } | ... | ... } |

## D. Free Fly bot (src/debug/freeflyBot.ts), mean of 3 seeds, cap 1500 s

Per hull: its best reference circuit (at most 2 copies of a block) at L1 and at L5. Target for a strong build: Dart 5, Twin 8, Prong 12, Fan 16, Shuttle 20.

| hull | L | wave reached | survived s | circuit |
|---|---|---|---|---|
| dart | 1 | 4.7 | 155 | G > AoE - Circle > E |
| dart | 5 | 7.3 | 268 | G > Flat + L5 > E |
| twin | 1 | 12.0 | 448 | G > Flat + > Cauterize > E |
| twin | 5 | 14.7 | 564 | G > Flat + L5 > Percent × L5 > E |
| prong | 1 | 12.0 | 451 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| prong | 5 | 12.0 | 451 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| fan | 1 | 23.3 | 909 | G > Jackpot > Splitter 3 > { Executioner > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Fission Catalyst > E | Bouncing > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Shield-Breaker > Splitter 2 > { Static Charge > AoE - Circle > Flat + > Culling Bolt > Flat + > Percent × > E | Frostbite } } |
| fan | 5 | 38.0 | 1500 | G > Cauterize L5 > Splitter 3 L5 > { Gambler’s Gate L3 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > Overclock L5 > Overkill Spill L5 > AoE - Circle L5 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Bouncing L5 > Overclock L5 > E | Culling Bolt L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Gravity Well L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| shuttle | 1 | 21.0 | 811 | G > Flat + > Turn Right > Residue Seed > Cauterize > Turn Left > Flat + > AoE - Circle > Percent × > Overclock > Overclock > Percent × > E |
| shuttle | 5 | 34.3 | 1345 | G > Flat + L5 > Splitter 3 L5 > { Chain Lightning L5 > Cleaver L5 > ? | Random Curve L3 > Capacitor L5 > Overkill Spill L5 > ? | Flat + L5 > Jackpot L3 > Turn Left L3 > Piercing L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |

By credits spent (best affordable circuit from the searches, hero level 0):

| credits | wave reached | survived s | circuit |
|---|---|---|---|
| 0 | 5.0 | 168 | dart: G > Flat + > E |
| 150 | 6.3 | 235 | twin: G > E |
| 500 | 11.0 | 409 | twin: G > Flat + L2 > Flat + L2 > E |
| 2000 | 12.0 | 477 | twin: G > Flat + L3 > Percent × L3 > E |
| 8000 | 30.7 | 1199 | fan: G > Flat + L3 > Percent × L3 > Percent × L3 > Gambler’s Gate L3 > AoE - Circle L3 > Percent × L3 > Percent × L3 > Percent × L3 > E |
| 30000 | 37.0 | 1463 | fan: G > Flat + L5 > Flat + L5 > Percent × L5 > Gambler’s Gate L3 > Percent × L5 > Percent × L5 > Piercing L5 > Percent × L5 > E |
