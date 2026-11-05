## Browser frame cost (headless Chromium, software renderer; 12 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 50 | 20.1 | 1.12 | 1.20 | 42.8 | 0 |
| 250-750 | 2 | 60 | 16.7 | 1.37 | 1.05 | 19.0 | 0 |
| 750-1500 | 2 | 60 | 16.7 | 2.12 | 1.54 | 18.6 | 0 |
| 1500-2500 | 19 | 60 | 16.7 | 2.58 | 1.79 | 19.5 | 0 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 2500-3500 | 24 | 60 | 16.7 | 2.65 | 1.73 | 33.1 | 0 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 2500-3500 | 1 | 60 | 16.7 | 2.64 | 1.89 | 18.2 | 0 |
| 3500+ | 23 | 60 | 16.7 | 2.93 | 1.88 | 24.3 | 0 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 60 | 16.7 | 2.91 | 1.69 | 28.7 | 0 |
| 250-750 | 4 | 60 | 16.7 | 1.15 | 0.78 | 21.6 | 0 |
| 750-1500 | 14 | 60 | 16.7 | 1.54 | 0.98 | 23.7 | 0 |
| 1500-2500 | 5 | 60 | 16.7 | 1.83 | 1.07 | 23.4 | 0 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 1500-2500 | 16 | 60 | 16.7 | 2.44 | 1.32 | 24.4 | 0 |
| 2500-3500 | 8 | 60 | 16.6 | 2.62 | 1.42 | 23.2 | 0 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 3500+ | 24 | 60 | 16.8 | 2.81 | 1.52 | 24.3 | 0 |
