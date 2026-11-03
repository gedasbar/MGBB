# Shipyard, part 1 (chunk 31a)

Part 1 builds the rules and the data of the Shipyard: a new currency (Cores), 3x3 ship chunks, and custom hulls assembled from chunks. It has no Shipyard screen yet (that is part 2): until then chunks and designs are set through the debug panel and the unit tests. A valid design already flies in every mode through the hull picker.

## 1. Cores

- Display name is one constant, `CURRENCY_CORES_NAME` = "Cores" (`src/shipyard/constants.ts`). Code says `cores`.
- **Earned only in Free Fly and in Frontier Free Fly squares**, on top of the credits. Earned from the first minute of the game, so the bank is full when the Shipyard opens (ring 150).
- Free Fly: when wave `w` starts (w >= 2, so wave `w - 1` was survived) the run earns `round(2 x 1.08^(w-2))` Cores (wave 2: 2, wave 10: 4, wave 20: 9, wave 30: 19, wave 50: 87). Reaching a Medal-wave milestone (5, 10, 15, 20, 30, 40, 50) adds `2 x wave` more, EVERY time (the Medal itself is still once per save). The Core Magnet trait multiplies the run's earnings.
- Frontier Free Fly square: one `coresForWave(min(wave equivalent, 30))` for every full 40 s survived, no milestone bonus (a square has no waves; the cap keeps a late square from paying more than a good normal run).
- Quitting mid-run keeps what the run has earned so far, like credits.
- Shown in the Free Fly HUD (`Cores +N`), on the run summary (a line under the credits total) and on the Free Fly home screen ("Cores: used in the Shipyard, which opens at Frontier ring 150").

## 2. Chunks

A chunk is a 3x3 pattern (`_` buildable, `.` outside, `G` generator, `E` ejector, same legend as `data/hullLayouts.ts`), a Cores base price, a growth per copy owned (1.5) and optional effects. Data: `src/data/shipChunks.ts`, plain and commented. Price of the n-th copy = `base x growth^(owned)`.

| kind | chunks |
|---|---|
| Plain | Full, Corridor, Bar, Corner, T-junction, Cross, Ring |
| Generator | Generator (G on the bottom edge; exactly one per ship, bottom row of the build area) |
| Guns | Front Gun (1 ejector, top), Twin Gun (2 ejectors, top corners), Side Gun (ejectors left and right, they fire sideways since 25a) |
| Traits | Wide Open (9 cells, -0.2 pulses/s, -30% damage), Overdrive (3 cells, +0.5 pulses/s), Extra Life (4 cells, one crash forgiven), Core Magnet (5 cells, +10% Cores), Long Barrel (4 cells, +20% shot speed) |

Trait effects add per copy placed (two Overdrives = +1.0 pulses/s; damage and shot speed multiply). Extra Life reuses the captains' Second Chance (the crash is forgiven, 1 s of untouchable time; the brief asks for 1.5 s, see DECISIONS).

## 3. Designs and the hull rules

A design is a 4x4 grid of chunk slots (12 x 12 cells), row-major, `null` = empty slot = outside the hull. Rules (`src/shipyard/design.ts`, pure, every error a plain sentence with rows and columns counted from 1):

1. Exactly one Generator chunk, in the bottom row (row 4).
2. At least one ejector.
3. Every buildable cell and every ejector is connected to the generator through buildable cells, also across chunk edges (a flood fill on the assembled grid; the message names the chunk: "Twin Gun at row 2, column 3 is not connected to the generator").
4. Nothing buildable above an ejector (the same rule as normal hulls; the message names the chunk).

The design compiles into the same `ROWS` text layout as a normal hull (empty outer rows and columns trimmed, the bottom row kept), so the builder, compiler and flight need no special case; the compiled rows also pass `validateHullLayout`.

**Stats** (constants in `src/shipyard/constants.ts`): pulses/s = `5.0 - 0.025 x cells` (cells = buildable `_` cells), never below 1.5, then the traits; shot speed 1.0 then traits; size class from the occupied slots (1-2 small, 3-5 medium, 6-9 big, 10+ huge, the normal hit-radius table).

**Ownership.** Chunks are bought into an inventory (`chunks`: id -> count owned; Cores). A chunk placed in a design uses one copy; the same chunk in two designs counts twice against the inventory per design (a copy is lent to ONE design at a time is NOT enforced: designs are blueprints, each is checked alone against the inventory; see DECISIONS). Up to 3 saved designs. A design flies only when valid and every chunk in it is owned in the numbers it uses.

## 4. Unlock and flying

The Shipyard opens at furthest Frontier ring 150 in any direction (`SHIPYARD_UNLOCK_RING`, the ring Frontier Echo and the skill points read). Cores accumulate before that. A design that is valid, fully owned and unlocked shows up in the hull picker as "Custom 1 / 2 / 3" and can be chosen for any mode. Custom ids are `custom1`..`custom3`; the progress store keeps `ownedHulls` in step with the designs (add when flyable, remove when not), and a registry (`src/shipyard/registry.ts`) puts their layout and stats where the normal hulls' are looked up (`HULL_BUILDERS`, `hulls.ts` stats).

## 5. Save

Version 14 adds `cores` (number), `chunks` (id -> count) and `designs` (3 entries, a design or null). Older saves migrate to 0 Cores, no chunks, no designs (`sanitizeProgress`, tested). Export / Import carries them (it exports the whole progress).

## 6. Prices and income

The numbers and the income model are in `scripts/shipyard-model.ts` (prints the table) and in DECISIONS. Aim: the Cores of about 10-15 hours of Free Fly buy a full sensible ship; a maxed ship is much more.
