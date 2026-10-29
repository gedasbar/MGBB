## Profile (15 s flown per column, headless Node, one thread; a phone is several times slower)

Build: {"plusOne":10,"mirror":true,"fork":true,"bouncing":2,"homing":3,"extender":2}. Mean milliseconds per frame (one `update` step); indented rows are inside the row above them (inclusive times).

### Free Fly, wave 15 start

| | the circuit alone | pool held at >= 8000 |
|---|---|---|
| shots alive (mean) | 1712 | 7510 |
| targets alive (mean) | 10 | 3 |
| **whole update, no instruments: mean ms** | 0.59 | 3.28 |
| whole update, p99 ms | 1.12 | 8.30 |
| whole update, instrumented | 0.95 | 8.16 |
| processField (hit pipeline) | 0.63 | 5.54 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.23 | 2.01 |
| steer (all steering + homing) | 0.25 | 1.99 |
| &nbsp;&nbsp;sweep (fast shots) | 0.13 | 1.24 |
| &nbsp;&nbsp;bounce (retarget) | 0.01 | 0.01 |
| &nbsp;&nbsp;strike (damage) | 0.00 | 0.01 |
| &nbsp;&nbsp;fork spawn | 0.00 | 0.01 |

### Wall tier 100 (855 blocks, held still in front of the guns)

| | the circuit alone | pool held at >= 8000 |
|---|---|---|
| shots alive (mean) | 639 | 7452 |
| targets alive (mean) | 854 | 844 |
| **whole update, no instruments: mean ms** | 0.81 | 6.15 |
| whole update, p99 ms | 2.83 | 13.44 |
| whole update, instrumented | 1.04 | 9.51 |
| processField (hit pipeline) | 0.53 | 5.28 |
| steer (all steering + homing) | 0.36 | 3.44 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.13 | 1.47 |
| &nbsp;&nbsp;sweep (fast shots) | 0.13 | 1.46 |
| &nbsp;&nbsp;bounce (retarget) | 0.03 | 0.09 |
| &nbsp;&nbsp;strike (damage) | 0.02 | 0.05 |
| &nbsp;&nbsp;fork spawn | 0.01 | 0.04 |
| &nbsp;&nbsp;field.bounceInfo | 0.01 | 0.03 |
