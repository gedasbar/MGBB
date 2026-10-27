# Plan and handover

The living plan for Mitosis Gun Builder: how we work, what the design is trying to be, what was decided and why, and what comes next. Any new planning chat or agent should read this first, then `CLAUDE.md` (current state of the code) and `DECISIONS.md` (numbered implementation decisions).

Last updated: 2026-10-26, after chunk 17b (block interactions). `docs/archive/SPEC.md` is the original master prompt and is out of date; this file and `CLAUDE.md` are the truth.

---

## 1. How we work

- **Roles.** The owner (gedasbar) designs, playtests in the browser and decides. A planning chat (Claude) acts as design partner and writes the chunk prompts. Coding agents (Claude Code, local or cloud) execute one chunk per session and open a pull request. The owner reviews and merges.
- **Chunks.** Prompts are numbered (`CHUNK 17b`, ...). Shape of a good chunk: read `CLAUDE.md` first, start from latest `origin/main`, a design note committed first, numbered steps with a commit after each, lean meaningful tests with mutation checks, one contact sheet (screenshot montage) that the agent opens and describes, `DECISIONS.md` entries, a report with a "Not verified" list, push and open a PR (never merge).
- **Audit before tuning.** For balance or economy work, run a read-only audit chunk first (measured tables, proposals, numbered open questions), let the owner decide, then a tuning chunk. This worked well for damage (14a) and the economy (16c-1 / 16c-2).
- **Test scope.** Tiny UI changes: typecheck, unit tests, one relevant e2e. Full e2e suite only for gameplay, saves, compiler or economy chunks.
- **One session per folder.** Running two chunks in the same working copy caused branch mix-ups twice (16a/16b, 16c-2). Parallel chunks go in separate cloud sessions or separate worktrees.
- **Budget.** Sonnet 5.5 is about half the price of Opus 5.5. Big chunks (economy, engine) can cost $10-20 on Sonnet; split large chunks into two prompts when credits are tight.

### Owner preferences (for the planning chat)
- Be honest, no flattery. Say plainly when an idea is weak, including the planning chat's own earlier ideas.
- Short ideas and lean prompts. Ask only the questions that change what gets built; offer defaults ("your picks").
- Discuss before writing a prompt when the owner says so.
- The owner merges PRs; agents open them.
- The owner may edit data files by hand (hull layouts, caps, prices), so keep those in plain, commented data files with a validator that explains mistakes in plain words.

---

## 2. Design pillars

1. **The circuit is the game.** A gun is a circuit in a hull grid. Interesting decisions come from routing, ordering and space, not from big numbers.
2. **Small numbers.** A basic shot deals 1. Flat+ adds +1. Power comes from more shots, multipliers, status effects and interactions. Numbers on screen use K/M/B/T and then scientific notation.
3. **Blocks interact, they do not cancel.** Combining blocks should create something; a block that silently does nothing next to another is a bug (see section 5, interaction rules).
4. **Limits are visible.** Copy caps and prices, never hidden diminishing returns (a hidden rule was tried in 14a and removed in 14b at the owner's request).
5. **Look:** sharp geometric shapes, flat fills, no gradients or glow; grey ships with small colour accents; dark grey UI (#1c1c1e) with yellow currency (#f2c230); lavender (passed/cleared) on the Frontier map.

---

## 3. Current state (short; details in CLAUDE.md)

- **Modes:** campaign walls tiers 1-100 (one-hit ship, pass or clear), Free Fly (endless waves of splitting rocks), Frontier (infinite grid map unlocked after tier 25, holes, medal squares, Free Fly squares, directional unlocks at rings 10/25/50/100 using existing blocks as placeholders).
- **Blocks:** 41 visible. Only 8 have upgrades (Flat+, Percent x, Lucky Strike, Jackpot, Gambler's Gate, Shield-Breaker, Armor-Piercer, Pure Converter). Shape blocks (Piercing, Bouncing, AoE, Chain, Homing, Fork, Boomerang, Orbit, Mine) stack per copy. Status/Mitosis effects are one copy.
- **Hulls:** 19 (Dart free ... Zenith 1.3M), bought in the builder's hull picker. Size classes change the hit radius (8/9/10/11).
- **Captains:** 4 captains, hero level uncapped (+0.5 base damage per level, Medal cost 1.2^(n-1)), option tiers unlocked by kills.
- **Economy:** price family B; Percent x x1.5 (L1) to x3 (L10), cap 10; no damage clamp, NaN-safe Float64 damage.

---

## 4. Known problems (open)

From the owner's playtests and audits, most important first:

1. ~~**Interactions cancel each other.**~~ **Mostly done (17b):** the trigger table is in (`src/engine/triggers.ts`, `docs/interactions.md`) and the pair audit exists. AoE + Fork now both happen; 29 pairs are still flagged with reasons in `docs/interaction-audit.md` (the blast now waits for the end of a piercing/bouncing line; Boomerang and Orbit; bench artefacts). Original text: Example: an AoE shot explodes on its first hit, so Fork on Impact never triggers. More pairs are likely broken. Planned fix: per-effect trigger rules (section 5) plus an automated pair audit.
2. ~~**AoE stacking penalty is invisible.**~~ **Done (17b):** the estimate and the block text show it. Original text: The engine applies x0.95 per extra AoE copy (`aoeStackDamage` in `src/engine/effects.ts`), but the builder's damage estimate and the block text do not show it, so it looks missing.
3. **Hull layouts have no soul.** The 14 new layouts are shapes without a design intent; there is no "best route" or puzzle idea. Each hull needs an idea sentence and a layout drawn to serve it (bottlenecks, corridors, chambers, far-apart ejectors, pockets).
4. **Hull art is just the layout.** The newer hulls' art is generated from the grid. Needs real silhouettes (after an approved concept sheet).
5. ~~**Caps too tight for big hulls.**~~ **Done (17b):** Splitters 15 (growth 1.35 / 1.45), Turns 20 (growth 1.20). Original text: Splitters (2 and 1) and turns (8) were capped when hulls had at most 3 ejectors. Owner wants splitters capped at 15 with a steeper price per copy, and more turns.
6. **Content difficulty.** Walls and the Frontier do not keep up with multiplier builds (the bot passed tier 100 with a Trident). Frontier HP grows only 1.5% per ring.
7. **Early game.** A Dart with one Flat+ can pass up to tier 22 without buying anything. Owner finds it acceptable for now; the hull ladder adds purchase goals.
8. ~~**Homing, Orbit, Mine**~~ **Done (17b):** a copy now gives a longer seek range, one more orbit pass, one more mine (up to 3 extra). Original text: they gain nothing measurable from extra copies on the bench; they are uncapped, which is a trap in the Shop.
9. ~~**Code mess.**~~ **Done (chunk 17-cleanup):** one hull layout file with a plain-language validator, dead stub files and dead exports removed, every e2e script passes, root and reports tidied, `docs/EDITING.md` for the data files you edit by hand. Biggest files still to split someday are listed in `reports/chunk17-cleanup/REPORT.md`.

---

## 5. Interaction rules (BUILT in 17b: `docs/interactions.md`, the table is `TRIGGERS` in `src/engine/triggers.ts`; the text below is the original draft)

Principle: every effect says WHEN it fires. "Everything triggers on every hit" is wrong (AoE on every pierce hit would dig a tunnel along the flight path).

| effect | fires on | why |
|---|---|---|
| Status (Ignite, Frostbite, Corrosion, Static Charge, ...) | every hit | cheap and local; rewards piercing a crowd |
| AoE (Circle, Rectangle) | once, when the shot ends (its last hit) | a piercing or bouncing shot travels, then explodes at the end |
| Fork on Impact | the first hit; the main shot continues if it pierces or bounces | AoE and Fork both happen |
| Chain Lightning | every hit, with a maximum number of arcs per shot | Piercing + Chain feels great without flooding the screen |
| What fork fragments and chain arcs carry | status effects only (no AoE, Fork, Chain) | prevents cascades |

The rules live in one table in code, so the owner or a prompt can change them. A pair audit tests every shape/effect pair and reports pairs that still cancel or explode.

**Later idea: named combos.** Specific pairs unlock a special effect (owner's example: Piercing + Chain Lightning). Shown as "Combo discovered!" with a combo book. Each combo is about as much work as a new block. Strong candidate for the Frontier's directional legendary unlocks (reaching ring 50 West unlocks a combo).

---

## 6. Roadmap

Next, in order:

1. ~~**Cleanup chunk**~~ (done, 17-cleanup; no behaviour change): one hull layout file for all 19 hulls with a documented legend, dead code removed, failing e2e scripts fixed or deleted, root and reports folders tidied, data files that the owner edits documented.
2. ~~**17b, interactions:**~~ (done) the trigger rules above, the pair audit, AoE + Fork both working, the AoE penalty shown in the estimate and the block info, splitter cap 15 and more turns with steeper copy prices, Homing/Orbit/Mine stacking decided (give copies a real effect or cap 1).
3. **Hull redesign:** an idea sentence per hull (planning chat drafts, owner edits or redraws layouts), then layouts rebuilt. Owner may draw layouts directly in the data file.
4. **Ship art:** concept sheet first, then real silhouettes for all 19 hulls.
5. **Content difficulty:** audit first (needed vs attainable damage by tier and ring), then faster HP growth late in the campaign and the Frontier.
6. **New block batch** (owner's list): Curve Left, projectile speed up / slow, pull towards the ship's centre line, turn upwards after a delay, align direction of travel, ship magnet, double lifetime, persist while damage is left, reverse on hit, straight-line spread ejectors (left, right, wide forward).

### Backlog (parked)
- Frontier: special squares, legendary blocks or named combos for the directional unlocks, per-direction themes.
- Captains: replace the spawn-invulnerability perks (owner called them pointless), hero unlock balance, character art.
- Bosses (a wall boss spanning the width), bigger enemies and more enemy types.
- Skills tab (currently "coming soon"), quests, new-player tutorial.
- Sound quality (owner does not care for now), music.
- Real phone testing of touch and looks.

---

## 7. Decision log (design level)

The numbered implementation log is `DECISIONS.md`. The big design turns, newest first:

- **17a** 19-hull ladder; hulls bought in the builder's picker; Shop blocks only; yellow "affordable" dot; brightness no longer means owned.
- **16c-2** Upgrades only on 8 blocks; copy caps; price family B; shape blocks stack; hero uncapped; no damage clamp but NaN-safe.
- **16c-1** Economy audit: most blocks' 2nd copy did nothing; damage ceiling far above content; hull jump from 3 to 72 cells.
- **16a/16b** Instant results; stored block orientation (no global auto-rotate); warnings removed; tile palette without tabs or coloured outlines.
- **15a/15b** Frontier grid map: holes, medal squares, Free Fly squares (half time = passed, full = cleared), lavender progress, directional unlocks.
- **14a/14b** Small numbers (basic shot 1, Flat+ +1); hidden multiplier diminishing returns added then removed.
- **13a** Captains with hero levels and option tiers bought with Medals.
- **12a** Synthesized sound, pause, settings.
- **11a/11b, 9a** Two block batches; Bouncing redesigned to bounce off any target.
- **8a** Art language (geometric, flat, no glow), backgrounds, rock cracks.
- **7a/7b** Free Fly is one fixed screen with confinement (the cylinder was rejected there); campaign walls wrap like a cylinder.
- **6a-6c** Wall campaign: pass by carving a lane, one-hit ship, Medals only for full clears, finish line invisible.
