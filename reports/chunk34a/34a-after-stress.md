## Browser frame cost (headless Chromium, software renderer; 12 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 49 | 20.3 | 2.20 | 1.45 | 52.4 | 565 |
| 250-750 | 2 | 60 | 16.7 | 1.51 | 1.12 | 18.2 | 583 |
| 750-1500 | 2 | 60 | 16.7 | 2.87 | 2.32 | 19.1 | 582 |
| 1500-2500 | 19 | 60 | 16.7 | 2.85 | 2.15 | 21.7 | 593 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 2500-3500 | 22 | 60 | 16.7 | 2.90 | 1.86 | 31.4 | 591 |
| 3500+ | 2 | 60 | 16.7 | 2.97 | 1.95 | 18.3 | 586 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 3500+ | 24 | 60 | 16.7 | 3.22 | 1.99 | 31.6 | 595 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 60 | 16.7 | 1.32 | 0.94 | 29.5 | 600 |
| 250-750 | 4 | 60 | 16.7 | 1.70 | 1.15 | 22.4 | 590 |
| 750-1500 | 11 | 60 | 16.7 | 1.97 | 1.28 | 23.9 | 594 |
| 1500-2500 | 8 | 60 | 16.7 | 2.12 | 1.39 | 21.7 | 586 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 1500-2500 | 15 | 60 | 16.7 | 2.48 | 1.40 | 24.5 | 596 |
| 2500-3500 | 9 | 60 | 16.7 | 2.52 | 1.41 | 27.0 | 592 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 3500+ | 23 | 59 | 17.1 | 3.00 | 1.62 | 28.2 | 591 |
