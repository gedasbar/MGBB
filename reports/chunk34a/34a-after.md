## Browser frame cost (headless Chromium, software renderer; 12 s per scenario)

### Free Fly, wave 15, pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 50 | 20.2 | 1.68 | 1.18 | 45.9 | 0 |
| 250-750 | 2 | 60 | 16.7 | 1.60 | 0.97 | 18.8 | 64 |
| 750-1500 | 2 | 60 | 16.7 | 2.52 | 1.96 | 18.4 | 251 |
| 1500-2500 | 19 | 60 | 16.7 | 2.70 | 1.95 | 20.5 | 268 |

### Free Fly, wave 15, pool held at at least 2500

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 1500-2500 | 1 | 60 | 16.7 | 2.71 | 1.52 | 18.7 | 212 |
| 2500-3500 | 23 | 60 | 16.7 | 2.76 | 1.82 | 36.6 | 216 |

### Free Fly, wave 15, pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 3500+ | 24 | 60 | 16.7 | 3.06 | 1.92 | 32.3 | 164 |

### Tier 100 wall (held still in front of the guns), pool held at what the circuit reaches

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 0-250 | 1 | 60 | 16.7 | 1.15 | 0.89 | 33.2 | 1 |
| 250-750 | 4 | 60 | 16.7 | 1.63 | 1.07 | 18.7 | 108 |
| 750-1500 | 12 | 60 | 16.7 | 1.82 | 1.16 | 21.3 | 146 |
| 1500-2500 | 7 | 60 | 16.7 | 2.14 | 1.32 | 21.8 | 157 |

### Tier 100 wall (held still in front of the guns), pool held at at least 2000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 1500-2500 | 16 | 60 | 16.7 | 2.21 | 1.19 | 25.6 | 182 |
| 2500-3500 | 8 | 60 | 16.7 | 2.25 | 1.25 | 26.9 | 159 |

### Tier 100 wall (held still in front of the guns), pool held at at least 4000

| shots alive | samples | fps | frame ms | sim ms (update + sprite sync) | render ms (draw call CPU) | worst frame ms | particles alive |
|---|---|---|---|---|---|---|---|
| 2500-3500 | 1 | 60 | 16.6 | 2.25 | 1.30 | 20.1 | 53 |
| 3500+ | 23 | 59 | 16.8 | 2.84 | 1.55 | 25.2 | 135 |
