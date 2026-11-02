# Achievements and challenges (chunk 28a)

Two lists, both plain data files you can edit by hand: `src/data/achievements.ts` and `src/data/challenges.ts`. Nothing about them is hidden in the engine.

## Achievements (44)

An achievement names a **metric** (a number the game can read from the save) and a **goal**. It is earned the moment the metric reaches the goal. The metrics (`METRICS` in `src/achievements/rules.ts`): highest tier passed, tiers cleared, tiers 1-100 cleared, Maze tiers cleared, furthest Frontier ring, the shortest of the four directions' rings, legendary blocks owned, hero level, skill points spent, best single hit of a run, best average DPS of a run, most blocks in one circuit, a filled hull, hulls owned, ordinary blocks owned, best Free Fly wave. A goal of `'all'` means the whole set (19 hulls, 54 ordinary blocks, 12 legendary blocks).

**When it is checked.** `ProgressStore.commit()` runs after every change of progress (a run, a purchase, a skill, a circuit). Whatever is newly reached is paid at once and queued for a small toast (top of the screen, one at a time, never blocking taps). The panel (since 28b the ACHIEVEMENTS tab of the builder's ship hub; "Show completed" hides or lists the finished ones) lists them by group with a progress bar ("Pass tier 50: 37 / 50"). A **hidden** achievement shows only its hint until it is earned.

**Rewards.** Medals (1-3 early, 4-10 for the big ones) or a **cosmetic id** (`skin_...`, `trail_...`). Skins and trails are usable since chunk 28b (hub > CUSTOMIZATION tab, `src/ui/cosmetics.ts`): the id is stored in the save (`cosmetics`). Each achievement is paid once because its id is stored when it is earned. All 44 pay **158 Medals** in total (the other rewards are 5 cosmetic ids).

**Existing saves.** When the game loads a save it grants everything already reached **in one go** and shows ONE summary panel ("N achievements unlocked from your progress, +X Medals", the first names and "and N more"), never a burst of toasts. A save from before this chunk has nothing earned, so for it this is every achievement it qualifies for.

**Numbers I changed from the brief** (the data showed these steps were silly):
- Skill points 5 / 15 / 30 became **3 / 6 / 10**. Points are one per 25 rings to ring 250 (10 points), then one per 50 rings; 30 points needs ring 1,250.
- Hero level 10 / 25 / 50 became **10 / 20 / 30**. Level n costs about 1.2^(n-1) Medals, so level 50 is about 45,000 Medals in all and level 30 about 1,200.
- "Fill every cell of a hull" only counts on a hull with **12 or more buildable cells** (`FILL_MIN_CELLS`); the Dart has one cell, the Twin two.
- "Clear 100 tiers" counts any cleared tiers (campaign 1-200); the hidden "What happens after 100?" counts tiers 1-100 only.

**Records.** Best hit, best average DPS and the biggest circuit are not rebuildable from the old save, so the save keeps `records` (best hit and best average DPS of one run come from the run's stats: wall levels, Frontier squares and Free Fly alike; the builder reports every circuit change).

## Challenges (31)

A challenge is a **campaign tier flown with a rule**. It opens when the player has passed its tier, so the list grows with progress. It is a normal run of the tier (credits, kills and the tier's own first-clear Medal are paid as always); on top of that the first success pays the challenge reward once.

**Rule types** (all optional, all must hold; `ChallengeRules`): `hulls` (the hull must be one of them), `banBlocks`, `banCategory` (e.g. no legendary), `needBlocks`, `maxBlocks`, `maxEjectors` (ejectors that FIRE; one no signal reaches does not count), `noFire` (in the run the gun is silent), `timeLimit` (seconds). The **goal** is `clear` (every block destroyed) or `pass` (clear or fly past the end).

**Flow.**
1. Build screen > ship button > ACHIEVEMENTS tab > **Challenges** > pick one > Start. The hub closes and the Build screen shows a banner showing the rule lines.
2. The banner's FLY now flies the challenge's tier (not Free Fly). If the hull or circuit breaks a build rule, FLY shows a plain message instead ("Not allowed in this challenge: AoE - Circle. Remove it first.") and does not fly.
3. In the run the rule line is on the HUD. `noFire` makes the gun silent; `timeLimit` shows the seconds left and turns red when it runs out (the run goes on, the challenge is then not met).
4. The run summary says "Challenge complete! +N Medals" (or the cosmetic) the first time, "Challenge complete (already done)" afterwards, or why it failed.
5. Starting a normal tier from the Map, or the banner's X, ends the challenge session.

**The list.** One challenge for every one of the 19 hulls (price order, tier 10 to 150), most with a second rule (Wisp with at most 6 blocks, Kestrel with one ejector, Halberd must use Piercing, Mantis and Trident and Citadel with no legendary blocks, ...), plus rules on any hull: no AoE (tier 45), one ejector (60), at most 12 blocks (80), no legendary blocks (90), Chain Lightning (75), Ignite (52), Orbit (65), Quick work (clear tier 25 in 35 s), Dash (pass tier 40 in 30 s), the Strong Wind tier 115 with Upturn, a Fortress tier 142 with no legendary blocks and at most two ejectors, and the Maze tier 106 passed without firing a shot. Rewards: 1-6 Medals, 3 cosmetic ids.

## Save (version 13)

Four new fields: `achievements` (ids earned), `records`, `challengesDone`, `cosmetics`. Unknown ids are dropped on load; an older save starts empty and the load grant fills `achievements` (and pays its Medals). The migration is `sanitizeProgress`, round-tripped through Export / Import (`tests/saveTransfer.test.ts`).

## Not decided here
Challenge difficulty was not flown by a bot (the rules are checked by unit tests, the tiers were chosen by hull price). Playtest and change the numbers in the data file.
