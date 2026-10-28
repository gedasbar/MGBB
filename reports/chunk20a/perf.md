# Chunk 20a: Mirror performance on the Fan hull (headless; 12 s per half-run, three bench scenarios)

Pool limit: 4000 projectiles. A step is one `World.update` at 1/60 s; 16.7 ms is the budget of 60 fps.

| circuit (Fan hull) | recipes | shots / pulse | mean ms | median | p90 | p99 | fps the mean allows | most alive |
|---|---|---|---|---|---|---|---|---|
| Splitter 3 + Fork on Impact | 3 | 3.0 | 0.059 | 0.034 | 0.101 | 0.268 | 17014 | 27 |
| Mirror + Splitter 3 + Fork on Impact | 3 | 6.0 | 0.034 | 0.029 | 0.042 | 0.098 | 29263 | 54 |
| Mirror + Splitter 3 + Fork x2 + Piercing x3 | 3 | 6.0 | 0.040 | 0.036 | 0.059 | 0.091 | 24770 | 115 |
| Mirror + Splitter 3 + Fork + AoE Circle + Chain Lightning | 3 | 6.0 | 0.034 | 0.029 | 0.043 | 0.076 | 29338 | 56 |
| Mirror + Splitter 3 + Fork + Zigzag + Last Breath + Lone Shot | 3 | 6.0 | 0.031 | 0.030 | 0.039 | 0.052 | 31856 | 60 |
