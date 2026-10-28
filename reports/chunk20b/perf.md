# Chunk 20b: motion-block performance on the Fan hull (headless; 8 s per half-run, three bench scenarios)

Pool limit: 4000 projectiles. A step is one `World.update` at 1/60 s; 16.7 ms is the budget of 60 fps.

| circuit (Fan hull) | recipes | shots / pulse | mean ms | median | p90 | p99 | fps the mean allows | most alive |
|---|---|---|---|---|---|---|---|---|
| Mirror + Splitter 3 + Fork on Impact (chunk 20a baseline) | 3 | 6.0 | 0.074 | 0.048 | 0.122 | 0.378 | 13467 | 54 |
| Ship Magnet + Mirror + Splitter 3 + Fork on Impact | 3 | 6.0 | 0.044 | 0.037 | 0.063 | 0.196 | 22932 | 72 |
| Ship Magnet x3 + Mirror + Splitter 3 + Fork on Impact | 3 | 6.0 | 0.035 | 0.035 | 0.041 | 0.053 | 28872 | 72 |
| Ship Magnet + Extender x2 + Mirror + Splitter 3 + Fork on Impact | 3 | 6.0 | 0.035 | 0.035 | 0.043 | 0.067 | 28596 | 90 |
| Ship Magnet + Mirror + Splitter 3 + Fork + Persist + Piercing x3 | 1 | 2.0 | 0.027 | 0.026 | 0.029 | 0.038 | 37488 | 24 |
| Accelerator x3 + Mirror + Splitter 3 + Fork (sweep at top speed) | 3 | 6.0 | 0.040 | 0.032 | 0.044 | 0.079 | 25284 | 18 |
