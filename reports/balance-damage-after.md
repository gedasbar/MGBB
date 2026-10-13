# balance-damage, final run (after tuning)

Raw output of `npm run balance-damage` on the tuned numbers (chunk 14a). Summary in docs/balance-damage.md, section 4.

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

## B. Best circuits per hull (seeded hill-climb, 6 restarts x 900 mutations per search)

Reference search: every block at the level, at most 2 copies of any block. Free search: up to 8 copies. Each search's best 20 (by its score: estimate x engine factors, diminishing) are benched on the engine and the top 5 by the engine are shown. Engine = mixed HP/s (mean of big, cluster, split).

### dart L1: reference median 3.2 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.19 | 500 | G > Cauterize > E |
| ref 2 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.10 | 500 | G > Overkill Spill > E |
| ref 3 | 4.2 | 3.2 | 1.8 | 4.8 | 3.1 | 1.00 | 300 | G > AoE - Circle > E |
| ref 4 | 4.0 | 3.1 | 3.5 | 2.8 | 3.1 | 0.97 | 0 | G > Flat + > E |
| ref 5 | 2.9 | 2.7 | 2.3 | 2.6 | 3.3 | 0.84 | 220 | G > Shield-Breaker > E |
| free 1 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.19 | 500 | G > Cauterize > E |
| free 2 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.10 | 500 | G > Overkill Spill > E |
| free 3 | 4.2 | 3.2 | 1.8 | 4.8 | 3.1 | 1.00 | 300 | G > AoE - Circle > E |
| free 4 | 4.0 | 3.1 | 3.5 | 2.8 | 3.1 | 0.97 | 0 | G > Flat + > E |
| free 5 | 2.9 | 2.7 | 2.3 | 2.6 | 3.3 | 0.84 | 220 | G > Shield-Breaker > E |

### dart L5: reference median 3.6 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 12.0 | 9.4 | 10.5 | 8.3 | 9.4 | 2.61 **OUTLIER** | 2243 | G > Flat + L5 > E |
| ref 2 | 7.0 | 5.5 | 6.1 | 4.8 | 5.5 | 1.52 | 4606 | G > Percent × L5 > E |
| ref 3 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.00 | 19188 | G > Overkill Spill L5 > E |
| ref 4 | 4.7 | 3.5 | 1.8 | 4.8 | 4.1 | 0.98 | 11513 | G > AoE - Rectangle L5 > E |
| ref 5 | 4.4 | 3.4 | 1.8 | 5.1 | 3.3 | 0.94 | 11513 | G > AoE - Circle L5 > E |
| free 1 | 12.0 | 9.4 | 10.5 | 8.3 | 9.4 | 2.61 **OUTLIER** | 2243 | G > Flat + L5 > E |
| free 2 | 7.0 | 5.5 | 6.1 | 4.8 | 5.5 | 1.52 | 4606 | G > Percent × L5 > E |
| free 3 | 4.3 | 3.9 | 1.8 | 1.4 | 8.5 | 1.07 | 19188 | G > Cauterize L5 > E |
| free 4 | 4.3 | 3.6 | 1.8 | 1.4 | 7.6 | 1.00 | 19188 | G > Overkill Spill L5 > E |
| free 5 | 4.7 | 3.5 | 1.8 | 4.8 | 4.1 | 0.98 | 11513 | G > AoE - Rectangle L5 > E |

### twin L1: reference median 9.0 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Overkill Spill > Flat + > E |
| ref 2 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Cauterize > Flat + > E |
| ref 3 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Overkill Spill > E |
| ref 4 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Cauterize > E |
| ref 5 | 10.6 | 8.6 | 4.3 | 13.6 | 8.0 | 0.96 | 370 | G > Flat + > AoE - Circle > E |
| free 1 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Overkill Spill > E |
| free 2 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Flat + > Cauterize > E |
| free 3 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Overkill Spill > Flat + > E |
| free 4 | 10.8 | 9.0 | 4.3 | 4.0 | 18.6 | 1.00 | 570 | G > Cauterize > Flat + > E |
| free 5 | 10.6 | 8.6 | 4.3 | 13.6 | 8.0 | 0.96 | 370 | G > Flat + > AoE - Circle > E |

### twin L5: reference median 28.5 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 52.5 | 43.3 | 44.6 | 42.0 | 43.4 | 1.52 | 6919 | G > Flat + L5 > Percent × L5 > E |
| ref 2 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.00 | 13826 | G > Flat + L5 > AoE - Rectangle L5 > E |
| ref 3 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.00 | 13826 | G > AoE - Rectangle L5 > Flat + L5 > E |
| ref 4 | 27.0 | 28.2 | 24.8 | 17.3 | 42.5 | 0.99 | 3645 | G > Flat + L5 > Gambler’s Gate L3 > E |
| ref 5 | 32.5 | 26.9 | 12.8 | 12.0 | 55.9 | 0.94 | 21501 | G > Flat + L5 > Overkill Spill L5 > E |
| free 1 | 52.5 | 43.3 | 44.6 | 42.0 | 43.4 | 1.52 | 6919 | G > Flat + L5 > Percent × L5 > E |
| free 2 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.00 | 13826 | G > AoE - Rectangle L5 > Flat + L5 > E |
| free 3 | 35.0 | 28.5 | 12.8 | 42.4 | 30.5 | 1.00 | 13826 | G > Flat + L5 > AoE - Rectangle L5 > E |
| free 4 | 27.0 | 28.2 | 24.8 | 17.3 | 42.5 | 0.99 | 3645 | G > Flat + L5 > Gambler’s Gate L3 > E |
| free 5 | 32.5 | 26.9 | 12.8 | 12.0 | 55.9 | 0.94 | 21501 | G > Cauterize L5 > Flat + L5 > E |

### prong L1: reference median 14.4 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1200 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| ref 2 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1400 | G > Splitter 3 > { E | Cauterize > Splitter 2 > E } |
| ref 3 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1613 | G > Splitter 3 > { E | Cauterize > Splitter 3 > E } |
| ref 4 | 12.4 | 11.2 | 7.0 | 13.9 | 12.8 | 0.78 | 1200 | G > Splitter 3 > { E | AoE - Circle > Splitter 2 > E } |
| ref 5 | 12.4 | 11.2 | 7.0 | 13.9 | 12.8 | 0.78 | 1000 | G > Splitter 3 > { E | AoE - Circle > Turn Left > E } |
| free 1 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1200 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| free 2 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1400 | G > Splitter 3 > { E | Cauterize > Splitter 2 > E } |
| free 3 | 12.7 | 14.4 | 7.0 | 6.3 | 30.1 | 1.00 | 1613 | G > Splitter 3 > { E | Cauterize > Splitter 3 > E } |
| free 4 | 12.4 | 11.2 | 7.0 | 13.9 | 12.8 | 0.78 | 1000 | G > Splitter 3 > { E | AoE - Circle > Turn Left > E } |
| free 5 | 10.7 | 10.7 | 7.0 | 11.8 | 13.4 | 0.74 | 1000 | G > Splitter 3 > { E | AoE - Rectangle > Turn Left > E } |

### prong L5: reference median 23.9 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 32.1 | 26.4 | 28.1 | 25.1 | 26.1 | 1.11 | 16438 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| ref 2 | 32.1 | 26.4 | 28.1 | 25.1 | 26.1 | 1.11 | 23700 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 2 L5 > E } |
| ref 3 | 29.6 | 23.9 | 25.4 | 21.4 | 24.8 | 1.00 | 16281 | G > Splitter 3 L5 > { E | Flat + L5 > Turn Left L3 > E } |
| ref 4 | 24.0 | 19.9 | 21.0 | 19.1 | 19.7 | 0.83 | 2593 | G > Flat + L5 > E |
| ref 5 | 15.2 | 17.4 | 8.4 | 7.7 | 36.2 | 0.73 | 33226 | G > Splitter 3 L5 > { E | Cauterize L5 > Turn Left L3 > E } |
| free 1 | 32.1 | 26.4 | 28.1 | 25.1 | 26.1 | 1.11 | 23700 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 2 L5 > E } |
| free 2 | 32.1 | 26.4 | 28.1 | 25.1 | 26.1 | 1.11 | 16438 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| free 3 | 29.6 | 23.9 | 25.4 | 21.4 | 24.8 | 1.00 | 16281 | G > Splitter 3 L5 > { E | Flat + L5 > Turn Left L3 > E } |
| free 4 | 24.0 | 19.9 | 21.0 | 19.1 | 19.7 | 0.83 | 2593 | G > Flat + L5 > E |
| free 5 | 16.3 | 18.0 | 8.8 | 28.4 | 16.9 | 0.76 | 25708 | G > Splitter 3 L5 > { E | AoE - Circle L5 > Splitter 3 L5 > E } |

### fan L1: reference median 99.3 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 159 | 102 | 38.7 | 95.9 | 170 | 1.02 | 12655 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Boomerang > E | Frostbite > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Fission Catalyst > Splitter 2 > { Shield-Breaker > AoE - Circle > Flat + > Flat + > Percent × > E | Shield-Breaker } } |
| ref 2 | 151 | 99.3 | 41.3 | 92.4 | 164 | 1.00 | 12183 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Fork on Impact > AoE - Circle > Piercing > E | Frostbite > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Executioner > Fission Catalyst > Turn Left > Shield-Breaker > AoE - Circle > Flat + > Flat + > Percent × > E } |
| ref 3 | 151 | 99.3 | 41.3 | 92.4 | 164 | 1.00 | 12643 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Fork on Impact > AoE - Circle > Piercing > E | Frostbite > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Executioner > Fission Catalyst > Splitter 2 > { Shield-Breaker > AoE - Circle > Flat + > Flat + > Percent × > E | Shield-Breaker } } |
| ref 4 | 154 | 99.1 | 37.7 | 95.7 | 164 | 1.00 | 12643 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Fork on Impact > AoE - Circle > Piercing > E | Frostbite > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Fission Catalyst > Splitter 2 > { Shield-Breaker > AoE - Circle > Flat + > Flat + > Percent × > E | Shield-Breaker } } |
| ref 5 | 163 | 96.6 | 39.5 | 90.0 | 161 | 0.97 | 12462 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Lucky Strike > E | Jackpot > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Fission Catalyst > Splitter 2 > { Shield-Breaker > AoE - Circle > Flat + > Static Charge > Flat + > Percent × > E | Static Charge } } |
| free 1 | 255 | 121 | 48.2 | 127 | 188 | 1.22 | 9801 | G > Fork on Impact > Splitter 3 > { Overkill Spill > Cauterize > Splitter 2 > { Gravity Well | AoE - Rectangle > Percent × > Flat + > Gravity Well > E } | Residue Seed > Jackpot > Flat + > Static Charge > Overkill Spill > Flat + > E | Cauterize > Flat + > Turn Left > Flat + > Percent × > Flat + > Overkill Spill > AoE - Circle > Flat + > E } |
| free 2 | 255 | 121 | 48.2 | 127 | 188 | 1.22 | 10101 | G > Fork on Impact > Splitter 3 > { Overkill Spill > Cauterize > Splitter 2 > { Gravity Well | AoE - Rectangle > Percent × > Pure Converter > Flat + > Gravity Well > E } | Residue Seed > Jackpot > Flat + > Static Charge > Overkill Spill > Flat + > E | Cauterize > Flat + > Turn Left > Flat + > Percent × > Flat + > Overkill Spill > AoE - Circle > Flat + > E } |
| free 3 | 255 | 121 | 48.2 | 127 | 188 | 1.22 | 11114 | G > Fork on Impact > Splitter 3 > { Overkill Spill > Cauterize > Splitter 3 > { Gravity Well | Orbit | AoE - Rectangle > Percent × > Pure Converter > Flat + > Gravity Well > E } | Residue Seed > Jackpot > Flat + > Static Charge > Overkill Spill > Flat + > E | Cauterize > Flat + > Turn Left > Flat + > Percent × > Flat + > Overkill Spill > AoE - Circle > Flat + > E } |
| free 4 | 258 | 118 | 49.0 | 117 | 189 | 1.19 | 11132 | G > Fork on Impact > Splitter 3 > { Overkill Spill > Cauterize > Splitter 3 > { Gravity Well | Orbit | AoE - Rectangle > Percent × > Pure Converter > Flat + > Gravity Well > E } | Residue Seed > Jackpot > Flat + > Static Charge > Overkill Spill > Flat + > E | Cauterize > Flat + > Turn Left > Flat + > Percent × > Gambler’s Gate > Overkill Spill > AoE - Circle > Flat + > E } |
| free 5 | 258 | 118 | 49.0 | 117 | 189 | 1.19 | 10188 | G > Fork on Impact > Splitter 3 > { Overkill Spill > Cauterize > Splitter 3 > { ? | Orbit | AoE - Rectangle > Percent × > Pure Converter > Flat + > Gravity Well > E } | Residue Seed > Jackpot > Flat + > Static Charge > Overkill Spill > Flat + > E | Cauterize > Flat + > Turn Left > Flat + > Percent × > Gambler’s Gate > Overkill Spill > AoE - Circle > Flat + > E } |

### fan L5: reference median 617 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 659 | 648 | 140 | 1076 | 726 | 1.05 | 336448 | G > Ignite L5 > Splitter 3 L5 > { Fission Catalyst L5 > Turn Right L3 > Flat + L5 > Overkill Spill L5 > Boomerang L5 > AoE - Rectangle L5 > Corrosion L5 > Percent × L5 > E | Fission Catalyst L5 > Chain Lightning L5 > Fork on Impact L3 > Cauterize L5 > Overclock L5 > Gambler’s Gate L3 > E | Executioner L5 > Residue Seed L5 > Turn Left L3 > Boomerang L5 > Flat + L5 > Homing L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > E } |
| ref 2 | 526 | 643 | 239 | 765 | 924 | 1.04 | 280805 | G > Percent × L5 > Splitter 3 L5 > { Bouncing L5 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > AoE - Circle L5 > Overkill Spill L5 > Shield-Breaker L3 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > AoE - Rectangle L5 > Bouncing L5 > Residue Seed L5 > E | Executioner L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Fission Catalyst L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| ref 3 | 531 | 617 | 239 | 689 | 921 | 1.00 | 281041 | G > Percent × L5 > Splitter 3 L5 > { Bouncing L5 > AoE - Rectangle L5 > Turn Right L3 > Flat + L5 > Boomerang L5 > AoE - Circle L5 > Overkill Spill L5 > Shield-Breaker L3 > Lucky Strike L3 > E | Piercing L5 > Percent × L5 > Lucky Strike L3 > Overkill Spill L5 > Bouncing L5 > Residue Seed L5 > E | Executioner L5 > Flat + L5 > Turn Left L3 > Chain Lightning L5 > Gambler’s Gate L3 > Fission Catalyst L5 > Shield-Breaker L3 > Boomerang L5 > Ignite L5 > E } |
| ref 4 | 657 | 443 | 174 | 488 | 668 | 0.72 | 354220 | G > Ignite L5 > Splitter 3 L5 > { Static Charge L5 > Turn Right L3 > Flat + L5 > Overkill Spill L5 > Boomerang L5 > AoE - Rectangle L5 > Corrosion L5 > Percent × L5 > E | Fission Catalyst L5 > Chain Lightning L5 > Fork on Impact L3 > Cauterize L5 > Overclock L5 > Gambler’s Gate L3 > E | Executioner L5 > Residue Seed L5 > Turn Left L3 > Boomerang L5 > Flat + L5 > Homing L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > E } |
| ref 5 | 601 | 442 | 174 | 484 | 668 | 0.72 | 324557 | G > Ignite L5 > Splitter 3 L5 > { Static Charge L5 > Armor-Piercer Tip L3 > Turn Right L3 > Flat + L5 > Overkill Spill L5 > Boomerang L5 > AoE - Rectangle L5 > Percent × L5 > E | Fission Catalyst L5 > Chain Lightning L5 > Fork on Impact L3 > Cauterize L5 > Overclock L5 > Gambler’s Gate L3 > E | Executioner L5 > Residue Seed L5 > Turn Left L3 > Flat + L5 > Homing L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > E } |
| free 1 | 2711 | 1418 | 537 | 1584 | 2134 | 2.30 | 69831 | G > Executioner L5 > Flat + L5 > Flat + L5 > Percent × L5 > Cauterize L5 > AoE - Rectangle L5 > Percent × L5 > Percent × L5 > E |
| free 2 | 2622 | 1377 | 537 | 1460 | 2134 | 2.23 | 69831 | G > Executioner L5 > Flat + L5 > Flat + L5 > Percent × L5 > Cauterize L5 > AoE - Circle L5 > Percent × L5 > Percent × L5 > E |
| free 3 | 2606 | 1285 | 441 | 1512 | 1903 | 2.08 | 58235 | G > Boomerang L5 > Flat + L5 > Flat + L5 > AoE - Rectangle L5 > Flat + L5 > Overkill Spill L5 > Percent × L5 > Percent × L5 > E |
| free 4 | 1811 | 1053 | 330 | 1077 | 1753 | 1.71 | 100365 | G > Executioner L5 > Flat + L5 > Flat + L5 > Residue Seed L5 > Cauterize L5 > AoE - Circle L5 > Percent × L5 > Percent × L5 > E |
| free 5 | 1614 | 945 | 314 | 1191 | 1330 | 1.53 | 57643 | G > Homing L5 > Fork on Impact L3 > Flat + L5 > AoE - Rectangle L5 > Flat + L5 > Overkill Spill L5 > Percent × L5 > Percent × L5 > E |

### shuttle L1: reference median 66.8 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 184 | 68.0 | 25.3 | 73.2 | 106 | 1.02 | 6171 | G > Overkill Spill > Turn Right > Chain Lightning > Flat + > Turn Left > Cauterize > AoE - Circle > AoE - Rectangle > Flat + > Percent × > Gambler’s Gate > E |
| ref 2 | 184 | 67.6 | 26.7 | 69.9 | 106 | 1.01 | 6263 | G > Overkill Spill > Turn Right > Chain Lightning > Flat + > Turn Left > Cauterize > AoE - Circle > AoE - Rectangle > Flat + > Gambler’s Gate > Gambler’s Gate > E |
| ref 3 | 184 | 66.8 | 23.9 | 71.6 | 105 | 1.00 | 6133 | G > Overkill Spill > Turn Right > Chain Lightning > Flat + > Turn Left > Cauterize > AoE - Circle > AoE - Rectangle > Flat + > Percent × > Percent × > E |
| ref 4 | 181 | 56.6 | 20.2 | 59.6 | 89.8 | 0.85 | 7161 | G > Flat + > Turn Right > AoE - Rectangle > Fission Catalyst > Splitter 2 > Flat + > Overkill Spill > AoE - Circle > Overclock > Cauterize > Overclock > E |
| ref 5 | 181 | 56.6 | 20.2 | 59.6 | 89.8 | 0.85 | 11031 | G > Flat + > Splitter 3 > { Shield-Breaker > Delay Line | Residue Seed > Turn Left > Frostbite > Chain Lightning | AoE - Rectangle > Fission Catalyst > Splitter 2 > Flat + > Overkill Spill > AoE - Circle > Overclock > Cauterize > Overclock > E } |
| free 1 | 227 | 89.9 | 33.8 | 95.2 | 141 | 1.35 | 11672 | G > AoE - Rectangle > Splitter 3 > { Cauterize > Culling Bolt > Fission Catalyst | Pure Converter > Random Router > { Alternator > { AoE - Circle > Cauterize > ... | Culling Bolt > Capacitor } | ? } | AoE - Circle > Cauterize > Turn Left > Flat + > Overkill Spill > Flat + > Flat + > Flat + > Gambler’s Gate > E } |
| free 2 | 227 | 88.4 | 35.6 | 87.9 | 142 | 1.32 | 5147 | G > AoE - Circle > Turn Right > Flat + > AoE - Rectangle > Turn Left > Overkill Spill > Cauterize > Flat + > Flat + > Gambler’s Gate > Gambler’s Gate > E |
| free 3 | 227 | 88.4 | 35.6 | 87.9 | 142 | 1.32 | 5347 | G > AoE - Circle > Turn Right > Flat + > AoE - Rectangle > Splitter 2 > Overkill Spill > Cauterize > Flat + > Flat + > Gambler’s Gate > Gambler’s Gate > E |
| free 4 | 227 | 88.4 | 35.6 | 87.9 | 142 | 1.32 | 10016 | G > AoE - Circle > Splitter 2 > { Turn Right > Bouncing > Chain Lightning > Overclock > Flat + > Alternator > { Culling Bolt > Shield-Breaker | Curving Right > Pure Converter > Splitter 3 > Gambler’s Gate > E } | Flat + > AoE - Rectangle > Turn Left > Overkill Spill > Cauterize > Flat + > Flat + > Gambler’s Gate > Gambler’s Gate > ... } |
| free 5 | 227 | 88.4 | 35.6 | 87.9 | 142 | 1.32 | 11828 | G > AoE - Circle > Splitter 2 > { Turn Right > Bouncing > Chain Lightning > Overclock > Flat + > Alternator > { Culling Bolt > Shield-Breaker | Splitter 3 > { ? | Pure Converter > Splitter 3 > Gambler’s Gate > E | Gambler’s Gate > AoE - Circle > Culling Bolt > ? } } | Flat + > AoE - Rectangle > Turn Left > Overkill Spill > Cauterize > Flat + > Flat + > Gambler’s Gate > Gambler’s Gate > ... } |

### shuttle L5: reference median 1422 HP/s

| # | search | engine mixed | big | cluster | split | x median | cost | chain |
|---|---|---|---|---|---|---|---|---|
| ref 1 | 2465 | 1746 | 390 | 3207 | 1642 | 1.23 | 107925 | G > Flat + L5 > Turn Right L3 > Fork on Impact L3 > Chain Lightning L5 > Turn Left L3 > Flat + L5 > Cauterize L5 > Piercing L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |
| ref 2 | 3089 | 1509 | 455 | 2079 | 1992 | 1.06 | 110352 | G > AoE - Circle L5 > Turn Right L3 > Cauterize L5 > Boomerang L5 > Turn Left L3 > Flat + L5 > Overkill Spill L5 > Flat + L5 > Executioner L5 > Percent × L5 > Percent × L5 > E |
| ref 3 | 1798 | 1422 | 313 | 2658 | 1296 | 1.00 | 121794 | G > Cauterize L5 > Turn Right L3 > Overkill Spill L5 > Flat + L5 > Turn Left L3 > AoE - Circle L5 > Residue Seed L5 > Static Charge L5 > Percent × L5 > Percent × L5 > AoE - Rectangle L5 > E |
| ref 4 | 3394 | 1376 | 401 | 2079 | 1647 | 0.97 | 91164 | G > Cauterize L5 > Turn Right L3 > Overkill Spill L5 > Flat + L5 > Turn Left L3 > AoE - Circle L5 > Flat + L5 > Boomerang L5 > Percent × L5 > Percent × L5 > AoE - Rectangle L5 > E |
| ref 5 | 3140 | 1327 | 390 | 1949 | 1642 | 0.93 | 118027 | G > Flat + L5 > Turn Right L3 > AoE - Rectangle L5 > AoE - Circle L5 > Turn Left L3 > Flat + L5 > Cauterize L5 > Fission Catalyst L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |
| free 1 | 4767 | 3332 | 1062 | 4607 | 4326 | 2.34 | 72227 | G > AoE - Circle L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Cauterize L5 > Flat + L5 > Percent × L5 > Percent × L5 > Executioner L5 > Percent × L5 > E |
| free 2 | 5440 | 3136 | 921 | 4607 | 3881 | 2.21 | 60714 | G > AoE - Circle L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Cauterize L5 > Flat + L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > Percent × L5 > E |
| free 3 | 5480 | 3132 | 921 | 4607 | 3868 | 2.20 | 53039 | G > AoE - Circle L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Flat + L5 > Percent × L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > AoE - Rectangle L5 > E |
| free 4 | 5480 | 3132 | 921 | 4607 | 3868 | 2.20 | 53039 | G > AoE - Circle L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > AoE - Rectangle L5 > Flat + L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > Percent × L5 > E |
| free 5 | 4945 | 2826 | 831 | 4157 | 3490 | 1.99 | 53152 | G > AoE - Circle L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Percent × L5 > Percent × L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > AoE - Rectangle L5 > E |


## C. Progress: DPS a wall needs against the DPS a player could own

Income model: before tier N the player has played every tier t < N 3 times, destroying 50% of the wall per run (credits = 1.5 x the full-clear credits of each earlier tier; Free Fly income not counted). Owned DPS = the best circuit the searches met that the credits buy (hull + copies + upgrades), its wall score (estimate x the big/cluster engine factors; levels 1, 2, 3 and 5 searched). Hero level from 3 Free Fly Medals + one per earlier tier, all spent on hero levels, base +0.5 a level.
Pass DPS: the cheapest column carved while the wall crosses at max boost. Clear DPS: every block before the wall reaches a ship at the bottom. Target: owned / clear about 0.5-1 (clear in 2-4 runs), 2 = clears in one run.

| tier | pass DPS | clear DPS | credits so far | owned DPS (hero 0) | owned / clear | hero lvl | owned DPS with hero | with hero / clear | best affordable circuit |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 0.4 | 3.1 | 0 | 4.0 | 1.31 | 0 | 4.0 | 1.31 | dart: G > Flat + > E |
| 5 | 0.6 | 6.9 | 230 | 7.5 | 1.08 | 3 | 13.1 | 1.89 | twin: G > Flat + > Percent × > E |
| 10 | 2.1 | 23.7 | 735 | 17.5 | 0.74 | 5 | 32.0 | 1.35 | prong: G > Splitter 3 > { E | Flat + > Turn Left > E } |
| 20 | 18.0 | 137 | 2917 | 70.6 | 0.52 | 8 | 174 | 1.28 | fan: G > Shield-Breaker > Flat + > AoE - Rectangle > Gambler’s Gate > Flat + > Gambler’s Gate > Percent × > AoE - Circle > E |
| 30 | 35.5 | 699 | 7947 | 398 | 0.57 | 10 | 682 | 0.98 | shuttle: G > AoE - Circle L2 > Turn Right L2 > Flat + L2 > Boomerang L2 > Turn Left L2 > Flat + L2 > Flat + L2 > AoE - Rectangle L2 > Percent × L2 > Gambler’s Gate L2 > Percent × L2 > E |
| 50 | 37.3 | 3036 | 40040 | 5110 | 1.68 | 10 | 6707 | 2.21 | shuttle: G > Flat + L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Percent × L5 > Percent × L5 > AoE - Rectangle L5 > Percent × L5 > AoE - Circle L5 > Percent × L5 > E |
| 75 | 65.6 | 6494 | 220285 | 5110 | 0.79 | 10 | 6707 | 1.03 | shuttle: G > Flat + L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Percent × L5 > Percent × L5 > AoE - Rectangle L5 > Percent × L5 > AoE - Circle L5 > Percent × L5 > E |
| 100 | 294 | 11015 | 1039784 | 5110 | 0.46 | 10 | 6707 | 0.61 | shuttle: G > Flat + L5 > Turn Right L3 > Flat + L5 > Flat + L5 > Turn Left L3 > Percent × L5 > Percent × L5 > AoE - Rectangle L5 > Percent × L5 > AoE - Circle L5 > Percent × L5 > E |

## D. Free Fly bot (src/debug/freeflyBot.ts), mean of 3 seeds, cap 1500 s

Per hull: its best reference circuit (at most 2 copies of a block) at L1 and at L5. Target for a strong build: Dart 5, Twin 8, Prong 12, Fan 16, Shuttle 20.

| hull | L | wave reached | survived s | circuit |
|---|---|---|---|---|
| dart | 1 | 5.0 | 195 | G > Cauterize > E |
| dart | 5 | 7.7 | 269 | G > Flat + L5 > E |
| twin | 1 | 7.0 | 269 | G > Overkill Spill > Flat + > E |
| twin | 5 | 10.3 | 390 | G > Flat + L5 > Percent × L5 > E |
| prong | 1 | 8.3 | 320 | G > Splitter 3 > { E | Cauterize > Turn Left > E } |
| prong | 5 | 9.0 | 337 | G > Splitter 3 L5 > { E | Flat + L5 > Splitter 3 L5 > E } |
| fan | 1 | 13.0 | 489 | G > AoE - Rectangle > Splitter 3 > { Fission Catalyst > Overkill Spill > Turn Right > Percent × > Cauterize > Overclock > Gambler’s Gate > AoE - Circle > Boomerang > E | Frostbite > Overkill Spill > Chain Lightning > Jackpot > Cauterize > Gambler’s Gate > E | Residue Seed > Fission Catalyst > Splitter 2 > { Shield-Breaker > AoE - Circle > Flat + > Flat + > Percent × > E | Shield-Breaker } } |
| fan | 5 | 15.3 | 592 | G > Ignite L5 > Splitter 3 L5 > { Fission Catalyst L5 > Turn Right L3 > Flat + L5 > Overkill Spill L5 > Boomerang L5 > AoE - Rectangle L5 > Corrosion L5 > Percent × L5 > E | Fission Catalyst L5 > Chain Lightning L5 > Fork on Impact L3 > Cauterize L5 > Overclock L5 > Gambler’s Gate L3 > E | Executioner L5 > Residue Seed L5 > Turn Left L3 > Boomerang L5 > Flat + L5 > Homing L5 > Percent × L5 > AoE - Rectangle L5 > Gambler’s Gate L3 > E } |
| shuttle | 1 | 12.0 | 463 | G > Overkill Spill > Turn Right > Chain Lightning > Flat + > Turn Left > Cauterize > AoE - Circle > AoE - Rectangle > Flat + > Percent × > Gambler’s Gate > E |
| shuttle | 5 | 20.7 | 804 | G > Flat + L5 > Turn Right L3 > Fork on Impact L3 > Chain Lightning L5 > Turn Left L3 > Flat + L5 > Cauterize L5 > Piercing L5 > Percent × L5 > Percent × L5 > Overkill Spill L5 > E |

By credits spent (best affordable circuit from the searches, hero level 0):

| credits | wave reached | survived s | circuit |
|---|---|---|---|
| 0 | 5.0 | 185 | dart: G > Flat + > E |
| 150 | 7.0 | 257 | twin: G > Flat + > Flat + > E |
| 500 | 7.3 | 281 | twin: G > Flat + L2 > Flat + L2 > E |
| 2000 | 9.0 | 327 | twin: G > Flat + L3 > Percent × L3 > E |
| 8000 | 12.0 | 453 | shuttle: G > AoE - Circle L2 > Turn Right L2 > Flat + L2 > Boomerang L2 > Turn Left L2 > Flat + L2 > Flat + L2 > AoE - Rectangle L2 > Percent × L2 > Gambler’s Gate L2 > Percent × L2 > E |
| 30000 | 18.0 | 695 | fan: G > Flat + L5 > Flat + L5 > Percent × L5 > Shield-Breaker L3 > Percent × L5 > Fork on Impact L3 > Gambler’s Gate L3 > AoE - Rectangle L5 > E |
