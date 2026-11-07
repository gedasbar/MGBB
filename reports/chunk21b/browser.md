## Browser frame cost (headless Chromium, software renderer; 24 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 0-250 | 1 | 53 | 18.8 | 1.34 | 0.94 | 35.9 |
| 250-750 | 1 | 60 | 16.7 | 1.31 | 0.79 | 25.8 |
| 750-1500 | 2 | 57 | 17.6 | 3.02 | 2.25 | 30.5 |
| 1500-2500 | 40 | 42 | 24.0 | 5.38 | 3.11 | 34.3 |
| 2500-3500 | 2 | 40 | 24.8 | 5.42 | 3.17 | 28.2 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 3 | 49 | 20.8 | 4.01 | 2.39 | 32.6 |
| 2500-3500 | 42 | 40 | 26.7 | 5.70 | 3.02 | 57.8 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 3500+ | 44 | 29 | 35.2 | 9.54 | 3.73 | 66.0 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 0-250 | 1 | 36 | 27.5 | 3.34 | 1.94 | 52.4 |
| 250-750 | 4 | 37 | 27.0 | 2.79 | 1.44 | 33.3 |
| 750-1500 | 16 | 35 | 28.8 | 3.88 | 1.86 | 42.4 |
| 1500-2500 | 24 | 34 | 29.3 | 4.22 | 1.99 | 32.9 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 1500-2500 | 37 | 33 | 30.5 | 5.02 | 1.94 | 58.0 |
| 2500-3500 | 8 | 31 | 32.7 | 6.07 | 2.05 | 40.7 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms |
|---|---|---|---|---|---|---|
| 2500-3500 | 1 | 51 | 19.7 | 3.24 | 1.60 | 39.7 |
| 3500+ | 44 | 35 | 35.8 | 9.33 | 2.85 | 70.7 |
