## Browser frame cost (headless Chromium, software renderer; 12 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 0-250 | 1 | 51 | 19.8 | 0.40 | 0.75 | 35.7 |
| 250-750 | 1 | 60 | 16.6 | 1.87 | 0.76 | 30.3 |
| 750-1500 | 3 | 60 | 16.7 | 2.22 | 1.58 | 21.2 |
| 1500-2500 | 18 | 52 | 19.2 | 3.56 | 2.18 | 50.2 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 2 | 35 | 29.2 | 8.36 | 3.17 | 41.3 |
| 2500-3500 | 15 | 40 | 25.1 | 6.07 | 2.85 | 54.8 |
| 3500+ | 6 | 33 | 30.6 | 8.40 | 3.25 | 53.0 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 3500+ | 22 | 29 | 35.1 | 10.20 | 3.49 | 49.7 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 250-750 | 23 | 38 | 26.4 | 4.55 | 0.87 | 40.4 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 16 | 14 | 86.9 | 54.00 | 1.92 | 279.9 |
| 2500-3500 | 3 | 20 | 51.8 | 28.43 | 1.76 | 229.9 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 3500+ | 12 | 3 | 398.4 | 267.91 | 3.60 | 619.0 |
