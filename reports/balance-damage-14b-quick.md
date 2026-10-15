# balance-damage, chunk 14b quick run (QUICK=1, diminishing rule removed)

For information only (no tuning). Quick mode searches 3 restarts x 300 mutations (the 14a after-report used 6 x 900), so its best circuits are weaker and noisier. Summary in DECISIONS 209 and the 14b report.

## A. Blocks on the reference circuit (engine HP removed per second)

Twin (4 pulses/s): generator -> [Flat+] -> block -> ejector. Routing blocks: Fan, block above [Flat+], Turn R / Turn L to the side ejectors.
Reference Twin + Flat+ (no block): big 4.3, cluster 4.0, split 4.1 (estimate 5.0). Fan Splitter 2 + Flat+: big 14.0, cluster 13.0, split 13.8.
Targets sized to the circuit (big 4 s, cluster body 0.75 s, split parent 1.5 s of its estimate). "x ref" = big with Flat+ / the reference's big (Fan reference for routing blocks). Factor = engine efficiency (engine / estimate) over the reference's, per scenario (big / cluster / split), used by the search.

| block | cat | L | alone big | +Flat+ big | +Flat+ cluster | +Flat+ split | x ref (big) | x ref (cluster) | factor b/c/s |
|---|---|---|---|---|---|---|---|---|---|
| Splitter 3 | pathing | 5 | 12.6 | 25.2 | 23.4 | 24.0 | 1.80 | 1.80 | 1.00 / 1.00 / 0.97 |
| Splitter 3 | pathing | 1 | 10.5 | 21.0 | 19.5 | 20.0 | 1.50 | 1.50 | 1.00 / 1.00 / 0.97 |
| Splitter 2 | pathing | 5 | 8.4 | 16.8 | 15.6 | 16.5 | 1.20 | 1.20 | 1.00 / 1.00 / 1.00 |
| Alternator | pathing | 5 | 8.4 | 16.8 | 15.6 | 16.4 | 1.20 | 1.20 | 1.00 / 1.00 / 0.99 |
| Flat + | damage | 5 | 12.8 | 14.9 | 14.0 | 14.5 | 3.50 | 3.50 | 1.00 / 1.00 / 1.00 |
| Percent × | damage | 5 | 7.4 | 14.9 | 14.0 | 14.5 | 3.50 | 3.50 | 1.00 / 1.00 / 1.00 |
| Splitter 2 | pathing | 1 | 7.0 | 14.0 | 13.0 | 13.8 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Alternator | pathing | 1 | 7.0 | 14.0 | 13.0 | 13.7 | 1.00 | 1.00 | 1.00 / 1.00 / 0.99 |
| Random Router | pathing | 5 | 6.5 | 13.1 | 12.1 | 12.9 | 0.94 | 0.93 | 0.98 / 0.98 / 0.99 |
| Random Router | pathing | 1 | 5.5 | 11.0 | 9.9 | 10.0 | 0.79 | 0.76 | 1.05 / 1.02 / 0.97 |
| Gambler’s Gate | damage | 1 | 3.6 | 7.1 | 7.0 | 6.4 | 1.68 | 1.76 | 1.12 / 1.17 / 1.03 |
| Turn Left | pathing | 1 | 3.5 | 7.0 | 6.3 | 6.7 | 0.50 | 0.48 | 1.00 / 1.00 / 1.00 |
| Turn Right | pathing | 1 | 3.5 | 7.0 | 7.0 | 6.5 | 0.50 | 0.54 | 1.00 / 1.00 / 1.00 |
| Culling Bolt | mitosis | 5 | 3.3 | 6.6 | 4.0 | 5.9 | 1.55 | 1.01 | 1.55 / 1.01 / 1.43 |
| Jackpot | damage | 1 | 3.2 | 6.4 | 4.1 | 10.8 | 1.51 | 1.03 | 1.11 / 0.76 / 1.92 |
| Flat + | damage | 1 | 4.3 | 6.4 | 6.0 | 6.2 | 1.50 | 1.50 | 1.00 / 1.00 / 1.00 |
| Percent × | damage | 1 | 3.2 | 6.4 | 6.0 | 6.2 | 1.50 | 1.50 | 1.00 / 1.00 / 1.00 |
| Boomerang | modifier | 5 | 3.2 | 6.4 | 8.2 | 10.4 | 1.50 | 2.05 | 1.50 / 2.05 / 2.52 |
| Static Charge | status | 5 | 3.1 | 6.2 | 4.0 | 8.3 | 1.46 | 1.00 | 1.46 / 1.00 / 2.00 |
| Capacitor | damage | 5 | 2.8 | 5.6 | 3.9 | 11.5 | 1.32 | 0.98 | 0.94 / 0.70 / 1.99 |
| Shield-Breaker | modifier | 1 | 2.8 | 5.6 | 4.1 | 8.1 | 1.31 | 1.03 | 1.31 / 1.03 / 1.97 |
| Static Charge | status | 1 | 2.8 | 5.6 | 4.0 | 5.9 | 1.31 | 1.00 | 1.31 / 1.00 / 1.44 |
| Lucky Strike | damage | 1 | 2.7 | 5.3 | 4.6 | 5.4 | 1.25 | 1.15 | 0.94 / 0.87 / 0.99 |
| Overclock | damage | 5 | 2.6 | 5.3 | 5.1 | 7.1 | 1.25 | 1.27 | 0.70 / 0.71 / 0.96 |
| Culling Bolt | mitosis | 1 | 2.6 | 5.2 | 4.0 | 4.2 | 1.22 | 1.00 | 1.22 / 1.00 / 1.03 |
| Frostbite | status | 5 | 2.6 | 5.1 | 4.0 | 5.9 | 1.21 | 1.00 | 1.21 / 1.00 / 1.43 |
| Ignite | status | 5 | 2.5 | 5.1 | 4.3 | 4.2 | 1.20 | 1.09 | 1.20 / 1.09 / 1.02 |
| Overclock | damage | 1 | 2.5 | 4.9 | 4.7 | 6.4 | 1.16 | 1.17 | 0.74 / 0.74 / 0.99 |
| Bouncing | modifier | 5 | 2.4 | 4.9 | 4.5 | 6.0 | 1.15 | 1.11 | 1.15 / 1.11 / 1.46 |
| Frostbite | status | 1 | 2.4 | 4.8 | 4.0 | 4.3 | 1.13 | 1.00 | 1.13 / 1.00 / 1.05 |
| Bouncing | modifier | 1 | 2.4 | 4.8 | 4.5 | 6.2 | 1.12 | 1.12 | 1.12 / 1.12 / 1.49 |
| Ignite | status | 1 | 2.4 | 4.7 | 4.1 | 4.1 | 1.11 | 1.03 | 1.11 / 1.03 / 0.99 |
| Executioner | damage | 1 | 2.3 | 4.6 | 4.0 | 6.1 | 1.09 | 1.00 | 1.09 / 1.00 / 1.46 |
| Executioner | damage | 5 | 2.3 | 4.6 | 4.0 | 12.5 | 1.09 | 1.00 | 1.09 / 1.00 / 3.03 |
| Gravity Well | modifier | 1 | 2.3 | 4.5 | 4.2 | 4.2 | 1.06 | 1.06 | 1.06 / 1.06 / 1.01 |
| Gravity Well | modifier | 5 | 2.3 | 4.5 | 4.2 | 4.2 | 1.06 | 1.06 | 1.06 / 1.06 / 1.01 |
| Homing | modifier | 1 | 2.3 | 4.5 | 4.3 | 4.3 | 1.06 | 1.09 | 1.06 / 1.09 / 1.03 |
| Homing | modifier | 5 | 2.3 | 4.5 | 4.3 | 4.3 | 1.06 | 1.09 | 1.06 / 1.09 / 1.03 |
| Delay Line | pathing | 1 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Fission Catalyst | mitosis | 1 | 2.1 | 4.3 | 4.0 | 10.4 | 1.00 | 1.00 | 1.00 / 1.00 / 2.52 |
| Fission Catalyst | mitosis | 5 | 2.1 | 4.3 | 4.0 | 10.5 | 1.00 | 1.00 | 1.00 / 1.00 / 2.54 |
| Cauterize | mitosis | 1 | 2.1 | 4.3 | 4.0 | 18.6 | 1.00 | 1.00 | 1.00 / 1.00 / 4.51 |
| Cauterize | mitosis | 5 | 2.1 | 4.3 | 4.0 | 18.6 | 1.00 | 1.00 | 1.00 / 1.00 / 4.51 |
| Cleaver | mitosis | 5 | 2.1 | 4.3 | 4.0 | 8.0 | 1.00 | 1.00 | 1.00 / 1.00 / 1.94 |
| Residue Seed | mitosis | 1 | 2.1 | 4.3 | 5.8 | 8.3 | 1.00 | 1.45 | 1.00 / 1.45 / 2.01 |
| Residue Seed | mitosis | 5 | 2.1 | 4.3 | 6.3 | 8.0 | 1.00 | 1.58 | 1.00 / 1.58 / 1.93 |
| Overkill Spill | mitosis | 1 | 2.1 | 4.3 | 4.0 | 18.6 | 1.00 | 1.00 | 1.00 / 1.00 / 4.51 |
| Overkill Spill | mitosis | 5 | 2.1 | 4.3 | 4.0 | 18.6 | 1.00 | 1.00 | 1.00 / 1.00 / 4.51 |
| Piercing | modifier | 1 | 2.1 | 4.3 | 4.0 | 6.0 | 1.00 | 1.01 | 1.00 / 1.01 / 1.45 |
| Piercing | modifier | 5 | 2.1 | 4.3 | 6.2 | 8.0 | 1.00 | 1.55 | 1.00 / 1.55 / 1.94 |
| AoE - Circle | modifier | 1 | 2.1 | 4.3 | 13.6 | 8.0 | 1.00 | 3.41 | 1.00 / 3.41 / 1.93 |
| AoE - Circle | modifier | 5 | 2.1 | 4.3 | 14.0 | 8.5 | 1.00 | 3.50 | 1.00 / 3.50 / 2.04 |
| Pure Converter | modifier | 1 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Pure Converter | modifier | 5 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Chain Lightning | modifier | 1 | 2.1 | 4.3 | 7.7 | 8.1 | 1.00 | 1.92 | 1.00 / 1.92 / 1.96 |
| Chain Lightning | modifier | 5 | 2.1 | 4.3 | 9.3 | 7.9 | 1.00 | 2.33 | 1.00 / 2.33 / 1.92 |
| AoE - Rectangle | modifier | 1 | 2.1 | 4.3 | 8.1 | 8.2 | 1.00 | 2.02 | 1.00 / 2.02 / 1.98 |
| AoE - Rectangle | modifier | 5 | 2.1 | 4.3 | 14.1 | 10.2 | 1.00 | 3.53 | 1.00 / 3.53 / 2.46 |
| Fork on Impact | modifier | 1 | 2.1 | 4.3 | 6.3 | 8.1 | 1.00 | 1.56 | 1.00 / 1.56 / 1.97 |
| Armor-Piercer Tip | modifier | 1 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Corrosion | status | 1 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Corrosion | status | 5 | 2.1 | 4.3 | 4.0 | 4.1 | 1.00 | 1.00 | 1.00 / 1.00 / 1.00 |
| Delay Line | pathing | 5 | 2.0 | 4.0 | 3.8 | 4.1 | 0.94 | 0.94 | 0.94 / 0.94 / 1.00 |
| Capacitor | damage | 1 | 2.0 | 4.0 | 2.8 | 8.2 | 0.94 | 0.70 | 0.94 / 0.70 / 1.99 |
| Boomerang | modifier | 1 | 1.9 | 3.9 | 5.6 | 8.1 | 0.91 | 1.41 | 0.91 / 1.41 / 1.97 |
| Cleaver | mitosis | 1 | 1.8 | 3.6 | 3.0 | 8.2 | 0.85 | 0.76 | 0.85 / 0.76 / 1.98 |
| Orbit | modifier | 1 | 1.8 | 3.5 | 0.0 | 3.4 | 0.82 | 0.00 | 0.82 / 0.00 / 0.83 |
| Random Curve | modifier | 1 | 1.5 | 3.0 | 2.7 | 3.8 | 0.71 | 0.68 | 0.71 / 0.68 / 0.93 |
| Curving Right | modifier | 1 | 1.2 | 2.4 | 0.9 | 3.4 | 0.56 | 0.23 | 0.56 / 0.23 / 0.83 |
| Mine | modifier | 1 | 1.1 | 2.3 | 2.2 | 3.8 | 0.53 | 0.56 | 0.53 / 0.56 / 0.93 |
| Mine | modifier | 5 | 1.1 | 2.3 | 2.2 | 3.8 | 0.53 | 0.56 | 0.53 / 0.56 / 0.93 |
| Orbit | modifier | 5 | 0.0 | 0.0 | 1.9 | 3.4 | 0.00 | 0.47 | 0.00 / 0.47 / 0.83 |

Category check, L1 big-target "x ref" against the category median (target 0.6-1.6; specialists may be lower if they win their niche), and L5 / L1 (target <= 4):

| block | cat | L1 x ref | / cat median | best niche (x ref) | L5/L1 big | flag |
|---|---|---|---|---|---|---|
| Turn Left | pathing | 0.50 | 0.50 | 0.49 | 1.00 | LOW (no niche) |
| Turn Right | pathing | 0.50 | 0.50 | 0.54 | 1.00 | LOW (no niche) |
| Splitter 2 | pathing | 1.00 | 1.00 | 1.00 | 1.20 |  |
| Splitter 3 | pathing | 1.50 | 1.50 | 1.50 | 1.20 |  |
| Alternator | pathing | 1.00 | 1.00 | 1.00 | 1.20 |  |
| Random Router | pathing | 0.79 | 0.79 | 0.76 | 1.19 |  |
| Delay Line | pathing | 1.00 | 1.00 | 1.00 | 0.94 |  |
| Flat + | damage | 1.50 | 1.09 | 1.50 | 2.33 |  |
| Percent × | damage | 1.50 | 1.09 | 1.50 | 2.33 |  |
| Lucky Strike | damage | 1.25 | 0.91 | 1.32 | 1.00 |  |
| Jackpot | damage | 1.51 | 1.09 | 2.62 | 1.00 |  |
| Gambler’s Gate | damage | 1.68 | 1.22 | 1.76 | 1.00 |  |
| Overclock | damage | 1.16 | 0.84 | 1.55 | 1.07 |  |
| Capacitor | damage | 0.94 | 0.68 | 1.99 | 1.40 |  |
| Executioner | damage | 1.09 | 0.79 | 1.46 | 1.00 |  |
| Fission Catalyst | mitosis | 1.00 | 1.00 | 2.52 | 1.00 |  |
| Cauterize | mitosis | 1.00 | 1.00 | 4.51 | 1.00 |  |
| Cleaver | mitosis | 0.85 | 0.85 | 1.98 | 1.17 |  |
| Culling Bolt | mitosis | 1.22 | 1.22 | 1.03 | 1.27 |  |
| Residue Seed | mitosis | 1.00 | 1.00 | 2.01 | 1.00 |  |
| Overkill Spill | mitosis | 1.00 | 1.00 | 4.51 | 1.00 |  |
| Piercing | modifier | 1.00 | 1.00 | 1.45 | 1.00 |  |
| Bouncing | modifier | 1.12 | 1.12 | 1.49 | 1.03 |  |
| AoE - Circle | modifier | 1.00 | 1.00 | 3.41 | 1.00 |  |
| Shield-Breaker | modifier | 1.31 | 1.31 | 1.97 | 1.00 |  |
| Pure Converter | modifier | 1.00 | 1.00 | 1.00 | 1.00 |  |
| Boomerang | modifier | 0.91 | 0.91 | 1.97 | 1.65 |  |
| Orbit | modifier | 0.82 | 0.82 | 0.83 | 0.00 |  |
| Chain Lightning | modifier | 1.00 | 1.00 | 1.96 | 1.00 |  |
| Mine | modifier | 0.53 | 0.53 | 0.93 | 1.00 | LOW (no niche) |
| Gravity Well | modifier | 1.06 | 1.06 | 1.06 | 1.00 |  |
| Curving Right | modifier | 0.56 | 0.56 | 0.83 | 1.00 | LOW (no niche) |
| Random Curve | modifier | 0.71 | 0.71 | 0.93 | 1.00 |  |
| Homing | modifier | 1.06 | 1.06 | 1.09 | 1.00 |  |
| AoE - Rectangle | modifier | 1.00 | 1.00 | 2.02 | 1.00 |  |
| Fork on Impact | modifier | 1.00 | 1.00 | 1.97 | 1.00 |  |
| Armor-Piercer Tip | modifier | 1.00 | 1.00 | 1.00 | 1.00 |  |
| Ignite | status | 1.11 | 0.99 | 1.03 | 1.08 |  |
| Frostbite | status | 1.13 | 1.01 | 1.05 | 1.06 |  |
| Corrosion | status | 1.00 | 0.89 | 1.00 | 1.00 |  |
| Static Charge | status | 1.31 | 1.17 | 1.44 | 1.11 |  |

## B. Best circuits per hull (seeded hill-climb, 3 restarts x 300 mutations per search)

Reference search: every block at the level, at most 2 copies of any block. Free search: up to 8 copies. Each search's best 8 (by its score: estimate x engine factors, diminishing) are benched on the engine and the top 5 by the engine are shown. Engine = mixed HP/s (mean of big, cluster, split).

### dart L1: reference median 3.2 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.19 | 500 | G > Cauterize > E |
| ref 2 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.10 | 500 | G > Overkill Spill > E |
| ref 3 | 4.2 | 3.2 | 1.8 | 4.8 | 3.1 | 1.00 | 300 | G > AoE - Circle > E |
| ref 4 | 2.9 | 2.7 | 2.3 | 2.6 | 3.3 | 0.84 | 220 | G > Shield-Breaker > E |
| ref 5 | 3.3 | 2.6 | 1.8 | 3.0 | 3.2 | 0.82 | 1200 | G > Chain Lightning > E |
| free 1 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.19 | 500 | G > Cauterize > E |
| free 2 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.10 | 500 | G > Overkill Spill > E |
| free 3 | 4.2 | 3.2 | 1.8 | 4.8 | 3.1 | 1.00 | 300 | G > AoE - Circle > E |
| free 4 | 3.0 | 2.7 | 2.6 | 2.0 | 3.6 | 0.85 | 180 | G > Gambler’s Gate > E |
| free 5 | 3.3 | 2.5 | 1.8 | 2.8 | 3.1 | 0.79 | 300 | G > AoE - Rectangle > E |

### dart L5: reference median 3.5 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 12.0 | 9.4 | 10.5 | 8.3 | 9.4 | 2.66 **OUTLIER** | 2243 | G > Flat + L5 > E |
| ref 2 | 7.0 | 5.5 | 6.1 | 4.8 | 5.5 | 1.55 | 4606 | G > Percent × L5 > E |
| ref 3 | 4.7 | 3.5 | 1.8 | 4.8 | 4.1 | 1.00 | 11513 | G > AoE - Rectangle L5 > E |
| ref 4 | 4.4 | 3.4 | 1.8 | 5.1 | 3.3 | 0.96 | 11513 | G > AoE - Circle L5 > E |
| ref 5 | 3.0 | 2.5 | 1.8 | 2.5 | 3.1 | 0.70 | 30701 | G > Residue Seed L5 > E |
| free 1 | 12.0 | 9.4 | 10.5 | 8.3 | 9.4 | 2.66 **OUTLIER** | 2243 | G > Flat + L5 > E |
| free 2 | 7.0 | 5.5 | 6.1 | 4.8 | 5.5 | 1.55 | 4606 | G > Percent × L5 > E |
| free 3 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.09 | 19188 | G > Cauterize L5 > E |
| free 4 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.02 | 19188 | G > Overkill Spill L5 > E |
| free 5 | 3.6 | 3.3 | 2.9 | 2.7 | 4.2 | 0.93 | 1332 | G > Gambler’s Gate L3 > E |

### twin L1: reference median 9.0 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Overkill Spill > Flat + > E |
| ref 2 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Cauterize > Flat + > E |
| ref 3 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Cauterize > E |
| ref 4 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Overkill Spill > E |
| ref 5 | 10.6 | 8.6 | 4.3 | 13.6 | 8.0 | 0.96 | 370 | G > AoE - Circle > Flat + > E |
| free 1 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Overkill Spill > E |
| free 2 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Cauterize > E |
| free 3 | 8.1 | 6.7 | 3.2 | 3.0 | 14.0 | 0.75 | 690 | G > Percent × > Overkill Spill > E |
| free 4 | 7.4 | 5.5 | 3.2 | 2.1 | 11.3 | 0.62 | 720 | G > Jackpot > Overkill Spill > E |
| free 5 | 7.4 | 4.9 | 2.1 | 3.1 | 9.3 | 0.54 | 1020 | G > Fork on Impact > Overkill Spill > E |

### twin L5: reference median 16.7 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 52.5 | 43.3 | 44.6 | 42.0 | 43.4 | 2.60 **OUTLIER** | 6919 | G > Flat + L5 > Percent × L5 > E |
| ref 2 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.71 | 13826 | G > Flat + L5 > AoE - Rectangle L5 > E |
| ref 3 | 20.4 | 16.7 | 7.4 | 24.7 | 17.8 | 1.00 | 16189 | G > AoE - Rectangle L5 > Percent × L5 > E |
| ref 4 | 19.0 | 15.7 | 7.4 | 7.0 | 32.6 | 0.94 | 23864 | G > Overkill Spill L5 > Percent × L5 > E |
| ref 5 | 15.3 | 12.5 | 7.4 | 16.3 | 13.9 | 0.75 | 50727 | G > Chain Lightning L5 > Percent × L5 > E |
| free 1 | 52.5 | 43.3 | 44.6 | 42.0 | 43.4 | 2.60 **OUTLIER** | 6919 | G > Flat + L5 > Percent × L5 > E |
| free 2 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.71 | 13826 | G > AoE - Rectangle L5 > Flat + L5 > E |
| free 3 | 32.5 | 26.9 | 12.8 | 12.0 | 55.9 | 1.61 | 21501 | G > Cauterize L5 > Flat + L5 > E |
| free 4 | 32.5 | 26.9 | 12.8 | 12.0 | 55.9 | 1.61 | 21501 | G > Overkill Spill L5 > Flat + L5 > E |
| free 5 | 32.5 | 26.9 | 12.8 | 12.0 | 55.9 | 1.61 | 21501 | G > Flat + L5 > Cauterize L5 > E |

### prong L1: reference median 6.7 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 8.7 | 7.2 | 3.5 | 3.2 | 15.0 | 1.09 | 850 | G > Cauterize > E |
| ref 2 | 8.4 | 6.8 | 3.5 | 10.3 | 6.6 | 1.02 | 650 | G > AoE - Circle > E |
| ref 3 | 8.0 | 6.7 | 7.0 | 6.3 | 6.7 | 1.00 | 700 | G > Splitter 3 > { E | Turn Left > E } |
| ref 4 | 8.0 | 6.6 | 7.0 | 6.4 | 6.6 | 1.00 | 350 | G > Flat + > E |
| ref 5 | 8.7 | 6.1 | 3.5 | 3.2 | 11.7 | 0.92 | 850 | G > Overkill Spill > E |
| free 1 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 2.17 | 1200 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| free 2 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 2.17 | 1400 | G > Splitter 3 > { E | Cauterize > Splitter 2 > E } |
| free 3 | 12.4 | 11.2 | 7.0 | 13.9 | 12.8 | 1.69 | 1000 | G > Splitter 3 > { E | AoE - Circle > Turn Left > E } |
| free 4 | 9.7 | 8.6 | 8.5 | 7.8 | 9.5 | 1.29 | 920 | G > Splitter 3 > { E | Shield-Breaker > Turn Left > E } |
| free 5 | 8.7 | 7.2 | 3.5 | 3.2 | 15.0 | 1.09 | 850 | G > Cauterize > E |

### prong L5: reference median 19.9 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 25.0 | 20.8 | 21.8 | 19.5 | 21.0 | 1.04 | 26063 | G > Splitter 3 L5 > { E | Percent × L5 > Splitter 2 L5 > E } |
| ref 2 | 25.0 | 20.8 | 21.8 | 19.5 | 21.0 | 1.04 | 18801 | G > Splitter 3 L5 > { E | Percent × L5 > Splitter 3 L5 > E } |
| ref 3 | 24.0 | 19.9 | 21.0 | 19.1 | 19.7 | 1.00 | 2593 | G > Flat + L5 > E |
| ref 4 | 18.2 | 15.0 | 9.2 | 18.3 | 17.5 | 0.75 | 55996 | G > Splitter 3 L5 > { E | AoE - Rectangle L5 > Alternator L5 > E } |
| ref 5 | 18.2 | 13.9 | 9.2 | 15.7 | 16.7 | 0.70 | 32970 | G > Splitter 3 L5 > { E | AoE - Rectangle L5 > Splitter 2 L5 > E } |
| free 1 | 24.0 | 19.9 | 21.0 | 19.1 | 19.7 | 1.00 | 2593 | G > Flat + L5 > E |
| free 2 | 17.3 | 19.1 | 9.2 | 8.3 | 39.7 | 0.96 | 33383 | G > Splitter 3 L5 > { E | Cauterize L5 > Splitter 3 L5 > E } |
| free 3 | 15.2 | 17.4 | 8.4 | 7.7 | 36.2 | 0.87 | 33226 | G > Splitter 3 L5 > { E | Cauterize L5 > Turn Left L3 > E } |
| free 4 | 14.5 | 14.2 | 10.6 | 16.3 | 15.8 | 0.71 | 33226 | G > Splitter 3 L5 > { E | Boomerang L5 > Turn Left L3 > E } |
| free 5 | 9.6 | 8.0 | 8.4 | 7.7 | 7.9 | 0.40 | 14038 | G > Splitter 3 L5 > { E | Turn Left L3 > E } |

### fan L1: reference median 56.3 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 86.9 | 61.4 | 51.3 | 45.4 | 87.6 | 1.09 | 10801 | G > Overkill Spill > Splitter 3 > { Shield-Breaker > Overclock > Turn Right > Executioner > Jackpot > Overkill Spill > Culling Bolt > AoE - Rectangle > E | Overclock > Percent × > Piercing > Culling Bolt > Static Charge > E | Fork on Impact > Turn Left > Piercing > Percent × > Fission Catalyst > Lucky Strike > Residue Seed > E } |
| ref 2 | 79.0 | 57.3 | 49.5 | 42.3 | 80.3 | 1.02 | 10951 | G > Overkill Spill > Splitter 3 > { Shield-Breaker > Overclock > Turn Right > Executioner > Pure Converter > Overkill Spill > Culling Bolt > AoE - Rectangle > E | Overclock > Percent × > Piercing > Culling Bolt > Static Charge > E | Fork on Impact > Turn Left > Piercing > Percent × > Fission Catalyst > Lucky Strike > Residue Seed > E } |
| ref 3 | 78.6 | 56.3 | 40.5 | 39.8 | 88.5 | 1.00 | 10007 | G > Overkill Spill > Splitter 3 > { Shield-Breaker > Overclock > Turn Right > Executioner > Pure Converter > Overkill Spill > Culling Bolt > AoE - Rectangle > E | Overclock > Percent × > Piercing > Static Charge > E | Fork on Impact > Turn Left > Piercing > Percent × > Fission Catalyst > Lucky Strike > Residue Seed > E } |
| ref 4 | 73.1 | 52.9 | 36.0 | 42.0 | 80.6 | 0.94 | 10165 | G > Overkill Spill > Splitter 3 > { Shield-Breaker > Overclock > Turn Right > Executioner > Pure Converter > Overkill Spill > Culling Bolt > AoE - Rectangle > E | Overclock > Percent × > Piercing > Static Charge > E | Fork on Impact > Turn Left > Piercing > AoE - Circle > Fission Catalyst > Lucky Strike > Residue Seed > E } |
| ref 5 | 83.9 | 29.9 | 16.3 | 18.4 | 54.9 | 0.53 | 3750 | G > Overkill Spill > Flat + > Jackpot > Shield-Breaker > Static Charge > Gambler’s Gate > Cauterize > Boomerang > E |
| free 1 | 146 | 104 | 62.1 | 118 | 133 | 1.86 | 12013 | G > Lucky Strike > { Splitter 3 > { Fork on Impact > Overclock > Turn Right > Jackpot > Fork on Impact > Overkill Spill > Executioner > Percent × > E | AoE - Circle > Culling Bolt > Overkill Spill > Flat + > E | Residue Seed > Gambler’s Gate > Splitter 2 > { Flat + > Gambler’s Gate > Fork on Impact > AoE - Rectangle > AoE - Circle > E | Random Router > { Homing | Lucky Strike > Culling Bolt > Lucky Strike > { ... | Overkill Spill > Armor-Piercer Tip > ? } } } } | ... } |
| free 2 | 135 | 97.1 | 61.5 | 102 | 127 | 1.73 | 11751 | G > Lucky Strike > { Splitter 3 > { Fork on Impact > Shield-Breaker > Turn Right > Jackpot > Fork on Impact > Overkill Spill > Executioner > Percent × > E | AoE - Circle > Culling Bolt > Overkill Spill > Flat + > E | Residue Seed > Gambler’s Gate > Splitter 2 > { Flat + > Gambler’s Gate > Fork on Impact > AoE - Rectangle > AoE - Circle > E | Random Router > { AoE - Circle | Lucky Strike > Culling Bolt > Lucky Strike > { ... | Overkill Spill > Armor-Piercer Tip > ? } } } } | ... } |
| free 3 | 135 | 97.1 | 61.5 | 102 | 127 | 1.73 | 11733 | G > Lucky Strike > { Splitter 3 > { Fork on Impact > Shield-Breaker > Turn Right > Jackpot > Fork on Impact > Overkill Spill > Executioner > Percent × > E | AoE - Circle > Culling Bolt > Overkill Spill > Flat + > E | Residue Seed > Gambler’s Gate > Splitter 2 > { Flat + > Gambler’s Gate > Fork on Impact > AoE - Rectangle > AoE - Circle > E | Random Router > { Homing | Lucky Strike > Culling Bolt > Lucky Strike > { ... | Overkill Spill > Armor-Piercer Tip > ? } } } } | ... } |
| free 4 | 116 | 78.4 | 47.9 | 77.8 | 109 | 1.39 | 8014 | G > Lucky Strike > Splitter 3 > { Shield-Breaker > Turn Right > Jackpot > Shield-Breaker > Fork on Impact > Overkill Spill > Executioner > Percent × > E | AoE - Circle > Culling Bolt > Overkill Spill > Flat + > E | Residue Seed > Turn Left > Flat + > Lucky Strike > Fork on Impact > AoE - Rectangle > AoE - Circle > E } |
| free 5 | 116 | 78.4 | 47.9 | 77.8 | 109 | 1.39 | 8641 | G > Lucky Strike > Splitter 3 > { Fork on Impact > Shield-Breaker > Turn Right > Jackpot > Shield-Breaker > Fork on Impact > Overkill Spill > Executioner > Percent × > E | AoE - Circle > Culling Bolt > Overkill Spill > Flat + > E | Residue Seed > Turn Left > Flat + > Lucky Strike > Fork on Impact > AoE - Rectangle > AoE - Circle > E } |

### fan L5: reference median 304 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 700 | 323 | 125 | 405 | 439 | 1.06 | 82074 | G > AoE - Circle L5 > Flat + L5 > Gravity Well L5 > Jackpot L3 > Overkill Spill L5 > Percent × L5 > AoE - Rectangle L5 > E |
| ref 2 | 816 | 304 | 144 | 368 | 401 | 1.00 | 61144 | G > AoE - Circle L5 > Flat + L5 > Cleaver L5 > Jackpot L3 > Jackpot L3 > Bouncing L5 > Percent × L5 > AoE - Rectangle L5 > E |
| ref 3 | 781 | 304 | 144 | 368 | 401 | 1.00 | 51550 | G > AoE - Circle L5 > Flat + L5 > Cleaver L5 > Jackpot L3 > Jackpot L3 > Percent × L5 > AoE - Rectangle L5 > E |
| ref 4 | 329 | 287 | 109 | 228 | 525 | 0.94 | 318140 | G > Cleaver L5 > Splitter 3 L5 > { Fission Catalyst L5 > Jackpot L3 > Splitter 2 L5 > { Lucky Strike L3 | Chain Lightning L5 > Bouncing L5 > Percent × L5 > Overkill Spill L5 > Boomerang L5 > Flat + L5 > E } | Ignite L5 > Residue Seed L5 > Lucky Strike L3 > Bouncing L5 > Boomerang L5 > Overkill Spill L5 > E | Capacitor L5 > Chain Lightning L5 > Turn Left L3 > Shield-Breaker L3 > AoE - Rectangle L5 > Culling Bolt L5 > Jackpot L3 > E } |
| ref 5 | 724 | 279 | 120 | 281 | 438 | 0.92 | 70561 | G > AoE - Circle L5 > Flat + L5 > Cleaver L5 > Jackpot L3 > Overkill Spill L5 > Percent × L5 > AoE - Rectangle L5 > E |
| free 1 | 695 | 308 | 135 | 281 | 507 | 1.01 | 201936 | G > Ignite L5 > Splitter 3 L5 > { Flat + L5 > Piercing L5 > Turn Right L3 > Cauterize L5 > Gambler’s Gate L3 > Capacitor L5 > Overkill Spill L5 > Jackpot L3 > E | Chain Lightning L5 > AoE - Circle L5 > Overkill Spill L5 > Ignite L5 > Flat + L5 > E | Cleaver L5 > Piercing L5 > Turn Left L3 > Gambler’s Gate L3 > Fork on Impact L3 > Flat + L5 > Armor-Piercer Tip L3 > Overkill Spill L5 > E } |
| free 2 | 530 | 279 | 120 | 272 | 444 | 0.92 | 200826 | G > Ignite L5 > Splitter 3 L5 > { Flat + L5 > Piercing L5 > Turn Right L3 > Cauterize L5 > Gambler’s Gate L3 > Capacitor L5 > Overkill Spill L5 > E | Chain Lightning L5 > AoE - Circle L5 > Overkill Spill L5 > Ignite L5 > Flat + L5 > E | Cleaver L5 > Piercing L5 > Turn Left L3 > Gambler’s Gate L3 > Fork on Impact L3 > Flat + L5 > Armor-Piercer Tip L3 > Overkill Spill L5 > E } |
| free 3 | 466 | 216 | 98.0 | 149 | 401 | 0.71 | 213352 | G > Ignite L5 > Splitter 3 L5 > { Flat + L5 > Piercing L5 > Turn Right L3 > Cauterize L5 > Gambler’s Gate L3 > Capacitor L5 > Overkill Spill L5 > E | Chain Lightning L5 > AoE - Circle L5 > Overkill Spill L5 > Ignite L5 > Flat + L5 > E | Cleaver L5 > Piercing L5 > Turn Left L3 > Gambler’s Gate L3 > Homing L5 > Cauterize L5 > Armor-Piercer Tip L3 > Overkill Spill L5 > E } |
| free 4 | 469 | 215 | 98.0 | 179 | 367 | 0.71 | 201332 | G > Ignite L5 > Splitter 3 L5 > { Flat + L5 > Piercing L5 > Turn Right L3 > Cauterize L5 > Gambler’s Gate L3 > Capacitor L5 > Overkill Spill L5 > E | Chain Lightning L5 > AoE - Circle L5 > Overkill Spill L5 > Ignite L5 > Flat + L5 > E | Cleaver L5 > Piercing L5 > Turn Left L3 > Gambler’s Gate L3 > Fork on Impact L3 > Cauterize L5 > Armor-Piercer Tip L3 > Overkill Spill L5 > E } |
| free 5 | 354 | 174 | 75.8 | 161 | 285 | 0.57 | 243841 | G > Ignite L5 > Splitter 3 L5 > { Flat + L5 > Piercing L5 > Turn Right L3 > Cauterize L5 > Executioner L5 > Capacitor L5 > Overkill Spill L5 > E | Chain Lightning L5 > AoE - Circle L5 > Overkill Spill L5 > Ignite L5 > Flat + L5 > E | Cleaver L5 > Piercing L5 > Turn Left L3 > Gambler’s Gate L3 > Homing L5 > Cauterize L5 > Armor-Piercer Tip L3 > Overkill Spill L5 > E } |

### shuttle L1: reference median 110 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 223 | 110 | 54.1 | 41.7 | 234 | 1.00 | 9317 | G > Jackpot > Splitter 3 > { Random Curve > Jackpot > Fork on Impact | Piercing > Overclock > Delay Line > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| ref 2 | 223 | 110 | 54.1 | 41.7 | 234 | 1.00 | 9529 | G > Jackpot > Splitter 3 > { Random Curve > Jackpot > Fork on Impact | Piercing > Overclock > Delay Line > Gambler’s Gate > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| ref 3 | 223 | 110 | 54.1 | 41.7 | 234 | 1.00 | 9829 | G > Jackpot > Splitter 3 > { Random Curve > Jackpot > Fork on Impact | Piercing > Overclock > Delay Line > Gambler’s Gate > AoE - Rectangle > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| ref 4 | 223 | 110 | 54.1 | 41.7 | 234 | 1.00 | 9979 | G > Jackpot > Splitter 3 > { Pure Converter > Jackpot > Fork on Impact | Piercing > Overclock > Delay Line > Gambler’s Gate > AoE - Rectangle > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| ref 5 | 223 | 110 | 54.1 | 41.7 | 234 | 1.00 | 9699 | G > Jackpot > Splitter 3 > { Pure Converter > Jackpot > Fork on Impact | Piercing > Overclock > Shield-Breaker > Gambler’s Gate > AoE - Rectangle > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| free 1 | 346 | 119 | 85.4 | 42.1 | 231 | 1.09 | 4934 | G > Flat + > Turn Right > Percent × > Flat + > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E |
| free 2 | 352 | 118 | 64.0 | 117 | 173 | 1.07 | 5163 | G > Flat + > Turn Right > Percent × > AoE - Circle > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E |
| free 3 | 352 | 118 | 64.0 | 117 | 173 | 1.07 | 7834 | G > Flat + > Splitter 3 > { Flat + > Bouncing > Turn Right > Fission Catalyst > ? | Frostbite > ? | Percent × > AoE - Circle > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E } |
| free 4 | 352 | 118 | 64.0 | 117 | 173 | 1.07 | 7584 | G > Flat + > Splitter 3 > { Flat + > Turn Right > Fission Catalyst > ? | Frostbite > ? | Percent × > AoE - Circle > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E } |
| free 5 | 352 | 118 | 64.0 | 117 | 173 | 1.07 | 7834 | G > Flat + > Splitter 3 > { Flat + > Turn Right > Fission Catalyst > Piercing | Frostbite > ? | Percent × > AoE - Circle > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E } |

### shuttle L5: reference median 2716 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 8276 | 5546 | 2831 | 6093 | 7714 | 2.04 | 69988 | G > Boomerang L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Overkill Spill L5 > Jackpot L3 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Overclock L5 > E |
| ref 2 | 7372 | 4236 | 1879 | 4031 | 6799 | 1.56 | 96851 | G > Chain Lightning L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Overkill Spill L5 > Jackpot L3 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Overclock L5 > E |
| ref 3 | 3834 | 2716 | 606 | 4988 | 2554 | 1.00 | 107925 | G > Flat + L5 > Turn Right L3 > Fork on Impact L3 > Chain Lightning L5 > Turn Left L3 > Flat + L5 > Cauterize L5 > Piercing L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |
| ref 4 | 4462 | 2538 | 793 | 3197 | 3624 | 0.93 | 81062 | G > Flat + L5 > Turn Right L3 > Fork on Impact L3 > Overclock L5 > Turn Left L3 > Flat + L5 > Cauterize L5 > Piercing L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |
| ref 5 | 3426 | 1821 | 606 | 2303 | 2554 | 0.67 | 61874 | G > Flat + L5 > Turn Right L3 > Fork on Impact L3 > Turn Left L3 > Flat + L5 > Cauterize L5 > Piercing L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |
| free 1 | 4172 | 1474 | 403 | 1362 | 2657 | 0.54 | 63081 | G > Flat + L5 > Turn Right L3 > Jackpot L3 > Jackpot L3 > Turn Left L3 > Gambler’s Gate L3 > Boomerang L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > Overkill Spill L5 > E |
| free 2 | 2433 | 860 | 235 | 794 | 1550 | 0.32 | 60980 | G > Percent × L5 > Turn Right L3 > Jackpot L3 > Jackpot L3 > Turn Left L3 > Gambler’s Gate L3 > Boomerang L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > Overkill Spill L5 > E |
| free 3 | 1896 | 543 | 183 | 547 | 897 | 0.20 | 174957 | G > Percent × L5 > Turn Right L3 > Splitter 3 L5 > { Orbit L5 > Capacitor L5 > Static Charge L5 > Orbit L5 > Cleaver L5 > ? | Jackpot L3 > Turn Left L3 > Gambler’s Gate L3 > Boomerang L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| free 4 | 1896 | 543 | 183 | 547 | 897 | 0.20 | 174013 | G > Percent × L5 > Turn Right L3 > Splitter 3 L5 > { Orbit L5 > Capacitor L5 > Static Charge L5 > Cleaver L5 > ? | Jackpot L3 > Turn Left L3 > Gambler’s Gate L3 > Boomerang L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |
| free 5 | 1896 | 543 | 183 | 547 | 897 | 0.20 | 174603 | G > Percent × L5 > Turn Right L3 > Splitter 3 L5 > { Orbit L5 > Capacitor L5 > Static Charge L5 > Static Charge L5 > Cleaver L5 > ? | Jackpot L3 > Turn Left L3 > Gambler’s Gate L3 > Boomerang L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > Overkill Spill L5 > E } |


## C. Progress: DPS a wall needs against the DPS a player could own

Income model: before tier N the player has played every tier t < N 3 times, destroying 50% of the wall per run (credits = 1.5 x the full-clear credits of each earlier tier; Free Fly income not counted). Owned DPS = the best circuit the searches met that the credits buy (hull + copies + upgrades), its wall score (estimate x the big/cluster engine factors; levels 1, 2, 3 and 5 searched). Hero level from 3 Free Fly Medals + one per earlier tier, all spent on hero levels, base +0.5 a level.
Pass DPS: the cheapest column carved while the wall crosses at max boost. Clear DPS: every block before the wall reaches a ship at the bottom. Target: owned / clear about 0.5-1 (clear in 2-4 runs), 2 = clears in one run.

| tier | pass DPS | clear DPS | credits so far | owned DPS (hero 0) | owned / clear | hero lvl | owned DPS with hero | with hero / clear | best affordable circuit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0.4 | 3.1 | 0 | 4.0 | 1.31 | 0 | 4.0 | 1.31 | dart: G > Flat + > E |
| 5 | 0.6 | 6.9 | 230 | 7.5 | 1.08 | 3 | 13.1 | 1.89 | twin: G > Flat + > Percent × > E |
| 10 | 2.1 | 23.7 | 735 | 17.5 | 0.74 | 5 | 32.0 | 1.35 | prong: G > Splitter 3 > { E | Flat + > Turn Left > E } |
| 20 | 18.0 | 137 | 2917 | 42.2 | 0.31 | 8 | 155 | 1.14 | fan: G > AoE - Circle > AoE - Rectangle > Lucky Strike > Gambler’s Gate > Lucky Strike > E |
| 30 | 35.5 | 699 | 7947 | 272 | 0.39 | 10 | 1629 | 2.33 | fan: G > Gambler’s Gate L2 > Gambler’s Gate L2 > Percent × L2 > Lucky Strike L2 > AoE - Circle L2 > AoE - Rectangle L2 > Percent × L2 > Jackpot L2 > E |
| 50 | 37.3 | 3036 | 40040 | 3313 | 1.09 | 10 | 5776 | 1.90 | shuttle: G > Flat + L3 > Splitter 2 L3 > { Corrosion L3 > Armor-Piercer Tip L3 > Flat + L3 | Flat + L3 > Percent × L3 > Turn Left L3 > Percent × L3 > Lucky Strike L3 > Gambler’s Gate L3 > AoE - Circle L3 > Pure Converter L3 > Percent × L3 > E } |
| 75 | 65.6 | 6494 | 220285 | 8854 | 1.36 | 10 | 22586 | 3.48 | shuttle: G > AoE - Rectangle L5 > Splitter 2 L5 > { Overkill Spill L5 > ? | Percent × L5 > Capacitor L5 > Splitter 2 L5 > Gambler’s Gate L3 > Percent × L5 > Jackpot L3 > Overclock L5 > Boomerang L5 > Percent × L5 > E } |
| 100 | 294 | 11015 | 1039784 | 8854 | 0.80 | 10 | 22586 | 2.05 | shuttle: G > AoE - Rectangle L5 > Splitter 2 L5 > { Overkill Spill L5 > ? | Percent × L5 > Capacitor L5 > Splitter 2 L5 > Gambler’s Gate L3 > Percent × L5 > Jackpot L3 > Overclock L5 > Boomerang L5 > Percent × L5 > E } |

## D. Free Fly bot (src/debug/freeflyBot.ts), mean of 1 seeds, cap 1500 s

Per hull: its best reference circuit (at most 2 copies of a block) at L1 and at L5. Target for a strong build: Dart 5, Twin 8, Prong 12, Fan 16, Shuttle 20.

| hull | L | wave reached | survived s | circuit |
|---|---|---|---|---|
| dart | 1 | 5.0 | 197 | G > Cauterize > E |
| dart | 5 | 7.0 | 247 | G > Flat + L5 > E |
| twin | 1 | 7.0 | 270 | G > Overkill Spill > Flat + > E |
| twin | 5 | 10.0 | 399 | G > Flat + L5 > Percent × L5 > E |
| prong | 1 | 7.0 | 267 | G > Cauterize > E |
| prong | 5 | 9.0 | 327 | G > Splitter 3 L5 > { E | Percent × L5 > Splitter 2 L5 > E } |
| fan | 1 | 14.0 | 560 | G > Overkill Spill > Splitter 3 > { Shield-Breaker > Overclock > Turn Right > Executioner > Jackpot > Overkill Spill > Culling Bolt > AoE - Rectangle > E | Overclock > Percent × > Piercing > Culling Bolt > Static Charge > E | Fork on Impact > Turn Left > Piercing > Percent × > Fission Catalyst > Lucky Strike > Residue Seed > E } |
| fan | 5 | 15.0 | 564 | G > AoE - Circle L5 > Flat + L5 > Gravity Well L5 > Jackpot L3 > Overkill Spill L5 > Percent × L5 > AoE - Rectangle L5 > E |
| shuttle | 1 | 13.0 | 481 | G > Jackpot > Splitter 3 > { Random Curve > Jackpot > Fork on Impact | Piercing > Overclock > Delay Line > Capacitor > Boomerang | Flat + > Gambler’s Gate > Turn Left > Static Charge > Cauterize > Overclock > Lucky Strike > Percent × > Overkill Spill > E } |
| shuttle | 5 | 23.0 | 881 | G > Boomerang L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Overkill Spill L5 > Jackpot L3 > Percent × L5 > Lucky Strike L3 > Percent × L5 > Overclock L5 > E |

By credits spent (best affordable circuit from the searches, hero level 0):

| credits | wave reached | survived s | circuit |
|---|---|---|---|
| 0 | 5.0 | 183 | dart: G > Flat + > E |
| 150 | 7.0 | 242 | twin: G > Flat + > Flat + > E |
| 500 | 8.0 | 287 | twin: G > Flat + L2 > Flat + L2 > E |
| 2000 | 9.0 | 359 | fan: G > Flat + > AoE - Rectangle > Lucky Strike > Gambler’s Gate > Lucky Strike > E |
| 8000 | 13.0 | 487 | shuttle: G > Flat + > Turn Right > Percent × > AoE - Circle > Turn Left > Lucky Strike > Cauterize > Gambler’s Gate > Gambler’s Gate > Gambler’s Gate > Overkill Spill > E |
| 30000 | 19.0 | 750 | shuttle: G > Flat + L3 > Splitter 2 L3 > { Corrosion L3 > Armor-Piercer Tip L3 > Flat + L3 | Flat + L3 > Percent × L3 > Turn Left L3 > Percent × L3 > Lucky Strike L3 > Gambler’s Gate L3 > AoE - Circle L3 > Pure Converter L3 > Percent × L3 > E } |
