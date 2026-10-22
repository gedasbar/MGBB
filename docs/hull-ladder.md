# Hull ladder (chunk 17a)

Design note, written before the code. 19 hulls from the free Dart to the Zenith, a purchase goal every few tiers, and real
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
9 cells, 2 ejectors, 3 pulses/s, shot speed 1, small, 1,500 credits
```
E   E
.   .
.   .
.....
  G
```
### 6. Lancet
7 cells, 1 ejector, 5 pulses/s, shot speed 1.3, small, 2,500 credits
```
   E
   .
....
.
.
G
```
### 7. Kestrel
12 cells, 3 ejectors, 2.5 pulses/s, shot speed 1, medium, 4,000 credits
```
EEE
...
...
...
...
 G
```
### 8. Mantis
14 cells, 1 ejector, 4 pulses/s, shot speed 1.2, medium, 7,000 credits
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
18 cells, 4 ejectors, 2 pulses/s, shot speed 0.9, medium, 12,000 credits
```
E E E E
.......
.......
  ....
   G
```
### 10. Halberd
22 cells, 3 ejectors, 3 pulses/s, shot speed 1, medium, 20,000 credits
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
26 cells, 2 ejectors, 4.5 pulses/s, shot speed 1.1, medium, 35,000 credits
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
30 cells, 3 ejectors, 3 pulses/s, shot speed 1.1, medium, 60,000 credits
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
36 cells, 5 ejectors, 2 pulses/s, shot speed 0.9, big, 100,000 credits
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
47 cells, 1 ejector, 5 pulses/s, shot speed 1, big, 160,000 credits
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
42 cells, 6 ejectors, 3.5 pulses/s, shot speed 1, big, 260,000 credits
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
55 cells, 4 ejectors, 4 pulses/s, shot speed 1, big, 420,000 credits
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
72 cells, 3 ejectors, 4 pulses/s, shot speed 1, big, 700,000 credits
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
64 cells, 8 ejectors, 3 pulses/s, shot speed 1, huge, 1,200,000 credits
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
80 cells, 10 ejectors, 4 pulses/s, shot speed 1, huge, 2,500,000 credits
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
