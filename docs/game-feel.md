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
