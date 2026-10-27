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

## 3. Deviations and choices (what the code does)

- **Boomerang and Orbit with AoE:** these shots do not end by hitting (they come back to the ship or circle it), so "when the shot ends" would never happen. They explode on the first hit and end (as today). In the code this is the `keepsFlying` case in `processField`.
- **A shot that flies off the screen** (or gets too old) after piercing or bouncing without being used up: the blast it still owes goes off where the shot LAST HIT, in the next hit step (`ProjectileSystem.retire`, called by `World` and `WallWorld` where they used to free the shot). So a Piercing shot always makes its blast. The blast uses the damage the shot had at its first hit (piercing only pays for the direct hits).
- **The AoE penalty is the whole shot's:** `x0.95` per extra AoE copy applies to the direct hit and the blast alike (the old rule: the blast replaced the direct hit and had the factor). The target of the last hit takes the direct hit (with the factor), the blast goes to everything else in the area. The builder's estimate counts the factor (`aoeEstimateMul`).
- **Gravity Well:** changed from every hit to the first hit (principle: spawning = once). Residue Seed stays per kill: the kill is a one-time event and the cloud is capped by the target's HP.
- **Fork copies keep the movement blocks** (Piercing, Bouncing, Homing, curves) and every status/Mitosis effect; only AoE, Fork and Chain are dropped (`fragments: false` in the table).
- **Chain arcs:** `maxPerShot` counts chains (one chain = up to `chainJumps` jumps from one hit), not single jumps.
- **Stacking blocks' copies (step 5):**
  - Homing: besides the sharper turn and wider cone it already had, each copy stretches the seek range by `stackGrowth` (400 px for one copy).
  - Orbit: each extra copy adds one full pass round the ship (`2 pi r / speed` seconds, about 0.63 s at the usual shot speed) before the launch; the re-hit speed-up stays.
  - Mine: each extra copy lays one more mine beside the first when it stops, 36 px apart, up to 3 extra (`MINE_EXTRA_MAX`); the bigger trigger stays. The cap of 3 keeps the pool safe (a mine waits 12 s). Extra mines are full shots (they carry the line's effects).
  - No stacking block's cap changed.
- **Not changed:** statuses, Executioner, Cleaver, Culling Bolt, the Mitosis marks and Residue Seed fire on every hit exactly as before.

## 4. The audit (docs/interaction-audit.md, before: docs/interaction-audit-before.md)

24 blocks, 552 ordered pairs. A pair is compared with the better block alone; blocks that cost damage on their own (Orbit, Mine, the curves, Cleaver) are compared with themselves alone. Before and after both read 494 OK, 58 CANCELS, 0 EXPLODES, but they are not the same 58:

- **Fixed:** AoE + Fork on Impact (both orders, Circle and Rectangle): Fork never happened, now it does.
- **Improved, still flagged:** Piercing + AoE and Bouncing + AoE no longer lose an effect ("Piercing never happens" is gone) but come out at 80-92% of AoE alone: the blast now waits for the end of the line instead of the first hit, which is the best place in a tight cluster. By design of the rule.
- **New in the list:** Bouncing + AoE Circle (84%) and Fork + Boomerang (85%) crossed the 95% line.
- **Remaining by design:** Boomerang with Piercing, Bouncing (it already passes through everything), Mine (both replace the flight path), AoE (the blast ends the boomerang on its first hit), Homing, Fork.
- **Remaining, bench artefacts:** pairs with Orbit or the curves. An Orbit shot always leaves from the same point 33 px beside the ship's axis, so in the tight cluster bench it never hits and nothing it carries can happen; curved shots miss low-HP targets so Executioner never fires. Overkill Spill + Residue Seed (83%) and Fork + Spill (90%) are kill-timing noise of the splitting-rock bench.
