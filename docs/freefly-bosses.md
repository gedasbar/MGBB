# Free Fly bosses (chunk 32b)

Builds on `docs/freefly-v2.md` (enemy bullets, Gunner, Shielder, Leech, themes). Every 10th wave of normal Free Fly (10, 20, 30 ...)
is a **boss wave**. Frontier Free Fly squares have no bosses. All numbers are in `src/data/bosses.ts`; the behaviour is
`src/game/boss.ts` (`BossFight`, no Pixi), the drawing `src/ui/bossArt.ts`.

## 1. The wave

- **Normal spawning stops.** `planWave` returns nothing for a boss wave and the carried-over queue is dropped. Rocks of the
  wave before stay until they fall or die.
- The boss slides in from above (90 px/s), a banner shows its name and a line, and a **health bar** sits under the HUD box (name on the left,
  "enrages in 1:24" on the right; the bar turns red when enraged). The HUD wave line reads "Wave 10  BOSS".
- **The wave ends when the boss dies.** There is no 40 s timer (`WaveDirector.holding`); the next wave starts 4 s after the kill
  (`BOSS_BREATHER`). The Mother event that waves 10, 20 ... used to be is gone (Mothers still appear in normal draws).
- **Enrage at 90 s** (counted from the boss's arrival): its attack waits halve, it moves 1.5x faster, enemy bullets are 1.2x faster,
  the bar turns red, a banner says ENRAGED, and **it starts to sink** (7 px/s, the Colossus 22 px/s). A boss whose lowest point reaches
  the bottom edge ends the run (hull 0; the god cheat ignores it). So a build that cannot kill it loses, also against the Colossus, which never attacks.
- **Rotation:** wave 10 Hive Mother, 20 Bastion, 30 Swarm Queen, 40 Colossus, 50 Hive Mother again ... Each round the boss has
  x1.5 HP (`BOSS_ROUND_HP_MUL`) and attack waits x0.92 (`BOSS_ROUND_ATTACK_MUL`), on top of the wave's own growth.
- **HP** = the HP a plain wave of that number holds in total (`waveBudget / 4` basic rocks at the wave's rock HP, the same growth as the rocks)
  x `hpWaves` x the round's factor: Hive Mother 2, Bastion 1.4, Swarm Queen 1.4, Colossus 7 (an enormous amount, no attacks).
  The Hive Mother's number is higher than the others because her closed core takes 10 % of a hit; the Bastion's plates and the Queen's escorts also eat shots.

## 2. How a boss is built (so every block just works)

A boss is a group of ordinary bodies in the world's enemy list with `MitosisEnemy.bossRole` set, so the hit pipeline, Chain Lightning, AoE,
Orbit, Mines, statuses and every block that finds enemies work unchanged. The generic enemy loop skips them (they are placed by `BossFight`,
only contact damage still runs) and the kill / leak code never sees them.

- **Conduit** bodies carry the boss's HP: each frame their HP is set to the boss's HP and what they lost (after `dmgTakenMul`) is taken off the boss
  in `afterHits()`. Several conduits (the Colossus' five circles) share one pool.
- **Plate** bodies (the Bastion's ring) are invulnerable: HP reset every frame, `dmgTakenMul` 1e-9, so a shot that touches one is used up and does nothing.
  Homing and Chain Lightning never pick a plate (`targets.ts`).
- **Escort** bodies (the Swarm Queen's) have their own HP; when one dies it is removed (no kill, no credits, no split) and returns later.
- A boss counts as one kill; its bodies pay nothing.

## 3. The four bosses

| Boss | Look | Mechanic |
|---|---|---|
| **HIVE MOTHER** (wave 10) | big amber 12-sided body with seven pods, an armoured lid over her core | **Core:** closed 6 s, open 3.5 s, repeating. Closed she takes 10 % of every hit; open, 100 %. A slow spread of 5 bullets at the ship every 2.4 s (0.75x speed). Makes a splitting rock beside her every 4.5 s while fewer than 4 are alive (35 % of a plain rock's HP). |
| **BASTION** (wave 20) | steel-blue hexagon core with a red eye, ring of 10 octagonal plates | A ring of 16 places round the core, 3 gaps of 2 places (10 plates); it **turns** 0.45 rad/s (x1.5 enraged) while the whole thing sways. A shot reaches the core only through a gap. Every 2.8 s a **ring of bullets leaves through the gaps** (9 bullets: each gap's places and the middle between them), not through plates. Contact with a plate hurts. |
| **SWARM QUEEN** (wave 30) | magenta winged body with a crown and a sting, six small orange shards round her | **Fast** (170 px/s), flying to a new point in the upper screen every 2.2 s. Six escorts orbit her (shots hit them first); a killed escort **comes back after 9 s**. An **aimed burst** of 4 (7 degrees apart, 1.3x speed) every 1.9 s. |
| **COLOSSUS** (wave 40) | huge brown rectangle with seams and rivets | **No attacks.** 7 plain waves' worth of HP, drifting side to side at 40 px/s. A pure damage check; the enrage makes it drift faster and sink. The hit area is five circles in a row, a little rounder than the drawn rectangle (the corners are not hit). |

All bullets are the 32a enemy bullets (they outlive the boss, cannot be shot, 8 hull damage, 0.5 s invulnerability).

## 4. Rewards

A boss kill pays once (`rewarded`, and the boss is removed): **credits** = the parent reward at the Free Fly reward tier x `BOSS_CREDIT_MUL` 60 (x the captain's and skills' credit multipliers, like a rock),
**Cores** = `coresForWave(wave)` x `BOSS_CORES_MUL` 10 (x the Core Magnet). The run result and the records keep each boss id and whether the hull stayed untouched.

Next to a normal wave (`npx vite-node scripts/boss-pay.ts`; "wave credits" counts every rock of the wave as a parent, which over-counts, so the real figure is lower):

| Wave | Boss | Tier | Boss credits | Boss Cores | Wave credits | Wave-start Cores |
|---|---|---|---|---|---|---|
| 10 | Hive Mother | 25 | 295 | 40 | 41 | 24 |
| 20 | Bastion | 51 | 490 | 80 | 129 | 48 |
| 30 | Swarm Queen | 78 | 830 | 170 | 322 | 77 |
| 40 | Colossus | 105 | 1,407 | 370 | 721 | 117 |
| 50 | Hive Mother (round 2) | 131 | 2,336 | 800 | 1,489 | 180 |
| 80 | Colossus (round 2) | 211 | 11,133 | 8,090 | 11,272 | 809 |

The credits are large only early; by wave 80 a boss pays about what the wave does (the rocks' reward tier grows 1.05^tier but is scaled by 0.4 in Free Fly). Cores grow 1.08 a wave, so the boss's Cores stay far above the wave's.

## 5. Achievements and the save

Five new achievements (176 Medals in all now): first kill of each boss (2 / 3 / 4 / 5 Medals) and "Defeat a boss without being hit" (4). A fight counts as "without being hit" when
neither the hull nor a Second Chance charge was used from the boss's arrival to its death (contact, bullets and leaks all count). `Progress.records` gained `bosses` (ids beaten) and `bossNoHit`;
**save version 17** (older saves load with none; a boss killed before this chunk cannot be credited).

## 6. Checked

Unit tests `tests/freeflyBosses.test.ts` (schedule, hold and release of the wave clock, enrage timing and effects, Hive core window and its damage ratio through the real hit pipeline,
Bastion plates blocking shots and gaps letting them through, rings leaving through gaps only, escorts leaving and returning, Colossus HP scaling by wave and round, rewards paid once, "without being hit", records,
homing and plates, the debug jump). Mutation checks are listed in `DECISIONS.md`. E2E `e2e/freefly-bosses.e2e.cjs` reaches each boss through the debug panel ("Jump to wave (running)") and checks banner, bar, mechanics, enrage,
the kill, the rewards and the next wave; sheet `reports/chunk32b/sheet_bosses.png`.

## 7. The bot (what the builds beat)

`scripts/boss-bot.ts` starts a world at each boss wave with the hull full and the balance bot's standard build of each hull (`src/debug/hullBuilds.ts`) flying it (the bot now shoots rocks only when they are low, aims at the boss's weak point,
and keeps out of a plate's line); `scripts/boss-rate.ts` holds the hull up and estimates the kill time from 60 s of damage. Results are in `reports/chunk32b/boss-bot.txt` and `boss-rate.txt` and are copied below.

BOT_TABLES_PLACEHOLDER
