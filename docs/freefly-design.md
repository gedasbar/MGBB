# Free Fly overhaul: design note (chunk 10a)

Free Fly becomes endless survival in **waves**. One fixed screen (540 px wide), no wrap, enemies confined to the
screen, the ship and its spawn safety unchanged. All numbers below are constants in `src/data/species.ts` and
`src/data/waves.ts`; the measured table at the end comes from `npm run balance-econ` (bot run, step J3).

## 1. Species roster

`u` = the HP of a basic rock at the current tier (`rockHp(tier)`, 250 at tier 1, x1.055 per tier). Sizes are radii in px.
A rock splits only on the lethal hit (existing mitosis rule). Armor and shield are the wall's model and marks:
armor 10 (the engine's armor scale, so direct damage is halved), light-grey `#d4d4d8` frame that thins as Corrosion
strips it; shield pool = 0.5 x HP, cyan `#5fd4e8` bar, regenerates after 2 s without a hit at 25 %/s (wall constants).

| Species | Silhouette | Size | HP | Movement | Split rule | Armor / shield | Reward x | First wave |
|---|---|---|---|---|---|---|---|---|
| **Rock** (today's) | 6-9 facets, round | 20 (kids 15) | 1.0 u | falls 40 px/s, sways +-30 | 2 kids at 0.55 HP, down to generation 4 (1+2+4+8 bodies) | no / no | 1.0 | 1 |
| **Darter** | thin kite pointing down | 11 | 0.35 u | dives 150 px/s, aimed at where the ship was when it spawned (sideways <= 70 px/s) | none | no / no | 0.3 | 2 |
| **Drifter** | flat wide lozenge | 18 (kids 13) | 0.8 u | falls 26 px/s, slides side to side 110 px/s, bounces off the screen sides | 2 drifters at 0.55 HP, once | no / no | 0.6 | 3 |
| **Mother** | big, 9-12 facets | 34 | 3.0 u | falls 20 px/s, slow sway | 3 Brood (r 20, 0.4 HP), each splits once more into 2 (r 13, 0.5 HP): 1+3+6 bodies | no / no | 2.0 (brood too) | 4 |
| **Ironclad** | blocky, 5-6 facets | 23 | 1.2 u | falls 32 px/s | the shell cracks into 2 **unarmored** basic rocks (gen 2, 0.55 HP) which go on splitting as rocks | **armor** / no | 2.0 (shell) | 6 |
| **Warden** | near-regular hexagon | 21 (kids 15) | 1.0 u | falls 36 px/s, sways | 2 Wardens at 0.55 HP with their own shields, once | no / **shield** | 1.2 | 7 |
| **Budder** (new idea) | lumpy, 8-10 facets | 26 | 1.5 u | falls 18 px/s | none on death; while alive and on screen it **buds** a small rock (gen 3, 0.25 of its HP) every 3.5 s, up to 3 | no / no | 0.8 | 8 |

Why each one plays differently: the Darter punishes standing still (it aims at you) but dies in one or two shots;
the Drifter is hard to keep in a straight gun's line; the Mother is a slow HP sponge whose 9 children flood the
lane if you kill it late; the Ironclad halves plain damage until its shell breaks (Armor-Piercer, Pure Converter,
Corrosion matter); the Warden's shield regenerates if you spread fire (Shield-Breaker, burst); the Budder is a
priority target: every 3.5 s you leave it alive it adds a rock to the field.

Leak damage (a body reaching the bottom edge) stays the existing size-by-generation rule (15 / 10 / 5 / 5 % of the
hull), times a species factor: Darter x0.34 (5 %), Mother x1.33 (20 %), all others x1. Contact damage stays 10.

Colours stay in the warm muted rock family with small shifts per species (Darter redder, Drifter olive, Mother dusky
rose, Ironclad grey-brown, Warden pale sand, Budder amber-moss). Cracks, hit flash, fragments as today.

## 2. Wave director

- **Waves are fixed-length: 40 s.** Wave N runs from `40 (N-1)` s; the HUD counts down to the next one. A gun that
  clears a wave early waits (no early call): income per wave is capped by what the wave holds.
- **Spawn budget** in points (a basic Rock = 4 points): `budget(N) = 6 + 3 (N - 1)`. Never decreases.
  Point costs (about the family's total HP): Darter 1, Drifter 2, Warden 3, Rock 4, Budder 4, Ironclad 6, Mother 9.
- **Composition:** at the wave start the director draws species by weight from the unlocked ones (Rock 10, Darter 6,
  Drifter 5, Ironclad 4, Warden 4, Budder 3, Mother 2) until the budget is spent. A species' first wave always
  contains it, first. Spawns are spread evenly over the first 30 s of the wave (+-0.6 s jitter); the last 10 s are a
  breather. When more than 90 bodies are alive the director holds new spawns.
- **Special waves (every 5th):** odd multiples of 5 (5, 15, 25 ...) are a **Swarm**: budget x1.25 spent only on
  Darters and Pebbles (a basic rock born at generation 3, radius 15, 1 point), spawned within 20 s. Even multiples
  (10, 20 ...) are a **Mother event**: budget x1.25 spent on Mothers only (at least 2), in two groups at 0 s and 12 s.
- **Difficulty vs tier:** Free Fly keeps its world tier (1 + one per 15 s survived). A spawn's HP is
  `species HP x rockHp(tier) x 1.08^(N-1)`; the extra 8 % per wave makes HP pressure grow ~1.45x per wave
  (tier ~1.15, wave HP 1.08, count ~1.15), so a gun with 4x the DPS lasts about 3.5 waves longer, not forever.
- **Placement:** x uniform inside `[r + 8, 540 - r - 8]`, y = `-r` (just above the top edge, entering downward).
- **Determinism:** the director owns a `Mulberry32(seed)`; the whole schedule of a wave (species, time, x) is drawn
  at its start from that RNG only. Same seed, same waves. Free Fly picks a new seed per run.

## 3. Rewards

- **Per kill:** `rockReward(1 + (tier - 1) x 0.4, generation) x species reward x` (the existing per-generation table;
  the reward tier grows at 0.4 of the HP tier, added in the J3 adjustment, see section 5). A Rock family therefore pays what it pays today; the other multipliers put every species at about the
  Rock's credits per HP, x1.2 for the annoying ones (Darter, Drifter, Warden). Children of another species (Ironclad
  shell -> Rocks, Budder buds -> Rocks) pay as Rocks.
- **Wave bonus:** reaching wave 5, 10, 15 ... pays `10 x N / 5` credits (10, 20, 30 ...), shown on the banner.
- **Targets** (from the brief): bare Dart (one Flat+, the fresh-save gun), decent 3-minute run ~3x today's Free Fly
  pay; today a bot with the Dart earns about 12 credits and dies after ~41 s to leaks (decision 93 says ~20 per
  60 s run), so the target is **about 55-65 credits** for a 3-minute Dart run. Twin (70) after 1-2 runs; Prong (350)
  after 6-8 runs.

### Tension in the targets (checked, not asserted)

A run lasts until the hull is gone, and credits come from kills, so a gun with 4x the DPS (the Twin fires 4 times as
fast as the Dart) both kills more per wave and survives more waves. An analytic estimate (spawn HP per wave against
60 % of the gun's DPS landing, half of what is not killed leaking) with the numbers above:

| Gun (est. DPS) | waves survived | credits per run |
|---|---|---|
| Dart + Flat+ (101) | ~5 (3:20) | ~80 |
| Twin + Flat+ (404) | ~8 | ~330 |
| Twin + 2 Flat+ (804) | ~11 | ~800 |

So "Twin after 1-2 runs" holds, but "Prong after 6-8 runs" only holds if runs are counted as ~3-minute Dart-length
runs (about 20 minutes of play): a Twin run is worth 3-4 Dart runs. Flattening that fully would mean credits that
do not grow with the waves you reach, which removes the reason to push further. **Chosen compromise:** keep growth,
make HP pressure steep (above), and judge the Prong target as *play time*: about 6-8 runs' worth of 3 minutes.
The bot table in section 5 is the real check; constants get one adjustment pass in J3.

## 4. Expected feel (to be confirmed by the bot)

| Gun | after 3 min | how it feels |
|---|---|---|
| Dart + Flat+ (1 shot/s) | wave 5 (Swarm), hull low, dies wave 5-6 | pick targets, chip Darters, let pebbles leak |
| Twin + Flat+ | wave 5 comfortably, dies ~wave 8 | clears early waves, Mothers and Ironclads start to push back |
| Prong (Splitter 3, Flat+, Turn L) | wave 5, dies ~wave 8 | two streams cover the width; same DPS as the Twin + Flat+ |

## 5. Measured (bot, step J3)

`npm run balance-econ`, deterministic bot (`src/debug/freeflyBot.ts`: dodges what would touch the ship in the next
0.7 s, otherwise lines up under the body closest to leaking; top speed 650 px/s), 5 seeds per gun, mean.

**Before the adjustment** (reward at the plain tier): Dart 66 per run (2:48), Twin + Flat+ 254 (5:05): Prong after
~3-4 runs. **One adjustment:** Free Fly pays kills at reward tier `1 + (tier - 1) x 0.4` (HP keeps the plain tier),
so late waves are worth less per HP and a strong gun's long run snowballs less. At tier 1 nothing changes.

| Gun | est. DPS | survived | wave @ 1 / 3 / 5 min | credits @ 1 / 3 / 5 min | credits per run | per min |
|---|---|---|---|---|---|---|
| Dart + Flat+ (fresh save) | 101 | 2:48 | 2 / dead / dead | 13 / - / - | 58 | 20.7 |
| Twin + Flat+ | 404 | 5:04 | 2 / 5 / 8 | 16 / 97 / 193 | 190 | 37.4 |
| Twin + 2 Flat+ | 804 | 6:09 | 2 / 5 / 8 | 14 / 95 / 223 | 320 | 51.9 |
| Prong (Splitter 3, Flat+, Turn L) | 408 | 5:02 | 2 / 5 / 8 | 16 / 97 / 193 | 193 | 38.2 |

Against the targets:
- **3-minute Dart run ~3x today: met.** 58 credits in a 2:48 run (today: ~12 in 41 s, ~20 per minute).
- **Twin after 1-2 runs: met** (2 Dart runs = 116).
- **Prong after 6-8 runs: not met in runs, met in play time.** The natural path (2 Dart runs, Twin, Twin runs, a 2nd
  Flat+ on the way) reaches 350 after **4 runs** but **17 minutes** of play, which is 6 Dart-length runs. A Twin run is
  worth ~3 Dart runs because it lasts twice as long at ~1.8x the income per minute; making it pay less would make the
  better gun feel pointless. Left as a known gap for the owner to judge in play.
- The Prong with the blocks a player can have then (Splitter 3, Flat+, Turn L) plays like a Twin + Flat+ (same DPS,
  two streams); a Twin with two Flat+ is stronger. That is the hull's 3-cell layout, not part of this chunk.
