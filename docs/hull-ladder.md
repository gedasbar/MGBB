# Hull ladder (chunk 17a)

Design note, written before the code (layouts, stats) and finished after it (price fit, section at the end). 19 hulls from the free Dart to the Zenith, a purchase goal every few tiers, and real
trade-offs between free cells, ejectors, fire rate, shot speed and size.

## How to read the drawings

`G` generator (always on the bottom edge, it emits upward), `E` ejector (always fires up), `.` a buildable cell, blank = outside the hull.
"Cells" in the ladder means buildable cells (the dots). The signal only leaves the generator going up, so the cell above
the G is always buildable and the rest of the hull is reached by turning (Turn Left / Turn Right) from there.

## Rules every layout follows

- No two hulls share a shape (Dart, Twin and Prong, Fan and Shuttle are unchanged).
- Most are not plain rectangles: a U, a dog-leg, a hook, a spine with a crossbar, a diamond, three prongs, a tower with wings, a ring with a hole.
- Ejectors sit on the top or the upper edges, with nothing buildable above them.
- Every buildable cell and every ejector is connected to G, and every ejector can be reached from G with a plain
  straight-and-turn path (checked by unit test: a shortest path with Turn Left / Turn Right blocks at its corners compiles to that ejector).

## Layouts

### 1. Dart (existing layout)
1 cell, 1 ejector, 2 pulses/s, shot speed 1, small, free
```
E
.
G
```
### 2. Twin (existing layout)
2 cells, 1 ejector, 2.5 pulses/s, shot speed 1, small, 70 credits
```
E
.
.
G
```
### 3. Prong (existing layout)
3 cells, 2 ejectors, 4 pulses/s, shot speed 1, small, 350 credits
```
E E
...
G
```
### 4. Wisp
5 cells, 1 ejector, 3 pulses/s, shot speed 1.2, small, 700 credits
```
E
.
.
.
.
.
G
```
### 5. Hornet
9 cells, 2 ejectors, 3 pulses/s, shot speed 1, small, 1,100 credits
```
E   E
.   .
.   .
.....
  G
```
### 6. Lancet
7 cells, 1 ejector, 5 pulses/s, shot speed 1.3, small, 1,700 credits
```
   E
   .
....
.
.
G
```
### 7. Kestrel
12 cells, 3 ejectors, 2.5 pulses/s, shot speed 1, medium, 2,600 credits
```
EEE
...
...
...
...
 G
```
### 8. Mantis
14 cells, 1 ejector, 4 pulses/s, shot speed 1.2, medium, 3,900 credits
```
     E
......
..   .
..
..
.
G
```
### 9. Bastion
18 cells, 4 ejectors, 2 pulses/s, shot speed 0.9, medium, 6,200 credits
```
E E E E
.......
.......
  ....
   G
```
### 10. Halberd
22 cells, 3 ejectors, 3 pulses/s, shot speed 1, medium, 11,000 credits
```
  E
E .. E
......
  ..
  ..
 ....
  ..
  ..
  ..
  G
```
### 11. Corvette
26 cells, 2 ejectors, 4.5 pulses/s, shot speed 1.1, medium, 19,000 credits
```
  E E
 .....
.......
.......
 .....
   ..
   G
```
### 12. Trident
30 cells, 3 ejectors, 3 pulses/s, shot speed 1.1, medium, 33,000 credits
```
   E
E  .  E
.  .  .
.  .  .
.  .  .
.  .  .
.  .  .
.......
.......
   G
```
### 13. Galleon
36 cells, 5 ejectors, 2 pulses/s, shot speed 0.9, big, 58,000 credits
```
E E E E E
.........
.........
.........
  .....
   ...
    .
    G
```
### 14. Shuttle (existing layout)
47 cells, 1 ejector, 5 pulses/s, shot speed 1, big, 96,000 credits
```

     .  E
  .......
  ..... .
  ..... .
  ..... .
  ..... .
  .......
  .......
     .
     G
```
### 15. Spire
42 cells, 6 ejectors, 3.5 pulses/s, shot speed 1, big, 190,000 credits
```
   E E
   ...
   ...
   ...
   ...
 EE...EE
 .......
 .......
 .......
   ...
   ...
    G
```
### 16. Leviathan
55 cells, 4 ejectors, 4 pulses/s, shot speed 1, big, 330,000 credits
```
    E
   ...
   ...
E E...
......
......
......E
.........
.........
   ....
   ...
   ...
    G
```
### 17. Fan (existing layout)
72 cells, 3 ejectors, 4 pulses/s, shot speed 1, big, 500,000 credits
```
 E  E  E
.........
.........
.........
.........
.........
.........
.........
.........
    G
```
### 18. Citadel
64 cells, 8 ejectors, 3 pulses/s, shot speed 1, huge, 820,000 credits
```
 EEEEEEEE
..........
..........
...    ...
...    ...
...    ...
...    ...
..........
..........
    G
```
### 19. Zenith
80 cells, 10 ejectors, 4 pulses/s, shot speed 1, huge, 1,300,000 credits
```
EEEEE EEEEE
...........
...........
...........
...........
...........
 .........
  .......
   .....
    ...
     .
     G
```

## Price fit (step 4)

Scripts: `scripts/hull-pricing.ts` flies the sensible build of every hull (`src/debug/hullBuilds.ts`: the plainest routing that
feeds up to three ejectors through a Splitter 3, damage blocks in the free straight cells, more and better ones higher up the
ladder: `1 + index` copies of Flat+ / Percent x at level `1 + index/2`) through Free Fly (3 seeds, 600 s cap), the campaign
(carve and clear-all bots, tiers 1 to 100) and the Frontier (rings up to 1000) and writes `reports/chunk17a/hull-income.json`;
`scripts/hull-pricing-fit.ts` turns that into prices.

Model. A player saving for hull n stands at an "effective tier": campaign tier from 10 at the Wisp, 9 tiers more per hull, then the
Frontier at tier 25 + 0.3 x ring (the Zenith lands at ring 400, the deepest ring the sensible builds pass). Income per run there
is the larger of the Free Fly run the bot earns with hull n-1's build and a half-clear of that content (a pass or a half clear
pays about half the wall, `docs/economy-audit.md` D1). Price = 4.5 runs of that income, then clamped to 1.5 to 2.0 times the
previous price and rounded to two digits. The Dart, Twin and Prong keep their prices. 1.05^9 = 1.55 per hull is the reward growth
over one step, so the x1.6-2 growth of the brief is what the economy itself provides; the brief's starting prices were
a little steeper at the top (Zenith 2.5M against 1.3M here), which would have been 9 runs at ring 400.

| # | hull | price | where a player can afford it | income / run there | runs | what pays |
|---|---|---|---|---|---|---|
| 1 | Dart | 0 | Free Fly (any) | 0 (Free Fly) | 0.0 | Free Fly |
| 2 | Twin | 70 | Free Fly (any) | 76 (Free Fly) | 0.9 | Free Fly |
| 3 | Prong | 350 | Free Fly (any) | 129 (Free Fly) | 2.7 | Free Fly |
| 4 | Wisp | 700 | campaign tier 10 | 182 (Free Fly) | 3.8 | Free Fly |
| 5 | Hornet | 1.1K | campaign tier 19 | 246 (Free Fly) | 4.5 | Free Fly |
| 6 | Lancet | 1.7K | campaign tier 28 | 321 (Free Fly) | 5.3 | Free Fly |
| 7 | Kestrel | 2.6K | campaign tier 37 | 462 (Free Fly) | 5.6 | Free Fly |
| 8 | Mantis | 3.9K | campaign tier 46 | 782 (half-clear) | 5.0 | wall |
| 9 | Bastion | 6.2K | campaign tier 55 | 1.4K (half-clear) | 4.5 | wall |
| 10 | Halberd | 11K | campaign tier 64 | 2.5K (half-clear) | 4.4 | wall |
| 11 | Corvette | 19K | campaign tier 73 | 4.3K (half-clear) | 4.4 | wall |
| 12 | Trident | 33K | campaign tier 82 | 7.4K (half-clear) | 4.5 | wall |
| 13 | Galleon | 58K | campaign tier 91 | 13K (half-clear) | 4.5 | wall |
| 14 | Shuttle | 96K | campaign tier 100 | 21K (half-clear) | 4.5 | wall |
| 15 | Spire | 190K | Frontier ring 280 | 44K (half-clear) | 4.3 | wall |
| 16 | Leviathan | 330K | Frontier ring 310 | 73K (half-clear) | 4.5 | wall |
| 17 | Fan | 500K | Frontier ring 340 | 94K (half-clear) | 5.3 | wall |
| 18 | Citadel | 820K | Frontier ring 370 | 182K (half-clear) | 4.5 | wall |
| 19 | Zenith | 1.30M | Frontier ring 400 | 284K (half-clear) | 4.6 | wall |

Honesty notes: the Free Fly income is the bot's (a human runs longer than the 600 s cap, so FF income is a floor); the "sensible
build" feeds three ejectors at most, so the Citadel (8) and the Zenith (10) are better than measured; the build capability
columns of the raw table (`reports/chunk17a/hull-prices-raw.md`) show the previous hull's build passes every position listed
except Frontier rings 370 and 400, where the Fan and Citadel builds pass 350 and 'fail' the next scanned ring. Growth per hull:
x70, 5.0, 2.0, 1.57, 1.55, 1.53, 1.50, 1.59, 1.77, 1.73, 1.74, 1.76, 1.66, 1.98, 1.74, 1.52, 1.64, 1.59.
