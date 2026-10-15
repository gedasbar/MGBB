# Frontier (chunk 15a) – design note

The Frontier is an infinite grid of squares; each square is a wall level. The name is one constant
(`FRONTIER_NAME` in `src/frontier/constants.ts`); every Frontier number lives in that file.

## 1. Coordinates and helpers (`src/frontier/grid.ts`)
- Squares are integer `(x, y)`, origin `(0,0)`, north = negative y (up on screen). Key `"x,y"`.
- `ring(x,y) = max(|x|,|y|)`.
- `sector(x,y)`: `E`/`W` when `|x| > |y|`, otherwise `N`/`S` (ties go to N/S; north when `y < 0`). The origin is `C`.
  Shown in the panel only; no gameplay use yet (15b).

## 2. World: holes (`src/frontier/world.ts`)
- One world seed for every player (`FRONTIER_SEED`), stored in the save so a later chunk can change it.
- The plane is cut into `K x K` blocks (`BLOCK_K = 7`). The **lattice** (x or y a multiple of K) is never a hole,
  so the plane stays connected. A block owns its lattice row/column at its low edge plus a `(K-1) x (K-1)` interior that
  is fenced on all four sides by lattice lines.
- Interior squares are hole candidates by a seeded integer hash (`HOLE_DENSITY = 0.22`). Then a flood fill from the
  interior squares that touch the lattice: an open square the fill does not reach becomes a hole too. So a hole never
  cuts anything off; dead-end pockets (open squares with a single open neighbour) happen naturally and are kept.
- The start area (`ring <= START_SAFE_RING = 2`) has no holes.
- Blocks are generated on demand and cached (`Map<blockKey, Uint8Array>`), never the whole plane. Same seed, same world.

## 3. Medals
- A square carries a Medal marker by seeded hash with chance
  `MEDAL_MIN + (MEDAL_BASE - MEDAL_MIN) * exp(-ring / MEDAL_FALLOFF_RINGS)` (8% near the origin, towards 2%),
  times `MEDAL_POCKET_MUL` (2.5) for a dead-end pocket.
- **Never on the lattice** (my call): the lattice is the always-open road network, medals sit inside the blocks so the
  player has to step off the roads for them. Never on the origin or on a hole.
- Paid once, on the first full clear (captain "double a Medal" chance applies, as on campaign first clears).
  A cleared square has given its Medal, so the save needs no separate medal list; a passed square keeps the marker.

## 4. Square level (`src/frontier/level.ts`)
`squareLevel(x, y, seed)` is pure and returns the parameters; `frontierLevel(params)` builds the `LevelDef` through the
**existing** generator. `generateLevel(tier)` was split into a spec builder plus `buildWall(spec)`; the campaign builds
its spec exactly as before (snapshot test of tiers 1, 10, 25, 50, 100 against hashes taken before the change).
- Effective tier `T = MAP_BASE_TIER (25) + ring * MAP_TIER_PER_RING (0.3) + noise (±2)`, rounded, at least 1.
  0.3 tiers a ring makes the credit reward (1.05^tier) grow about 1.5% a ring, in step with the HP.
- HP: `blockHp(MAP_BASE_TIER) x MAP_HP_GROWTH^ring` (1.015) `x (1 ± 10%)`, whole. Taken from the base tier, not from T,
  because the campaign HP curve stops growing at tier 38 and grows 13% a tier before it.
- Other levers, each with its own seeded roll: wall template (one of the eight campaign templates), rows
  (`rowsForTier(T) x 0.7..1.4`), armor share and shield share (`campaign share at T x 0.3..1.8`, capped at 60%),
  approach speed (`approachSpeedFor(T) x 0.85..1.25`), and spike (1 in 8, never the origin): 1.6x HP and the Ember
  background, the same rules as campaign spikes. Armor value, shield size and the background band come from T exactly as
  in the campaign.
- `kind: 'wall'` is the only square kind now; the type is a union so 15b can add more.

## 5. Progress and save (`src/frontier/state.ts`, `src/econ/progress.ts`)
- States: `hole`, `locked`, `available`, `passed`, `cleared`. The origin is always cleared (free).
  Available = not a hole, not passed/cleared, and an N/E/S/W neighbour is passed or cleared.
- A run on a square (available, passed or cleared; never locked or a hole) books like the campaign: credits per block
  destroyed, kills, runs. Pass → `passed` (no Medal, no fill). Clear → `cleared` (+ Medal once on a medal square).
- Save v7: `frontier: { seed, sq: { "x,y": 1 | 2 } }` (1 passed, 2 cleared), sparse. Older saves load with an empty
  frontier. The sanitiser drops bad keys, bad values and keys that are holes.
- Unlock: campaign tier `MAP_UNLOCK_TIER` (25) passed.

## 6. Screen (`src/screens/FrontierScreen.ts`)
- Entry: a "Frontier" button in the campaign Map's top bar, greyed with "Pass tier 25" until unlocked.
- Same dark grey background. A square is a small block plate. Locked: darker plate. Available: plate with the band colour
  (darkened) as the middle square. Passed: available + lavender outline. Cleared: the whole plate filled with the band
  colour. Band colour (my call): the five block category colours by effective-tier band of 20 tiers (1-20 pathing blue,
  21-40 status teal, 41-60 modifier purple, 61-80 damage salmon, 81+ mitosis amber). Medal: small yellow square in the
  middle until taken. Spike: a small red corner triangle as on the campaign map. Holes: nothing drawn.
- Camera: centre in square units + zoom in px per square (5..110, default 44). Drag pans, wheel and pinch zoom around the
  pointer. Far zoom (< 16 px) draws one flat sprite per square (plus the medal dot from 8 px); near zoom draws the
  nested plate. Sprites come from a pool that only grows; only squares in view are touched. Stats overlay line: drawn
  squares and sprites.
- Panel: coordinates, ring, sector, effective tier, spike, medal, state, and Play / Replay (disabled with the reason).
  Buttons: Recenter, Medal (nearest available medal square), Frontier (available square farthest from the origin).
- Result flow: the existing wall screen and run summary; the summary's first button returns to the Frontier. The camera
  and selection are kept in a module variable for the session.
- Dev (`?debug=1` panel "Frontier" group, and `window.__mgbm` while the screen is open): unlock, clear a square,
  clear a ring, jump the camera.

## 7. Deviations
- Returning to the Frontier goes through the run summary (one tap), not straight back.
- Far zoom stops at 5 px per square (about 110 x 150 squares on screen): one sprite per square keeps the code to one
  drawing path; lower zooms would need a texture.
