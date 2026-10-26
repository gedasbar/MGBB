# Block interactions: when does each effect fire? (chunk 17b)

Principle: **every effect says WHEN it fires.** Local and cheap effects fire on every hit; big-area or spawning effects fire once. The rules live in one table in code, `TRIGGERS` in `src/engine/triggers.ts`; the owner can change a rule there. `npm run interaction-audit` tests every pair of blocks against the rules (`docs/interaction-audit.md`).

Words: a **hit** is a projectile touching a target. The **shot** is one projectile from the ejector (plus the copies it makes). The shot **ends** on the hit that uses it up: a plain shot on its first hit; a Piercing shot when its damage runs out (and no Bouncing block turns that into a bounce); a Bouncing shot when it has no bounces left.

## 1. How it works TODAY (code read in `src/engine/projectiles.ts` `processField`, `effects.ts`)

| effect | fires today | what it stops or does |
|---|---|---|
| AoE Circle / Rectangle | on the FIRST hit | the blast replaces the direct hit and **frees the projectile**. Piercing, Bouncing and Fork on Impact in the same line are never reached. |
| Piercing | every hit | the shot passes through; each hit costs `1/level` of the damage dealt; when damage is gone the shot is freed |
| Bouncing | every hit (until the bounces are gone) | reflects, keeps full damage |
| Fork on Impact | EVERY hit of a non-AoE shot | two copies per pair at 50% damage. A piercing or bouncing shot forks again on each hit (cascade); an AoE shot never forks |
| Fork copies | | carry the whole modifier list (AoE, Chain, Piercing, ...); they only cannot fork again |
| Chain Lightning | every hit, no limit per shot | up to `chainJumps` jumps per hit at 70% damage. On an AoE shot it fires once from the first target |
| Chain arcs | | strike with the same statuses/Mitosis effects; they do not blast, fork or chain again (already so) |
| Ignite, Frostbite, Corrosion, Static Charge | every hit (also on blast victims, arcs, copies) | local statuses |
| Executioner, Cleaver, Culling Bolt | every strike | damage change on that strike |
| Cauterize, Fission Catalyst, Overkill Spill | every strike | marks on the target |
| Residue Seed | every kill (not by cloud or burn) | leaves a cloud worth the killing hit |
| Gravity Well | EVERY hit | a pulling spot at the hit; Orbit made one every 0.3 s |
| Boomerang, Orbit | no end by hit | the shot keeps flying through what it hits (with AoE on the line it exploded and ended on the first hit) |
| Mine | the touch that detonates it | a normal hit, then the mine is used up |

Problems: AoE cancels Piercing, Bouncing and Fork; Fork cascades; Chain has no limit per shot; fork copies can blast and chain (a Fork + AoE shot would flood the screen if AoE ever stopped ending the shot).

## 2. New rules (the TRIGGERS table)

| effect | fires | carried by fork copies | carried by chain arcs |
|---|---|---|---|
| Status and Mitosis effects (Ignite, Frostbite, Corrosion, Static Charge, Executioner, Cleaver, Culling Bolt, Cauterize, Fission Catalyst, Overkill Spill, Residue Seed) | every hit | yes | yes |
| AoE Circle, AoE Rectangle | **once, when the shot ends** | no | no |
| Fork on Impact | **the first hit only** (the main shot goes on if it can pierce or bounce) | no (copies cannot fork) | no |
| Chain Lightning | every hit, at most `CHAIN_ARCS_PER_SHOT` = 3 chains per shot (each Chain copy still adds one jump per chain) | no | no |
| Gravity Well | the first hit only (a spawned object: one per shot) | yes | no |

Rules in words:

- A piercing or bouncing shot with AoE travels and makes ONE blast on the hit where it ends. Fork on Impact and AoE on the same shot both happen (the fork on hit 1, the blast on the last hit; for a plain shot both on hit 1).
- The blast goes to every target in the area EXCEPT the one the shot hit last, which already took the direct hit at full damage. (Before, the blast replaced the direct hit.)
- Fork copies are plain: they keep the movement blocks (Piercing, Bouncing, Homing, curves) and every status/Mitosis effect, but no AoE, no Fork, no Chain. Nothing cascades.
- Chain arcs carry statuses/Mitosis effects only (as before).

## 3. Deviations and choices

- **Boomerang and Orbit with AoE:** these shots do not end by hitting (they come back to the ship or circle it), so "when the shot ends" would never happen. They explode on the first hit and end (as today). This is written in the table as `endsOnFirstHit` for those shapes.
- **A shot that flies off the screen** after piercing without being used up does not blast (nothing marks "the last hit" from the outside). Piercing Level 1 uses the shot up at the first target that has as much HP as the damage, so in practice the blast comes.
- **Target of a stacked blast:** the target of the ending hit takes the direct hit at full damage and the other targets take the blast damage `damage x 0.95^(copies-1)`. The builder's estimate counts the blast factor (step 4).
- **Gravity Well:** changed from every hit to the first hit (principle: spawning = once). Residue Seed stays per kill: the kill is a one-time event and the cloud is capped by the target's HP.
- **Fork copies and AoE:** a Fork + AoE shot used to blast only; now it forks on the first hit and blasts at its end, and the copies are plain.
