# Game feel pass (chunk 34a)

Visual only: no gameplay number changed. Everything is flat and geometric (art language), pooled and capped. All numbers are in `src/data/feel.ts`.

| Moment | What happens |
|---|---|
| Wall block destroyed | 4-8 shards in the block's colour, spin, fade in about 0.4 s. Armored / shielded / spike block: small shake too |
| Rock killed | shards in the rock's three shades (4 + 2 per 10 px of radius, max 18); a split adds a half burst |
| Shot impact | 2-3 tiny sparks (at most 6 hits a frame) |
| AoE | expanding ring (circle) or outline (Rectangle) for 0.22 s, small shake |
| Muzzle | tiny flash when the gun fires, off above 7 pulses a second |
| Player hit | medium shake |
| Crash | ship hidden, 22 shards, shockwave ring, big shake, 75 ms stop |
| Boss arrival / enrage | medium shake, banner slides in |
| Boss death | 4 chained explosions, 70 shards, big shake, 90 ms stop |
| Big hit (one shot kills with 10x the HP) | 30 ms stop (0.6 s cool-down), gold larger number |
| Tier cleared / passed | flash + "CLEARED" stamp / quiet "PASSED" |

Settings > Graphics: Screen shake Off / Low / Normal, Particles Low / High, Hit stop On / Off.
Performance numbers: see the end of this file.

## Performance (headless Chromium, software renderer; `node e2e/sheet-performance.cjs`, 12 s a scenario; files in `reports/chunk34a/`)

The owner's slow build (see `docs/performance.md`), pool held at 4,000 shots, mean ms a frame (sim = update + sprite sync, render = draw call CPU). "Before" is origin/main, "after" is this chunk with Particles High and Screen shake Normal, "stress" keeps all 600 particles alive every frame (`FX_STRESS=1`, the worst case, far above anything a play session makes).

| scene | before sim / render | after sim / render (particles alive) | stress sim / render (600 alive) |
|---|---|---|---|
| Free Fly wave 15, 4K shots | 2.93 / 1.88 | 3.06 / 1.92 (164) | 3.22 / 1.99 |
| Tier 100 wall, 4K shots | 2.81 / 1.52 | 2.84 / 1.55 (135) | 3.00 / 1.62 |

All of them 59-60 fps. Cost of the feel pass: about +0.1 ms in play, +0.3-0.4 ms with the pool full; the 21b numbers of `docs/performance.md` hold. The Node simulation does not run the feel pass (screens only), so `npm run perf-profile` is unchanged. These say nothing about a phone (a phone is several times slower; the auto-drop to Low particles exists for that).
