## Profile (20 s flown per column, headless Node, one thread; a phone is several times slower)

Build: {"plusOne":10,"mirror":true,"fork":true,"bouncing":2,"homing":3,"extender":2}. Mean milliseconds per frame (one `update` step); indented rows are inside the row above them (inclusive times).

### Free Fly, wave 15 start

| | the circuit alone | pool held at >= 2500 | pool held at >= 4000 |
|---|---|---|---|
| shots alive (mean) | 1779 | 2814 | 3758 |
| targets alive (mean) | 10 | 5 | 4 |
| **whole update, no instruments: mean ms** | 0.56 | 1.05 | 2.28 |
| whole update, p99 ms | 0.93 | 2.03 | 4.26 |
| whole update, instrumented | 0.94 | 3.09 | 3.92 |
| processField (hit pipeline) | 0.63 | 2.11 | 2.64 |
| steer (all steering + homing) | 0.25 | 0.77 | 0.98 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.24 | 0.77 | 0.97 |
| &nbsp;&nbsp;sweep (fast shots) | 0.13 | 0.45 | 0.58 |
| &nbsp;&nbsp;bounce (retarget) | 0.01 | 0.02 | 0.01 |
| &nbsp;&nbsp;fork spawn | 0.00 | 0.01 | 0.01 |
| &nbsp;&nbsp;strike (damage) | 0.00 | 0.01 | 0.01 |

### Wall tier 100 (855 blocks, held still in front of the guns)

| | the circuit alone | pool held at >= 1000 | pool held at >= 2000 | pool held at >= 4000 |
|---|---|---|---|---|
| shots alive (mean) | 678 | 1190 | 2404 | 3725 |
| targets alive (mean) | 853 | 851 | 847 | 848 |
| **whole update, no instruments: mean ms** | 0.74 | 1.11 | 2.13 | 2.95 |
| whole update, p99 ms | 2.59 | 2.46 | 4.12 | 6.55 |
| whole update, instrumented | 1.02 | 1.67 | 3.27 | 4.58 |
| processField (hit pipeline) | 0.54 | 0.91 | 1.80 | 2.55 |
| steer (all steering + homing) | 0.36 | 0.60 | 1.20 | 1.61 |
| &nbsp;&nbsp;field.hitCircle (collision) | 0.14 | 0.26 | 0.52 | 0.74 |
| &nbsp;&nbsp;sweep (fast shots) | 0.13 | 0.22 | 0.45 | 0.70 |
| &nbsp;&nbsp;bounce (retarget) | 0.03 | 0.04 | 0.07 | 0.04 |
| &nbsp;&nbsp;strike (damage) | 0.01 | 0.02 | 0.03 | 0.02 |
| &nbsp;&nbsp;field.bounceInfo | 0.01 | 0.01 | 0.03 | 0.01 |
| &nbsp;&nbsp;fork spawn | 0.01 | 0.01 | 0.02 | 0.02 |
