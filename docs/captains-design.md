# Captains (chunk 13a): design note

Written before the code. Numbers here are the ones the code uses (`src/captains/data.ts`); the code is the source of truth
if they ever differ, and DECISIONS.md lists every deviation from the brief.

## 1. Damage numbers (what "+1 base damage per hero level" means)

> **Chunk 14a:** the numbers below are from before the small-number rescale (Flat+ was +100, HP x50). Flat+ is now +1 and
> `HERO_LEVEL_BASE_DAMAGE` is **0.5** (level 10 = base 6). See docs/balance-damage.md, section 1c.

A projectile starts at base damage **1** (`newPacket()` in `engine/compilerTypes.ts`); blocks add to or multiply it.

| gun (Dart, 1 Flat+ slot, 1 shot / s)         | damage per shot | rock HP at tier 1 |
|----------------------------------------------|-----------------|-------------------|
| Dart, bare (nothing in the slot)             | 1               | 250               |
| Dart + Flat+ L1                              | 101             | 250 (3 shots)     |
| Dart + Flat+ L10                             | 1001            | 250 (1 shot)      |

`HERO_LEVEL_BASE_DAMAGE = 1` is kept literal: it is added to the 1 the generator starts with, before any block.

* Bare gun: hero level 10 takes a shot from 1 to **11 (x11)**. Huge, but nobody flies a bare gun.
* Dart + Flat+ L1: 101 -> **111 (+10% at hero level 10)**. +1% per level. Small, noticeable only on paper.
* Flat+ L10 gun: 1001 -> 1011 (+1%). Negligible. A Percent x block multiplies the bonus too (x2.5 turns +10 into +25).

So the hero level is a **small, safe, flat bonus that matters most early** (the Dart) and fades into the noise with a
built gun. That is on purpose: the real power of a captain lives in its option tiers. Said plainly: I did not make the
level stronger than the brief asked.

## 2. Effect menu (everything below already exists in the game; each effect has one hook)

All effects are data `{ type, value }`. `computeRunModifiers()` (pure) sums them into a `RunModifiers` struct that is handed
to the world at run start. Nothing in gameplay code knows a captain or option id.

| effect type          | value        | RunModifiers field   | hook (where it is read)                                                                  |
|----------------------|--------------|----------------------|-------------------------------------------------------------------------------------------|
| `baseDamage`         | +n           | `baseDamage`         | `compile(grid, { baseDamage })`: generator's packet starts at 1 + n (World, WallWorld)    |
| `damagePct`          | +fraction    | `damageMul`          | `ProjectileSystem.strike`: every hit (shots, chain, pulses)                                |
| `fireRatePct`        | +fraction    | `fireRateMul`        | pulse period in `World.update` / `WallWorld.update`                                        |
| `projSpeedPct`       | +fraction    | `projSpeedMul`       | `Gun.spawn` speed                                                                         |
| `vsArmorPct`         | +fraction    | `vsArmor`            | `strike`: target has armor left                                                           |
| `vsShieldPct`        | +fraction    | `vsShield`           | `strike`: target has shield left                                                          |
| `vsFragmentPct`      | +fraction    | `vsFragment`         | `strike`: Free Fly rock of generation >= 2 (`FRAGMENT_GENERATION`)                         |
| `wallDamagePct`      | +fraction    | `wallDamageMul`      | WallWorld only (an extra `damageMul` on top)                                              |
| `creditPct`          | +fraction    | `creditMul`          | kill reward in `World` and block reward in `WallWorld.destroyBlock`                       |
| `wallCreditPct`      | +fraction    | `wallCreditMul`      | `WallWorld.destroyBlock` only                                                             |
| `waveBonusPct`       | +fraction    | `waveBonusMul`       | the credits paid when a wave 5/10/15... starts (`waveBonus`)                              |
| `passCreditsPct`     | +fraction    | `passCredits`        | `WallWorld.end`: a PASSED or CLEARED level pays this share of the credits the run earned, once (see section 6) |
| `medalDoublePct`     | +chance      | `medalDouble`        | every Medal award (first clear, Free Fly milestone), rolled with an injected RNG          |
| `secondChance`       | +n charges   | `secondChances`      | WallWorld: a touched live block is destroyed, run goes on, 1 s invulnerability. World: the first enemy contact deals no damage, 1 s invulnerability |
| `spawnInvulnSec`     | +seconds     | `spawnInvuln`        | `beginControl()` (both worlds): `GRACE_TIME` + this                                       |
| `hullPct`            | +fraction    | `hullMul`            | Free Fly max hull. Leak damage keeps using 100 HP as its base (more hull = more contacts survived, not bigger leaks) |
| `killHeal`           | +hull per kill | `killHeal`         | Free Fly kill loop, capped at max hull                                                    |
| `boostZonePct`       | +fraction    | `boostZone`          | wall: `TOP_ZONE` x (1 + this): the top-edge speed boost starts lower on the screen        |

Stacking: values of the same type add. `medalDouble` adds and is capped at 100%. `secondChances` adds (a captain can hold up
to three).

## 3. The four captains

Shared rules: hero level max **10**, `+0.5` base damage per level (chunk 14a; it was `+1`). Hero-level cost (Medals) to go from level n to n+1:
`1, 1, 2, 2, 3, 3, 4, 4, 5, 5` (30 in all). Option tier kill thresholds: **0 / 300 / 1500 / 6000** lifetime kills of that
captain. Option costs by tier: **2 / 4 / 7 / 11** Medals (brief suggested 3 / 5 / 8 / 12, see section 6).

Unlock cost: Cadet 0 (owned from the start), Bulwark 10, Gunner 25, Pathfinder 50.

### Cadet (free) - economy
*Catch:* money and Medals. Plays like the starter: no change in how the gun fires, only in what a run pays.

| tier (kills) | option A                                   | option B                                       |
|--------------|--------------------------------------------|------------------------------------------------|
| 1 (0)        | **Prospector** +5% credits                 | **Lucky Charm** 10% chance a Medal is doubled  |
| 2 (300)      | **Wave Dividend** +50% wave bonus credits  | **Toll Collector** +15% credits when a wall is passed or cleared |
| 3 (1500)     | **Broker** +10% credits                    | **Fortune's Favour** 25% Medal double chance    |
| 4 (6000)     | **Tycoon** +20% credits, +25% wave bonus   | **Mint** 40% Medal double chance, +5% credits   |

### Bulwark (10 Medals) - survival
*Catch:* mistakes are forgiven. The only captain with SECOND CHANCE; slower to kill things, hardest to end.

| tier (kills) | option A                                              | option B                                        |
|--------------|-------------------------------------------------------|-------------------------------------------------|
| 1 (0)        | **Second Chance** 1 charge                            | **Steady Start** +1 s spawn invulnerability     |
| 2 (300)      | **Plating** +30% hull (Free Fly)                      | **Salvage** each kill heals 0.5 hull (Free Fly) |
| 3 (1500)     | **Second Wind** +1 Second Chance charge               | **Fortress Start** +2 s spawn invuln, +15% hull |
| 4 (6000)     | **Aegis** +1 Second Chance charge, +25% hull          | **Field Repair** each kill heals 1.0 hull, +20% hull |

### Gunner (25 Medals) - offence
*Catch:* raw output against what is in front of you; no safety net, no money.

| tier (kills) | option A                                   | option B                                           |
|--------------|--------------------------------------------|----------------------------------------------------|
| 1 (0)        | **Hot Barrel** +8% damage                  | **Quick Trigger** +8% fire rate                    |
| 2 (300)      | **Armor Breaker** +30% damage vs armor     | **Shield Cracker** +30% damage vs shields          |
| 3 (1500)     | **Fragment Hunter** +30% vs fragments      | **Heavy Rounds** +10% damage                       |
| 4 (6000)     | **Overdrive** +15% fire rate, +20% projectile speed | **Siege Rounds** +12% damage, +12% vs armor, +12% vs shields |

### Pathfinder (50 Medals) - wall specialist
*Catch:* campaign walls. In Free Fly it is only the +1/level and projectile speed; in a wall it gets faster passes and pays.

| tier (kills) | option A                                   | option B                                         |
|--------------|--------------------------------------------|--------------------------------------------------|
| 1 (0)        | **Slipstream** boost zone +30%             | **Long Reach** +20% projectile speed             |
| 2 (300)      | **Wall Breaker** +12% damage vs wall blocks | **Toll Road** +25% credits when a wall is passed or cleared |
| 3 (1500)     | **Rip Current** boost zone +30%            | **Quarry** +20% credits from wall blocks         |
| 4 (6000)     | **Full Throttle** boost zone +40%, +25% pass credits | **Demolition** +20% damage vs wall blocks |

Option ids and exact data: `src/captains/data.ts`. Playstyle summary: Cadet = bank more per run, Bulwark = survive
mistakes and long Free Fly runs, Gunner = clear faster, Pathfinder = fly walls fast and get paid for passing.

## 4. Medal budget

Obtainable Medals: campaign 1 per first full clear (100 tiers) + the Free Fly milestones (section 5, 23) = **123**,
before the doubling chances (which only help Cadet's players).

| item                                              | cost |
|---------------------------------------------------|------|
| Captain unlocks (Bulwark 10, Gunner 25, Pathfinder 50) | 85   |
| Hero levels 1-10, per captain                     | 30   |
| All 8 options of one captain (2+4+7+11, twice)    | 48   |
| One captain complete (levels + both options of every tier) | 78 |
| Four captains complete (4 x 78 + 85)              | **397** |

So everything costs about **3.2x** every Medal that exists. A player cannot own the lot even by clearing the whole
campaign: scarcity is intended. One fully built captain (78) is reachable by about tier 60-70 plus a few Free Fly
milestones. What the player actually decides: who to unlock, and which option of each pair.

Early game: hero level 1 costs **1 Medal** (one first clear or the wave-5 milestone); the first tier-1 option costs
**2** (two clears, or wave 5 + one clear). The tier-2 options of a captain need 300 kills first: about two Twin runs
(the Free Fly bot makes 177 to 189 kills with a Twin + Flat+) or one carved wall.

## 5. Free Fly Medal milestones (first time only, per save)

| wave | 5 | 10 | 15 | 20 | 30 | 40 | 50 |
|------|---|----|----|----|----|----|----|
| Medals | 1 | 2 | 2 | 3 | 4 | 5 | 6 |  (23 in all)

Waves are on a 40 s clock (`WAVE_TIME`), so wave 5 starts at 2:40, 10 at 6:00, 20 at 12:40 and 50 at 32:00 of survival.
What the deterministic bot (`debug/freeflyBot.ts`, seed 1, run until dead) reaches:

| gun                                   | dies at | wave |
|---------------------------------------|---------|------|
| Dart + Flat+ (fresh save)             | 2:48    | 5    |
| Twin + Flat+                          | 4:46    | 7-8  |
| Twin + 2 Flat+                        | 6:10    | 9-10 |
| Shuttle starter, Flat+ L1             | 5:05    | 8    |
| Shuttle starter, Flat+ L5             | 7:55    | 12   |
| Shuttle starter, Flat+ L10            | 8:56    | 14   |

Reading: wave 5 comes with the very first gun (one Medal: a good start), wave 10 needs a Twin with two Flat+, 15 and 20
need a properly upgraded circuit and a human better than the bot, 30-50 are aspirational (a 20 to 32 minute run). That is
the right shape for a 7-step ladder, so the table is **unchanged**. The 23 Medals are about 19% of the supply; the
upper steps are a bonus for strong players, not something the economy depends on.

## 6. Deviations from the brief's suggestions (all in DECISIONS.md)

* Tier costs 2 / 4 / 7 / 11 instead of 3 / 5 / 8 / 12, so the first option is two clears away (the brief asked for the
  first upgrade to be affordable "after the first tier clear or two").
* Medals become a spendable balance. The old load rule "never more Medals than cleared tiers" is gone (it would erase the
  Medals a player earned from Free Fly); old saves start at their cleared-tier count, as before.
* `hullPct` does not enlarge leak damage (leaks use a fixed 100 HP base), otherwise more hull would not help against leaks.
* **One balance pass after `npm run balance-captains`** (`reports/chunk13a/`): the first version paid the pass bonus as a share of
  the wall's full value, which made carved passes pay 4x to 28x the baseline (a carved pass destroys about 3% of the blocks).
  It is now a share of the credits the run earned (Toll Collector 15%, Toll Road 25%, Full Throttle 25%), and Wall Breaker
  (15 -> 12%), Demolition (25 -> 20%) and Siege Rounds (15 -> 12%) were trimmed. After the pass nothing is above 2x of the
  baseline; the strongest builds are about x1.45 damage per second and x1.5 Free Fly credits.
