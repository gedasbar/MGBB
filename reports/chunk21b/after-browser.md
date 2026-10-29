## Browser frame cost (headless Chromium, software renderer; 12 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 0-250 | 1 | 51 | 19.8 | 0.25 | 0.70 | 34.6 |
| 250-750 | 2 | 60 | 16.7 | 1.06 | 0.68 | 27.2 |
| 750-1500 | 3 | 59 | 16.8 | 1.70 | 1.98 | 27.2 |
| 1500-2500 | 18 | 60 | 16.8 | 1.97 | 1.96 | 32.5 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 4 | 54 | 18.7 | 2.70 | 2.57 | 23.1 |
| 2500-3500 | 19 | 50 | 20.1 | 3.13 | 2.74 | 42.7 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 3500+ | 23 | 38 | 26.1 | 4.83 | 3.22 | 40.0 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 250-750 | 18 | 43 | 23.2 | 1.29 | 0.93 | 28.9 |
| 750-1500 | 5 | 43 | 23.5 | 1.49 | 1.02 | 25.8 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 18 | 34 | 29.4 | 4.11 | 2.01 | 44.6 |
| 2500-3500 | 5 | 31 | 32.7 | 5.65 | 2.29 | 43.9 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 3500+ | 22 | 26 | 39.5 | 7.99 | 2.79 | 53.5 |
