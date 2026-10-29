## Profile (20 s flown per column, headless Node, one thread; a phone is several times slower)

Build: {"plusOne":10,"mirror":true,"fork":true,"bouncing":2,"homing":3,"extender":2}. Mean milliseconds per frame (one `update` step); indented rows are inside the row above them (inclusive times).

### Free Fly, wave 15 start

| | the circuit alone | pool held at >= 2500 | pool held at >= 4000 |
|---|---|---|---|
| shots alive (mean) | 1729 | 2942 | 3990 |
| targets alive (mean) | 9 | 5 | 4 |
| **whole update, no instruments: mean ms** | 0.91 | 2.64 | 3.50 |
| whole update, p99 ms | 1.66 | 4.51 | 6.78 |
| whole update, instrumented | 2.07 | 5.72 | 7.06 |
| processField (hit pipeline) | 1.48 | 4.41 | 5.51 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.54 | 1.59 | 1.90 |
| steer (all steering + homing) | 0.49 | 1.06 | 1.24 |
| &nbsp;&nbsp;spatialHash.query | 0.30 | 0.86 | 0.97 |
| &nbsp;&nbsp;scan (modifier list read) | 0.18 | 0.52 | 0.68 |
| &nbsp;&nbsp;sweep (fast shots) | 0.17 | 0.51 | 0.66 |
| &nbsp;&nbsp;fork spawn | 0.01 | 0.04 | 0.04 |
| &nbsp;&nbsp;bounce (retarget) | 0.01 | 0.02 | 0.02 |
| gun.fire (spawn) | 0.01 | 0.02 | 0.00 |
| &nbsp;&nbsp;strike (damage) | 0.01 | 0.01 | 0.01 |

### Wall tier 100 (855 blocks, held still in front of the guns)

| | the circuit alone | pool held at >= 1000 | pool held at >= 2000 | pool held at >= 4000 |
|---|---|---|---|---|
| shots alive (mean) | 620 | 1166 | 2375 | 3969 |
| targets alive (mean) | 853 | 850 | 845 | 845 |
| **whole update, no instruments: mean ms** | 3.41 | 7.52 | 14.47 | 22.49 |
| whole update, p99 ms | 5.81 | 21.21 | 35.67 | 44.13 |
| whole update, instrumented | 4.00 | 8.15 | 16.51 | 26.29 |
| steer (all steering + homing) | 3.06 | 6.50 | 13.24 | 21.06 |
| &nbsp;&nbsp;field.collectNear (homing search) | 0.80 | 2.32 | 4.74 | 7.62 |
| processField (hit pipeline) | 0.80 | 1.47 | 2.96 | 4.71 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.15 | 0.26 | 0.52 | 0.85 |
| &nbsp;&nbsp;sweep (fast shots) | 0.11 | 0.21 | 0.43 | 0.73 |
| &nbsp;&nbsp;scan (modifier list read) | 0.11 | 0.21 | 0.42 | 0.69 |
| &nbsp;&nbsp;fork spawn | 0.01 | 0.04 | 0.11 | 0.10 |
| &nbsp;&nbsp;bounce (retarget) | 0.03 | 0.05 | 0.09 | 0.10 |
| &nbsp;&nbsp;strike (damage) | 0.02 | 0.03 | 0.05 | 0.05 |
| &nbsp;&nbsp;field.bounceInfo | 0.01 | 0.02 | 0.04 | 0.04 |
| gun.fire (spawn) | 0.01 | 0.01 | 0.01 | 0.00 |
