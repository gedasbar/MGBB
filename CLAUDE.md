# Mitosis Gun Builder (working title)

A mobile-first browser game inspired by the modular circuit-shooter "Miner Gun Builder". You design a gun as a circuit inside a hull grid, then fly and shoot. Original ideas here: rock enemies that crack and split (mitosis), many projectile-changing blocks, and campaign walls you carve a lane through.

The owner is not a programmer. They test in the browser and describe what they see. Prompts come in chunks (e.g. "CHUNK 9a"). Follow each chunk's steps in order.

## Stack and commands
- TypeScript (strict), Vite, PixiJS v8, Vitest, Playwright (headless Chromium, scripts in `e2e/*.cjs`).
- Check `package.json` for exact script names. Typical: `npm run dev`, `npx tsc --noEmit`, `npx vitest run`, `node e2e/<name>.e2e.cjs`, `npm run balance-wall`, `npm run balance-econ`, `scripts/block-audit.ts`.
- Never run `playwright install` (Chromium is preinstalled). npm and pip work; most other network access does not.
- Dev URL flags: `?debug=1` (debug panel, seam line), `?stats=0|1` (stats overlay, also toggled with the backtick key), `?bg=<id>|off` (force or remove the background). Dev hook: `window.__mgbm`.

## Working rules (important)
1. **Be honest.** Never claim something works, or that a screenshot shows something, unless you checked it. Open every screenshot you mention and describe what is really there. End every report with a "Not verified" list.
2. **Tests must be meaningful.** A test that cannot fail is worthless. For new logic, run a mutation check (break the code, see the test fail, restore) on a few tests and say which.
3. **Keep tests and screenshots lean** (token budget): focused unit tests, at most one e2e per chunk, contact sheets (one montage image) instead of many screenshots. Run the existing e2e scripts once each for regressions.
4. **Commit after each step** with a clear message. If you run low on budget, stop cleanly at a finished step and report what remains.
5. **DECISIONS.md**: append numbered entries for every non-obvious decision or deviation from the prompt. Continue the existing numbering; never renumber old entries (when two branches collide, renumber only the newer ones).
6. **Don't change existing behaviour** unless the chunk says so. Level-1 numbers of existing blocks, saved games, and old tests must keep working. Saves are versioned: bump the version and write a migration, unit-tested, when you change the save shape.
7. If a chunk's spec is ambiguous, choose the simplest reading, write it in DECISIONS.md, and carry on. If a chunk contradicts the code or itself in a way that is expensive to redo, stop and ask.
8. No magic numbers: constants live in `src/wall/constants.ts`, `src/data/*`, `src/config.ts` or equivalent.

## Git rules
- Start every chunk from the latest `main` (`git fetch`, then branch from `origin/main`). Work on a new branch. Never commit to `main`, never force-push, never delete branches.
- Push the chunk's branch when finished so a pull request can be opened. Do not merge pull requests.
- If you notice the branch is missing work that is already on `origin/main`, merge `origin/main` into the branch (merge, not rebase) and resolve conflicts keeping both sides' intent.

## Game design (current state)
**Circuit model.** The Generator (fixed hull cell) always emits a red signal that travels through empty cells as implicit straight pieces. Blocks transform packets in path order and output relative directions (F/L/R). Auto-orient is the default; manual rotation switches a block to a manual mode (wrong side = dead end). Lines may cross freely, and each signal interacts with shared blocks independently. Same-axis overlap cuts the later signal. The compiler is in `src/engine/compiler.ts`.

**Blocks.** Data in `src/data/blocks.ts`. Categories: Pathing (blue), Damage (salmon/orange), Modifiers (purple), Status (teal). Each block has levels. Copy price = base x 1.18^owned, upgrade price = base x 2.0 x 2.2^(level-1). More blocks are hidden until added by a chunk.

**Hulls.** `src/data/hulls.ts`. Dart (free, 1 slot, weak gun) is the starter, then Twin (2), Prong (3 slots, 2 ejectors), Fan, Shuttle. Ejector offsets from the ship centre are scaled by `FIRE_OFFSET_SCALE`.

**Fly screens.** The ship has an INVISIBLE circular hit point (`HIT_RADIUS = 8`); the ship art is small (about 26 x 34 px) so touching any part of it feels fatal. Spawn safety: the ship waits at bottom-centre until the first pointer move, eases in over 0.25 s, then has 1.0 s invulnerability.
- **Free Fly:** one fixed screen width, no wrap, no horizontal scroll. Rock enemies confined inside the screen. Rocks crack as they take damage and split into smaller rocks (`src/engine/mitosis.ts`). Backgrounds rotate every 3 minutes.
- **Campaign wall tiers (1-100):** a wall of blocks approaches at a constant base speed and loops sideways like a cylinder (`LevelDef.wrap`, 21 columns, camera edge-push). The ship is one-hit: touching a live block ends the run. Flying near the top of the screen speeds the wall up to about 4x (`TOP_ZONE`, `BOOST_MAX`). Results: CLEARED (all blocks destroyed, first time = +1 Medal), PASSED (ship flies `PASS_MARGIN_CELLS` past the wall, unlocks next tier, no Medal, nothing drawn for it), CRASHED. Credits are paid for blocks destroyed in every run. Tiers unlock in strict order. Spike tiers (about 1 in 8) have 1.6x block HP and a unique background. Armor appears from tier 11, shields from tier 21. Every 10th tier is a named milestone.

**Economy.** Credits (yellow) for kills; Medals (one per first full clear) are for future hero upgrades. Hull stat growth 1.055^tier, rewards 1.05^tier.

**Art language.** Sharp geometric shapes, flat fills, no gradients or textures, no glow. Block plates: nested squares (outer #55555a, mid = category colour darkened, inner #26262a) with a light-grey (#d4d4d8) entry bar and exit triangles. Ships are shades of grey with small coloured pieces. Rocks use warm muted tones with generated cracks. UI theme in `src/ui/theme.ts` (grey #1c1c1e background, panels #2a2a2d, yellow currency #f2c230).

## Backlog (not built yet, do not start unless a chunk says so)
More blocks (a mitosis-aware batch, more pathing like Merger/Portal/Reflector), new enemy types and Free Fly waves, bosses, sound, Captains/hero upgrades (Medals), node map and infinite tiers (also unlocks blocks), quests, skill tree, hull silhouette redesign.
